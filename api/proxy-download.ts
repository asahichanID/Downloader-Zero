import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import NodeID3 from 'node-id3';
import ffmpegStaticPath from 'ffmpeg-static';
import { extractMedia, detectPlatform, resolveTikTokDownload, resolveYouTubeServer2, resolveSpotifyFullAudioServer2 } from './_utils/scraper.ts';

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

function getFfprobeCandidates(ffmpegBin?: string): string[] {
  const list: string[] = [];
  if (ffmpegBin && path.isAbsolute(ffmpegBin)) {
    const sibling = path.join(path.dirname(ffmpegBin), process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe');
    if (fs.existsSync(sibling) && !list.includes(sibling)) {
      list.push(sibling);
    }
  }
  for (const sysPath of ['/usr/bin/ffprobe', '/usr/local/bin/ffprobe']) {
    if (fs.existsSync(sysPath) && !list.includes(sysPath)) {
      list.push(sysPath);
    }
  }
  if (!list.includes('ffprobe')) {
    list.push('ffprobe');
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

function parseAvcCFromMp4Buffer(buf: Buffer): { profile: number; compat: number; level: number } | null {
  const idx = buf.indexOf(Buffer.from('avcC'));
  if (idx === -1 || idx + 8 >= buf.length) return null;
  if (buf[idx + 4] !== 1) return null;
  return {
    profile: buf[idx + 5],
    compat: buf[idx + 6],
    level: buf[idx + 7]
  };
}

function pickH264LevelForStream(
  w: number,
  h: number,
  fps: number
): { levelStr: string; levelByte: number; maxDpbMbs: number } {
  const mbW = Math.ceil(Math.max(16, w) / 16);
  const mbH = Math.ceil(Math.max(16, h) / 16);
  const frameMbs = mbW * mbH;
  const mbPerSec = frameMbs * Math.max(1, Math.ceil(fps || 30));

  const levels = [
    { levelStr: '4.1', levelByte: 41, maxFrameMbs: 8192, maxMbPerSec: 245760, maxDpbMbs: 32768 },
    { levelStr: '4.2', levelByte: 42, maxFrameMbs: 8704, maxMbPerSec: 522240, maxDpbMbs: 34816 },
    { levelStr: '5.0', levelByte: 50, maxFrameMbs: 22080, maxMbPerSec: 589824, maxDpbMbs: 110400 },
    { levelStr: '5.1', levelByte: 51, maxFrameMbs: 36864, maxMbPerSec: 983040, maxDpbMbs: 184320 },
    { levelStr: '5.2', levelByte: 52, maxFrameMbs: 36864, maxMbPerSec: 2073600, maxDpbMbs: 184320 }
  ];

  for (const lvl of levels) {
    if (frameMbs <= lvl.maxFrameMbs && mbPerSec <= lvl.maxMbPerSec) {
      return lvl;
    }
  }
  return levels[levels.length - 1];
}

async function normalizeTikTokMp4ForCompat(
  inputBuffer: Buffer,
  targetResTier: '360p' | '480p' | '720p' | '1080p' | '2k' | '4k' = '1080p',
  targetFps?: number,
  enforceTierCap = true,
  strictTikTokCompat = true
): Promise<Buffer> {
  const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const tmpInPath = path.join(os.tmpdir(), `dz_api_tt_in_${uid}.mp4`);
  const tmpOutPath = path.join(os.tmpdir(), `dz_api_tt_out_${uid}.mp4`);
  const ffmpegBins = getFfmpegCandidates();

  const runSpawn = (
    bin: string,
    args: string[],
    collectStderr = true,
    collectStdout = false
  ): Promise<{ code: number; stderr: string; stdout: string }> =>
    new Promise((resolve, reject) => {
      const ff = spawn(bin, args, { stdio: ['ignore', collectStdout ? 'pipe' : 'ignore', 'pipe'] });
      let errText = '';
      let outText = '';
      if (collectStdout && ff.stdout) {
        ff.stdout.on('data', (chunk: Buffer) => {
          outText += chunk.toString('utf8');
          if (outText.length > 512000) {
            outText = outText.slice(-512000);
          }
        });
      }
      if (collectStderr && ff.stderr) {
        ff.stderr.on('data', (chunk: Buffer) => {
          errText += chunk.toString('utf8');
          if (errText.length > 32000) {
            errText = errText.slice(-24000);
          }
        });
      }
      ff.on('error', (err) => reject(err));
      ff.on('close', (code) => resolve({ code: code ?? -1, stderr: errText, stdout: outText }));
    });

  const tempSegPaths: string[] = [];
  const tmpConcatPath = path.join(os.tmpdir(), `dz_api_tt_concat_${uid}.txt`);

  try {
    fs.writeFileSync(tmpInPath, inputBuffer);

    let workingBin = ffmpegBins[0] || 'ffmpeg';
    let probeStderr = '';
    for (const bin of ffmpegBins) {
      try {
        const probeRes = await runSpawn(bin, ['-hide_banner', '-i', tmpInPath], true);
        if (/Input #0,|Stream #0:/i.test(probeRes.stderr)) {
          workingBin = bin;
          probeStderr = probeRes.stderr;
          break;
        }
      } catch {}
    }

    if (!probeStderr) {
      throw new Error('Berkas video tidak dapat dibaca atau rusak dari sumber.');
    }

    const vMatch = probeStderr.match(/Stream #0:\d+[^\n]*?Video:\s*([^\n]+)/i);
    if (!vMatch?.[1]) {
      throw new Error('Stream video tidak ditemukan dalam berkas media.');
    }
    const vLine = vMatch[1];
    const vCodec = vLine.split(/[\s(,]+/)[0].toLowerCase();
    const vProfile = (vLine.match(/^[^(]+\(([^)]+)\)/)?.[1] || '').toLowerCase();
    const dimMatch = vLine.match(/\b(\d{2,5})x(\d{2,5})\b/);
    const width = dimMatch ? Number(dimMatch[1]) : 0;
    const height = dimMatch ? Number(dimMatch[2]) : 0;
    const pixFmt = (vLine.match(/\b(yuv[a-z0-9_]+|nv12|nv21|rgb\d+|gbrp[a-z0-9_]*)\b/i)?.[1] || '').toLowerCase();
    const vBitrateMatch = vLine.match(/(\d+)\s*kb\/s/i);
    const vBitrateKbps = vBitrateMatch ? Number(vBitrateMatch[1]) : 0;

    const parseFraction = (raw?: string): number => {
      if (!raw) return 0;
      const parts = String(raw).split('/');
      if (parts.length === 2) {
        const num = Number(parts[0]);
        const den = Number(parts[1]);
        return Number.isFinite(num) && Number.isFinite(den) && den > 0 ? num / den : 0;
      }
      const val = Number(raw);
      return Number.isFinite(val) ? val : 0;
    };

    const durMatch = probeStderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/i);
    const containerDurationSec = durMatch
      ? Number(durMatch[1]) * 3600 + Number(durMatch[2]) * 60 + Number(durMatch[3])
      : 0;

    let workingProbeBin: string | null = null;
    let videoStartTime = 0;
    let videoStreamDurationSec = 0;
    let probedNbFrames = 0;
    let rFps = 0;
    let avgFps = 0;

    for (const fpBin of getFfprobeCandidates(workingBin)) {
      try {
        const fpRes = await runSpawn(
          fpBin,
          [
            '-v', 'error', '-select_streams', 'v:0',
            '-show_entries', 'stream=start_time,duration,nb_frames,r_frame_rate,avg_frame_rate',
            '-of', 'json', tmpInPath
          ],
          true,
          true
        );
        if (fpRes.code === 0 && fpRes.stdout.trim()) {
          const parsed = JSON.parse(fpRes.stdout);
          const streamInfo = parsed?.streams?.[0];
          if (streamInfo) {
            workingProbeBin = fpBin;
            const stVal = Number(streamInfo.start_time);
            if (Number.isFinite(stVal)) videoStartTime = stVal;
            const sdVal = Number(streamInfo.duration);
            if (Number.isFinite(sdVal) && sdVal > 0) videoStreamDurationSec = sdVal;
            const nbVal = Number(streamInfo.nb_frames);
            if (Number.isFinite(nbVal) && nbVal > 0) probedNbFrames = nbVal;
            rFps = parseFraction(streamInfo.r_frame_rate);
            avgFps = parseFraction(streamInfo.avg_frame_rate);
            break;
          }
        }
      } catch {}
    }

    if (!workingProbeBin && !probedNbFrames) {
      try {
        const pktProbe = await runSpawn(workingBin, ['-hide_banner', '-i', tmpInPath, '-map', '0:v:0', '-c', 'copy', '-f', 'null', '-'], true);
        const fMatches = [...pktProbe.stderr.matchAll(/\bframe=\s*(\d+)/g)];
        if (fMatches.length > 0) {
          const n = Number(fMatches[fMatches.length - 1][1]);
          if (Number.isFinite(n) && n > 0) probedNbFrames = n;
        }
      } catch {}
    }

    const explicitFpsM = vLine.match(/\b(\d+(?:\.\d+)?)\s*fps\b/i);
    const tbrM = vLine.match(/\b(\d+(?:\.\d+)?)\s*tbr\b/i);
    const rawSrcFps =
      (avgFps >= 5 && avgFps <= 240 ? avgFps : 0) ||
      (explicitFpsM ? Number(explicitFpsM[1]) : 0) ||
      (rFps >= 5 && rFps <= 240 ? rFps : 0) ||
      (tbrM ? Number(tbrM[1]) : 30);
    const srcFps = Number.isFinite(rawSrcFps) && rawSrcFps >= 5 && rawSrcFps <= 240 ? rawSrcFps : 30;
    const hasReliableSrcFps = Boolean((explicitFpsM || (avgFps >= 10 && avgFps <= 240)) && srcFps >= 10 && srcFps <= 240);

    const fpsMatches = !targetFps || (hasReliableSrcFps && Math.abs(srcFps - targetFps) <= 0.8);

    const frameDerivedDur = (probedNbFrames > 0 && srcFps > 0) ? (probedNbFrames / srcFps) : 0;
    const durationSec = videoStreamDurationSec > 0
      ? videoStreamDurationSec
      : (frameDerivedDur > 0 ? frameDerivedDur : containerDurationSec);

    const aMatch = probeStderr.match(/Stream #0:\d+[^\n]*?Audio:\s*([^\n]+)/i);
    const hasAudio = Boolean(aMatch?.[1]);
    const aLine = aMatch?.[1] || '';
    const aCodec = hasAudio ? aLine.split(/[\s(,]+/)[0].toLowerCase() : '';
    const aProfile = hasAudio ? (aLine.match(/^[^(]+\(([^)]+)\)/)?.[1] || '').toLowerCase() : '';
    const aSr = hasAudio ? Number(aLine.match(/\b(\d{4,6})\s*Hz/i)?.[1] || 0) : 0;
    const isStereoOrMono = /\b(stereo|mono|2 channels|1 channels)\b/i.test(aLine);
    const isStandardAacLc =
      aCodec === 'aac' &&
      (aProfile === '' || aProfile === 'lc') &&
      (aSr === 44100 || aSr === 48000) &&
      isStereoOrMono;

    const maxShortSide =
      targetResTier === '360p' ? 360
        : targetResTier === '480p' ? 480
          : targetResTier === '720p' ? 720
            : targetResTier === '1080p' ? 1080
              : targetResTier === '2k' ? 1440
                : 2160;
    const maxLongSide =
      targetResTier === '360p' ? 640
        : targetResTier === '480p' ? 854
          : targetResTier === '720p' ? 1280
            : targetResTier === '1080p' ? 1920
              : targetResTier === '2k' ? 2560
                : 3840;
    const srcShortSide = Math.min(width, height);
    const srcLongSide = Math.max(width, height);
    const fitsTargetRes =
      !enforceTierCap ||
      (width > 0 &&
        height > 0 &&
        srcShortSide <= maxShortSide &&
        srcLongSide <= maxLongSide);

    if (!strictTikTokCompat && fpsMatches && fitsTargetRes) {
      return inputBuffer;
    }

    const srcLevelSpec = pickH264LevelForStream(width || 1080, height || 1920, srcFps);
    const avcCInfo = vCodec === 'h264' ? parseAvcCFromMp4Buffer(inputBuffer) : null;
    let spsLevel = avcCInfo?.level ?? 0;
    let spsMaxRefs = 0;

    const looksCandidateH264 =
      vCodec === 'h264' &&
      pixFmt === 'yuv420p' &&
      !/high\s*10|4:?2:?2|4:?4:?4/i.test(vProfile) &&
      width > 0 &&
      height > 0 &&
      width % 2 === 0 &&
      height % 2 === 0 &&
      fitsTargetRes &&
      fpsMatches &&
      (spsLevel === 0 || spsLevel <= srcLevelSpec.levelByte);

    if (looksCandidateH264) {
      try {
        const spsProbe = await runSpawn(
          workingBin,
          ['-hide_banner', '-v', 'info', '-i', tmpInPath, '-frames:v', '1', '-c:v', 'copy', '-bsf:v', 'trace_headers', '-f', 'null', '-'],
          true
        );
        const lvlM = spsProbe.stderr.match(/\blevel_idc\s+[01]+\s*=\s*(\d+)/i);
        if (lvlM?.[1]) spsLevel = Number(lvlM[1]);
        const refM = spsProbe.stderr.match(/\bmax_num_ref_frames\s+[01]+\s*=\s*(\d+)/i);
        if (refM?.[1]) spsMaxRefs = Number(refM[1]);
      } catch {}
    }

    const mbW = Math.ceil(Math.max(16, width) / 16);
    const mbH = Math.ceil(Math.max(16, height) / 16);
    const srcMaxDpbRefs = Math.max(1, Math.floor(srcLevelSpec.maxDpbMbs / Math.max(1, mbW * mbH)));

    const isStandardH264 =
      looksCandidateH264 &&
      fpsMatches &&
      spsLevel > 0 &&
      spsLevel <= srcLevelSpec.levelByte &&
      spsMaxRefs > 0 &&
      spsMaxRefs <= Math.min(8, srcMaxDpbRefs);

    if (isStandardH264) {
      const remuxArgs = [
        '-y', '-i', tmpInPath,
        '-map', '0:v:0', ...(hasAudio ? ['-map', '0:a:0'] : []),
        '-c:v', 'copy',
        ...(hasAudio
          ? (isStandardAacLc
              ? ['-c:a', 'copy']
              : ['-c:a', 'aac', '-profile:a', 'aac_low', '-b:a', '192k', '-ar', '44100', '-ac', '2'])
          : []),
        '-movflags', '+faststart', '-brand', 'mp42', '-map_metadata', '-1',
        '-f', 'mp4', tmpOutPath
      ];
      const remuxRes = await runSpawn(workingBin, remuxArgs, true);
      if (remuxRes.code === 0 && fs.existsSync(tmpOutPath)) {
        const outStat = fs.statSync(tmpOutPath);
        if (outStat.size > 1024) {
          let hasBitstreamCorruption = false;
          if (outStat.size <= 80 * 1024 * 1024) {
            const verifyRes = await runSpawn(workingBin, ['-v', 'error', '-i', tmpOutPath, '-f', 'null', '-'], true);
            if (/corrupt decoded frame|concealing .* errors|non-existing PPS|Missing reference picture|Invalid NAL unit|moov atom not found|error while decoding MB/i.test(verifyRes.stderr)) {
              hasBitstreamCorruption = true;
            }
          }
          if (!hasBitstreamCorruption) {
            return fs.readFileSync(tmpOutPath);
          }
        }
      }
      try { if (fs.existsSync(tmpOutPath)) fs.unlinkSync(tmpOutPath); } catch {}
    }

    let targetW = width > 0 ? width - (width % 2) : 0;
    let targetH = height > 0 ? height - (height % 2) : 0;
    if (enforceTierCap && width > 0 && height > 0 && (srcShortSide > maxShortSide || srcLongSide > maxLongSide)) {
      const scaleFactor = Math.min(maxShortSide / Math.max(1, srcShortSide), maxLongSide / Math.max(1, srcLongSide));
      targetW = Math.max(2, Math.floor((width * scaleFactor) / 2) * 2);
      targetH = Math.max(2, Math.floor((height * scaleFactor) / 2) * 2);
    }
    const baseScaleFilter = (targetW > 0 && targetH > 0 && (targetW !== width || targetH !== height))
      ? `scale=${targetW}:${targetH}:flags=lanczos`
      : 'scale=trunc(iw/2)*2:trunc(ih/2)*2';

    const effectiveOutFps = targetFps || srcFps || 30;
    const needsFpsConvert = Boolean(targetFps && !fpsMatches);
    const isFpsUpsample = needsFpsConvert && effectiveOutFps > srcFps + 0.8;

    const outW = targetW || width || 1080;
    const outH = targetH || height || 1920;
    const outLevelSpec = pickH264LevelForStream(outW, outH, effectiveOutFps);
    const outFrameMbs = Math.max(1, Math.ceil(outW / 16) * Math.ceil(outH / 16));
    const outDpbMaxRefs = Math.max(1, Math.floor(outLevelSpec.maxDpbMbs / outFrameMbs));
    const targetRefs = outDpbMaxRefs >= 4 ? 2 : 1;
    const isHighFps = effectiveOutFps > 32;
    const isUltraFps = effectiveOutFps > 75;

    const effectiveResTier: '360p' | '480p' | '720p' | '1080p' | '2k' | '4k' = enforceTierCap
      ? targetResTier
      : (srcShortSide >= 2000 || srcLongSide >= 3500) ? '4k'
        : (srcShortSide >= 1300 || srcLongSide >= 2400) ? '2k'
          : (srcShortSide >= 900 || srcLongSide >= 1700) ? '1080p'
            : (srcShortSide >= 600 || srcLongSide >= 1100) ? '720p'
              : (srcShortSide >= 420 || srcLongSide >= 760) ? '480p'
                : '360p';

    const estSrcKbps = vBitrateKbps > 0
      ? vBitrateKbps
      : Math.max(1200, Math.round((inputBuffer.length * 8) / Math.max(1, durationSec || 15) / 1000));
    const fpsBitrateMult = isUltraFps ? 1.35 : 1.0;
    const tierMaxCap = Math.round(
      (effectiveResTier === '360p' ? (isHighFps ? 1800 : 1200)
        : effectiveResTier === '480p' ? (isHighFps ? 3200 : 2200)
          : effectiveResTier === '720p' ? (isHighFps ? 6500 : 4500)
            : effectiveResTier === '1080p' ? (isHighFps ? 12000 : 8000)
              : effectiveResTier === '2k' ? (isHighFps ? 18000 : 12000)
                : (isHighFps ? 26000 : 18000)) * fpsBitrateMult
    );
    const tierMinCap = Math.round(
      (effectiveResTier === '360p' ? 600
        : effectiveResTier === '480p' ? 1200
          : effectiveResTier === '720p' ? 2500
            : effectiveResTier === '1080p' ? (isHighFps ? 7000 : 4000)
              : effectiveResTier === '2k' ? (isHighFps ? 10000 : 6500)
                : (isHighFps ? 14000 : 9000)) * fpsBitrateMult
    );
    const capKbps = Math.min(tierMaxCap, Math.max(tierMinCap, Math.round(estSrcKbps * (isUltraFps ? 3.8 : isHighFps ? 3.2 : 2.0))));
    const crfVal = (effectiveResTier === '360p' || effectiveResTier === '480p') ? '19' : '18';
    const gopSize = Math.max(24, Math.min(240, Math.round(effectiveOutFps * 2)));
    const preset = 'superfast';
    const timescaleVal = Math.max(24000, Math.round(effectiveOutFps * 1000));

    const mciWorkUnits = durationSec * ((outW * outH) / (1280 * 720));
    const useTrueMotionMci = isFpsUpsample && (durationSec <= 0 || mciWorkUnits <= 180);
    const mciFilter = `minterpolate=fps=${effectiveOutFps}:mi_mode=mci:mc_mode=aobmc:me_mode=bilat:me=epzs:mb_size=16:search_param=32:vsbmc=1:scd=fdiff:scd_threshold=20`;
    const safeSrcFpsStr = Math.max(10, Math.min(240, srcFps)).toFixed(3);
    const totalOutFrames = durationSec > 0 ? Math.max(1, Math.round(durationSec * effectiveOutFps)) : 0;

    const startShiftStep = Math.abs(videoStartTime) > 0.0001
      ? `setpts=PTS-${videoStartTime.toFixed(6)}/TB`
      : 'setpts=PTS-STARTPTS';
    const tailPadSteps = [
      'tpad=stop=15:stop_mode=clone',
      `setpts='if(gt(N,0)*lte(PTS,PREV_INPTS),PREV_OUTPTS+1/(${safeSrcFpsStr}*TB),PTS)'`
    ];

    const videoFilter = needsFpsConvert
      ? (isFpsUpsample
          ? (useTrueMotionMci
              ? `${baseScaleFilter},format=yuv420p,${startShiftStep},${tailPadSteps.join(',')},${mciFilter}${durationSec > 0 ? `,trim=duration=${(durationSec + 0.05).toFixed(6)}` : ''},setpts=N/(${effectiveOutFps}*TB)`
              : `${baseScaleFilter},format=yuv420p,framerate=fps=${effectiveOutFps}:interp_start=0:interp_end=255:scene=8.2`)
          : `${baseScaleFilter},format=yuv420p,fps=${effectiveOutFps}`)
      : `${baseScaleFilter},format=yuv420p`;
    const fpsModeVal = needsFpsConvert ? 'cfr' : 'passthrough';

    const commonEncoderArgs = [
      '-c:v', 'libx264', '-profile:v', 'high', '-level', outLevelSpec.levelStr, '-pix_fmt', 'yuv420p',
      '-refs', String(targetRefs), '-bf', '2', '-g', String(gopSize), '-sc_threshold', '0',
      '-preset', preset, '-crf', crfVal, '-maxrate', `${capKbps}k`, '-bufsize', `${capKbps * 2}k`
    ];
    const segmentEncoderArgs = [
      '-c:v', 'libx264', '-profile:v', 'high', '-level', outLevelSpec.levelStr, '-pix_fmt', 'yuv420p',
      '-refs', String(targetRefs), '-bf', '0', '-g', String(gopSize), '-sc_threshold', '0',
      '-preset', preset, '-crf', crfVal, '-maxrate', `${capKbps}k`, '-bufsize', `${capKbps * 2}k`
    ];

    let encodedOk = false;
    let lastEncErr = '';

    const numWorkers = useTrueMotionMci && durationSec >= 4 && totalOutFrames >= 60
      ? Math.max(1, Math.min(4, os.cpus().length || 2))
      : 1;

    if (numWorkers > 1) {
      try {
        const padSec = 0.40;

        await Promise.all(
          Array.from({ length: numWorkers }, async (_unused, idx) => {
            const startF = Math.round((idx * totalOutFrames) / numWorkers);
            const isLast = idx === numWorkers - 1;
            const endF = isLast ? totalOutFrames : Math.round(((idx + 1) * totalOutFrames) / numWorkers);
            const segCount = Math.max(1, endF - startF);
            const segStart = startF / effectiveOutFps;
            const segEnd = endF / effectiveOutFps;
            const segDur = segCount / effectiveOutFps;
            const readStart = Math.max(0, segStart - padSec);
            const readEnd = Math.min(durationSec, segEnd + padSec);
            const seekBefore = Math.max(0, videoStartTime + readStart - 2.0);
            const trimStart = segStart - readStart;
            const segOutPath = path.join(os.tmpdir(), `dz_api_tt_seg_${uid}_${idx}.mp4`);
            tempSegPaths[idx] = segOutPath;

            const chunkFilters = [
              baseScaleFilter,
              'format=yuv420p',
              ...(Math.abs(videoStartTime) > 0.0001 ? [`setpts=PTS-${videoStartTime.toFixed(6)}/TB`] : []),
              `trim=start=${readStart.toFixed(6)}${isLast ? '' : `:end=${readEnd.toFixed(6)}`}`,
              `setpts=PTS-${readStart.toFixed(6)}/TB`,
              ...(isLast ? tailPadSteps : []),
              mciFilter,
              `trim=start=${trimStart.toFixed(6)}:duration=${(segDur + 0.05).toFixed(6)}`,
              `setpts=N/(${effectiveOutFps}*TB)`
            ];

            const segArgs = [
              '-y',
              ...(seekBefore > 0.1 ? ['-ss', seekBefore.toFixed(3), '-copyts'] : []),
              '-i', tmpInPath,
              '-map', '0:v:0',
              '-vf', chunkFilters.join(','),
              '-frames:v', String(segCount),
              '-r', String(effectiveOutFps),
              '-fps_mode', 'cfr',
              '-threads', '1',
              ...segmentEncoderArgs,
              '-video_track_timescale', String(timescaleVal),
              '-an', '-f', 'mp4', segOutPath
            ];

            const segRes = await runSpawn(workingBin, segArgs, true);
            if (segRes.code !== 0 || !fs.existsSync(segOutPath) || fs.statSync(segOutPath).size < 256) {
              throw new Error(`Segment ${idx} MCI failed: ${segRes.stderr.slice(-200)}`);
            }
          })
        );

        fs.writeFileSync(
          tmpConcatPath,
          tempSegPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n')
        );

        const concatArgs = [
          '-y', '-f', 'concat', '-safe', '0', '-i', tmpConcatPath, '-i', tmpInPath,
          '-map', '0:v:0', ...(hasAudio ? ['-map', '1:a:0'] : []),
          '-c:v', 'copy',
          ...(hasAudio
            ? (isStandardAacLc
                ? ['-c:a', 'copy']
                : ['-c:a', 'aac', '-profile:a', 'aac_low', '-b:a', '192k', '-ar', '44100', '-ac', '2'])
            : []),
          '-video_track_timescale', String(timescaleVal),
          '-movflags', '+faststart', '-brand', 'mp42', '-map_metadata', '-1',
          '-f', 'mp4', tmpOutPath
        ];
        const concatRes = await runSpawn(workingBin, concatArgs, true);
        if (concatRes.code === 0 && fs.existsSync(tmpOutPath) && fs.statSync(tmpOutPath).size > 1024) {
          encodedOk = true;
        } else {
          lastEncErr = concatRes.stderr.slice(-200);
        }
      } catch (parErr: any) {
        lastEncErr = parErr?.message || 'Parallel MCI notice';
        try { if (fs.existsSync(tmpOutPath)) fs.unlinkSync(tmpOutPath); } catch {}
      }
    }

    if (!encodedOk) {
      const transcodeArgs = [
        '-y', '-i', tmpInPath,
        '-map', '0:v:0', ...(hasAudio ? ['-map', '0:a:0'] : []),
        '-vf', videoFilter,
        ...(useTrueMotionMci && totalOutFrames > 0 ? ['-frames:v', String(totalOutFrames)] : []),
        ...(needsFpsConvert ? ['-r', String(effectiveOutFps)] : []),
        '-fps_mode', fpsModeVal,
        '-threads', '0',
        ...commonEncoderArgs,
        ...(needsFpsConvert ? ['-video_track_timescale', String(timescaleVal)] : []),
        ...(hasAudio ? ['-c:a', 'aac', '-profile:a', 'aac_low', '-b:a', '192k', '-ar', '44100', '-ac', '2'] : []),
        '-movflags', '+faststart', '-brand', 'mp42', '-map_metadata', '-1',
        '-f', 'mp4', tmpOutPath
      ];

      const encRes = await runSpawn(workingBin, transcodeArgs, true);
      if (encRes.code === 0 && fs.existsSync(tmpOutPath) && fs.statSync(tmpOutPath).size > 1024) {
        encodedOk = true;
      } else {
        lastEncErr = encRes.stderr.slice(-200);
      }
    }

    if (encodedOk && fs.existsSync(tmpOutPath)) {
      const outProbeRes = await runSpawn(workingBin, ['-hide_banner', '-i', tmpOutPath], true);
      const outVMatch = outProbeRes.stderr.match(/Stream #0:\d+[^\n]*?Video:\s*([^\n]+)/i);
      if (!outVMatch?.[1]) {
        throw new Error('Validasi gagal: stream video tidak ditemukan pada file output.');
      }
      const outVLine = outVMatch[1];
      const outFpsM = outVLine.match(/\b(\d+(?:\.\d+)?)\s*fps\b/i) || outVLine.match(/\b(\d+(?:\.\d+)?)\s*tbr\b/i);
      const measuredOutFps = outFpsM ? Number(outFpsM[1]) : 0;

      if ((needsFpsConvert || targetFps) && (!measuredOutFps || Math.abs(measuredOutFps - effectiveOutFps) > 1.0)) {
        throw new Error(
          `Validasi FPS output tidak sesuai: target ${effectiveOutFps} FPS, terdeteksi ${measuredOutFps || 'tidak diketahui'} FPS.`
        );
      }

      if (needsFpsConvert || targetFps) {
        let verifiedFrameCount = 0;
        if (workingProbeBin) {
          try {
            const ptsRes = await runSpawn(
              workingProbeBin,
              [
                '-v', 'error', '-select_streams', 'v:0',
                '-show_entries', 'packet=pts_time',
                '-of', 'default=noprint_wrappers=1:nokey=1', tmpOutPath
              ],
              true,
              true
            );
            if (ptsRes.code === 0 && ptsRes.stdout.trim()) {
              const ptsList = ptsRes.stdout
                .trim()
                .split('\n')
                .map((s) => Number(s.trim()))
                .filter((n) => Number.isFinite(n))
                .sort((a, b) => a - b);
              verifiedFrameCount = ptsList.length;
              if (ptsList.length >= 4) {
                const expectedStepMs = 1000 / effectiveOutFps;
                let totalDeltaMs = 0;
                let jitteryCount = 0;
                for (let i = 1; i < ptsList.length; i++) {
                  const dMs = (ptsList[i] - ptsList[i - 1]) * 1000;
                  totalDeltaMs += dMs;
                  if (Math.abs(dMs - expectedStepMs) > Math.max(2.0, expectedStepMs * 0.25)) {
                    jitteryCount++;
                  }
                }
                const avgDeltaMs = totalDeltaMs / (ptsList.length - 1);
                const realFpsFromPts = avgDeltaMs > 0 ? 1000 / avgDeltaMs : 0;
                if (Math.abs(realFpsFromPts - effectiveOutFps) > 1.5 || jitteryCount > Math.max(2, Math.floor(ptsList.length * 0.02))) {
                  throw new Error(
                    `Validasi pacing frame gagal: target ${effectiveOutFps} FPS (~${expectedStepMs.toFixed(2)}ms/frame), terukur ${realFpsFromPts.toFixed(2)} FPS (${jitteryCount} interval tidak stabil).`
                  );
                }
              }
            }
          } catch (valErr: any) {
            if (valErr?.message?.startsWith('Validasi pacing')) throw valErr;
          }
        }

        if (!verifiedFrameCount) {
          const cntRes = await runSpawn(workingBin, ['-hide_banner', '-i', tmpOutPath, '-map', '0:v:0', '-c', 'copy', '-f', 'null', '-'], true);
          const fMatches = [...cntRes.stderr.matchAll(/\bframe=\s*(\d+)/g)];
          if (fMatches.length > 0) {
            verifiedFrameCount = Number(fMatches[fMatches.length - 1][1]) || 0;
          }
        }

        if (totalOutFrames > 0 && verifiedFrameCount > 0 && verifiedFrameCount < Math.max(1, totalOutFrames - 3)) {
          throw new Error(
            `Validasi jumlah frame gagal: diharapkan ${totalOutFrames} frame pada ${effectiveOutFps} FPS, namun hanya terbentuk ${verifiedFrameCount} frame.`
          );
        }
      }

      const out = fs.readFileSync(tmpOutPath);
      if (out.length > 1024) {
        return out;
      }
    }
    throw new Error(`Konversi kompatibilitas MP4 gagal (${lastEncErr})`);
  } finally {
    for (const segPath of tempSegPaths) {
      try { if (segPath && fs.existsSync(segPath)) fs.unlinkSync(segPath); } catch {}
    }
    try { if (fs.existsSync(tmpConcatPath)) fs.unlinkSync(tmpConcatPath); } catch {}
    try { if (fs.existsSync(tmpInPath)) fs.unlinkSync(tmpInPath); } catch {}
    try { if (fs.existsSync(tmpOutPath)) fs.unlinkSync(tmpOutPath); } catch {}
  }
}

// In-memory process cache for Spotify MP3 files (automatically purged 15 seconds after completion)
const spotifyProcessCache = new Map<string, { buffer: Buffer; timestamp: number }>();
// Short-lived cache for DASH video+audio muxed MP4 streams
const dashMuxCache = new Map<string, { buffer: Buffer; timestamp: number }>();
// Short-lived cache + inflight dedup for normalized WhatsApp/Gallery-compatible TikTok MP4s
const tiktokMp4Cache = new Map<string, { buffer: Buffer; timestamp: number }>();
const tiktokMp4Inflight = new Map<string, Promise<Buffer>>();
// Short-lived cache + inflight dedup for FPS-converted / pre-measured general video MP4s
const videoFpsCache = new Map<string, { buffer: Buffer; timestamp: number }>();
const videoFpsInflight = new Map<string, Promise<Buffer | { streamedSize: number }>>();

function setVideoFpsCache(key: string, buffer: Buffer) {
  const MAX_SINGLE_BYTES = 120 * 1024 * 1024;
  const MAX_TOTAL_BYTES = 180 * 1024 * 1024;
  if (buffer.length > MAX_SINGLE_BYTES) return;
  const now = Date.now();
  for (const [k, entry] of videoFpsCache.entries()) {
    if (now - entry.timestamp >= 180000) {
      videoFpsCache.delete(k);
    }
  }
  let totalBytes = 0;
  for (const entry of videoFpsCache.values()) {
    totalBytes += entry.buffer.length;
  }
  while (
    videoFpsCache.size > 0 &&
    (videoFpsCache.size >= 3 || totalBytes + buffer.length > MAX_TOTAL_BYTES)
  ) {
    const oldestKey = videoFpsCache.keys().next().value;
    if (!oldestKey) break;
    const oldest = videoFpsCache.get(oldestKey);
    if (oldest) totalBytes -= oldest.buffer.length;
    videoFpsCache.delete(oldestKey);
  }
  videoFpsCache.set(key, { buffer, timestamp: now });
  setTimeout(() => {
    videoFpsCache.delete(key);
  }, 180000);
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
      const nextParamMatch = extracted.match(/&(?:filename|platform|sourceUrl|title|artist|album|genre|year|cover|apiKey|server|inline|bitrate|duration|audioUrl|res|fps|prepare)=/);
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
    const rawResParam = String(query.res || req.query?.res || '');
    const hasExplicitResTier = /(?:360|480|540|640|720|1080|1440|2k|2160|4k)/i.test(rawResParam);
    const rawResHint = `${rawResParam} ${sanitizedFilename}`.toLowerCase();
    const targetTikTokResTier: '360p' | '480p' | '720p' | '1080p' | '2k' | '4k' =
      rawResHint.includes('360')
        ? '360p'
        : rawResHint.includes('480')
          ? '480p'
          : rawResHint.includes('720')
            ? '720p'
            : rawResHint.includes('4k') || rawResHint.includes('2160')
              ? '4k'
              : rawResHint.includes('2k') || rawResHint.includes('1440')
                ? '2k'
                : '1080p';
    const rawFpsNum = Number(query.fps || req.query?.fps);
    const targetFps: number | undefined =
      Number.isFinite(rawFpsNum) && rawFpsNum >= 15 && rawFpsNum <= 120
        ? Math.min(120, Math.max(24, Math.round(rawFpsNum)))
        : undefined;
    const isPrepareOnly = query.prepare === '1' || req.query?.prepare === '1' || query.prepare === 'true';

    const isCmfvVideo = /\.cmfv(\?|$)/i.test(targetUrl);
    if ((audioUrl || isCmfvVideo) && !wantsMp3OutputEarly) {
      const muxKey = `${targetUrl}::${audioUrl || 'silent'}::${hasExplicitResTier ? targetTikTokResTier : 'orig'}::${targetFps || 'native'}`;
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

        let outMp4 = await muxVideoAndAudioToMp4(vidBuf, audBuf);
        if (targetFps || hasExplicitResTier) {
          outMp4 = await normalizeTikTokMp4ForCompat(outMp4, targetTikTokResTier, targetFps, hasExplicitResTier, false);
        }
        muxedMp4 = outMp4;
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
          resolution: targetTikTokResTier,
          fps: targetFps,
          fpsApplied: Boolean(targetFps)
        });
        return;
      }

      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Accept-Ranges', 'bytes');
      if (targetFps) {
        res.setHeader('X-Video-Fps', String(targetFps));
      }
      res.setHeader(
        'Content-Disposition',
        isInline
          ? `inline; filename="${sanitizedFilename}"`
          : `attachment; filename="${sanitizedFilename}"; filename*=UTF-8''${encodeURIComponent(sanitizedFilename)}`
      );
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Length, Content-Type, Content-Range, Accept-Ranges, X-Video-Fps');
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

    const isImageOutput = /\.(jpg|jpeg|png|webp|gif)$/i.test(sanitizedFilename);
    const isTikTokMp4 =
      !wantsMp3OutputEarly &&
      !isImageOutput &&
      !audioUrl &&
      !isCmfvVideo &&
      (platform === 'tiktok' ||
        detectPlatform(sourceUrl) === 'tiktok' ||
        targetUrl.includes('tiktokcdn') ||
        targetUrl.includes('tikwm.com')) &&
      (sanitizedFilename.toLowerCase().endsWith('.mp4') || /\.mp4(\?|$)/i.test(targetUrl));

    const sendMp4BufferResponse = (mp4Buffer: Buffer) => {
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Accept-Ranges', 'bytes');
      if (targetFps) {
        res.setHeader('X-Video-Fps', String(targetFps));
      }
      res.setHeader(
        'Content-Disposition',
        isInline
          ? `inline; filename="${sanitizedFilename}"`
          : `attachment; filename="${sanitizedFilename}"; filename*=UTF-8''${encodeURIComponent(sanitizedFilename)}`
      );
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Length, Content-Type, Content-Range, Accept-Ranges, X-Video-Fps');
      res.setHeader('Cache-Control', isInline ? 'private, no-cache' : 'no-store, no-cache, must-revalidate, private');
      res.setHeader('X-Content-Type-Options', 'nosniff');

      if (rangeHeader) {
        const totalLen = mp4Buffer.length;
        const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
        if (match) {
          const start = match[1] ? parseInt(match[1], 10) : 0;
          const end = match[2] ? Math.min(parseInt(match[2], 10), totalLen - 1) : totalLen - 1;
          if (!isNaN(start) && !isNaN(end) && start <= end && start < totalLen) {
            const sliced = mp4Buffer.subarray(start, end + 1);
            res.status(206);
            res.setHeader('Content-Range', `bytes ${start}-${end}/${totalLen}`);
            res.setHeader('Content-Length', sliced.length);
            res.send(sliced);
            return;
          }
        }
      }

      res.setHeader('Content-Length', mp4Buffer.length);
      res.send(mp4Buffer);
    };

    const tryReResolveFreshUrl = async (): Promise<string> => {
      if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl)) return '';
      try {
        console.log(`[api/proxy-download] Attempting on-the-fly re-resolution for ${platform || 'media'} (${sourceUrl})...`);
        const reKey = typeof query.apiKey === 'string' && query.apiKey.trim() ? query.apiKey.trim() : undefined;
        const reServer = query.server === 'server1' || query.server === 'server2' || query.server === 'auto' ? query.server : 'auto';
        if (platform === 'tiktok' || detectPlatform(sourceUrl) === 'tiktok') {
          const resTag = rawResHint.includes('4k') || rawResHint.includes('2160')
            ? '4K'
            : rawResHint.includes('2k') || rawResHint.includes('1440')
              ? '2K'
              : rawResHint.includes('720')
                ? '720p'
                : rawResHint.includes('480') || rawResHint.includes('360')
                  ? '480p'
                  : '1080p';
          const resolvedTt = await resolveTikTokDownload(
            sourceUrl,
            wantsMp3OutputEarly ? 'tt-audio' : `tt-${resTag.toLowerCase()}`,
            resTag,
            wantsMp3OutputEarly ? 'audio' : 'video',
            reServer,
            reKey
          );
          if (resolvedTt.downloadUrl?.startsWith('http')) {
            return resolvedTt.downloadUrl;
          }
        }
        const freshMedia = await extractMedia(sourceUrl, reKey, reServer);
        if (freshMedia?.formats?.length) {
          const bestFormat = freshMedia.formats.find((f) => f.isDirect && f.url && f.url.startsWith('http')) || freshMedia.formats[0];
          if (bestFormat?.url?.startsWith('http')) {
            return bestFormat.url;
          }
        }
        if ((platform === 'youtube' || detectPlatform(sourceUrl) === 'youtube') && reServer !== 'server1') {
          const resolvedYt = await resolveYouTubeServer2(
            sourceUrl,
            '',
            wantsMp3OutputEarly ? '320 kbps' : '1080p',
            wantsMp3OutputEarly ? 'audio' : 'video'
          );
          return resolvedYt.downloadUrl;
        }
      } catch (reErr) {
        console.warn('[api/proxy-download] On-the-fly re-resolution notice:', reErr);
      }
      return '';
    };

    if (isTikTokMp4) {
      const ttCacheKey = `${targetUrl}::${targetTikTokResTier}::${targetFps || 'native'}`;
      const cachedEntry = tiktokMp4Cache.get(ttCacheKey);
      if (cachedEntry && Date.now() - cachedEntry.timestamp < 180000) {
        if (isPrepareOnly) {
          res.setHeader('Cache-Control', 'no-store');
          res.json({ success: true, ready: true, size: cachedEntry.buffer.length, resolution: targetTikTokResTier, fps: targetFps });
          return;
        }
        sendMp4BufferResponse(cachedEntry.buffer);
        return;
      }

      let inflightPromise = tiktokMp4Inflight.get(ttCacheKey);
      if (!inflightPromise) {
        inflightPromise = (async (): Promise<Buffer> => {
          const fetchFullTikTokBuffer = async (candidateUrl: string): Promise<Buffer | null> => {
            for (const cfg of fetchCandidateConfigs) {
              try {
                const resCandidate = await fetchWithHeaderTimeout(candidateUrl, { ...cfg.headers }, 25000);
                if (resCandidate.ok && resCandidate.body) {
                  const buf = Buffer.from(await resCandidate.arrayBuffer());
                  if (buf.length >= 1024) {
                    const headText = buf.subarray(0, 512).toString('utf8').trim();
                    const looksLikeErr =
                      headText.startsWith('<!DOCTYPE') ||
                      headText.startsWith('<!doctype') ||
                      headText.startsWith('<html') ||
                      headText.startsWith('{"docs_url"') ||
                      headText.startsWith('{"error_code"') ||
                      headText.startsWith('{"success":false');
                    if (!looksLikeErr) {
                      return buf;
                    }
                  }
                }
              } catch {}
            }
            return null;
          };

          let rawVideoBuf = await fetchFullTikTokBuffer(targetUrl);
          if (!rawVideoBuf) {
            const freshUrl = await tryReResolveFreshUrl();
            if (freshUrl && freshUrl !== targetUrl) {
              rawVideoBuf = await fetchFullTikTokBuffer(freshUrl);
            }
          }
          if (!rawVideoBuf) {
            throw new Error('Gagal mengunduh berkas video TikTok dari server sumber.');
          }

          const normalizedBuf = await normalizeTikTokMp4ForCompat(rawVideoBuf, targetTikTokResTier, targetFps, true, true);

          if (tiktokMp4Cache.size >= 6) {
            const oldestKey = tiktokMp4Cache.keys().next().value;
            if (oldestKey) tiktokMp4Cache.delete(oldestKey);
          }
          tiktokMp4Cache.set(ttCacheKey, { buffer: normalizedBuf, timestamp: Date.now() });
          setTimeout(() => {
            tiktokMp4Cache.delete(ttCacheKey);
          }, 180000);

          return normalizedBuf;
        })();
        tiktokMp4Inflight.set(ttCacheKey, inflightPromise);
        inflightPromise.finally(() => {
          tiktokMp4Inflight.delete(ttCacheKey);
        });
      }

      const normalizedMp4 = await inflightPromise;
      if (isPrepareOnly) {
        res.setHeader('Cache-Control', 'no-store');
        res.json({
          success: true,
          ready: true,
          size: normalizedMp4.length,
          resolution: targetTikTokResTier,
          fps: targetFps,
          fpsApplied: Boolean(targetFps)
        });
        return;
      }
      sendMp4BufferResponse(normalizedMp4);
      return;
    }

    const looksLikeVideoRequest =
      !wantsMp3OutputEarly &&
      !isImageOutput &&
      !isTikTokMp4 &&
      !audioUrl &&
      !isCmfvVideo &&
      (/\.(mp4|mov|webm|m4v|mkv)$/i.test(sanitizedFilename) ||
        /\.(mp4|mov|webm|m4v|mkv)(\?|$)/i.test(targetUrl));

    if (looksLikeVideoRequest && (isPrepareOnly || targetFps)) {
      const genCacheKey = `${targetUrl}::${hasExplicitResTier ? targetTikTokResTier : 'orig'}::${targetFps || 'native'}`;
      const cachedEntry = videoFpsCache.get(genCacheKey);
      if (cachedEntry && Date.now() - cachedEntry.timestamp < 180000) {
        if (isPrepareOnly) {
          res.setHeader('Cache-Control', 'no-store');
          res.json({
            success: true,
            ready: true,
            size: cachedEntry.buffer.length,
            resolution: hasExplicitResTier ? targetTikTokResTier : undefined,
            fps: targetFps,
            fpsApplied: Boolean(targetFps)
          });
          return;
        }
        sendMp4BufferResponse(cachedEntry.buffer);
        return;
      }

      const MAX_BUFFER_BYTES = 120 * 1024 * 1024;
      let inflightPromise = videoFpsInflight.get(genCacheKey);
      if (!inflightPromise) {
        inflightPromise = (async (): Promise<Buffer | { streamedSize: number }> => {
          const tryFetchCandidate = async (urlToFetch: string): Promise<globalThis.Response | null> => {
            for (const cfg of fetchCandidateConfigs) {
              try {
                const resCandidate = await fetchWithHeaderTimeout(urlToFetch, { ...cfg.headers }, 20000);
                if (resCandidate.ok && resCandidate.body) {
                  return resCandidate;
                }
              } catch {}
            }
            return null;
          };

          let vidRes = await tryFetchCandidate(targetUrl);
          if ((!vidRes || !vidRes.ok) && sourceUrl && /^https?:\/\//i.test(sourceUrl)) {
            const freshTargetUrl = await tryReResolveFreshUrl();
            if (freshTargetUrl && freshTargetUrl !== targetUrl && freshTargetUrl.startsWith('http')) {
              targetUrl = freshTargetUrl;
              vidRes = await tryFetchCandidate(targetUrl);
            }
          }
          if (!vidRes || !vidRes.ok || !vidRes.body) {
            throw new Error('Gagal mengunduh berkas video dari tautan sumber.');
          }

          const ctHeader = (vidRes.headers.get('content-type') || '').toLowerCase();
          if (
            ctHeader.includes('image/') ||
            ctHeader.includes('audio/') ||
            ctHeader.includes('application/zip')
          ) {
            try { await vidRes.body.cancel(); } catch {}
            const cl = Number(vidRes.headers.get('content-length') || 0);
            return { streamedSize: Number.isFinite(cl) && cl > 0 ? cl : 0 };
          }

          const clHeader = Number(vidRes.headers.get('content-length') || 0);
          if (Number.isFinite(clHeader) && clHeader > MAX_BUFFER_BYTES) {
            try { await vidRes.body.cancel(); } catch {}
            return { streamedSize: clHeader };
          }

          const reader = vidRes.body.getReader();
          const chunks: Buffer[] = [];
          let totalRead = 0;
          let firstChecked = false;
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!value || value.length === 0) continue;
            const bufChunk = Buffer.from(value);
            if (!firstChecked) {
              firstChecked = true;
              const sampleText = bufChunk.subarray(0, 512).toString('utf8').trim();
              const isErrDoc =
                sampleText.startsWith('<!DOCTYPE html') ||
                sampleText.startsWith('<!doctype html') ||
                sampleText.startsWith('<html') ||
                sampleText.startsWith('{"docs_url"') ||
                sampleText.startsWith('{"error_code"') ||
                sampleText.startsWith('{"success":false');
              if (isErrDoc) {
                try { await reader.cancel(); } catch {}
                throw new Error('Tautan unduhan tidak menghasilkan berkas video yang valid dari server sumber.');
              }
            }
            totalRead += bufChunk.length;
            if (totalRead > MAX_BUFFER_BYTES) {
              try { await reader.cancel(); } catch {}
              return { streamedSize: Number.isFinite(clHeader) && clHeader > 0 ? clHeader : totalRead };
            }
            chunks.push(bufChunk);
          }

          const rawBuf = Buffer.concat(chunks);
          if (rawBuf.length < 1024) {
            throw new Error('Berkas video kosong atau terlalu kecil dari server sumber.');
          }

          let outBuf: Buffer = rawBuf;
          if (targetFps || hasExplicitResTier) {
            outBuf = await normalizeTikTokMp4ForCompat(rawBuf, targetTikTokResTier, targetFps, hasExplicitResTier, false);
          }

          setVideoFpsCache(genCacheKey, outBuf);
          return outBuf;
        })();

        videoFpsInflight.set(genCacheKey, inflightPromise);
        inflightPromise.finally(() => {
          videoFpsInflight.delete(genCacheKey);
        });
      }

      try {
        const result = await inflightPromise;
        if (Buffer.isBuffer(result)) {
          if (isPrepareOnly) {
            res.setHeader('Cache-Control', 'no-store');
            res.json({
              success: true,
              ready: true,
              size: result.length,
              resolution: hasExplicitResTier ? targetTikTokResTier : undefined,
              fps: targetFps,
              fpsApplied: Boolean(targetFps)
            });
            return;
          }
          sendMp4BufferResponse(result);
          return;
        }
        if (isPrepareOnly) {
          res.setHeader('Cache-Control', 'no-store');
          res.json({ success: true, ready: true, size: result.streamedSize, streamed: true, fps: undefined, fpsApplied: false });
          return;
        }
      } catch (prepErr: any) {
        if (isPrepareOnly) {
          res.status(502).json({ success: false, error: prepErr?.message || 'Gagal menyiapkan video.' });
          return;
        }
        if (targetFps) {
          res.status(502).json({ success: false, error: prepErr?.message || `Gagal mengonversi video ke ${targetFps} FPS.` });
          return;
        }
        console.warn('[api/proxy-download] General video FPS/prepare fallback to streaming:', prepErr?.message || prepErr);
      }
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
      const freshTargetUrl = await tryReResolveFreshUrl();
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
