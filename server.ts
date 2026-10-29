import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import NodeID3 from 'node-id3';
import { extractMedia } from './src/services/scraper.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isProduction = process.env.NODE_ENV === 'production';
const PORT = parseInt(process.env.PORT || '3000', 10);

async function startServer() {
  const app = express();
  app.use(express.json());

  // In-memory process cache for Spotify MP3 files (automatically purged 15 seconds after completion)
  const spotifyProcessCache = new Map<string, { buffer: Buffer; timestamp: number }>();

  // 1. Health check
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'online',
      service: 'DownloaderZero (DZ) Media Engine',
      version: '2026.1',
      platforms: ['youtube', 'tiktok', 'facebook', 'instagram', 'pinterest', 'spotify', 'terabox']
    });
  });

  // 2. Extract media metadata and formats (API key is loaded from server environment)
  app.post('/api/extract', async (req: Request, res: Response) => {
    try {
      const { url, apiKey } = req.body || {};
      if (!url || typeof url !== 'string') {
        res.status(400).json({ success: false, error: 'Parameter URL wajib disertakan.' });
        return;
      }

      const media = await extractMedia(url, apiKey);
      res.json({ success: true, data: media });
    } catch (err: any) {
      console.error('Extraction error:', err.message);
      res.status(400).json({
        success: false,
        error: err.message || 'Terjadi kesalahan saat memproses URL. Silakan coba lagi.'
      });
    }
  });

  // Helper to normalize format parameter for loader.to engine
  function normalizeLoaderFormat(raw: string | undefined): string {
    if (!raw) return '1080';
    const f = String(raw).toLowerCase().trim();
    if (f === '4k' || f === '2160' || f === '2160p' || f.includes('2160') || f.includes('4k')) return '2160';
    if (f === '2k' || f === '1440' || f === '1440p' || f.includes('1440') || f.includes('2k') || f.includes('qhd')) return '1440';
    if (f === '1080' || f === '1080p' || f.includes('1080')) return '1080';
    if (f === '720' || f === '720p' || f.includes('720')) return '720';
    if (f === '480' || f === '480p' || f.includes('480')) return '480';
    if (f === '360' || f === '360p' || f.includes('360')) return '360';
    if (f === 'mp3' || f === 'audio' || f.includes('mp3') || f.includes('audio')) return 'mp3';
    return f.replace(/p$/i, '');
  }

  // 2b. Start async job for YouTube conversion
  app.post('/api/start-job', async (req: Request, res: Response) => {
    try {
      const { format, url } = req.body || {};
      if (!url) {
        res.status(400).json({ success: false, error: 'URL target wajib disertakan.' });
        return;
      }

      const normalizedFormat = normalizeLoaderFormat(format);
      const response = await fetch(
        `https://loader.to/ajax/download.php?format=${encodeURIComponent(normalizedFormat)}&url=${encodeURIComponent(url)}`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          signal: AbortSignal.timeout(10000)
        }
      );

      let loaderFailed = false;
      let loaderErrMsg = '';
      if (!response.ok) {
        loaderFailed = true;
      } else {
        const data = await response.json();
        if (data.id || data.download_url) {
          res.json({
            success: true,
            id: data.id || null,
            downloadUrl: data.download_url || null,
            format: normalizedFormat,
            text: data.text || ''
          });
          return;
        } else {
          loaderFailed = true;
          loaderErrMsg = data.message || '';
        }
      }

      // If loader.to fails (e.g. requires api key), seamlessly fallback to Neoxr YouTube API
      if (loaderFailed) {
        const neoKey = (process.env.NEOXR_API_KEY || 'j3i3mg').trim().replace(/^["']|["']$/g, '');
        const isAudio = normalizedFormat === 'mp3';
        const qualityMap: Record<string, string> = {
          '2160': '720p',
          '1440': '720p',
          '1080': '720p',
          '720': '720p',
          '480': '480p',
          '360': '360p',
          'mp3': '128kbps'
        };
        const neoQ = qualityMap[normalizedFormat] || (isAudio ? '128kbps' : '720p');
        const neoType = isAudio ? 'audio' : 'video';
        const neoEp = `https://api.neoxr.eu/api/youtube?url=${encodeURIComponent(url)}&type=${neoType}&quality=${neoQ}&apikey=${encodeURIComponent(neoKey)}`;

        try {
          const neoRes = await fetch(neoEp, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            signal: AbortSignal.timeout(8000)
          });
          if (neoRes.ok) {
            const neoJson = await neoRes.json();
            if (neoJson && neoJson.status && neoJson.data?.url) {
              res.json({
                success: true,
                id: null,
                downloadUrl: neoJson.data.url,
                format: normalizedFormat,
                text: `Siap diunduh (${neoJson.data.quality || normalizedFormat})!`
              });
              return;
            }
          }
        } catch (neoErr) {
          console.warn('[server] Neoxr start-job fallback error:', neoErr);
        }

        res.status(502).json({
          success: false,
          error: loaderErrMsg || 'Gagal memulai konversi resolusi yang dipilih. Silakan coba kembali.'
        });
        return;
      }
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 3. Progress check for async processing (e.g. YouTube loader.to jobs)
  app.get(['/api/progress', '/api/progress/:jobId'], async (req: Request, res: Response) => {
    try {
      const jobId = (req.params.jobId || req.query.jobId || req.query.id || '') as string;
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

  // 4. Proxy stream for instant automatic download attachment
  app.get('/api/proxy-download', async (req: Request, res: Response) => {
    try {
      // 1. Extract targetUrl reliably from query or raw URL
      let targetUrl = '';
      if (req.query?.url && typeof req.query.url === 'string') {
        targetUrl = req.query.url;
      } else if (Array.isArray(req.query?.url) && typeof req.query.url[0] === 'string') {
        targetUrl = req.query.url[0];
      }

      // Check raw request URL if query param was truncated by unencoded ampersands
      if (!targetUrl || !targetUrl.startsWith('http')) {
        const rawReqUrl = req.url || '';
        const urlMatch = rawReqUrl.match(/[?&]url=([^&]+)/);
        if (urlMatch && urlMatch[1]) {
          try {
            targetUrl = decodeURIComponent(urlMatch[1]);
          } catch {
            targetUrl = urlMatch[1];
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

      const rawFilename = (req.query.filename as string) || 'DownloaderZero_Media.mp4';
      const sanitizedFilename = rawFilename.replace(/[^a-zA-Z0-9_.-]/g, '_');

      if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
        res.status(400).send('Target URL tidak valid.');
        return;
      }

      const isSpotify =
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

        // Fetch Cover Art buffer if cover URL is provided
        const coverUrl = req.query.cover as string;
        let coverBuffer: Buffer | null = null;
        let coverMime = 'image/jpeg';
        if (coverUrl && typeof coverUrl === 'string' && coverUrl.startsWith('http')) {
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

      // Determine correct Referer per platform CDN
      let referer = 'https://www.google.com/';
      if (targetUrl.includes('tiktok') || targetUrl.includes('byteoversea') || targetUrl.includes('ibyteimg')) {
        referer = 'https://www.tiktok.com/';
      } else if (targetUrl.includes('facebook') || targetUrl.includes('fbcdn')) {
        referer = 'https://www.facebook.com/';
      } else if (targetUrl.includes('instagram') || targetUrl.includes('cdninstagram')) {
        referer = 'https://www.instagram.com/';
      } else if (targetUrl.includes('youtube') || targetUrl.includes('googlevideo')) {
        referer = 'https://www.youtube.com/';
      } else if (targetUrl.includes('pinterest') || targetUrl.includes('pinimg')) {
        referer = 'https://www.pinterest.com/';
      } else if (targetUrl.includes('open.spotify.com')) {
        referer = 'https://open.spotify.com/';
      } else if (targetUrl.includes('terabox') || targetUrl.includes('1024tera')) {
        referer = 'https://www.terabox.com/';
      } else if (targetUrl.includes('scdn.co') || targetUrl.includes('neoxr.eu') || targetUrl.includes('pages.dev')) {
        referer = '';
      }

      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        'Accept': '*/*'
      };
      if (referer) {
        headers['Referer'] = referer;
      }

      let response = await fetch(targetUrl, { headers });

      // If forbidden, retry without Referer
      if (response.status === 403 || response.status === 401) {
        response = await fetch(targetUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
            'Accept': '*/*'
          }
        });
      }

      if (!response.ok || !response.body) {
        res.status(response.status || 500).send('Gagal mengunduh media dari tautan sumber.');
        return;
      }

      const rawContentType = response.headers.get('content-type') || '';
      const isHtml = rawContentType.includes('text/html');
      const isKnownMediaUrl = targetUrl.includes('pages.dev') || targetUrl.includes('neoxr') || targetUrl.includes('scdn.co');
      if (rawContentType.includes('application/json') || (isHtml && !isKnownMediaUrl && !sanitizedFilename.endsWith('.html'))) {
        res.status(400).send('Tautan unduhan tidak valid atau berkas belum siap dari server sumber.');
        return;
      }

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
      if (contentLength && !contentEncoding) {
        res.setHeader('Content-Length', contentLength);
      }

      // Stream chunks directly to user's browser
      const reader = response.body.getReader();
      req.on('close', () => {
        try {
          reader.cancel();
        } catch {}
      });

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
        res.status(500).send(`Download gagal: ${err.message}`);
      }
    }
  });

  // 5. Mount Vite in dev, or serve dist in production
  if (!isProduction) {
    const vite = await createViteServer({
      configFile: path.resolve(__dirname, 'vite.config.ts'),
      server: {
        middlewareMode: true,
        hmr: false
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[DownloaderZero] Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
