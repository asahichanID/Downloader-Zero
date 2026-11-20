import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import NodeID3 from 'node-id3';
import ffmpegStaticPath from 'ffmpeg-static';
import { extractMedia, detectPlatform, resolveYouTubeServer2, resolveSpotifyFullAudioServer2 } from './_utils/scraper.ts';

const ALLOWED_MP3_BITRATES = new Set(['320k', '256k', '192k', '128k', '64k']);
function normalizeTargetBitrate(raw: unknown, fallback = '320k'): string {
  const cleaned = String(raw || fallback).toLowerCase().trim();
  const withSuffix = /^\d+$/.test(cleaned) ? `${cleaned}k` : cleaned;
  return ALLOWED_MP3_BITRATES.has(withSuffix) ? withSuffix : fallback;
}

function getFfmpegCandidates(): string[] {
  const list: string[] = [];
  if (typeof ffmpegStaticPath === 'string' && ffmpegStaticPath.trim()) {
    const staticBin = ffmpegStaticPath.trim();
    if (fs.existsSync(staticBin)) {
      try {
        fs.chmodSync(staticBin, 0o755);
      } catch {}
      list.push(staticBin);
    }
  }
  for (const sysPath of ['/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg']) {
    if (fs.existsSync(sysPath) && !list.includes(sysPath)) {
      list.push(sysPath);
    }
  }
  if (!list.includes('ffmpeg')) {
    list.push('ffmpeg');
  }
  return list;
}

async function ensureMp3TargetBitrate(inputBuffer: Buffer, targetBitrate: string): Promise<Buffer> {
  const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const tmpInPath = path.join(os.tmpdir(), `dz_api_in_${uid}.media`);
  const tmpOutPath = path.join(os.tmpdir(), `dz_api_out_${uid}.mp3`);
  const targetBps = parseInt(targetBitrate, 10) * 1000;
  const ffmpegBins = getFfmpegCandidates();

  const probeWithFfmpeg = async (bin: string): Promise<{ formatName?: string; codec?: string; bitRate?: number } | null> => {
    return await new Promise((resolve) => {
      const fp = spawn(bin, ['-hide_banner', '-i', tmpInPath], { stdio: ['ignore', 'ignore', 'pipe'] });
      let infoText = '';
      fp.stderr.on('data', (c: Buffer) => {
        if (infoText.length < 4000) infoText += c.toString('utf8');
      });
      fp.on('error', () => resolve(null));
      fp.on('close', () => {
        const fmtMatch = infoText.match(/Input #0,\s*([a-zA-Z0-9_,]+),/i);
        const audMatch = infoText.match(/Stream #\d+:\d+[^\n]*Audio:\s*([a-zA-Z0-9_]+)[^\n]*?(\d+)\s*kb\/s/i);
        if (!fmtMatch && !audMatch) {
          resolve(null);
          return;
        }
        const formatName = fmtMatch?.[1]?.toLowerCase().split(',')[0]?.trim();
        const codec = audMatch?.[1]?.toLowerCase();
        const kbps = audMatch?.[2] ? Number(audMatch[2]) : 0;
        resolve({
          formatName,
          codec,
          bitRate: !isNaN(kbps) && kbps > 0 ? kbps * 1000 : 0
        });
      });
    });
  };

  try {
    fs.writeFileSync(tmpInPath, inputBuffer);

    let probeResult: { formatName?: string; codec?: string; bitRate?: number } | null = null;
    for (const bin of ffmpegBins) {
      probeResult = await probeWithFfmpeg(bin);
      if (probeResult) break;
    }

    if (
      probeResult?.formatName === 'mp3' &&
      probeResult?.codec === 'mp3' &&
      probeResult.bitRate &&
      Math.abs(probeResult.bitRate - targetBps) <= 2000
    ) {
      return inputBuffer;
    }

    const bufsize = targetBps >= 256000 ? '640k' : '384k';
    const runFfmpegWithBin = (bin: string, useStrictMap: boolean) =>
      new Promise<Buffer>((resolve, reject) => {
        const ff = spawn(
          bin,
          [
            '-y', '-i', tmpInPath,
            ...(useStrictMap ? ['-map', '0:a:0'] : []),
            '-vn', '-map_metadata', '-1',
            '-c:a', 'libmp3lame', '-b:a', targetBitrate, '-minrate', targetBitrate, '-maxrate', targetBitrate,
            '-bufsize', bufsize, '-write_xing', '0', '-compression_level', '2', '-ar', '44100', '-ac', '2', '-f', 'mp3', tmpOutPath
          ],
          { stdio: ['ignore', 'ignore', 'pipe'] }
        );
        let errText = '';
        ff.stderr.on('data', (chunk: Buffer) => {
          if (errText.length < 800) errText += chunk.toString('utf8');
        });
        ff.on('error', (err) => reject(err));
        ff.on('close', (code) => {
          if (code === 0 && fs.existsSync(tmpOutPath)) {
            const out = fs.readFileSync(tmpOutPath);
            if (out.length > 0) {
              resolve(out);
              return;
            }
          }
          reject(new Error(`ffmpeg exited ${code}: ${errText.slice(-200)}`));
        });
      });

    let lastErr: any = null;
    for (const bin of ffmpegBins) {
      try {
        return await runFfmpegWithBin(bin, true);
      } catch (firstErr: any) {
        lastErr = firstErr;
        if (firstErr?.code === 'ENOENT' || firstErr?.code === 'EACCES') {
          continue;
        }
        try {
          return await runFfmpegWithBin(bin, false);
        } catch (secondErr: any) {
          lastErr = secondErr;
          break;
        }
      }
    }

    throw lastErr || new Error('Gagal menjalankan encoder audio MP3.');
  } finally {
    try { if (fs.existsSync(tmpInPath)) fs.unlinkSync(tmpInPath); } catch {}
    try { if (fs.existsSync(tmpOutPath)) fs.unlinkSync(tmpOutPath); } catch {}
  }
}

async function muxVideoAndAudioToMp4(videoBuffer: Buffer, audioBuffer: Buffer | null): Promise<Buffer> {
  const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const tmpVidPath = path.join(os.tmpdir(), `dz_api_mux_v_${uid}.mp4`);
  const tmpAudPath = path.join(os.tmpdir(), `dz_api_mux_a_${uid}.m4a`);
  const tmpOutPath = path.join(os.tmpdir(), `dz_api_mux_o_${uid}.mp4`);
  const ffmpegBins = getFfmpegCandidates();

  try {
    fs.writeFileSync(tmpVidPath, videoBuffer);
    if (audioBuffer) {
      fs.writeFileSync(tmpAudPath, audioBuffer);
    }

    const muxArgs = audioBuffer
      ? ['-y', '-i', tmpVidPath, '-i', tmpAudPath, '-c', 'copy', '-movflags', '+faststart', '-f', 'mp4', tmpOutPath]
      : ['-y', '-i', tmpVidPath, '-c', 'copy', '-movflags', '+faststart', '-f', 'mp4', tmpOutPath];

    let lastErr: any = null;
    for (const bin of ffmpegBins) {
      try {
        return await new Promise<Buffer>((resolve, reject) => {
          const ff = spawn(bin, muxArgs, { stdio: ['ignore', 'ignore', 'pipe'] });
          let errText = '';
          ff.stderr.on('data', (chunk: Buffer) => {
            if (errText.length < 800) errText += chunk.toString('utf8');
          });
          ff.on('error', (err) => reject(err));
          ff.on('close', (code) => {
            if (code === 0 && fs.existsSync(tmpOutPath)) {
              const out = fs.readFileSync(tmpOutPath);
              if (out.length > 0) {
                resolve(out);
                return;
              }
            }
            reject(new Error(`ffmpeg mux exited ${code}: ${errText.slice(-200)}`));
          });
        });
      } catch (err: any) {
        lastErr = err;
        if (err?.code === 'ENOENT' || err?.code === 'EACCES') continue;
        break;
      }
    }
    throw lastErr || new Error('Gagal menggabungkan trek video dan audio MP4.');
  } finally {
    try { if (fs.existsSync(tmpVidPath)) fs.unlinkSync(tmpVidPath); } catch {}
    try { if (fs.existsSync(tmpAudPath)) fs.unlinkSync(tmpAudPath); } catch {}
    try { if (fs.existsSync(tmpOutPath)) fs.unlinkSync(tmpOutPath); } catch {}
  }
}

// In-memory process cache for Spotify MP3 files (automatically purged 15 seconds after completion)
const spotifyProcessCache = new Map<string, { buffer: Buffer; timestamp: number }>();
// Short-lived cache for DASH video+audio muxed MP4 streams
const dashMuxCache = new Map<string, { buffer: Buffer; timestamp: number }>();

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const parsedUrl = new URL(req.url || '', `http://${req.headers?.host || 'localhost'}`);
    const query = Object.fromEntries(parsedUrl.searchParams.entries());

    let targetUrl = query.url || req.query?.url || '';

    // Check raw request URL to avoid truncation by unencoded ampersands
    const rawReqUrl = req.url || '';
    const urlParamIdx = rawReqUrl.indexOf('url=');
    if (urlParamIdx !== -1) {
      let extracted = rawReqUrl.slice(urlParamIdx + 4);
      const nextParamMatch = extracted.match(/&(?:filename|platform|sourceUrl|title|artist|album|genre|year|cover|apiKey|server|inline|bitrate|duration|audioUrl)=/);
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

    const rawFilename = query.filename || req.query?.filename || 'DownloaderZero_Media.mp4';
    const sanitizedFilename = rawFilename.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const platform = ((query.platform || req.query?.platform || '') as string).toLowerCase();
    const sourceUrl = (query.sourceUrl || req.query?.sourceUrl || '') as string;
    const isInline = query.inline === '1' || req.query?.inline === '1' || query.inline === 'true';
    const rangeHeader = typeof req.headers?.range === 'string' ? req.headers.range : undefined;

    if (!targetUrl || typeof targetUrl !== 'string' || !/^https?:\/\//i.test(targetUrl)) {
      res.status(400).send('Target URL tidak valid.');
      return;
    }

    let audioUrl = ((query.audioUrl || req.query?.audioUrl || '') as string).trim();
    if (audioUrl && (audioUrl.startsWith('http%3A') || audioUrl.startsWith('https%3A'))) {
      try { audioUrl = decodeURIComponent(audioUrl); } catch {}
    }
    if (audioUrl && !/^https?:\/\//i.test(audioUrl)) {
      res.status(400).send('Audio URL tidak valid.');
      return;
    }

    const isSpotify =
      platform === 'spotify' ||
      query.platform === 'spotify' ||
      req.query?.platform === 'spotify' ||
      targetUrl.includes('spotify.com') ||
      targetUrl.includes('spotify.link') ||
      (!platform && sanitizedFilename.endsWith('.mp3') && (Boolean(query.title || req.query?.title) || Boolean(query.artist || req.query?.artist)));

    // Handle Spotify full-song audio download + embedded ID3 metadata & cover art
    if (isSpotify) {
      let directAudioUrl = targetUrl;
      const neoxrKey = ((query.apiKey as string) || (req.query?.apiKey as string) || process.env.NEOXR_API_KEY || 'j3i3mg').trim();
      const reqServerMode = ((query.server as string) || (req.query?.server as string) || 'auto').toLowerCase();
      let metaTitle = ((query.title || req.query?.title || '') as string);
      let metaArtist = ((query.artist || req.query?.artist || '') as string);
      let metaAlbum = ((query.album || req.query?.album || '') as string);
      let metaCover = ((query.cover || req.query?.cover || '') as string);
      let metaYear = ((query.year || req.query?.year || '') as string);
      const metaDuration = Number(query.duration || req.query?.duration || 0) || 0;

      // If targetUrl is a Spotify web URL or accidentally points to a 30s preview URL, resolve to FULL song MP3
      const resolveViaServer2Spotify = async (spSource: string) => {
        const s2 = await resolveSpotifyFullAudioServer2(spSource, {
          title: metaTitle,
          artist: metaArtist,
          album: metaAlbum,
          coverUrl: metaCover,
          duration: metaDuration
        });
        directAudioUrl = s2.audioUrl;
        if (!metaTitle && s2.title) metaTitle = s2.title;
        if (!metaArtist && s2.artist) metaArtist = s2.artist;
        if (!metaAlbum && s2.album) metaAlbum = s2.album;
        if (!metaCover && s2.coverUrl) metaCover = s2.coverUrl;
        if (!metaYear && s2.releaseDate) metaYear = s2.releaseDate;
      };

      let resolvedViaServer1 = false;
      if (
        directAudioUrl.includes('spotify.com') ||
        directAudioUrl.includes('spotify.link') ||
        directAudioUrl.includes('mp3-preview') ||
        directAudioUrl.includes('mzstatic.com')
      ) {
        let resolvedOk = false;

        if (reqServerMode !== 'server2') {
          try {
            const neoRes = await fetch(
              `https://api.neoxr.eu/api/spotify?url=${encodeURIComponent(directAudioUrl)}&apikey=${encodeURIComponent(neoxrKey)}`,
              {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                signal: AbortSignal.timeout(12000)
              }
            );
            if (neoRes.ok) {
              const neoJson = await neoRes.json();
              const fullSongUrl = neoJson.data?.url || neoJson.data?.download || neoJson.data?.link;
              if (
                fullSongUrl &&
                typeof fullSongUrl === 'string' &&
                fullSongUrl.startsWith('http') &&
                !fullSongUrl.includes('mp3-preview') &&
                !fullSongUrl.includes('mzstatic.com')
              ) {
                directAudioUrl = fullSongUrl;
                resolvedOk = true;
                resolvedViaServer1 = true;
              }
            }
          } catch (e) {
            console.warn('[Spotify Download] Server 1 resolve notice:', e);
          }
        }

        if (!resolvedOk && reqServerMode !== 'server1') {
          try {
            await resolveViaServer2Spotify(directAudioUrl);
            resolvedOk = true;
          } catch (s2Err: any) {
            console.warn('[Spotify Download] Server 2 resolve error:', s2Err?.message || s2Err);
          }
        }

        if (!resolvedOk || directAudioUrl.includes('spotify.com') || directAudioUrl.includes('spotify.link')) {
          res.status(502).send('Gagal menyelesaikan tautan lagu penuh Spotify dari server sumber.');
          return;
        }
      }

      const fetchAudioBufferFromUrl = async (audioTarget: string): Promise<{ ok: boolean; status: number; buffer?: Buffer; errMsg?: string }> => {
        const audioRes = await fetch(audioTarget, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': '*/*'
          },
          signal: AbortSignal.timeout(60000)
        });
        if (!audioRes.ok) {
          return { ok: false, status: audioRes.status || 502, errMsg: 'Gagal mengunduh audio Spotify dari server sumber.' };
        }
        const audioCt = (audioRes.headers.get('content-type') || '').toLowerCase();
        if (audioCt.includes('text/html')) {
          return { ok: false, status: 502, errMsg: 'Respon audio Spotify tidak valid (HTML bukan file MP3).' };
        }
        const buf = Buffer.from(await audioRes.arrayBuffer());
        if (buf.length < 10000) {
          return { ok: false, status: 502, errMsg: 'File audio Spotify terlalu kecil atau korup.' };
        }
        return { ok: true, status: 200, buffer: buf };
      };

      let fetchedAudio = await fetchAudioBufferFromUrl(directAudioUrl);
      if (!fetchedAudio.ok && reqServerMode !== 'server1' && (resolvedViaServer1 || (sourceUrl && sourceUrl.includes('spotify')))) {
        try {
          const fallbackSource = (sourceUrl && sourceUrl.includes('spotify')) ? sourceUrl : targetUrl;
          await resolveViaServer2Spotify(fallbackSource);
          fetchedAudio = await fetchAudioBufferFromUrl(directAudioUrl);
        } catch {}
      }

      if (!fetchedAudio.ok || !fetchedAudio.buffer) {
        res.status(fetchedAudio.status || 502).send(fetchedAudio.errMsg || 'Gagal mengunduh audio Spotify dari server sumber.');
        return;
      }

      let rawAudioBuffer: Buffer = fetchedAudio.buffer;

      const targetSpotifyBitrate = normalizeTargetBitrate(query.bitrate || req.query?.bitrate, '320k');
      if (!isInline) {
        try {
          rawAudioBuffer = await ensureMp3TargetBitrate(rawAudioBuffer, targetSpotifyBitrate);
        } catch (encErr: any) {
          console.error('[api/proxy-download] Spotify MP3 bitrate transcode failed:', encErr?.message || encErr);
          res.status(502).send(`Gagal mengonversi audio Spotify ke ${targetSpotifyBitrate} CBR.`);
          return;
        }
      }

      // Fetch Cover Art buffer if cover URL is provided
      const coverUrl = metaCover;
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
        title: metaTitle || 'Spotify Track',
        artist: metaArtist || 'Spotify Artist',
        album: metaAlbum || 'Spotify Music',
        genre: ((query.genre || req.query?.genre || 'Pop') as string),
        year: (metaYear || new Date().getFullYear().toString()).slice(0, 4),
        comment: {
          language: 'eng',
          text: 'Downloaded with DownloaderZero'
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
        if (Buffer.isBuffer(tagged) && tagged.length > 0) {
          finalMp3Buffer = tagged;
        }
      } catch (id3Err) {
        console.error('[Spotify Download] ID3 tagging failed, streaming raw audio:', id3Err);
      }

      // Store in process cache and schedule 15-second purge
      const processKey = `sp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      spotifyProcessCache.set(processKey, { buffer: finalMp3Buffer, timestamp: Date.now() });

      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader(
        'Content-Disposition',
        isInline
          ? `inline; filename="${sanitizedFilename}"`
          : `attachment; filename="${sanitizedFilename}"; filename*=UTF-8''${encodeURIComponent(sanitizedFilename)}`
      );
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Length, Content-Type, Content-Range, Accept-Ranges, X-Process-Id, X-Cache-Lifetime, X-Audio-Bitrate');
      res.setHeader('Cache-Control', isInline ? 'private, max-age=300' : 'no-store, no-cache, must-revalidate, private');
      res.setHeader('X-Process-Id', processKey);
      res.setHeader('X-Cache-Lifetime', '15s');
      res.setHeader('X-Audio-Bitrate', isInline ? 'preview' : targetSpotifyBitrate);

      if (rangeHeader) {
        const totalLen = finalMp3Buffer.length;
        const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
        if (match) {
          const start = match[1] ? parseInt(match[1], 10) : 0;
          const end = match[2] ? Math.min(parseInt(match[2], 10), totalLen - 1) : totalLen - 1;
          if (!isNaN(start) && !isNaN(end) && start <= end && start < totalLen) {
            const sliced = finalMp3Buffer.subarray(start, end + 1);
            res.status(206);
            res.setHeader('Content-Range', `bytes ${start}-${end}/${totalLen}`);
            res.setHeader('Content-Length', sliced.length);
            res.send(sliced);
          } else {
            res.setHeader('Content-Length', totalLen);
            res.send(finalMp3Buffer);
          }
        } else {
          res.setHeader('Content-Length', totalLen);
          res.send(finalMp3Buffer);
        }
      } else {
        res.setHeader('Content-Length', finalMp3Buffer.length);
        res.send(finalMp3Buffer);
      }

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
    let platformReferer = '';
    if (targetUrl.includes('tikwm.com')) {
      platformReferer = 'https://www.tikwm.com/';
    } else if (targetUrl.includes('tiktokcdn') || targetUrl.includes('byteoversea') || targetUrl.includes('ibyteimg')) {
      platformReferer = '';
    } else if (targetUrl.includes('tiktok.com')) {
      platformReferer = 'https://www.tiktok.com/';
    } else if (platform === 'instagram' || targetUrl.includes('instagram') || targetUrl.includes('cdninstagram')) {
      platformReferer = 'https://www.instagram.com/';
    } else if (targetUrl.includes('facebook') || targetUrl.includes('fbcdn')) {
      platformReferer = 'https://www.facebook.com/';
    } else if (targetUrl.includes('savetube')) {
      platformReferer = 'https://save-tube.com/';
    } else if (
      targetUrl.includes('youtube') ||
      targetUrl.includes('googlevideo') ||
      targetUrl.includes('yt3.ggpht.com') ||
      targetUrl.includes('yt4.ggpht.com') ||
      targetUrl.includes('lh3.googleusercontent.com')
    ) {
      platformReferer = 'https://www.youtube.com/';
    } else if (targetUrl.includes('pinterest') || targetUrl.includes('pinimg')) {
      platformReferer = 'https://www.pinterest.com/';
    } else if (targetUrl.includes('terabox') || targetUrl.includes('1024tera') || targetUrl.includes('4funbox')) {
      platformReferer = 'https://www.terabox.app/';
    } else if (targetUrl.includes('snapcdn.app')) {
      platformReferer = 'https://dl.snapcdn.app/';
    } else if (targetUrl.includes('twimg.com') || targetUrl.includes('twitter.com') || targetUrl.includes('x.com')) {
      platformReferer = 'https://x.com/';
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

    const fetchWithHeaderTimeout = async (target: string, headers: Record<string, string>, headerTimeoutMs = 15000) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), headerTimeoutMs);
      try {
        const res = await fetch(target, {
          headers,
          redirect: 'follow',
          signal: controller.signal
        });
        clearTimeout(timer);
        return res;
      } catch (err) {
        clearTimeout(timer);
        throw err;
      }
    };

    const wantsMp3OutputEarly = sanitizedFilename.toLowerCase().endsWith('.mp3');
    const isCmfvVideo = /\.cmfv(\?|$)/i.test(targetUrl);
    if ((audioUrl || isCmfvVideo) && !wantsMp3OutputEarly) {
      const muxKey = `${targetUrl}::${audioUrl || 'silent'}`;
      let muxedMp4: Buffer | null = dashMuxCache.get(muxKey)?.buffer || null;

      if (!muxedMp4) {
        const fetchFullStreamBuffer = async (streamUrl: string): Promise<Buffer> => {
          for (const cfg of fetchCandidateConfigs) {
            try {
              const candidate = await fetchWithHeaderTimeout(streamUrl, { ...cfg.headers }, 20000);
              if (candidate.ok && candidate.body) {
                const buf = Buffer.from(await candidate.arrayBuffer());
                if (buf.length > 200) {
                  const headStr = buf.subarray(0, 64).toString('utf8').trim();
                  if (!headStr.startsWith('<!DOCTYPE') && !headStr.startsWith('<html') && !headStr.startsWith('{"error')) {
                    return buf;
                  }
                }
              }
            } catch {}
          }
          throw new Error('Gagal mengunduh stream media sumber untuk penggabungan resolusi.');
        };

        const [vidBuf, audBuf] = await Promise.all([
          fetchFullStreamBuffer(targetUrl),
          audioUrl ? fetchFullStreamBuffer(audioUrl) : Promise.resolve(null)
        ]);

        muxedMp4 = await muxVideoAndAudioToMp4(vidBuf, audBuf);
        dashMuxCache.set(muxKey, { buffer: muxedMp4, timestamp: Date.now() });
        setTimeout(() => {
          dashMuxCache.delete(muxKey);
        }, 90000);
      }

      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader(
        'Content-Disposition',
        isInline
          ? `inline; filename="${sanitizedFilename}"`
          : `attachment; filename="${sanitizedFilename}"; filename*=UTF-8''${encodeURIComponent(sanitizedFilename)}`
      );
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Length, Content-Type, Content-Range, Accept-Ranges');
      res.setHeader('Cache-Control', isInline ? 'private, max-age=300' : 'no-store, no-cache, must-revalidate, private');
      res.setHeader('X-Content-Type-Options', 'nosniff');

      if (rangeHeader) {
        const totalLen = muxedMp4.length;
        const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
        if (match) {
          const start = match[1] ? parseInt(match[1], 10) : 0;
          const end = match[2] ? Math.min(parseInt(match[2], 10), totalLen - 1) : totalLen - 1;
          if (!isNaN(start) && !isNaN(end) && start <= end && start < totalLen) {
            const sliced = muxedMp4.subarray(start, end + 1);
            res.status(206);
            res.setHeader('Content-Range', `bytes ${start}-${end}/${totalLen}`);
            res.setHeader('Content-Length', sliced.length);
            res.send(sliced);
            return;
          }
        }
      }

      res.setHeader('Content-Length', muxedMp4.length);
      res.send(muxedMp4);
      return;
    }

    let remoteRes: globalThis.Response | null = null;
    let lastStatus = 0;

    for (const cfg of fetchCandidateConfigs) {
      try {
        const reqHeaders: Record<string, string> = { ...cfg.headers };
        if (rangeHeader) {
          reqHeaders['Range'] = rangeHeader;
        }
        const resCandidate = await fetchWithHeaderTimeout(targetUrl, reqHeaders, 15000);
        if (resCandidate.ok && resCandidate.body) {
          remoteRes = resCandidate;
          break;
        } else {
          lastStatus = resCandidate.status;
        }
      } catch (e: any) {
        console.warn('[proxy-download] Candidate fetch notice:', e?.message || e);
      }
    }

    // If CDN link expired or returned 403/404/410, attempt on-the-fly re-resolution via extractMedia
    if ((!remoteRes || !remoteRes.ok) && sourceUrl && /^https?:\/\//i.test(sourceUrl)) {
      try {
        console.log(`[proxy-download] Attempting on-the-fly re-resolution for ${platform || 'media'} (${sourceUrl})...`);
        const reKey = typeof query.apiKey === 'string' && query.apiKey.trim() ? query.apiKey.trim() : undefined;
        const reServer = query.server === 'server1' || query.server === 'server2' || query.server === 'auto' ? query.server : 'auto';
        const freshMedia = await extractMedia(sourceUrl, reKey, reServer);
        let freshTargetUrl = '';
        if (freshMedia && freshMedia.formats && freshMedia.formats.length > 0) {
          const bestFormat = freshMedia.formats.find((f) => f.isDirect && f.url && f.url.startsWith('http')) || freshMedia.formats[0];
          if (bestFormat?.url?.startsWith('http')) {
            freshTargetUrl = bestFormat.url;
          }
        }
        if (!freshTargetUrl && (platform === 'youtube' || detectPlatform(sourceUrl) === 'youtube') && reServer !== 'server1') {
          const resolvedYt = await resolveYouTubeServer2(
            sourceUrl,
            '',
            sanitizedFilename.toLowerCase().endsWith('.mp3') ? '320 kbps' : '1080p',
            sanitizedFilename.toLowerCase().endsWith('.mp3') ? 'audio' : 'video'
          );
          freshTargetUrl = resolvedYt.downloadUrl;
        }
        if (freshTargetUrl && freshTargetUrl !== targetUrl && freshTargetUrl.startsWith('http')) {
          targetUrl = freshTargetUrl;
          for (const cfg of fetchCandidateConfigs) {
            try {
              const reqHeaders: Record<string, string> = { ...cfg.headers };
              if (rangeHeader) {
                reqHeaders['Range'] = rangeHeader;
              }
              const resCandidate = await fetchWithHeaderTimeout(targetUrl, reqHeaders, 15000);
              if (resCandidate.ok && resCandidate.body) {
                remoteRes = resCandidate;
                break;
              }
            } catch {}
          }
        }
      } catch (reErr) {
        console.warn('[proxy-download] On-the-fly re-resolution notice:', reErr);
      }
    }

    if (!remoteRes || !remoteRes.ok || !remoteRes.body) {
      res.status(lastStatus || 500).json({ success: false, error: 'Gagal mengunduh berkas dari tautan sumber.' });
      return;
    }

    const reader = remoteRes.body.getReader();
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
      console.warn('[api/proxy-download] Upstream served HTML/JSON error text instead of binary media:', sampleText.slice(0, 150));
      res.status(502).json({
        success: false,
        error: 'Tautan unduhan tidak menghasilkan berkas media yang valid dari server sumber.'
      });
      return;
    }

    const rawContentType = remoteRes.headers.get('content-type') || '';
    const wantsMp3Output = sanitizedFilename.toLowerCase().endsWith('.mp3');
    const isUpstreamMp3 = rawContentType.includes('audio/mpeg') || rawContentType.includes('audio/mp3');
    if (wantsMp3Output && (!isUpstreamMp3 || !isInline)) {
      const targetMp3Bitrate = normalizeTargetBitrate(query.bitrate || req.query?.bitrate, '192k');
      const chunks: Buffer[] = [Buffer.from(firstChunk)];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(Buffer.from(value));
      }
      let mp3Buffer: Buffer = Buffer.from(Buffer.concat(chunks));
      try {
        mp3Buffer = await ensureMp3TargetBitrate(mp3Buffer, targetMp3Bitrate);
        const metaTitle = typeof query.title === 'string' ? query.title.trim() : '';
        const metaArtist = typeof query.artist === 'string' ? query.artist.trim() : '';
        if (metaTitle || metaArtist) {
          try {
            const tagged = NodeID3.write(
              {
                title: metaTitle || 'Audio DownloaderZero',
                artist: metaArtist || (platform ? platform.toUpperCase() : 'DownloaderZero')
              },
              mp3Buffer
            );
            if (Buffer.isBuffer(tagged) && tagged.length > 0) mp3Buffer = Buffer.from(tagged);
          } catch {}
        }
      } catch (encErr: any) {
        console.warn('[api/proxy-download] MP3 transcode error:', encErr?.message || encErr);
        res.status(422).json({ success: false, error: 'Media ini tidak memiliki trek audio yang dapat dikonversi ke MP3.' });
        return;
      }
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader(
        'Content-Disposition',
        isInline
          ? `inline; filename="${sanitizedFilename}"`
          : `attachment; filename="${sanitizedFilename}"; filename*=UTF-8''${encodeURIComponent(sanitizedFilename)}`
      );
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Length, Content-Type, Content-Range, Accept-Ranges, X-Audio-Bitrate');
      res.setHeader('Cache-Control', isInline ? 'private, max-age=300' : 'no-store, no-cache, must-revalidate, private');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Audio-Bitrate', targetMp3Bitrate);
      res.setHeader('Content-Length', mp3Buffer.length);
      res.send(mp3Buffer);
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

    if (remoteRes.status === 206) {
      res.status(206);
      const contentRange = remoteRes.headers.get('content-range');
      if (contentRange) {
        res.setHeader('Content-Range', contentRange);
      }
    }

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader(
      'Content-Disposition',
      isInline
        ? `inline; filename="${sanitizedFilename}"`
        : `attachment; filename="${sanitizedFilename}"; filename*=UTF-8''${encodeURIComponent(sanitizedFilename)}`
    );
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Length, Content-Type, Content-Range, Accept-Ranges');
    res.setHeader('Cache-Control', isInline ? 'private, max-age=300' : 'no-store, no-cache, must-revalidate, private');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const contentLength = remoteRes.headers.get('content-length');
    const contentEncoding = remoteRes.headers.get('content-encoding');
    if (contentLength && !contentEncoding && !isNaN(Number(contentLength))) {
      res.setHeader('Content-Length', contentLength);
    }

    req.on?.('close', () => {
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
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: `Download gagal: ${err.message}` });
    }
  }
}
