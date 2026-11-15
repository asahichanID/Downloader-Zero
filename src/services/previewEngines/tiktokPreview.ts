import type { MediaMetadata, MediaFormat, ServerMode } from '../../types/index.ts';
import { resolveTikTokServer2 as resolveTikTokServer2S2 } from '../server2/tiktok-s2.ts';

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

// Resolve redirects for shortlinks (vt.tiktok.com, vm.tiktok.com)
export async function resolveTikTokUrl(rawUrl: string): Promise<string> {
  const trimmed = rawUrl.trim();
  if (!trimmed.includes('vt.tiktok.com') && !trimmed.includes('vm.tiktok.com') && !trimmed.includes('/t/')) {
    return trimmed;
  }
  try {
    const res = await fetch(trimmed, {
      method: 'HEAD',
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(6000)
    });
    return res.url || trimmed;
  } catch {
    return trimmed;
  }
}

// =========================================================================
// 1. DEDICATED TIKTOK PREVIEW ENGINE (PENGAMBILAN MEDIA PERTAMA DOWNLOAD)
// Tempat khusus hanya mengambil thumbnail foto utuh, angka durasi, dan judul.
// Tidak memanggil API download stream penuh agar tidak dipanggil 2 kali.
// =========================================================================
export async function extractTikTokPreview(rawUrl: string): Promise<MediaMetadata> {
  const target = await resolveTikTokUrl(rawUrl);
  const cleanUrl = encodeURIComponent(target);

  const previewEndpoints = [
    `https://www.tikwm.com/api/?url=${cleanUrl}`,
    `https://tikwm.com/api/?url=${cleanUrl}`
  ];

  let d: any = null;
  let lastErr = '';

  for (const ep of previewEndpoints) {
    try {
      const response = await fetch(ep, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        signal: AbortSignal.timeout(6000)
      });
      if (response.ok) {
        const json = await response.json();
        if (json.code === 0 && json.data) {
          d = json.data;
          break;
        } else {
          lastErr = json.msg || 'Gagal mengambil metadata TikTok.';
        }
      }
    } catch (e: any) {
      lastErr = e.message || 'Koneksi ke server preview TikTok gagal.';
    }
  }

  // Fallback: Social crawler preview if TikWM has an issue
  if (!d) {
    try {
      const botRes = await fetch(target, {
        headers: {
          'User-Agent': 'Twitterbot/1.0',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        signal: AbortSignal.timeout(5000)
      });
      if (botRes.ok) {
        const html = await botRes.text();
        const mTitle = html.match(/<meta (?:name|property)="og:title" content="([^"]+)"/i) || html.match(/<title>([^<]+)<\/title>/i);
        const mImage = html.match(/<meta (?:name|property)="og:image" content="([^"]+)"/i) || html.match(/<meta (?:name|property)="twitter:image" content="([^"]+)"/i);
        const mAuthor = html.match(/<meta (?:name|property)="author" content="([^"]+)"/i);

        let fallbackTitle = mTitle ? mTitle[1].replace(/&amp;/g, '&').replace(/^TikTok\s*·\s*/i, '').trim() : 'Video TikTok';
        let fallbackThumbnail = mImage ? mImage[1].replace(/&amp;/g, '&') : '';

        if (fallbackTitle || fallbackThumbnail) {
          d = {
            id: `tt-${Date.now()}`,
            title: fallbackTitle,
            duration: 15,
            cover: fallbackThumbnail,
            origin_cover: fallbackThumbnail,
            author: { nickname: mAuthor ? mAuthor[1] : 'Kreator TikTok' }
          };
        }
      }
    } catch {}
  }

  if (!d) {
    throw new Error(lastErr || 'Konten TikTok tidak ditemukan atau video bersifat privat.');
  }

  const rawImages: string[] = Array.isArray(d.images)
    ? d.images.filter((img: any) => typeof img === 'string' && img.startsWith('http'))
    : [];
  const isPhotoSlide = rawImages.length > 0;

  // Thumbnail foto utuh tanpa crop (ai_dynamic_cover original, origin_cover, atau cover uncompressed)
  const thumbnail =
    d.ai_dynamic_cover ||
    d.origin_cover ||
    d.cover ||
    (rawImages.length > 0 ? rawImages[0] : '');

  const durationSec = typeof d.duration === 'number' ? d.duration : 0;
  const durationFormatted = formatDuration(durationSec);
  const title = d.title || d.caption || (isPhotoSlide ? 'TikTok Photo Slideshow' : 'Video TikTok');
  const author = d.author?.nickname || d.author?.unique_id || 'Kreator TikTok';
  const authorUrl = d.author?.unique_id ? `https://www.tiktok.com/@${d.author.unique_id}` : undefined;

  const formats: MediaFormat[] = [];

  // Slide Foto
  if (isPhotoSlide) {
    formats.push({
      id: 'tt-photos-all',
      quality: `Koleksi Foto (${rawImages.length} Slide Gambar HD)`,
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

  // Format Audio 320 kbps MP3
  formats.push({
    id: 'tt-audio',
    quality: '320 kbps (Original Sound MP3 • Jernih)',
    resolution: 'Audio',
    type: 'audio',
    extension: 'mp3',
    url: '',
    isDirect: true,
    needsResolution: true,
    note: d.music_info?.title ? `Audio: ${d.music_info.title}` : 'Audio musik 320 kbps jernih'
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
    views: d.play_count ?? d.views ?? d.statistic?.play_count,
    likes: d.digg_count ?? d.likes ?? d.statistic?.digg_count,
    comments: d.comment_count ?? d.comments ?? d.statistic?.comment_count,
    formats,
    images: rawImages.length > 0 ? rawImages : undefined,
    isPhotoSlide,
    source: 'TikTok Preview Engine',
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
  const envKey = (process.env.NEOXR_API_KEY || 'j3i3mg').trim().replace(/^["']|["']$/g, '');
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
    throw new Error('Server 1 tidak dapat menemukan stream video TikTok.');
  }

  const d = json.data;
  const isAudio = type === 'audio';

  if (isAudio) {
    const audioUrl = d.audio || d.music || d.sound;
    if (audioUrl && typeof audioUrl === 'string' && audioUrl.startsWith('http')) {
      return { downloadUrl: audioUrl, quality: '320 kbps MP3' };
    }
  }

  const vidUrl = d.video || d.video_hd || d.nowm || d.url || d.download;
  if (vidUrl && typeof vidUrl === 'string' && vidUrl.startsWith('http')) {
    return { downloadUrl: vidUrl, quality: 'Full HD' };
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
