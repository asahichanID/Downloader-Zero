import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import ffmpegStaticPath from 'ffmpeg-static';
import { isSafePublicUrl } from '../src/services/security.ts';

interface BannerAdaptConfig {
  url: string;
  rotateMode: 'ccw90' | 'none';
}

const BANNER_ADAPT_CATALOG: Record<string, BannerAdaptConfig> = {
  wuthering_waves: {
    url: 'https://cdn.jsdelivr.net/gh/asahichanID/media@main/banner_wuwa.mp4',
    rotateMode: 'ccw90'
  }
};

const bannerAdaptCache = new Map<string, { buffer: Buffer; timestamp: number }>();
const inFlightAdaptations = new Map<string, Promise<Buffer>>();

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

async function adaptVerticalBannerToHorizontal(
  inputBuffer: Buffer,
  rotateMode: 'ccw90' | 'none'
): Promise<Buffer> {
  const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const tmpInPath = path.join(os.tmpdir(), `dz_banner_in_${uid}.mp4`);
  const tmpOutPath = path.join(os.tmpdir(), `dz_banner_out_${uid}.mp4`);
  const ffmpegBins = getFfmpegCandidates();

  const probeVideo = async (bin: string): Promise<{ vcodec: string; width: number; height: number } | null> => {
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
      probe = await probeVideo(bin);
      if (probe) break;
    }

    const w = probe?.width || 1080;
    const h = probe?.height || 1920;
    const isPortrait = w < h;

    // If source is already horizontal H.264 around banner HD target, return immediately
    if (!isPortrait && probe?.vcodec === 'h264' && w >= 960 && w <= 1920) {
      return inputBuffer;
    }

    // Build fast, well-framed horizontal filter:
    // - Rotated 90° CW widescreen videos (rotateMode === 'ccw90'): scale down first for 2.25x faster transpose, then transpose=2 -> crisp 1280x720 16:9
    // - True upright portrait videos: fast blurred ambient fill + upper-biased foreground crop (never slices heads) -> 1280x720 16:9
    const useComplexFilter = isPortrait && rotateMode !== 'ccw90';
    const filterArgs = isPortrait
      ? (rotateMode === 'ccw90'
          ? ['-vf', 'fps=30,scale=720:1280:flags=fast_bilinear,transpose=2,setsar=1']
          : [
              '-filter_complex',
              '[0:v]fps=30,split=2[bg][fg];[bg]scale=320:180:force_original_aspect_ratio=increase,crop=320:180,boxblur=10:2,eq=brightness=-0.10:saturation=1.15,scale=1280:720:flags=fast_bilinear[bg2];[fg]crop=iw:trunc(iw*1.25/2)*2:0:trunc((ih-iw*1.25)*0.18),scale=-2:720:flags=bilinear[fg2];[bg2][fg2]overlay=(W-w)/2:0,setsar=1'
            ])
      : ['-vf', 'fps=30,scale=1280:720:flags=fast_bilinear,setsar=1'];

    void useComplexFilter;

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
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const parsedUrl = new URL(req.url || '', `http://${req.headers?.host || 'localhost'}`);
    let bodyBannerId = '';
    if (req.body && typeof req.body === 'object' && typeof req.body.bannerId === 'string') {
      bodyBannerId = req.body.bannerId;
    } else if (typeof req.body === 'string') {
      try {
        const parsed = JSON.parse(req.body);
        if (typeof parsed?.bannerId === 'string') bodyBannerId = parsed.bannerId;
      } catch {}
    }

    const bannerId = String(parsedUrl.searchParams.get('bannerId') || bodyBannerId || '').trim();
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
      let pending = inFlightAdaptations.get(bannerId);
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
          inFlightAdaptations.delete(bannerId);
        });
        inFlightAdaptations.set(bannerId, pending);
      }
      outputBuffer = await pending;
    }

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Length', outputBuffer.length);
    res.setHeader('Cache-Control', 'public, max-age=600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Banner-Adapted', 'horizontal');
    res.setHeader('X-Banner-Dimensions', '1280x720');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Type, X-Banner-Adapted, X-Banner-Dimensions');
    res.status(200).send(outputBuffer);
  } catch (err: any) {
    console.error('[api/adapt-banner] Error:', err?.message || err);
    res.status(502).json({
      success: false,
      error: err?.message || 'Gagal menyesuaikan orientasi banner menjadi horizontal.'
    });
  }
}
