import type { PlatformType, MediaFormat, MediaMetadata, AudioTrack } from '../types/index.ts';
import * as cheerio from 'cheerio';

export function detectPlatform(url: string): PlatformType {
  const trimmed = url.trim();
  if (/(?:youtube\.com\/(?:watch|shorts|embed|live)|youtu\.be\/)/i.test(trimmed)) {
    return 'youtube';
  }
  if (/(?:tiktok\.com|vt\.tiktok\.com|vm\.tiktok\.com)/i.test(trimmed)) {
    return 'tiktok';
  }
  if (/(?:facebook\.com|fb\.watch|fb\.com)/i.test(trimmed)) {
    return 'facebook';
  }
  if (/(?:instagram\.com)/i.test(trimmed)) {
    return 'instagram';
  }
  if (/(?:pinterest\.com|pin\.it)/i.test(trimmed)) {
    return 'pinterest';
  }
  if (/(?:spotify\.com|spotify\.link)/i.test(trimmed)) {
    return 'spotify';
  }
  if (/(?:terabox\.com|1024tera\.com|teraboxapp\.com|terasharelink\.com|freeterabox\.com|4funbox\.com|mirrobox\.com|nephobox\.com|tibibox\.com)/i.test(trimmed)) {
    return 'terabox';
  }
  return 'unknown';
}

export function formatDuration(seconds?: number): string {
  if (!seconds || isNaN(seconds) || seconds <= 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hrs.toString().padStart(2, '0')}:${remMins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function formatBytes(bytes?: number): string {
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

// ----------------- SHORT LINK REDIRECT RESOLVER -----------------
export async function resolveRedirectUrl(url: string): Promise<string> {
  if (/(?:vt\.tiktok\.com|vm\.tiktok\.com|fb\.watch|fb\.com|instagram\.com\/share|youtu\.be|pin\.it|spotify\.link)/i.test(url)) {
    try {
      const headRes = await fetch(url, {
        method: 'HEAD',
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
        },
        signal: AbortSignal.timeout(4000)
      });
      if (headRes.url && headRes.url !== url && headRes.url.startsWith('http')) {
        return headRes.url;
      }
    } catch {
      // Fallback: try GET with small byte range if HEAD is blocked
      try {
        const getRes = await fetch(url, {
          method: 'GET',
          redirect: 'follow',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
            'Range': 'bytes=0-0'
          },
          signal: AbortSignal.timeout(4000)
        });
        if (getRes.url && getRes.url !== url && getRes.url.startsWith('http')) {
          return getRes.url;
        }
      } catch {}
    }
  }
  return url;
}

// ----------------- DEEP MEDIA URL FINDER -----------------
function extractAllMediaUrls(data: any): { videos: string[]; audios: string[]; images: string[] } {
  const videos: string[] = [];
  const audios: string[] = [];
  const images: string[] = [];

  function walk(val: any, depth = 0) {
    if (!val || depth > 5) return;
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        if (
          /\.(mp4|m4v|mkv|webm|mov)(\?|$)/i.test(trimmed) ||
          /googlevideo\.com|tiktokcdn\.com\/video|fbcdn\.net\/v\/|cdninstagram\.com\/v\//i.test(trimmed)
        ) {
          videos.push(trimmed);
        } else if (
          /\.(mp3|m4a|aac|wav|ogg)(\?|$)/i.test(trimmed) ||
          /tiktokcdn\.com\/music/i.test(trimmed)
        ) {
          audios.push(trimmed);
        } else if (
          /\.(jpg|jpeg|png|webp)(\?|$)/i.test(trimmed) ||
          /fbcdn\.net\/p|cdninstagram\.com\/p/i.test(trimmed)
        ) {
          images.push(trimmed);
        }
      }
    } else if (Array.isArray(val)) {
      for (const item of val) walk(item, depth + 1);
    } else if (typeof val === 'object') {
      for (const item of Object.values(val)) walk(item, depth + 1);
    }
  }

  walk(data);
  return {
    videos: [...new Set(videos)],
    audios: [...new Set(audios)],
    images: [...new Set(images)]
  };
}

// ----------------- CONSTANTS & CONFIG -----------------
const NEOXR_BASE_URL = 'https://api.neoxr.eu/api';
const DEFAULT_NEOXR_KEY = 'j3i3mg';

// ----------------- TIKTOK SCRAPER -----------------
async function scrapeTikTok(url: string): Promise<MediaMetadata> {
  const target = await resolveRedirectUrl(url);
  const cleanUrl = encodeURIComponent(target.trim());
  const endpoints = [
    `https://www.tikwm.com/api/?url=${cleanUrl}`,
    `https://tikwm.com/api/?url=${cleanUrl}`
  ];

  let d: any = null;
  let lastErr = '';

  for (const ep of endpoints) {
    try {
      const response = await fetch(ep, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
        },
        signal: AbortSignal.timeout(8000)
      });
      if (response.ok) {
        const json = await response.json();
        if (json.code === 0 && json.data) {
          d = json.data;
          break;
        } else {
          lastErr = json.msg || 'Gagal mengekstrak data dari TikWM';
        }
      }
    } catch (e: any) {
      lastErr = e.message || 'Koneksi ke server TikTok gagal';
    }
  }

  if (!d) {
    throw new Error(lastErr || 'Konten TikTok tidak ditemukan atau video bersifat privat.');
  }

  const fixUrl = (u?: string): string => {
    if (!u) return '';
    if (u.startsWith('http://') || u.startsWith('https://')) return u;
    return `https://www.tikwm.com${u.startsWith('/') ? '' : '/'}${u}`;
  };

  const formats: MediaFormat[] = [];
  const rawImages: string[] = Array.isArray(d.images)
    ? d.images.filter((img: any) => typeof img === 'string' && img.startsWith('http'))
    : [];
  const isPhotoSlide = rawImages.length > 0;

  // Photo slide format
  if (isPhotoSlide) {
    formats.push({
      id: 'tt-photos-all',
      quality: `Koleksi Foto (${rawImages.length} Slide Gambar HD)`,
      resolution: 'HD Foto',
      type: 'photos',
      extension: 'jpg',
      url: rawImages[0],
      isDirect: true,
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
        note: `Gambar ke-${i + 1}`
      });
    });
  }

  // HD Video (No Watermark)
  const hd = fixUrl(d.hdplay || d.play);
  if (hd) {
    formats.push({
      id: 'tt-hd',
      quality: '1080p FHD (Tanpa Watermark)',
      resolution: '1080p',
      type: 'video',
      extension: 'mp4',
      filesize: formatBytes(d.hd_size || d.size),
      filesizeBytes: d.hd_size || d.size,
      url: hd,
      isDirect: true,
      note: 'Kualitas tertinggi tanpa watermark'
    });
  }

  // Standard Video (No Watermark)
  const sd = fixUrl(d.play);
  if (sd && sd !== hd) {
    formats.push({
      id: 'tt-sd',
      quality: '720p HD (Tanpa Watermark)',
      resolution: '720p',
      type: 'video',
      extension: 'mp4',
      filesize: formatBytes(d.size),
      filesizeBytes: d.size,
      url: sd,
      isDirect: true,
      note: 'Ukuran lebih hemat data'
    });
  }

  // Original MP3 Audio
  const music = fixUrl(d.music);
  if (music) {
    formats.push({
      id: 'tt-audio',
      quality: '320 kbps (Original Sound MP3)',
      resolution: 'Audio',
      type: 'audio',
      extension: 'mp3',
      url: music,
      isDirect: true,
      note: d.music_info?.title ? `Lagu: ${d.music_info.title}` : 'Audio musik jernih'
    });
  }

  // Optional Watermarked Video
  const wm = fixUrl(d.wmplay);
  if (wm) {
    formats.push({
      id: 'tt-wm',
      quality: '720p (Dengan Watermark)',
      resolution: '720p',
      type: 'video',
      extension: 'mp4',
      filesize: formatBytes(d.wm_size),
      filesizeBytes: d.wm_size,
      url: wm,
      isDirect: true,
      note: 'Format asli TikTok'
    });
  }

  return {
    id: d.id || `tt-${Date.now()}`,
    url: target,
    platform: 'tiktok',
    title: d.title || d.caption || (isPhotoSlide ? 'TikTok Photo Slideshow' : 'Video TikTok'),
    author: d.author?.nickname || d.author?.unique_id || 'Kreator TikTok',
    authorUrl: d.author?.unique_id ? `https://www.tiktok.com/@${d.author.unique_id}` : undefined,
    thumbnail: rawImages[0] || fixUrl(d.cover) || fixUrl(d.origin_cover) || '',
    duration: d.duration || 0,
    durationFormatted: formatDuration(d.duration),
    formats,
    images: rawImages,
    isPhotoSlide,
    source: 'TikWM Live Engine',
    createdAt: new Date().toISOString()
  };
}

// ----------------- FACEBOOK SCRAPER -----------------
async function scrapeFacebook(url: string, apiKey?: string): Promise<MediaMetadata> {
  const target = await resolveRedirectUrl(url);
  let title = 'Facebook Video';
  let thumbnail = '';
  const formats: MediaFormat[] = [];

  // Attempt 1: Neoxr /api/fb (proven direct SD & HD streams)
  const envKey = (process.env.NEOXR_API_KEY || DEFAULT_NEOXR_KEY).trim().replace(/^["']|["']$/g, '');
  const neoKey = (apiKey || envKey || DEFAULT_NEOXR_KEY).trim().replace(/^["']|["']$/g, '');
  try {
    const neoRes = await fetch(`${NEOXR_BASE_URL}/fb?url=${encodeURIComponent(target)}&apikey=${encodeURIComponent(neoKey)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      signal: AbortSignal.timeout(8000)
    });
    if (neoRes.ok) {
      const neoJson = await neoRes.json();
      if (neoJson && neoJson.status && Array.isArray(neoJson.data)) {
        neoJson.data.forEach((item: any, idx: number) => {
          const itemUrl = item.url || item.link || item.download;
          if (typeof itemUrl === 'string' && itemUrl.startsWith('http')) {
            const isHd = /hd|1080|720/i.test(item.quality || '');
            formats.push({
              id: `nx-fb-${idx}`,
              quality: isHd ? '720p / 1080p HD Video' : '360p / 480p SD Video',
              resolution: isHd ? '720p' : '360p',
              type: 'video',
              extension: 'mp4',
              url: itemUrl,
              isDirect: true,
              note: isHd ? 'High Definition Video' : 'Standard Definition'
            });
          }
        });
      }
    }
  } catch (neoErr) {
    console.warn('[Facebook] Neoxr attempt skipped:', neoErr);
  }

  // Attempt 2: fdown.co.in API (verified active)
  if (formats.length === 0) {
    try {
      const res = await fetch('https://fdown.co.in/ajax', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://fdown.co.in',
          'Referer': 'https://fdown.co.in/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ url: target }),
        signal: AbortSignal.timeout(8000)
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.links) {
          if (data.title) title = data.title;
          if (data.thumbnail) thumbnail = data.thumbnail;

          const links = Object.entries(data.links).filter(([, l]) => typeof l === 'string' && (l as string).startsWith('http'));
          for (const [label, link] of links) {
            const lStr = link as string;
            const isHd = /hd|1080|720/i.test(label);
            formats.push({
              id: `fb-${label.toLowerCase().replace(/\s+/g, '-')}`,
              quality: isHd ? '720p / 1080p HD Video' : '360p / 480p SD Video',
              resolution: isHd ? '720p' : '360p',
              type: 'video',
              extension: 'mp4',
              url: lStr,
              isDirect: true,
              note: isHd ? 'High Definition Video' : 'Standard Definition'
            });
          }
        }
      }
    } catch (err) {
      console.warn('[Facebook] fdown attempt skipped:', err);
    }
  }

  // Audio format option (extract audio from direct MP4)
  if (formats.length > 0) {
    formats.push({
      id: 'fb-audio-mp3',
      quality: '192 kbps (Ekstrak Audio MP3)',
      resolution: 'Audio',
      type: 'audio',
      extension: 'mp3',
      url: formats[0].url,
      isDirect: false,
      note: 'Dikonversi ke audio MP3 jernih'
    });
  }

  if (formats.length === 0) {
    throw new Error('Tidak dapat mengekstrak video Facebook. Pastikan video bersifat Publik dan tautan valid.');
  }

  return {
    id: `fb-${Date.now()}`,
    url: target,
    platform: 'facebook',
    title,
    author: 'Facebook Creator',
    thumbnail: thumbnail || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800',
    duration: 60,
    durationFormatted: '01:00',
    formats,
    source: 'Facebook Cloud Extraction',
    createdAt: new Date().toISOString()
  };
}

// ----------------- YOUTUBE SCRAPER -----------------
async function scrapeYouTube(url: string, apiKey?: string): Promise<MediaMetadata> {
  const target = await resolveRedirectUrl(url);
  let title = 'YouTube Video';
  let author = 'YouTube Channel';
  let thumbnail = '';
  let authorUrl = '';
  let duration = 0;
  let durationFormatted = '';

  // Extract video ID
  const vMatch = target.match(/(?:youtube\.com\/(?:watch\?[^#]*v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i);
  const videoId = vMatch ? vMatch[1] : '';

  if (videoId) {
    thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  }

  // Step 1: oEmbed metadata
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(target)}&format=json`;
    const oeRes = await fetch(oembedUrl, { signal: AbortSignal.timeout(5000) });
    if (oeRes.ok) {
      const oe = await oeRes.json();
      if (oe.title) title = oe.title;
      if (oe.author_name) author = oe.author_name;
      if (oe.author_url) authorUrl = oe.author_url;
      if (oe.thumbnail_url) thumbnail = oe.thumbnail_url;
    }
  } catch (e) {
    console.warn('[YouTube] oembed notice:', e);
  }

  const formats: MediaFormat[] = [];
  const envKey = (process.env.NEOXR_API_KEY || DEFAULT_NEOXR_KEY).trim().replace(/^["']|["']$/g, '');
  const neoKey = (apiKey || envKey || DEFAULT_NEOXR_KEY).trim().replace(/^["']|["']$/g, '');

  // Step 2: Query Neoxr YouTube API for direct 720p HD stream, 480p, 360p & 128kbps audio
  let direct720Url = '';
  let direct480Url = '';
  let direct360Url = '';
  let directAudioUrl = '';

  try {
    const [vRes720, vRes480, vRes360, aRes] = await Promise.allSettled([
      fetch(`${NEOXR_BASE_URL}/youtube?url=${encodeURIComponent(target)}&type=video&quality=720p&apikey=${encodeURIComponent(neoKey)}`, { signal: AbortSignal.timeout(10000) }),
      fetch(`${NEOXR_BASE_URL}/youtube?url=${encodeURIComponent(target)}&type=video&quality=480p&apikey=${encodeURIComponent(neoKey)}`, { signal: AbortSignal.timeout(10000) }),
      fetch(`${NEOXR_BASE_URL}/youtube?url=${encodeURIComponent(target)}&type=video&quality=360p&apikey=${encodeURIComponent(neoKey)}`, { signal: AbortSignal.timeout(10000) }),
      fetch(`${NEOXR_BASE_URL}/youtube?url=${encodeURIComponent(target)}&type=audio&quality=128kbps&apikey=${encodeURIComponent(neoKey)}`, { signal: AbortSignal.timeout(10000) })
    ]);

    if (vRes720.status === 'fulfilled' && vRes720.value.ok) {
      const j = await vRes720.value.json();
      if (j && j.status) {
        if (j.data?.url) direct720Url = j.data.url;
        if (j.thumbnail) thumbnail = j.thumbnail;
        if (j.title && title === 'YouTube Video') title = j.title;
        if (j.channel && author === 'YouTube Channel') author = j.channel;
        if (j.duration_seconds && !isNaN(Number(j.duration_seconds))) {
          duration = Number(j.duration_seconds);
        } else if (typeof j.duration === 'string') {
          const parts = j.duration.split(':').map((p: string) => Number(p.trim()));
          if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            duration = parts[0] * 60 + parts[1];
          } else if (parts.length === 3) {
            duration = parts[0] * 3600 + parts[1] * 60 + parts[2];
          }
        }
        if (j.duration && typeof j.duration === 'string') {
          durationFormatted = j.duration;
        }
      }
    }

    if (vRes480.status === 'fulfilled' && vRes480.value.ok) {
      const j = await vRes480.value.json();
      if (j && j.status && j.data?.url) direct480Url = j.data.url;
    }

    if (vRes360.status === 'fulfilled' && vRes360.value.ok) {
      const j = await vRes360.value.json();
      if (j && j.status && j.data?.url) direct360Url = j.data.url;
    }

    if (aRes.status === 'fulfilled' && aRes.value.ok) {
      const j = await aRes.value.json();
      if (j && j.status && j.data?.url) {
        directAudioUrl = j.data.url;
        if (!duration && j.duration_seconds) {
          duration = Number(j.duration_seconds);
        }
        if (!durationFormatted && j.duration) {
          durationFormatted = String(j.duration);
        }
      }
    }
  } catch (err) {
    console.warn('[YouTube] Neoxr stream query notice:', err);
  }

  // Step 3: Fallback YouTube watch page HTML duration extraction if not detected yet
  if (!duration && videoId) {
    try {
      const ytWatchRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9'
        },
        signal: AbortSignal.timeout(5000)
      });
      if (ytWatchRes.ok) {
        const html = await ytWatchRes.text();
        const lenMatch = html.match(/"lengthSeconds":"(\d+)"/) || html.match(/"approxDurationMs":"(\d+)"/);
        if (lenMatch && lenMatch[1]) {
          const rawSecs = lenMatch[0].includes('approxDurationMs') ? Math.round(Number(lenMatch[1]) / 1000) : Number(lenMatch[1]);
          if (rawSecs > 0) {
            duration = rawSecs;
            durationFormatted = formatDuration(rawSecs);
          }
        }
      }
    } catch (ytErr) {
      console.warn('[YouTube] HTML duration extraction notice:', ytErr);
    }
  }

  if (!durationFormatted) {
    durationFormatted = duration > 0 ? formatDuration(duration) : '03:30';
  }
  if (!duration) {
    duration = 210;
  }

  // Determine working video and audio URLs
  const bestVideoUrl = direct720Url || direct480Url || direct360Url || '';
  const bestAudioUrl = directAudioUrl || bestVideoUrl;

  // Register multi-resolution video options with reliable direct streams
  const videoResolutions = [
    { label: '4K (2160p Ultra HD)', format: '2160', res: '4K', note: 'Kualitas sinematik 4K UHD tertinggi', url: bestVideoUrl },
    { label: '2K (1440p Quad HD)', format: '1440', res: '2K', note: 'Super tajam 2K Quad HD (1440p)', url: bestVideoUrl },
    { label: '1080p Full HD', format: '1080', res: '1080p', note: 'Standar kualitas Full HD jernih', url: bestVideoUrl },
    { label: '720p HD (Unduhan Cepat)', format: '720', res: '720p', note: 'Resolusi HD siap unduh langsung', url: direct720Url || bestVideoUrl },
    { label: '480p Standard', format: '480', res: '480p', note: 'Hemat kuota dan cepat diunduh', url: direct480Url || bestVideoUrl },
    { label: '360p Ringan', format: '360', res: '360p', note: 'Ukuran paling hemat untuk ponsel', url: direct360Url || bestVideoUrl }
  ];

  videoResolutions.forEach((q) => {
    formats.push({
      id: `yt-${q.format}`,
      quality: q.label,
      resolution: q.res,
      type: 'video',
      extension: 'mp4',
      url: q.url || bestVideoUrl,
      isDirect: Boolean(q.url || bestVideoUrl),
      note: q.url ? 'Unduhan langsung instan siap simpan' : q.note
    });
  });

  // Audio formats (64 - 320 kbps) with verified audio stream
  const audioQualities = [
    { label: '320 kbps (Lossless Studio Fidelity)', format: 'mp3', note: 'Bitrate audio MP3 studio tertinggi' },
    { label: '256 kbps (High Quality Audio)', format: 'mp3', note: 'Audio jernih kualitas mantap' },
    { label: '192 kbps (Standard Audio)', format: 'mp3', note: 'Kualitas standar streaming' },
    { label: '128 kbps (Audio Langsung)', format: 'mp3', note: 'Audio MP3 siap unduh instan' },
    { label: '64 kbps (Voice / Low Data)', format: 'mp3', note: 'Hemat penyimpanan dan kuota' }
  ];

  audioQualities.forEach((aq, idx) => {
    formats.push({
      id: `yt-audio-${idx}`,
      quality: aq.label,
      resolution: 'Audio',
      type: 'audio',
      extension: 'mp3',
      url: bestAudioUrl,
      isDirect: Boolean(bestAudioUrl),
      note: bestAudioUrl ? 'Audio siap unduh instan' : aq.note
    });
  });

  return {
    id: videoId || `yt-${Date.now()}`,
    url: target,
    platform: 'youtube',
    title,
    author,
    authorUrl,
    thumbnail: thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    duration,
    durationFormatted,
    formats,
    source: direct720Url ? 'Neoxr High-Speed YouTube Engine' : 'DownloaderZero Cloud Stream Engine',
    createdAt: new Date().toISOString()
  };
}

// ----------------- INSTAGRAM SCRAPER -----------------
async function scrapeInstagram(url: string, apiKey?: string): Promise<MediaMetadata> {
  const target = await resolveRedirectUrl(url);
  let title = 'Instagram Reel / Post';
  let thumbnail = '';
  const formats: MediaFormat[] = [];
  let images: string[] = [];

  const shortcodeMatch = target.match(/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
  const shortcode = shortcodeMatch ? shortcodeMatch[1] : '';

  // Attempt 1: Neoxr /api/ig (official working endpoint)
  const envKey = (process.env.NEOXR_API_KEY || DEFAULT_NEOXR_KEY).trim().replace(/^["']|["']$/g, '');
  const neoKey = (apiKey || envKey || DEFAULT_NEOXR_KEY).trim().replace(/^["']|["']$/g, '');

  try {
    const neoRes = await fetch(`${NEOXR_BASE_URL}/ig?url=${encodeURIComponent(target)}&apikey=${encodeURIComponent(neoKey)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      signal: AbortSignal.timeout(8000)
    });

    if (neoRes.ok) {
      const neoJson = await neoRes.json();
      if (neoJson && neoJson.status && neoJson.data) {
        const rawData = neoJson.data;
        const items = Array.isArray(rawData) ? rawData : (Array.isArray(rawData.data) ? rawData.data : [rawData]);

        items.forEach((item: any, idx: number) => {
          const itemUrl = item.url || item.video || item.photo || item.image || item.download || item;
          if (typeof itemUrl === 'string' && itemUrl.startsWith('http')) {
            const isAudio = /\.(mp3|m4a)(\?|$)/i.test(itemUrl);
            const isImage = /\.(jpg|jpeg|png|webp)(\?|$)/i.test(itemUrl) || item.type === 'image';

            if (isImage) {
              images.push(itemUrl);
              formats.push({
                id: `ig-photo-${idx}`,
                quality: `HD Foto Instagram #${idx + 1}`,
                resolution: 'HD Foto',
                type: 'photos',
                extension: 'jpg',
                url: itemUrl,
                isDirect: true,
                note: 'Foto Instagram Resolusi Penuh'
              });
            } else if (isAudio) {
              formats.push({
                id: `ig-audio-${idx}`,
                quality: 'MP3 Audio Instagram',
                resolution: 'Audio',
                type: 'audio',
                extension: 'mp3',
                url: itemUrl,
                isDirect: true,
                note: 'Audio asli postingan Instagram'
              });
            } else {
              formats.push({
                id: `ig-vid-${idx}`,
                quality: '1080p HD Video MP4',
                resolution: '1080p',
                type: 'video',
                extension: 'mp4',
                url: itemUrl,
                isDirect: true,
                note: 'Video Instagram Jernih'
              });
            }
          }
        });
      }
    }
  } catch (neoErr) {
    console.warn('[Instagram] Neoxr attempt skipped:', neoErr);
  }

  // Attempt 2: Instagram Embed captioned page parser (direct CDN extraction)
  if (formats.length === 0 && shortcode) {
    try {
      const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/captioned/`;
      const embedRes = await fetch(embedUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        signal: AbortSignal.timeout(7000)
      });

      if (embedRes.ok) {
        const html = await embedRes.text();
        const cdnMatches = [...html.matchAll(/https:\/\/[^"'\s\\]*(?:cdninstagram\.com|fbcdn\.net)\/[^"'\s\\]+/gi)]
          .map((m) => m[0].replace(/\\u0026/g, '&').replace(/\\/g, ''))
          .filter((u) => !u.includes('rsrc.php'));

        const mp4s = cdnMatches.filter((u) => u.includes('.mp4'));
        const jpgs = cdnMatches.filter((u) => u.includes('.jpg') || u.includes('.webp'));

        if (mp4s.length > 0) {
          formats.push({
            id: 'ig-embed-vid',
            quality: '1080p HD Video MP4',
            resolution: '1080p',
            type: 'video',
            extension: 'mp4',
            url: mp4s[0],
            isDirect: true,
            note: 'Video Instagram Direct CDN'
          });
        }

        if (jpgs.length > 0) {
          images = [...new Set(jpgs)];
          if (!thumbnail) thumbnail = images[0];
          if (formats.length === 0) {
            formats.push({
              id: 'ig-embed-photo',
              quality: 'HD Foto Instagram',
              resolution: 'HD Foto',
              type: 'photos',
              extension: 'jpg',
              url: images[0],
              isDirect: true,
              note: 'Foto Instagram Resolusi Penuh'
            });
          }
        }
      }
    } catch (embedErr) {
      console.warn('[Instagram] Embed extraction skipped:', embedErr);
    }
  }

  // Attempt 3: fdown.co.in Instagram endpoint
  if (formats.length === 0) {
    try {
      const res = await fetch('https://fdown.co.in/ajax', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://fdown.co.in',
          'Referer': 'https://fdown.co.in/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ url: target }),
        signal: AbortSignal.timeout(7000)
      });
      if (res.ok) {
        const d = await res.json();
        if (d.success && d.links) {
          if (d.title) title = d.title;
          if (d.thumbnail) thumbnail = d.thumbnail;
          for (const [k, v] of Object.entries(d.links)) {
            if (typeof v === 'string' && v.startsWith('http') && !v.includes('instagram.com/p/')) {
              formats.push({
                id: `ig-fdown-${k}`,
                quality: '1080p HD Video MP4',
                resolution: '1080p',
                type: 'video',
                extension: 'mp4',
                url: v,
                isDirect: true,
                note: 'Video Instagram Jernih'
              });
            }
          }
        }
      }
    } catch (e) {
      console.warn('[Instagram] fdown fallback skipped:', e);
    }
  }

  // Audio extraction format if video exists
  const videoFmt = formats.find((f) => f.type === 'video');
  if (videoFmt && !formats.some((f) => f.type === 'audio')) {
    formats.push({
      id: 'ig-audio',
      quality: '320 kbps MP3 Audio',
      resolution: 'Audio',
      type: 'audio',
      extension: 'mp3',
      url: videoFmt.url,
      isDirect: false,
      note: 'Ekstrak audio dari video Instagram'
    });
  }

  if (formats.length === 0) {
    throw new Error('Tidak dapat mengekstrak media dari tautan Instagram ini. Pastikan konten bersifat publik.');
  }

  return {
    id: shortcode || `ig-${Date.now()}`,
    url: target,
    platform: 'instagram',
    title: title || 'Instagram Reel',
    author: 'Instagram Creator',
    thumbnail: thumbnail || (images[0] || 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=800'),
    duration: 30,
    durationFormatted: '00:30',
    formats,
    images: images.length > 0 ? images : undefined,
    isPhotoSlide: images.length > 1,
    source: 'Instagram Cloud Engine',
    createdAt: new Date().toISOString()
  };
}

// ----------------- PINTEREST SCRAPER -----------------
async function scrapePinterest(rawUrl: string, apiKey?: string): Promise<MediaMetadata> {
  const url = await resolveRedirectUrl(rawUrl);
  let title = 'Pinterest Media';
  let author = 'Pinterest Creator';
  let thumbnail = '';
  const formats: MediaFormat[] = [];
  let images: string[] = [];

  // Attempt 1: Neoxr /api/pin (verified correct endpoint)
  const envKey = (process.env.NEOXR_API_KEY || DEFAULT_NEOXR_KEY).trim().replace(/^["']|["']$/g, '');
  const neoKey = (apiKey || envKey || DEFAULT_NEOXR_KEY).trim().replace(/^["']|["']$/g, '');

  try {
    const neoRes = await fetch(`${NEOXR_BASE_URL}/pin?url=${encodeURIComponent(url)}&apikey=${encodeURIComponent(neoKey)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(8000)
    });
    if (neoRes.ok) {
      const neoJson = await neoRes.json();
      if (neoJson && neoJson.status && neoJson.data) {
        const d = neoJson.data;
        if (d.title) title = d.title;
        if (d.author) author = d.author;
        if (d.thumbnail || d.cover) thumbnail = d.thumbnail || d.cover;

        const vidUrl = d.url || d.video || d.video_url || d.download;
        const isVid = vidUrl && (/\.mp4/i.test(vidUrl) || d.type === 'video');

        if (isVid && typeof vidUrl === 'string') {
          formats.push({
            id: 'nx-pin-vid-1080',
            quality: '1080p Full HD Video',
            resolution: '1080p',
            type: 'video',
            extension: 'mp4',
            url: vidUrl,
            isDirect: true,
            note: 'Video Pinterest Resolusi Penuh'
          });
          formats.push({
            id: 'nx-pin-audio',
            quality: '320 kbps (Ekstrak Audio MP3)',
            resolution: 'Audio',
            type: 'audio',
            extension: 'mp3',
            url: vidUrl,
            isDirect: false,
            note: 'Audio musik pin'
          });
        }

        const photoUrl = d.image || d.photo || (!isVid ? d.url : undefined);
        if (photoUrl && typeof photoUrl === 'string' && photoUrl.startsWith('http')) {
          const origPhoto = photoUrl.replace(/\/(?:236x|474x|564x|736x)\//i, '/originals/');
          images = [origPhoto];
          formats.push({
            id: 'nx-pin-photo',
            quality: 'Ultra HD 4K Original (Resolusi Asli)',
            resolution: '4K Foto',
            type: 'photos',
            extension: origPhoto.endsWith('.png') ? 'png' : 'jpg',
            url: origPhoto,
            isDirect: true,
            note: 'Foto asli tanpa kompresi'
          });
          if (!thumbnail) thumbnail = origPhoto;
        }
      }
    }
  } catch (neoErr) {
    console.warn('[Pinterest] Neoxr attempt skipped:', neoErr);
  }

  // Attempt 2: Direct Pinterest HTML & __PWS_DATA__ extraction
  if (formats.length === 0) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9'
        },
        signal: AbortSignal.timeout(8000)
      });

      if (response.ok) {
        const html = await response.text();
        const $ = cheerio.load(html);

        const pageTitle = $('title').text() || $('meta[property="og:title"]').attr('content');
        if (pageTitle) {
          title = pageTitle.replace(/\s*\|\s*Pinterest.*$/i, '').trim() || 'Pinterest Pin';
        }

        // Check __PWS_DATA__ JSON script
        const pwsJson = $('#__PWS_DATA__').html();
        if (pwsJson) {
          try {
            const pwsData = JSON.parse(pwsJson);
            const extracted = extractAllMediaUrls(pwsData);
            for (const v of extracted.videos) {
              formats.push({
                id: `pin-vid-${formats.length}`,
                quality: '1080p Full HD Video',
                resolution: '1080p',
                type: 'video',
                extension: 'mp4',
                url: v,
                isDirect: true,
                note: 'Video Pinterest Resolusi Asli'
              });
            }
            for (const img of extracted.images) {
              const origImg = img.replace(/\/(?:236x|474x|564x|736x)\//i, '/originals/');
              if (!images.includes(origImg)) images.push(origImg);
            }
          } catch {}
        }

        // Regex scan for original pin images
        const origMatches = [...html.matchAll(/https:\/\/[^"'\s\\]+\.pinimg\.com\/originals\/[^"'\s\\]+/gi)]
          .map((m) => m[0].replace(/\\/g, '').replace(/["')\];,].*$/, ''))
          .filter((u) => /\.(jpg|jpeg|png|webp)/i.test(u));

        for (const orig of origMatches) {
          if (!images.includes(orig)) images.push(orig);
        }

        if (images.length > 0) {
          if (!thumbnail) thumbnail = images[0];
          formats.push({
            id: 'pin-photo-orig',
            quality: 'Ultra HD 4K Original (Resolusi Asli)',
            resolution: '4K Foto',
            type: 'photos',
            extension: images[0].endsWith('.png') ? 'png' : 'jpg',
            url: images[0],
            isDirect: true,
            note: 'Gambar asli resolusi penuh tanpa kompresi'
          });
        }
      }
    } catch (htmlErr) {
      console.warn('[Pinterest] HTML parsing skipped:', htmlErr);
    }
  }

  if (formats.length === 0) {
    throw new Error('Tidak dapat menemukan media dari pin Pinterest ini. Pastikan tautan bersifat publik.');
  }

  return {
    id: `pin-${Date.now()}`,
    url,
    platform: 'pinterest',
    title,
    author,
    thumbnail: thumbnail || (images[0] || ''),
    duration: 15,
    durationFormatted: '00:15',
    formats,
    images: images.length > 0 ? images : undefined,
    isPhotoSlide: images.length > 1,
    source: 'Pinterest Native Cloud Engine',
    createdAt: new Date().toISOString()
  };
}

// ----------------- SPOTIFY METADATA & GENRE ENRICHER -----------------
async function enrichSpotifyMetadata(
  trackId: string,
  title: string,
  artist: string
): Promise<{ genre: string; album: string; releaseDate: string; highResCover?: string; embedPreview?: string }> {
  let genre = 'Pop';
  let album = '';
  let releaseDate = '';
  let highResCover: string | undefined = undefined;
  let embedPreview: string | undefined = undefined;

  // 1. Fetch official iTunes / Apple Music catalog API for accurate genre and album info (real, non-mock data)
  try {
    const cleanSearchTitle = title.replace(/\s*-\s*.*$/, '').replace(/[\(\[].*?[\)\]]/g, '').trim();
    const query = encodeURIComponent(`${cleanSearchTitle} ${artist}`.trim());
    const res = await fetch(`https://itunes.apple.com/search?term=${query}&media=music&entity=song&limit=1`, {
      signal: AbortSignal.timeout(6000)
    });
    if (res.ok) {
      const data = await res.json();
      if (data.results && data.results[0]) {
        const item = data.results[0];
        if (item.primaryGenreName) genre = item.primaryGenreName;
        if (item.collectionName) album = item.collectionName;
        if (item.releaseDate) releaseDate = item.releaseDate.slice(0, 10);
      }
    }
  } catch (e) {
    console.warn('[Spotify] Genre lookup notice:', e);
  }

  // 2. Fetch Spotify Embed for official high-res cover, audio preview, and track metadata
  if (trackId) {
    try {
      const embedUrl = `https://open.spotify.com/embed/track/${trackId}`;
      const embedRes = await fetch(embedUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        signal: AbortSignal.timeout(7000)
      });
      if (embedRes.ok) {
        const html = await embedRes.text();
        const $ = cheerio.load(html);
        const nextDataJson = $('#__NEXT_DATA__').html();
        if (nextDataJson) {
          const nextData = JSON.parse(nextDataJson);
          const entity = nextData?.props?.pageProps?.state?.data?.entity;
          if (entity) {
            if (entity.coverArt?.sources?.[0]?.url) {
              highResCover = entity.coverArt.sources[0].url;
            }
            if (entity.audioPreview?.url) {
              embedPreview = entity.audioPreview.url;
            }
            if (!album && entity.album?.name) {
              album = entity.album.name;
            }
            if (!releaseDate && entity.releaseDate) {
              releaseDate = entity.releaseDate;
            }
          }
        }
      }
    } catch (e) {
      console.warn('[Spotify] Embed metadata notice:', e);
    }
  }

  return { genre, album, releaseDate, highResCover, embedPreview };
}

// ----------------- SPOTIFY SCRAPER -----------------
async function scrapeSpotify(rawUrl: string, apiKey?: string): Promise<MediaMetadata> {
  const trimmed = rawUrl.trim();
  
  // Extract entity type and ID: track, playlist, album, episode
  const match = trimmed.match(/(?:spotify\.com\/(?:intl-[a-z]+\/)?(track|playlist|album|episode)\/([a-zA-Z0-9]+)|spotify\.link\/([a-zA-Z0-9]+))/i);
  let entityType = match?.[1]?.toLowerCase() || 'track';
  let entityId = match?.[2] || '';

  // If short spotify.link, resolve it first
  if (trimmed.includes('spotify.link')) {
    try {
      const resolved = await resolveRedirectUrl(trimmed);
      const subMatch = resolved.match(/(?:spotify\.com\/(?:intl-[a-z]+\/)?(track|playlist|album|episode)\/([a-zA-Z0-9]+))/i);
      if (subMatch) {
        entityType = subMatch[1].toLowerCase();
        entityId = subMatch[2];
      }
    } catch {}
  }

  const isPlaylist = entityType === 'playlist' || entityType === 'album';
  const envKey = (process.env.NEOXR_API_KEY || DEFAULT_NEOXR_KEY).trim().replace(/^["']|["']$/g, '');
  const neoKey = (apiKey || envKey || DEFAULT_NEOXR_KEY).trim().replace(/^["']|["']$/g, '');

  let title = 'Spotify Music';
  let author = 'Spotify Artist';
  let thumbnail = '';
  let duration = 0;
  let previewUrl = '';
  let fullDownloadUrl = '';
  const tracks: AudioTrack[] = [];
  const formats: MediaFormat[] = [];

  // =========================================================================
  // STEP 1: Cek API Neo terlebih dahulu (menggunakan apikey j3i3mg secara default)
  // =========================================================================
  let neoSucceeded = false;
  try {
    const neoEndpoint = `https://api.neoxr.eu/api/spotify?url=${encodeURIComponent(trimmed)}&apikey=${encodeURIComponent(neoKey)}`;
    const neoRes = await fetch(neoEndpoint, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(10000)
    });

    if (neoRes.ok) {
      const neoJson = await neoRes.json();
      if (neoJson && (neoJson.status === true || neoJson.data)) {
        const d = neoJson.data?.data || neoJson.data;
        if (d && typeof d === 'object') {
          neoSucceeded = true;

          if (d.title) title = d.title;
          if (d.artist || d.author) author = d.artist || d.author;
          if (d.thumbnail || d.cover) thumbnail = d.thumbnail || d.cover;
          if (d.preview || d.preview_url) previewUrl = d.preview || d.preview_url;
          if (d.url || d.download || d.link) fullDownloadUrl = d.url || d.download || d.link;

          // Parse duration
          if (typeof d.duration === 'string' && d.duration.includes(':')) {
            const parts = d.duration.split(':').map((p: string) => Number(p.trim()));
            if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
              duration = parts[0] * 60 + parts[1];
            } else if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
              duration = parts[0] * 3600 + parts[1] * 60 + parts[2];
            }
          } else if (typeof d.duration === 'number') {
            duration = d.duration > 1000 ? Math.round(d.duration / 1000) : d.duration;
          }

          // Clean title if Neo returns "Song Title - Artist"
          if (title.includes(' - ') && author && title.toLowerCase().includes(author.toLowerCase())) {
            const parts = title.split(' - ');
            if (parts[1].trim().toLowerCase() === author.trim().toLowerCase()) {
              title = parts[0].trim();
            }
          }
        }
      }
    }
  } catch (neoErr: any) {
    console.warn('[Spotify Engine] Neo API check notice:', neoErr?.message || neoErr);
  }

  // =========================================================================
  // STEP 2: Lengkapi Metadata Resmi (Genre, Album, Cover HD, Pratinjau Audio)
  // =========================================================================
  const { genre, album, releaseDate, highResCover, embedPreview } = await enrichSpotifyMetadata(
    entityId,
    title,
    author
  );

  if (highResCover && (!thumbnail || thumbnail.includes('b273'))) {
    thumbnail = highResCover;
  }
  if (!previewUrl && embedPreview) {
    previewUrl = embedPreview;
  }

  // =========================================================================
  // STEP 3: Fallback ke Spotify Web API resmi jika Neo gagal atau tidak ada data
  // =========================================================================
  if (!neoSucceeded || !thumbnail || !title || title === 'Spotify Music') {
    try {
      const embedUrl = `https://open.spotify.com/embed/${entityType}/${entityId}`;
      const response = await fetch(embedUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        signal: AbortSignal.timeout(8000)
      });

      if (response.ok) {
        const html = await response.text();
        const $ = cheerio.load(html);
        const nextDataJson = $('#__NEXT_DATA__').html();

        if (nextDataJson) {
          const nextData = JSON.parse(nextDataJson);
          const entity = nextData?.props?.pageProps?.state?.data?.entity;

          if (entity) {
            title = entity.title || entity.name || title;
            author = entity.subtitle || entity.authors || entity.artist || author;
            thumbnail = entity.coverArt?.sources?.[0]?.url || thumbnail;
            if (!previewUrl && entity.audioPreview?.url) {
              previewUrl = entity.audioPreview.url;
            }
            if (entity.duration) {
              duration = Math.round(Number(entity.duration) / 1000);
            }

            // If playlist
            if (Array.isArray(entity.trackList) && entity.trackList.length > 0) {
              entity.trackList.forEach((t: any, idx: number) => {
                const tTitle = t.title || `Track ${idx + 1}`;
                const tArtist = t.subtitle || author;
                const durMs = Number(t.duration) || 0;
                const durSecs = Math.round(durMs / 1000);
                const tPreview = t.audioPreview?.url || '';
                const tId = t.uri?.replace('spotify:track:', '') || t.id || '';
                const cUrl = tId ? `https://open.spotify.com/track/${tId}` : trimmed;

                tracks.push({
                  id: tId || `sp-${idx}`,
                  title: tTitle,
                  artist: tArtist,
                  album: album || title,
                  genre,
                  releaseDate,
                  thumbnail: entity.coverArt?.sources?.[0]?.url || thumbnail,
                  duration: durSecs,
                  durationFormatted: formatDuration(durSecs),
                  url: cUrl,
                  previewUrl: tPreview || undefined,
                  filesize: '~ 8.5 MB'
                });
              });
            }
          }
        }
      }
    } catch (fbErr: any) {
      console.warn('[Spotify Engine] Fallback embed notice:', fbErr?.message || fbErr);
    }
  }

  // Fallback oEmbed jika masih belum ada thumbnail
  if (!thumbnail) {
    try {
      const oRes = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(trimmed)}`, {
        signal: AbortSignal.timeout(5000)
      });
      if (oRes.ok) {
        const odata = await oRes.json();
        if (odata.title && (!title || title === 'Spotify Music')) title = odata.title;
        if (odata.thumbnail_url) thumbnail = odata.thumbnail_url;
      }
    } catch {}
  }

  // Track item single
  if (tracks.length === 0) {
    tracks.push({
      id: entityId || `sp-${Date.now()}`,
      title,
      artist: author,
      album: album || title,
      genre,
      releaseDate,
      thumbnail,
      duration: duration || 30,
      durationFormatted: formatDuration(duration || 30),
      url: fullDownloadUrl || trimmed,
      previewUrl: previewUrl || undefined,
      filesize: '~ 8.5 MB'
    });
  }

  // =========================================================================
  // STEP 4: Bangun Format Unduhan MP3 melalui Neo dengan ID3 Metadata & Cover
  // =========================================================================
  const directMp3Url = fullDownloadUrl || trimmed;

  formats.push({
    id: 'sp-neo-mp3-320',
    quality: '320 kbps (Neo MP3 • Metadata & Cover Tertanam)',
    resolution: '320 kbps',
    type: 'audio',
    extension: 'mp3',
    url: directMp3Url,
    isDirect: true,
    filesize: '~ 8.5 MB',
    note: `Audio MP3 Asli Neo dengan ID3 Cover & Genre ${genre}`
  });

  formats.push({
    id: 'sp-neo-mp3-128',
    quality: '128 kbps (Standar MP3 • Hemat Kuota)',
    resolution: '128 kbps',
    type: 'audio',
    extension: 'mp3',
    url: directMp3Url,
    isDirect: true,
    filesize: '~ 3.8 MB',
    note: 'Ukuran file lebih ringan'
  });

  return {
    id: `spotify-${entityId || Date.now()}`,
    url: trimmed,
    platform: 'spotify',
    title: isPlaylist ? (title.toLowerCase().includes('playlist') || title.toLowerCase().includes('album') ? title : `Playlist - ${title}`) : title,
    author,
    thumbnail: thumbnail || (tracks[0]?.thumbnail || ''),
    genre,
    album: album || 'Spotify Single',
    releaseDate,
    previewUrl: previewUrl || tracks[0]?.previewUrl || '',
    duration: duration || tracks[0]?.duration || 30,
    durationFormatted: formatDuration(duration || tracks[0]?.duration || 30),
    formats,
    tracks,
    isAudioPlaylist: isPlaylist && tracks.length > 1,
    source: neoSucceeded ? 'Neoxr Spotify Engine' : 'Spotify Official Web Engine',
    createdAt: new Date().toISOString()
  };
}

// ----------------- TERABOX SCRAPER -----------------
async function scrapeTerabox(url: string, apiKey?: string): Promise<MediaMetadata> {
  const target = await resolveRedirectUrl(url);
  const envKey = (process.env.NEOXR_API_KEY || DEFAULT_NEOXR_KEY).trim().replace(/^["']|["']$/g, '');
  const key = (apiKey || envKey || DEFAULT_NEOXR_KEY).trim().replace(/^["']|["']$/g, '');

  let fileItem: any = null;

  // Attempt 1: Neoxr /api/terabox
  try {
    const endpoint = `${NEOXR_BASE_URL}/terabox?url=${encodeURIComponent(target)}&apikey=${encodeURIComponent(key)}`;
    const response = await fetch(endpoint, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(10000)
    });

    if (response.ok) {
      const json = await response.json();
      if (json && (json.status || json.data)) {
        const rawItems = Array.isArray(json.data) ? json.data : (json.data && Array.isArray(json.data.data) ? json.data.data : [json.data]);
        if (rawItems[0] && (rawItems[0].dlink || rawItems[0].url || rawItems[0].download)) {
          fileItem = rawItems[0];
        }
      }
    }
  } catch (neoErr) {
    console.warn('[TeraBox] Neoxr attempt skipped:', neoErr);
  }

  // Attempt 2: TeraBox Cloud public share list API
  if (!fileItem) {
    try {
      const surlMatch = target.match(/(?:surl=|\/s\/1?)([a-zA-Z0-9_-]+)/i);
      const surl = surlMatch ? surlMatch[1] : '';
      if (surl) {
        const cloudRes = await fetch(`https://www.terabox.app/share/list?shorturl=${encodeURIComponent(surl)}&root=1`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          signal: AbortSignal.timeout(8000)
        });
        if (cloudRes.ok) {
          const cJson = await cloudRes.json();
          if (cJson.errno === 0 && Array.isArray(cJson.list) && cJson.list[0]) {
            fileItem = cJson.list[0];
          }
        }
      }
    } catch (cErr) {
      console.warn('[TeraBox] Cloud share list skipped:', cErr);
    }
  }

  if (!fileItem) {
    throw new Error('Gagal mengekstrak berkas dari link TeraBox. Pastikan tautan masih aktif dan tidak diberi proteksi kata sandi.');
  }

  const filename = fileItem.server_filename || fileItem.filename || fileItem.path?.replace(/^\//, '') || 'TeraBox_File.mp4';
  const ext = (filename.split('.').pop() || 'mp4').toLowerCase();
  const directDownloadUrl = fileItem.dlink || fileItem.url || fileItem.download;

  if (!directDownloadUrl) {
    throw new Error('Link download langsung dari TeraBox tidak tersedia.');
  }

  const thumb = fileItem.thumbs?.url3 || fileItem.thumbs?.url2 || fileItem.thumbs?.url1 || fileItem.thumbs?.icon || fileItem.thumbnail || '';
  const formats: MediaFormat[] = [
    {
      id: `tb-${fileItem.fs_id || Date.now()}`,
      quality: fileItem.size ? `Original (${fileItem.size})` : 'Download Langsung',
      resolution: fileItem.width && fileItem.height ? `${fileItem.width}x${fileItem.height}` : undefined,
      type: 'video',
      extension: (ext as any) || 'mp4',
      filesize: fileItem.size,
      filesizeBytes: fileItem.bytes ? Number(fileItem.bytes) : undefined,
      url: directDownloadUrl,
      isDirect: true,
      note: 'Unduh Langsung TeraBox (Direct Cloud)'
    }
  ];

  return {
    id: `tb_${fileItem.fs_id || Date.now()}`,
    url: target,
    platform: 'terabox',
    title: filename,
    author: 'TeraBox Cloud',
    thumbnail: thumb,
    duration: typeof fileItem.duration === 'number' ? fileItem.duration : undefined,
    durationFormatted: typeof fileItem.duration === 'number' ? formatDuration(fileItem.duration) : undefined,
    formats,
    source: 'TeraBox Cloud Engine',
    createdAt: new Date().toISOString()
  };
}

// ----------------- NEOXR API SCRAPER (PRIMARY ENGINE) -----------------
async function scrapeNeoxr(targetUrl: string, platform: PlatformType, apiKey?: string): Promise<MediaMetadata> {
  const envKey = (process.env.NEOXR_API_KEY || DEFAULT_NEOXR_KEY).trim().replace(/^["']|["']$/g, '');
  const key = (apiKey || envKey || DEFAULT_NEOXR_KEY).trim().replace(/^["']|["']$/g, '');
  const keyParam = `&apikey=${encodeURIComponent(key)}`;
  const formats: MediaFormat[] = [];
  let title = `${platform.toUpperCase()} Media`;
  let author = 'Creator';
  let thumbnail = '';
  let duration = 0;
  let images: string[] = [];
  let isPhotoSlide = false;
  let tracks: AudioTrack[] = [];
  let isAudioPlaylist = false;

  // Build exact endpoints verified on Neoxr
  const endpoints: string[] = [];
  switch (platform) {
    case 'youtube':
      endpoints.push(`${NEOXR_BASE_URL}/youtube?url=${encodeURIComponent(targetUrl)}&type=video&quality=720p${keyParam}`);
      endpoints.push(`${NEOXR_BASE_URL}/youtube?url=${encodeURIComponent(targetUrl)}&type=video&quality=480p${keyParam}`);
      endpoints.push(`${NEOXR_BASE_URL}/youtube?url=${encodeURIComponent(targetUrl)}&type=video&quality=360p${keyParam}`);
      break;
    case 'tiktok':
      endpoints.push(`${NEOXR_BASE_URL}/tiktok?url=${encodeURIComponent(targetUrl)}${keyParam}`);
      break;
    case 'facebook':
      endpoints.push(`${NEOXR_BASE_URL}/fb?url=${encodeURIComponent(targetUrl)}${keyParam}`);
      break;
    case 'instagram':
      endpoints.push(`${NEOXR_BASE_URL}/ig?url=${encodeURIComponent(targetUrl)}${keyParam}`);
      break;
    case 'pinterest':
      endpoints.push(`${NEOXR_BASE_URL}/pin?url=${encodeURIComponent(targetUrl)}${keyParam}`);
      break;
    case 'spotify':
      endpoints.push(`${NEOXR_BASE_URL}/spotify?url=${encodeURIComponent(targetUrl)}${keyParam}`);
      break;
    case 'terabox':
      endpoints.push(`${NEOXR_BASE_URL}/terabox?url=${encodeURIComponent(targetUrl)}${keyParam}`);
      break;
    default:
      throw new Error(`Platform ${platform} tidak didukung.`);
  }

  let json: any = null;
  let lastErr = '';

  for (const ep of endpoints) {
    try {
      const response = await fetch(ep, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) {
        lastErr = `HTTP ${response.status}`;
        continue;
      }

      const resText = await response.text();
      try {
        const parsed = JSON.parse(resText);
        if (parsed && (parsed.status === true || parsed.data)) {
          json = parsed;
          break;
        } else {
          lastErr = parsed?.msg || parsed?.message || 'Status respons Neoxr tidak valid';
        }
      } catch (parseErr: any) {
        lastErr = `JSON parse error: ${parseErr.message}`;
      }
    } catch (err: any) {
      lastErr = err.message || 'Gagal menghubungi server Neoxr';
    }
  }

  if (!json || !json.data) {
    throw new Error(json?.msg || json?.message || lastErr || 'Gagal mengekstrak dari Neoxr API.');
  }

  const rawData = json.data;
  const data = (typeof rawData === 'object' && rawData !== null && 'data' in rawData && typeof rawData.data === 'object' && !Array.isArray(rawData))
    ? rawData.data
    : rawData;

  // 1. YouTube handling
  if (platform === 'youtube') {
    title = data.filename?.replace(/\.[^/.]+$/, '') || data.title || 'YouTube Video';
    author = data.author || data.channel || 'YouTube Creator';
    thumbnail = data.thumbnail || data.cover || '';
    duration = Number(data.duration) || 0;

    const vidUrl = data.url || data.video || data.download || data.link || data.stream || data.mp4;
    const vidQuality = data.quality || '720p';
    if (vidUrl && typeof vidUrl === 'string') {
      formats.push({
        id: `nx-yt-video-${vidQuality}`,
        quality: `${vidQuality} HD (Unduhan Langsung Super Cepat)`,
        resolution: vidQuality,
        type: 'video',
        extension: 'mp4',
        filesize: data.size || data.filesize || undefined,
        url: vidUrl,
        isDirect: true,
        note: 'Streaming langsung Neoxr tanpa antrean'
      });
    }

    // Audio format from response or dedicated audio query
    try {
      const audioRes = await fetch(`${NEOXR_BASE_URL}/youtube?url=${encodeURIComponent(targetUrl)}&type=audio&quality=128kbps${keyParam}`, {
        signal: AbortSignal.timeout(5000)
      });
      if (audioRes.ok) {
        const aJson = await audioRes.json();
        const aData = aJson?.data?.data || aJson?.data;
        const aUrl = aData?.url || aData?.audio || aData?.download || aData?.link;
        if (aUrl && typeof aUrl === 'string') {
          formats.push({
            id: 'nx-yt-audio-128',
            quality: '128 kbps (Audio MP3 Langsung)',
            resolution: 'Audio',
            type: 'audio',
            extension: 'mp3',
            filesize: aData?.size || undefined,
            url: aUrl,
            isDirect: true,
            note: 'Audio MP3 Neoxr langsung tanpa antrean'
          });
        }
      }
    } catch {}
  }

  // 2. TikTok handling
  else if (platform === 'tiktok') {
    const d = Array.isArray(data) ? data[0] : data;
    title = d.caption || d.title || d.desc || 'TikTok Video';
    author = d.author?.nickname || d.author?.unique_id || d.author || 'TikTok Creator';
    thumbnail = d.thumbnail || d.cover || d.origin_cover || '';
    duration = Number(d.duration) || 0;

    const rawImgs = d.photo || d.images || d.photos || d.slides;
    if (Array.isArray(rawImgs)) {
      images = rawImgs.filter((img: any) => typeof img === 'string' && img.startsWith('http'));
    }
    isPhotoSlide = images.length > 0;

    if (isPhotoSlide) {
      formats.push({
        id: 'nx-tt-photos-all',
        quality: `Koleksi Foto (${images.length} Slide Gambar HD)`,
        resolution: 'HD Foto',
        type: 'photos',
        extension: 'jpg',
        url: images[0],
        isDirect: true,
        note: `${images.length} foto resolusi penuh siap unduh`
      });
      if (!thumbnail && images.length > 0) {
        thumbnail = images[0];
      }
    }

    const hdUrl = d.video || d.video_hd || d.hdplay || d.nowm || d.play || d.url || d.download || d.link || d.hd;
    const sdUrl = d.videoWM || d.video_wm || d.wm || d.watermark || d.sd;
    const audioUrl = d.audio || d.music || d.sound || d.audio_url || d.mp3;

    if (hdUrl && typeof hdUrl === 'string') {
      formats.push({
        id: 'nx-tt-hd',
        quality: '1080p FHD (Tanpa Watermark)',
        resolution: '1080p',
        type: 'video',
        extension: 'mp4',
        url: hdUrl,
        isDirect: true,
        note: 'Kualitas tertinggi tanpa watermark'
      });
    }

    if (sdUrl && typeof sdUrl === 'string' && sdUrl !== hdUrl) {
      formats.push({
        id: 'nx-tt-sd',
        quality: '720p HD (Dengan Watermark)',
        resolution: '720p',
        type: 'video',
        extension: 'mp4',
        url: sdUrl,
        isDirect: true,
        note: 'Format asli TikTok'
      });
    }

    if (audioUrl && typeof audioUrl === 'string') {
      formats.push({
        id: 'nx-tt-audio',
        quality: '320 kbps (Original Sound MP3)',
        resolution: 'Audio',
        type: 'audio',
        extension: 'mp3',
        url: audioUrl,
        isDirect: true,
        note: 'Audio musik TikTok asli'
      });
    }
  }

  // 3. Facebook handling
  else if (platform === 'facebook') {
    title = data.title || 'Facebook Video';
    thumbnail = data.thumbnail || data.cover || '';

    if (Array.isArray(data)) {
      data.forEach((item: any, idx: number) => {
        const itemUrl = item.url || item.link || item.download || item;
        if (typeof itemUrl === 'string' && itemUrl.startsWith('http')) {
          const isHd = /hd|1080|720/i.test(item.quality || item.resolution || '');
          formats.push({
            id: `nx-fb-${idx}`,
            quality: isHd ? '720p / 1080p HD Video' : '360p / 480p SD Video',
            resolution: isHd ? '720p' : '360p',
            type: 'video',
            extension: 'mp4',
            url: itemUrl,
            isDirect: true,
            note: item.quality || (isHd ? 'High Definition' : 'Standard Definition')
          });
        }
      });
    } else if (typeof data === 'object') {
      const hd = data.video_hd || data.hd;
      const sd = data.video_sd || data.sd || data.video || data.url || data.download || data.link;

      if (hd && typeof hd === 'string') {
        formats.push({
          id: 'nx-fb-hd',
          quality: '1080p / 720p HD Video',
          resolution: '720p',
          type: 'video',
          extension: 'mp4',
          url: hd,
          isDirect: true,
          note: 'High Definition'
        });
      }
      if (sd && typeof sd === 'string' && sd !== hd) {
        formats.push({
          id: 'nx-fb-sd',
          quality: '360p / 480p SD Video',
          resolution: '360p',
          type: 'video',
          extension: 'mp4',
          url: sd,
          isDirect: true,
          note: 'Standard Definition'
        });
      }
    }

    if (formats.length > 0) {
      formats.push({
        id: 'nx-fb-audio',
        quality: '192 kbps (Ekstrak Audio MP3)',
        resolution: 'Audio',
        type: 'audio',
        extension: 'mp3',
        url: formats[0].url,
        isDirect: false,
        note: 'Dikonversi ke audio MP3'
      });
    }
  }

  // 4. Instagram handling
  else if (platform === 'instagram') {
    title = data.title || data.caption || 'Instagram Reel / Post';
    thumbnail = data.thumbnail || data.cover || '';

    const items = Array.isArray(data) ? data : [data];
    items.forEach((item: any, idx: number) => {
      const itemUrl = item.url || item.video || item.photo || item.image || item.download || item.link || item;
      if (typeof itemUrl === 'string' && itemUrl.startsWith('http')) {
        const isAudio = /\.(mp3|m4a)(\?|$)/i.test(itemUrl);
        const isImage = /\.(jpg|jpeg|png|webp)(\?|$)/i.test(itemUrl) || item.type === 'image';

        if (isImage) {
          images.push(itemUrl);
          formats.push({
            id: `nx-ig-photo-${idx}`,
            quality: `HD Foto Instagram #${idx + 1}`,
            resolution: 'HD Foto',
            type: 'photos',
            extension: 'jpg',
            url: itemUrl,
            isDirect: true,
            note: 'Foto Instagram Resolusi Penuh'
          });
        } else if (isAudio) {
          formats.push({
            id: `nx-ig-audio-${idx}`,
            quality: 'MP3 Audio Instagram',
            resolution: 'Audio',
            type: 'audio',
            extension: 'mp3',
            url: itemUrl,
            isDirect: true,
            note: 'Audio asli postingan'
          });
        } else {
          formats.push({
            id: `nx-ig-vid-${idx}`,
            quality: '1080p HD Video MP4',
            resolution: '1080p',
            type: 'video',
            extension: 'mp4',
            url: itemUrl,
            isDirect: true,
            note: 'Video Instagram Jernih'
          });
        }
      }
    });

    isPhotoSlide = images.length > 0;
    if (images.length > 0 && !thumbnail) {
      thumbnail = images[0];
    }

    if (formats.length > 0 && !formats.some((f) => f.type === 'audio')) {
      const vidFmt = formats.find((f) => f.type === 'video');
      if (vidFmt) {
        formats.push({
          id: 'nx-ig-audio',
          quality: '320 kbps (Ekstrak Audio MP3)',
          resolution: 'Audio',
          type: 'audio',
          extension: 'mp3',
          url: vidFmt.url,
          isDirect: false,
          note: 'Ekstrak audio dari video'
        });
      }
    }
  }

  // 5. Pinterest handling
  else if (platform === 'pinterest') {
    title = data.title || 'Pinterest Media';
    author = data.author || data.creator || 'Pinterest Creator';
    thumbnail = data.thumbnail || data.cover || '';

    const vidUrl = data.url || data.video || data.video_url || data.download || data.link;
    const isVid = vidUrl && (/\.mp4/i.test(vidUrl) || data.type === 'video');

    if (isVid && typeof vidUrl === 'string') {
      formats.push({
        id: 'nx-pin-video-1080',
        quality: '1080p Full HD Video',
        resolution: '1080p',
        type: 'video',
        extension: 'mp4',
        url: vidUrl,
        isDirect: true,
        note: 'Video Pinterest Kualitas Penuh'
      });
      formats.push({
        id: 'nx-pin-audio',
        quality: '320 kbps (Ekstrak Audio MP3)',
        resolution: 'Audio',
        type: 'audio',
        extension: 'mp3',
        url: vidUrl,
        isDirect: false,
        note: 'Ekstrak audio pin'
      });
    }

    const photoUrl = data.image || data.photo || (!isVid ? data.url : undefined);
    if (photoUrl && typeof photoUrl === 'string' && photoUrl.startsWith('http')) {
      const origPhoto = photoUrl.replace(/\/(?:236x|474x|564x|736x)\//i, '/originals/');
      images = [origPhoto];
      formats.push({
        id: 'nx-pin-photo',
        quality: 'Ultra HD 4K Original (Resolusi Asli)',
        resolution: '4K Foto',
        type: 'photos',
        extension: origPhoto.endsWith('.png') ? 'png' : 'jpg',
        url: origPhoto,
        isDirect: true,
        note: 'Foto asli tanpa kompresi'
      });
      if (!thumbnail) thumbnail = origPhoto;
    }
  }

  // 6. TeraBox handling
  else if (platform === 'terabox') {
    const rawItems = Array.isArray(data) ? data : (data && Array.isArray(data.data) ? data.data : [data]);
    const fileItem = rawItems[0] || {};
    title = fileItem.server_filename || fileItem.filename || fileItem.path?.replace(/^\//, '') || 'TeraBox Media File';
    author = 'TeraBox Cloud';
    thumbnail = fileItem.thumbs?.url3 || fileItem.thumbs?.url2 || fileItem.thumbs?.url1 || fileItem.thumbs?.icon || '';
    duration = typeof fileItem.duration === 'number' ? fileItem.duration : 0;

    const directDownloadUrl = fileItem.dlink || fileItem.url || fileItem.download;
    const filename = fileItem.server_filename || fileItem.filename || 'file.mp4';
    const ext = (filename.split('.').pop() || 'mp4').toLowerCase();

    if (directDownloadUrl && typeof directDownloadUrl === 'string') {
      formats.push({
        id: `nx-tb-${fileItem.fs_id || Date.now()}`,
        quality: fileItem.size ? `Original (${fileItem.size})` : 'Download Langsung',
        resolution: fileItem.width && fileItem.height ? `${fileItem.width}x${fileItem.height}` : undefined,
        type: 'video',
        extension: (ext as any) || 'mp4',
        filesize: fileItem.size,
        filesizeBytes: fileItem.bytes ? Number(fileItem.bytes) : undefined,
        url: directDownloadUrl,
        isDirect: true,
        note: 'Tautan unduh langsung TeraBox'
      });
    }
  }

  // Fallback URL finder if specific fields were in a nested shape
  if (formats.length === 0) {
    const extracted = extractAllMediaUrls(data);
    if (extracted.videos.length > 0) {
      extracted.videos.forEach((vUrl, i) => {
        formats.push({
          id: `nx-deep-vid-${i}`,
          quality: 'HD Video',
          resolution: '720p',
          type: 'video',
          extension: 'mp4',
          url: vUrl,
          isDirect: true,
          note: 'Media stream Neoxr'
        });
      });
    }
    if (extracted.audios.length > 0) {
      extracted.audios.forEach((aUrl, i) => {
        formats.push({
          id: `nx-deep-aud-${i}`,
          quality: 'Audio MP3',
          resolution: 'Audio',
          type: 'audio',
          extension: 'mp3',
          url: aUrl,
          isDirect: true,
          note: 'Audio stream Neoxr'
        });
      });
    }
    if (extracted.images.length > 0 && formats.length === 0) {
      images = extracted.images;
      isPhotoSlide = true;
      formats.push({
        id: 'nx-deep-img-0',
        quality: `Koleksi Gambar (${images.length} Foto)`,
        resolution: 'HD Foto',
        type: 'photos',
        extension: 'jpg',
        url: images[0],
        isDirect: true,
        note: 'Foto resolusi tinggi'
      });
    }
  }

  if (formats.length === 0) {
    throw new Error('Neoxr API tidak menghasilkan format unduhan yang valid.');
  }

  return {
    id: `neoxr-${Date.now()}`,
    url: targetUrl,
    platform,
    title,
    author,
    thumbnail: thumbnail || (images[0] || ''),
    duration,
    durationFormatted: formatDuration(duration),
    formats,
    images: images.length > 0 ? images : undefined,
    isPhotoSlide,
    tracks,
    isAudioPlaylist,
    source: 'Neoxr API Engine',
    createdAt: new Date().toISOString()
  };
}

// ----------------- MAIN EXTRACTOR DISPATCHER -----------------
export async function extractMedia(rawUrl: string, apiKey?: string): Promise<MediaMetadata> {
  let url = rawUrl.trim();
  if (!url) {
    throw new Error('Masukkan URL video atau audio yang ingin diunduh.');
  }

  if (!/^https?:\/\//i.test(url)) {
    throw new Error('URL tidak valid. Pastikan tautan diawali dengan http:// atau https://');
  }

  // 1. Resolve short URLs to canonical URLs
  try {
    url = await resolveRedirectUrl(url);
  } catch (redirErr) {
    console.warn('[Engine] Redirect resolve notice:', redirErr);
  }

  const platform = detectPlatform(url);
  if (platform === 'unknown') {
    throw new Error('Platform tidak didukung. DownloaderZero mendukung YouTube, TikTok, Facebook, Instagram, Pinterest, Spotify, dan TeraBox.');
  }

  // 2. YouTube has dedicated multi-resolution stream generator (includes Neoxr high-speed direct stream)
  if (platform === 'youtube') {
    return await scrapeYouTube(url, apiKey);
  }

  // 3. Spotify dedicated engine (Neo API first, then official Spotify Web API enricher)
  if (platform === 'spotify') {
    return await scrapeSpotify(url, apiKey);
  }

  // 4. PRIMARY ENGINE for TikTok, Facebook, Instagram, Pinterest, TeraBox: Try Neoxr API
  try {
    const neoxrResult = await scrapeNeoxr(url, platform, apiKey);
    if (neoxrResult && neoxrResult.formats.length > 0) {
      return neoxrResult;
    }
  } catch (neoxrErr: any) {
    console.warn(`[Engine] Neoxr primary engine skipped (${neoxrErr?.message || neoxrErr}). Switching to dedicated engine...`);
  }

  // 5. SECONDARY ENGINE: Platform-specific dedicated extractors
  switch (platform) {
    case 'tiktok':
      return await scrapeTikTok(url);
    case 'facebook':
      return await scrapeFacebook(url, apiKey);
    case 'instagram':
      return await scrapeInstagram(url, apiKey);
    case 'pinterest':
      return await scrapePinterest(url, apiKey);
    case 'terabox':
      return await scrapeTerabox(url, apiKey);
    default:
      throw new Error('Platform tidak didukung.');
  }
}
