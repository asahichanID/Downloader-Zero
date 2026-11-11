import 'dotenv/config';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import NodeID3 from 'node-id3';
import { extractMedia, detectPlatform, resolveTikTokDownload } from './src/services/scraper.ts';
import {
  isSafePublicUrl,
  createRateLimiter,
  antiPrototypePollution,
  applySecurityHeaders,
  sanitizeFilename,
  sanitizeJobId
} from './src/services/security.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Guard against Vite standalone WS port conflicts and unhandled errors
process.on('uncaughtException', (err: any) => {
  if (err?.code === 'EADDRINUSE' && (err?.port === 24678 || String(err?.message || '').includes('24678'))) {
    console.warn('[Vite WS] Port 24678 is in use, ignoring since HMR is disabled in AI Studio.');
    return;
  }
  console.error('[server] Uncaught exception:', err);
});

process.on('unhandledRejection', (reason: any) => {
  console.warn('[server] Unhandled Promise Rejection:', reason?.message || reason);
});

const isProduction = process.env.NODE_ENV === 'production';

// Support CLI flags (--port 3000, --host 0.0.0.0) or default to 3000 for AI Studio environment
const cliArgs = process.argv.slice(2);
const portFlagIndex = cliArgs.indexOf('--port');
const cliPort = portFlagIndex !== -1 && cliArgs[portFlagIndex + 1] ? parseInt(cliArgs[portFlagIndex + 1], 10) : null;
const hostFlagIndex = cliArgs.indexOf('--host');
const HOST = hostFlagIndex !== -1 && cliArgs[hostFlagIndex + 1] ? cliArgs[hostFlagIndex + 1] : '0.0.0.0';
const PORT = cliPort || (process.env.PORT ? parseInt(process.env.PORT, 10) : 3000);

async function startServer() {
  const app = express();

  // 1. Core Cyber-Defense: Security Headers & Signature Stripping
  app.disable('x-powered-by');
  app.use(applySecurityHeaders);
  app.use(antiPrototypePollution);

  // 2. Anti-DoS Payload Limiting (128KB max) & JSON Parse Error Interceptor
  app.use(express.json({ limit: '128kb' }));
  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof SyntaxError && 'body' in err) {
      res.status(400).json({ success: false, error: 'Format payload tidak valid.' });
      return;
    }
    next(err);
  });

  // 3. Rate Limiters (DDoS & Spam Guard)
  const extractLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 60,
    message: 'Terlalu banyak permintaan ekstrak konten. Harap tunggu beberapa detik.'
  });
  const jobLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 60,
    message: 'Terlalu banyak permintaan konversi format. Harap tunggu beberapa detik.'
  });
  const progressLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 180,
    message: 'Batas frekuensi pemeriksaan status tercapai.'
  });
  const proxyLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 180,
    message: 'Batas aliran unduhan per menit tercapai. Harap tunggu sebentar.'
  });

  // In-memory process cache for Spotify MP3 files (automatically purged 15 seconds after completion)
  const spotifyProcessCache = new Map<string, { buffer: Buffer; timestamp: number }>();

  // 1. Health check & Security Shield status
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'online',
      securityShield: 'active',
      service: 'DownloaderZero (DZ) Media Engine',
      version: '2026.1',
      platforms: ['youtube', 'tiktok', 'facebook', 'instagram', 'pinterest', 'spotify', 'terabox']
    });
  });

  // 2. Extract media metadata and formats (with anti-SSRF & rate limiter)
  app.post('/api/extract', extractLimiter, async (req: Request, res: Response) => {
    try {
      const { url, apiKey, server } = req.body || {};
      if (!url || typeof url !== 'string') {
        res.status(400).json({ success: false, error: 'Parameter URL wajib disertakan.' });
        return;
      }

      // SSRF & Malicious Target Verification
      const safetyCheck = isSafePublicUrl(url);
      if (!safetyCheck.safe) {
        res.status(400).json({ success: false, error: safetyCheck.reason || 'Tautan URL tidak diizinkan oleh sistem keamanan.' });
        return;
      }

      const media = await extractMedia(url, apiKey, server);
      res.json({ success: true, data: media });
    } catch (err: any) {

      console.error('Extraction error:', err.message);
      res.status(400).json({
        success: false,
        error: err.message || 'Terjadi kesalahan saat memproses URL. Silakan coba lagi.'
      });
    }
  });

  function normalizeLoaderFormat(raw: string | undefined): string {
    if (!raw) return '1080';
    const f = String(raw).toLowerCase().trim();
    if (f === '2k' || f === '1440' || f === '1440p' || f.includes('1440') || f.includes('2k') || f.includes('qhd')) return '1440';
    if (f === '4k' || f === '2160' || f === '2160p' || f.includes('2160') || f.includes('4k')) return '2160';
    if (f === '1080' || f === '1080p' || f.includes('1080')) return '1080';
    if (f === '720' || f === '720p' || f.includes('720')) return '720';
    if (f === '480' || f === '480p' || f.includes('480')) return '480';
    if (f === '360' || f === '360p' || f.includes('360')) return '360';
    if (f === 'mp3' || f === 'audio' || f.includes('mp3') || f.includes('audio')) return 'mp3';
    return f.replace(/p$/i, '');
  }

  // 2b. Start async job for YouTube conversion (with Anti-SSRF & rate limiter)
  app.post('/api/start-job', jobLimiter, async (req: Request, res: Response) => {
    try {
      const { format, url, server, apiKey, platform, formatId, resolution, type } = req.body || {};
      if (!url || typeof url !== 'string') {
        res.status(400).json({ success: false, error: 'URL target wajib disertakan.' });
        return;
      }

      // SSRF & Security inspection
      const safetyCheck = isSafePublicUrl(url);
      if (!safetyCheck.safe) {
        res.status(400).json({ success: false, error: safetyCheck.reason || 'URL tidak aman atau diblokir.' });
        return;
      }

      const serverMode = (server === 'server1' || server === 'server2' || server === 'auto') ? server : 'auto';

      // 1. TikTok on-demand resolution (Pemakaian API setelah pemilihan format)
      if (platform === 'tiktok' || detectPlatform(url) === 'tiktok') {
        try {
          const resolved = await resolveTikTokDownload(
            url,
            formatId || 'tt-1080',
            resolution || format || '1080p',
            type || (format === 'mp3' ? 'audio' : 'video'),
            serverMode,
            apiKey
          );
          res.json({
            success: true,
            id: null,
            downloadUrl: resolved.downloadUrl,
            format: resolution || format || '1080p',
            text: `Siap diunduh (${resolved.quality || 'Kualitas Tinggi'})!`
          });
          return;
        } catch (ttErr: any) {
          console.error('[server] TikTok resolution error:', ttErr.message);
          res.status(502).json({
            success: false,
            error: ttErr.message || 'Gagal menyiapkan unduhan TikTok dari server yang dipilih.'
          });
          return;
        }
      }

      const normalizedFormat = normalizeLoaderFormat(format);

      // Server 1 handler (Primary)
      const tryServer1 = async () => {
        const envKey = (process.env.NEOXR_API_KEY || 'j3i3mg').trim().replace(/^["']|["']$/g, '');
        const key = (apiKey || envKey || 'j3i3mg').trim().replace(/^["']|["']$/g, '');
        const isAudio = normalizedFormat === 'mp3';
        const qualityMap: Record<string, string> = {
          '2160': '1080p',
          '1440': '1080p',
          '1080': '1080p',
          '720': '720p',
          '480': '480p',
          '360': '360p',
          'mp3': '128kbps'
        };
        const neoQ = qualityMap[normalizedFormat] || (isAudio ? '128kbps' : '1080p');
        const neoType = isAudio ? 'audio' : 'video';
        const neoEp = `https://api.neoxr.eu/api/youtube?url=${encodeURIComponent(url)}&type=${neoType}&quality=${neoQ}&apikey=${encodeURIComponent(key)}`;

        const neoRes = await fetch(neoEp, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(10000)
        });
        if (neoRes.ok) {
          const neoJson = await neoRes.json();
          if (neoJson && neoJson.status && neoJson.data?.url) {
            return {
              success: true,
              id: null,
              downloadUrl: neoJson.data.url,
              format: normalizedFormat,
              text: `Siap diunduh (${neoJson.data.quality || normalizedFormat})!`
            };
          }
        }
        throw new Error('Server 1 tidak menghasilkan unduhan.');
      };

      // Server 2 handler (Alternative / loader engine)
      const tryServer2 = async () => {
        const loaderRes = await fetch(`https://loader.to/ajax/download.php?button=1&start=1&format=${encodeURIComponent(normalizedFormat)}&url=${encodeURIComponent(url)}`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          signal: AbortSignal.timeout(10000)
        });
        if (loaderRes.ok) {
          const loaderJson = await loaderRes.json();
          if (loaderJson && (loaderJson.id || loaderJson.download_url)) {
            return {
              success: true,
              id: loaderJson.id || null,
              downloadUrl: loaderJson.download_url || undefined,
              format: normalizedFormat,
              text: loaderJson.text || 'Memulai konversi Server 2...'
            };
          }
        }
        throw new Error('Server 2 tidak dapat memulai proses konversi.');
      };

      if (serverMode === 'server1') {
        const result = await tryServer1();
        res.json(result);
        return;
      }

      if (serverMode === 'server2') {
        const result = await tryServer2();
        res.json(result);
        return;
      }

      // Auto Mode:
      // For high resolutions (2160 / 4K, 1440 / 2K, 1080 / Full HD), prioritize Server 2 (Loader.to)
      // because Loader.to converts true 4K and 2K streams, whereas Server 1 maxes out at 1080p/720p!
      const isHighRes = normalizedFormat === '2160' || normalizedFormat === '1440' || normalizedFormat === '1080';
      if (isHighRes) {
        try {
          const result2 = await tryServer2();
          res.json(result2);
          return;
        } catch (err2) {
          console.warn('[server] High-res Server 2 start-job failed, falling back to Server 1:', err2);
          try {
            const result1 = await tryServer1();
            res.json(result1);
            return;
          } catch (err1) {
            console.warn('[server] Server 1 start-job also failed:', err1);
          }
        }
      } else {
        // Standard quality (720p, 480p, 360p, mp3): Try Server 1 first
        try {
          const result1 = await tryServer1();
          res.json(result1);
          return;
        } catch (err1) {
          console.warn('[server] Server 1 start-job failed, falling back to Server 2:', err1);
          try {
            const result2 = await tryServer2();
            res.json(result2);
            return;
          } catch (err2) {
            console.warn('[server] Server 2 start-job failed:', err2);
          }
        }
      }

      res.status(502).json({
        success: false,
        error: 'Gagal memproses media untuk resolusi ini. Silakan coba kembali.'
      });
      return;
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 3. Progress check for async processing (with rate limiter & sanitized job ID)
  app.get(['/api/progress', '/api/progress/:jobId'], progressLimiter, async (req: Request, res: Response) => {
    try {
      const rawJobId = (req.params.jobId || req.query.jobId || req.query.id || '') as string;
      const jobId = sanitizeJobId(rawJobId);
      if (!jobId) {
        res.status(400).json({ success: false, error: 'Job ID tidak valid.' });
        return;
      }

      const loaderRes = await fetch(`https://loader.to/ajax/progress.php?id=${encodeURIComponent(jobId)}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        signal: AbortSignal.timeout(8000)
      });

      if (!loaderRes.ok) {
        res.json({ success: false, progress: 0, statusText: 'Menunggu antrean...' });
        return;
      }

      const data = await loaderRes.json();
      const progress = typeof data.progress === 'number' ? Math.min(100, Math.round(data.progress / 10)) : 0;
      const isComplete = data.success === 1 && !!data.download_url;

      res.json({
        success: true,
        progress: isComplete ? 100 : progress,
        downloadUrl: data.download_url || undefined,
        statusText: data.text || (isComplete ? 'Selesai!' : 'Sedang memproses konversi...')
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 4. Proxy stream for instant automatic download attachment with multi-platform resilience & SSRF shielding
  app.get('/api/proxy-download', proxyLimiter, async (req: Request, res: Response) => {
    try {
      // 1. Extract targetUrl reliably from query or raw URL, preserving all nested parameters
      let targetUrl = '';
      if (req.query?.url && typeof req.query.url === 'string') {
        targetUrl = req.query.url;
      } else if (Array.isArray(req.query?.url) && typeof req.query.url[0] === 'string') {
        targetUrl = req.query.url[0];
      }

      // Check raw request URL to avoid truncation by unencoded ampersands
      const rawReqUrl = req.url || '';
      const urlParamIdx = rawReqUrl.indexOf('url=');
      if (urlParamIdx !== -1) {
        let extracted = rawReqUrl.slice(urlParamIdx + 4);
        const nextParamMatch = extracted.match(/&(?:filename|platform|sourceUrl|title|artist|album|genre|year|cover|apiKey)=/);
        if (nextParamMatch && nextParamMatch.index !== undefined) {
          extracted = extracted.slice(0, nextParamMatch.index);
        }
        try {
          const decoded = decodeURIComponent(extracted);
          if (decoded.startsWith('http')) {
            targetUrl = decoded;
          }
        } catch {
          if (extracted.startsWith('http')) {
            targetUrl = extracted;
          }
        }
      }

      if (targetUrl) {
        targetUrl = targetUrl.trim().replace(/^["']|["']$/g, '');
        if (targetUrl.startsWith('//')) {
          targetUrl = 'https:' + targetUrl;
        }
        if (targetUrl.startsWith('http%3A') || targetUrl.startsWith('https%3A')) {
          try {
            targetUrl = decodeURIComponent(targetUrl);
          } catch {}
        }
      }

      // SSRF & Malicious Target Verification
      if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
        res.status(400).send('Target URL tidak valid.');
        return;
      }

      const targetSafety = isSafePublicUrl(targetUrl);
      if (!targetSafety.safe) {
        res.status(400).send(targetSafety.reason || 'Target URL tidak diizinkan oleh sistem keamanan.');
        return;
      }

      // If targetUrl points to a loader.to ajax endpoint, resolve to real download URL
      if (targetUrl.includes('loader.to/ajax/download.php') || targetUrl.includes('loader.to')) {
        try {
          const lRes = await fetch(targetUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            signal: AbortSignal.timeout(8000)
          });
          if (lRes.ok) {
            const lData = await lRes.json();
            if (lData.download_url && typeof lData.download_url === 'string' && lData.download_url.startsWith('http')) {
              targetUrl = lData.download_url;
            }
          }
        } catch (lErr) {
          console.warn('[proxy-download] loader.to direct resolution notice:', lErr);
        }
      }

      const rawFilename = (req.query.filename as string) || 'DownloaderZero_Media.mp4';
      const sanitizedFilename = sanitizeFilename(rawFilename, 'DownloaderZero_Media.mp4');
      const platform = ((req.query.platform as string) || '').toLowerCase();
      const sourceUrl = (req.query.sourceUrl as string) || '';

      if (sourceUrl && !isSafePublicUrl(sourceUrl).safe) {
        res.status(400).send('Source URL tidak valid atau diblokir.');
        return;
      }

      const isSpotify =
        platform === 'spotify' ||
        req.query.platform === 'spotify' ||
        targetUrl.includes('spotify.com') ||
        targetUrl.includes('spotify.link') ||
        (sanitizedFilename.endsWith('.mp3') && (Boolean(req.query.title) || Boolean(req.query.artist)));

      // Handle Spotify with Neo audio download + embedded ID3 metadata & cover art
      if (isSpotify) {
        let directAudioUrl = targetUrl;
        const neoxrKey = ((req.query?.apiKey as string) || process.env.NEOXR_API_KEY || 'j3i3mg').trim();

        // If targetUrl is still a Spotify web URL, resolve to Neo full MP3 URL
        if (directAudioUrl.includes('spotify.com') || directAudioUrl.includes('spotify.link')) {
          try {
            const neoRes = await fetch(
              `https://api.neoxr.eu/api/spotify?url=${encodeURIComponent(directAudioUrl)}&apikey=${encodeURIComponent(neoxrKey)}`,
              {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                signal: AbortSignal.timeout(14000)
              }
            );
            if (neoRes.ok) {
              const neoJson = await neoRes.json();
              const fullSongUrl = neoJson.data?.url || neoJson.data?.download || neoJson.data?.link;
              if (fullSongUrl && typeof fullSongUrl === 'string' && fullSongUrl.startsWith('http') && !fullSongUrl.includes('mp3-preview')) {
                directAudioUrl = fullSongUrl;
              }
            }
          } catch (e) {
            console.warn('[Spotify Download] Neo direct resolve notice:', e);
          }
        }

        // Fetch raw audio stream from Neo
        const audioRes = await fetch(directAudioUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': '*/*'
          }
        });

        if (!audioRes.ok) {
          res.status(audioRes.status || 500).send('Gagal mengunduh audio Spotify dari server sumber.');
          return;
        }

        const audioArrayBuffer = await audioRes.arrayBuffer();
        const rawAudioBuffer = Buffer.from(audioArrayBuffer);

        // Fetch Cover Art buffer if cover URL is provided (with SSRF check)
        const coverUrl = req.query.cover as string;
        let coverBuffer: Buffer | null = null;
        let coverMime = 'image/jpeg';
        if (coverUrl && typeof coverUrl === 'string' && coverUrl.startsWith('http')) {
          if (isSafePublicUrl(coverUrl).safe) {
            try {
              const cRes = await fetch(coverUrl, { signal: AbortSignal.timeout(7000) });
              if (cRes.ok) {
                coverBuffer = Buffer.from(await cRes.arrayBuffer());
                coverMime = cRes.headers.get('content-type') || 'image/jpeg';
              }
            } catch (covErr) {
              console.warn('[Spotify Download] Cover image download notice:', covErr);
            }
          }
        }

        // Embed ID3 tags (Title, Artist, Album, Genre, Year, Cover Art)
        const tags: any = {
          title: (req.query.title as string) || 'Spotify Track',
          artist: (req.query.artist as string) || 'Spotify Artist',
          album: (req.query.album as string) || 'Spotify Music',
          genre: (req.query.genre as string) || 'Pop',
          year: ((req.query.year as string) || new Date().getFullYear().toString()).slice(0, 4),
          comment: {
            language: 'eng',
            text: 'Downloaded with DownloaderZero via Neo'
          }
        };

        if (coverBuffer) {
          tags.image = {
            mime: coverMime,
            type: { id: 3, name: 'front cover' },
            description: 'Album Cover Art',
            imageBuffer: coverBuffer
          };
        }

        let finalMp3Buffer: Buffer = rawAudioBuffer;
        try {
          const tagged = NodeID3.write(tags, rawAudioBuffer);
          if (tagged && tagged.length > 0) {
            finalMp3Buffer = tagged;
            console.log(`[Spotify Download] ✅ ID3 Tags & Cover embedded successfully! Size: ${finalMp3Buffer.length} bytes`);
          }
        } catch (id3Err) {
          console.error('[Spotify Download] ID3 tagging failed, streaming raw audio:', id3Err);
        }

        // Store in process cache and schedule 15-second purge
        const processKey = `sp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        spotifyProcessCache.set(processKey, { buffer: finalMp3Buffer, timestamp: Date.now() });

        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Content-Length', finalMp3Buffer.length);
        res.setHeader('Content-Disposition', `attachment; filename="${sanitizedFilename}"; filename*=UTF-8''${encodeURIComponent(sanitizedFilename)}`);
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Length, Content-Type, X-Process-Id, X-Cache-Lifetime');
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.setHeader('X-Process-Id', processKey);
        res.setHeader('X-Cache-Lifetime', '15s');

        res.send(finalMp3Buffer);

        // Hapus cache proses 15 detik setelah selesai
        setTimeout(() => {
          if (spotifyProcessCache.has(processKey)) {
            spotifyProcessCache.delete(processKey);
            console.log(`[Spotify Process Cache] 🗑️ 15 seconds elapsed: Process cache ${processKey} removed successfully.`);
          }
        }, 15000);

        return;
      }

      // Multi-Platform CDN Fetch Cascade
      // Define appropriate Referer candidate for target CDN
      let platformReferer = '';
      if (targetUrl.includes('tikwm.com')) {
        platformReferer = 'https://www.tikwm.com/';
      } else if (targetUrl.includes('tiktokcdn') || targetUrl.includes('byteoversea') || targetUrl.includes('ibyteimg')) {
        platformReferer = ''; // Empty Referer ensures TikTok CDN serves at maximum bitrate without 503
      } else if (targetUrl.includes('tiktok.com')) {
        platformReferer = 'https://www.tiktok.com/';
      } else if (targetUrl.includes('facebook') || targetUrl.includes('fbcdn')) {
        platformReferer = 'https://www.facebook.com/';
      } else if (targetUrl.includes('instagram') || targetUrl.includes('cdninstagram')) {
        platformReferer = 'https://www.instagram.com/';
      } else if (targetUrl.includes('youtube') || targetUrl.includes('googlevideo')) {
        platformReferer = 'https://www.youtube.com/';
      } else if (targetUrl.includes('pinterest') || targetUrl.includes('pinimg')) {
        platformReferer = 'https://www.pinterest.com/';
      } else if (targetUrl.includes('terabox') || targetUrl.includes('1024tera') || targetUrl.includes('4funbox')) {
        platformReferer = 'https://www.terabox.app/';
      } else if (targetUrl.includes('snapcdn.app')) {
        platformReferer = 'https://dl.snapcdn.app/';
      }

      const fetchCandidateConfigs: Array<{ headers: Record<string, string> }> = [
        // Strategy 1: Clean browser request without Referer (standard for most signed media CDNs)
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Sec-Fetch-Mode': 'no-cors'
          }
        },
        // Strategy 2: With specific platform referer
        ...(platformReferer ? [{
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Referer': platformReferer
          }
        }] : []),
        // Strategy 3: Mobile Safari User-Agent
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
            'Accept': '*/*',
            ...(platformReferer ? { 'Referer': platformReferer } : {})
          }
        }
      ];

      let response: globalThis.Response | null = null;
      let lastStatus = 0;

      for (const cfg of fetchCandidateConfigs) {
        try {
          const resCandidate = await fetch(targetUrl, {
            headers: cfg.headers,
            redirect: 'follow',
            signal: AbortSignal.timeout(15000)
          });
          if (resCandidate.ok && resCandidate.body) {
            response = resCandidate;
            break;
          } else {
            lastStatus = resCandidate.status;
          }
        } catch (e: any) {
          console.warn('[proxy-download] Candidate fetch notice:', e?.message || e);
        }
      }

      // If CDN link expired or returned 403/404/410, attempt on-the-fly re-resolution via extractMedia
      if ((!response || !response.ok) && sourceUrl && /^https?:\/\//i.test(sourceUrl)) {
        try {
          console.log(`[proxy-download] Attempting on-the-fly re-resolution for ${platform || 'media'} (${sourceUrl})...`);
          const freshMedia = await extractMedia(sourceUrl);
          if (freshMedia && freshMedia.formats && freshMedia.formats.length > 0) {
            const bestFormat = freshMedia.formats.find((f) => f.isDirect && f.url && f.url.startsWith('http')) || freshMedia.formats[0];
            if (bestFormat && bestFormat.url && bestFormat.url !== targetUrl && bestFormat.url.startsWith('http')) {
              targetUrl = bestFormat.url;
              for (const cfg of fetchCandidateConfigs) {
                try {
                  const resCandidate = await fetch(targetUrl, {
                    headers: cfg.headers,
                    redirect: 'follow',
                    signal: AbortSignal.timeout(15000)
                  });
                  if (resCandidate.ok && resCandidate.body) {
                    response = resCandidate;
                    break;
                  }
                } catch {}
              }
            }
          }
        } catch (reErr) {
          console.warn('[proxy-download] On-the-fly re-resolution notice:', reErr);
        }
      }

      if (!response || !response.ok || !response.body) {
        res.status(lastStatus || 500).json({ success: false, error: 'Gagal mengunduh berkas dari tautan sumber.' });
        return;
      }

      const reader = response.body.getReader();
      const { done: initialDone, value: firstChunk } = await reader.read();

      if (initialDone || !firstChunk || firstChunk.length === 0) {
        res.status(502).json({ success: false, error: 'Berkas kosong dari server sumber.' });
        return;
      }

      // Check first chunk for text/html or JSON error signatures
      const sampleText = Buffer.from(firstChunk.slice(0, 512)).toString('utf-8').trim();
      const isHtmlDoc =
        sampleText.startsWith('<!DOCTYPE html') ||
        sampleText.startsWith('<!doctype html') ||
        sampleText.startsWith('<html') ||
        sampleText.includes('<title>Error') ||
        sampleText.includes('Attention Required! | Cloudflare');
      const isJsonError =
        sampleText.startsWith('{"docs_url"') ||
        sampleText.startsWith('{"error_code"') ||
        sampleText.startsWith('{"success":false') ||
        (sampleText.startsWith('{') && sampleText.includes('"status":false'));

      if (isHtmlDoc || isJsonError) {
        console.warn('[proxy-download] Upstream served HTML/JSON error text instead of binary media:', sampleText.slice(0, 150));
        res.status(502).json({
          success: false,
          error: 'Tautan unduhan tidak menghasilkan berkas media yang valid dari server sumber.'
        });
        return;
      }

      const rawContentType = response.headers.get('content-type') || '';

      // Determine proper MIME type instead of generic octet-stream
      let mimeType = 'application/octet-stream';
      if (sanitizedFilename.endsWith('.mp4')) mimeType = 'video/mp4';
      else if (sanitizedFilename.endsWith('.mp3')) mimeType = 'audio/mpeg';
      else if (sanitizedFilename.endsWith('.jpg') || sanitizedFilename.endsWith('.jpeg')) mimeType = 'image/jpeg';
      else if (sanitizedFilename.endsWith('.png')) mimeType = 'image/png';
      else if (sanitizedFilename.endsWith('.zip')) mimeType = 'application/zip';
      else if (rawContentType && !rawContentType.includes('text/')) mimeType = rawContentType;

      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${sanitizedFilename}"; filename*=UTF-8''${encodeURIComponent(sanitizedFilename)}`);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Length, Content-Type');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('X-Content-Type-Options', 'nosniff');

      const contentLength = response.headers.get('content-length');
      const contentEncoding = response.headers.get('content-encoding');
      if (contentLength && !contentEncoding && !isNaN(Number(contentLength))) {
        res.setHeader('Content-Length', contentLength);
      }

      req.on('close', () => {
        try {
          reader.cancel();
        } catch {}
      });

      // Write verified first chunk, then stream the rest
      res.write(Buffer.from(firstChunk));

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          res.write(Buffer.from(value));
        }
      }
      res.end();
    } catch (err: any) {
      console.error('Proxy download stream error:', err);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: `Download gagal: ${err.message}` });
      }
    }
  });

  // Serve public static assets (videos, images, icons)
  app.use(express.static(path.resolve(__dirname, 'public')));

  // 5. Mount Vite in dev, or serve dist in production
  if (!isProduction) {
    const vite = await createViteServer({
      configFile: path.resolve(__dirname, 'vite.config.ts'),
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false
      },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  const server = app.listen(PORT, HOST, () => {
    console.log(`[DownloaderZero] Server running at http://${HOST}:${PORT}`);
  });

  server.on('error', (err: any) => {
    if (err?.code === 'EADDRINUSE') {
      console.warn(`[DownloaderZero] Port ${PORT} already in use or reloading.`);
    } else {
      console.error('[DownloaderZero] Server error:', err);
    }
  });

  const shutdown = () => {
    server.close(() => {
      process.exit(0);
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
