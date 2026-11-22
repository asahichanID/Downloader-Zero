/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MediaMetadata, MediaFormat } from '../../types/index.ts';

const SAVETUBE_SECRET_HEX = 'C5D58EF67A7584E4A29F6C35BBC4EB12';
const FALLBACK_CDNS = ['cdn403.savetube.vip', 'cdn400.savetube.vip', 'cdn406.savetube.vip', 'cdn401.savetube.vip'];

interface SaveTubeVideoFormat {
  quality: number;
  label?: string;
  width?: number;
  height?: number;
  url?: string | null;
  default_selected?: number;
}

interface SaveTubeAudioFormat {
  quality: number;
  label?: string;
  url?: string | null;
}

interface SaveTubeInfo {
  id?: string;
  key: string;
  url?: string;
  title?: string;
  thumbnail?: string;
  duration?: number;
  durationLabel?: string;
  video_formats?: SaveTubeVideoFormat[];
  audio_formats?: SaveTubeAudioFormat[];
  thumbnail_formats?: Array<{ url?: string }>;
}

// Short-lived in-memory caches for speed (zero redundant /random-cdn or /v2/info calls)
let cachedCdnHost: { host: string; expiresAt: number } | null = null;
const infoCache = new Map<string, { cdn: string; info: SaveTubeInfo; expiresAt: number }>();

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

/**
 * Detects whether a YouTube URL points to a Community Post / Photo Post.
 */
export function isYouTubePostUrl(url: string): boolean {
  const trimmed = url.trim();
  return (
    /youtube\.com\/post\/[A-Za-z0-9_-]+/i.test(trimmed) ||
    (/youtube\.com\/.*\/(?:community|posts)/i.test(trimmed) && /[?&]lb=[A-Za-z0-9_-]+/i.test(trimmed)) ||
    /youtube\.com\/channel\/[^/]+\/community/i.test(trimmed) ||
    /youtube\.com\/@[^/]+\/(?:community|posts)/i.test(trimmed)
  );
}

/**
 * Extracts YouTube post ID (e.g. Ugkx...) from /post/<id> or ?lb=<id>.
 */
export function extractYouTubePostId(url: string): string {
  const postMatch = url.match(/youtube\.com\/post\/([A-Za-z0-9_-]+)/i);
  if (postMatch?.[1]) return postMatch[1];
  const lbMatch = url.match(/[?&]lb=([A-Za-z0-9_-]+)/i);
  if (lbMatch?.[1]) return lbMatch[1];
  return '';
}

/**
 * Extracts the 11-character YouTube video ID from watch, shorts, embed, live, or youtu.be URLs.
 */
export function extractYouTubeVideoId(url: string): string {
  const m = url.match(/(?:youtube\.com\/(?:watch\?[^#]*v=|shorts\/|embed\/|live\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i);
  return m?.[1] || '';
}

/**
 * Normalizes any YouTube video/shorts/youtu.be link to canonical watch URL.
 */
export function canonicalizeYouTubeUrl(url: string): string {
  const vid = extractYouTubeVideoId(url);
  return vid ? `https://www.youtube.com/watch?v=${vid}` : url.trim();
}

/**
 * Upgrades yt3.ggpht.com / lh3.googleusercontent.com community post image URLs
 * to original full lossless resolution without square crop.
 */
function upgradeYouTubeImageUrl(rawUrl: string): string {
  const cleaned = rawUrl.replace(/\\u0026/g, '&').replace(/\\/g, '').trim();
  if (!cleaned.startsWith('http')) return '';
  if (/(?:yt3\.ggpht\.com|lh3\.googleusercontent\.com|yt4\.ggpht\.com)/i.test(cleaned)) {
    const eqIdx = cleaned.indexOf('=');
    if (eqIdx !== -1) {
      return `${cleaned.slice(0, eqIdx)}=s0-nd-v1`;
    }
    return `${cleaned}=s0-nd-v1`;
  }
  return cleaned;
}

function pickLargestThumbnail(thumbnails?: Array<{ url?: string; width?: number; height?: number }>): string {
  if (!Array.isArray(thumbnails) || thumbnails.length === 0) return '';
  const sorted = [...thumbnails]
    .filter((t) => typeof t?.url === 'string' && t.url.startsWith('http'))
    .sort((a, b) => ((b.width || 0) * (b.height || 0)) - ((a.width || 0) * (a.height || 0)));
  return sorted[0]?.url ? upgradeYouTubeImageUrl(sorted[0].url) : '';
}

function findBackstagePost(node: any): any | null {
  if (!node || typeof node !== 'object') return null;
  if (node.backstagePostRenderer) return node.backstagePostRenderer;
  if (node.sharedPostRenderer?.originalPost?.backstagePostRenderer) {
    return node.sharedPostRenderer.originalPost.backstagePostRenderer;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findBackstagePost(item);
      if (found) return found;
    }
  } else {
    for (const val of Object.values(node)) {
      if (val && typeof val === 'object') {
        const found = findBackstagePost(val);
        if (found) return found;
      }
    }
  }
  return null;
}

function extractRunsText(runsObj: any): string {
  if (!runsObj) return '';
  if (typeof runsObj.simpleText === 'string') return runsObj.simpleText.trim();
  if (Array.isArray(runsObj.runs)) {
    return runsObj.runs.map((r: any) => r?.text || '').join('').trim();
  }
  return '';
}

/**
 * =========================================================================
 * YOUTUBE COMMUNITY POST / PHOTO SLIDE SCRAPER
 * =========================================================================
 * Supports single image posts, multi-image carousel slideshows (foto slide),
 * poll images, and community posts sharing a YouTube video.
 */
export async function scrapeYouTubePost(rawUrl: string): Promise<MediaMetadata> {
  const postId = extractYouTubePostId(rawUrl);
  const fetchUrl = postId ? `https://www.youtube.com/post/${encodeURIComponent(postId)}` : rawUrl.trim();

  const res = await fetch(fetchUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cookie': 'CONSENT=YES+1; SOCS=CAI'
    },
    signal: AbortSignal.timeout(9000)
  });

  if (!res.ok) {
    throw new Error(`Gagal memuat postingan YouTube (HTTP ${res.status}).`);
  }

  const html = await res.text();
  const dataMatch =
    html.match(/var\s+ytInitialData\s*=\s*(\{.+?\})\s*;\s*<\/script>/s) ||
    html.match(/window\["ytInitialData"\]\s*=\s*(\{.+?\})\s*;/s);

  if (!dataMatch?.[1]) {
    throw new Error('Data postingan YouTube tidak ditemukan pada halaman.');
  }

  let initialData: any;
  try {
    initialData = JSON.parse(dataMatch[1]);
  } catch {
    throw new Error('Gagal mengurai struktur data postingan YouTube.');
  }

  const post = findBackstagePost(initialData);
  if (!post) {
    throw new Error('Postingan Komunitas YouTube tidak ditemukan atau bersifat privat.');
  }

  const author = extractRunsText(post.authorText) || 'YouTube Creator';
  const authorNav = post.authorEndpoint?.browseEndpoint?.canonicalBaseUrl;
  const authorUrl = authorNav ? `https://www.youtube.com${authorNav}` : undefined;
  const caption = extractRunsText(post.contentText);
  const title = caption ? caption.slice(0, 140) : `Postingan Komunitas ${author}`;

  const likes =
    extractRunsText(post.voteCount) ||
    post.actionButtons?.commentActionButtonsRenderer?.likeButton?.toggleButtonRenderer?.accessibilityData?.accessibilityData?.label?.match(/([\d,.KMB]+)/i)?.[1];
  const comments =
    extractRunsText(post.actionButtons?.commentActionButtonsRenderer?.replyButton?.buttonRenderer?.text);

  const images: string[] = [];
  const att = post.backstageAttachment;

  // 1. Multi-image carousel (YouTube Photo Slide)
  if (att?.postMultiImageRenderer?.images && Array.isArray(att.postMultiImageRenderer.images)) {
    for (const item of att.postMultiImageRenderer.images) {
      const thumbs = item?.backstageImageRenderer?.image?.thumbnails;
      const imgUrl = pickLargestThumbnail(thumbs);
      if (imgUrl && !images.includes(imgUrl)) {
        images.push(imgUrl);
      }
    }
  }

  // 2. Single image attachment
  if (att?.backstageImageRenderer?.image?.thumbnails) {
    const imgUrl = pickLargestThumbnail(att.backstageImageRenderer.image.thumbnails);
    if (imgUrl && !images.includes(imgUrl)) {
      images.push(imgUrl);
    }
  }

  // 3. Poll choices with images
  if (Array.isArray(att?.pollRenderer?.choices)) {
    for (const ch of att.pollRenderer.choices) {
      const imgUrl = pickLargestThumbnail(ch?.image?.thumbnails);
      if (imgUrl && !images.includes(imgUrl)) {
        images.push(imgUrl);
      }
    }
  }

  // 4. If post shares a YouTube video without images, delegate to video scraper
  const attachedVideoId = att?.videoRenderer?.videoId;
  if (images.length === 0 && typeof attachedVideoId === 'string' && attachedVideoId.length === 11) {
    return await scrapeYouTubeServer2(`https://www.youtube.com/watch?v=${attachedVideoId}`);
  }

  if (images.length === 0) {
    throw new Error('Postingan Komunitas YouTube ini hanya berisi teks tanpa foto atau video.');
  }

  const isPhotoSlide = images.length > 1;
  const formats: MediaFormat[] = [];

  if (isPhotoSlide) {
    formats.push({
      id: 'yt-photos-all',
      quality: `Koleksi Foto YouTube (${images.length} Slide HD)`,
      resolution: 'HD Foto',
      type: 'photos',
      extension: 'jpg',
      url: images[0],
      isDirect: true,
      needsResolution: false,
      note: `${images.length} foto resolusi asli siap unduh (ZIP)`
    });

    images.forEach((imgUrl, idx) => {
      formats.push({
        id: `yt-photo-${idx + 1}`,
        quality: `Foto Slide #${idx + 1} (Resolusi Asli)`,
        resolution: 'HD Foto',
        type: 'photos',
        extension: 'jpg',
        url: imgUrl,
        isDirect: true,
        needsResolution: false,
        note: `Gambar slide ke-${idx + 1} tanpa crop`
      });
    });
  } else {
    formats.push({
      id: 'yt-photo-1',
      quality: 'Foto YouTube HD (Resolusi Asli)',
      resolution: 'HD Foto',
      type: 'photos',
      extension: 'jpg',
      url: images[0],
      isDirect: true,
      needsResolution: false,
      note: 'Foto postingan YouTube resolusi penuh tanpa kompresi'
    });
  }

  return {
    id: postId || `yt-post-${Date.now()}`,
    url: fetchUrl,
    platform: 'youtube',
    title,
    author,
    authorUrl,
    thumbnail: images[0],
    duration: 0,
    durationFormatted: `${images.length} Foto`,
    likes,
    comments,
    formats,
    images,
    isPhotoSlide,
    source: 'Server 2 YouTube Post Engine',
    createdAt: new Date().toISOString()
  };
}

/**
 * Decrypts SaveTube AES-128-CBC encrypted info payload using Web Crypto API
 * (works natively in both Node.js 22+ and modern browsers with zero Node-only imports).
 */
async function decryptSaveTubePayload(base64Payload: string): Promise<SaveTubeInfo> {
  const keyBytes = new Uint8Array(
    (SAVETUBE_SECRET_HEX.match(/.{1,2}/g) || []).map((b) => parseInt(b, 16))
  );
  const rawBinaryStr = atob(base64Payload);
  const rawBytes = new Uint8Array(rawBinaryStr.length);
  for (let i = 0; i < rawBinaryStr.length; i++) {
    rawBytes[i] = rawBinaryStr.charCodeAt(i);
  }
  const iv = rawBytes.slice(0, 16);
  const ciphertext = rawBytes.slice(16);

  const cryptoKey = await globalThis.crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-CBC' },
    false,
    ['decrypt']
  );
  const decryptedBuffer = await globalThis.crypto.subtle.decrypt(
    { name: 'AES-CBC', iv },
    cryptoKey,
    ciphertext
  );
  const jsonStr = new TextDecoder().decode(decryptedBuffer);
  return JSON.parse(jsonStr) as SaveTubeInfo;
}

async function getSaveTubeCdnHost(forceRefresh = false): Promise<string> {
  if (!forceRefresh && cachedCdnHost && Date.now() < cachedCdnHost.expiresAt) {
    return cachedCdnHost.host;
  }
  try {
    const res = await fetch('https://media.savetube.vip/api/random-cdn', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(5000)
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.cdn && typeof data.cdn === 'string') {
        cachedCdnHost = { host: data.cdn.trim(), expiresAt: Date.now() + 5 * 60 * 1000 };
        return cachedCdnHost.host;
      }
    }
  } catch (e) {
    console.warn('[Server 2 YouTube] random-cdn notice:', e);
  }
  const fallback = FALLBACK_CDNS[Math.floor(Math.random() * FALLBACK_CDNS.length)];
  cachedCdnHost = { host: fallback, expiresAt: Date.now() + 60 * 1000 };
  return fallback;
}

async function fetchSaveTubeInfo(canonicalUrl: string, videoId: string): Promise<{ cdn: string; info: SaveTubeInfo }> {
  const cached = videoId ? infoCache.get(videoId) : undefined;
  if (cached && Date.now() < cached.expiresAt) {
    return { cdn: cached.cdn, info: cached.info };
  }

  const primaryCdn = await getSaveTubeCdnHost(false);
  const cdnCandidates = [
    primaryCdn,
    ...FALLBACK_CDNS.filter((c) => c !== primaryCdn).slice(0, 2)
  ];

  let lastErr = '';
  for (const cdn of cdnCandidates) {
    try {
      const res = await fetch(`https://${cdn}/v2/info`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Linux; Android 12; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Mobile Safari/537.36',
          'Referer': 'https://save-tube.com/',
          'Origin': 'https://save-tube.com'
        },
        body: JSON.stringify({ url: canonicalUrl }),
        signal: AbortSignal.timeout(9000)
      });

      if (!res.ok) {
        lastErr = `HTTP ${res.status} (${cdn})`;
        continue;
      }

      const json = await res.json();
      if (json?.status && typeof json?.data === 'string' && json.data.length > 16) {
        const info = await decryptSaveTubePayload(json.data);
        if (info?.key) {
          cachedCdnHost = { host: cdn, expiresAt: Date.now() + 5 * 60 * 1000 };
          if (videoId) {
            infoCache.set(videoId, { cdn, info, expiresAt: Date.now() + 4 * 60 * 1000 });
          }
          return { cdn, info };
        }
      }
      lastErr = json?.message || `Payload invalid (${cdn})`;
    } catch (e: any) {
      lastErr = e?.message || `Timeout (${cdn})`;
    }
  }

  throw new Error(lastErr ? `Server 2 YouTube gagal mengambil info video (${lastErr}).` : 'Server 2 YouTube tidak tersedia.');
}

async function fetchYouTubePageEnrichment(canonicalUrl: string, videoId: string): Promise<{
  title?: string;
  author?: string;
  authorUrl?: string;
  thumbnail?: string;
  duration?: number;
  views?: string;
  likes?: string;
  comments?: string;
}> {
  const result: {
    title?: string;
    author?: string;
    authorUrl?: string;
    thumbnail?: string;
    duration?: number;
    views?: string;
    likes?: string;
    comments?: string;
  } = {};

  await Promise.allSettled([
    (async () => {
      const oeRes = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(canonicalUrl)}&format=json`,
        { signal: AbortSignal.timeout(4500) }
      );
      if (oeRes.ok) {
        const oe = await oeRes.json();
        if (oe.title) result.title = oe.title;
        if (oe.author_name) result.author = oe.author_name;
        if (oe.author_url) result.authorUrl = oe.author_url;
        if (oe.thumbnail_url) result.thumbnail = oe.thumbnail_url;
      }
    })(),
    (async () => {
      if (!videoId) return;
      const watchRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9'
        },
        signal: AbortSignal.timeout(5000)
      });
      if (watchRes.ok) {
        const html = await watchRes.text();
        const lenMatch = html.match(/"lengthSeconds":"(\d+)"/) || html.match(/"approxDurationMs":"(\d+)"/);
        if (lenMatch?.[1]) {
          const secs = lenMatch[0].includes('approxDurationMs')
            ? Math.round(Number(lenMatch[1]) / 1000)
            : Number(lenMatch[1]);
          if (secs > 0) result.duration = secs;
        }
        const vMatch =
          html.match(/"viewCount":"(\d+)"/) ||
          html.match(/"viewCount":\{"simpleText":"([\d,.\sKMB]+)/i);
        if (vMatch?.[1]) result.views = vMatch[1].trim();

        const lMatch =
          html.match(/"accessibilityText":"like this video along with ([\d,\.]+) other people"/i) ||
          html.match(/"factoidRenderer":\{"value":\{"simpleText":"([^"]+)"\},"label":\{"simpleText":"Likes"\}/i) ||
          html.match(/"likeCount":(\d+)/);
        if (lMatch?.[1]) result.likes = lMatch[1].trim();

        const cMatch =
          html.match(/"commentCount":\{"simpleText":"([^"]+)"\}/) ||
          html.match(/"commentsEntryPointHeaderRenderer":\{.*?"commentCount":\{"simpleText":"([^"]+)"\}/);
        if (cMatch?.[1]) result.comments = cMatch[1].trim();
      }
    })()
  ]);

  return result;
}

function mapNumericQualityToMeta(qNum: number): { res: string; label: string; note: string } {
  if (qNum >= 2160) return { res: '4K', label: '4K (2160p Ultra HD)', note: 'Ultra HD 4K 2160p dengan audio (Server 2)' };
  if (qNum >= 1440) return { res: '2K', label: '2K (1440p Quad HD)', note: 'Quad HD 2K 1440p tajam dengan audio (Server 2)' };
  if (qNum >= 1080) return { res: '1080p', label: '1080p Full HD', note: 'Full HD 1080p jernih dengan audio (Server 2)' };
  if (qNum >= 720) return { res: '720p', label: '720p HD', note: 'HD 720p cepat & jernih (Server 2)' };
  if (qNum >= 480) return { res: '480p', label: '480p Standard', note: 'SD 480p hemat kuota (Server 2)' };
  if (qNum >= 360) return { res: '360p', label: '360p Ringan', note: 'SD 360p ringan & cepat (Server 2)' };
  if (qNum >= 240) return { res: '240p', label: '240p Mobile', note: 'Resolusi ringan 240p (Server 2)' };
  return { res: `${qNum}p`, label: `${qNum}p Hemat`, note: `Resolusi ${qNum}p super hemat` };
}

/**
 * =========================================================================
 * SERVER 2 YOUTUBE METADATA & FORMAT SCRAPER
 * =========================================================================
 * Free keyless scraper supporting:
 * - YouTube Community Posts & Photo Slides (single & multi-image)
 * - Video resolutions from 4K (2160p), 2K (1440p), 1080p, 720p, 480p, 360p, 240p, 144p
 * - MP3 Audio (320 / 256 / 192 / 128 / 64 kbps)
 */
export async function scrapeYouTubeServer2(rawUrl: string): Promise<MediaMetadata> {
  if (isYouTubePostUrl(rawUrl)) {
    return await scrapeYouTubePost(rawUrl);
  }

  const videoId = extractYouTubeVideoId(rawUrl);
  const canonicalUrl = canonicalizeYouTubeUrl(rawUrl);

  if (!videoId) {
    throw new Error('Link YouTube tidak valid. Gunakan link video, Shorts, youtu.be, atau Postingan Komunitas YouTube.');
  }

  // Fetch SaveTube stream info and YouTube oEmbed/watch page stats in parallel
  const [{ info }, pageMeta] = await Promise.all([
    fetchSaveTubeInfo(canonicalUrl, videoId),
    fetchYouTubePageEnrichment(canonicalUrl, videoId)
  ]);

  const rawVideoFormats = Array.isArray(info.video_formats) ? info.video_formats : [];
  const seenResolutions = new Set<number>();
  const normalizedVideoEntries: Array<{ qualityNum: number; res: string; label: string; note: string; directUrl: string }> = [];

  for (const vf of rawVideoFormats) {
    const qNum = Number(vf?.quality);
    if (!qNum || isNaN(qNum) || seenResolutions.has(qNum)) continue;
    seenResolutions.add(qNum);
    const meta = mapNumericQualityToMeta(qNum);
    normalizedVideoEntries.push({
      qualityNum: qNum,
      res: meta.res,
      label: meta.label,
      note: meta.note,
      directUrl: typeof vf.url === 'string' && vf.url.startsWith('http') ? vf.url : ''
    });
  }

  // Sort strictly highest resolution first (2160 -> 1440 -> 1080 -> 720 -> 480 -> 360 -> 240 -> 144)
  normalizedVideoEntries.sort((a, b) => b.qualityNum - a.qualityNum);

  const formats: MediaFormat[] = normalizedVideoEntries.map((entry) => ({
    id: `yt-s2-${entry.qualityNum}`,
    quality: entry.label,
    resolution: entry.res,
    type: 'video',
    extension: 'mp4',
    url: '', // Resolved on-demand via /api/start-job using selected exact resolution
    isDirect: true,
    needsResolution: true,
    note: entry.note
  }));

  // Ensure standard fallback presets if upstream returned empty list
  if (formats.length === 0) {
    [1080, 720, 480, 360].forEach((qNum) => {
      const meta = mapNumericQualityToMeta(qNum);
      formats.push({
        id: `yt-s2-${qNum}`,
        quality: meta.label,
        resolution: meta.res,
        type: 'video',
        extension: 'mp4',
        url: '',
        isDirect: true,
        needsResolution: true,
        note: meta.note
      });
    });
  }

  // Audio MP3 options (320 / 256 / 192 / 128 / 64 kbps)
  const audioOptions = [
    { kbps: 320, label: '320 kbps (Ultra HQ MP3)', note: 'Audio MP3 jernih bitrate tertinggi' },
    { kbps: 256, label: '256 kbps (High Quality MP3)', note: 'Audio MP3 kualitas tinggi' },
    { kbps: 192, label: '192 kbps (Standard MP3)', note: 'Audio MP3 standar jernih' },
    { kbps: 128, label: '128 kbps (Fast MP3)', note: 'Audio MP3 cepat & hemat kuota' },
    { kbps: 64, label: '64 kbps (Voice / Low Data)', note: 'Ukuran paling ringan' }
  ];

  audioOptions.forEach((ao) => {
    formats.push({
      id: `yt-s2-audio-${ao.kbps}`,
      quality: ao.label,
      resolution: `${ao.kbps} kbps`,
      type: 'audio',
      extension: 'mp3',
      url: '',
      isDirect: true,
      needsResolution: true,
      note: ao.note
    });
  });

  const durationSec = Number(info.duration) || pageMeta.duration || 0;
  const durationFormatted =
    info.durationLabel || (durationSec > 0 ? formatDuration(durationSec) : '03:30');

  return {
    id: videoId,
    url: canonicalUrl,
    platform: 'youtube',
    title: pageMeta.title || info.title || 'YouTube Video',
    author: pageMeta.author || 'YouTube Channel',
    authorUrl: pageMeta.authorUrl,
    thumbnail:
      info.thumbnail ||
      pageMeta.thumbnail ||
      `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    duration: durationSec || 210,
    durationFormatted,
    views: pageMeta.views,
    likes: pageMeta.likes,
    comments: pageMeta.comments,
    formats,
    source: 'Server 2 YouTube Scraper',
    createdAt: new Date().toISOString()
  };
}

/**
 * =========================================================================
 * SERVER 2 YOUTUBE ON-DEMAND STREAM RESOLVER
 * =========================================================================
 * Resolves exact requested video resolution (2160/1440/1080/720/480/360/240/144)
 * or MP3 audio directly to a verified downloadable CDN stream URL.
 */
export async function resolveYouTubeServer2(
  rawUrl: string,
  formatId: string,
  resolution: string,
  type: string
): Promise<{ downloadUrl: string; quality?: string }> {
  const videoId = extractYouTubeVideoId(rawUrl);
  const canonicalUrl = canonicalizeYouTubeUrl(rawUrl);

  if (!videoId) {
    throw new Error('Server 2 YouTube: ID video tidak valid.');
  }

  const { cdn, info } = await fetchSaveTubeInfo(canonicalUrl, videoId);

  const isAudio =
    type === 'audio' ||
    (formatId || '').toLowerCase().includes('audio') ||
    /mp3|audio|kbps|320|256|192|128|64/i.test(resolution || '');

  const callSaveTubeDownload = async (
    downloadType: 'video' | 'audio',
    qualityNum: number,
    activeCdn: string,
    activeKey: string
  ): Promise<string | null> => {
    const res = await fetch(`https://${activeCdn}/download`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 12; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Mobile Safari/537.36',
        'Referer': 'https://save-tube.com/',
        'Origin': 'https://save-tube.com'
      },
      body: JSON.stringify({
        downloadType,
        quality: String(qualityNum),
        key: activeKey
      }),
      signal: AbortSignal.timeout(15000)
    });

    if (!res.ok) return null;
    const json = await res.json();
    const dlUrl = json?.data?.downloadUrl;
    if (typeof dlUrl === 'string' && dlUrl.startsWith('http')) {
      return dlUrl;
    }
    return null;
  };

  if (isAudio) {
    const availableAudioQualities = [...new Set(
      (info.audio_formats || [])
        .map((a) => Number(a.quality))
        .filter((n) => !isNaN(n) && n > 0)
    )].sort((a, b) => b - a);
    const candidateAudioQs = availableAudioQualities.length > 0 ? availableAudioQualities : [128];

    let activeAudioCdn = cdn;
    let activeAudioKey = info.key;

    for (let i = 0; i < candidateAudioQs.length; i++) {
      const q = candidateAudioQs[i];
      let dlUrl = await callSaveTubeDownload('audio', q, activeAudioCdn, activeAudioKey).catch(() => null);
      if (!dlUrl && i === 0) {
        // Retry once with fresh info key/CDN in case cached key expired
        infoCache.delete(videoId);
        try {
          const fresh = await fetchSaveTubeInfo(canonicalUrl, videoId);
          activeAudioCdn = fresh.cdn;
          activeAudioKey = fresh.info.key;
          dlUrl = await callSaveTubeDownload('audio', q, activeAudioCdn, activeAudioKey).catch(() => null);
        } catch {}
      }
      if (dlUrl) {
        return {
          downloadUrl: dlUrl,
          quality: `MP3 Audio (${resolution || `${q} kbps`})`
        };
      }
    }
    throw new Error('Server 2 YouTube: Gagal mengonversi audio MP3.');
  }

  // Parse requested numeric resolution
  const combinedHint = `${resolution || ''} ${formatId || ''}`.toLowerCase();
  let requestedHeight = 1080;
  if (combinedHint.includes('original')) requestedHeight = 4320;
  else if (combinedHint.includes('2160') || combinedHint.includes('4k')) requestedHeight = 2160;
  else if (combinedHint.includes('1440') || combinedHint.includes('2k')) requestedHeight = 1440;
  else if (combinedHint.includes('1080')) requestedHeight = 1080;
  else if (combinedHint.includes('720')) requestedHeight = 720;
  else if (combinedHint.includes('480')) requestedHeight = 480;
  else if (combinedHint.includes('360')) requestedHeight = 360;
  else if (combinedHint.includes('240')) requestedHeight = 240;
  else if (combinedHint.includes('144')) requestedHeight = 144;

  const availableHeights = [...new Set(
    (info.video_formats || [])
      .map((v) => Number(v.quality))
      .filter((n) => !isNaN(n) && n > 0)
  )].sort((a, b) => b - a);

  // Build ordered candidate heights: exact match -> closest lower -> highest available
  const candidateHeights: number[] = [];
  if (availableHeights.length > 0) {
    const exact = availableHeights.find((h) => h === requestedHeight);
    if (exact) candidateHeights.push(exact);
    const lowerOrEqual = availableHeights.filter((h) => h <= requestedHeight && h !== exact);
    candidateHeights.push(...lowerOrEqual);
    const higher = availableHeights.filter((h) => h > requestedHeight).sort((a, b) => a - b);
    candidateHeights.push(...higher);
  } else {
    candidateHeights.push(requestedHeight, 720, 360);
  }

  let activeCdn = cdn;
  let activeKey = info.key;

  for (let i = 0; i < Math.min(candidateHeights.length, 3); i++) {
    const q = candidateHeights[i];
    let dlUrl = await callSaveTubeDownload('video', q, activeCdn, activeKey).catch(() => null);
    if (!dlUrl && i === 0) {
      // Refresh key once if first attempt failed (e.g. expired key)
      infoCache.delete(videoId);
      try {
        const fresh = await fetchSaveTubeInfo(canonicalUrl, videoId);
        activeCdn = fresh.cdn;
        activeKey = fresh.info.key;
        dlUrl = await callSaveTubeDownload('video', q, activeCdn, activeKey).catch(() => null);
      } catch {}
    }
    if (dlUrl) {
      const meta = mapNumericQualityToMeta(q);
      return {
        downloadUrl: dlUrl,
        quality: `${meta.res} MP4`
      };
    }
  }

  throw new Error('Server 2 YouTube: Gagal menyiapkan stream video untuk resolusi ini.');
}
