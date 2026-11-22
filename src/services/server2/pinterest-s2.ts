/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as cheerio from 'cheerio';
import type { MediaMetadata, MediaFormat } from '../../types/index.ts';

function formatDuration(seconds?: number): string {
  if (!seconds || isNaN(seconds) || seconds <= 0) return '00:00';
  const s = Math.round(seconds);
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hrs > 0) {
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function formatBytes(bytes?: number): string {
  if (!bytes || isNaN(bytes) || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let val = bytes;
  let idx = 0;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx++;
  }
  return `${val.toFixed(1)} ${units[idx]}`;
}

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36';

/**
 * Resolves pin.it short URLs and regional Pinterest URLs to canonical /pin/{id}/ URLs.
 */
async function resolvePinterestUrl(rawUrl: string): Promise<string> {
  let trimmed = rawUrl.trim();
  if (/(?:pin\.it|pinterest\.com\/url_shortener)/i.test(trimmed)) {
    try {
      const res = await fetch(trimmed, {
        method: 'GET',
        redirect: 'follow',
        headers: {
          'User-Agent': DESKTOP_UA,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        signal: AbortSignal.timeout(8000)
      });
      if (res.url && res.url.startsWith('http') && res.url !== trimmed) {
        trimmed = res.url;
      }
    } catch {}
  }
  return trimmed;
}

function extractPinId(url: string): string {
  // Handle /pin/slug-text--123456789012345678/ or /pin/123456789012345678/
  const doubleDashNumeric = url.match(/\/pin\/[^/?#]*--(\d{6,24})(?:[/?#]|$)/i);
  if (doubleDashNumeric?.[1]) return doubleDashNumeric[1];

  const directNumeric = url.match(/\/pin\/(\d{6,24})(?:[/?#]|$)/i);
  if (directNumeric?.[1]) return directNumeric[1];

  // Handle /pin/e1_.../ or alphanumeric pin slug IDs
  const genericPin = url.match(/\/pin\/([A-Za-z0-9_-]{8,})(?:[/?#]|$)/i);
  if (genericPin?.[1]) return genericPin[1];

  return '';
}

function pickBestRawImageFromMap(imagesObj: any): { url: string; isOrig: boolean } {
  if (!imagesObj || typeof imagesObj !== 'object') return { url: '', isOrig: false };
  if (typeof imagesObj.orig?.url === 'string' && imagesObj.orig.url.startsWith('http')) {
    return { url: imagesObj.orig.url, isOrig: true };
  }
  const preferredKeys = ['originals', '1200x', '750x', '736x', '600x', '564x', '474x', '236x'];
  for (const key of preferredKeys) {
    const candidate = imagesObj[key]?.url;
    if (typeof candidate === 'string' && candidate.startsWith('http')) {
      return { url: candidate, isOrig: candidate.includes('/originals/') };
    }
  }
  let bestUrl = '';
  let maxArea = -1;
  for (const val of Object.values(imagesObj)) {
    const item = val as any;
    if (typeof item?.url === 'string' && item.url.startsWith('http')) {
      const area = (Number(item.width) || 0) * (Number(item.height) || 0);
      if (area > maxArea) {
        maxArea = area;
        bestUrl = item.url;
      }
    }
  }
  return { url: bestUrl, isOrig: bestUrl.includes('/originals/') };
}

/**
 * Probes Pinterest CDN `/originals/` paths (png/jpg/webp) in parallel so carousel slots
 * and fallback images automatically resolve to true lossless Ultra HD originals when available.
 */
async function upgradeToUltraHdOriginal(url: string): Promise<string> {
  if (!url || !url.startsWith('http')) return '';
  if (url.includes('/originals/')) return url;

  const sizeReplaced = url.replace(/\/(?:\d+x\d*|\d+x|600x315)\//i, '/originals/');
  if (sizeReplaced === url || !sizeReplaced.includes('/originals/')) {
    return url;
  }

  const extMatch = sizeReplaced.match(/\.(jpg|jpeg|png|webp)(?:[?#].*)?$/i);
  const currentExt = extMatch?.[1]?.toLowerCase() || 'jpg';
  const baseNoExt = extMatch ? sizeReplaced.slice(0, extMatch.index) : sizeReplaced;

  const candidates = [sizeReplaced];
  if (currentExt !== 'png') candidates.push(`${baseNoExt}.png`);
  if (currentExt !== 'jpg' && currentExt !== 'jpeg') candidates.push(`${baseNoExt}.jpg`);
  if (currentExt !== 'webp') candidates.push(`${baseNoExt}.webp`);

  try {
    const checks = await Promise.all(
      candidates.map(async (cand) => {
        try {
          const res = await fetch(cand, {
            method: 'HEAD',
            headers: { 'User-Agent': DESKTOP_UA },
            signal: AbortSignal.timeout(4500)
          });
          const ct = (res.headers.get('content-type') || '').toLowerCase();
          const len = Number(res.headers.get('content-length') || 0);
          if (res.ok && ct.startsWith('image/')) {
            return { url: cand, len, isPng: ct.includes('png') };
          }
        } catch {}
        return null;
      })
    );

    const valid = checks.filter((c): c is { url: string; len: number; isPng: boolean } => Boolean(c));
    if (valid.length > 0) {
      valid.sort((a, b) => {
        if (a.isPng !== b.isPng) return a.isPng ? -1 : 1;
        return b.len - a.len;
      });
      return valid[0].url;
    }
  } catch {}

  return url;
}

interface ParsedHlsVariant {
  resolution: string;
  rank: number;
  tierName: string;
  width: number;
  height: number;
  bandwidth: number;
  playlistUrl: string;
  tierToken: string;
  audioPlaylistUrl?: string;
}

function classifyPinterestResolution(width: number, height: number, tierToken = ''): {
  resolution: string;
  rank: number;
  tierName: string;
} {
  const tokenNum = tierToken ? Number(tierToken) : 0;
  const minSide = width > 0 && height > 0 ? Math.min(width, height) : 0;
  // Normalize edge cases like 234x416 -> 240p, 486x864 -> 480p, 648x1152 -> 640p
  let targetNum = 0;
  if (tokenNum > 0) {
    targetNum = tokenNum;
  } else if (minSide >= 2100) targetNum = 2160;
  else if (minSide >= 1400) targetNum = 1440;
  else if (minSide >= 1060) targetNum = 1080;
  else if (minSide >= 700) targetNum = 720;
  else if (minSide >= 620) targetNum = 640;
  else if (minSide >= 520) targetNum = 540;
  else if (minSide >= 460) targetNum = 480;
  else if (minSide >= 340) targetNum = 360;
  else if (minSide >= 220) targetNum = 240;
  else targetNum = minSide;

  if (targetNum >= 2160) return { resolution: '4K', rank: 2160, tierName: '4K Ultra HD' };
  if (targetNum >= 1440) return { resolution: '2K', rank: 1440, tierName: '2K Quad HD' };
  if (targetNum >= 1080) return { resolution: '1080p', rank: 1080, tierName: '1080p Full HD' };
  if (targetNum === 720) return { resolution: '720p', rank: 720, tierName: '720p HD' };
  if (targetNum === 640) return { resolution: '640p', rank: 640, tierName: '640p HD' };
  if (targetNum === 540) return { resolution: '540p', rank: 540, tierName: '540p qHD' };
  if (targetNum === 480) return { resolution: '480p', rank: 480, tierName: '480p SD' };
  if (targetNum === 360) return { resolution: '360p', rank: 360, tierName: '360p SD' };
  if (targetNum === 240) return { resolution: '240p', rank: 240, tierName: '240p Ringan' };
  if (targetNum > 0) return { resolution: `${targetNum}p`, rank: targetNum, tierName: `${targetNum}p Video` };
  return { resolution: '720p', rank: 720, tierName: '720p HD' };
}

function resolveRelativeUrl(baseUrl: string, relativeOrAbs: string): string {
  try {
    return new URL(relativeOrAbs.trim(), baseUrl).toString();
  } catch {
    return relativeOrAbs.trim();
  }
}

async function parsePinterestMasterM3u8(masterUrl: string): Promise<{
  variants: ParsedHlsVariant[];
  audioPlaylistUrl: string;
}> {
  const variants: ParsedHlsVariant[] = [];
  let audioPlaylistUrl = '';

  try {
    const res = await fetch(masterUrl, {
      headers: { 'User-Agent': DESKTOP_UA, 'Referer': 'https://www.pinterest.com/' },
      signal: AbortSignal.timeout(7000)
    });
    if (!res.ok) return { variants, audioPlaylistUrl };
    const text = await res.text();
    if (!text.includes('#EXTM3U')) return { variants, audioPlaylistUrl };

    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

    for (const line of lines) {
      if (line.startsWith('#EXT-X-MEDIA:') && /TYPE=AUDIO/i.test(line)) {
        const uriMatch = line.match(/URI="([^"]+)"/i);
        if (uriMatch?.[1]) {
          audioPlaylistUrl = resolveRelativeUrl(masterUrl, uriMatch[1]);
          break;
        }
      }
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.startsWith('#EXT-X-STREAM-INF:')) continue;

      let nextUri = '';
      for (let j = i + 1; j < lines.length; j++) {
        if (!lines[j].startsWith('#')) {
          nextUri = lines[j];
          break;
        }
      }
      if (!nextUri) continue;

      const absPlaylistUrl = resolveRelativeUrl(masterUrl, nextUri);
      const bwMatch = line.match(/(?:AVERAGE-BANDWIDTH|BANDWIDTH)=(\d+)/i);
      const avgMatch = line.match(/AVERAGE-BANDWIDTH=(\d+)/i);
      const bandwidth = avgMatch ? Number(avgMatch[1]) : (bwMatch ? Number(bwMatch[1]) : 0);

      const resMatch = line.match(/RESOLUTION=(\d+)x(\d+)/i);
      const width = resMatch ? Number(resMatch[1]) : 0;
      const height = resMatch ? Number(resMatch[2]) : 0;

      const tokenMatch = nextUri.match(/_(\d{3,4})[wp]?\.m3u8/i);
      const tierToken = tokenMatch?.[1] || '';

      const classified = classifyPinterestResolution(width, height, tierToken);
      variants.push({
        resolution: classified.resolution,
        rank: classified.rank,
        tierName: classified.tierName,
        width,
        height,
        bandwidth,
        playlistUrl: absPlaylistUrl,
        tierToken: tierToken || String(classified.rank),
        audioPlaylistUrl: audioPlaylistUrl || undefined
      });
    }
  } catch (err) {
    console.warn('[Server 2 Pinterest] Master m3u8 parse notice:', err);
  }

  return { variants, audioPlaylistUrl };
}

async function extractMediaUrlFromSubPlaylist(subPlaylistUrl: string): Promise<string> {
  try {
    const res = await fetch(subPlaylistUrl, {
      headers: { 'User-Agent': DESKTOP_UA, 'Referer': 'https://www.pinterest.com/' },
      signal: AbortSignal.timeout(7000)
    });
    if (!res.ok) return '';
    const text = await res.text();
    const mapMatch = text.match(/#EXT-X-MAP:URI="([^"]+)"/i);
    if (mapMatch?.[1]) {
      return resolveRelativeUrl(subPlaylistUrl, mapMatch[1]);
    }
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      if (!line.startsWith('#')) {
        return resolveRelativeUrl(subPlaylistUrl, line);
      }
    }
  } catch {}
  return '';
}

async function checkDirectMp4Head(mp4Url: string): Promise<{ ok: boolean; bytes: number }> {
  try {
    const res = await fetch(mp4Url, {
      method: 'HEAD',
      headers: { 'User-Agent': DESKTOP_UA, 'Referer': 'https://www.pinterest.com/' },
      signal: AbortSignal.timeout(4500)
    });
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    const len = Number(res.headers.get('content-length') || 0);
    if (res.ok && (ct.includes('video/') || ct.includes('octet-stream'))) {
      return { ok: true, bytes: len };
    }
  } catch {}
  return { ok: false, bytes: 0 };
}

function buildExpMp4Candidate(hlsMasterOrSubUrl: string, tierToken: string): string {
  const m = hlsMasterOrSubUrl.match(/^(https:\/\/[^/]+\/videos\/iht\/)hls\/(.+?)(?:_\d+w)?\.m3u8/i);
  if (m && tierToken) {
    return `${m[1]}expMp4/${m[2]}_${tierToken}w.mp4`;
  }
  return '';
}

/**
 * Resolves a single Pinterest video variant (given its HLS sub-playlist + optional audio playlist + direct MP4 fallback)
 * into concrete downloadable MP4 or video+audio stream URLs.
 */
async function resolvePinterestVariantStream(variant: ParsedHlsVariant, directV720Url?: string): Promise<{
  downloadUrl: string;
  dashAudioUrl?: string;
  filesizeBytes?: number;
}> {
  // 1. If 720p and Pinterest explicitly gave a V_720P MP4, use it directly
  if (variant.rank === 720 && directV720Url && /\.mp4/i.test(directV720Url)) {
    return { downloadUrl: directV720Url };
  }

  // 2. For `videos/iht/` CDN, check direct `expMp4/..._{tier}w.mp4` first (fast progressive MP4 with audio!)
  const expMp4Url = buildExpMp4Candidate(variant.playlistUrl, variant.tierToken);
  if (expMp4Url) {
    const head = await checkDirectMp4Head(expMp4Url);
    if (head.ok) {
      return {
        downloadUrl: expMp4Url,
        filesizeBytes: head.bytes > 0 ? head.bytes : undefined
      };
    }
  }

  // 3. Otherwise extract single fragmented `.cmfv` video stream + `.cmfa` audio stream from HLS sub-playlists
  const [vidStreamUrl, audStreamUrl] = await Promise.all([
    extractMediaUrlFromSubPlaylist(variant.playlistUrl),
    variant.audioPlaylistUrl ? extractMediaUrlFromSubPlaylist(variant.audioPlaylistUrl) : Promise.resolve('')
  ]);

  if (vidStreamUrl && vidStreamUrl.startsWith('http')) {
    return {
      downloadUrl: vidStreamUrl,
      dashAudioUrl: audStreamUrl && audStreamUrl.startsWith('http') ? audStreamUrl : undefined
    };
  }

  if (directV720Url && directV720Url.startsWith('http')) {
    return { downloadUrl: directV720Url };
  }

  throw new Error(`Stream video resolusi ${variant.resolution} tidak tersedia.`);
}

async function fetchPinResourceJson(pinId: string): Promise<any | null> {
  if (!pinId) return null;
  const sourceUrl = `/pin/${pinId}/`;
  const dataParam = JSON.stringify({
    options: {
      id: pinId,
      field_set_key: 'detailed',
      is_playable: true
    },
    context: {}
  });
  const endpoint = `https://www.pinterest.com/resource/PinResource/get/?source_url=${encodeURIComponent(sourceUrl)}&data=${encodeURIComponent(dataParam)}`;

  try {
    const res = await fetch(endpoint, {
      headers: {
        'User-Agent': DESKTOP_UA,
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
        'X-Pinterest-AppState': 'active',
        'X-Pinterest-Source-Url': sourceUrl,
        'X-Pinterest-PWS-Handler': 'www/pin/[id].js',
        'Referer': `https://www.pinterest.com/pin/${pinId}/`
      },
      signal: AbortSignal.timeout(9000)
    });
    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    return json?.resource_response?.data || null;
  } catch {
    return null;
  }
}

interface ExtractedPinMedia {
  title: string;
  author: string;
  authorUrl?: string;
  thumbnail: string;
  durationSec: number;
  views?: number | string;
  likes?: number | string;
  comments?: number | string;
  photoUrls: string[];
  videoListObj: any;
  hlsMasterUrl: string;
  directV720Url: string;
  resolvedVariantList: ParsedHlsVariant[];
  audioPlaylistUrl: string;
}

async function buildVideoAndAudioFormatsFromVideoList(
  videoList: any,
  fallbackHlsUrl: string,
  pinCanonicalUrl: string
): Promise<{
  videoFormats: MediaFormat[];
  audioFormats: MediaFormat[];
  durationSec: number;
  thumbnail: string;
  variants: ParsedHlsVariant[];
  directV720Url: string;
  audioPlaylistUrl: string;
}> {
  const videoFormats: MediaFormat[] = [];
  const audioFormats: MediaFormat[] = [];
  let durationSec = 0;
  let thumbnail = '';
  let directV720Url = '';
  let hlsMasterUrl = fallbackHlsUrl || '';

  if (videoList && typeof videoList === 'object') {
    for (const [key, entry] of Object.entries(videoList)) {
      const v = entry as any;
      if (!v || typeof v !== 'object') continue;
      if (!durationSec && typeof v.duration === 'number' && v.duration > 0) {
        durationSec = v.duration > 1000 ? v.duration / 1000 : v.duration;
      }
      if (!thumbnail && typeof v.thumbnail === 'string' && v.thumbnail.startsWith('http')) {
        thumbnail = v.thumbnail;
      }
      if (typeof v.url === 'string' && v.url.startsWith('http')) {
        if (v.url.includes('.m3u8') && (!hlsMasterUrl || key === 'V_HLSV4')) {
          hlsMasterUrl = v.url;
        } else if (v.url.includes('.mp4') && key === 'V_720P') {
          directV720Url = v.url;
        }
      }
    }
  }

  let variants: ParsedHlsVariant[] = [];
  let audioPlaylistUrl = '';

  if (hlsMasterUrl && hlsMasterUrl.includes('.m3u8')) {
    const parsedMaster = await parsePinterestMasterM3u8(hlsMasterUrl);
    variants = parsedMaster.variants;
    audioPlaylistUrl = parsedMaster.audioPlaylistUrl;
  }

  // Fallback: if master m3u8 yielded no variants, synthesize from explicit MP4 entries in video_list
  if (variants.length === 0 && videoList && typeof videoList === 'object') {
    const mp4Candidates: Array<{ url: string; width: number; height: number; key: string }> = [];
    for (const [key, entry] of Object.entries(videoList)) {
      const v = entry as any;
      if (typeof v?.url === 'string' && v.url.startsWith('http') && /\.mp4(\?|$)/i.test(v.url)) {
        mp4Candidates.push({
          url: v.url,
          width: Number(v.width) || 0,
          height: Number(v.height) || 0,
          key
        });
      }
    }
    if (mp4Candidates.length > 0) {
      const best = mp4Candidates.find((c) => c.key === 'V_720P') || mp4Candidates[0];
      const classified = classifyPinterestResolution(best.width, best.height, best.key === 'V_720P' ? '720' : '');
      variants.push({
        resolution: classified.resolution,
        rank: classified.rank,
        tierName: classified.tierName,
        width: best.width,
        height: best.height,
        bandwidth: 0,
        playlistUrl: best.url,
        tierToken: String(classified.rank)
      });
      if (!directV720Url) directV720Url = best.url;
    }
  }

  // Deduplicate by resolution, keeping highest bandwidth/width
  const deduped = new Map<string, ParsedHlsVariant>();
  for (const v of variants) {
    const prev = deduped.get(v.resolution);
    if (!prev || v.bandwidth > prev.bandwidth || (v.width * v.height > prev.width * prev.height)) {
      deduped.set(v.resolution, v);
    }
  }

  const sortedVariants = [...deduped.values()].sort((a, b) => b.rank - a.rank || b.bandwidth - a.bandwidth);

  for (const v of sortedVariants) {
    const isDirectV720 = v.rank === 720 && Boolean(directV720Url && /\.mp4/i.test(directV720Url));
    const estBytes = v.bandwidth > 0 && durationSec > 0 ? Math.round((v.bandwidth / 8) * durationSec) : undefined;
    const dimText = v.width > 0 && v.height > 0 ? `${v.width}x${v.height}` : '';

    videoFormats.push({
      id: `pin-s2-${v.resolution.toLowerCase()}`,
      quality: dimText ? `${v.tierName} (${dimText})` : v.tierName,
      resolution: v.resolution,
      type: 'video',
      extension: 'mp4',
      filesize: estBytes ? `~ ${formatBytes(estBytes)}` : undefined,
      filesizeBytes: estBytes,
      url: isDirectV720 ? directV720Url : pinCanonicalUrl,
      isDirect: isDirectV720,
      needsResolution: !isDirectV720,
      note: dimText ? `Video MP4 ${dimText} Server 2` : 'Video MP4 Server 2'
    });
  }

  // Add MP3 audio options ONLY if this video genuinely has an audio stream
  const hasAudioTrack = Boolean(audioPlaylistUrl) || Boolean(directV720Url);
  if (hasAudioTrack && videoFormats.length > 0) {
    let audioDirectUrl = '';
    if (audioPlaylistUrl) {
      audioDirectUrl = await extractMediaUrlFromSubPlaylist(audioPlaylistUrl);
    }
    const baseAudioSource = audioDirectUrl || directV720Url || '';

    const audioPresets = [
      { kbps: 320, label: '320 kbps Ultra HQ (Ekstrak Audio MP3)', note: 'Bitrate audio MP3 studio tertinggi' },
      { kbps: 256, label: '256 kbps High (Ekstrak Audio MP3)', note: 'Audio MP3 jernih kualitas tinggi' },
      { kbps: 128, label: '128 kbps Standard (Ekstrak Audio MP3)', note: 'Ukuran ringan & cepat diunduh' }
    ];

    for (const ab of audioPresets) {
      const estAudioBytes = durationSec > 0 ? Math.round(((ab.kbps * 1000) / 8) * durationSec) : undefined;
      audioFormats.push({
        id: `pin-s2-audio-${ab.kbps}`,
        quality: ab.label,
        resolution: `${ab.kbps} kbps`,
        type: 'audio',
        extension: 'mp3',
        filesize: estAudioBytes ? `~ ${formatBytes(estAudioBytes)}` : undefined,
        filesizeBytes: estAudioBytes,
        url: baseAudioSource || pinCanonicalUrl,
        isDirect: Boolean(baseAudioSource),
        needsResolution: !baseAudioSource,
        note: ab.note
      });
    }
  }

  return {
    videoFormats,
    audioFormats,
    durationSec,
    thumbnail,
    variants: sortedVariants,
    directV720Url,
    audioPlaylistUrl
  };
}

/**
 * Tier 2 HTML / Relay Fallback Scraper (used if PinResource returns null, e.g., search `e1_` links or strict rate limits).
 */
async function scrapePinterestHtmlFallback(targetUrl: string): Promise<Partial<ExtractedPinMedia> | null> {
  const tryFetchHtml = async (ua: string) => {
    const res = await fetch(targetUrl, {
      headers: {
        'User-Agent': ua,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      signal: AbortSignal.timeout(9000)
    });
    if (!res.ok) return '';
    return await res.text();
  };

  const [desktopHtml, botHtml] = await Promise.all([
    tryFetchHtml(DESKTOP_UA).catch(() => ''),
    tryFetchHtml('facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)').catch(() => '')
  ]);

  const combined = desktopHtml || botHtml;
  if (!combined) return null;

  const $ = cheerio.load(botHtml || desktopHtml);
  let title =
    $('meta[property="og:title"]').attr('content') ||
    $('title').text() ||
    '';
  title = title.replace(/\s*\|\s*Pinterest.*$/i, '').replace(/\s+on Pinterest$/i, '').trim();

  const hlsMatch = combined.match(/https:\/\/v\d*\.pinimg\.com\/videos\/[^"'\s\\<>]+\.m3u8/i);
  const mp4Matches = [...new Set(
    [...combined.matchAll(/https:\/\/v\d*\.pinimg\.com\/videos\/[^"'\s\\<>]+\.mp4/gi)].map((m) =>
      m[0].replace(/\\u002F/g, '/').replace(/\\/g, '')
    )
  )];

  const rawPhotoMatches = [
    ...new Set([
      ...[...combined.matchAll(/https:\/\/i\.pinimg\.com\/originals\/[^"'\s\\<>()]+/gi)].map((m) => m[0]),
      ...[...combined.matchAll(/https:\/\/i\.pinimg\.com\/736x\/[^"'\s\\<>()]+/gi)].map((m) => m[0])
    ])
  ].filter(
    (u) =>
      /\.(jpg|jpeg|png|webp)(?:[?#]|$)/i.test(u) &&
      !u.includes('d53b014d86a6b6761bf649a0ed813c2b') // skip Pinterest CSS UI asset
  );

  const ogImg = $('meta[property="og:image"]').attr('content') || '';
  if (ogImg && ogImg.startsWith('http') && !rawPhotoMatches.includes(ogImg)) {
    rawPhotoMatches.unshift(ogImg);
  }

  const upgradedPhotos = await Promise.all(
    rawPhotoMatches.slice(0, 12).map((u) => upgradeToUltraHdOriginal(u))
  );
  const uniquePhotos = [...new Set(upgradedPhotos.filter(Boolean))];

  const directV720 =
    mp4Matches.find((u) => u.includes('/720p/') || u.includes('_720w.mp4')) ||
    mp4Matches[0] ||
    '';

  return {
    title: title || 'Pinterest Media',
    thumbnail: ogImg || uniquePhotos[0] || '',
    photoUrls: uniquePhotos,
    hlsMasterUrl: hlsMatch?.[0] || '',
    directV720Url: directV720
  };
}

/**
 * =========================================================================
 * SERVER 2 PINTEREST SCRAPER (100% Free Keyless Multi-Tier Engine)
 * =========================================================================
 * - Tier 1: Pinterest Resource API (`PinResource/get`)
 * - Tier 2: Desktop + OpenGraph Relay HTML Fallback
 * - Photos & Photo Slides: Always auto-upgraded to max Ultra HD `/originals/`
 *   (no photo resolution selector). Supports Carousel Pins & Story/Idea Pins.
 * - Videos: Extracts real multi-resolution streams from HLS Master M3U8 + MP4 CDN.
 */
export async function scrapePinterestServer2(rawUrl: string): Promise<MediaMetadata> {
  const canonicalUrl = await resolvePinterestUrl(rawUrl);
  const pinId = extractPinId(canonicalUrl);

  let title = '';
  let author = 'Pinterest Creator';
  let authorUrl: string | undefined;
  let thumbnail = '';
  let durationSec = 0;
  let views: number | string | undefined;
  let likes: number | string | undefined;
  let comments: number | string | undefined;

  const candidatePhotoInputs: string[] = [];
  let videoListObj: any = null;
  let fallbackHlsMasterUrl = '';
  let fallbackDirectMp4Url = '';

  // ----------------- TIER 1: Pinterest Resource JSON API -----------------
  const pinData = pinId && /^\d+$/.test(pinId) ? await fetchPinResourceJson(pinId) : null;

  if (pinData) {
    title =
      pinData.title ||
      pinData.grid_title ||
      pinData.seo_title ||
      pinData.closeup_unified_description ||
      pinData.description ||
      '';
    title = String(title).replace(/\s+/g, ' ').trim();

    const creator = pinData.native_creator || pinData.pinner;
    if (creator) {
      author = creator.full_name || creator.username || author;
      if (creator.username) {
        authorUrl = `https://www.pinterest.com/${creator.username}/`;
      }
    }

    likes =
      pinData.reaction_counts?.['1'] ??
      pinData.aggregated_pin_data?.aggregated_stats?.saves ??
      pinData.repin_count;
    comments = pinData.comment_count ?? pinData.aggregated_pin_data?.comment_count;
    views = pinData.aggregated_pin_data?.aggregated_stats?.done ?? pinData.view_count;

    // 1A. Collect Carousel Slides (carousel_data.carousel_slots)
    const carouselSlots = Array.isArray(pinData.carousel_data?.carousel_slots)
      ? pinData.carousel_data.carousel_slots
      : [];
    for (const slot of carouselSlots) {
      const picked = pickBestRawImageFromMap(slot?.images);
      if (picked.url && !candidatePhotoInputs.includes(picked.url)) {
        candidatePhotoInputs.push(picked.url);
      }
      if (!videoListObj && slot?.videos?.video_list) {
        videoListObj = slot.videos.video_list;
      }
    }

    // 1B. Collect Multi-page Story / Idea Pin Slides (story_pin_data.pages)
    const storyPages = Array.isArray(pinData.story_pin_data?.pages)
      ? pinData.story_pin_data.pages
      : [];
    for (const page of storyPages) {
      const pageImg =
        pickBestRawImageFromMap(page?.image_adjusted?.images) ||
        pickBestRawImageFromMap(page?.image?.images);
      if (pageImg.url && !candidatePhotoInputs.includes(pageImg.url)) {
        candidatePhotoInputs.push(pageImg.url);
      }
      if (!videoListObj && page?.video?.video_list) {
        videoListObj = page.video.video_list;
      }
      if (Array.isArray(page?.blocks)) {
        for (const blk of page.blocks) {
          if (blk?.image?.images) {
            const blkImg = pickBestRawImageFromMap(blk.image.images);
            if (blkImg.url && !candidatePhotoInputs.includes(blkImg.url)) {
              candidatePhotoInputs.push(blkImg.url);
            }
          }
          if (!videoListObj && blk?.video?.video_list) {
            videoListObj = blk.video.video_list;
          }
        }
      }
    }

    // 1C. Collect Pin-level videos & primary image
    if (!videoListObj && pinData.videos?.video_list) {
      videoListObj = pinData.videos.video_list;
    }

    const mainImg = pickBestRawImageFromMap(pinData.images);
    if (mainImg.url) {
      thumbnail = mainImg.url;
      if (candidatePhotoInputs.length === 0) {
        candidatePhotoInputs.push(mainImg.url);
      }
    }
  }

  // ----------------- TIER 2: HTML / Relay Fallback -----------------
  let htmlFallbackPhotos: string[] = [];
  if (!videoListObj && candidatePhotoInputs.length === 0) {
    const fb = await scrapePinterestHtmlFallback(canonicalUrl);
    if (fb) {
      if (!title && fb.title) title = fb.title;
      if (!thumbnail && fb.thumbnail) thumbnail = fb.thumbnail;
      if (fb.hlsMasterUrl) fallbackHlsMasterUrl = fb.hlsMasterUrl;
      if (fb.directV720Url) fallbackDirectMp4Url = fb.directV720Url;
      if (fb.photoUrls && fb.photoUrls.length > 0) {
        htmlFallbackPhotos = fb.photoUrls;
      }
    }
  }

  // Always auto-upgrade all photos & slides to max Ultra HD `/originals/`
  const ultraHdPhotos =
    candidatePhotoInputs.length > 0
      ? [...new Set((await Promise.all(candidatePhotoInputs.map((u) => upgradeToUltraHdOriginal(u)))).filter(Boolean))]
      : htmlFallbackPhotos;

  // Build video & audio formats if Pin contains video
  let videoFormats: MediaFormat[] = [];
  let audioFormats: MediaFormat[] = [];

  if (videoListObj || fallbackHlsMasterUrl || fallbackDirectMp4Url) {
    const vidBuilt = await buildVideoAndAudioFormatsFromVideoList(
      videoListObj,
      fallbackHlsMasterUrl,
      canonicalUrl
    );
    videoFormats = vidBuilt.videoFormats;
    audioFormats = vidBuilt.audioFormats;
    if (vidBuilt.durationSec > 0) durationSec = vidBuilt.durationSec;
    if (vidBuilt.thumbnail && !thumbnail) thumbnail = vidBuilt.thumbnail;
    if (videoFormats.length === 0 && fallbackDirectMp4Url) {
      videoFormats.push({
        id: 'pin-s2-720p',
        quality: '720p HD Video',
        resolution: '720p',
        type: 'video',
        extension: 'mp4',
        url: fallbackDirectMp4Url,
        isDirect: true,
        needsResolution: false,
        note: 'Video MP4 Server 2'
      });
    }
  }

  const formats: MediaFormat[] = [...videoFormats, ...audioFormats];

  const isMultiPhoto = ultraHdPhotos.length > 1;
  // Pure photo / carousel photo pin OR mixed carousel photo slides
  if (ultraHdPhotos.length > 0 && (videoFormats.length === 0 || isMultiPhoto)) {
    const firstPhoto = ultraHdPhotos[0];
    const ext: 'png' | 'jpg' = firstPhoto.toLowerCase().includes('.png') ? 'png' : 'jpg';
    formats.push({
      id: isMultiPhoto ? 'pin-s2-photos-all' : 'pin-s2-photo-orig',
      quality: isMultiPhoto
        ? `Koleksi Foto Ultra HD (${ultraHdPhotos.length} Slide Original)`
        : 'Ultra HD Original (Resolusi Maksimal)',
      resolution: 'Ultra HD',
      type: 'photos',
      extension: ext,
      url: firstPhoto,
      isDirect: true,
      needsResolution: false,
      note: isMultiPhoto
        ? `${ultraHdPhotos.length} slide foto resolusi asli tanpa kompresi`
        : 'Foto asli resolusi paling tinggi tanpa pemilihan'
    });
  }

  if (formats.length === 0) {
    throw new Error('Server 2 tidak dapat menemukan media dari tautan Pinterest ini. Pastikan pin bersifat publik.');
  }

  const finalThumbnail = (ultraHdPhotos[0] || thumbnail || '').trim();
  const cleanTitle =
    (title || (isMultiPhoto ? `Slide Foto Pinterest (${ultraHdPhotos.length} Slide)` : videoFormats.length > 0 ? 'Pinterest Video Pin' : 'Pinterest Pin'))
      .slice(0, 140);

  return {
    id: pinId || `pin-s2-${Date.now()}`,
    url: canonicalUrl,
    platform: 'pinterest',
    title: cleanTitle,
    author,
    authorUrl,
    thumbnail: finalThumbnail,
    duration: Math.round(durationSec),
    durationFormatted: formatDuration(durationSec),
    views,
    likes,
    comments,
    formats,
    images: ultraHdPhotos.length > 0 ? ultraHdPhotos : undefined,
    isPhotoSlide: isMultiPhoto,
    source: 'Server 2 Pinterest Engine',
    createdAt: new Date().toISOString()
  };
}

/**
 * On-demand resolution resolver for Pinterest Server 2 video & audio downloads.
 * Ensures the returned stream strictly matches the user-selected resolution (e.g. 720p, 540p, 480p, 360p, 240p).
 */
export async function resolvePinterestServer2(
  rawUrl: string,
  targetResolution: string,
  type: 'video' | 'audio' | 'photos' = 'video'
): Promise<{
  downloadUrl: string;
  dashAudioUrl?: string;
  quality: string;
  resolution?: string;
}> {
  const canonicalUrl = await resolvePinterestUrl(rawUrl);
  const pinId = extractPinId(canonicalUrl);
  const pinData = pinId && /^\d+$/.test(pinId) ? await fetchPinResourceJson(pinId) : null;

  let videoListObj: any = pinData?.videos?.video_list || null;
  if (!videoListObj && Array.isArray(pinData?.carousel_data?.carousel_slots)) {
    const slotWithVid = pinData.carousel_data.carousel_slots.find((s: any) => s?.videos?.video_list);
    if (slotWithVid) videoListObj = slotWithVid.videos.video_list;
  }
  if (!videoListObj && Array.isArray(pinData?.story_pin_data?.pages)) {
    for (const p of pinData.story_pin_data.pages) {
      if (p?.video?.video_list) {
        videoListObj = p.video.video_list;
        break;
      }
      const blkVid = Array.isArray(p?.blocks) ? p.blocks.find((b: any) => b?.video?.video_list) : null;
      if (blkVid) {
        videoListObj = blkVid.video.video_list;
        break;
      }
    }
  }

  let fallbackHls = '';
  let fallbackMp4 = '';
  if (!videoListObj) {
    const fb = await scrapePinterestHtmlFallback(canonicalUrl);
    if (fb) {
      fallbackHls = fb.hlsMasterUrl || '';
      fallbackMp4 = fb.directV720Url || '';
    }
  }

  const built = await buildVideoAndAudioFormatsFromVideoList(videoListObj, fallbackHls, canonicalUrl);

  if (type === 'audio') {
    const chosenAud = built.audioFormats[0];
    if (chosenAud?.url?.startsWith('http') && chosenAud.url !== canonicalUrl) {
      return {
        downloadUrl: chosenAud.url,
        quality: targetResolution || chosenAud.quality,
        resolution: targetResolution || chosenAud.resolution
      };
    }
    if (built.directV720Url) {
      return {
        downloadUrl: built.directV720Url,
        quality: targetResolution || '320 kbps',
        resolution: targetResolution || '320 kbps'
      };
    }
    throw new Error('Audio stream tidak tersedia pada video Pinterest ini.');
  }

  if (built.variants.length > 0) {
    const isOrigReq = String(targetResolution || '').toLowerCase().includes('original');
    const wantNum = Number((targetResolution || '').replace(/[^\d]/g, '')) || 720;
    const exactMatch = isOrigReq
      ? built.variants[0]
      : (built.variants.find((v) => v.resolution.toLowerCase() === String(targetResolution || '').toLowerCase()) ||
         built.variants.find((v) => v.rank === wantNum) ||
         built.variants.reduce((best, cur) =>
           Math.abs(cur.rank - wantNum) < Math.abs(best.rank - wantNum) ? cur : best
         ));

    const stream = await resolvePinterestVariantStream(exactMatch, built.directV720Url);
    return {
      downloadUrl: stream.downloadUrl,
      dashAudioUrl: stream.dashAudioUrl,
      quality: isOrigReq
        ? `Original (${exactMatch.tierName})`
        : `${exactMatch.tierName}${exactMatch.width > 0 ? ` (${exactMatch.width}x${exactMatch.height})` : ''}`,
      resolution: isOrigReq ? 'Original' : exactMatch.resolution
    };
  }

  if (fallbackMp4) {
    return {
      downloadUrl: fallbackMp4,
      quality: '720p HD Video',
      resolution: '720p'
    };
  }

  throw new Error('Gagal menemukan stream video Pinterest untuk resolusi ini.');
}
