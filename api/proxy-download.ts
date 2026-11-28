import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import NodeID3 from 'node-id3';
import ffmpegStaticPath from 'ffmpeg-static';
import { extractMedia, detectPlatform, resolveTikTokDownload, resolveYouTubeServer2, resolveSpotifyFullAudioServer2, resolveInstagramServer2, resolvePinterestServer2, resolveFacebookServer2 } from './_utils/scraper.ts';
import { getTikTokCdnCookieForUrl } from '../src/services/server2/tiktok-s2.ts';
import { isSafePublicUrl, sanitizeFilename } from '../src/services/security.ts';

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
const inFlightDashMux = new Map<string, Promise<Buffer>>();
// Short-lived cache for target-resolution normalized MP4 streams
const videoNormalizeCache = new Map<string, { buffer: Buffer; timestamp: number }>();
// Per-host winning header strategy index so Range requests connect on the 1st try
const winningStrategyByHost = new Map<string, number>();

function parseTargetShortSide(rawRes: string): number | null {
  const r = String(rawRes || '').toLowerCase().trim();
  if (!r || r === 'original' || r.includes('original')) return null;
  if (r.includes('4k') || r.includes('2160')) return 2160;
  if (r.includes('2k') || r.includes('1440') || r.includes('qhd')) return 1440;
  if (r.includes('1080') || r.includes('fhd')) return 1080;
  if (r.includes('720')) return 720;
  if (r.includes('480')) return 480;
  if (r.includes('360')) return 360;
  return null;
}

async function ensureMp4TargetResolution(inputBuffer: Buffer, targetShortSide: number): Promise<Buffer> {
  const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const tmpInPath = path.join(os.tmpdir(), `dz_api_vres_in_${uid}.mp4`);
  const tmpOutPath = path.join(os.tmpdir(), `dz_api_vres_out_${uid}.mp4`);
  const ffmpegBins = getFfmpegCandidates();

  const probeVideoInfo = async (bin: string): Promise<{ fmtName: string; vcodec: string; width: number; height: number; hasAudio: boolean } | null> => {
    return await new Promise((resolve) => {
      const fp = spawn(bin, ['-hide_banner', '-i', tmpInPath], { stdio: ['ignore', 'ignore', 'pipe'] });
      let infoText = '';
      fp.stderr.on('data', (c: Buffer) => {
        if (infoText.length < 6000) infoText += c.toString('utf8');
      });
      fp.on('error', () => resolve(null));
      fp.on('close', () => {
        const fmtMatch = infoText.match(/Input #0,\s*([a-zA-Z0-9_,]+),/i);
        const vidMatch = infoText.match(/Stream #\d+:\d+[^\n]*Video:\s*([a-zA-Z0-9_]+)[^\n]*?,\s*(\d{2,5})x(\d{2,5})/i);
        if (!vidMatch) {
          resolve(null);
          return;
        }
        resolve({
          fmtName: fmtMatch?.[1]?.toLowerCase() || '',
          vcodec: vidMatch[1].toLowerCase(),
          width: Number(vidMatch[2]) || 0,
          height: Number(vidMatch[3]) || 0,
          hasAudio: /Stream #\d+:\d+[^\n]*Audio:/i.test(infoText)
        });
      });
    });
  };

  try {
    fs.writeFileSync(tmpInPath, inputBuffer);

    let probe: { fmtName: string; vcodec: string; width: number; height: number; hasAudio: boolean } | null = null;
    for (const bin of ffmpegBins) {
      probe = await probeVideoInfo(bin);
      if (probe) break;
    }

    const w = probe?.width || 0;
    const h = probe?.height || 0;
    const shortSide = w > 0 && h > 0 ? Math.min(w, h) : 0;

    if (probe?.vcodec === 'h264' && shortSide > 0 && Math.abs(shortSide - targetShortSide) <= 16) {
      if (probe.fmtName.includes('mp4') || probe.fmtName.includes('mov')) {
        return inputBuffer;
      }
    }

    const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
    let vfExpr: string;
    if (w > 0 && h > 0) {
      const targetW = w <= h ? even(targetShortSide) : even((w * targetShortSide) / h);
      const targetH = w <= h ? even((h * targetShortSide) / w) : even(targetShortSide);
      vfExpr = `scale=${targetW}:${targetH}:flags=lanczos,setsar=1`;
    } else {
      vfExpr = `scale=-2:${even(targetShortSide)}:flags=lanczos,setsar=1`;
    }

    const runTranscode = (bin: string, includeAudio: boolean) =>
      new Promise<Buffer>((resolve, reject) => {
        const args = [
          '-y', '-i', tmpInPath,
          '-map', '0:v:0',
          ...(includeAudio ? ['-map', '0:a:0', '-c:a', 'aac', '-b:a', '192k'] : ['-an']),
          '-vf', vfExpr,
          '-c:v', 'libx264',
          '-preset', 'veryfast',
          '-crf', '19',
          '-pix_fmt', 'yuv420p',
          '-profile:v', 'high',
          '-level:v', '4.1',
          '-movflags', '+faststart',
          '-f', 'mp4',
          tmpOutPath
        ];
        const ff = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
        let errText = '';
        ff.stderr.on('data', (chunk: Buffer) => {
          if (errText.length < 1000) errText += chunk.toString('utf8');
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
          reject(new Error(`ffmpeg video scale exited ${code}: ${errText.slice(-240)}`));
        });
      });

    const tryAudioFirst = probe ? probe.hasAudio : true;
    for (const bin of ffmpegBins) {
      try {
        return await runTranscode(bin, tryAudioFirst);
      } catch (err: any) {
        if (err?.code === 'ENOENT' || err?.code === 'EACCES') continue;
        if (tryAudioFirst) {
          try {
            return await runTranscode(bin, false);
          } catch {}
        }
        break;
      }
    }

    return inputBuffer;
  } finally {
    try { if (fs.existsSync(tmpInPath)) fs.unlinkSync(tmpInPath); } catch {}
    try { if (fs.existsSync(tmpOutPath)) fs.unlinkSync(tmpOutPath); } catch {}
  }
}

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

    // Check raw request URL to avoid truncation by unencoded ampersands (anchored to ^, ?, or &)
    const rawReqUrl = req.url || '';
    const urlParamMatch = rawReqUrl.match(/(?:^|[?&])url=/);
    if (urlParamMatch && urlParamMatch.index !== undefined) {
      let extracted = rawReqUrl.slice(urlParamMatch.index + urlParamMatch[0].length);
      const nextParamMatch = extracted.match(/&(?:filename|platform|sourceUrl|title|artist|album|genre|year|cover|apiKey|server|inline|bitrate|duration|audioUrl|res|original|prepare|cb)=/);
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
    const sanitizedFilename = sanitizeFilename(rawFilename, 'DownloaderZero_Media.mp4');
    const platform = ((query.platform || req.query?.platform || '') as string).toLowerCase();
    const sourceUrl = (query.sourceUrl || req.query?.sourceUrl || '') as string;
    const isInline = query.inline === '1' || req.query?.inline === '1' || query.inline === 'true';
    const rangeHeader = typeof req.headers?.range === 'string' ? req.headers.range : undefined;

    if (!targetUrl || typeof targetUrl !== 'string' || !/^https?:\/\//i.test(targetUrl) || !isSafePublicUrl(targetUrl).safe) {
      res.status(400).json({ success: false, error: 'Target URL tidak valid atau diblokir.' });
      return;
    }

    if (sourceUrl && !isSafePublicUrl(sourceUrl).safe) {
      res.status(400).json({ success: false, error: 'Source URL tidak valid atau diblokir.' });
      return;
    }

    let audioUrl = ((query.audioUrl || req.query?.audioUrl || '') as string).trim();
    if (audioUrl && (audioUrl.startsWith('http%3A') || audioUrl.startsWith('https%3A'))) {
      try { audioUrl = decodeURIComponent(audioUrl); } catch {}
    }
    if (audioUrl && (!/^https?:\/\//i.test(audioUrl) || !isSafePublicUrl(audioUrl).safe)) {
      res.status(400).json({ success: false, error: 'Audio URL tidak valid atau diblokir.' });
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
          res.status(502).json({ success: false, error: 'Gagal menyelesaikan tautan lagu penuh Spotify dari server sumber.' });
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
        res.status(fetchedAudio.status || 502).json({ success: false, error: fetchedAudio.errMsg || 'Gagal mengunduh audio Spotify dari server sumber.' });
        return;
      }

      let rawAudioBuffer: Buffer = fetchedAudio.buffer;

      const targetSpotifyBitrate = normalizeTargetBitrate(query.bitrate || req.query?.bitrate, '320k');
      if (!isInline) {
        try {
          rawAudioBuffer = await ensureMp3TargetBitrate(rawAudioBuffer, targetSpotifyBitrate);
        } catch (encErr: any) {
          console.error('[api/proxy-download] Spotify MP3 bitrate transcode failed:', encErr?.message || encErr);
          res.status(502).json({ success: false, error: `Gagal mengonversi audio Spotify ke ${targetSpotifyBitrate} CBR.` });
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

    // Multi-Platform CDN Fetch Cascade (computed dynamically per candidate URL so retries get matching headers & cookies)
    const getPlatformRefererForUrl = (candidateUrl: string): string => {
      if (candidateUrl.includes('tikwm.com')) return 'https://www.tikwm.com/';
      if (candidateUrl.includes('tikcdn.io') || candidateUrl.includes('ssstik')) return 'https://ssstik.io/';
      if (candidateUrl.includes('tiktokcdn') || candidateUrl.includes('byteoversea') || candidateUrl.includes('ibyteimg')) return '';
      if (candidateUrl.includes('tiktok.com')) return 'https://www.tiktok.com/';
      if (platform === 'instagram' || candidateUrl.includes('instagram') || candidateUrl.includes('cdninstagram')) return 'https://www.instagram.com/';
      if (candidateUrl.includes('facebook') || candidateUrl.includes('fbcdn')) return 'https://www.facebook.com/';
      if (candidateUrl.includes('savetube')) return 'https://save-tube.com/';
      if (
        candidateUrl.includes('youtube') ||
        candidateUrl.includes('googlevideo') ||
        candidateUrl.includes('yt3.ggpht.com') ||
        candidateUrl.includes('yt4.ggpht.com') ||
        candidateUrl.includes('lh3.googleusercontent.com')
      ) {
        return 'https://www.youtube.com/';
      }
      if (candidateUrl.includes('pinterest') || candidateUrl.includes('pinimg')) return 'https://www.pinterest.com/';
      if (candidateUrl.includes('terabox') || candidateUrl.includes('1024tera') || candidateUrl.includes('4funbox')) return 'https://www.terabox.app/';
      if (candidateUrl.includes('snapcdn.app')) return 'https://dl.snapcdn.app/';
      if (candidateUrl.includes('twimg.com') || candidateUrl.includes('twitter.com') || candidateUrl.includes('x.com')) return 'https://x.com/';
      return '';
    };

    const buildFetchConfigsForUrl = (candidateUrl: string): Array<{ idx: number; headers: Record<string, string> }> => {
      const ref = getPlatformRefererForUrl(candidateUrl);
      const ttCookie = getTikTokCdnCookieForUrl(candidateUrl);
      const configs: Array<{ idx: number; headers: Record<string, string> }> = [];

      if (ttCookie) {
        configs.push({
          idx: 5,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': 'https://www.tiktok.com/',
            'Origin': 'https://www.tiktok.com',
            'Cookie': ttCookie
          }
        });
      }

      configs.push({
        idx: 0,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
          'Accept': '*/*',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });

      if (ref) {
        configs.push({
          idx: 1,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Referer': ref
          }
        });
      }

      configs.push({
        idx: 2,
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
          'Accept': '*/*',
          ...(ref ? { 'Referer': ref } : {})
        }
      });

      configs.push({
        idx: 3,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
          'Accept': '*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Sec-Fetch-Mode': 'no-cors'
        }
      });

      if (!ref && (candidateUrl.includes('tiktokcdn') || candidateUrl.includes('byteoversea') || candidateUrl.includes('ibyteimg'))) {
        configs.push({
          idx: 4,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Referer': 'https://www.tiktok.com/'
          }
        });
      }

      return configs;
    };

    const getHostKey = (u: string): string => {
      try {
        return new URL(u).hostname.toLowerCase();
      } catch {
        return '';
      }
    };

    const getOrderedFetchConfigs = (u: string) => {
      const candidateConfigs = buildFetchConfigsForUrl(u);
      const host = getHostKey(u);
      const preferredIdx = host ? winningStrategyByHost.get(host) : undefined;
      if (preferredIdx === undefined) return candidateConfigs;
      const preferred = candidateConfigs.find((c) => c.idx === preferredIdx);
      if (!preferred) return candidateConfigs;
      return [preferred, ...candidateConfigs.filter((c) => c.idx !== preferredIdx)];
    };

    const rememberWinningStrategy = (u: string, idx: number) => {
      const host = getHostKey(u);
      if (!host) return;
      if (winningStrategyByHost.size > 300) {
        const firstKey = winningStrategyByHost.keys().next().value;
        if (firstKey) winningStrategyByHost.delete(firstKey);
      }
      winningStrategyByHost.set(host, idx);
    };

    const fetchWithHeaderTimeout = async (
      target: string,
      headers: Record<string, string>,
      headerTimeoutMs = 9000,
      method: 'GET' | 'HEAD' = 'GET',
      externalSignal?: AbortSignal
    ) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), headerTimeoutMs);
      const onExternalAbort = () => controller.abort();
      if (externalSignal) {
        if (externalSignal.aborted) {
          clearTimeout(timer);
          controller.abort();
        } else {
          externalSignal.addEventListener('abort', onExternalAbort, { once: true });
        }
      }
      try {
        const upstreamRes = await fetch(target, {
          method,
          headers,
          redirect: 'follow',
          signal: controller.signal
        });
        clearTimeout(timer);
        if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
        return upstreamRes;
      } catch (err) {
        clearTimeout(timer);
        if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
        throw err;
      }
    };

    const wantsMp3OutputEarly = sanitizedFilename.toLowerCase().endsWith('.mp3');
    const rawResParam = String(query.res || req.query?.res || '').trim();
    const rawOriginalParam = String(query.original || req.query?.original || '').toLowerCase().trim();
    const isOriginalRequest =
      rawOriginalParam === '1' ||
      rawOriginalParam === 'true' ||
      rawResParam.toLowerCase() === 'original';
    const rawResHint = `${rawResParam} ${sanitizedFilename}`.toLowerCase();
    const isPrepareOnly = query.prepare === '1' || req.query?.prepare === '1' || query.prepare === 'true';

    const tryReResolveFreshUrl = async (failedUrl: string = targetUrl): Promise<{ url: string; dashAudioUrl?: string } | null> => {
      if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl)) return null;
      const isAcceptableFresh = (candidateUrl?: string): boolean => {
        if (!candidateUrl || !/^https?:\/\//i.test(candidateUrl)) return false;
        if (!isSafePublicUrl(candidateUrl).safe) return false;
        if (candidateUrl !== failedUrl) return true;
        return Boolean(getTikTokCdnCookieForUrl(candidateUrl));
      };

      try {
        console.log(`[api/proxy-download] Attempting on-the-fly re-resolution for ${platform || 'media'} (${sourceUrl})...`);
        const rawKey = query.apiKey || req.query?.apiKey;
        const reKey = typeof rawKey === 'string' && rawKey.trim() ? rawKey.trim() : undefined;
        const rawServer = query.server || req.query?.server;
        const reServer = rawServer === 'server1' || rawServer === 'server2' || rawServer === 'auto' ? rawServer : 'auto';
        const detected = platform || detectPlatform(sourceUrl);

        if (detected === 'tiktok') {
          const resTag = isOriginalRequest
            ? 'Original'
            : rawResHint.includes('4k') || rawResHint.includes('2160')
              ? '4K'
              : rawResHint.includes('2k') || rawResHint.includes('1440')
                ? '2K'
                : rawResHint.includes('720')
                  ? '720p'
                  : rawResHint.includes('480')
                    ? '480p'
                    : rawResHint.includes('360')
                      ? '360p'
                      : '1080p';
          const resolvedTt = await resolveTikTokDownload(
            sourceUrl,
            wantsMp3OutputEarly ? 'tt-audio' : (isOriginalRequest ? 'tt-original' : `tt-${resTag.toLowerCase()}`),
            resTag,
            wantsMp3OutputEarly ? 'audio' : 'video',
            reServer,
            reKey,
            { forceRefresh: true, failedUrl }
          );
          if (isAcceptableFresh(resolvedTt.downloadUrl)) {
            return { url: resolvedTt.downloadUrl };
          }
        }

        if (detected === 'facebook' && reServer !== 'server1') {
          try {
            const resolvedFb = await resolveFacebookServer2(
              sourceUrl,
              rawResParam || (wantsMp3OutputEarly ? '320 kbps' : '720p'),
              wantsMp3OutputEarly ? 'audio' : 'video'
            );
            if (isAcceptableFresh(resolvedFb.downloadUrl)) {
              const safeDashAudio = resolvedFb.dashAudioUrl && isSafePublicUrl(resolvedFb.dashAudioUrl).safe ? resolvedFb.dashAudioUrl : undefined;
              return { url: resolvedFb.downloadUrl, dashAudioUrl: safeDashAudio };
            }
          } catch {}
        }

        if (detected === 'instagram' && reServer !== 'server1') {
          try {
            const resolvedIg = await resolveInstagramServer2(
              sourceUrl,
              rawResParam || (wantsMp3OutputEarly ? '320 kbps' : '1080p'),
              wantsMp3OutputEarly ? 'audio' : 'video'
            );
            if (isAcceptableFresh(resolvedIg.downloadUrl)) {
              const safeDashAudio = resolvedIg.dashAudioUrl && isSafePublicUrl(resolvedIg.dashAudioUrl).safe ? resolvedIg.dashAudioUrl : undefined;
              return { url: resolvedIg.downloadUrl, dashAudioUrl: safeDashAudio };
            }
          } catch {}
        }

        if (detected === 'pinterest' && reServer !== 'server1') {
          try {
            const resolvedPin = await resolvePinterestServer2(
              sourceUrl,
              rawResParam || (wantsMp3OutputEarly ? '320 kbps' : '720p'),
              wantsMp3OutputEarly ? 'audio' : 'video'
            );
            if (isAcceptableFresh(resolvedPin.downloadUrl)) {
              const safeDashAudio = resolvedPin.dashAudioUrl && isSafePublicUrl(resolvedPin.dashAudioUrl).safe ? resolvedPin.dashAudioUrl : undefined;
              return { url: resolvedPin.downloadUrl, dashAudioUrl: safeDashAudio };
            }
          } catch {}
        }

        if (detected === 'youtube' && reServer !== 'server1') {
          try {
            const resolvedYt = await resolveYouTubeServer2(
              sourceUrl,
              '',
              rawResParam || (wantsMp3OutputEarly ? '320 kbps' : '1080p'),
              wantsMp3OutputEarly ? 'audio' : 'video',
              { forceRefresh: true, excludeCdnHost: getHostKey(failedUrl) }
            );
            if (isAcceptableFresh(resolvedYt.downloadUrl)) {
              return { url: resolvedYt.downloadUrl };
            }
          } catch {}
        }

        const tryModes: Array<'server1' | 'server2' | 'auto'> =
          reServer === 'auto'
            ? (failedUrl.includes('neoxr') ? ['server2', 'server1'] : ['server1', 'server2'])
            : [reServer];

        for (const mode of tryModes) {
          try {
            const freshMedia = await extractMedia(sourceUrl, reKey, mode);
            if (freshMedia?.formats?.length) {
              const wantType = wantsMp3OutputEarly ? 'audio' : (sanitizedFilename.match(/\.(jpg|jpeg|png)$/i) ? 'photos' : 'video');
              const candidates = freshMedia.formats.filter((f) => isAcceptableFresh(f.url));
              const matchedFormat =
                (rawResParam && candidates.find((f) => f.type === wantType && f.resolution?.toLowerCase() === rawResParam.toLowerCase())) ||
                candidates.find((f) => f.type === wantType && f.isDirect) ||
                candidates.find((f) => f.type === wantType) ||
                candidates.find((f) => f.isDirect) ||
                candidates[0];
              if (matchedFormat?.url && isAcceptableFresh(matchedFormat.url)) {
                const safeDashAudio = matchedFormat.dashAudioUrl && isSafePublicUrl(matchedFormat.dashAudioUrl).safe ? matchedFormat.dashAudioUrl : undefined;
                return { url: matchedFormat.url, dashAudioUrl: safeDashAudio };
              }
            }
          } catch {}
        }
      } catch (reErr) {
        console.warn('[api/proxy-download] On-the-fly re-resolution notice:', reErr);
      }
      return null;
    };

    const isCmfvVideo = /\.cmfv(\?|$)/i.test(targetUrl);
    if ((audioUrl || isCmfvVideo) && !wantsMp3OutputEarly) {
      const muxKey = `${targetUrl}::${audioUrl || 'silent'}::orig`;
      let muxedMp4: Buffer | null = dashMuxCache.get(muxKey)?.buffer || null;

      if (!muxedMp4) {
        let pendingMux = inFlightDashMux.get(muxKey);
        if (!pendingMux) {
          pendingMux = (async () => {
            const fetchFullStreamBuffer = async (streamUrl: string): Promise<Buffer> => {
              for (const cfg of getOrderedFetchConfigs(streamUrl)) {
                try {
                  const candidate = await fetchWithHeaderTimeout(streamUrl, { ...cfg.headers }, 15000);
                  if (candidate.ok && candidate.body) {
                    const buf = Buffer.from(await candidate.arrayBuffer());
                    if (buf.length > 200) {
                      const headStr = buf.subarray(0, 64).toString('utf8').trim();
                      if (!headStr.startsWith('<!DOCTYPE') && !headStr.startsWith('<html') && !headStr.startsWith('{"error')) {
                        rememberWinningStrategy(streamUrl, cfg.idx);
                        return buf;
                      }
                    }
                  } else {
                    try { await candidate.body?.cancel(); } catch {}
                  }
                } catch {}
              }
              throw new Error('Gagal mengunduh stream media sumber untuk penggabungan resolusi.');
            };

            let vidBuf: Buffer;
            let audBuf: Buffer | null;
            try {
              [vidBuf, audBuf] = await Promise.all([
                fetchFullStreamBuffer(targetUrl),
                audioUrl ? fetchFullStreamBuffer(audioUrl) : Promise.resolve(null)
              ]);
            } catch (firstMuxErr) {
              const refreshed = await tryReResolveFreshUrl(targetUrl);
              if (!refreshed?.url) throw firstMuxErr;
              targetUrl = refreshed.url;
              if (refreshed.dashAudioUrl) audioUrl = refreshed.dashAudioUrl;
              [vidBuf, audBuf] = await Promise.all([
                fetchFullStreamBuffer(targetUrl),
                audioUrl ? fetchFullStreamBuffer(audioUrl) : Promise.resolve(null)
              ]);
            }

            const resultBuf = await muxVideoAndAudioToMp4(vidBuf, audBuf);
            dashMuxCache.set(muxKey, { buffer: resultBuf, timestamp: Date.now() });
            setTimeout(() => {
              dashMuxCache.delete(muxKey);
            }, 180000);
            return resultBuf;
          })().finally(() => {
            inFlightDashMux.delete(muxKey);
          });
          inFlightDashMux.set(muxKey, pendingMux);
        }
        muxedMp4 = await pendingMux;
      }

      if (isPrepareOnly) {
        res.setHeader('Cache-Control', 'no-store');
        res.json({
          success: true,
          ready: true,
          size: muxedMp4.length,
          resolution: rawResParam || undefined,
          original: true
        });
        return;
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

    // Stream native MP4 directly via high-speed zero-copy HTTP Range pass-through without slow CPU re-encoding
    void [parseTargetShortSide, ensureMp4TargetResolution, videoNormalizeCache];

    // Fast non-destructive Original prepare probe (HEAD + lightweight Range: bytes=0-1023 fallback)
    if (isPrepareOnly && !wantsMp3OutputEarly) {
      const probeOriginalStream = async (candidateTarget: string): Promise<{ ok: boolean; size?: number }> => {
        for (const cfg of getOrderedFetchConfigs(candidateTarget)) {
          try {
            const headRes = await fetchWithHeaderTimeout(candidateTarget, { ...cfg.headers }, 5000, 'HEAD');
            if (headRes.ok) {
              const ct = (headRes.headers.get('content-type') || '').toLowerCase();
              if (!ct.includes('text/html') && !ct.includes('application/json')) {
                const cl = Number(headRes.headers.get('content-length') || 0);
                if (Number.isFinite(cl) && cl > 1024) {
                  rememberWinningStrategy(candidateTarget, cfg.idx);
                  return { ok: true, size: cl };
                }
              }
            }
          } catch {}
        }

        for (const cfg of getOrderedFetchConfigs(candidateTarget)) {
          try {
            const rangeRes = await fetchWithHeaderTimeout(
              candidateTarget,
              { ...cfg.headers, Range: 'bytes=0-1023' },
              6000,
              'GET'
            );
            if (rangeRes.ok && rangeRes.body) {
              const ct = (rangeRes.headers.get('content-type') || '').toLowerCase();
              if (ct.includes('text/html')) {
                try { await rangeRes.body.cancel(); } catch {}
                continue;
              }
              const sampleChunk = Buffer.from(await rangeRes.arrayBuffer());
              const headText = sampleChunk.subarray(0, 512).toString('utf8').trim();
              const looksLikeErr =
                headText.startsWith('<!DOCTYPE') ||
                headText.startsWith('<!doctype') ||
                headText.startsWith('<html') ||
                headText.startsWith('{"docs_url"') ||
                headText.startsWith('{"error_code"') ||
                headText.startsWith('{"success":false');
              if (looksLikeErr) {
                continue;
              }
              rememberWinningStrategy(candidateTarget, cfg.idx);
              let totalSize = 0;
              const cr = rangeRes.headers.get('content-range') || '';
              const crMatch = cr.match(/bytes\s+\d+-\d+\/(\d+)/i);
              if (crMatch?.[1]) {
                totalSize = Number(crMatch[1]) || 0;
              } else if (rangeRes.status === 200) {
                const cl = Number(rangeRes.headers.get('content-length') || 0);
                totalSize = Number.isFinite(cl) && cl > 1024 ? cl : 0;
              }
              return { ok: true, size: totalSize > 0 ? totalSize : undefined };
            } else {
              try { await rangeRes.body?.cancel(); } catch {}
            }
          } catch {}
        }
        return { ok: false };
      };

      let probeResult = await probeOriginalStream(targetUrl);
      if (!probeResult.ok && sourceUrl && /^https?:\/\//i.test(sourceUrl)) {
        const fresh = await tryReResolveFreshUrl(targetUrl);
        const hasCookie = Boolean(fresh?.url && getTikTokCdnCookieForUrl(fresh.url));
        if (fresh?.url && (fresh.url !== targetUrl || hasCookie)) {
          targetUrl = fresh.url;
          probeResult = await probeOriginalStream(targetUrl);
        }
      }

      if (!probeResult.ok) {
        res.status(502).json({ success: false, error: 'Gagal memverifikasi tautan media dari server sumber.' });
        return;
      }

      res.setHeader('Cache-Control', 'no-store');
      res.json({
        success: true,
        ready: true,
        size: probeResult.size,
        resolution: rawResParam || undefined,
        original: true
      });
      return;
    }

    const streamAbortController = new AbortController();
    let clientAborted = false;
    let activeReader: ReadableStreamDefaultReader<Uint8Array> | null = null;

    res.on?.('close', () => {
      const finished = Boolean(res.writableFinished || res.writableEnded);
      const hasEndFlags =
        typeof res.writableFinished === 'boolean' ||
        typeof res.writableEnded === 'boolean';
      if (!finished && (hasEndFlags || res.destroyed || req?.destroyed)) {
        clientAborted = true;
        streamAbortController.abort();
        try {
          void activeReader?.cancel();
        } catch {}
      }
    });

    let remoteRes: globalThis.Response | null = null;
    let lastStatus = 0;
    let lastErrMsg = '';

    const tryFetchUpstream = async (candidateTarget: string): Promise<globalThis.Response | null> => {
      const orderedConfigs = getOrderedFetchConfigs(candidateTarget);
      let consecutiveNetworkErrors = 0;

      for (let attemptIdx = 0; attemptIdx < orderedConfigs.length; attemptIdx++) {
        const cfg = orderedConfigs[attemptIdx];
        if (clientAborted) return null;
        try {
          const reqHeaders: Record<string, string> = { ...cfg.headers };
          if (rangeHeader && !wantsMp3OutputEarly) {
            reqHeaders['Range'] = rangeHeader;
          }
          const timeoutMs = attemptIdx === 0 ? 15000 : 8000;
          const resCandidate = await fetchWithHeaderTimeout(
            candidateTarget,
            reqHeaders,
            timeoutMs,
            'GET',
            streamAbortController.signal
          );
          consecutiveNetworkErrors = 0;
          const candidateCt = (resCandidate.headers.get('content-type') || '').toLowerCase();
          if (resCandidate.ok && resCandidate.body && !candidateCt.includes('text/html')) {
            rememberWinningStrategy(candidateTarget, cfg.idx);
            return resCandidate;
          }
          lastStatus = candidateCt.includes('text/html') ? 502 : resCandidate.status;
          lastErrMsg = `HTTP ${resCandidate.status} (${candidateCt || 'unknown'})`;
          try { await resCandidate.body?.cancel(); } catch {}
        } catch (e: any) {
          if (clientAborted) return null;
          consecutiveNetworkErrors += 1;
          lastErrMsg = e?.message || String(e);
          console.warn('[api/proxy-download] Candidate fetch notice:', lastErrMsg);
          if (consecutiveNetworkErrors >= 2) {
            break;
          }
        }
      }
      return null;
    };

    const isInvalidMediaPayload = (chunk: Uint8Array, ctHeader: string): boolean => {
      if (ctHeader.toLowerCase().includes('text/html')) return true;
      const sampleText = Buffer.from(chunk.subarray(0, 512))
        .toString('utf-8')
        .replace(/^\uFEFF/, '')
        .trim();
      const isHtmlDoc =
        /^<!doctype\s+html/i.test(sampleText) ||
        /^<html[\s>]/i.test(sampleText) ||
        /^<head[\s>]/i.test(sampleText) ||
        /^<script[\s>]/i.test(sampleText) ||
        /^<!--/.test(sampleText) ||
        sampleText.includes('<title>Error') ||
        sampleText.includes('Attention Required! | Cloudflare');
      const isJsonError =
        sampleText.startsWith('{"docs_url"') ||
        sampleText.startsWith('{"error_code"') ||
        sampleText.startsWith('{"success":false') ||
        (sampleText.startsWith('{') && sampleText.includes('"status":false'));
      return isHtmlDoc || isJsonError;
    };

    remoteRes = await tryFetchUpstream(targetUrl);

    // If CDN link expired or returned 403/404/410/timeout/text/html, attempt on-the-fly re-resolution
    if ((!remoteRes || !remoteRes.ok) && !clientAborted && sourceUrl && /^https?:\/\//i.test(sourceUrl)) {
      const freshTarget = await tryReResolveFreshUrl(targetUrl);
      const hasFreshCookie = Boolean(freshTarget?.url && getTikTokCdnCookieForUrl(freshTarget.url));
      if (freshTarget?.url && freshTarget.url.startsWith('http') && (freshTarget.url !== targetUrl || hasFreshCookie)) {
        targetUrl = freshTarget.url;
        remoteRes = await tryFetchUpstream(targetUrl);
      }
    }

    if (clientAborted) {
      return;
    }

    if (!remoteRes || !remoteRes.ok || !remoteRes.body) {
      console.warn(`[api/proxy-download] Upstream exhausted for host=${getHostKey(targetUrl)} status=${lastStatus} err=${lastErrMsg}`);
      res.status(lastStatus || 502).json({ success: false, error: 'Gagal mengunduh berkas dari tautan sumber.' });
      return;
    }

    let reader = remoteRes.body.getReader();
    activeReader = reader;
    let { done: initialDone, value: firstChunk } = await reader.read();

    if (clientAborted) {
      try { await reader.cancel(); } catch {}
      return;
    }

    if (initialDone || !firstChunk || firstChunk.length === 0) {
      res.status(502).json({ success: false, error: 'Berkas kosong dari server sumber.' });
      return;
    }

    // Check first chunk for text/html or JSON error signatures; re-resolve once if needed
    if (isInvalidMediaPayload(firstChunk, remoteRes.headers.get('content-type') || '')) {
      try { await reader.cancel(); } catch {}
      let recovered = false;
      if (!clientAborted && sourceUrl && /^https?:\/\//i.test(sourceUrl)) {
        const freshTarget = await tryReResolveFreshUrl(targetUrl);
        const hasFreshCookie = Boolean(freshTarget?.url && getTikTokCdnCookieForUrl(freshTarget.url));
        if (freshTarget?.url && freshTarget.url.startsWith('http') && (freshTarget.url !== targetUrl || hasFreshCookie)) {
          targetUrl = freshTarget.url;
          const retryRes = await tryFetchUpstream(targetUrl);
          if (retryRes && retryRes.ok && retryRes.body) {
            const retryReader = retryRes.body.getReader();
            activeReader = retryReader;
            const retryFirst = await retryReader.read();
            if (!retryFirst.done && retryFirst.value && retryFirst.value.length > 0 && !isInvalidMediaPayload(retryFirst.value, retryRes.headers.get('content-type') || '')) {
              remoteRes = retryRes;
              reader = retryReader;
              firstChunk = retryFirst.value;
              recovered = true;
            } else {
              try { await retryReader.cancel(); } catch {}
            }
          }
        }
      }
      if (!recovered) {
        console.warn('[api/proxy-download] Upstream served HTML/JSON error text instead of binary media.');
        res.status(502).json({
          success: false,
          error: 'Tautan unduhan tidak menghasilkan berkas media yang valid dari server sumber.'
        });
        return;
      }
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

    const rawUpstreamLen = remoteRes.headers.get('content-length');
    const contentEncoding = remoteRes.headers.get('content-encoding');
    const upstreamLenNum = rawUpstreamLen && !contentEncoding && !isNaN(Number(rawUpstreamLen)) ? Number(rawUpstreamLen) : 0;

    let skipBytesRemaining = 0;
    let limitOutputBytes: number | null = null;
    const requestedRangeMatch = rangeHeader ? /bytes=(\d*)-(\d*)/.exec(rangeHeader) : null;

    if (remoteRes.status === 206) {
      res.status(206);
      const contentRange = remoteRes.headers.get('content-range');
      if (contentRange) {
        res.setHeader('Content-Range', contentRange);
      }
      if (upstreamLenNum > 0) {
        res.setHeader('Content-Length', String(upstreamLenNum));
      }
    } else if (requestedRangeMatch && upstreamLenNum > 0) {
      const reqStart = requestedRangeMatch[1] ? parseInt(requestedRangeMatch[1], 10) : 0;
      const reqEnd = requestedRangeMatch[2] ? Math.min(parseInt(requestedRangeMatch[2], 10), upstreamLenNum - 1) : upstreamLenNum - 1;
      if (!isNaN(reqStart) && !isNaN(reqEnd) && reqStart <= reqEnd && reqStart < upstreamLenNum) {
        skipBytesRemaining = reqStart;
        limitOutputBytes = reqEnd - reqStart + 1;
        res.status(206);
        res.setHeader('Content-Range', `bytes ${reqStart}-${reqEnd}/${upstreamLenNum}`);
        res.setHeader('Content-Length', String(limitOutputBytes));
      } else {
        res.setHeader('Content-Length', String(upstreamLenNum));
      }
    } else if (upstreamLenNum > 0) {
      res.setHeader('Content-Length', String(upstreamLenNum));
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
    res.setHeader('Cache-Control', isInline ? 'private, max-age=300, no-transform' : 'no-store, no-cache, must-revalidate, private, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.flushHeaders?.();

    const waitForDrain = () =>
      new Promise<void>((resolve) => {
        if (clientAborted || res.destroyed || res.writableEnded) {
          resolve();
          return;
        }
        const cleanup = () => {
          res.off?.('drain', onDone);
          res.off?.('close', onDone);
        };
        const onDone = () => {
          cleanup();
          resolve();
        };
        res.once?.('drain', onDone);
        res.once?.('close', onDone);
      });

    const writeStreamSlice = async (chunk: Uint8Array): Promise<boolean> => {
      if (clientAborted || res.destroyed || res.writableEnded) return false;
      let slice = chunk;
      if (skipBytesRemaining > 0) {
        if (slice.byteLength <= skipBytesRemaining) {
          skipBytesRemaining -= slice.byteLength;
          return true;
        }
        slice = slice.subarray(skipBytesRemaining);
        skipBytesRemaining = 0;
      }
      if (limitOutputBytes !== null) {
        if (limitOutputBytes <= 0) return false;
        if (slice.byteLength > limitOutputBytes) {
          slice = slice.subarray(0, limitOutputBytes);
        }
        limitOutputBytes -= slice.byteLength;
      }
      if (slice.byteLength > 0) {
        const ok = res.write(slice);
        if (!ok) {
          await waitForDrain();
        }
      }
      return limitOutputBytes === null || limitOutputBytes > 0;
    };

    const keepReading = await writeStreamSlice(firstChunk);
    if (keepReading && !clientAborted) {
      while (true) {
        const { done, value } = await reader.read();
        if (done || clientAborted || res.destroyed || res.writableEnded) break;
        if (value && !(await writeStreamSlice(value))) {
          try { await reader.cancel(); } catch {}
          break;
        }
      }
    } else {
      try { await reader.cancel(); } catch {}
    }

    if (!res.writableEnded && !res.destroyed) {
      res.end();
    }
  } catch (err: any) {
    if (err?.name === 'AbortError') return;
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: `Download gagal: ${err.message}` });
    }
  }
}
