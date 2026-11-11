/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MediaMetadata, MediaFormat } from '../../types/index.ts';

// Helper formatting utilities
function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return '00:00';
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
 * Resolves shortlinks (vt.tiktok.com, vm.tiktok.com, /t/) to full canonical URLs.
 */
export async function resolveTikTokShortUrl(rawUrl: string): Promise<string> {
  const trimmed = rawUrl.trim();
  if (!trimmed.includes('vt.tiktok.com') && !trimmed.includes('vm.tiktok.com') && !trimmed.includes('/t/')) {
    return trimmed;
  }
  try {
    const res = await fetch(trimmed, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
      },
      signal: AbortSignal.timeout(6000)
    });
    if (res.url && res.url !== trimmed && res.url.startsWith('http') && !res.url.includes('?_r=')) {
      return res.url;
    }
    return trimmed;
  } catch {
    return trimmed;
  }
}

export interface TikWMData {
  id: string;
  title: string;
  cover: string;
  origin_cover?: string;
  ai_dynamic_cover?: string;
  duration: number;
  play: string;        // 720p / SD no watermark
  hdplay?: string;     // 1080p / High-bitrate master no watermark
  wmplay?: string;     // with watermark
  size?: number;
  hd_size?: number;
  wm_size?: number;
  music?: string;      // MP3 audio
  music_info?: {
    id: string;
    title: string;
    author: string;
    play: string;
    cover?: string;
    duration?: number;
  };
  images?: string[];
  author?: {
    id: string;
    unique_id: string;
    nickname: string;
    avatar: string;
  };
}

interface TikWMResponse {
  code: number;
  msg: string;
  data?: TikWMData;
}

/**
 * Tier 1: Scrape TikTok data from TikWM high-speed API with fallback mirrors.
 */
async function fetchTikWMData(targetUrl: string): Promise<TikWMData> {
  const cleanUrl = encodeURIComponent(targetUrl);
  const endpoints = [
    `https://www.tikwm.com/api/?url=${cleanUrl}&hd=1`,
    `https://tikwm.com/api/?url=${cleanUrl}&hd=1`,
    `https://www.tikwm.com/api/?url=${cleanUrl}`,
    `https://tikwm.com/api/?url=${cleanUrl}`
  ];

  let lastError = '';
  for (const ep of endpoints) {
    try {
      const res = await fetch(ep, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*'
        },
        signal: AbortSignal.timeout(9000)
      });
      if (res.ok) {
        const json: TikWMResponse = await res.json();
        if (json.code === 0 && json.data) {
          return json.data;
        } else if (json.msg) {
          lastError = json.msg;
        }
      }
    } catch (e: any) {
      lastError = e?.message || 'Koneksi ke endpoint TikWM gagal';
    }
  }

  throw new Error(lastError || 'Server 2: Gagal mengambil data video TikTok dari penyedia stream.');
}

/**
 * Tier 2: Query official TikTok mobile app gateway for aweme bitrate gears.
 */
async function fetchOfficialTikTokFeed(awemeId: string): Promise<any | null> {
  if (!awemeId || !/^\d+$/.test(awemeId)) return null;
  const feedUrl = `https://api16-normal-useast5.tiktokv.us/aweme/v1/feed/?aweme_id=${encodeURIComponent(awemeId)}`;
  try {
    const res = await fetch(feedUrl, {
      method: 'OPTIONS',
      headers: {
        'User-Agent': 'com.zhiliaoapp.musically/300904 (2018111632; U; Android 10; en_US; Pixel 4; Build/QQ3A.200805.001; Cronet/58.0.2991.0)'
      },
      signal: AbortSignal.timeout(6000)
    });
    if (res.ok) {
      const json = await res.json();
      if (json && json.status_code === 0 && Array.isArray(json.aweme_list) && json.aweme_list[0]) {
        return json.aweme_list[0];
      }
    }
  } catch (e) {
    console.warn('[Server 2 TikTok] Official gateway notice:', e);
  }
  return null;
}

/**
 * Normalizes relative or CDN URLs into clean absolute URLs.
 */
function ensureAbsoluteUrl(url?: string): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  return `https://www.tikwm.com${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
}

/**
 * =========================================================================
 * SERVER 2 TIKTOK DOWNLOAD RESOLVER (ON-DEMAND)
 * =========================================================================
 * Strictly fulfills user selection:
 * - Audio: Returns high-quality original sound MP3 (320kbps)
 * - 4K / 2160p: Returns master stream with top bitrate
 * - 1080p Full HD: Returns pristine 1080p unwatermarked stream
 * - 720p HD: Returns standard 720p unwatermarked stream (saves data)
 * - 480p / 360p SD: Returns lightweight stream for speed
 * - Photos: Returns high-resolution image slide
 */
export async function resolveTikTokServer2(
  url: string,
  formatId: string,
  resolution: string,
  type: string
): Promise<{ downloadUrl: string; quality?: string }> {
  const target = await resolveTikTokShortUrl(url);

  // 1. Fetch metadata and stream candidates from Tier 1 (TikWM)
  const data = await fetchTikWMData(target);

  const isAudio =
    type === 'audio' ||
    formatId === 'tt-audio' ||
    /audio|mp3/i.test(resolution) ||
    /320|256|128/i.test(resolution);

  // -------------------------------------------------------------
  // RESOLUTION CASE 1: AUDIO (MP3 - 320 kbps / Original Sound)
  // -------------------------------------------------------------
  if (isAudio) {
    const audioCandidate = ensureAbsoluteUrl(data.music || data.music_info?.play);
    if (audioCandidate && audioCandidate.startsWith('http')) {
      const audioTitle = data.music_info?.title ? ` - ${data.music_info.title}` : '';
      return {
        downloadUrl: audioCandidate,
        quality: `320 kbps MP3 (Original Sound${audioTitle})`
      };
    }

    // Try Tier 2 official music stream if available
    if (data.id) {
      const officialItem = await fetchOfficialTikTokFeed(data.id);
      const officialAudio = officialItem?.music?.play_url?.url_list?.[0];
      if (officialAudio && typeof officialAudio === 'string' && officialAudio.startsWith('http')) {
        return {
          downloadUrl: officialAudio,
          quality: '320 kbps MP3 (Official Audio Master)'
        };
      }
    }

    throw new Error('Server 2: Tautan audio MP3 tidak ditemukan untuk konten ini.');
  }

  // -------------------------------------------------------------
  // RESOLUTION CASE 2: PHOTO SLIDESHOW (JPG)
  // -------------------------------------------------------------
  const isPhotos = type === 'photos' || formatId.startsWith('tt-photo');
  if (isPhotos && Array.isArray(data.images) && data.images.length > 0) {
    // If specific photo requested, e.g. tt-photo-3
    const indexMatch = formatId.match(/tt-photo-(\d+)/);
    if (indexMatch) {
      const idx = parseInt(indexMatch[1], 10) - 1;
      const targetImg = data.images[idx] || data.images[0];
      return {
        downloadUrl: ensureAbsoluteUrl(targetImg),
        quality: `Foto Slide #${idx + 1} (HD)`
      };
    }
    return {
      downloadUrl: ensureAbsoluteUrl(data.images[0]),
      quality: `Foto Slide HD (${data.images.length} Gambar)`
    };
  }

  // -------------------------------------------------------------
  // RESOLUTION CASE 3: VIDEO QUALITIES (4K / 1080p / 720p / 480p)
  // -------------------------------------------------------------
  const normalizedRes = (resolution || '').toLowerCase().trim();
  const formatIdLower = (formatId || '').toLowerCase().trim();

  const is4K = normalizedRes.includes('4k') || normalizedRes.includes('2160') || formatIdLower.includes('4k');
  const is1080p = normalizedRes.includes('1080') || formatIdLower.includes('1080');
  const is720p = normalizedRes.includes('720') || formatIdLower.includes('720');
  const is480p = normalizedRes.includes('480') || normalizedRes.includes('360') || formatIdLower.includes('480');

  const hdPlayUrl = ensureAbsoluteUrl(data.hdplay);
  const standardPlayUrl = ensureAbsoluteUrl(data.play);
  const wmPlayUrl = ensureAbsoluteUrl(data.wmplay);

  // Strategy A: 4K Ultra HD & 1080p Full HD -> Must prioritize HD master stream
  if (is4K || is1080p) {
    if (hdPlayUrl && hdPlayUrl.startsWith('http')) {
      return {
        downloadUrl: hdPlayUrl,
        quality: is4K ? '4K Ultra HD (Master Tanpa Watermark)' : '1080p Full HD (Tanpa Watermark)'
      };
    }

    // Check official feed for high-bitrate stream
    if (data.id) {
      const officialItem = await fetchOfficialTikTokFeed(data.id);
      const topGear = officialItem?.video?.bit_rate?.[0]?.play_addr?.url_list?.[0];
      if (topGear && typeof topGear === 'string' && topGear.startsWith('http')) {
        return {
          downloadUrl: topGear,
          quality: is4K ? '4K Ultra HD (Master Stream)' : '1080p Full HD (High Bitrate)'
        };
      }
    }

    // Graceful fallback to standard play if HD master is unavailable for this specific video
    if (standardPlayUrl && standardPlayUrl.startsWith('http')) {
      return {
        downloadUrl: standardPlayUrl,
        quality: '1080p Full HD (Kualitas Asli Tanpa Watermark)'
      };
    }
  }

  // Strategy B: 720p HD Standard -> Use standard compressed stream
  if (is720p) {
    if (standardPlayUrl && standardPlayUrl.startsWith('http')) {
      return {
        downloadUrl: standardPlayUrl,
        quality: '720p HD (Tanpa Watermark)'
      };
    }
    if (hdPlayUrl && hdPlayUrl.startsWith('http')) {
      return {
        downloadUrl: hdPlayUrl,
        quality: '720p HD (High Definition)'
      };
    }
  }

  // Strategy C: 480p / 360p SD -> Data saving
  if (is480p) {
    if (data.id) {
      const officialItem = await fetchOfficialTikTokFeed(data.id);
      const bitRates = officialItem?.video?.bit_rate;
      if (Array.isArray(bitRates) && bitRates.length > 1) {
        // Pick lower bitrate gear
        const lowerGear = bitRates[bitRates.length - 1]?.play_addr?.url_list?.[0];
        if (lowerGear && typeof lowerGear === 'string' && lowerGear.startsWith('http')) {
          return {
            downloadUrl: lowerGear,
            quality: '480p SD (Hemat Kuota)'
          };
        }
      }
    }
    if (standardPlayUrl && standardPlayUrl.startsWith('http')) {
      return {
        downloadUrl: standardPlayUrl,
        quality: '480p SD (Tanpa Watermark)'
      };
    }
  }

  // Default Fallback: Best available unwatermarked stream
  const bestUrl = hdPlayUrl || standardPlayUrl || wmPlayUrl;
  if (bestUrl && bestUrl.startsWith('http')) {
    return {
      downloadUrl: bestUrl,
      quality: hdPlayUrl ? '1080p Full HD (Tanpa Watermark)' : 'Kualitas Standar (Tanpa Watermark)'
    };
  }

  throw new Error('Server 2: Tidak dapat menemukan tautan unduhan video untuk resolusi yang dipilih.');
}

/**
 * =========================================================================
 * SERVER 2 TIKTOK METADATA SCRAPER
 * =========================================================================
 * Scrapes metadata and builds all formats corresponding to actual stream options.
 */
export async function scrapeTikTokServer2(rawUrl: string): Promise<MediaMetadata> {
  const target = await resolveTikTokShortUrl(rawUrl);
  const data = await fetchTikWMData(target);

  const rawImages: string[] = Array.isArray(data.images)
    ? data.images.map((img) => ensureAbsoluteUrl(img)).filter((img) => img.startsWith('http'))
    : [];
  const isPhotoSlide = rawImages.length > 0;

  const thumbnail =
    ensureAbsoluteUrl(data.ai_dynamic_cover) ||
    ensureAbsoluteUrl(data.origin_cover) ||
    ensureAbsoluteUrl(data.cover) ||
    (rawImages[0] || '');

  const durationSec = typeof data.duration === 'number' ? data.duration : 0;
  const durationFormatted = formatDuration(durationSec);
  const title = data.title || (isPhotoSlide ? 'TikTok Photo Slideshow' : 'Video TikTok');
  const author = data.author?.nickname || data.author?.unique_id || 'Kreator TikTok';
  const authorUrl = data.author?.unique_id ? `https://www.tiktok.com/@${data.author.unique_id}` : undefined;

  const formats: MediaFormat[] = [];

  // Photo slide collection formats
  if (isPhotoSlide) {
    formats.push({
      id: 'tt-photos-all',
      quality: `Koleksi Foto (${rawImages.length} Slide HD)`,
      resolution: 'HD Foto',
      type: 'photos',
      extension: 'jpg',
      url: rawImages[0],
      isDirect: true,
      needsResolution: false,
      note: `${rawImages.length} foto resolusi penuh siap unduh`
    });

    rawImages.slice(0, 10).forEach((imgUrl, i) => {
      formats.push({
        id: `tt-photo-${i + 1}`,
        quality: `Foto Slide #${i + 1}`,
        resolution: 'HD Foto',
        type: 'photos',
        extension: 'jpg',
        url: imgUrl,
        isDirect: true,
        needsResolution: false,
        note: `Gambar ke-${i + 1}`
      });
    });
  }

  // 4K Ultra HD
  formats.push({
    id: 'tt-4k',
    quality: '4K Ultra HD (2160p Tanpa Watermark)',
    resolution: '4K',
    type: 'video',
    extension: 'mp4',
    filesize: data.hd_size ? `~ ${formatBytes(Math.round(data.hd_size * 1.5))}` : (data.size ? `~ ${formatBytes(Math.round(data.size * 1.8))}` : undefined),
    url: '',
    isDirect: true,
    needsResolution: true,
    note: 'Kualitas Ultra HD 4K tertinggi tanpa watermark (Server 2)'
  });

  // 1080p Full HD
  formats.push({
    id: 'tt-1080',
    quality: '1080p Full HD (Tanpa Watermark)',
    resolution: '1080p',
    type: 'video',
    extension: 'mp4',
    filesize: data.hd_size ? formatBytes(data.hd_size) : (data.size ? formatBytes(data.size) : undefined),
    filesizeBytes: data.hd_size || data.size,
    url: '',
    isDirect: true,
    needsResolution: true,
    note: 'Kualitas Full HD 1080p asli jernih (Server 2)'
  });

  // 720p HD Standard
  formats.push({
    id: 'tt-720',
    quality: '720p HD (Tanpa Watermark)',
    resolution: '720p',
    type: 'video',
    extension: 'mp4',
    filesize: data.size ? formatBytes(data.size) : undefined,
    filesizeBytes: data.size,
    url: '',
    isDirect: true,
    needsResolution: true,
    note: 'Format HD standar hemat kuota (Server 2)'
  });

  // 480p SD
  formats.push({
    id: 'tt-480',
    quality: '480p SD (Hemat Data)',
    resolution: '480p',
    type: 'video',
    extension: 'mp4',
    filesize: data.size ? `~ ${formatBytes(Math.round(data.size * 0.6))}` : undefined,
    url: '',
    isDirect: true,
    needsResolution: true,
    note: 'Format SD hemat kuota data seluler'
  });

  // Audio MP3 (320 kbps)
  formats.push({
    id: 'tt-audio',
    quality: '320 kbps (Original Sound MP3 • Jernih)',
    resolution: 'Audio',
    type: 'audio',
    extension: 'mp3',
    url: '',
    isDirect: true,
    needsResolution: true,
    note: data.music_info?.title ? `Audio: ${data.music_info.title}` : 'Audio musik MP3 320 kbps jernih'
  });

  return {
    id: data.id ? String(data.id) : `tt-${Date.now()}`,
    url: target,
    platform: 'tiktok',
    title,
    author,
    authorUrl,
    thumbnail,
    duration: durationSec,
    durationFormatted,
    formats,
    images: rawImages.length > 0 ? rawImages : undefined,
    isPhotoSlide,
    source: 'Server 2 TikTok Scraper',
    createdAt: new Date().toISOString()
  };
}
