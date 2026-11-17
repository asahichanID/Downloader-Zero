/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as cheerio from 'cheerio';
import type { AudioTrack, MediaFormat, MediaMetadata } from '../../types/index.ts';
import { resolveYouTubeServer2 } from './youtube-s2.ts';

export type SpotifyEntityType = 'track' | 'playlist' | 'album' | 'episode';

export interface SpotifyEmbedMetadata {
  entityType: SpotifyEntityType;
  entityId: string;
  canonicalUrl: string;
  title: string;
  author: string;
  album: string;
  releaseDate: string;
  thumbnail: string;
  durationSec: number;
  previewUrl: string;
  tracks: AudioTrack[];
}

export interface SpotifyResolvedAudio {
  audioUrl: string;
  title: string;
  artist: string;
  album: string;
  coverUrl: string;
  releaseDate: string;
}

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36';

function cleanText(val?: string | null): string {
  if (!val || typeof val !== 'string') return '';
  return val.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

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

async function resolveShortSpotifyUrl(rawUrl: string): Promise<string> {
  const trimmed = rawUrl.trim();
  if (!/spotify\.link|spoti\.fi/i.test(trimmed)) return trimmed;
  try {
    const res = await fetch(trimmed, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'User-Agent': DESKTOP_UA },
      signal: AbortSignal.timeout(7000)
    });
    if (res.url && res.url.includes('spotify.com')) {
      return res.url;
    }
  } catch {}
  return trimmed;
}

export function parseSpotifyEntity(rawUrl: string): {
  entityType: SpotifyEntityType;
  entityId: string;
  canonicalUrl: string;
} {
  const trimmed = rawUrl.trim();
  const m = trimmed.match(
    /spotify\.com\/(?:intl-[a-z-]+\/)?(track|playlist|album|episode)\/([a-zA-Z0-9]+)/i
  );
  const entityType = ((m?.[1] || 'track').toLowerCase()) as SpotifyEntityType;
  const entityId = m?.[2] || '';
  const canonicalUrl = entityId
    ? `https://open.spotify.com/${entityType}/${entityId}`
    : trimmed;
  return { entityType, entityId, canonicalUrl };
}

function extractReleaseYearOrDate(releaseDateRaw: any): string {
  if (!releaseDateRaw) return '';
  if (typeof releaseDateRaw === 'string') return releaseDateRaw.slice(0, 10);
  if (typeof releaseDateRaw?.isoString === 'string') {
    return releaseDateRaw.isoString.slice(0, 10);
  }
  return '';
}

function pickBestCoverFromEntity(entity: any): string {
  const coverSources = Array.isArray(entity?.coverArt?.sources)
    ? entity.coverArt.sources
    : [];
  const visualImages = Array.isArray(entity?.visualIdentity?.image)
    ? entity.visualIdentity.image
    : [];

  const allCandidates = [...coverSources, ...visualImages]
    .filter((img: any) => typeof img?.url === 'string' && img.url.startsWith('http'))
    .sort((a: any, b: any) => (b.maxWidth || b.width || 0) - (a.maxWidth || a.width || 0));

  return allCandidates[0]?.url || '';
}

/**
 * Queries Apple iTunes Search API (keyless, fast) for genre, album, release date,
 * cover fallback, and 30s preview audio fallback if Spotify embed omits previewUrl.
 */
async function enrichFromItunes(
  title: string,
  artist: string
): Promise<{
  genre: string;
  album: string;
  releaseDate: string;
  artworkUrl: string;
  previewUrl: string;
}> {
  let genre = 'Pop';
  let album = '';
  let releaseDate = '';
  let artworkUrl = '';
  let previewUrl = '';

  const cleanTitle = cleanText(title)
    .replace(/[\(\[].*?[\)\]]/g, '')
    .trim();
  const primaryArtist = cleanText(artist).split(',')[0].trim();
  if (!cleanTitle) {
    return { genre, album, releaseDate, artworkUrl, previewUrl };
  }

  try {
    const q = encodeURIComponent(`${cleanTitle} ${primaryArtist}`.trim());
    const res = await fetch(
      `https://itunes.apple.com/search?term=${q}&media=music&entity=song&limit=1`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (res.ok) {
      const json = await res.json();
      const item = json?.results?.[0];
      if (item) {
        if (item.primaryGenreName) genre = item.primaryGenreName;
        if (item.collectionName) album = item.collectionName;
        if (item.releaseDate) releaseDate = String(item.releaseDate).slice(0, 10);
        if (typeof item.artworkUrl100 === 'string') {
          artworkUrl = item.artworkUrl100.replace('100x100bb', '600x600bb');
        }
        if (typeof item.previewUrl === 'string' && item.previewUrl.startsWith('http')) {
          previewUrl = item.previewUrl;
        }
      }
    }
  } catch {}

  return { genre, album, releaseDate, artworkUrl, previewUrl };
}

/**
 * Extracts full track / playlist / album metadata cleanly from Spotify Embed + oEmbed
 * without requiring any API key.
 */
export async function fetchSpotifyEmbedData(
  rawUrl: string
): Promise<SpotifyEmbedMetadata> {
  const expandedUrl = await resolveShortSpotifyUrl(rawUrl);
  const { entityType, entityId, canonicalUrl } = parseSpotifyEntity(expandedUrl);

  if (!entityId) {
    throw new Error('URL Spotify tidak valid atau ID lagu/playlist tidak ditemukan.');
  }

  let title = '';
  let author = '';
  let album = '';
  let releaseDate = '';
  let thumbnail = '';
  let durationSec = 0;
  let previewUrl = '';
  const tracks: AudioTrack[] = [];

  try {
    const embedUrl = `https://open.spotify.com/embed/${entityType}/${entityId}`;
    const res = await fetch(embedUrl, {
      headers: {
        'User-Agent': DESKTOP_UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      signal: AbortSignal.timeout(10000)
    });

    if (res.ok) {
      const html = await res.text();
      const $ = cheerio.load(html);
      const nextDataRaw = $('#__NEXT_DATA__').html();
      if (nextDataRaw) {
        const nextData = JSON.parse(nextDataRaw);
        const entity = nextData?.props?.pageProps?.state?.data?.entity;
        if (entity) {
          title = cleanText(entity.title || entity.name);

          if (Array.isArray(entity.artists) && entity.artists.length > 0) {
            author = entity.artists
              .map((a: any) => cleanText(a?.name))
              .filter(Boolean)
              .join(', ');
          } else if (Array.isArray(entity.authors) && entity.authors.length > 0) {
            author = entity.authors
              .map((a: any) => cleanText(a?.name || a))
              .filter(Boolean)
              .join(', ');
          } else if (entity.subtitle) {
            author = cleanText(entity.subtitle);
          }

          thumbnail = pickBestCoverFromEntity(entity);
          releaseDate = extractReleaseYearOrDate(entity.releaseDate);
          if (entity.album?.name) {
            album = cleanText(entity.album.name);
          }
          if (entity.duration) {
            durationSec = Math.round(Number(entity.duration) / 1000);
          }
          if (entity.audioPreview?.url) {
            previewUrl = entity.audioPreview.url;
          }

          if (Array.isArray(entity.trackList) && entity.trackList.length > 0) {
            const albumLabel =
              entityType === 'album' ? title : cleanText(entity.title || entity.name) || 'Spotify Playlist';

            entity.trackList.forEach((t: any, idx: number) => {
              const tTitle = cleanText(t.title || t.name) || `Track ${idx + 1}`;
              const tArtist = cleanText(t.subtitle) || author || 'Spotify Artist';
              const durMs = Number(t.duration) || 0;
              const tDurSec = durMs > 0 ? Math.round(durMs / 1000) : 0;
              const tPreview =
                typeof t.audioPreview?.url === 'string' && t.audioPreview.url.startsWith('http')
                  ? t.audioPreview.url
                  : '';
              const rawUri = typeof t.uri === 'string' ? t.uri : '';
              const uriIdMatch = rawUri.match(/spotify:(?:track|episode):([a-zA-Z0-9]+)/i);
              const tId = uriIdMatch?.[1] || cleanText(t.id) || `sp-trk-${idx + 1}`;
              const isRealTrackId = /^[a-zA-Z0-9]{10,}$/.test(tId);
              const trackCanonicalUrl = isRealTrackId
                ? `https://open.spotify.com/track/${tId}`
                : canonicalUrl;

              tracks.push({
                id: tId,
                title: tTitle,
                artist: tArtist,
                album: albumLabel,
                genre: 'Pop',
                releaseDate,
                thumbnail,
                duration: tDurSec || 200,
                durationFormatted: formatDuration(tDurSec || 200),
                url: trackCanonicalUrl,
                previewUrl: tPreview || undefined,
                filesize: tDurSec > 0 ? `~ ${Math.max(2.2, +(tDurSec * 0.04).toFixed(1))} MB` : '~ 7.5 MB'
              });
            });
          }
        }
      }
    }
  } catch (e: any) {
    console.warn('[Server 2 Spotify] Embed fetch notice:', e?.message || e);
  }

  // Fallback to Spotify official public oEmbed if thumbnail or title is still missing
  if (!title || !thumbnail) {
    try {
      const oRes = await fetch(
        `https://open.spotify.com/oembed?url=${encodeURIComponent(canonicalUrl)}`,
        { signal: AbortSignal.timeout(6000) }
      );
      if (oRes.ok) {
        const oData = await oRes.json();
        if (!title && oData?.title) title = cleanText(oData.title);
        if (!thumbnail && oData?.thumbnail_url) thumbnail = oData.thumbnail_url;
      }
    } catch {}
  }

  // Backup playlist extraction via public web HTML <meta name="music:song"> if embed returned 0 tracks
  if ((entityType === 'playlist' || entityType === 'album') && tracks.length === 0) {
    try {
      const pageRes = await fetch(canonicalUrl, {
        headers: { 'User-Agent': DESKTOP_UA, 'Accept-Language': 'en-US,en;q=0.9' },
        signal: AbortSignal.timeout(9000)
      });
      if (pageRes.ok) {
        const html = await pageRes.text();
        const $ = cheerio.load(html);
        if (!title) {
          title = cleanText($('meta[property="og:title"]').attr('content')) || 'Spotify Playlist';
        }
        if (!thumbnail) {
          thumbnail = $('meta[property="og:image"]').attr('content') || '';
        }
        $('meta[name="music:song"]').each((idx, el) => {
          const songUrl = $(el).attr('content') || '';
          const m = songUrl.match(/spotify\.com\/track\/([a-zA-Z0-9]+)/i);
          if (m?.[1]) {
            tracks.push({
              id: m[1],
              title: `Track ${idx + 1}`,
              artist: author || 'Spotify Artist',
              album: title || 'Spotify Playlist',
              genre: 'Pop',
              releaseDate,
              thumbnail,
              duration: 210,
              durationFormatted: '03:30',
              url: `https://open.spotify.com/track/${m[1]}`,
              filesize: '~ 7.5 MB'
            });
          }
        });
      }
    } catch {}
  }

  if (!title && tracks.length === 0) {
    throw new Error('Server 2 Spotify gagal memuat metadata lagu/playlist. Pastikan URL Spotify bersifat publik.');
  }

  return {
    entityType,
    entityId,
    canonicalUrl,
    title: title || 'Spotify Music',
    author: author || 'Spotify Artist',
    album,
    releaseDate,
    thumbnail,
    durationSec,
    previewUrl,
    tracks
  };
}

/**
 * Scrapes Spotify track, playlist, or album using keyless Server 2 engine.
 */
export async function scrapeSpotifyServer2(rawUrl: string): Promise<MediaMetadata> {
  const embed = await fetchSpotifyEmbedData(rawUrl);
  const isCollection =
    embed.entityType === 'playlist' || embed.entityType === 'album';

  let genre = 'Pop';
  let album = embed.album || (isCollection ? embed.title : 'Spotify Single');
  let releaseDate = embed.releaseDate;
  let thumbnail = embed.thumbnail;
  let previewUrl = embed.previewUrl;

  if (!isCollection || embed.tracks.length <= 1) {
    const itunes = await enrichFromItunes(embed.title, embed.author);
    if (itunes.genre) genre = itunes.genre;
    if (itunes.album && (!embed.album || album === 'Spotify Single')) {
      album = itunes.album;
    }
    if (itunes.releaseDate && !releaseDate) releaseDate = itunes.releaseDate;
    if (itunes.artworkUrl && !thumbnail) thumbnail = itunes.artworkUrl;
    if (itunes.previewUrl && !previewUrl) previewUrl = itunes.previewUrl;
  }

  const tracks: AudioTrack[] =
    embed.tracks.length > 0
      ? embed.tracks.map((t) => ({
          ...t,
          thumbnail: t.thumbnail || thumbnail,
          album: t.album || album,
          genre
        }))
      : [
          {
            id: embed.entityId || `sp-${Date.now()}`,
            title: embed.title,
            artist: embed.author,
            album,
            genre,
            releaseDate,
            thumbnail,
            duration: embed.durationSec || 210,
            durationFormatted: formatDuration(embed.durationSec || 210),
            url: embed.canonicalUrl,
            previewUrl: previewUrl || undefined,
            filesize:
              embed.durationSec > 0
                ? `~ ${Math.max(2.2, +(embed.durationSec * 0.04).toFixed(1))} MB`
                : '~ 8.2 MB'
          }
        ];

  // For full-song download, formats always point to canonical Spotify track/entity URL (resolved cleanly on server),
  // NEVER to 30-second previewUrl.
  const fullDownloadTarget = tracks.length === 1 ? tracks[0].url : embed.canonicalUrl;

  const estDurationSec = embed.durationSec || tracks[0]?.duration || 210;
  const estimateMb = (kbps: number) => `~ ${Math.max(1.2, +((estDurationSec * kbps) / 8 / 1024).toFixed(1))} MB`;

  const formats: MediaFormat[] = [
    {
      id: 'sp-s2-mp3-320',
      quality: '320 kbps (MP3 Lagu Penuh • ID3 & Cover)',
      resolution: '320 kbps',
      type: 'audio',
      extension: 'mp3',
      url: fullDownloadTarget,
      isDirect: true,
      filesize: estimateMb(320),
      note: `Server 2 Tanpa API Key • Audio Penuh MP3 + Cover`
    },
    {
      id: 'sp-s2-mp3-256',
      quality: '256 kbps (MP3 Kualitas Tinggi)',
      resolution: '256 kbps',
      type: 'audio',
      extension: 'mp3',
      url: fullDownloadTarget,
      isDirect: true,
      filesize: estimateMb(256),
      note: 'Server 2 Tanpa API Key • Audio Penuh MP3'
    },
    {
      id: 'sp-s2-mp3-128',
      quality: '128 kbps (MP3 Standar • Hemat Kuota)',
      resolution: '128 kbps',
      type: 'audio',
      extension: 'mp3',
      url: fullDownloadTarget,
      isDirect: true,
      filesize: estimateMb(128),
      note: 'Ukuran file lebih ringan'
    }
  ];

  const displayTitle =
    isCollection && tracks.length > 1
      ? embed.title
      : embed.title;

  return {
    id: `spotify-${embed.entityId || Date.now()}`,
    url: embed.canonicalUrl,
    platform: 'spotify',
    title: displayTitle,
    author: embed.author,
    thumbnail: thumbnail || tracks[0]?.thumbnail || '',
    genre,
    album,
    releaseDate,
    previewUrl: previewUrl || tracks[0]?.previewUrl || '',
    duration: embed.durationSec || tracks[0]?.duration || 210,
    durationFormatted: formatDuration(embed.durationSec || tracks[0]?.duration || 210),
    formats,
    tracks,
    isAudioPlaylist: isCollection && tracks.length > 1,
    source: 'Server 2 Spotify Engine (Tanpa API Key)',
    createdAt: new Date().toISOString()
  };
}

function parseYouTubeDurationText(text?: string): number {
  if (!text || typeof text !== 'string') return 0;
  const parts = text.trim().split(':').map((p) => parseInt(p, 10));
  if (parts.some((n) => isNaN(n))) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

interface YTCandidate {
  videoId: string;
  title: string;
  channel: string;
  durationSec: number;
  score: number;
}

async function searchYouTubeAudioCandidates(
  title: string,
  artist: string,
  targetDurationSec: number
): Promise<YTCandidate[]> {
  const cleanTitle = cleanText(title);
  const cleanArtist = cleanText(artist).split(',')[0].trim();
  const baseQuery = [cleanArtist, cleanTitle].filter(Boolean).join(' ').trim();
  if (!baseQuery) return [];

  const queries = [
    `${baseQuery} official audio`,
    baseQuery
  ];

  const unwantedTerms = [
    '1 hour',
    '10 hour',
    'loop',
    'slowed',
    'reverb',
    'nightcore',
    '8d audio',
    'karaoke',
    'instrumental',
    'sped up',
    'bass boosted',
    'react',
    'reaction',
    'tutorial',
    'piano cover',
    'guitar cover'
  ];
  const lowerSpotTitle = `${cleanTitle} ${cleanArtist}`.toLowerCase();
  const titleWords = cleanTitle
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2);
  const artistWords = cleanArtist
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2);

  const seenIds = new Set<string>();
  const allCandidates: YTCandidate[] = [];

  for (const query of queries) {
    try {
      const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
      const res = await fetch(searchUrl, {
        headers: {
          'User-Agent': DESKTOP_UA,
          'Accept-Language': 'en-US,en;q=0.9',
          'Cookie': 'CONSENT=YES+1; SOCS=CAI'
        },
        signal: AbortSignal.timeout(9000)
      });
      if (!res.ok) continue;

      const html = await res.text();
      const marker = 'var ytInitialData = ';
      const idx = html.indexOf(marker);
      if (idx === -1) continue;
      const start = idx + marker.length;
      const end = html.indexOf(';</script>', start);
      if (end === -1) continue;

      const initialData = JSON.parse(html.slice(start, end));

      const walk = (node: any) => {
        if (!node || typeof node !== 'object') return;
        if (node.videoRenderer?.videoId) {
          const v = node.videoRenderer;
          const vid = String(v.videoId);
          if (seenIds.has(vid)) return;
          seenIds.add(vid);

          const vTitle = cleanText(v.title?.runs?.map((r: any) => r?.text || '').join(''));
          const vChannel = cleanText(v.ownerText?.runs?.[0]?.text || v.longBylineText?.runs?.[0]?.text);
          const vDur = parseYouTubeDurationText(v.lengthText?.simpleText);

          // Skip livestreams or ultra-short clips when real song duration > 60s
          if (!vDur || (targetDurationSec > 60 && vDur < 45)) return;
          // Skip multi-hour compilations
          if (vDur > 1500 && (!targetDurationSec || targetDurationSec < 900)) return;

          const lowerVTitle = vTitle.toLowerCase();
          const lowerChannel = vChannel.toLowerCase();
          let score = 0;

          for (const w of titleWords) {
            if (lowerVTitle.includes(w)) score += 12;
          }
          for (const w of artistWords) {
            if (lowerVTitle.includes(w) || lowerChannel.includes(w)) score += 10;
          }

          if (lowerVTitle.includes('official audio') || lowerVTitle.includes('provided to youtube')) {
            score += 22;
          } else if (lowerVTitle.includes('audio') || lowerVTitle.includes('lyrics')) {
            score += 12;
          }
          if (lowerChannel.includes('- topic')) {
            score += 18;
          }
          if (lowerVTitle.includes('official music video') || lowerVTitle.includes('official video')) {
            score += 6;
          }

          for (const bad of unwantedTerms) {
            if (lowerVTitle.includes(bad) && !lowerSpotTitle.includes(bad)) {
              score -= 40;
            }
          }

          if (targetDurationSec > 20) {
            const diff = Math.abs(vDur - targetDurationSec);
            if (diff <= 5) score += 35;
            else if (diff <= 15) score += 22;
            else if (diff <= 30) score += 10;
            else if (diff > 90) score -= 25;
            if (targetDurationSec > 90 && vDur < targetDurationSec * 0.55) {
              score -= 45;
            }
          }

          allCandidates.push({
            videoId: vid,
            title: vTitle,
            channel: vChannel,
            durationSec: vDur,
            score
          });
          return;
        }

        if (Array.isArray(node)) {
          for (const item of node) walk(item);
        } else {
          for (const val of Object.values(node)) {
            if (val && typeof val === 'object') walk(val);
          }
        }
      };

      walk(initialData?.contents);
      if (allCandidates.length >= 5 && allCandidates.some((c) => c.score >= 30)) {
        break;
      }
    } catch {}
  }

  return allCandidates.sort((a, b) => b.score - a.score);
}

/**
 * Resolves any Spotify track URL (or title+artist metadata) into a full-length
 * downloadable MP3 audio URL using keyless Server 2 sources (never 30s previews).
 */
export async function resolveSpotifyFullAudioServer2(
  spotifyUrl: string,
  hints?: {
    title?: string;
    artist?: string;
    album?: string;
    coverUrl?: string;
    duration?: number;
  }
): Promise<SpotifyResolvedAudio> {
  let title = cleanText(hints?.title);
  let artist = cleanText(hints?.artist);
  let album = cleanText(hints?.album);
  let coverUrl = hints?.coverUrl || '';
  let releaseDate = '';
  let durationSec = Number(hints?.duration) || 0;

  // 1. Fetch official Spotify track metadata via embed if title/artist or duration missing
  const { entityId } = parseSpotifyEntity(spotifyUrl);
  if (entityId && (!title || !artist || !durationSec || !coverUrl)) {
    try {
      const embed = await fetchSpotifyEmbedData(spotifyUrl);
      if (!title && embed.title) title = embed.title;
      if (!artist && embed.author) artist = embed.author;
      if (!album && embed.album) album = embed.album;
      if (!coverUrl && embed.thumbnail) coverUrl = embed.thumbnail;
      if (!releaseDate && embed.releaseDate) releaseDate = embed.releaseDate;
      if (!durationSec && embed.durationSec) durationSec = embed.durationSec;
    } catch {}
  }

  if (!title) {
    throw new Error('Server 2 Spotify: Judul lagu tidak ditemukan untuk mencari audio penuh.');
  }

  // 2. Search YouTube candidates matching artist, title, and song duration
  const candidates = await searchYouTubeAudioCandidates(title, artist, durationSec);
  if (candidates.length === 0) {
    throw new Error(`Server 2 Spotify: Sumber lagu penuh untuk "${title}" tidak ditemukan.`);
  }

  // 3. Resolve best matching candidate to direct MP3 CDN via SaveTube multi-CDN
  for (const cand of candidates.slice(0, 3)) {
    try {
      const ytUrl = `https://www.youtube.com/watch?v=${cand.videoId}`;
      const resolved = await resolveYouTubeServer2(ytUrl, 'yt-s2-audio-320', '320 kbps', 'audio');
      if (resolved?.downloadUrl && resolved.downloadUrl.startsWith('http')) {
        return {
          audioUrl: resolved.downloadUrl,
          title: title || 'Spotify Track',
          artist: artist || 'Spotify Artist',
          album: album || 'Spotify Music',
          coverUrl,
          releaseDate
        };
      }
    } catch (e: any) {
      console.warn(`[Server 2 Spotify] Candidate ${cand.videoId} resolve failed:`, e?.message || e);
    }
  }

  throw new Error(`Server 2 Spotify gagal menyiapkan file MP3 penuh untuk "${title}".`);
}
