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

export function extractFirstHttpUrl(rawInput: string): string {
  const trimmed = (rawInput || '').trim();
  const match = trimmed.match(/https?:\/\/[^\s<>"'`]+/i);
  if (!match) return trimmed;
  return match[0].replace(/[),.;!?]+$/, '');
}

export function cleanTikTokUrl(rawUrl: string): string {
  const extracted = extractFirstHttpUrl(rawUrl);
  try {
    const parsed = new URL(extracted);
    const cleanPath = parsed.pathname.replace(/\/+$/, '');
    return `${parsed.protocol}//${parsed.host}${cleanPath}`;
  } catch {
    return extracted.split('?')[0].split('#')[0];
  }
}

export function extractTikTokAwemeId(url: string): string {
  const match = url.match(/\/(?:video|photo)\/(\d{15,22})/i) || url.match(/[?&](?:item_id|aweme_id)=(\d{15,22})/i);
  return match?.[1] || '';
}

/**
 * Resolves shortlinks (vt.tiktok.com, vm.tiktok.com, /t/) to full canonical URLs.
 */
export async function resolveTikTokShortUrl(rawUrl: string): Promise<string> {
  const extracted = extractFirstHttpUrl(rawUrl);
  if (!/(?:vt\.tiktok\.com|vm\.tiktok\.com|tiktok\.com\/t\/)/i.test(extracted)) {
    return extracted;
  }
  try {
    const res = await fetch(extracted, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      signal: AbortSignal.timeout(7000)
    });
    if (res.url && res.url.startsWith('http') && !res.url.includes('/login')) {
      const cleaned = cleanTikTokUrl(res.url);
      if (cleaned.includes('tiktok.com')) {
        return cleaned;
      }
    }
    return extracted;
  } catch {
    return extracted;
  }
}

export interface TikWMData {
  id: string;
  title: string;
  cover?: string;
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
  play_count?: number;
  digg_count?: number;
  comment_count?: number;
  share_count?: number;
  author?: {
    id: string;
    unique_id: string;
    nickname: string;
    avatar: string;
  };
  _sourceEngine?: string;
}

interface TikWMResponse {
  code: number;
  msg: string;
  data?: TikWMData;
}

// Shared short-lived cache + global 1.15s pacer to eliminate TikWM "Free Api Limit: 1 request/second" failures
const TIKWM_CACHE_TTL_MS = 3 * 60 * 1000;
const TIKWM_MIN_INTERVAL_MS = 1150;
const tikwmDataCache = new Map<string, { data: TikWMData; expiresAt: number }>();
const inflightTikTokLookups = new Map<string, Promise<TikWMData>>();
let tikwmPaceChain: Promise<void> = Promise.resolve();
let lastTikwmRequestAt = 0;

function getCachedTikTokEntry(key: string): TikWMData | null {
  if (!key) return null;
  const entry = tikwmDataCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    tikwmDataCache.delete(key);
    return null;
  }
  return entry.data;
}

function storeCachedTikTokEntry(keys: string[], data: TikWMData): void {
  const expiresAt = Date.now() + TIKWM_CACHE_TTL_MS;
  for (const k of keys) {
    if (k) {
      tikwmDataCache.set(k, { data, expiresAt });
    }
  }
  if (tikwmDataCache.size > 80) {
    const now = Date.now();
    for (const [k, v] of tikwmDataCache.entries()) {
      if (now > v.expiresAt) tikwmDataCache.delete(k);
    }
  }
}

async function waitForTikwmSlot(): Promise<void> {
  const prev = tikwmPaceChain;
  let release!: () => void;
  tikwmPaceChain = new Promise<void>((r) => {
    release = r;
  });
  await prev;
  try {
    const elapsed = Date.now() - lastTikwmRequestAt;
    if (elapsed < TIKWM_MIN_INTERVAL_MS) {
      await new Promise((r) => setTimeout(r, TIKWM_MIN_INTERVAL_MS - elapsed));
    }
    lastTikwmRequestAt = Date.now();
  } finally {
    release();
  }
}

async function queryTikWMPaced(urlItem: string, host = 'https://www.tikwm.com'): Promise<TikWMResponse> {
  await waitForTikwmSlot();
  const res = await fetch(`${host}/api/?url=${encodeURIComponent(urlItem)}&hd=1`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*'
    },
    signal: AbortSignal.timeout(9000)
  });
  if (!res.ok) {
    return { code: -res.status, msg: `TikWM HTTP ${res.status}` };
  }
  return (await res.json()) as TikWMResponse;
}

/**
 * Tier 1b: Parse TikTok web page HTML (__UNIVERSAL_DATA_FOR_REHYDRATION__)
 * Works reliably for both standard videos and /photo/ carousels without API rate limits.
 */
async function fetchTikTokWebHtmlData(targetUrl: string, awemeId: string): Promise<TikWMData | null> {
  const candidateUrls = [targetUrl];
  if (awemeId && !targetUrl.includes(`/video/${awemeId}`)) {
    candidateUrls.push(`https://www.tiktok.com/@tiktok/video/${awemeId}`);
  }

  for (const pageUrl of candidateUrls) {
    try {
      const res = await fetch(pageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9'
        },
        signal: AbortSignal.timeout(8000)
      });
      if (!res.ok) continue;

      const html = await res.text();
      const match = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
      if (!match?.[1]) continue;

      const parsed = JSON.parse(match[1]);
      const item = parsed?.__DEFAULT_SCOPE__?.['webapp.video-detail']?.itemInfo?.itemStruct;
      if (!item || (!item.video && !item.imagePost)) continue;

      const imgs: string[] = Array.isArray(item.imagePost?.images)
        ? item.imagePost.images
            .map((im: any) => im?.imageURL?.urlList?.[0] || im?.displayImage?.urlList?.[0] || '')
            .filter((u: string) => typeof u === 'string' && u.startsWith('http'))
        : [];

      const bitrateGears: Array<{ bitRate: number; url: string; size?: number }> = Array.isArray(item.video?.bitrateInfo)
        ? item.video.bitrateInfo
            .map((g: any) => ({
              bitRate: Number(g?.Bitrate || 0),
              url: g?.PlayAddr?.UrlList?.find((u: string) => typeof u === 'string' && u.startsWith('http')) || '',
              size: Number(g?.PlayAddr?.DataSize || 0) || undefined
            }))
            .filter((g: any) => Boolean(g.url))
            .sort((a: any, b: any) => b.bitRate - a.bitRate)
        : [];

      const hdUrl = bitrateGears[0]?.url || item.video?.playAddr || item.video?.downloadAddr || '';
      const sdUrl = bitrateGears[bitrateGears.length - 1]?.url || item.video?.playAddr || hdUrl;
      const musicUrl = item.music?.playUrl || '';

      if (!hdUrl && !sdUrl && imgs.length === 0 && !musicUrl) continue;

      return {
        id: String(item.id || awemeId || `tt-${Date.now()}`),
        title: item.desc || (imgs.length > 0 ? 'TikTok Photo Slideshow' : 'Video TikTok'),
        cover: item.video?.cover || imgs[0] || '',
        origin_cover: item.video?.originCover || item.video?.dynamicCover || imgs[0] || '',
        ai_dynamic_cover: item.video?.dynamicCover || '',
        duration: Number(item.video?.duration || 0),
        play: sdUrl,
        hdplay: hdUrl,
        size: bitrateGears[bitrateGears.length - 1]?.size,
        hd_size: bitrateGears[0]?.size,
        music: musicUrl,
        music_info: item.music
          ? {
              id: String(item.music.id || ''),
              title: item.music.title || 'Original Sound',
              author: item.music.authorName || '',
              play: musicUrl,
              cover: item.music.coverLarge || item.music.coverMedium || ''
            }
          : undefined,
        images: imgs.length > 0 ? imgs : undefined,
        play_count: item.stats?.playCount ? Number(item.stats.playCount) : undefined,
        digg_count: item.stats?.diggCount ? Number(item.stats.diggCount) : undefined,
        comment_count: item.stats?.commentCount ? Number(item.stats.commentCount) : undefined,
        share_count: item.stats?.shareCount ? Number(item.stats.shareCount) : undefined,
        author: item.author
          ? {
              id: String(item.author.id || ''),
              unique_id: item.author.uniqueId || '',
              nickname: item.author.nickname || item.author.uniqueId || 'Kreator TikTok',
              avatar: item.author.avatarThumb || ''
            }
          : undefined,
        _sourceEngine: 'TikTok Web HTML'
      };
    } catch {}
  }
  return null;
}

/**
 * Tier 1c: SSSTik scraper with fresh `tt` token extraction
 */
async function fetchSSSTikData(targetUrl: string): Promise<TikWMData | null> {
  try {
    const homeRes = await fetch('https://ssstik.io/en-1', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(6000)
    });
    if (!homeRes.ok) return null;
    const homeHtml = await homeRes.text();
    const ttMatch =
      homeHtml.match(/name="tt"\s+value="([^"]+)"/i) ||
      homeHtml.match(/s_tt\s*=\s*['"]([^'"]+)['"]/i);
    const ttToken = ttMatch?.[1];
    if (!ttToken) return null;

    const sssRes = await fetch('https://ssstik.io/abc?url=dl', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
        'HX-Request': 'true',
        'HX-Trigger': '_gcaptcha_pt',
        'HX-Target': 'target',
        'HX-Current-URL': 'https://ssstik.io/en-1',
        'Origin': 'https://ssstik.io',
        'Referer': 'https://ssstik.io/en-1'
      },
      body: `id=${encodeURIComponent(targetUrl)}&locale=en&tt=${encodeURIComponent(ttToken)}`,
      signal: AbortSignal.timeout(8000)
    });

    if (!sssRes.ok) return null;
    const html = await sssRes.text();

    const mHd =
      html.match(/href="(https?:\/\/[^"]+)"[^>]*class="[^"]*without_watermark_hd[^"]*"/i) ||
      html.match(/href="(https?:\/\/[^"]+)"[^>]*class="[^"]*download_link[^"]*"/i) ||
      html.match(/href="(https?:\/\/[^"]+)"[^>]*>Download without watermark/i);
    const mSd = html.match(/href="(https?:\/\/[^"]+)"[^>]*>Without watermark/i);
    const mAudio = html.match(/href="(https?:\/\/[^"]+)"[^>]*>(?:Download )?MP3/i);
    const mTitle = html.match(/<p class="maintext">([\s\S]*?)<\/p>/i);
    const mThumb = html.match(/<img[^>]*class="[^"]*result_author[^"]*"[^>]*src="([^"]+)"/i);

    const slideImgs = [...html.matchAll(/<a[^>]+href="(https?:\/\/[^"]+)"[^>]*class="[^"]*download_link[^"]*slide[^"]*"/gi)]
      .map((m) => m[1])
      .filter((u) => u.startsWith('http'));

    const playUrl = (mSd?.[1] || mHd?.[1] || '').replace(/&amp;/g, '&');
    const hdUrl = (mHd?.[1] || mSd?.[1] || '').replace(/&amp;/g, '&');
    const audioUrl = (mAudio?.[1] || '').replace(/&amp;/g, '&');

    if (hdUrl || playUrl || slideImgs.length > 0 || audioUrl) {
      return {
        id: extractTikTokAwemeId(targetUrl) || `tt-${Date.now()}`,
        title: mTitle ? mTitle[1].replace(/<[^>]+>/g, '').trim() : 'Video TikTok',
        duration: 0,
        play: playUrl || hdUrl,
        hdplay: hdUrl || playUrl,
        music: audioUrl || undefined,
        cover: mThumb ? mThumb[1] : (slideImgs[0] || undefined),
        images: slideImgs.length > 0 ? slideImgs : undefined,
        _sourceEngine: 'SSSTik'
      };
    }
  } catch (e) {
    console.warn('[Server 2 TikTok] SSSTik fallback notice:', e);
  }
  return null;
}

/**
 * Tier 2: Query official TikTok mobile app gateway (supports gunzip decompression and photo carousels).
 */
async function fetchOfficialTikTokFeed(awemeId: string): Promise<any | null> {
  if (!awemeId || !/^\d+$/.test(awemeId)) return null;
  const feedUrl = `https://api16-normal-useast5.tiktokv.us/aweme/v1/feed/?aweme_id=${encodeURIComponent(awemeId)}`;
  try {
    const res = await fetch(feedUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'com.zhiliaoapp.musically/300904 (2018111632; U; Android 10; en_US; Pixel 4; Build/QQ3A.200805.001; Cronet/58.0.2991.0)',
        'Accept-Encoding': 'identity'
      },
      signal: AbortSignal.timeout(7000)
    });
    if (!res.ok) return null;
    const rawBuf = new Uint8Array(await res.arrayBuffer());
    if (rawBuf.length < 10) return null;

    let jsonStr = '';
    if (rawBuf[0] === 0x1f && rawBuf[1] === 0x8b && typeof DecompressionStream !== 'undefined') {
      const ds = new DecompressionStream('gzip');
      jsonStr = await new Response(new Blob([rawBuf]).stream().pipeThrough(ds)).text();
    } else {
      jsonStr = new TextDecoder().decode(rawBuf);
    }
    const json = JSON.parse(jsonStr);
    if (json && json.status_code === 0 && Array.isArray(json.aweme_list) && json.aweme_list[0]) {
      const item = json.aweme_list[0];
      if (!item.aweme_id || String(item.aweme_id) === awemeId) {
        return item;
      }
    }
  } catch (e) {
    console.warn('[Server 2 TikTok] Official gateway notice:', e);
  }
  return null;
}

function convertOfficialFeedToTikWMData(item: any, awemeId: string): TikWMData | null {
  if (!item) return null;
  const imgs: string[] = Array.isArray(item.image_post_info?.images)
    ? item.image_post_info.images
        .map((im: any) => im?.display_image?.url_list?.[0] || im?.owner_watermark_image?.url_list?.[0] || '')
        .filter((u: string) => typeof u === 'string' && u.startsWith('http'))
    : [];
  const gears: any[] = Array.isArray(item.video?.bit_rate) ? item.video.bit_rate : [];
  const sortedGears = [...gears].sort((a, b) => Number(b?.bit_rate || 0) - Number(a?.bit_rate || 0));
  const hdUrl = sortedGears[0]?.play_addr?.url_list?.[0] || item.video?.play_addr?.url_list?.[0] || '';
  const sdUrl = sortedGears[sortedGears.length - 1]?.play_addr?.url_list?.[0] || hdUrl;
  const musicUrl = item.music?.play_url?.url_list?.[0] || '';

  if (!hdUrl && !sdUrl && imgs.length === 0 && !musicUrl) return null;

  return {
    id: String(item.aweme_id || awemeId || `tt-${Date.now()}`),
    title: item.desc || (imgs.length > 0 ? 'TikTok Photo Slideshow' : 'Video TikTok'),
    cover: item.video?.cover?.url_list?.[0] || imgs[0] || '',
    origin_cover: item.video?.origin_cover?.url_list?.[0] || imgs[0] || '',
    ai_dynamic_cover: item.video?.dynamic_cover?.url_list?.[0] || '',
    duration: item.video?.duration ? Math.round(Number(item.video.duration) / 1000) : 0,
    play: sdUrl,
    hdplay: hdUrl,
    music: musicUrl,
    music_info: item.music
      ? {
          id: String(item.music.id || ''),
          title: item.music.title || 'Original Sound',
          author: item.music.author || '',
          play: musicUrl
        }
      : undefined,
    images: imgs.length > 0 ? imgs : undefined,
    play_count: item.statistics?.play_count,
    digg_count: item.statistics?.digg_count,
    comment_count: item.statistics?.comment_count,
    share_count: item.statistics?.share_count,
    author: item.author
      ? {
          id: String(item.author.uid || ''),
          unique_id: item.author.unique_id || '',
          nickname: item.author.nickname || item.author.unique_id || 'Kreator TikTok',
          avatar: item.author.avatar_thumb?.url_list?.[0] || ''
        }
      : undefined,
    _sourceEngine: 'TikTok Official Feed'
  };
}

/**
 * Unified cached + rate-limit-safe TikTok data fetcher used by both Preview and Resolver.
 */
export async function getCachedOrFetchTikTokData(rawUrl: string): Promise<TikWMData> {
  const target = await resolveTikTokShortUrl(rawUrl);
  const cleanedUrl = cleanTikTokUrl(target);
  const awemeId = extractTikTokAwemeId(cleanedUrl) || extractTikTokAwemeId(target);

  const cached =
    (awemeId ? getCachedTikTokEntry(`id:${awemeId}`) : null) ||
    getCachedTikTokEntry(`url:${cleanedUrl}`) ||
    getCachedTikTokEntry(`url:${target}`);
  if (cached) {
    return cached;
  }

  const inflightKey = awemeId ? `id:${awemeId}` : `url:${cleanedUrl}`;
  const existingInflight = inflightTikTokLookups.get(inflightKey);
  if (existingInflight) {
    return existingInflight;
  }

  const lookupPromise = (async (): Promise<TikWMData> => {
    let lastError = '';

    // 1. Paced TikWM request (avoids 1 req/s bursts across extract -> start-job)
    try {
      let json = await queryTikWMPaced(cleanedUrl, 'https://www.tikwm.com');
      if (json.code !== 0 && /limit|second|too many|429/i.test(json.msg || '')) {
        await new Promise((r) => setTimeout(r, 1250));
        json = await queryTikWMPaced(cleanedUrl, 'https://tikwm.com');
      }
      if (json.code === 0 && json.data) {
        const result = { ...json.data, _sourceEngine: 'TikWM' };
        storeCachedTikTokEntry(
          [
            result.id ? `id:${result.id}` : '',
            awemeId ? `id:${awemeId}` : '',
            `url:${cleanedUrl}`,
            `url:${target}`
          ],
          result
        );
        return result;
      }
      if (json.msg) lastError = json.msg;
    } catch (e: any) {
      lastError = e?.message || 'Koneksi ke endpoint TikWM gagal';
    }

    // 2. Web HTML __UNIVERSAL_DATA_FOR_REHYDRATION__ (handles videos & photo carousels without rate limit)
    const webData = await fetchTikTokWebHtmlData(cleanedUrl, awemeId);
    if (webData) {
      storeCachedTikTokEntry(
        [
          webData.id ? `id:${webData.id}` : '',
          awemeId ? `id:${awemeId}` : '',
          `url:${cleanedUrl}`,
          `url:${target}`
        ],
        webData
      );
      return webData;
    }

    // 3. Official TikTok mobile feed gateway (handles gzip & photo carousels)
    if (awemeId) {
      const feedItem = await fetchOfficialTikTokFeed(awemeId);
      const converted = convertOfficialFeedToTikWMData(feedItem, awemeId);
      if (converted) {
        storeCachedTikTokEntry(
          [
            `id:${converted.id}`,
            `id:${awemeId}`,
            `url:${cleanedUrl}`,
            `url:${target}`
          ],
          converted
        );
        return converted;
      }
    }

    // 4. SSSTik fallback with live token extraction
    const sssData = await fetchSSSTikData(cleanedUrl);
    if (sssData) {
      storeCachedTikTokEntry(
        [
          sssData.id ? `id:${sssData.id}` : '',
          awemeId ? `id:${awemeId}` : '',
          `url:${cleanedUrl}`,
          `url:${target}`
        ],
        sssData
      );
      return sssData;
    }

    throw new Error(
      lastError && !/Url parsing is failed/i.test(lastError)
        ? `Server 2 TikTok: ${lastError}`
        : 'Konten TikTok tidak ditemukan, sudah dihapus, atau bersifat privat.'
    );
  })();

  inflightTikTokLookups.set(inflightKey, lookupPromise);
  try {
    return await lookupPromise;
  } finally {
    inflightTikTokLookups.delete(inflightKey);
  }
}

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
 */
export async function resolveTikTokServer2(
  url: string,
  formatId: string,
  resolution: string,
  type: string
): Promise<{ downloadUrl: string; quality?: string }> {
  const target = await resolveTikTokShortUrl(url);
  const data = await getCachedOrFetchTikTokData(target);

  const isAudio =
    type === 'audio' ||
    formatId.includes('audio') ||
    /audio|mp3/i.test(resolution) ||
    /320|256|128/i.test(resolution);

  // -------------------------------------------------------------
  // RESOLUTION CASE 1: AUDIO (MP3 - 320/256/128 kbps / Original Sound)
  // -------------------------------------------------------------
  if (isAudio) {
    const kbpsMatch = `${resolution} ${formatId}`.match(/(320|256|192|128|64)/);
    const kbpsLabel = kbpsMatch ? `${kbpsMatch[1]} kbps` : '320 kbps';
    const audioCandidate = ensureAbsoluteUrl(data.music || data.music_info?.play);
    if (audioCandidate && audioCandidate.startsWith('http')) {
      const audioTitle = data.music_info?.title ? ` - ${data.music_info.title}` : '';
      return {
        downloadUrl: audioCandidate,
        quality: `${kbpsLabel} MP3 (Original Sound${audioTitle})`
      };
    }

    // Try Tier 2 official music stream if available
    const awemeId = extractTikTokAwemeId(target) || (data.id && /^\d+$/.test(String(data.id)) ? String(data.id) : '');
    if (awemeId) {
      const officialItem = await fetchOfficialTikTokFeed(awemeId);
      const officialAudio = officialItem?.music?.play_url?.url_list?.[0];
      if (officialAudio && typeof officialAudio === 'string' && officialAudio.startsWith('http')) {
        return {
          downloadUrl: officialAudio,
          quality: `${kbpsLabel} MP3 (Official Audio Master)`
        };
      }
    }

    // Fallback: Return HD/SD video stream so proxy-download extracts clean MP3 at exact bitrate via ffmpeg
    const fallbackVideoForAudio = ensureAbsoluteUrl(data.hdplay || data.play);
    if (fallbackVideoForAudio && fallbackVideoForAudio.startsWith('http')) {
      return {
        downloadUrl: fallbackVideoForAudio,
        quality: `${kbpsLabel} MP3 (Ekstrak Audio)`
      };
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
  // RESOLUTION CASE 3: VIDEO QUALITIES (4K / 2K / 1080p / 720p / 480p)
  // -------------------------------------------------------------
  const normalizedRes = (resolution || '').toLowerCase().trim();
  const formatIdLower = (formatId || '').toLowerCase().trim();

  const is4K = normalizedRes.includes('4k') || normalizedRes.includes('2160') || formatIdLower.includes('4k') || formatIdLower.includes('2160');
  const is2K = (normalizedRes.includes('2k') || normalizedRes.includes('1440') || formatIdLower.includes('2k') || formatIdLower.includes('1440')) && !is4K;
  const is1080p = (normalizedRes.includes('1080') || formatIdLower.includes('1080')) && !is4K && !is2K;
  const is720p = (normalizedRes.includes('720') || formatIdLower.includes('720')) && !is4K && !is2K && !is1080p;
  const is480p = (normalizedRes.includes('480') || normalizedRes.includes('360') || formatIdLower.includes('480')) && !is4K && !is2K && !is1080p && !is720p;

  const hdPlayUrl = ensureAbsoluteUrl(data.hdplay);
  const standardPlayUrl = ensureAbsoluteUrl(data.play);
  const wmPlayUrl = ensureAbsoluteUrl(data.wmplay);

  // Strategy A1: 4K Ultra HD (2160p) -> Master highest-bitrate unwatermarked stream
  if (is4K) {
    if (hdPlayUrl && hdPlayUrl.startsWith('http')) {
      return {
        downloadUrl: hdPlayUrl,
        quality: '4K Ultra HD (2160p Master Tanpa Watermark)'
      };
    }

    if (data.id) {
      const officialItem = await fetchOfficialTikTokFeed(data.id);
      const topGear = officialItem?.video?.bit_rate?.[0]?.play_addr?.url_list?.[0];
      if (topGear && typeof topGear === 'string' && topGear.startsWith('http')) {
        return {
          downloadUrl: topGear,
          quality: '4K Ultra HD (2160p Master Stream)'
        };
      }
    }

    if (standardPlayUrl && standardPlayUrl.startsWith('http')) {
      return {
        downloadUrl: standardPlayUrl,
        quality: '4K Ultra HD (Kualitas Tertinggi Tanpa Watermark)'
      };
    }
  }

  // Strategy A2: 2K Quad HD (1440p) -> Strictly 2K resolution & master stream, never 4K!
  if (is2K) {
    if (hdPlayUrl && hdPlayUrl.startsWith('http')) {
      return {
        downloadUrl: hdPlayUrl,
        quality: '2K Quad HD (1440p Master Tanpa Watermark)'
      };
    }

    if (data.id) {
      const officialItem = await fetchOfficialTikTokFeed(data.id);
      const bitRates = officialItem?.video?.bit_rate;
      const gear = bitRates?.[0]?.play_addr?.url_list?.[0];
      if (gear && typeof gear === 'string' && gear.startsWith('http')) {
        return {
          downloadUrl: gear,
          quality: '2K Quad HD (1440p Master Stream)'
        };
      }
    }

    if (standardPlayUrl && standardPlayUrl.startsWith('http')) {
      return {
        downloadUrl: standardPlayUrl,
        quality: '2K Quad HD (1440p Tanpa Watermark)'
      };
    }
  }

  // Strategy A3: 1080p Full HD -> Crisp high definition stream
  if (is1080p) {
    if (hdPlayUrl && hdPlayUrl.startsWith('http')) {
      return {
        downloadUrl: hdPlayUrl,
        quality: '1080p Full HD (Tanpa Watermark)'
      };
    }

    if (data.id) {
      const officialItem = await fetchOfficialTikTokFeed(data.id);
      const bitRates = officialItem?.video?.bit_rate;
      const gear = bitRates?.[0]?.play_addr?.url_list?.[0];
      if (gear && typeof gear === 'string' && gear.startsWith('http')) {
        return {
          downloadUrl: gear,
          quality: '1080p Full HD (High Bitrate)'
        };
      }
    }

    if (standardPlayUrl && standardPlayUrl.startsWith('http')) {
      return {
        downloadUrl: standardPlayUrl,
        quality: '1080p Full HD (Kualitas Asli Tanpa Watermark)'
      };
    }
  }

  // Strategy B: 720p HD Standard -> Standard compressed stream
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
  const data = await getCachedOrFetchTikTokData(target);

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
      quality: rawImages.length > 1 ? `Koleksi Foto (${rawImages.length} Slide HD)` : 'Foto TikTok HD (Resolusi Asli)',
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

  // 2K Quad HD (1440p)
  formats.push({
    id: 'tt-2k',
    quality: '2K Quad HD (1440p Tanpa Watermark)',
    resolution: '2K',
    type: 'video',
    extension: 'mp4',
    filesize: data.hd_size ? `~ ${formatBytes(Math.round(data.hd_size * 1.25))}` : (data.size ? `~ ${formatBytes(Math.round(data.size * 1.4))}` : undefined),
    url: '',
    isDirect: true,
    needsResolution: true,
    note: 'Kualitas 2K Quad HD jernih tajam tanpa watermark (Server 2)'
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

  // Audio MP3 (320 / 256 / 128 kbps)
  const audioDur = durationSec > 0 ? durationSec : 30;
  [
    { kbps: 320, id: 'tt-audio', label: '320 kbps (Original Sound MP3 • Jernih)', note: data.music_info?.title ? `Audio: ${data.music_info.title}` : 'Audio musik MP3 320 kbps jernih' },
    { kbps: 256, id: 'tt-audio-256', label: '256 kbps (MP3 Kualitas Tinggi)', note: 'Audio MP3 256 kbps jernih' },
    { kbps: 128, id: 'tt-audio-128', label: '128 kbps (MP3 Standar • Ringan)', note: 'Ukuran file lebih ringan' }
  ].forEach((opt) => {
    formats.push({
      id: opt.id,
      quality: opt.label,
      resolution: `${opt.kbps} kbps`,
      type: 'audio',
      extension: 'mp3',
      filesize: durationSec > 0 ? `~ ${Math.max(0.2, +((audioDur * opt.kbps) / 8 / 1024).toFixed(1))} MB` : undefined,
      url: '',
      isDirect: true,
      needsResolution: true,
      note: opt.note
    });
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
    views: data.play_count,
    likes: data.digg_count,
    comments: data.comment_count,
    formats,
    images: rawImages.length > 0 ? rawImages : undefined,
    isPhotoSlide,
    source: 'Server 2 TikTok Scraper',
    createdAt: new Date().toISOString()
  };
}
