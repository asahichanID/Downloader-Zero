import type { PlatformType, MediaFormat, MediaMetadata } from '../src/types/index.ts';
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

// ----------------- TIKTOK SCRAPER -----------------
async function scrapeTikTok(url: string): Promise<MediaMetadata> {
  const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(url.trim())}`;
  const response = await fetch(apiUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    },
    signal: AbortSignal.timeout(12000)
  });

  if (!response.ok) {
    throw new Error(`Gagal menghubungi server TikTok (${response.status})`);
  }

  const json = await response.json();
  if (json.code !== 0 || !json.data) {
    throw new Error(json.msg || 'Konten TikTok tidak ditemukan atau video bersifat privat.');
  }

  const d = json.data;
  const formats: MediaFormat[] = [];

  const rawImages: string[] = Array.isArray(d.images)
    ? d.images.filter((img: any) => typeof img === 'string' && img.startsWith('http'))
    : [];
  const isPhotoSlide = rawImages.length > 0;

  if (isPhotoSlide) {
    formats.push({
      id: 'tt-photos-all',
      quality: `Koleksi Foto (${rawImages.length} Slide Gambar HD)`,
      resolution: 'HD Foto',
      type: 'video',
      extension: 'mp4',
      url: rawImages[0],
      isDirect: true,
      note: `${rawImages.length} foto resolusi penuh siap unduh`
    });
  }

  if (d.hdplay || d.play) {
    formats.push({
      id: 'tt-hd',
      quality: '1080p FHD (Tanpa Watermark)',
      resolution: '1080p',
      type: 'video',
      extension: 'mp4',
      filesize: formatBytes(d.hd_size || d.size),
      filesizeBytes: d.hd_size || d.size,
      url: d.hdplay || d.play,
      isDirect: true,
      note: 'Kualitas tertinggi tanpa watermark'
    });
  }

  if (d.play && d.hdplay && d.play !== d.hdplay) {
    formats.push({
      id: 'tt-sd',
      quality: '720p HD (Tanpa Watermark)',
      resolution: '720p',
      type: 'video',
      extension: 'mp4',
      filesize: formatBytes(d.size),
      filesizeBytes: d.size,
      url: d.play,
      isDirect: true,
      note: 'Ukuran lebih hemat data'
    });
  }

  if (d.music) {
    formats.push({
      id: 'tt-audio',
      quality: '320 kbps (Original Sound)',
      resolution: 'Audio',
      type: 'audio',
      extension: 'mp3',
      url: d.music,
      isDirect: true,
      note: d.music_info?.title ? `Lagu: ${d.music_info.title}` : 'Audio musik jernih'
    });
  }

  if (d.wmplay) {
    formats.push({
      id: 'tt-wm',
      quality: '720p (Dengan Watermark)',
      resolution: '720p',
      type: 'video',
      extension: 'mp4',
      filesize: formatBytes(d.wm_size),
      filesizeBytes: d.wm_size,
      url: d.wmplay,
      isDirect: true,
      note: 'Format asli TikTok'
    });
  }

  return {
    id: d.id || `tt-${Date.now()}`,
    url,
    platform: 'tiktok',
    title: d.title || (isPhotoSlide ? 'TikTok Photo Slideshow' : 'Video TikTok'),
    author: d.author?.nickname || d.author?.unique_id || 'Kreator TikTok',
    authorUrl: d.author?.unique_id ? `https://www.tiktok.com/@${d.author.unique_id}` : undefined,
    thumbnail: (rawImages[0] || d.cover || d.origin_cover || ''),
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
async function scrapeFacebook(url: string): Promise<MediaMetadata> {
  let title = 'Facebook Video';
  let thumbnail = '';
  const formats: MediaFormat[] = [];

  try {
    const res = await fetch('https://fdown.co.in/ajax', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://fdown.co.in',
        'Referer': 'https://fdown.co.in/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: JSON.stringify({ url: url.trim() }),
      signal: AbortSignal.timeout(10000)
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
            quality: isHd ? '720p / 1080p HD' : '360p / 480p SD',
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
    console.warn('Facebook fdown attempt failed, falling back:', err);
  }

  if (formats.length === 0) {
    try {
      const formData = new URLSearchParams();
      formData.append('url', url.trim());
      const res = await fetch('https://snapsave.app/action.php?lang=en', {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'origin': 'https://snapsave.app',
          'referer': 'https://snapsave.app/',
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: formData,
        signal: AbortSignal.timeout(10000)
      });

      if (res.ok) {
        const text = await res.text();
        if (text.includes('decodeURIComponent')) {
          const decoded = decodeSnapSaveHtml(text);
          if (decoded) {
            const linkMatches = [...decoded.matchAll(/href="([^"]+)"[^>]*>([^<]*Download[^<]*)</gi)];
            linkMatches.forEach((m, idx) => {
              const link = m[1];
              if (link.startsWith('http')) {
                const label = m[2] || `Quality ${idx + 1}`;
                formats.push({
                  id: `fb-snap-${idx}`,
                  quality: /hd/i.test(label) ? '720p HD' : '360p SD',
                  resolution: /hd/i.test(label) ? '720p' : '360p',
                  type: 'video',
                  extension: 'mp4',
                  url: link,
                  isDirect: true,
                  note: label.trim()
                });
              }
            });
          }
        }
      }
    } catch (err) {
      console.warn('Facebook snapsave fallback failed:', err);
    }
  }

  if (formats.length > 0) {
    const videoSource = formats[0].url;
    formats.push({
      id: 'fb-audio-mp3',
      quality: '192 kbps (Ekstrak MP3)',
      resolution: 'Audio',
      type: 'audio',
      extension: 'mp3',
      url: videoSource,
      isDirect: false,
      note: 'Dikonversi ke audio MP3 jernih'
    });
  }

  if (formats.length === 0) {
    throw new Error('Tidak dapat mengekstrak video Facebook. Pastikan video bersifat Publik dan tautan valid.');
  }

  return {
    id: `fb-${Date.now()}`,
    url,
    platform: 'facebook',
    title,
    author: 'Facebook Creator',
    thumbnail: thumbnail || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800',
    formats,
    source: 'Facebook Cloud Extraction',
    createdAt: new Date().toISOString()
  };
}

// ----------------- YOUTUBE SCRAPER -----------------
async function scrapeYouTube(url: string): Promise<MediaMetadata> {
  let title = 'YouTube Video';
  let author = 'YouTube Channel';
  let thumbnail = '';
  let authorUrl = '';

  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url.trim())}&format=json`;
    const oeRes = await fetch(oembedUrl, { signal: AbortSignal.timeout(6000) });
    if (oeRes.ok) {
      const oe = await oeRes.json();
      if (oe.title) title = oe.title;
      if (oe.author_name) author = oe.author_name;
      if (oe.author_url) authorUrl = oe.author_url;
      if (oe.thumbnail_url) thumbnail = oe.thumbnail_url;
    }
  } catch (e) {
    console.warn('YouTube oembed error:', e);
  }

  const vMatch = url.match(/(?:youtube\.com\/(?:watch\?[^#]*v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i);
  const videoId = vMatch ? vMatch[1] : '';
  if (videoId && !thumbnail) {
    thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  }

  const formats: MediaFormat[] = [];
  const videoQualities: Array<{ label: string; format: string; res: string; note: string }> = [
    { label: '4K (2160p Ultra HD)', format: '2160', res: '2160p', note: 'Kualitas visual bioskop tertinggi' },
    { label: '2K (1440p Quad HD)', format: '1440', res: '1440p', note: 'Super tajam untuk layar 2K' },
    { label: '1080p Full HD', format: '1080', res: '1080p', note: 'Standar kualitas Full HD tajam' },
    { label: '720p HD', format: '720', res: '720p', note: 'Keseimbangan kualitas dan ukuran file' },
    { label: '480p Standard', format: '480', res: '480p', note: 'Hemat kuota dan cepat diunduh' },
    { label: '360p Ringan', format: '360', res: '360p', note: 'Ukuran paling kecil untuk HP' }
  ];

  let immediateJob720 = '';
  let immediateJobMp3 = '';

  try {
    const jobRes720 = await fetch(`https://loader.to/ajax/download.php?format=720&url=${encodeURIComponent(url.trim())}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(6000)
    });
    if (jobRes720.ok) {
      const j720 = await jobRes720.json();
      if (j720.id) immediateJob720 = j720.id;
      if (j720.title && title === 'YouTube Video') title = j720.title;
      if (j720.thumbnail_url && !thumbnail) thumbnail = j720.thumbnail_url;
    }
  } catch (err) {
    console.warn('Loader.to 720 prefetch skipped:', err);
  }

  try {
    const jobResMp3 = await fetch(`https://loader.to/ajax/download.php?format=mp3&url=${encodeURIComponent(url.trim())}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(6000)
    });
    if (jobResMp3.ok) {
      const jMp3 = await jobResMp3.json();
      if (jMp3.id) immediateJobMp3 = jMp3.id;
    }
  } catch (err) {
    console.warn('Loader.to mp3 prefetch skipped:', err);
  }

  videoQualities.forEach((q) => {
    formats.push({
      id: `yt-${q.format}`,
      quality: q.label,
      resolution: q.res,
      type: 'video',
      extension: 'mp4',
      url: `https://loader.to/ajax/download.php?format=${q.format}&url=${encodeURIComponent(url.trim())}`,
      jobId: q.format === '720' ? immediateJob720 : undefined,
      isDirect: false,
      note: q.note
    });
  });

  const audioQualities: Array<{ label: string; format: string; note: string }> = [
    { label: '320 kbps (Lossless High Fidelity)', format: 'mp3', note: 'Bitrate audio MP3 studio tertinggi' },
    { label: '256 kbps (High Quality Audio)', format: 'mp3', note: 'Audio jernih kualitas mantap' },
    { label: '192 kbps (Standard Audio)', format: 'mp3', note: 'Kualitas standar streaming' },
    { label: '128 kbps (Compact Audio)', format: 'mp3', note: 'Ukuran file ringan untuk ponsel' },
    { label: '64 kbps (Voice / Low Data)', format: 'mp3', note: 'Hemat penyimpanan dan data' }
  ];

  audioQualities.forEach((aq, idx) => {
    formats.push({
      id: `yt-audio-${idx}`,
      quality: aq.label,
      resolution: 'Audio',
      type: 'audio',
      extension: 'mp3',
      url: `https://loader.to/ajax/download.php?format=${aq.format}&url=${encodeURIComponent(url.trim())}`,
      jobId: idx === 0 ? immediateJobMp3 : undefined,
      isDirect: false,
      note: aq.note
    });
  });

  return {
    id: videoId || `yt-${Date.now()}`,
    url,
    platform: 'youtube',
    title,
    author,
    authorUrl,
    thumbnail,
    formats,
    source: 'DownloaderZero Cloud Stream Engine',
    createdAt: new Date().toISOString()
  };
}

// ----------------- INSTAGRAM SCRAPER -----------------
async function scrapeInstagram(url: string): Promise<MediaMetadata> {
  let title = 'Instagram Reel / Post';
  let thumbnail = '';
  const formats: MediaFormat[] = [];

  const shortcodeMatch = url.match(/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
  const shortcode = shortcodeMatch ? shortcodeMatch[1] : '';

  try {
    const oembedUrl = `https://api.instagram.com/oembed/?url=${encodeURIComponent(url.trim())}`;
    const oeRes = await fetch(oembedUrl, { signal: AbortSignal.timeout(6000) });
    if (oeRes.ok) {
      const oe = await oeRes.json();
      if (oe.title) title = oe.title;
      if (oe.author_name) title = `${oe.author_name} di Instagram`;
      if (oe.thumbnail_url) thumbnail = oe.thumbnail_url;
    }
  } catch (err) {
    console.warn('Instagram oembed notice:', err);
  }

  try {
    const formData = new URLSearchParams();
    formData.append('url', url.trim());
    const res = await fetch('https://snapsave.app/action.php?lang=en', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'origin': 'https://snapsave.app',
        'referer': 'https://snapsave.app/',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: formData,
      signal: AbortSignal.timeout(10000)
    });

    if (res.ok) {
      const text = await res.text();
      if (text.includes('decodeURIComponent')) {
        const decoded = decodeSnapSaveHtml(text);
        if (decoded) {
          const links = [...decoded.matchAll(/href="([^"]+)"[^>]*>([^<]*Download[^<]*)</gi)];
          links.forEach((m, idx) => {
            const link = m[1];
            if (link.startsWith('http')) {
              formats.push({
                id: `ig-snap-${idx}`,
                quality: '1080p HD Video MP4',
                resolution: '1080p',
                type: 'video',
                extension: 'mp4',
                url: link,
                isDirect: true,
                note: 'Video Instagram Resolusi Penuh'
              });
            }
          });
        }
      }
    }
  } catch (err) {
    console.warn('Instagram snapsave notice:', err);
  }

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
        body: JSON.stringify({ url: url.trim() }),
        signal: AbortSignal.timeout(8000)
      });
      if (res.ok) {
        const d = await res.json();
        if (d.success && d.links) {
          if (d.title) title = d.title;
          if (d.thumbnail) thumbnail = d.thumbnail;
          for (const [k, v] of Object.entries(d.links)) {
            if (typeof v === 'string' && v.startsWith('http')) {
              formats.push({
                id: `ig-${k}`,
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
      console.warn('Instagram fdown notice:', e);
    }
  }

  if (formats.length === 0 && shortcode) {
    formats.push({
      id: 'ig-direct-stream',
      quality: '1080p HD Video',
      resolution: '1080p',
      type: 'video',
      extension: 'mp4',
      url: `https://www.instagram.com/p/${shortcode}/`,
      isDirect: false,
      note: 'Tautan media Instagram'
    });
  }

  if (formats.length > 0) {
    formats.push({
      id: 'ig-audio',
      quality: '320 kbps MP3 Audio',
      resolution: 'Audio',
      type: 'audio',
      extension: 'mp3',
      url: formats[0].url,
      isDirect: false,
      note: 'Ekstrak audio dari video Instagram'
    });
  }

  return {
    id: shortcode || `ig-${Date.now()}`,
    url,
    platform: 'instagram',
    title: title || 'Instagram Reel',
    author: 'Instagram Creator',
    thumbnail: thumbnail || 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=800',
    formats,
    source: 'Instagram Fast Engine',
    createdAt: new Date().toISOString()
  };
}

// ----------------- SNAPSAVE HTML DECODER HELPER -----------------
function decodeSnapSaveHtml(rawText: string): string | null {
  try {
    const encodedChunk = rawText.split('decodeURIComponent(escape(r))}(')[1]?.split('))')[0];
    if (!encodedChunk) return null;
    const args = encodedChunk.split(',').map((v) => v.replace(/"/g, '').trim());
    const [h, , n, t, e] = args;
    const tNum = Number(t);
    const eNum = Number(e);

    function decodeBase(d: string, baseE: number, baseF: number) {
      const g = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ+/'.split('');
      const hArr = g.slice(0, baseE);
      const iArr = g.slice(0, baseF);
      let j = d.split('').reverse().reduce((acc, char, idx) => {
        const found = hArr.indexOf(char);
        return found !== -1 ? acc + found * Math.pow(baseE, idx) : acc;
      }, 0);
      let k = '';
      while (j > 0) {
        k = iArr[j % baseF] + k;
        j = Math.floor(j / baseF);
      }
      return k || '0';
    }

    let result = '';
    for (let i = 0, len = h.length; i < len;) {
      let s = '';
      while (i < len && h[i] !== n[eNum]) {
        s += h[i];
        i++;
      }
      i++;
      for (let j = 0; j < n.length; j++) {
        s = s.replace(new RegExp(n[j], 'g'), j.toString());
      }
      result += String.fromCharCode(Number(decodeBase(s, eNum, 10)) - tNum);
    }

    const bytes = new Uint8Array(result.split('').map((char) => char.charCodeAt(0)));
    const decodedStr = new TextDecoder('utf-8').decode(bytes);

    const section = decodedStr.split('getElementById("download-section").innerHTML = "')[1]?.split('"; document.getElementById("inputData").remove();')[0];
    return section ? section.replace(/\\(\/)?/g, '$1') : decodedStr;
  } catch (e) {
    console.warn('SnapSave decode failure:', e);
    return null;
  }
}

// ----------------- SHORT LINK REDIRECT RESOLVER -----------------
async function resolveRedirectUrl(url: string): Promise<string> {
  if (/(?:vt\.tiktok\.com|vm\.tiktok\.com|fb\.watch|fb\.com|instagram\.com\/share|youtu\.be|pin\.it)/i.test(url)) {
    try {
      const headRes = await fetch(url, {
        method: 'HEAD',
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
        },
        signal: AbortSignal.timeout(3500)
      });
      if (headRes.url && headRes.url !== url && headRes.url.startsWith('http')) {
        return headRes.url;
      }
    } catch {
      try {
        const getRes = await fetch(url, {
          method: 'GET',
          redirect: 'follow',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
            'Range': 'bytes=0-0'
          },
          signal: AbortSignal.timeout(3500)
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

// ----------------- NEOXR API SCRAPER -----------------
const NEOXR_BASE_URL = 'https://api.neoxr.eu/api';

async function scrapeNeoxr(targetUrl: string, platform: PlatformType, apiKey?: string): Promise<MediaMetadata> {
  const envKey = (process.env.NEOXR_API_KEY || '').trim().replace(/^["']|["']$/g, '');
  const key = (apiKey || envKey).trim().replace(/^["']|["']$/g, '');
  const keyParam = key ? `&apikey=${encodeURIComponent(key)}` : '';
  const formats: MediaFormat[] = [];
  let title = `${platform.toUpperCase()} Media`;
  let author = 'Creator';
  let thumbnail = '';
  let duration = 0;
  let images: string[] = [];
  let isPhotoSlide = false;

  const endpoints: string[] = [];
  switch (platform) {
    case 'youtube':
      endpoints.push(`${NEOXR_BASE_URL}/youtube?url=${encodeURIComponent(targetUrl)}&type=video${keyParam}`);
      endpoints.push(`${NEOXR_BASE_URL}/youtube?url=${encodeURIComponent(targetUrl)}${keyParam}`);
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
    default:
      throw new Error(`Platform ${platform} tidak didukung oleh Neoxr.`);
  }

  let json: any = null;
  let lastErr = '';

  for (const ep of endpoints) {
    try {
      const response = await fetch(ep, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(18000)
      });

      if (!response.ok) {
        lastErr = `HTTP ${response.status}`;
        continue;
      }

      const resText = await response.text();
      try {
        const parsed = JSON.parse(resText);
        if (parsed && (parsed.status !== false || parsed.data)) {
          json = parsed;
          break;
        } else {
          lastErr = parsed?.msg || parsed?.message || 'Neoxr status false';
        }
      } catch (parseErr: any) {
        lastErr = `JSON parse error: ${parseErr.message}`;
      }
    } catch (err: any) {
      lastErr = err.message || 'Fetch failed';
    }
  }

  if (!json || !json.data) {
    throw new Error(json?.msg || json?.message || lastErr || 'Gagal mengekstrak dari Neoxr API.');
  }

  const rawData = json.data;
  const data = (typeof rawData === 'object' && rawData !== null && 'data' in rawData && typeof rawData.data === 'object')
    ? rawData.data
    : rawData;

  if (platform === 'youtube') {
    title = data.title || 'YouTube Video';
    author = data.author || data.channel || 'YouTube Creator';
    thumbnail = data.thumbnail || data.cover || '';
    duration = Number(data.duration) || 0;

    const vidUrl = data.url || data.video || data.download || data.link || data.stream || data.mp4;
    if (vidUrl && typeof vidUrl === 'string') {
      formats.push({
        id: 'nx-yt-video',
        quality: data.quality || '720p HD Video',
        resolution: data.quality || '720p',
        type: 'video',
        extension: 'mp4',
        filesize: data.size || data.filesize || undefined,
        url: vidUrl,
        isDirect: true,
        note: 'Unduhan langsung Neoxr'
      });
    }

    const audUrl = data.audio || data.mp3 || data.sound || data.music;
    if (audUrl && typeof audUrl === 'string') {
      formats.push({
        id: 'nx-yt-audio',
        quality: '320 kbps (Audio MP3)',
        resolution: 'Audio',
        type: 'audio',
        extension: 'mp3',
        url: audUrl,
        isDirect: true,
        note: 'Audio Neoxr jernih'
      });
    }
  } else if (platform === 'tiktok') {
    const d = Array.isArray(data) ? data[0] : data;
    title = d.title || d.caption || d.desc || 'TikTok Video';
    author = d.author?.nickname || d.author?.unique_id || d.author || 'TikTok Creator';
    thumbnail = d.thumbnail || d.cover || d.origin_cover || '';
    duration = Number(d.duration) || 0;

    const rawImgs = d.images || d.photos || d.slides || d.photo || d.image;
    if (Array.isArray(rawImgs)) {
      images = rawImgs.filter((img: any) => typeof img === 'string' && img.startsWith('http'));
    }
    isPhotoSlide = images.length > 0;

    if (isPhotoSlide) {
      formats.push({
        id: 'nx-tt-photos-all',
        quality: `Koleksi Foto (${images.length} Slide Gambar HD)`,
        resolution: 'HD Foto',
        type: 'video',
        extension: 'mp4',
        url: images[0],
        isDirect: true,
        note: `${images.length} foto resolusi penuh siap unduh`
      });
    }

    const hdUrl = d.video_hd || d.hdplay || d.nowm || d.play || d.video || d.url || d.download || d.link || d.hd;
    const sdUrl = d.video || d.play || d.wm || d.watermark || d.video_wm || d.sd;
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
        quality: '720p HD (Tanpa Watermark)',
        resolution: '720p',
        type: 'video',
        extension: 'mp4',
        url: sdUrl,
        isDirect: true,
        note: 'Ukuran hemat data'
      });
    }
    if (audioUrl && typeof audioUrl === 'string') {
      formats.push({
        id: 'nx-tt-audio',
        quality: '320 kbps (Original Sound)',
        resolution: 'Audio',
        type: 'audio',
        extension: 'mp3',
        url: audioUrl,
        isDirect: true,
        note: 'Audio musik TikTok asli'
      });
    }
  } else if (platform === 'facebook') {
    title = data.title || 'Facebook Video';
    thumbnail = data.thumbnail || data.cover || '';
    if (Array.isArray(data)) {
      data.forEach((item: any, idx: number) => {
        const itemUrl = item.url || item.link || item.download || item;
        if (typeof itemUrl === 'string' && itemUrl.startsWith('http')) {
          const isHd = /hd|1080|720/i.test(item.quality || item.resolution || '');
          formats.push({
            id: `nx-fb-${idx}`,
            quality: isHd ? '720p / 1080p HD' : '360p / 480p SD',
            resolution: isHd ? '720p' : '360p',
            type: 'video',
            extension: 'mp4',
            url: itemUrl,
            isDirect: true,
            note: item.quality || 'High Definition'
          });
        }
      });
    } else if (typeof data === 'object') {
      const hd = data.video_hd || data.hd;
      const sd = data.video_sd || data.sd || data.video || data.url || data.download || data.link;
      if (hd && typeof hd === 'string') {
        formats.push({
          id: 'nx-fb-hd',
          quality: '1080p / 720p HD',
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
          quality: '360p / 480p SD',
          resolution: '360p',
          type: 'video',
          extension: 'mp4',
          url: sd,
          isDirect: true,
          note: 'Standard Definition'
        });
      }
    }
  } else if (platform === 'instagram') {
    title = data.title || data.caption || 'Instagram Reel / Post';
    thumbnail = data.thumbnail || data.cover || '';
    if (Array.isArray(data)) {
      data.forEach((item: any, idx: number) => {
        const itemUrl = item.url || item.video || item.download || item.link || item;
        if (typeof itemUrl === 'string' && itemUrl.startsWith('http')) {
          formats.push({
            id: `nx-ig-${idx}`,
            quality: '1080p HD Video MP4',
            resolution: '1080p',
            type: 'video',
            extension: 'mp4',
            url: itemUrl,
            isDirect: true,
            note: 'Media Instagram Asli'
          });
        }
      });
    } else if (typeof data === 'object') {
      const vid = data.url || data.video || data.video_url || data.download || data.link;
      if (vid && typeof vid === 'string') {
        formats.push({
          id: 'nx-ig-main',
          quality: '1080p HD Video MP4',
          resolution: '1080p',
          type: 'video',
          extension: 'mp4',
          url: vid,
          isDirect: true,
          note: 'Video Instagram Jernih'
        });
      }
    }
  } else if (platform === 'pinterest') {
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
    }

    const photoUrl = data.image || data.photo || (!isVid ? data.url : undefined);
    if (photoUrl && typeof photoUrl === 'string' && photoUrl.startsWith('http')) {
      const origPhoto = photoUrl.replace(/\/(?:236x|474x|564x|736x)\//i, '/originals/');
      images = [origPhoto];
      formats.push({
        id: 'nx-pin-photo',
        quality: 'Ultra HD 4K Original (Resolusi Asli)',
        resolution: '4K Foto',
        type: 'video',
        extension: origPhoto.endsWith('.png') ? 'png' : 'jpg',
        url: origPhoto,
        isDirect: true,
        note: 'Foto asli tanpa kompresi'
      });
      if (!thumbnail) thumbnail = origPhoto;
    }
  }

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
    if (extracted.images.length > 0 && formats.length === 0) {
      images = extracted.images;
      isPhotoSlide = true;
      formats.push({
        id: `nx-deep-img-0`,
        quality: `Koleksi Gambar (${images.length} Foto)`,
        resolution: 'HD Foto',
        type: 'video',
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
    images,
    isPhotoSlide,
    source: 'Neoxr API (api.neoxr.eu)',
    createdAt: new Date().toISOString()
  };
}

// ----------------- PINTEREST SCRAPER -----------------
async function scrapePinterest(rawUrl: string): Promise<MediaMetadata> {
  const url = await resolveRedirectUrl(rawUrl);
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
    signal: AbortSignal.timeout(14000)
  });

  if (!response.ok) {
    throw new Error(`Gagal menghubungi server Pinterest (${response.status})`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  const pageTitle = $('title').text() || $('meta[property="og:title"]').attr('content');
  if (pageTitle) {
    title = pageTitle.replace(/\s*\|\s*Pinterest.*$/i, '').trim() || 'Pinterest Pin';
  }

  const authorName = $('meta[name="author"]').attr('content') || $('meta[property="og:article:author"]').attr('content');
  if (authorName) {
    author = authorName;
  }

  const ogImg = $('meta[property="og:image"]').attr('content');
  if (ogImg) {
    thumbnail = ogImg;
  }

  const imgMatches = [...html.matchAll(/https?:\/\/[^\s"'\\]*i\.pinimg\.com\/[^\s"'\\]+/gi)]
    .map((m) => m[0].replace(/\\/g, '').replace(/["')\];,].*$/, ''))
    .filter((u) => /\.(jpg|jpeg|png|webp)/i.test(u) && !u.includes('/avatars/') && !u.includes('/business/'));

  const highResImgs = imgMatches.map((img) => img.replace(/\/(?:236x|474x|564x|736x)\//i, '/originals/'));
  const uniqueImages = [...new Set(highResImgs)];

  if (uniqueImages.length > 0) {
    images = uniqueImages.slice(0, 10);
    if (!thumbnail) {
      thumbnail = images[0];
    }
  }

  const mp4Urls = new Set<string>();
  const videoMatches = [...html.matchAll(/https?:\/\/[^\s"'\\]*(?:v\.pinimg\.com|v1\.pinimg\.com)\/videos\/[^\s"'\\]+/gi)]
    .map((m) => m[0].replace(/\\/g, '').replace(/["')\];,].*$/, ''));

  for (const vUrl of videoMatches) {
    if (vUrl.includes('.mp4')) {
      mp4Urls.add(vUrl);
    } else if (vUrl.includes('.m3u8')) {
      const p1080 = vUrl.replace(/\/hls\//i, '/exp7/').replace(/\.m3u8/i, '.mp4');
      const p720 = vUrl.replace(/\/hls\//i, '/720p/').replace(/\.m3u8/i, '.mp4');
      const p480 = vUrl.replace(/\/hls\//i, '/480p/').replace(/\.m3u8/i, '.mp4');
      mp4Urls.add(p1080);
      mp4Urls.add(p720);
      mp4Urls.add(p480);
    }
  }

  const genericMp4s = [...html.matchAll(/https?:\/\/[^\s"'\\]+\.mp4(?:\?[^\s"'\\]*)?/gi)]
    .map((m) => m[0].replace(/\\/g, '').replace(/["')\];,].*$/, ''));
  for (const gUrl of genericMp4s) {
    if (gUrl.includes('pinimg.com')) {
      mp4Urls.add(gUrl);
    }
  }

  const pwsJson = $('#__PWS_DATA__').html();
  if (pwsJson) {
    try {
      const pwsObj = JSON.parse(pwsJson);
      const extracted = extractAllMediaUrls(pwsObj);
      extracted.videos.forEach((v) => mp4Urls.add(v));
      extracted.images.forEach((img) => {
        if (img.includes('pinimg.com')) {
          images.push(img.replace(/\/(?:236x|474x|564x|736x)\//i, '/originals/'));
        }
      });
    } catch {}
  }

  const finalMp4s = [...mp4Urls];
  if (finalMp4s.length > 0) {
    finalMp4s.forEach((mUrl, i) => {
      formats.push({
        id: `pin-vid-${i}`,
        quality: i === 0 ? '1080p Full HD Video' : '720p HD Video',
        resolution: i === 0 ? '1080p' : '720p',
        type: 'video',
        extension: 'mp4',
        url: mUrl,
        isDirect: true,
        note: 'Video Pinterest Kualitas Tinggi'
      });
    });
    formats.push({
      id: 'pin-audio',
      quality: '320 kbps (Ekstrak Audio MP3)',
      resolution: 'Audio',
      type: 'audio',
      extension: 'mp3',
      url: finalMp4s[0],
      isDirect: false,
      note: 'Dikonversi ke audio MP3'
    });
  }

  if (images.length > 0) {
    const uniqueOrigImgs = [...new Set(images.map((img) => img.replace(/\/(?:236x|474x|564x|736x)\//i, '/originals/')))];
    uniqueOrigImgs.slice(0, 10).forEach((imgUrl, i) => {
      formats.push({
        id: `pin-img-${i}`,
        quality: `Ultra HD Original ${i + 1} (Resolusi Penuh)`,
        resolution: '4K Foto',
        type: 'video',
        extension: imgUrl.endsWith('.png') ? 'png' : 'jpg',
        url: imgUrl,
        isDirect: true,
        note: 'Foto Pinterest Resolusi Asli'
      });
    });
    if (!thumbnail && uniqueOrigImgs.length > 0) {
      thumbnail = uniqueOrigImgs[0];
    }
  }

  if (formats.length === 0) {
    throw new Error('Tidak dapat mengekstrak media Pinterest. Pastikan tautan valid dan publik.');
  }

  return {
    id: `pin-${Date.now()}`,
    url,
    platform: 'pinterest',
    title,
    author,
    thumbnail: thumbnail || (images[0] || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800'),
    formats,
    images: [...new Set(images.map((img) => img.replace(/\/(?:236x|474x|564x|736x)\//i, '/originals/')))],
    isPhotoSlide: images.length > 1,
    source: 'Pinterest Direct Scraper Engine',
    createdAt: new Date().toISOString()
  };
}

// ----------------- MAIN EXTRACTOR DISPATCHER -----------------
export async function extractMedia(url: string): Promise<MediaMetadata> {
  const trimmed = url.trim();
  if (!trimmed || !trimmed.startsWith('http')) {
    throw new Error('URL tidak valid. Harap masukkan tautan yang benar.');
  }

  const platform = detectPlatform(trimmed);

  // 1. Try Neoxr API First (if configured)
  try {
    const hasNeoxrKey = Boolean(process.env.NEOXR_API_KEY);
    if (hasNeoxrKey || platform === 'pinterest' || platform === 'facebook' || platform === 'instagram' || platform === 'tiktok' || platform === 'youtube') {
      try {
        const neoxrResult = await scrapeNeoxr(trimmed, platform);
        if (neoxrResult && neoxrResult.formats && neoxrResult.formats.length > 0) {
          return neoxrResult;
        }
      } catch (neoxrErr) {
        console.warn('Neoxr engine notice, using specialized fallback:', neoxrErr);
      }
    }
  } catch (e) {
    console.warn('Neoxr attempt notice:', e);
  }

  // 2. Fallback to specialized scrapers per platform
  switch (platform) {
    case 'tiktok':
      return await scrapeTikTok(trimmed);
    case 'facebook':
      return await scrapeFacebook(trimmed);
    case 'youtube':
      return await scrapeYouTube(trimmed);
    case 'instagram':
      return await scrapeInstagram(trimmed);
    case 'pinterest':
      return await scrapePinterest(trimmed);
    default: {
      // Generic fallback via Neoxr or universal scraper
      const universalResult = await scrapeNeoxr(trimmed, 'youtube').catch(() => null);
      if (universalResult) return universalResult;
      throw new Error('Platform tidak dikenali atau belum didukung. Masukkan tautan YouTube, TikTok, Facebook, Instagram, atau Pinterest.');
    }
  }
}
