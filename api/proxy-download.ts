import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import NodeID3 from 'node-id3';
import ffmpegStaticPath from 'ffmpeg-static';
import { extractMedia, detectPlatform, resolveTikTokDownload, resolveYouTubeServer2, resolveSpotifyFullAudioServer2, resolveInstagramServer2, resolvePinterestServer2, resolveFacebookServer2 } from './_utils/scraper.ts';
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
// Short-lived cache for target-resolution normalized MP4 streams
const videoNormalizeCache = new Map<string, { buffer: Buffer; timestamp: number }>();

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

    // Check raw request URL to avoid truncation by unencoded ampersands
    const rawReqUrl = req.url || '';
    const urlParamIdx = rawReqUrl.indexOf('url=');
    if (urlParamIdx !== -1) {
      let extracted = rawReqUrl.slice(urlParamIdx + 4);
      const nextParamMatch = extracted.match(/&(?:filename|platform|sourceUrl|title|artist|album|genre|year|cover|apiKey|server|inline|bitrate|duration|audioUrl|res|original|prepare)=/);
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
      res.status(400).send('Target URL tidak valid atau diblokir.');
      return;
    }

    if (sourceUrl && !isSafePublicUrl(sourceUrl).safe) {
      res.status(400).send('Source URL tidak valid atau diblokir.');
      return;
    }

    let audioUrl = ((query.audioUrl || req.query?.audioUrl || '') as string).trim();
    if (audioUrl && (audioUrl.startsWith('http%3A') || audioUrl.startsWith('https%3A'))) {
      try { audioUrl = decodeURIComponent(audioUrl); } catch {}
    }
    if (audioUrl && (!/^https?:\/\//i.test(audioUrl) || !isSafePublicUrl(audioUrl).safe)) {
      res.status(400).send('Audio URL tidak valid atau diblokir.');
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

    const fetchWithHeaderTimeout = async (
      target: string,
      headers: Record<string, string>,
      headerTimeoutMs = 15000,
      method: 'GET' | 'HEAD' = 'GET'
    ) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), headerTimeoutMs);
      try {
        const res = await fetch(target, {
          method,
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
    const rawResParam = String(query.res || req.query?.res || '').trim();
    const rawOriginalParam = String(query.original || req.query?.original || '').toLowerCase().trim();
    const isOriginalRequest =
      rawOriginalParam === '1' ||
      rawOriginalParam === 'true' ||
      rawResParam.toLowerCase() === 'original';
    const rawResHint = `${rawResParam} ${sanitizedFilename}`.toLowerCase();
    const isPrepareOnly = query.prepare === '1' || req.query?.prepare === '1' || query.prepare === 'true';

    const tryReResolveFreshUrl = async (): Promise<{ url: string; dashAudioUrl?: string } | null> => {
      if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl)) return null;
      try {
        console.log(`[api/proxy-download] Attempting on-the-fly re-resolution for ${platform || 'media'} (${sourceUrl})...`);
        const reKey = typeof query.apiKey === 'string' && query.apiKey.trim() ? query.apiKey.trim() : undefined;
        const reServer = query.server === 'server1' || query.server === 'server2' || query.server === 'auto' ? query.server : 'auto';
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
            reKey
          );
          if (resolvedTt.downloadUrl?.startsWith('http') && isSafePublicUrl(resolvedTt.downloadUrl).safe) {
            return { url: resolvedTt.downloadUrl };
          }
        }

        if (detected === 'facebook' && reServer !== 'server1') {
          const resolvedFb = await resolveFacebookServer2(
            sourceUrl,
            rawResParam || (wantsMp3OutputEarly ? '320 kbps' : '720p'),
            wantsMp3OutputEarly ? 'audio' : 'video'
          );
          if (resolvedFb.downloadUrl?.startsWith('http') && isSafePublicUrl(resolvedFb.downloadUrl).safe) {
            const safeDashAudio = resolvedFb.dashAudioUrl && isSafePublicUrl(resolvedFb.dashAudioUrl).safe ? resolvedFb.dashAudioUrl : undefined;
            return { url: resolvedFb.downloadUrl, dashAudioUrl: safeDashAudio };
          }
        }

        if (detected === 'instagram' && reServer !== 'server1') {
          const resolvedIg = await resolveInstagramServer2(
            sourceUrl,
            rawResParam || (wantsMp3OutputEarly ? '320 kbps' : '1080p'),
            wantsMp3OutputEarly ? 'audio' : 'video'
          );
          if (resolvedIg.downloadUrl?.startsWith('http') && isSafePublicUrl(resolvedIg.downloadUrl).safe) {
            const safeDashAudio = resolvedIg.dashAudioUrl && isSafePublicUrl(resolvedIg.dashAudioUrl).safe ? resolvedIg.dashAudioUrl : undefined;
            return { url: resolvedIg.downloadUrl, dashAudioUrl: safeDashAudio };
          }
        }

        if (detected === 'pinterest' && reServer !== 'server1') {
          const resolvedPin = await resolvePinterestServer2(
            sourceUrl,
            rawResParam || (wantsMp3OutputEarly ? '320 kbps' : '720p'),
            wantsMp3OutputEarly ? 'audio' : 'video'
          );
          if (resolvedPin.downloadUrl?.startsWith('http') && isSafePublicUrl(resolvedPin.downloadUrl).safe) {
            const safeDashAudio = resolvedPin.dashAudioUrl && isSafePublicUrl(resolvedPin.dashAudioUrl).safe ? resolvedPin.dashAudioUrl : undefined;
            return { url: resolvedPin.downloadUrl, dashAudioUrl: safeDashAudio };
          }
        }

        if (detected === 'youtube' && reServer !== 'server1') {
          const resolvedYt = await resolveYouTubeServer2(
            sourceUrl,
            '',
            rawResParam || (wantsMp3OutputEarly ? '320 kbps' : '1080p'),
            wantsMp3OutputEarly ? 'audio' : 'video'
          );
          if (resolvedYt.downloadUrl?.startsWith('http') && isSafePublicUrl(resolvedYt.downloadUrl).safe) {
            return { url: resolvedYt.downloadUrl };
          }
        }

        const freshMedia = await extractMedia(sourceUrl, reKey, reServer);
        if (freshMedia?.formats?.length) {
          const matchedFormat =
            (rawResParam && freshMedia.formats.find((f) => f.url?.startsWith('http') && f.resolution?.toLowerCase() === rawResParam.toLowerCase())) ||
            freshMedia.formats.find((f) => f.isDirect && f.url && f.url.startsWith('http')) ||
            freshMedia.formats[0];
          if (matchedFormat?.url?.startsWith('http') && isSafePublicUrl(matchedFormat.url).safe) {
            const safeDashAudio = matchedFormat.dashAudioUrl && isSafePublicUrl(matchedFormat.dashAudioUrl).safe ? matchedFormat.dashAudioUrl : undefined;
            return { url: matchedFormat.url, dashAudioUrl: safeDashAudio };
          }
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

        let vidBuf: Buffer;
        let audBuf: Buffer | null;
        try {
          [vidBuf, audBuf] = await Promise.all([
            fetchFullStreamBuffer(targetUrl),
            audioUrl ? fetchFullStreamBuffer(audioUrl) : Promise.resolve(null)
          ]);
        } catch (firstMuxErr) {
          const refreshed = await tryReResolveFreshUrl();
          if (!refreshed?.url) throw firstMuxErr;
          targetUrl = refreshed.url;
          if (refreshed.dashAudioUrl) audioUrl = refreshed.dashAudioUrl;
          [vidBuf, audBuf] = await Promise.all([
            fetchFullStreamBuffer(targetUrl),
            audioUrl ? fetchFullStreamBuffer(audioUrl) : Promise.resolve(null)
          ]);
        }

        muxedMp4 = await muxVideoAndAudioToMp4(vidBuf, audBuf);
        dashMuxCache.set(muxKey, { buffer: muxedMp4, timestamp: Date.now() });
        setTimeout(() => {
          dashMuxCache.delete(muxKey);
        }, 180000);
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

    // Enforce exact requested target resolution for single-stream platforms (TikTok) ONLY when NOT Original
    const targetShortSide = !isOriginalRequest && !wantsMp3OutputEarly && platform === 'tiktok'
      ? parseTargetShortSide(rawResParam)
      : null;

    if (targetShortSide !== null) {
      const normCacheKey = `${targetUrl}::${targetShortSide}`;
      let normalizedMp4: Buffer | null = videoNormalizeCache.get(normCacheKey)?.buffer || null;

      if (!normalizedMp4) {
        const fetchFullVideoBuffer = async (streamUrl: string): Promise<Buffer> => {
          for (const cfg of fetchCandidateConfigs) {
            try {
              const candidate = await fetchWithHeaderTimeout(streamUrl, { ...cfg.headers }, 20000);
              if (candidate.ok && candidate.body) {
                const buf = Buffer.from(await candidate.arrayBuffer());
                if (buf.length > 1024) {
                  const headStr = buf.subarray(0, 64).toString('utf8').trim();
                  if (!headStr.startsWith('<!DOCTYPE') && !headStr.startsWith('<html') && !headStr.startsWith('{"error')) {
                    return buf;
                  }
                }
              }
            } catch {}
          }
          throw new Error('Gagal mengunduh stream video dari server sumber.');
        };

        let rawVidBuf: Buffer;
        try {
          rawVidBuf = await fetchFullVideoBuffer(targetUrl);
        } catch (firstVidErr) {
          const refreshed = await tryReResolveFreshUrl();
          if (!refreshed?.url) throw firstVidErr;
          targetUrl = refreshed.url;
          rawVidBuf = await fetchFullVideoBuffer(targetUrl);
        }

        normalizedMp4 = await ensureMp4TargetResolution(rawVidBuf, targetShortSide);
        videoNormalizeCache.set(normCacheKey, { buffer: normalizedMp4, timestamp: Date.now() });
        setTimeout(() => {
          videoNormalizeCache.delete(normCacheKey);
        }, 180000);
      }

      if (isPrepareOnly) {
        res.setHeader('Cache-Control', 'no-store');
        res.json({
          success: true,
          ready: true,
          size: normalizedMp4.length,
          resolution: `${targetShortSide}p`,
          original: false
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
      res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Length, Content-Type, Content-Range, Accept-Ranges, X-Video-Resolution');
      res.setHeader('Cache-Control', isInline ? 'private, max-age=300' : 'no-store, no-cache, must-revalidate, private');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Video-Resolution', `${targetShortSide}p`);

      if (rangeHeader) {
        const totalLen = normalizedMp4.length;
        const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
        if (match) {
          const start = match[1] ? parseInt(match[1], 10) : 0;
          const end = match[2] ? Math.min(parseInt(match[2], 10), totalLen - 1) : totalLen - 1;
          if (!isNaN(start) && !isNaN(end) && start <= end && start < totalLen) {
            const sliced = normalizedMp4.subarray(start, end + 1);
            res.status(206);
            res.setHeader('Content-Range', `bytes ${start}-${end}/${totalLen}`);
            res.setHeader('Content-Length', sliced.length);
            res.send(sliced);
            return;
          }
        }
      }

      res.setHeader('Content-Length', normalizedMp4.length);
      res.send(normalizedMp4);
      return;
    }

    // Fast non-destructive Original prepare probe (HEAD + lightweight Range: bytes=0-1023 fallback)
    if (isPrepareOnly && !wantsMp3OutputEarly) {
      const probeOriginalStream = async (candidateTarget: string): Promise<{ ok: boolean; size?: number }> => {
        for (const cfg of fetchCandidateConfigs) {
          try {
            const headRes = await fetchWithHeaderTimeout(candidateTarget, { ...cfg.headers }, 7000, 'HEAD');
            if (headRes.ok) {
              const ct = (headRes.headers.get('content-type') || '').toLowerCase();
              if (!ct.includes('text/html') && !ct.includes('application/json')) {
                const cl = Number(headRes.headers.get('content-length') || 0);
                if (Number.isFinite(cl) && cl > 1024) {
                  return { ok: true, size: cl };
                }
              }
            }
          } catch {}
        }

        for (const cfg of fetchCandidateConfigs) {
          try {
            const rangeRes = await fetchWithHeaderTimeout(
              candidateTarget,
              { ...cfg.headers, Range: 'bytes=0-1023' },
              9000,
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
            }
          } catch {}
        }
        return { ok: false };
      };

      let probeResult = await probeOriginalStream(targetUrl);
      if (!probeResult.ok && sourceUrl && /^https?:\/\//i.test(sourceUrl)) {
        const fresh = await tryReResolveFreshUrl();
        if (fresh?.url && fresh.url !== targetUrl) {
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

    // If CDN link expired or returned 403/404/410, attempt on-the-fly re-resolution
    if ((!remoteRes || !remoteRes.ok) && sourceUrl && /^https?:\/\//i.test(sourceUrl)) {
      const freshTarget = await tryReResolveFreshUrl();
      if (freshTarget?.url && freshTarget.url !== targetUrl && freshTarget.url.startsWith('http')) {
        targetUrl = freshTarget.url;
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
