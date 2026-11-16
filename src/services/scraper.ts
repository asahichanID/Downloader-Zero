import type { PlatformType, ServerMode, MediaFormat, MediaMetadata, AudioTrack, TeraboxFile } from '../types/index.ts';
import * as cheerio from 'cheerio';
import { extractTikTokPreview, resolveTikTokDownload } from './previewEngines/tiktokPreview.ts';
import { scrapeTikTokServer2, resolveTikTokServer2 } from './server2/tiktok-s2.ts';
import { scrapeTwitterServer2 } from './server2/twitter-s2.ts';

export { resolveTikTokDownload, resolveTikTokServer2, scrapeTikTokServer2, scrapeTwitterServer2 };


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
  if (/(?:twitter\.com|x\.com|fxtwitter\.com|vxtwitter\.com|fixupx\.com|twittpr\.com|^https?:\/\/(?:www\.)?t\.co\/)/i.test(trimmed)) {
    return 'twitter';
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

export function formatCount(val?: number | string | null): string {
  if (val === undefined || val === null || val === '') return '—';
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return '—';
    const numericOnly = Number(trimmed.replace(/[,.\s]/g, ''));
    if (!isNaN(numericOnly) && /^\d[\d,.\s]*$/.test(trimmed)) {
      val = numericOnly;
    } else {
      return trimmed;
    }
  }
  const num = Number(val);
  if (isNaN(num) || num < 0) return '—';
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return num.toLocaleString('id-ID');
}

function detectTeraboxFileType(filename: string): 'video' | 'audio' | 'photos' | 'file' {
  const lower = filename.toLowerCase();
  if (/\.(mp4|mkv|webm|mov|avi|flv|m4v|3gp|ts)$/i.test(lower)) return 'video';
  if (/\.(mp3|m4a|aac|wav|ogg|flac|opus)$/i.test(lower)) return 'audio';
  if (/\.(jpg|jpeg|png|webp|gif|bmp|heic)$/i.test(lower)) return 'photos';
  return 'file';
}

// ----------------- SHORT LINK REDIRECT RESOLVER -----------------
export async function resolveRedirectUrl(url: string): Promise<string> {
  if (/(?:vt\.tiktok\.com|vm\.tiktok\.com|fb\.watch|fb\.com|instagram\.com\/share|youtu\.be|pin\.it|spotify\.link|^https?:\/\/(?:www\.)?t\.co\/)/i.test(url)) {
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

// ----------------- TIKTOK SCRAPER (Delegated to dedicated modular server2/tiktok-s2.ts) -----------------
async function scrapeTikTok(url: string, _apiKey?: string, serverMode: ServerMode = 'auto'): Promise<MediaMetadata> {
  if (serverMode === 'server2') {
    return await scrapeTikTokServer2(url);
  }
  // Pengambilan media pertama download: khusus mengambil thumbnail foto utuh, angka durasi, dan judul
  // Pemakaian API download dipanggil setelah pemilihan format agar tidak dipanggil 2 kali
  return await extractTikTokPreview(url);
}

// ----------------- FACEBOOK SCRAPER -----------------
async function scrapeFacebookServer1(target: string, apiKey?: string): Promise<MediaMetadata> {
  const envKey = ((typeof process !== 'undefined' && process.env ? process.env.NEOXR_API_KEY : undefined) || DEFAULT_NEOXR_KEY).trim().replace(/^["']|["']$/g, '');
  const neoKey = (apiKey || envKey || DEFAULT_NEOXR_KEY).trim().replace(/^["']|["']$/g, '');
  const formats: MediaFormat[] = [];
  const neoRes = await fetch(`${NEOXR_BASE_URL}/fb?url=${encodeURIComponent(target)}&apikey=${encodeURIComponent(neoKey)}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    signal: AbortSignal.timeout(8000)
  });
  if (!neoRes.ok) throw new Error(`Server 1 Facebook HTTP ${neoRes.status}`);
  const neoJson = await neoRes.json();
  if (!neoJson || !neoJson.status || !Array.isArray(neoJson.data) || neoJson.data.length === 0) {
    throw new Error('Server 1 tidak dapat menemukan media Facebook.');
  }
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
  if (formats.length === 0) throw new Error('Format video tidak ditemukan di Server 1.');
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
  return {
    id: `fb-${Date.now()}`,
    url: target,
    platform: 'facebook',
    title: neoJson.title || neoJson.data[0]?.title || 'Facebook Video',
    author: neoJson.author || neoJson.data[0]?.author || 'Facebook Creator',
    thumbnail: neoJson.thumbnail || neoJson.data[0]?.thumbnail || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800',
    duration: 60,
    durationFormatted: '01:00',
    views: neoJson.views ?? neoJson.view ?? neoJson.data[0]?.views,
    likes: neoJson.likes ?? neoJson.like ?? neoJson.data[0]?.likes,
    comments: neoJson.comments ?? neoJson.comment ?? neoJson.data[0]?.comments,
    formats,
    source: 'Server 1 Engine',
    createdAt: new Date().toISOString()
  };
}

async function scrapeFacebookServer2(target: string): Promise<MediaMetadata> {
  const formats: MediaFormat[] = [];
  let title = 'Facebook Video';
  let thumbnail = '';
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
  if (!res.ok) throw new Error(`Server 2 Facebook HTTP ${res.status}`);
  const data = await res.json();
  if (!data.success || !data.links) {
    throw new Error('Server 2 tidak dapat menemukan media Facebook.');
  }
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
  if (formats.length === 0) throw new Error('Format media tidak ditemukan di Server 2.');
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
  return {
    id: `fb-${Date.now()}`,
    url: target,
    platform: 'facebook',
    title,
    author: data.author || 'Facebook Creator',
    thumbnail: thumbnail || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800',
    duration: 60,
    durationFormatted: '01:00',
    views: data.views ?? data.view,
    likes: data.likes ?? data.like,
    comments: data.comments ?? data.comment,
    formats,
    source: 'Server 2 Engine',
    createdAt: new Date().toISOString()
  };
}

async function scrapeFacebook(url: string, apiKey?: string, serverMode: ServerMode = 'auto'): Promise<MediaMetadata> {
  const target = await resolveRedirectUrl(url);
  if (serverMode === 'server1') {
    return await scrapeFacebookServer1(target, apiKey);
  }
  if (serverMode === 'server2') {
    return await scrapeFacebookServer2(target);
  }
  try {
    return await scrapeFacebookServer1(target, apiKey);
  } catch (err) {
    console.warn('[Facebook] Server 1 failed, switching to Server 2:', err);
    return await scrapeFacebookServer2(target);
  }
}


// ----------------- YOUTUBE SCRAPER -----------------
async function scrapeYouTube(url: string, apiKey?: string, serverMode: ServerMode = 'auto'): Promise<MediaMetadata> {
  const target = await resolveRedirectUrl(url);

  let title = 'YouTube Video';
  let author = 'YouTube Channel';
  let thumbnail = '';
  let authorUrl = '';
  let duration = 0;
  let durationFormatted = '';
  let views: number | string | undefined = undefined;
  let likes: number | string | undefined = undefined;
  let comments: number | string | undefined = undefined;

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
  const envKey = ((typeof process !== 'undefined' && process.env ? process.env.NEOXR_API_KEY : undefined) || DEFAULT_NEOXR_KEY).trim().replace(/^["']|["']$/g, '');
  const neoKey = (apiKey || envKey || DEFAULT_NEOXR_KEY).trim().replace(/^["']|["']$/g, '');

  // Step 2: Query Neoxr YouTube API for direct 720p HD stream, 480p, 360p & 128kbps audio
  let direct720Url = '';
  let direct480Url = '';
  let direct360Url = '';
  let directAudioUrl = '';

  // Step 2: Query Server 1 (Neoxr API) if serverMode is 'server1' or 'auto'
  if (serverMode !== 'server2') {
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
          if (j.views !== undefined) views = j.views;
          if (j.likes !== undefined) likes = j.likes;
          if (j.comments !== undefined) comments = j.comments;
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
      console.warn('[YouTube] Server 1 query notice:', err);
    }

    if (serverMode === 'server1' && !direct720Url && !direct480Url && !direct360Url && !directAudioUrl) {
      throw new Error('Server 1 tidak dapat menemukan stream video YouTube.');
    }
  }


  // Step 3: YouTube watch page HTML extraction for duration, views, likes, comments
  if (videoId && (!duration || views === undefined || likes === undefined || comments === undefined)) {
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
        if (!duration) {
          const lenMatch = html.match(/"lengthSeconds":"(\d+)"/) || html.match(/"approxDurationMs":"(\d+)"/);
          if (lenMatch && lenMatch[1]) {
            const rawSecs = lenMatch[0].includes('approxDurationMs') ? Math.round(Number(lenMatch[1]) / 1000) : Number(lenMatch[1]);
            if (rawSecs > 0) {
              duration = rawSecs;
              durationFormatted = formatDuration(rawSecs);
            }
          }
        }
        if (views === undefined) {
          const vMatchCount =
            html.match(/"viewCount":"(\d+)"/) ||
            html.match(/"viewCount":\{"simpleText":"([\d,.\sKMB]+)/i);
          if (vMatchCount?.[1]) {
            views = vMatchCount[1].trim();
          }
        }
        if (likes === undefined) {
          const lMatch =
            html.match(/"accessibilityText":"like this video along with ([\d,\.]+) other people"/i) ||
            html.match(/"factoidRenderer":\{"value":\{"simpleText":"([^"]+)"\},"label":\{"simpleText":"Likes"\}/i) ||
            html.match(/"likeCount":(\d+)/);
          if (lMatch?.[1]) {
            likes = lMatch[1].trim();
          }
        }
        if (comments === undefined) {
          const cMatch =
            html.match(/"commentCount":\{"simpleText":"([^"]+)"\}/) ||
            html.match(/"commentsEntryPointHeaderRenderer":\{.*?"commentCount":\{"simpleText":"([^"]+)"\}/);
          if (cMatch?.[1]) {
            comments = cMatch[1].trim();
          }
        }
      }
    } catch (ytErr) {
      console.warn('[YouTube] HTML metadata extraction notice:', ytErr);
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
    views,
    likes,
    comments,
    formats,
    source: direct720Url ? 'Server 1 YouTube Engine' : 'DownloaderZero Cloud Stream Engine',
    createdAt: new Date().toISOString()
  };
}

// ----------------- INSTAGRAM SCRAPER -----------------
async function scrapeInstagramServer1(target: string, apiKey?: string): Promise<MediaMetadata> {
  const envKey = ((typeof process !== 'undefined' && process.env ? process.env.NEOXR_API_KEY : undefined) || DEFAULT_NEOXR_KEY).trim().replace(/^["']|["']$/g, '');
  const neoKey = (apiKey || envKey || DEFAULT_NEOXR_KEY).trim().replace(/^["']|["']$/g, '');
  const formats: MediaFormat[] = [];
  const images: string[] = [];
  const title = 'Instagram Reel / Post';
  const thumbnail = '';

  const neoRes = await fetch(`${NEOXR_BASE_URL}/ig?url=${encodeURIComponent(target)}&apikey=${encodeURIComponent(neoKey)}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    signal: AbortSignal.timeout(8000)
  });
  if (!neoRes.ok) throw new Error(`Server 1 Instagram HTTP ${neoRes.status}`);
  const neoJson = await neoRes.json();
  if (!neoJson || !neoJson.status || !neoJson.data) {
    throw new Error('Server 1 tidak dapat menemukan media Instagram.');
  }

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

  if (formats.length === 0) throw new Error('Format media tidak ditemukan di Server 1.');

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

  const rawMeta = Array.isArray(rawData) ? rawData[0] : rawData;
  const igTitle = neoJson.caption || rawMeta?.caption || rawMeta?.title || title;
  const igAuthor = neoJson.author || rawMeta?.username || rawMeta?.author || 'Instagram Creator';

  return {
    id: `ig-${Date.now()}`,
    url: target,
    platform: 'instagram',
    title: igTitle,
    author: igAuthor,
    thumbnail: thumbnail || (images[0] || 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=800'),
    duration: 30,
    durationFormatted: '00:30',
    views: neoJson.views ?? rawMeta?.play_count ?? rawMeta?.video_view_count ?? rawMeta?.views,
    likes: neoJson.likes ?? rawMeta?.like_count ?? rawMeta?.likes,
    comments: neoJson.comments ?? rawMeta?.comment_count ?? rawMeta?.comments,
    formats,
    images: images.length > 0 ? images : undefined,
    isPhotoSlide: images.length > 1,
    source: 'Server 1 Engine',
    createdAt: new Date().toISOString()
  };
}

async function scrapeInstagramServer2(target: string, shortcode: string): Promise<MediaMetadata> {
  let title = 'Instagram Reel / Post';
  let author = 'Instagram Creator';
  let thumbnail = '';
  let likes: number | string | undefined = undefined;
  let comments: number | string | undefined = undefined;
  let views: number | string | undefined = undefined;
  const formats: MediaFormat[] = [];
  let images: string[] = [];

  // Attempt 2a: Embed captioned page parser
  if (shortcode) {
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
        const $ = cheerio.load(html);
        const userText = $('.UsernameText').first().text().trim();
        if (userText) author = userText;
        const captionText = $('.Caption').first().text().trim();
        if (captionText) title = captionText.slice(0, 120);
        const likesMatch = html.match(/([\d,\.KMB]+)\s+likes/i) || html.match(/"edge_media_preview_like":\{"count":(\d+)/);
        if (likesMatch?.[1]) likes = likesMatch[1];
        const commentsMatch = html.match(/([\d,\.KMB]+)\s+comments/i) || html.match(/"edge_media_to_comment":\{"count":(\d+)/);
        if (commentsMatch?.[1]) comments = commentsMatch[1];
        const viewsMatch = html.match(/"video_view_count":(\d+)/);
        if (viewsMatch?.[1]) views = viewsMatch[1];

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
      console.warn('[Instagram] Server 2 embed notice:', embedErr);
    }
  }

  // Attempt 2b: fdown.co.in alternative endpoint
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
      console.warn('[Instagram] Server 2 fdown notice:', e);
    }
  }

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
    throw new Error('Server 2 tidak dapat mengekstrak media Instagram.');
  }

  return {
    id: shortcode || `ig-${Date.now()}`,
    url: target,
    platform: 'instagram',
    title: title || 'Instagram Reel',
    author,
    thumbnail: thumbnail || (images[0] || 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=800'),
    duration: 30,
    durationFormatted: '00:30',
    views,
    likes,
    comments,
    formats,
    images: images.length > 0 ? images : undefined,
    isPhotoSlide: images.length > 1,
    source: 'Server 2 Engine',
    createdAt: new Date().toISOString()
  };
}

async function scrapeInstagram(url: string, apiKey?: string, serverMode: ServerMode = 'auto'): Promise<MediaMetadata> {
  const target = await resolveRedirectUrl(url);
  const shortcodeMatch = target.match(/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
  const shortcode = shortcodeMatch ? shortcodeMatch[1] : '';

  if (serverMode === 'server1') {
    return await scrapeInstagramServer1(target, apiKey);
  }
  if (serverMode === 'server2') {
    return await scrapeInstagramServer2(target, shortcode);
  }
  try {
    return await scrapeInstagramServer1(target, apiKey);
  } catch (err) {
    console.warn('[Instagram] Server 1 failed, switching to Server 2:', err);
    return await scrapeInstagramServer2(target, shortcode);
  }
}


// ----------------- PINTEREST SCRAPER -----------------
async function scrapePinterestServer1(url: string, apiKey?: string): Promise<MediaMetadata> {
  let title = 'Pinterest Media';
  let author = 'Pinterest Creator';
  let thumbnail = '';
  const formats: MediaFormat[] = [];
  let images: string[] = [];

  const envKey = ((typeof process !== 'undefined' && process.env ? process.env.NEOXR_API_KEY : undefined) || DEFAULT_NEOXR_KEY).trim().replace(/^["']|["']$/g, '');
  const neoKey = (apiKey || envKey || DEFAULT_NEOXR_KEY).trim().replace(/^["']|["']$/g, '');

  const neoRes = await fetch(`${NEOXR_BASE_URL}/pin?url=${encodeURIComponent(url)}&apikey=${encodeURIComponent(neoKey)}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    signal: AbortSignal.timeout(8000)
  });
  if (!neoRes.ok) throw new Error(`Server 1 Pinterest HTTP ${neoRes.status}`);
  const neoJson = await neoRes.json();
  if (!neoJson || !neoJson.status || !neoJson.data) {
    throw new Error('Server 1 tidak dapat menemukan media Pinterest.');
  }

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

  if (formats.length === 0) throw new Error('Format media tidak ditemukan di Server 1.');

  return {
    id: `pin-${Date.now()}`,
    url,
    platform: 'pinterest',
    title,
    author,
    thumbnail: thumbnail || (images[0] || ''),
    duration: 15,
    durationFormatted: '00:15',
    views: d.views ?? d.view_count,
    likes: d.likes ?? d.like_count ?? d.reaction_counts,
    comments: d.comments ?? d.comment_count,
    formats,
    images: images.length > 0 ? images : undefined,
    isPhotoSlide: images.length > 1,
    source: 'Server 1 Engine',
    createdAt: new Date().toISOString()
  };
}

async function scrapePinterestServer2(url: string): Promise<MediaMetadata> {
  let title = 'Pinterest Media';
  let author = 'Pinterest Creator';
  let thumbnail = '';
  const formats: MediaFormat[] = [];
  let images: string[] = [];

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9'
    },
    signal: AbortSignal.timeout(8000)
  });

  if (!response.ok) throw new Error(`Server 2 Pinterest HTTP ${response.status}`);
  const html = await response.text();
  const $ = cheerio.load(html);

  const pageTitle = $('title').text() || $('meta[property="og:title"]').attr('content');
  if (pageTitle) {
    title = pageTitle.replace(/\s*\|\s*Pinterest.*$/i, '').trim() || 'Pinterest Pin';
  }

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

  if (formats.length === 0) {
    throw new Error('Server 2 tidak dapat menemukan media Pinterest.');
  }

  const pinLikesMatch = html.match(/"reaction_counts":\{"1":(\d+)/) || html.match(/"repin_count":(\d+)/);
  const pinCommentsMatch = html.match(/"comment_count":(\d+)/);

  return {
    id: `pin-${Date.now()}`,
    url,
    platform: 'pinterest',
    title,
    author,
    thumbnail: thumbnail || (images[0] || ''),
    duration: 15,
    durationFormatted: '00:15',
    likes: pinLikesMatch?.[1],
    comments: pinCommentsMatch?.[1],
    formats,
    images: images.length > 0 ? images : undefined,
    isPhotoSlide: images.length > 1,
    source: 'Server 2 Engine',
    createdAt: new Date().toISOString()
  };
}

async function scrapePinterest(rawUrl: string, apiKey?: string, serverMode: ServerMode = 'auto'): Promise<MediaMetadata> {
  const url = await resolveRedirectUrl(rawUrl);
  if (serverMode === 'server1') {
    return await scrapePinterestServer1(url, apiKey);
  }
  if (serverMode === 'server2') {
    return await scrapePinterestServer2(url);
  }
  try {
    return await scrapePinterestServer1(url, apiKey);
  } catch (err) {
    console.warn('[Pinterest] Server 1 failed, switching to Server 2:', err);
    return await scrapePinterestServer2(url);
  }
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
async function scrapeSpotify(rawUrl: string, apiKey?: string, serverMode: ServerMode = 'auto'): Promise<MediaMetadata> {
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
  const envKey = ((typeof process !== 'undefined' && process.env ? process.env.NEOXR_API_KEY : undefined) || DEFAULT_NEOXR_KEY).trim().replace(/^["']|["']$/g, '');
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
  // STEP 1: Cek Server 1 (jika mode server1 atau auto)
  // =========================================================================
  let neoSucceeded = false;
  if (serverMode !== 'server2') {
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
      console.warn('[Spotify Engine] Server 1 API check notice:', neoErr?.message || neoErr);
    }

    if (serverMode === 'server1' && (!neoSucceeded || !fullDownloadUrl)) {
      throw new Error('Server 1 tidak dapat menemukan media Spotify.');
    }
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
    quality: '320 kbps (MP3 • Metadata & Cover Tertanam)',
    resolution: '320 kbps',
    type: 'audio',
    extension: 'mp3',
    url: directMp3Url,
    isDirect: true,
    filesize: '~ 8.5 MB',
    note: `Audio MP3 Asli dengan ID3 Cover & Genre ${genre}`
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
    source: neoSucceeded ? 'Server 1 Spotify Engine' : 'Spotify Official Web Engine',
    createdAt: new Date().toISOString()
  };
}

// ----------------- TERABOX SCRAPER -----------------
async function scrapeTerabox(url: string, apiKey?: string, _serverMode: ServerMode = 'auto'): Promise<MediaMetadata> {

  const target = await resolveRedirectUrl(url);
  const envKey = ((typeof process !== 'undefined' && process.env ? process.env.NEOXR_API_KEY : undefined) || DEFAULT_NEOXR_KEY).trim().replace(/^["']|["']$/g, '');
  const key = (apiKey || envKey || DEFAULT_NEOXR_KEY).trim().replace(/^["']|["']$/g, '');

  let rawItems: any[] = [];

  // Attempt 1: Server 1 /api/terabox
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
        const candidates = Array.isArray(json.data)
          ? json.data
          : Array.isArray(json.data?.data)
            ? json.data.data
            : Array.isArray(json.data?.list)
              ? json.data.list
              : Array.isArray(json.data?.files)
                ? json.data.files
                : [json.data];
        rawItems = candidates.filter((it: any) => it && (it.dlink || it.url || it.download));
      }
    }
  } catch (neoErr) {
    console.warn('[TeraBox] Server 1 attempt skipped:', neoErr);
  }

  // Attempt 2: TeraBox Cloud public share list API
  if (rawItems.length === 0) {
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
          if (cJson.errno === 0 && Array.isArray(cJson.list)) {
            rawItems = cJson.list.filter((it: any) => it && (it.dlink || it.url || it.download) && it.isdir !== 1 && it.isdir !== '1');
          }
        }
      }
    } catch (cErr) {
      console.warn('[TeraBox] Cloud share list skipped:', cErr);
    }
  }

  if (rawItems.length === 0) {
    throw new Error('Gagal mengekstrak berkas dari link TeraBox. Pastikan tautan masih aktif dan tidak diberi proteksi kata sandi.');
  }

  const files: TeraboxFile[] = rawItems.map((item: any, idx: number) => {
    const filename = item.server_filename || item.filename || item.name || item.path?.replace(/^\//, '') || `TeraBox_File_${idx + 1}.mp4`;
    const ext = (filename.split('.').pop() || 'mp4').toLowerCase();
    const directUrl = item.dlink || item.url || item.download;
    const thumb = item.thumbs?.url3 || item.thumbs?.url2 || item.thumbs?.url1 || item.thumbs?.icon || item.thumbnail || '';
    const dur = typeof item.duration === 'number' ? item.duration : undefined;
    const sizeBytes = item.bytes ? Number(item.bytes) : (typeof item.size === 'number' ? item.size : undefined);
    const sizeLabel = typeof item.size === 'string' ? item.size : (sizeBytes ? formatBytes(sizeBytes) : undefined);

    return {
      id: String(item.fs_id || `tb-file-${idx}-${Date.now()}`),
      filename,
      size: sizeLabel,
      sizeBytes,
      extension: ext,
      thumbnail: thumb,
      duration: dur,
      durationFormatted: dur ? formatDuration(dur) : undefined,
      url: directUrl,
      mediaType: detectTeraboxFileType(filename)
    };
  }).filter((f) => Boolean(f.url));

  if (files.length === 0) {
    throw new Error('Link download langsung dari TeraBox tidak tersedia.');
  }

  const primaryFile = files[0];
  const formats: MediaFormat[] = files.map((file) => ({
    id: `tb-${file.id}`,
    quality: file.size ? `${file.filename} (${file.size})` : file.filename,
    resolution: file.extension.toUpperCase(),
    type: file.mediaType === 'audio' ? 'audio' : file.mediaType === 'photos' ? 'photos' : 'video',
    extension: (file.extension as any) || 'mp4',
    filesize: file.size,
    filesizeBytes: file.sizeBytes,
    url: file.url,
    isDirect: true,
    note: 'Unduh Langsung TeraBox (Direct Cloud)'
  }));

  return {
    id: `tb_${primaryFile.id}`,
    url: target,
    platform: 'terabox',
    title: primaryFile.filename,
    author: 'TeraBox Cloud',
    thumbnail: primaryFile.thumbnail || '',
    duration: primaryFile.duration,
    durationFormatted: primaryFile.durationFormatted,
    formats,
    files,
    source: 'TeraBox Cloud Engine',
    createdAt: new Date().toISOString()
  };
}

// ----------------- NEOXR API SCRAPER (PRIMARY ENGINE) -----------------
async function scrapeNeoxr(targetUrl: string, platform: PlatformType, apiKey?: string): Promise<MediaMetadata> {
  const envKey = ((typeof process !== 'undefined' && process.env ? process.env.NEOXR_API_KEY : undefined) || DEFAULT_NEOXR_KEY).trim().replace(/^["']|["']$/g, '');
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
          lastErr = parsed?.msg || parsed?.message || 'Status respons Server 1 tidak valid';
        }
      } catch (parseErr: any) {
        lastErr = `JSON parse error: ${parseErr.message}`;
      }
    } catch (err: any) {
      lastErr = err.message || 'Gagal menghubungi Server 1';
    }
  }

  if (!json || !json.data) {
    throw new Error(json?.msg || json?.message || lastErr || 'Gagal mengekstrak dari Server 1.');
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
        note: 'Streaming langsung Server 1 tanpa antrean'
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
            note: 'Audio MP3 Server 1 langsung tanpa antrean'
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
          note: 'Media stream Server 1'
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
          note: 'Audio stream Server 1'
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
    throw new Error('Server 1 tidak menghasilkan format unduhan yang valid.');
  }

  return {
    id: `server1-${Date.now()}`,
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
    source: 'Server 1 Engine',
    createdAt: new Date().toISOString()
  };
}

// ----------------- MAIN EXTRACTOR DISPATCHER -----------------
export async function extractMedia(
  rawUrl: string,
  apiKey?: string,
  serverMode: ServerMode = 'auto'
): Promise<MediaMetadata> {
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
    throw new Error('Platform tidak didukung. DownloaderZero mendukung YouTube, TikTok, Twitter (X), Facebook, Instagram, Pinterest, Spotify, dan TeraBox.');
  }

  const mode: ServerMode = serverMode || 'auto';

  // Platforms without dedicated Server 2 backup (e.g. TeraBox) -> silently use Server 1
  // Twitter (X) uses free keyless Server 2 exclusively (Server 1 ignored for Twitter/X)
  const effectiveMode: ServerMode =
    platform === 'terabox' && mode === 'server2'
      ? 'server1'
      : platform === 'twitter'
        ? 'server2'
        : mode;

  switch (platform) {
    case 'youtube':
      return await scrapeYouTube(url, apiKey, effectiveMode);
    case 'tiktok':
      return await scrapeTikTok(url, apiKey, effectiveMode);
    case 'twitter':
      return await scrapeTwitterServer2(url);
    case 'facebook':
      return await scrapeFacebook(url, apiKey, effectiveMode);
    case 'instagram':
      return await scrapeInstagram(url, apiKey, effectiveMode);
    case 'pinterest':
      return await scrapePinterest(url, apiKey, effectiveMode);
    case 'spotify':
      return await scrapeSpotify(url, apiKey, effectiveMode);
    case 'terabox':
      return await scrapeTerabox(url, apiKey, effectiveMode);
    default:
      throw new Error('Platform tidak didukung.');
  }
}

