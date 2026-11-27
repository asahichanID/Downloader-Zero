import 'dotenv/config';
import fs from 'fs';
import os from 'os';
import { spawn } from 'child_process';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import NodeID3 from 'node-id3';
import ffmpegStaticPath from 'ffmpeg-static';
import { extractMedia, detectPlatform, resolveTikTokDownload, resolveYouTubeServer2, resolveSpotifyFullAudioServer2, resolveInstagramServer2, resolvePinterestServer2, resolveFacebookServer2, checkNeoxrApiKeyStatus } from './src/services/scraper.ts';
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

// Support CLI flags (--port 3000, --port=3000, --host 0.0.0.0, --host=0.0.0.0) or default to 3000 for AI Studio environment
const cliArgs = process.argv.slice(2);
let cliPort: number | null = null;
let cliHost: string | null = null;
for (let i = 0; i < cliArgs.length; i++) {
  const arg = cliArgs[i];
  if (arg === '--port' && cliArgs[i + 1]) {
    cliPort = parseInt(cliArgs[i + 1], 10);
  } else if (arg.startsWith('--port=')) {
    cliPort = parseInt(arg.split('=')[1], 10);
  }
  if (arg === '--host' && cliArgs[i + 1]) {
    cliHost = cliArgs[i + 1];
  } else if (arg.startsWith('--host=')) {
    cliHost = arg.split('=')[1];
  }
}
const HOST = cliHost || (process.env.HOST ? process.env.HOST : '0.0.0.0');
const PORT = cliPort || 3000;

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
  // Short-lived cache for ffmpeg-extracted MP3 audio (preview -> download instant reuse)
  const mp3TranscodeCache = new Map<string, { buffer: Buffer; timestamp: number }>();
  // Short-lived cache for DASH video+audio muxed MP4 streams (preview -> download instant reuse)
  const dashMuxCache = new Map<string, { buffer: Buffer; timestamp: number }>();
  const inFlightDashMux = new Map<string, Promise<Buffer>>();
  // Short-lived cache for target-resolution normalized MP4 streams (preview/prepare -> download reuse)
  const videoNormalizeCache = new Map<string, { buffer: Buffer; timestamp: number }>();
  // Per-host winning header strategy index so Range requests connect on the 1st try
  const winningStrategyByHost = new Map<string, number>();
  // Short-lived cache & in-flight deduplication for adapted horizontal animated banners
  const bannerAdaptCache = new Map<string, { buffer: Buffer; timestamp: number }>();
  const inFlightBannerAdapt = new Map<string, Promise<Buffer>>();

  const ALLOWED_MP3_BITRATES = new Set(['320k', '256k', '192k', '128k', '64k']);
  const normalizeTargetBitrate = (raw: unknown, fallback = '192k'): string => {
    const cleaned = String(raw || fallback).toLowerCase().trim();
    const withSuffix = /^\d+$/.test(cleaned) ? `${cleaned}k` : cleaned;
    return ALLOWED_MP3_BITRATES.has(withSuffix) ? withSuffix : fallback;
  };

  const getFfmpegCandidates = (): string[] => {
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
  };

  // Probes input audio buffer via ffmpeg and encodes genuine CBR MP3 at requested bitrate (e.g. 320k CBR)
  // so Android/desktop music players display exact bitrate badge (320kbps) & filesize.
  const ensureMp3TargetBitrate = async (inputBuffer: Buffer, targetBitrate: string): Promise<Buffer> => {
    const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const tmpInPath = path.join(os.tmpdir(), `dz_in_${uid}.media`);
    const tmpOutPath = path.join(os.tmpdir(), `dz_out_${uid}.mp3`);
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
          const args = [
            '-y',
            '-i', tmpInPath,
            ...(useStrictMap ? ['-map', '0:a:0'] : []),
            '-vn',
            '-map_metadata', '-1',
            '-c:a', 'libmp3lame',
            '-b:a', targetBitrate,
            '-minrate', targetBitrate,
            '-maxrate', targetBitrate,
            '-bufsize', bufsize,
            '-write_xing', '0',
            '-compression_level', '2',
            '-ar', '44100',
            '-ac', '2',
            '-f', 'mp3',
            tmpOutPath
          ];
          const ff = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
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
      try {
        if (fs.existsSync(tmpInPath)) fs.unlinkSync(tmpInPath);
      } catch {}
      try {
        if (fs.existsSync(tmpOutPath)) fs.unlinkSync(tmpOutPath);
      } catch {}
    }
  };

  // Remuxes separate DASH video + audio MP4 tracks (or a single fragmented .cmfv video track) cleanly without re-encoding (-c copy +faststart)
  const muxVideoAndAudioToMp4 = async (videoBuffer: Buffer, audioBuffer: Buffer | null): Promise<Buffer> => {
    const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const tmpVidPath = path.join(os.tmpdir(), `dz_mux_v_${uid}.mp4`);
    const tmpAudPath = path.join(os.tmpdir(), `dz_mux_a_${uid}.m4a`);
    const tmpOutPath = path.join(os.tmpdir(), `dz_mux_o_${uid}.mp4`);
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
  };

  const parseTargetShortSide = (rawRes: string): number | null => {
    const r = String(rawRes || '').toLowerCase().trim();
    if (!r || r === 'original' || r.includes('original')) return null;
    if (r.includes('4k') || r.includes('2160')) return 2160;
    if (r.includes('2k') || r.includes('1440') || r.includes('qhd')) return 1440;
    if (r.includes('1080') || r.includes('fhd')) return 1080;
    if (r.includes('720')) return 720;
    if (r.includes('480')) return 480;
    if (r.includes('360')) return 360;
    return null;
  };

  // Enforces explicit target short-side resolution & H.264/AAC MP4 compatibility (preserving native FPS)
  // Skipped completely whenever the user explicitly chooses "Original".
  const ensureMp4TargetResolution = async (inputBuffer: Buffer, targetShortSide: number): Promise<Buffer> => {
    const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const tmpInPath = path.join(os.tmpdir(), `dz_vres_in_${uid}.mp4`);
    const tmpOutPath = path.join(os.tmpdir(), `dz_vres_out_${uid}.mp4`);
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

      // Fast path: already H.264 MP4 at the exact requested resolution -> zero re-encoding
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
  };

  // 1. Health check & Security Shield status
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'online',
      securityShield: 'active',
      service: 'DownloaderZero (DZ) Media Engine',
      version: '2026.1',
      platforms: ['youtube', 'tiktok', 'twitter', 'facebook', 'instagram', 'pinterest', 'spotify', 'terabox']
    });
  });

  // 1b. Check Server 1 (Neoxr) quota/limit status without exposing server keys or dates
  app.all('/api/neoxr-status', extractLimiter, async (req: Request, res: Response) => {
    try {
      const apiKey = typeof req.query.apiKey === 'string'
        ? req.query.apiKey
        : (typeof req.body?.apiKey === 'string' ? req.body.apiKey : '');
      const force = req.query.force === '1' || req.body?.force === true || req.body?.force === '1';
      const status = await checkNeoxrApiKeyStatus(apiKey, force);
      res.json(status);
    } catch {
      res.json({ success: false, isLimited: false, hasCustomKey: false, checkedAt: Date.now() });
    }
  });

  // 2. Extract media metadata and formats (with anti-SSRF & rate limiter)
  app.post('/api/extract', extractLimiter, async (req: Request, res: Response) => {
    try {
      const { url: rawUrl, apiKey, server } = req.body || {};
      if (!rawUrl || typeof rawUrl !== 'string') {
        res.status(400).json({ success: false, error: 'Parameter URL wajib disertakan.' });
        return;
      }
      const extractedMatch = rawUrl.trim().match(/https?:\/\/[^\s<>"'`]+/i);
      const url = extractedMatch ? extractedMatch[0].replace(/[),.;!?]+$/, '') : rawUrl.trim();

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
    if (f === 'original' || f.includes('original')) return '2160';
    if (f === '2k' || f === '1440' || f === '1440p' || f.includes('1440') || f.includes('2k') || f.includes('qhd')) return '1440';
    if (f === '4k' || f === '2160' || f === '2160p' || f.includes('2160') || f.includes('4k')) return '2160';
    if (f === '1080' || f === '1080p' || f.includes('1080')) return '1080';
    if (f === '720' || f === '720p' || f.includes('720')) return '720';
    if (f === '480' || f === '480p' || f.includes('480')) return '480';
    if (f === '360' || f === '360p' || f.includes('360')) return '360';
    if (f === '240' || f === '240p' || f.includes('240')) return '240';
    if (f === '144' || f === '144p' || f.includes('144')) return '144';
    if (f === 'mp3' || f === 'audio' || f.includes('mp3') || f.includes('audio')) return 'mp3';
    return f.replace(/p$/i, '');
  }

  // 2b. Start async job for YouTube conversion (with Anti-SSRF & rate limiter)
  app.post('/api/start-job', jobLimiter, async (req: Request, res: Response) => {
    try {
      const { format, url: rawUrl, server, apiKey, platform, formatId, resolution, type } = req.body || {};
      if (!rawUrl || typeof rawUrl !== 'string') {
        res.status(400).json({ success: false, error: 'URL target wajib disertakan.' });
        return;
      }
      const extractedMatch = rawUrl.trim().match(/https?:\/\/[^\s<>"'`]+/i);
      const url = extractedMatch ? extractedMatch[0].replace(/[),.;!?]+$/, '') : rawUrl.trim();

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

      // 1b. Instagram on-demand resolution
      if (platform === 'instagram' || detectPlatform(url) === 'instagram') {
        try {
          const igType = (type === 'audio' || type === 'photos' || type === 'video')
            ? type
            : (format === 'mp3' ? 'audio' : 'video');
          const resolved = await resolveInstagramServer2(
            url,
            resolution || format || '1080p',
            igType
          );
          res.json({
            success: true,
            id: null,
            downloadUrl: resolved.downloadUrl,
            dashAudioUrl: resolved.dashAudioUrl,
            format: resolution || format || '1080p',
            text: `Siap diunduh (${resolved.quality || 'Kualitas Pilihan'})!`
          });
          return;
        } catch (igErr: any) {
          console.error('[server] Instagram resolution error:', igErr.message);
          res.status(502).json({
            success: false,
            error: igErr.message || 'Gagal menyiapkan unduhan Instagram.'
          });
          return;
        }
      }

      // 1c. Pinterest Server 2 on-demand resolution (video resolution tiers & audio)
      if ((platform === 'pinterest' || detectPlatform(url) === 'pinterest') && (serverMode !== 'server1' || String(formatId || '').startsWith('pin-s2-'))) {
        try {
          const pinType = (type === 'audio' || type === 'photos' || type === 'video')
            ? type
            : (format === 'mp3' ? 'audio' : 'video');
          const resolved = await resolvePinterestServer2(
            url,
            resolution || format || '720p',
            pinType
          );
          res.json({
            success: true,
            id: null,
            downloadUrl: resolved.downloadUrl,
            dashAudioUrl: resolved.dashAudioUrl,
            format: resolved.resolution || resolution || format || '720p',
            text: `Siap diunduh (${resolved.quality || 'Kualitas Pilihan'})!`
          });
          return;
        } catch (pinErr: any) {
          console.error('[server] Pinterest resolution error:', pinErr.message);
          res.status(502).json({
            success: false,
            error: pinErr.message || 'Gagal menyiapkan unduhan Pinterest.'
          });
          return;
        }
      }

      // 1d. Facebook Server 2 on-demand resolution (video resolution tiers & audio)
      if ((platform === 'facebook' || detectPlatform(url) === 'facebook') && (serverMode !== 'server1' || String(formatId || '').startsWith('fb-s2-'))) {
        try {
          const fbType = (type === 'audio' || type === 'video')
            ? type
            : (format === 'mp3' ? 'audio' : 'video');
          const resolved = await resolveFacebookServer2(
            url,
            resolution || format || '720p',
            fbType
          );
          res.json({
            success: true,
            id: null,
            downloadUrl: resolved.downloadUrl,
            dashAudioUrl: resolved.dashAudioUrl,
            format: resolved.resolution || resolution || format || '720p',
            text: `Siap diunduh (${resolved.quality || 'Kualitas Pilihan'})!`
          });
          return;
        } catch (fbErr: any) {
          console.error('[server] Facebook resolution error:', fbErr.message);
          res.status(502).json({
            success: false,
            error: fbErr.message || 'Gagal menyiapkan unduhan Facebook.'
          });
          return;
        }
      }

      const normalizedFormat = normalizeLoaderFormat(format);

      // Server 1 handler (Primary - Neoxr supports 720p, 480p, 360p video & 128kbps audio)
      const tryServer1 = async () => {
        const envKey = (process.env.NEOXR_API_KEY || 'j3i3mg').trim().replace(/^["']|["']$/g, '');
        const key = (typeof apiKey === 'string' && apiKey.trim() ? apiKey.trim() : envKey).replace(/^["']|["']$/g, '');
        const isAudio = normalizedFormat === 'mp3';
        const neoType = isAudio ? 'audio' : 'video';

        let neoQualities: string[];
        if (isAudio) {
          neoQualities = ['128kbps'];
        } else if (normalizedFormat === '360') {
          neoQualities = ['360p', '480p', '720p'];
        } else if (normalizedFormat === '480') {
          neoQualities = ['480p', '360p', '720p'];
        } else {
          // 720, 1080, 1440 (2K), 2160 (4K): Server 1 natively tops out at 720p and cascades down if absent
          neoQualities = ['720p', '480p', '360p'];
        }

        const vMatch = url.match(/(?:youtube\.com\/(?:watch\?[^#]*v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i);
        const canonicalWatchUrl = vMatch ? `https://www.youtube.com/watch?v=${vMatch[1]}` : url;
        const urlCandidates = canonicalWatchUrl !== url ? [url, canonicalWatchUrl] : [url];

        let lastMsg = '';
        for (const candidateUrl of urlCandidates) {
          for (const neoQ of neoQualities) {
            try {
              const neoEp = `https://api.neoxr.eu/api/youtube?url=${encodeURIComponent(candidateUrl)}&type=${neoType}&quality=${encodeURIComponent(neoQ)}&apikey=${encodeURIComponent(key)}`;
              const neoRes = await fetch(neoEp, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                signal: AbortSignal.timeout(10000)
              });
              if (neoRes.ok) {
                const neoJson = await neoRes.json();
                if (neoJson && neoJson.status && neoJson.data?.url) {
                  return {
                    success: true,
                    id: null,
                    downloadUrl: neoJson.data.url,
                    format: neoJson.data.quality || neoQ,
                    text: `Siap diunduh (${neoJson.data.quality || neoQ} via Server 1)!`
                  };
                }
                if (neoJson?.msg) {
                  lastMsg = String(neoJson.msg);
                }
              } else {
                lastMsg = `HTTP ${neoRes.status}`;
              }
            } catch (err: any) {
              lastMsg = err?.message || 'Timeout';
            }
          }
        }
        throw new Error(lastMsg ? `Server 1 tidak menghasilkan unduhan (${lastMsg}).` : 'Server 1 tidak menghasilkan unduhan.');
      };

      // Server 2 handler (SaveTube VIP Multi-CDN YouTube Engine)
      const tryServer2 = async () => {
        const resolved = await resolveYouTubeServer2(
          url,
          formatId || '',
          resolution || format || '1080p',
          type || (normalizedFormat === 'mp3' ? 'audio' : 'video')
        );
        return {
          success: true,
          id: null,
          downloadUrl: resolved.downloadUrl,
          format: normalizedFormat,
          text: `Siap diunduh (${resolved.quality || normalizedFormat} via Server 2)!`
        };
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

  // 3b. Adapt vertical CDN banner video into horizontal banner-sized H.264 MP4 (fast, cached, allowlisted)
  const BANNER_ADAPT_CATALOG: Record<string, { url: string; rotateMode: 'ccw90' | 'none' }> = {
    wuthering_waves: {
      url: 'https://cdn.jsdelivr.net/gh/asahichanID/media@main/banner_wuwa.mp4',
      rotateMode: 'ccw90'
    }
  };

  const adaptVerticalBannerToHorizontal = async (
    inputBuffer: Buffer,
    rotateMode: 'ccw90' | 'none'
  ): Promise<Buffer> => {
    const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const tmpInPath = path.join(os.tmpdir(), `dz_srv_banner_in_${uid}.mp4`);
    const tmpOutPath = path.join(os.tmpdir(), `dz_srv_banner_out_${uid}.mp4`);
    const ffmpegBins = getFfmpegCandidates();

    const probeBannerVideo = async (bin: string): Promise<{ vcodec: string; width: number; height: number } | null> => {
      return await new Promise((resolve) => {
        const fp = spawn(bin, ['-hide_banner', '-i', tmpInPath], { stdio: ['ignore', 'ignore', 'pipe'] });
        let infoText = '';
        fp.stderr.on('data', (c: Buffer) => {
          if (infoText.length < 6000) infoText += c.toString('utf8');
        });
        fp.on('error', () => resolve(null));
        fp.on('close', () => {
          const vidMatch = infoText.match(/Stream #\d+:\d+[^\n]*Video:\s*([a-zA-Z0-9_]+)[^\n]*?,\s*(\d{2,5})x(\d{2,5})/i);
          if (!vidMatch) {
            resolve(null);
            return;
          }
          resolve({
            vcodec: vidMatch[1].toLowerCase(),
            width: Number(vidMatch[2]) || 0,
            height: Number(vidMatch[3]) || 0
          });
        });
      });
    };

    try {
      fs.writeFileSync(tmpInPath, inputBuffer);
      let probe: { vcodec: string; width: number; height: number } | null = null;
      for (const bin of ffmpegBins) {
        probe = await probeBannerVideo(bin);
        if (probe) break;
      }

      const w = probe?.width || 1080;
      const h = probe?.height || 1920;
      const isPortrait = w < h;

      if (!isPortrait && probe?.vcodec === 'h264' && w >= 960 && w <= 1920) {
        return inputBuffer;
      }

      const filterArgs = isPortrait
        ? (rotateMode === 'ccw90'
            ? ['-vf', 'fps=30,scale=720:1280:flags=fast_bilinear,transpose=2,setsar=1']
            : [
                '-filter_complex',
                '[0:v]fps=30,split=2[bg][fg];[bg]scale=320:180:force_original_aspect_ratio=increase,crop=320:180,boxblur=10:2,eq=brightness=-0.10:saturation=1.15,scale=1280:720:flags=fast_bilinear[bg2];[fg]crop=iw:trunc(iw*1.25/2)*2:0:trunc((ih-iw*1.25)*0.18),scale=-2:720:flags=bilinear[fg2];[bg2][fg2]overlay=(W-w)/2:0,setsar=1'
              ])
        : ['-vf', 'fps=30,scale=1280:720:flags=fast_bilinear,setsar=1'];

      let lastErr: any = null;
      for (const bin of ffmpegBins) {
        try {
          return await new Promise<Buffer>((resolve, reject) => {
            const ff = spawn(
              bin,
              [
                '-y',
                '-i', tmpInPath,
                '-an',
                ...filterArgs,
                '-c:v', 'libx264',
                '-preset', 'ultrafast',
                '-crf', '24',
                '-maxrate', '3200k',
                '-bufsize', '4800k',
                '-pix_fmt', 'yuv420p',
                '-movflags', '+faststart',
                '-f', 'mp4',
                tmpOutPath
              ],
              { stdio: ['ignore', 'ignore', 'pipe'] }
            );
            let errText = '';
            ff.stderr.on('data', (chunk: Buffer) => {
              if (errText.length < 1000) errText += chunk.toString('utf8');
            });
            ff.on('error', (err) => reject(err));
            ff.on('close', (code) => {
              if (code === 0 && fs.existsSync(tmpOutPath)) {
                const out = fs.readFileSync(tmpOutPath);
                if (out.length > 50000) {
                  resolve(out);
                  return;
                }
              }
              reject(new Error(`ffmpeg banner adapt exited ${code}: ${errText.slice(-240)}`));
            });
          });
        } catch (err: any) {
          lastErr = err;
          if (err?.code === 'ENOENT' || err?.code === 'EACCES') continue;
          break;
        }
      }
      throw lastErr || new Error('Gagal menyesuaikan orientasi banner menjadi horizontal.');
    } finally {
      try { if (fs.existsSync(tmpInPath)) fs.unlinkSync(tmpInPath); } catch {}
      try { if (fs.existsSync(tmpOutPath)) fs.unlinkSync(tmpOutPath); } catch {}
    }
  };

  app.all('/api/adapt-banner', proxyLimiter, async (req: Request, res: Response) => {
    try {
      const bannerId = String(req.query?.bannerId || req.body?.bannerId || '').trim();
      const spec = BANNER_ADAPT_CATALOG[bannerId];
      if (!spec) {
        res.status(400).json({ success: false, error: 'Banner tidak dikenal atau tidak memerlukan penyesuaian.' });
        return;
      }

      if (!isSafePublicUrl(spec.url).safe) {
        res.status(400).json({ success: false, error: 'URL sumber banner tidak diizinkan.' });
        return;
      }

      const cached = bannerAdaptCache.get(bannerId);
      let outputBuffer: Buffer;

      if (cached && Date.now() - cached.timestamp < 10 * 60 * 1000) {
        outputBuffer = cached.buffer;
      } else {
        let pending = inFlightBannerAdapt.get(bannerId);
        if (!pending) {
          pending = (async () => {
            const cdnRes = await fetch(spec.url, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': '*/*'
              },
              signal: AbortSignal.timeout(25000)
            });
            if (!cdnRes.ok) {
              throw new Error(`Gagal mengambil video banner dari CDN (HTTP ${cdnRes.status}).`);
            }
            const rawBuf = Buffer.from(await cdnRes.arrayBuffer());
            if (rawBuf.length < 100_000) {
              throw new Error('Berkas video banner dari CDN tidak lengkap.');
            }
            const adapted = await adaptVerticalBannerToHorizontal(rawBuf, spec.rotateMode);
            bannerAdaptCache.set(bannerId, { buffer: adapted, timestamp: Date.now() });
            setTimeout(() => {
              bannerAdaptCache.delete(bannerId);
            }, 10 * 60 * 1000);
            return adapted;
          })().finally(() => {
            inFlightBannerAdapt.delete(bannerId);
          });
          inFlightBannerAdapt.set(bannerId, pending);
        }
        outputBuffer = await pending;
      }

      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Content-Length', outputBuffer.length);
      res.setHeader('Cache-Control', 'public, max-age=600');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Type, X-Banner-Adapted, X-Banner-Dimensions');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Banner-Adapted', 'horizontal');
      res.setHeader('X-Banner-Dimensions', '1280x720');
      res.status(200).send(outputBuffer);
    } catch (err: any) {
      console.error('[server /api/adapt-banner] Error:', err?.message || err);
      res.status(502).json({
        success: false,
        error: err?.message || 'Gagal menyesuaikan orientasi banner menjadi horizontal.'
      });
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

      // SSRF & Malicious Target Verification
      if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
        res.status(400).json({ success: false, error: 'Target URL tidak valid.' });
        return;
      }

      const targetSafety = isSafePublicUrl(targetUrl);
      if (!targetSafety.safe) {
        res.status(400).json({ success: false, error: targetSafety.reason || 'Target URL tidak diizinkan oleh sistem keamanan.' });
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
      const isInline = req.query.inline === '1' || req.query.inline === 'true';
      const rangeHeader = typeof req.headers.range === 'string' ? req.headers.range : undefined;

      if (sourceUrl && !isSafePublicUrl(sourceUrl).safe) {
        res.status(400).json({ success: false, error: 'Source URL tidak valid atau diblokir.' });
        return;
      }

      let audioUrl = typeof req.query?.audioUrl === 'string' ? req.query.audioUrl.trim() : '';
      if (audioUrl && (audioUrl.startsWith('http%3A') || audioUrl.startsWith('https%3A'))) {
        try {
          audioUrl = decodeURIComponent(audioUrl);
        } catch {}
      }
      if (audioUrl) {
        if (!/^https?:\/\//i.test(audioUrl) || !isSafePublicUrl(audioUrl).safe) {
          res.status(400).json({ success: false, error: 'Audio URL tidak valid atau diblokir.' });
          return;
        }
      }

      const isSpotify =
        platform === 'spotify' ||
        req.query.platform === 'spotify' ||
        targetUrl.includes('spotify.com') ||
        targetUrl.includes('spotify.link') ||
        (!platform && sanitizedFilename.endsWith('.mp3') && (Boolean(req.query.title) || Boolean(req.query.artist)));

      // Handle Spotify full-song audio download + embedded ID3 metadata & cover art
      if (isSpotify) {
        let directAudioUrl = targetUrl;
        const neoxrKey = ((req.query?.apiKey as string) || process.env.NEOXR_API_KEY || 'j3i3mg').trim();
        const reqServerMode = ((req.query?.server as string) || 'auto').toLowerCase();
        let metaTitle = (req.query.title as string) || '';
        let metaArtist = (req.query.artist as string) || '';
        let metaAlbum = (req.query.album as string) || '';
        let metaCover = (req.query.cover as string) || '';
        let metaYear = (req.query.year as string) || '';
        const metaDuration = Number(req.query.duration || 0) || 0;

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
          } catch (fallbackErr: any) {
            console.warn('[Spotify Download] Fallback Server 2 after Server 1 CDN failure:', fallbackErr?.message || fallbackErr);
          }
        }

        if (!fetchedAudio.ok || !fetchedAudio.buffer) {
          res.status(fetchedAudio.status || 502).json({ success: false, error: fetchedAudio.errMsg || 'Gagal mengunduh audio Spotify dari server sumber.' });
          return;
        }

        let rawAudioBuffer: Buffer = fetchedAudio.buffer;

        // Enforce exact requested MP3 bitrate (default 320k CBR) on downloads so filesize & music player bitrate badge match
        const targetSpotifyBitrate = normalizeTargetBitrate(req.query.bitrate, '320k');
        if (!isInline) {
          try {
            rawAudioBuffer = await ensureMp3TargetBitrate(rawAudioBuffer, targetSpotifyBitrate);
          } catch (encErr: any) {
            console.error('[Spotify Download] MP3 bitrate transcode failed:', encErr?.message || encErr);
            res.status(502).json({ success: false, error: `Gagal mengonversi audio Spotify ke ${targetSpotifyBitrate} CBR.` });
            return;
          }
        }

        // Fetch Cover Art buffer if cover URL is provided (with SSRF check)
        const coverUrl = metaCover;
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
          title: metaTitle || 'Spotify Track',
          artist: metaArtist || 'Spotify Artist',
          album: metaAlbum || 'Spotify Music',
          genre: (req.query.genre as string) || 'Pop',
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
            console.log(`[Spotify Download] ✅ ${targetSpotifyBitrate} MP3 + ID3 & Cover ready! Size: ${finalMp3Buffer.length} bytes`);
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
      // Define appropriate Referer candidate for target CDN
      let platformReferer = '';
      if (targetUrl.includes('tikwm.com')) {
        platformReferer = 'https://www.tikwm.com/';
      } else if (targetUrl.includes('tiktokcdn') || targetUrl.includes('byteoversea') || targetUrl.includes('ibyteimg')) {
        platformReferer = ''; // Empty Referer ensures TikTok CDN serves at maximum bitrate without 503
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

      const fetchCandidateConfigs: Array<{ idx: number; headers: Record<string, string> }> = [
        // Strategy 0: Clean browser request without Referer (standard for most signed media CDNs)
        {
          idx: 0,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Sec-Fetch-Mode': 'no-cors'
          }
        },
        // Strategy 1: With specific platform referer
        ...(platformReferer ? [{
          idx: 1,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Referer': platformReferer
          }
        }] : []),
        // Strategy 2: Mobile Safari User-Agent
        {
          idx: 2,
          headers: {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
            'Accept': '*/*',
            ...(platformReferer ? { 'Referer': platformReferer } : {})
          }
        }
      ];

      const getHostKey = (u: string): string => {
        try {
          return new URL(u).hostname.toLowerCase();
        } catch {
          return '';
        }
      };

      const getOrderedFetchConfigs = (u: string) => {
        const host = getHostKey(u);
        const preferredIdx = host ? winningStrategyByHost.get(host) : undefined;
        if (preferredIdx === undefined) return fetchCandidateConfigs;
        const preferred = fetchCandidateConfigs.find((c) => c.idx === preferredIdx);
        if (!preferred) return fetchCandidateConfigs;
        return [preferred, ...fetchCandidateConfigs.filter((c) => c.idx !== preferredIdx)];
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

      const wantsMp3Output = sanitizedFilename.toLowerCase().endsWith('.mp3');
      const resolvedTargetBitrate = normalizeTargetBitrate(req.query.bitrate, '192k');
      const mp3CacheKey = `${targetUrl}::${resolvedTargetBitrate}::${String(req.query.title || '')}::${String(req.query.artist || '')}`;

      const sendMp3BufferResponse = (mp3Buffer: Buffer) => {
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
        res.setHeader('X-Audio-Bitrate', resolvedTargetBitrate);

        if (rangeHeader) {
          const totalLen = mp3Buffer.length;
          const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
          if (match) {
            const start = match[1] ? parseInt(match[1], 10) : 0;
            const end = match[2] ? Math.min(parseInt(match[2], 10), totalLen - 1) : totalLen - 1;
            if (!isNaN(start) && !isNaN(end) && start <= end && start < totalLen) {
              const sliced = mp3Buffer.subarray(start, end + 1);
              res.status(206);
              res.setHeader('Content-Range', `bytes ${start}-${end}/${totalLen}`);
              res.setHeader('Content-Length', sliced.length);
              res.send(sliced);
              return;
            }
          }
        }

        res.setHeader('Content-Length', mp3Buffer.length);
        res.send(mp3Buffer);
      };

      if (wantsMp3Output) {
        const cachedMp3 = mp3TranscodeCache.get(mp3CacheKey)?.buffer;
        if (cachedMp3) {
          sendMp3BufferResponse(cachedMp3);
          return;
        }
      }

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

      const rawResParam = String(req.query.res || '').trim();
      const rawOriginalParam = String(req.query.original || '').toLowerCase().trim();
      const isOriginalRequest =
        rawOriginalParam === '1' ||
        rawOriginalParam === 'true' ||
        rawResParam.toLowerCase() === 'original';
      const rawResHint = `${rawResParam} ${sanitizedFilename}`.toLowerCase();
      const isPrepareOnly = req.query.prepare === '1' || req.query.prepare === 'true';

      const tryReResolveFreshUrl = async (): Promise<{ url: string; dashAudioUrl?: string } | null> => {
        if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl)) return null;
        try {
          console.log(`[proxy-download] Attempting on-the-fly re-resolution for ${platform || 'media'} (${sourceUrl})...`);
          const reKey = typeof req.query.apiKey === 'string' && req.query.apiKey.trim() ? req.query.apiKey.trim() : undefined;
          const reServer = req.query.server === 'server1' || req.query.server === 'server2' || req.query.server === 'auto' ? req.query.server : 'auto';
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
              wantsMp3Output ? 'tt-audio' : (isOriginalRequest ? 'tt-original' : `tt-${resTag.toLowerCase()}`),
              resTag,
              wantsMp3Output ? 'audio' : 'video',
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
              rawResParam || (wantsMp3Output ? '320 kbps' : '720p'),
              wantsMp3Output ? 'audio' : 'video'
            );
            if (resolvedFb.downloadUrl?.startsWith('http') && isSafePublicUrl(resolvedFb.downloadUrl).safe) {
              const safeDashAudio = resolvedFb.dashAudioUrl && isSafePublicUrl(resolvedFb.dashAudioUrl).safe ? resolvedFb.dashAudioUrl : undefined;
              return { url: resolvedFb.downloadUrl, dashAudioUrl: safeDashAudio };
            }
          }

          if (detected === 'instagram' && reServer !== 'server1') {
            const resolvedIg = await resolveInstagramServer2(
              sourceUrl,
              rawResParam || (wantsMp3Output ? '320 kbps' : '1080p'),
              wantsMp3Output ? 'audio' : 'video'
            );
            if (resolvedIg.downloadUrl?.startsWith('http') && isSafePublicUrl(resolvedIg.downloadUrl).safe) {
              const safeDashAudio = resolvedIg.dashAudioUrl && isSafePublicUrl(resolvedIg.dashAudioUrl).safe ? resolvedIg.dashAudioUrl : undefined;
              return { url: resolvedIg.downloadUrl, dashAudioUrl: safeDashAudio };
            }
          }

          if (detected === 'pinterest' && reServer !== 'server1') {
            const resolvedPin = await resolvePinterestServer2(
              sourceUrl,
              rawResParam || (wantsMp3Output ? '320 kbps' : '720p'),
              wantsMp3Output ? 'audio' : 'video'
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
              rawResParam || (wantsMp3Output ? '320 kbps' : '1080p'),
              wantsMp3Output ? 'audio' : 'video'
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
          console.warn('[proxy-download] On-the-fly re-resolution notice:', reErr);
        }
        return null;
      };

      // Handle paired DASH Video + Audio MP4 remuxing (-c copy +faststart, Original quality without re-encoding)
      const isCmfvVideo = /\.cmfv(\?|$)/i.test(targetUrl);
      if ((audioUrl || isCmfvVideo) && !wantsMp3Output) {
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
                const refreshed = await tryReResolveFreshUrl();
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

      // Fast non-destructive Original / multi-res CDN prepare probe (HEAD + lightweight Range: bytes=0-1023 fallback)
      if (isPrepareOnly && !wantsMp3Output) {
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

      const streamAbortController = new AbortController();
      let clientAborted = false;
      let activeReader: ReadableStreamDefaultReader<Uint8Array> | null = null;

      res.on('close', () => {
        if (!res.writableFinished) {
          clientAborted = true;
          streamAbortController.abort();
          try {
            void activeReader?.cancel();
          } catch {}
        }
      });

      let response: globalThis.Response | null = null;
      let lastStatus = 0;

      const tryFetchUpstream = async (candidateTarget: string): Promise<globalThis.Response | null> => {
        for (const cfg of getOrderedFetchConfigs(candidateTarget)) {
          if (clientAborted) return null;
          try {
            const reqHeaders: Record<string, string> = { ...cfg.headers };
            if (rangeHeader && !wantsMp3Output) {
              reqHeaders['Range'] = rangeHeader;
            }
            const resCandidate = await fetchWithHeaderTimeout(
              candidateTarget,
              reqHeaders,
              7500,
              'GET',
              streamAbortController.signal
            );
            const candidateCt = (resCandidate.headers.get('content-type') || '').toLowerCase();
            if (resCandidate.ok && resCandidate.body && !candidateCt.includes('text/html')) {
              rememberWinningStrategy(candidateTarget, cfg.idx);
              return resCandidate;
            }
            lastStatus = candidateCt.includes('text/html') ? 502 : resCandidate.status;
            try { await resCandidate.body?.cancel(); } catch {}
          } catch (e: any) {
            if (clientAborted) return null;
            console.warn('[proxy-download] Candidate fetch notice:', e?.message || e);
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

      response = await tryFetchUpstream(targetUrl);

      // If CDN link expired or returned 403/404/410/text/html, attempt on-the-fly re-resolution
      if ((!response || !response.ok) && !clientAborted && sourceUrl && /^https?:\/\//i.test(sourceUrl)) {
        const freshTarget = await tryReResolveFreshUrl();
        if (freshTarget?.url && freshTarget.url !== targetUrl && freshTarget.url.startsWith('http')) {
          targetUrl = freshTarget.url;
          response = await tryFetchUpstream(targetUrl);
        }
      }

      if (clientAborted) {
        return;
      }

      if (!response || !response.ok || !response.body) {
        res.status(lastStatus || 500).json({ success: false, error: 'Gagal mengunduh berkas dari tautan sumber.' });
        return;
      }

      let reader = response.body.getReader();
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
      if (isInvalidMediaPayload(firstChunk, response.headers.get('content-type') || '')) {
        try { await reader.cancel(); } catch {}
        let recovered = false;
        if (!clientAborted && sourceUrl && /^https?:\/\//i.test(sourceUrl)) {
          const freshTarget = await tryReResolveFreshUrl();
          if (freshTarget?.url && freshTarget.url !== targetUrl && freshTarget.url.startsWith('http')) {
            targetUrl = freshTarget.url;
            const retryRes = await tryFetchUpstream(targetUrl);
            if (retryRes && retryRes.ok && retryRes.body) {
              const retryReader = retryRes.body.getReader();
              activeReader = retryReader;
              const retryFirst = await retryReader.read();
              if (!retryFirst.done && retryFirst.value && retryFirst.value.length > 0 && !isInvalidMediaPayload(retryFirst.value, retryRes.headers.get('content-type') || '')) {
                response = retryRes;
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
          console.warn('[proxy-download] Upstream served HTML/JSON error text instead of binary media.');
          res.status(502).json({
            success: false,
            error: 'Tautan unduhan tidak menghasilkan berkas media yang valid dari server sumber.'
          });
          return;
        }
      }

      const rawContentType = response.headers.get('content-type') || '';

      // Transcode to genuine MP3 CBR at requested bitrate whenever downloading .mp3 OR upstream is not yet MP3
      const isUpstreamMp3 =
        rawContentType.includes('audio/mpeg') || rawContentType.includes('audio/mp3');
      const needsMp3Transcode =
        wantsMp3Output && (!isUpstreamMp3 || !isInline);

      if (needsMp3Transcode) {
        let mp3Buffer: Buffer | null = mp3TranscodeCache.get(mp3CacheKey)?.buffer || null;

        if (!mp3Buffer) {
          // Read remaining upstream bytes cleanly into buffer
          const chunks: Buffer[] = [Buffer.from(firstChunk)];
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) chunks.push(Buffer.from(value));
          }
          const inputBuffer = Buffer.concat(chunks);

          try {
            mp3Buffer = await ensureMp3TargetBitrate(inputBuffer, resolvedTargetBitrate);

            // Embed ID3 title/artist metadata if provided
            const metaTitle = typeof req.query.title === 'string' ? req.query.title.trim() : '';
            const metaArtist = typeof req.query.artist === 'string' ? req.query.artist.trim() : '';
            if (metaTitle || metaArtist) {
              try {
                const tagged = NodeID3.write(
                  {
                    title: metaTitle || 'Audio DownloaderZero',
                    artist: metaArtist || (platform ? platform.toUpperCase() : 'DownloaderZero')
                  },
                  mp3Buffer
                );
                if (tagged && tagged.length > 0) {
                  mp3Buffer = tagged;
                }
              } catch {}
            }

            mp3TranscodeCache.set(mp3CacheKey, { buffer: mp3Buffer, timestamp: Date.now() });
            setTimeout(() => {
              mp3TranscodeCache.delete(mp3CacheKey);
            }, 90000);
          } catch (ffErr: any) {
            console.warn('[proxy-download] MP3 transcode notice:', ffErr?.message || ffErr);
            res.status(422).json({
              success: false,
              error: 'Media ini tidak memiliki trek audio yang dapat dikonversi ke MP3.'
            });
            return;
          }
        } else {
          try {
            void reader.cancel();
          } catch {}
        }

        sendMp3BufferResponse(mp3Buffer);
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

      const rawUpstreamLen = response.headers.get('content-length');
      const contentEncoding = response.headers.get('content-encoding');
      const upstreamLenNum = rawUpstreamLen && !contentEncoding && !isNaN(Number(rawUpstreamLen)) ? Number(rawUpstreamLen) : 0;

      // Support Range byte-skipping if upstream ignored Range (returned 200) on a non-zero seek request
      let skipBytesRemaining = 0;
      let limitOutputBytes: number | null = null;
      const requestedRangeMatch = rangeHeader ? /bytes=(\d*)-(\d*)/.exec(rangeHeader) : null;

      if (response.status === 206) {
        res.status(206);
        const contentRange = response.headers.get('content-range');
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
            res.off('drain', onDone);
            res.off('close', onDone);
          };
          const onDone = () => {
            cleanup();
            resolve();
          };
          res.once('drain', onDone);
          res.once('close', onDone);
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
      console.error('Proxy download stream error:', err);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: `Download gagal: ${err.message}` });
      }
    }
  });

  const staticVideoCacheOptions = {
    setHeaders: (res: Response, filePath: string) => {
      if (filePath.endsWith('.mp4')) {
        // Cache banner videos in browser disk cache for 30 days (2592000s)
        res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
      } else if (filePath.endsWith('.html') || filePath.endsWith('version.json')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      }
    }
  };

  // Serve public static assets (videos, images, icons)
  app.use(express.static(path.resolve(__dirname, 'public'), staticVideoCacheOptions));

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
    app.use(express.static(path.resolve(__dirname, 'dist'), staticVideoCacheOptions));
    app.get('*', (_req: Request, res: Response) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  let server: any;
  let retryCount = 0;

  function listen() {
    server = app.listen(PORT, HOST, () => {
      console.log(`[DownloaderZero] Server running at http://${HOST}:${PORT}`);
    });

    server.on('clientError', (err: any, socket: any) => {
      if (err?.code === 'ECONNRESET' || !socket.writable) {
        return;
      }
      try {
        socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
      } catch {}
    });

    server.on('error', (err: any) => {
      if (err?.code === 'EADDRINUSE') {
        if (retryCount < 10) {
          retryCount++;
          console.warn(`[DownloaderZero] Port ${PORT} already in use, retrying in 500ms (attempt ${retryCount}/10)...`);
          setTimeout(() => {
            try {
              server?.close();
            } catch {}
            listen();
          }, 500);
        } else {
          console.error(`[DownloaderZero] Port ${PORT} still in use after 10 attempts.`);
        }
      } else {
        console.error('[DownloaderZero] Server notice:', err?.message || err);
      }
    });
  }

  listen();
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});

