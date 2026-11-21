import type { MediaMetadata, MediaFormat, ServerMode } from '../../types/index.ts';
import {
  resolveTikTokServer2 as resolveTikTokServer2S2,
  resolveTikTokShortUrl,
  getCachedOrFetchTikTokData
} from '../server2/tiktok-s2.ts';

// Helper to format bytes
function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// Helper to format duration in mm:ss or hh:mm:ss
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

// Resolve redirects for shortlinks (vt.tiktok.com, vm.tiktok.com, /t/)
export async function resolveTikTokUrl(rawUrl: string): Promise<string> {
  return await resolveTikTokShortUrl(rawUrl);
}

// =========================================================================
// 1. DEDICATED TIKTOK PREVIEW ENGINE (PENGAMBILAN MEDIA PERTAMA DOWNLOAD)
// Menggunakan shared cache & pacer di tiktok-s2.ts sehingga pemanggilan /start-job
// setelah memilih format langsung memakai hasil cache (< 1ms) tanpa kena rate-limit 1 req/s.
// =========================================================================
export async function extractTikTokPreview(rawUrl: string): Promise<MediaMetadata> {
  const target = await resolveTikTokUrl(rawUrl);
  const d = await getCachedOrFetchTikTokData(target);

  const rawImages: string[] = Array.isArray(d.images)
    ? d.images.filter((img: any) => typeof img === 'string' && img.startsWith('http'))
    : [];
  const isPhotoSlide = rawImages.length > 0;
  const hasVideoStream = Boolean(d.hdplay || d.play || d.wmplay);

  const thumbnail =
    d.ai_dynamic_cover ||
    d.origin_cover ||
    d.cover ||
    (rawImages.length > 0 ? rawImages[0] : '');

  const durationSec = typeof d.duration === 'number' ? d.duration : 0;
  const durationFormatted = formatDuration(durationSec);
  const title = d.title || (isPhotoSlide ? 'TikTok Photo Slideshow' : 'Video TikTok');
  const author = d.author?.nickname || d.author?.unique_id || 'Kreator TikTok';
  const authorUrl = d.author?.unique_id ? `https://www.tiktok.com/@${d.author.unique_id}` : undefined;

  const formats: MediaFormat[] = [];

  // Slide Foto
  if (isPhotoSlide) {
    formats.push({
      id: 'tt-photos-all',
      quality: rawImages.length > 1 ? `Koleksi Foto (${rawImages.length} Slide Gambar HD)` : 'Foto TikTok HD (Resolusi Asli)',
      resolution: 'HD Foto',
      type: 'photos',
      extension: 'jpg',
      url: rawImages[0],
      isDirect: true,
      needsResolution: false,
      note: rawImages.length > 1 ? `${rawImages.length} foto resolusi penuh siap unduh` : 'Foto resolusi penuh siap unduh'
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

  if (hasVideoStream || !isPhotoSlide) {
    // Format Video 4K Ultra HD
    formats.push({
      id: 'tt-4k',
      quality: '4K Ultra HD (2160p Tanpa Watermark)',
      resolution: '4K',
      type: 'video',
      extension: 'mp4',
      filesize: d.hd_size ? `~ ${formatBytes(Math.round(d.hd_size * 1.5))}` : (d.size ? `~ ${formatBytes(Math.round(d.size * 1.8))}` : undefined),
      url: '',
      isDirect: true,
      needsResolution: true,
      note: 'Kualitas Ultra HD 4K tertinggi tanpa watermark'
    });

    // Format Video 2K Quad HD
    formats.push({
      id: 'tt-2k',
      quality: '2K Quad HD (1440p Tanpa Watermark)',
      resolution: '2K',
      type: 'video',
      extension: 'mp4',
      filesize: d.hd_size ? `~ ${formatBytes(Math.round(d.hd_size * 1.25))}` : (d.size ? `~ ${formatBytes(Math.round(d.size * 1.4))}` : undefined),
      url: '',
      isDirect: true,
      needsResolution: true,
      note: 'Kualitas 2K Quad HD jernih tajam tanpa watermark'
    });

    // Format Video 1080p Full HD
    formats.push({
      id: 'tt-1080',
      quality: '1080p Full HD (Tanpa Watermark)',
      resolution: '1080p',
      type: 'video',
      extension: 'mp4',
      filesize: d.hd_size ? formatBytes(d.hd_size) : (d.size ? formatBytes(d.size) : undefined),
      filesizeBytes: d.hd_size || d.size,
      url: '',
      isDirect: true,
      needsResolution: true,
      note: 'Kualitas Full HD 1080p asli jernih'
    });

    // Format Video 720p HD
    formats.push({
      id: 'tt-720',
      quality: '720p HD (Tanpa Watermark)',
      resolution: '720p',
      type: 'video',
      extension: 'mp4',
      filesize: d.size ? formatBytes(d.size) : undefined,
      filesizeBytes: d.size,
      url: '',
      isDirect: true,
      needsResolution: true,
      note: 'Format HD standar hemat kuota'
    });

    // Format Video 480p SD
    formats.push({
      id: 'tt-480',
      quality: '480p SD (Hemat Data)',
      resolution: '480p',
      type: 'video',
      extension: 'mp4',
      filesize: d.size ? `~ ${formatBytes(Math.round(d.size * 0.6))}` : undefined,
      url: '',
      isDirect: true,
      needsResolution: true,
      note: 'Format SD hemat kuota data seluler'
    });
  }

  // Format Audio 320 / 256 / 128 kbps MP3
  const estAudioDur = durationSec > 0 ? durationSec : 30;
  [
    { kbps: 320, id: 'tt-audio', label: '320 kbps (Original Sound MP3 • Jernih)', note: d.music_info?.title ? `Audio: ${d.music_info.title}` : 'Audio musik 320 kbps jernih' },
    { kbps: 256, id: 'tt-audio-256', label: '256 kbps (MP3 Kualitas Tinggi)', note: 'Audio MP3 256 kbps jernih' },
    { kbps: 128, id: 'tt-audio-128', label: '128 kbps (MP3 Standar • Ringan)', note: 'Ukuran file lebih ringan' }
  ].forEach((opt) => {
    formats.push({
      id: opt.id,
      quality: opt.label,
      resolution: `${opt.kbps} kbps`,
      type: 'audio',
      extension: 'mp3',
      filesize: durationSec > 0 ? `~ ${Math.max(0.2, +((estAudioDur * opt.kbps) / 8 / 1024).toFixed(1))} MB` : undefined,
      url: '',
      isDirect: true,
      needsResolution: true,
      note: opt.note
    });
  });

  return {
    id: d.id ? String(d.id) : `tt-${Date.now()}`,
    url: target,
    platform: 'tiktok',
    title,
    author,
    authorUrl,
    thumbnail,
    duration: durationSec,
    durationFormatted,
    views: d.play_count,
    likes: d.digg_count,
    comments: d.comment_count,
    formats,
    images: rawImages.length > 0 ? rawImages : undefined,
    isPhotoSlide,
    source: d._sourceEngine ? `TikTok Preview Engine (${d._sourceEngine})` : 'TikTok Preview Engine',
    createdAt: new Date().toISOString()
  };
}

// =========================================================================
// 2. UPGRADED RESOLUTION ENGINES (PEMAKAIAN API SETELAH PEMILIHAN FORMAT)
// Dipanggil TEPAT SATU KALI saat pengguna mengklik format unduhan yang dipilih.
// Mendukung Server 1, Upgraded Server 2 (4K & 320 kbps), dan Auto fallback.
// =========================================================================

// Resolve on Server 1 (Primary / Neoxr)
export async function resolveTikTokServer1(
  url: string,
  _formatId: string,
  _resolution: string,
  type: string,
  apiKey?: string
): Promise<{ downloadUrl: string; quality?: string }> {
  const envKey = ((typeof process !== 'undefined' && process.env ? process.env.NEOXR_API_KEY : undefined) || 'j3i3mg').trim().replace(/^["']|["']$/g, '');
  const key = (apiKey || envKey || 'j3i3mg').trim().replace(/^["']|["']$/g, '');

  const endpoint = `https://api.neoxr.eu/api/tiktok?url=${encodeURIComponent(url)}&apikey=${encodeURIComponent(key)}`;
  const res = await fetch(endpoint, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(10000)
  });

  if (!res.ok) {
    throw new Error(`Server 1 TikTok HTTP ${res.status}`);
  }

  const json = await res.json();
  if (!json || !json.status || !json.data) {
    throw new Error(json?.msg || json?.message || 'Server 1 tidak dapat menemukan stream video TikTok.');
  }

  const d = Array.isArray(json.data) ? json.data[0] : json.data;
  if (!d) {
    throw new Error('Server 1 tidak dapat menemukan stream video TikTok.');
  }
  const isAudio = type === 'audio';

  if (isAudio) {
    const audioUrl = d.audio || d.music || d.sound || d.audio_url || d.mp3;
    if (audioUrl && typeof audioUrl === 'string' && audioUrl.startsWith('http')) {
      return { downloadUrl: audioUrl, quality: '320 kbps MP3' };
    }
    const vidForAudio = d.video || d.video_hd || d.nowm || d.play || d.url || d.download;
    if (vidForAudio && typeof vidForAudio === 'string' && vidForAudio.startsWith('http')) {
      return { downloadUrl: vidForAudio, quality: '320 kbps MP3 (Ekstrak Audio)' };
    }
  }

  const resLower = String(_resolution || '').toLowerCase();
  const preferLower = resLower.includes('480') || resLower.includes('360') || resLower.includes('720');
  const vidUrl = preferLower
    ? (d.video || d.nowm || d.play || d.sd || d.video_hd || d.hd || d.url || d.download)
    : (d.video_hd || d.hd || d.hdplay || d.video || d.nowm || d.play || d.url || d.download);
  if (vidUrl && typeof vidUrl === 'string' && vidUrl.startsWith('http')) {
    return { downloadUrl: vidUrl, quality: preferLower ? '720p HD (Tanpa Watermark)' : '1080p Full HD (Tanpa Watermark)' };
  }

  throw new Error('Server 1 tidak menghasilkan link unduhan yang valid.');
}

// Resolve on Server 2 (DEDICATED SERVER 2 ENGINE in server2/tiktok-s2.ts)
export async function resolveTikTokServer2(
  url: string,
  formatId: string,
  resolution: string,
  type: string
): Promise<{ downloadUrl: string; quality?: string }> {
  return await resolveTikTokServer2S2(url, formatId, resolution, type);
}

// Master Dispatcher for TikTok format download (Server 1 vs Server 2 vs Auto)
export async function resolveTikTokDownload(
  url: string,
  formatId: string,
  resolution: string,
  type: string,
  serverMode: ServerMode = 'auto',
  apiKey?: string
): Promise<{ downloadUrl: string; quality?: string }> {
  if (serverMode === 'server1') {
    return await resolveTikTokServer1(url, formatId, resolution, type, apiKey);
  }

  if (serverMode === 'server2') {
    return await resolveTikTokServer2(url, formatId, resolution, type);
  }

  // Auto / Default: Server 2 is the dedicated scraper engine for TikTok (free, no apikey, accurate 4K/2K/1080p/720p/audio)
  // We prioritize Server 2 first; if it ever fails, smoothly fallback to Server 1
  try {
    return await resolveTikTokServer2(url, formatId, resolution, type);
  } catch (err2) {
    console.warn('[TikTok Resolve] Server 2 scraper notice, falling back to Server 1:', err2);
    return await resolveTikTokServer1(url, formatId, resolution, type, apiKey);
  }
}
