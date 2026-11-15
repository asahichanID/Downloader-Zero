/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

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

/**
 * Resolves t.co or short Twitter/X redirect links to canonical x.com / twitter.com URLs.
 */
async function resolveTwitterUrl(rawUrl: string): Promise<string> {
  const trimmed = rawUrl.trim();
  if (!/(?:^https?:\/\/(?:www\.)?t\.co\/)/i.test(trimmed)) {
    return trimmed;
  }
  try {
    const res = await fetch(trimmed, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(6000)
    });
    if (res.url && res.url !== trimmed && res.url.startsWith('http')) {
      return res.url;
    }
  } catch {}
  return trimmed;
}

/**
 * Extracts screen name & status ID from any X / Twitter / FxTwitter / VxTwitter URL format.
 */
function parseTweetUrl(url: string): { username: string; statusId: string } {
  const cleaned = url.trim();
  const userMatch = cleaned.match(
    /(?:twitter\.com|x\.com|fxtwitter\.com|vxtwitter\.com|fixupx\.com|twittpr\.com)\/(?!i\/)([A-Za-z0-9_]{1,30})\/status(?:es)?\/(\d+)/i
  );
  if (userMatch) {
    return { username: userMatch[1], statusId: userMatch[2] };
  }

  const genericMatch = cleaned.match(/\/status(?:es)?\/(\d+)/i);
  if (genericMatch) {
    return { username: 'i', statusId: genericMatch[1] };
  }

  return { username: 'i', statusId: '' };
}

/**
 * Parses exact encoded dimensions (e.g. 1920x1080 or 1080x1920) from video.twimg.com URLs
 * so portrait & landscape videos map accurately to their TRUE resolution tier.
 */
function parseDimensionsFromUrl(url: string, fallbackWidth?: number, fallbackHeight?: number): { width: number; height: number } {
  const match = url.match(/\/(\d{2,4})x(\d{2,4})\//i);
  if (match) {
    const w = parseInt(match[1], 10);
    const h = parseInt(match[2], 10);
    if (!isNaN(w) && !isNaN(h) && w > 0 && h > 0) {
      return { width: w, height: h };
    }
  }
  return {
    width: fallbackWidth && fallbackWidth > 0 ? fallbackWidth : 0,
    height: fallbackHeight && fallbackHeight > 0 ? fallbackHeight : 0
  };
}

interface ParsedVariant {
  url: string;
  width: number;
  height: number;
  shortSide: number;
  pixelArea: number;
  bitrate: number;
  resolution: string;
  rank: number;
  qualityLabel: string;
  note: string;
}

function classifyResolution(width: number, height: number): { resolution: string; rank: number; tierName: string } {
  const shortSide = width > 0 && height > 0 ? Math.min(width, height) : 0;
  if (shortSide >= 2160) return { resolution: '4K', rank: 2160, tierName: '4K Ultra HD' };
  if (shortSide >= 1440) return { resolution: '2K', rank: 1440, tierName: '2K Quad HD' };
  if (shortSide >= 1080) return { resolution: '1080p', rank: 1080, tierName: '1080p Full HD' };
  if (shortSide >= 720) return { resolution: '720p', rank: 720, tierName: '720p HD' };
  if (shortSide >= 480) return { resolution: '480p', rank: 480, tierName: '480p SD' };
  if (shortSide >= 360) return { resolution: '360p', rank: 360, tierName: '360p SD' };
  if (shortSide > 0) return { resolution: `${shortSide}p`, rank: shortSide, tierName: `${shortSide}p Ringan` };
  return { resolution: 'HD', rank: 720, tierName: 'Video Asli' };
}

function buildVideoFormatsFromVariants(
  rawVariants: Array<{ url: string; bitrate?: number; width?: number; height?: number }>,
  durationSec: number
): MediaFormat[] {
  const parsedList: ParsedVariant[] = [];

  for (const v of rawVariants) {
    if (!v.url || typeof v.url !== 'string' || !v.url.startsWith('http')) continue;
    // Skip HLS playlists (.m3u8) — only collect real downloadable MP4 streams
    if (/\.m3u8(\?|$)/i.test(v.url)) continue;
    if (!/\.mp4(\?|$)/i.test(v.url) && !v.url.includes('/vid/')) continue;

    const dims = parseDimensionsFromUrl(v.url, v.width, v.height);
    const shortSide = dims.width > 0 && dims.height > 0 ? Math.min(dims.width, dims.height) : 0;
    const pixelArea = dims.width * dims.height;
    const { resolution, rank, tierName } = classifyResolution(dims.width, dims.height);
    const bitrate = typeof v.bitrate === 'number' && !isNaN(v.bitrate) ? v.bitrate : 0;
    const dimLabel = dims.width > 0 && dims.height > 0 ? `${dims.width}x${dims.height}` : 'Asli';

    parsedList.push({
      url: v.url,
      width: dims.width,
      height: dims.height,
      shortSide,
      pixelArea,
      bitrate,
      resolution,
      rank,
      qualityLabel: dims.width > 0 && dims.height > 0 ? `${tierName} (${dimLabel})` : tierName,
      note: dims.width > 0 && dims.height > 0
        ? `Resolusi asli ${dimLabel}${bitrate > 0 ? ` · ${Math.round(bitrate / 1000)} kbps` : ''}`
        : 'Stream MP4 asli Server 2'
    });
  }

  // Deduplicate by normalized resolution, keeping highest bitrate / pixel area for each resolution
  const byResolution = new Map<string, ParsedVariant>();
  for (const item of parsedList) {
    const existing = byResolution.get(item.resolution);
    if (!existing) {
      byResolution.set(item.resolution, item);
    } else if (
      item.pixelArea > existing.pixelArea ||
      (item.pixelArea === existing.pixelArea && item.bitrate > existing.bitrate)
    ) {
      byResolution.set(item.resolution, item);
    }
  }

  // Sort strictly highest resolution first
  const sorted = [...byResolution.values()].sort((a, b) => {
    if (b.rank !== a.rank) return b.rank - a.rank;
    return b.bitrate - a.bitrate;
  });

  return sorted.map((v, idx) => {
    const estBytes = v.bitrate > 0 && durationSec > 0 ? Math.round((v.bitrate / 8) * durationSec) : undefined;
    return {
      id: `tw-s2-${v.resolution.toLowerCase()}-${idx}`,
      quality: v.qualityLabel,
      resolution: v.resolution,
      type: 'video' as const,
      extension: 'mp4' as const,
      filesize: estBytes ? `~ ${formatBytes(estBytes)}` : undefined,
      filesizeBytes: estBytes,
      url: v.url,
      isDirect: true,
      needsResolution: false,
      note: v.note
    };
  });
}

function buildSyndicationToken(tweetId: string): string {
  return ((Number(tweetId) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '');
}

/**
 * =========================================================================
 * SERVER 2 TWITTER (X) SCRAPER (Free Keyless Multi-Tier API)
 * =========================================================================
 * Tier 1: api.fxtwitter.com (rich metadata, engagement stats & all MP4 variants)
 * Tier 2: cdn.syndication.twimg.com (official X embed feed with all MP4 variants)
 * Tier 3: api.vxtwitter.com (backup mirror)
 */
export async function scrapeTwitterServer2(rawUrl: string): Promise<MediaMetadata> {
  const canonicalUrl = await resolveTwitterUrl(rawUrl);
  const { username, statusId } = parseTweetUrl(canonicalUrl);

  if (!statusId) {
    throw new Error('Link Twitter (X) tidak valid. Pastikan menyertakan tautan status/postingan (contoh: https://x.com/user/status/123...).');
  }

  let title = '';
  let author = 'Pengguna X';
  let authorUrl: string | undefined = username !== 'i' ? `https://x.com/${username}` : undefined;
  let thumbnail = '';
  let durationSec = 0;
  let views: number | string | undefined;
  let likes: number | string | undefined;
  let comments: number | string | undefined;
  let rawVariants: Array<{ url: string; bitrate?: number; width?: number; height?: number }> = [];
  const images: string[] = [];
  let isGifMedia = false;

  // ----------------- TIER 1: FxTwitter API (Keyless) -----------------
  try {
    const fxRes = await fetch(`https://api.fxtwitter.com/${encodeURIComponent(username)}/status/${encodeURIComponent(statusId)}`, {
      headers: {
        'User-Agent': 'DownloaderZero/1.0 (+https://x.com)',
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(9000)
    });

    if (fxRes.ok) {
      const fxJson = await fxRes.json();
      const tweet = fxJson?.tweet;
      if (tweet) {
        if (tweet.text && typeof tweet.text === 'string') {
          title = tweet.text.replace(/\s+/g, ' ').trim();
        }
        if (tweet.author?.name || tweet.author?.screen_name) {
          const handle = tweet.author?.screen_name ? `@${tweet.author.screen_name}` : '';
          author = tweet.author?.name && handle
            ? `${tweet.author.name} (${handle})`
            : (tweet.author?.name || handle);
          if (tweet.author?.screen_name) {
            authorUrl = `https://x.com/${tweet.author.screen_name}`;
          }
        }
        if (tweet.views !== undefined) views = tweet.views;
        if (tweet.likes !== undefined) likes = tweet.likes;
        if (tweet.replies !== undefined) comments = tweet.replies;

        // Extract videos / GIFs
        const fxVideos = Array.isArray(tweet.media?.videos)
          ? tweet.media.videos
          : Array.isArray(tweet.media?.all)
            ? tweet.media.all.filter((m: any) => m?.type === 'video' || m?.type === 'gif')
            : [];

        if (fxVideos.length > 0) {
          const primaryVid = fxVideos[0];
          if (primaryVid.type === 'gif') {
            isGifMedia = true;
          }
          if (typeof primaryVid.duration === 'number' && primaryVid.duration > 0) {
            durationSec = primaryVid.duration;
          }
          if (primaryVid.thumbnail_url) {
            thumbnail = primaryVid.thumbnail_url;
          }

          const fmtList = Array.isArray(primaryVid.formats)
            ? primaryVid.formats
            : Array.isArray(primaryVid.variants)
              ? primaryVid.variants
              : [];

          for (const f of fmtList) {
            const fUrl = f?.url || f?.src;
            if (typeof fUrl === 'string' && fUrl.startsWith('http')) {
              rawVariants.push({
                url: fUrl,
                bitrate: typeof f.bitrate === 'number' ? f.bitrate : undefined,
                width: typeof primaryVid.width === 'number' ? primaryVid.width : undefined,
                height: typeof primaryVid.height === 'number' ? primaryVid.height : undefined
              });
            }
          }

          if (rawVariants.length === 0 && typeof primaryVid.url === 'string' && primaryVid.url.startsWith('http')) {
            rawVariants.push({
              url: primaryVid.url,
              width: primaryVid.width,
              height: primaryVid.height
            });
          }
        }

        // Extract photos
        const fxPhotos = Array.isArray(tweet.media?.photos)
          ? tweet.media.photos
          : Array.isArray(tweet.media?.all)
            ? tweet.media.all.filter((m: any) => m?.type === 'photo')
            : [];

        for (const p of fxPhotos) {
          if (p?.url && typeof p.url === 'string' && p.url.startsWith('http') && !images.includes(p.url)) {
            images.push(p.url);
          }
        }
        if (!thumbnail && images.length > 0) {
          thumbnail = images[0];
        }
      }
    }
  } catch (fxErr) {
    console.warn('[Server 2 Twitter] FxTwitter notice:', fxErr);
  }

  // ----------------- TIER 2: X Syndication CDN (Keyless) -----------------
  if (rawVariants.length === 0 && images.length === 0) {
    try {
      const token = buildSyndicationToken(statusId);
      const synRes = await fetch(
        `https://cdn.syndication.twimg.com/tweet-result?id=${encodeURIComponent(statusId)}&lang=en&token=${encodeURIComponent(token)}`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
            'Accept': 'application/json'
          },
          signal: AbortSignal.timeout(8000)
        }
      );

      if (synRes.ok) {
        const synJson = await synRes.json();
        if (!title && synJson?.text) {
          title = String(synJson.text).replace(/\s+/g, ' ').trim();
        }
        if (author === 'Pengguna X' && (synJson?.user?.name || synJson?.user?.screen_name)) {
          const handle = synJson.user?.screen_name ? `@${synJson.user.screen_name}` : '';
          author = synJson.user?.name && handle ? `${synJson.user.name} (${handle})` : (synJson.user?.name || handle);
          if (synJson.user?.screen_name) authorUrl = `https://x.com/${synJson.user.screen_name}`;
        }
        if (likes === undefined && synJson?.favorite_count !== undefined) likes = synJson.favorite_count;
        if (comments === undefined && synJson?.conversation_count !== undefined) comments = synJson.conversation_count;

        const mediaDetails = Array.isArray(synJson?.mediaDetails) ? synJson.mediaDetails : [];
        const synVideoVariants =
          synJson?.video?.variants ||
          mediaDetails.find((m: any) => m?.video_info?.variants)?.video_info?.variants ||
          [];

        if (Array.isArray(synVideoVariants)) {
          const vidDetail = mediaDetails.find((m: any) => m?.video_info);
          if (vidDetail?.type === 'animated_gif') {
            isGifMedia = true;
          }
          if (!durationSec && vidDetail?.video_info?.duration_millis) {
            durationSec = vidDetail.video_info.duration_millis / 1000;
          } else if (!durationSec && synJson?.video?.durationMs) {
            durationSec = synJson.video.durationMs / 1000;
          }
          if (!thumbnail) {
            thumbnail = synJson?.video?.poster || vidDetail?.media_url_https || '';
          }

          for (const sv of synVideoVariants) {
            const svUrl = sv?.src || sv?.url;
            if (typeof svUrl === 'string' && svUrl.startsWith('http') && (!sv.type || sv.type.includes('mp4') || sv.content_type?.includes('mp4'))) {
              rawVariants.push({
                url: svUrl,
                bitrate: typeof sv.bitrate === 'number' ? sv.bitrate : undefined
              });
            }
          }
        }

        const synPhotos = Array.isArray(synJson?.photos) ? synJson.photos : mediaDetails.filter((m: any) => m?.type === 'photo');
        for (const sp of synPhotos) {
          const pUrl = sp?.url || sp?.media_url_https;
          if (typeof pUrl === 'string' && pUrl.startsWith('http') && !images.includes(pUrl)) {
            images.push(pUrl);
          }
        }
        if (!thumbnail && images.length > 0) thumbnail = images[0];
      }
    } catch (synErr) {
      console.warn('[Server 2 Twitter] Syndication notice:', synErr);
    }
  }

  // ----------------- TIER 3: VxTwitter API (Keyless Fallback) -----------------
  if (rawVariants.length === 0 && images.length === 0) {
    try {
      const vxRes = await fetch(`https://api.vxtwitter.com/${encodeURIComponent(username)}/status/${encodeURIComponent(statusId)}`, {
        headers: {
          'User-Agent': 'DownloaderZero/1.0',
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(8000)
      });

      if (vxRes.ok) {
        const vxJson = await vxRes.json();
        if (!title && vxJson?.text) {
          title = String(vxJson.text).replace(/\s+/g, ' ').trim();
        }
        if (author === 'Pengguna X' && (vxJson?.user_name || vxJson?.user_screen_name)) {
          const handle = vxJson?.user_screen_name ? `@${vxJson.user_screen_name}` : '';
          author = vxJson?.user_name && handle ? `${vxJson.user_name} (${handle})` : (vxJson.user_name || handle);
          if (vxJson?.user_screen_name) authorUrl = `https://x.com/${vxJson.user_screen_name}`;
        }
        if (likes === undefined && vxJson?.likes !== undefined) likes = vxJson.likes;
        if (comments === undefined && vxJson?.replies !== undefined) comments = vxJson.replies;

        const mediaExt = Array.isArray(vxJson?.media_extended) ? vxJson.media_extended : [];
        for (const item of mediaExt) {
          if (item?.type === 'video' || item?.type === 'gif') {
            if (item?.type === 'gif') isGifMedia = true;
            if (!durationSec && item.duration_millis) durationSec = item.duration_millis / 1000;
            if (!thumbnail && item.thumbnail_url) thumbnail = item.thumbnail_url;
            if (typeof item.url === 'string' && item.url.startsWith('http')) {
              rawVariants.push({
                url: item.url,
                width: item.size?.width,
                height: item.size?.height
              });
            }
          } else if (item?.type === 'image' && typeof item.url === 'string' && item.url.startsWith('http')) {
            if (!images.includes(item.url)) images.push(item.url);
          }
        }
        if (!thumbnail && images.length > 0) thumbnail = images[0];
      }
    } catch (vxErr) {
      console.warn('[Server 2 Twitter] VxTwitter notice:', vxErr);
    }
  }

  const formats: MediaFormat[] = buildVideoFormatsFromVariants(rawVariants, durationSec);

  // Add MP3 audio bitrate options (320 / 256 / 128 kbps) backed by highest-bitrate video stream (excluded for silent GIFs)
  const topVideoForAudio = formats.find((f) => f.type === 'video' && f.url.startsWith('http'));
  if (topVideoForAudio && !isGifMedia) {
    const audioBitrates = [
      { kbps: 320, quality: '320 kbps Ultra HQ (Ekstrak Audio MP3)', note: 'Bitrate MP3 tertinggi dari audio asli postingan X' },
      { kbps: 256, quality: '256 kbps High (Ekstrak Audio MP3)', note: 'Audio MP3 jernih kualitas tinggi' },
      { kbps: 128, quality: '128 kbps Standard (Ekstrak Audio MP3)', note: 'Audio MP3 ukuran ringan & cepat' }
    ];
    audioBitrates.forEach((ab) => {
      const estAudioBytes = durationSec > 0 ? Math.round(((ab.kbps * 1000) / 8) * durationSec) : undefined;
      formats.push({
        id: `tw-s2-audio-${ab.kbps}`,
        quality: ab.quality,
        resolution: `${ab.kbps} kbps`,
        type: 'audio',
        extension: 'mp3',
        filesize: estAudioBytes ? `~ ${formatBytes(estAudioBytes)}` : undefined,
        filesizeBytes: estAudioBytes,
        url: topVideoForAudio.url,
        isDirect: true,
        needsResolution: false,
        note: ab.note
      });
    });
  }

  if (images.length > 0 && formats.length === 0) {
    formats.push({
      id: images.length > 1 ? 'tw-s2-photos-all' : 'tw-s2-photo-0',
      quality: images.length > 1 ? `Koleksi Foto X (${images.length} Gambar HD)` : 'Foto X Resolusi Asli',
      resolution: 'HD Foto',
      type: 'photos',
      extension: images[0].toLowerCase().includes('.png') ? 'png' : 'jpg',
      url: images[0],
      isDirect: true,
      needsResolution: false,
      note: images.length > 1 ? `${images.length} foto resolusi penuh siap unduh` : 'Gambar resolusi asli dari X'
    });
  }

  if (formats.length === 0) {
    throw new Error('Postingan Twitter (X) ini tidak mengandung video/foto atau akun bersifat privat.');
  }

  const cleanTitle = (title || `Postingan X #${statusId}`)
    .replace(/https?:\/\/t\.co\/\S+/gi, '')
    .trim() || `Postingan X #${statusId}`;

  return {
    id: statusId,
    url: canonicalUrl,
    platform: 'twitter',
    title: cleanTitle.slice(0, 140),
    author,
    authorUrl,
    thumbnail,
    duration: Math.round(durationSec),
    durationFormatted: formatDuration(durationSec),
    views,
    likes,
    comments,
    formats,
    images: images.length > 0 ? images : undefined,
    isPhotoSlide: images.length > 1,
    source: 'Server 2 Twitter (X) Engine',
    createdAt: new Date().toISOString()
  };
}
