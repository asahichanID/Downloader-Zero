/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as cheerio from 'cheerio';
import type { MediaMetadata, MediaFormat } from '../../types/index.ts';
import { isSafePublicUrl } from '../security.ts';

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

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/');
}

function decodeEscapedJsonString(raw: string): string {
  try {
    return JSON.parse(`"${raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
  } catch {
    return raw
      .replace(/\\u0025/gi, '%')
      .replace(/\\u0026/gi, '&')
      .replace(/\\u003C/gi, '<')
      .replace(/\\u003E/gi, '>')
      .replace(/\\u002F/gi, '/')
      .replace(/\\\//g, '/')
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"');
  }
}

function cleanFacebookMediaUrl(raw?: string): string {
  if (!raw || typeof raw !== 'string') return '';
  let cleaned = decodeHtmlEntities(raw.trim());
  if (cleaned.includes('\\/') || cleaned.includes('\\u00')) {
    cleaned = cleaned
      .replace(/\\u0025/gi, '%')
      .replace(/\\u0026/gi, '&')
      .replace(/\\u003C/gi, '<')
      .replace(/\\u003E/gi, '>')
      .replace(/\\u002F/gi, '/')
      .replace(/\\\//g, '/');
  }
  if (cleaned.startsWith('//')) cleaned = `https:${cleaned}`;
  if (!/^https?:\/\//i.test(cleaned)) return '';
  return cleaned;
}

function parseIsoDuration(iso?: string): number {
  if (!iso) return 0;
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?([\d.]+)S/i);
  if (!match) return 0;
  const hrs = match[1] ? Number(match[1]) : 0;
  const mins = match[2] ? Number(match[2]) : 0;
  const secs = match[3] ? Number(match[3]) : 0;
  const total = hrs * 3600 + mins * 60 + secs;
  return !isNaN(total) && total > 0 ? total : 0;
}

function extractFacebookVideoId(url: string): string {
  const m =
    url.match(/[?&]v=(\d{6,})/) ||
    url.match(/\/(?:reel|reels)\/(\d{6,})/i) ||
    url.match(/\/videos\/(?:[^/]+\/)?(\d{6,})/i) ||
    url.match(/\/watch\/live\/?\?v=(\d{6,})/i) ||
    url.match(/story_fbid=(\d{6,})/i) ||
    url.match(/\/(?:share\/v|share\/r)\/([A-Za-z0-9_-]+)/i);
  return m?.[1] || '';
}

function normalizeFacebookCanonicalUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl.trim());
    if (/^(?:m|mobile|web|mbasic|touch|l)\.facebook\.com$/i.test(u.hostname)) {
      u.hostname = 'www.facebook.com';
    } else if (/^facebook\.com$/i.test(u.hostname)) {
      u.hostname = 'www.facebook.com';
    }
    return u.toString();
  } catch {
    return rawUrl.trim();
  }
}

async function resolveFacebookUrl(rawUrl: string): Promise<string> {
  const trimmed = rawUrl.trim();
  const safety = isSafePublicUrl(trimmed);
  if (!safety.safe) {
    throw new Error(safety.reason || 'Tautan Facebook tidak valid.');
  }

  const needsFollow = /(?:fb\.watch|fb\.com|l\.facebook\.com|facebook\.com\/share)/i.test(trimmed);
  if (!needsFollow) {
    return normalizeFacebookCanonicalUrl(trimmed);
  }

  try {
    const res = await fetch(trimmed, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Dest': 'document'
      },
      signal: AbortSignal.timeout(9000)
    });
    if (res.url && res.url.startsWith('http') && isSafePublicUrl(res.url).safe) {
      return normalizeFacebookCanonicalUrl(res.url);
    }
  } catch {}
  return normalizeFacebookCanonicalUrl(trimmed);
}

interface EfgHints {
  vencodeTag?: string;
  heightHint?: number;
  widthHint?: number;
  durationSec?: number;
  bitrateBps?: number;
  tagHint?: string;
}

function parseFbUrlHints(mediaUrl: string): EfgHints {
  const out: EfgHints = {};
  try {
    const u = new URL(mediaUrl);
    const bitrateParam = Number(u.searchParams.get('bitrate') || 0);
    if (bitrateParam > 0 && Number.isFinite(bitrateParam)) {
      out.bitrateBps = bitrateParam;
    }
    const tagParam = u.searchParams.get('tag') || '';
    if (tagParam) out.tagHint = tagParam.toLowerCase();

    const efgRaw = u.searchParams.get('efg');
    if (efgRaw) {
      const b64 = efgRaw.replace(/-/g, '+').replace(/_/g, '/');
      const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
      const decoded = Buffer.from(padded, 'base64').toString('utf8');
      const parsed = JSON.parse(decoded);
      if (parsed && typeof parsed === 'object') {
        if (typeof parsed.duration_s === 'number' && parsed.duration_s > 0) {
          out.durationSec = parsed.duration_s;
        }
        if (typeof parsed.vencode_tag === 'string') {
          out.vencodeTag = parsed.vencode_tag;
          // Examples:
          // xpv_progressive.FACEBOOK..C3.1280.hd
          // xpv_progressive.FACEBOOK..C3.400.sd
          // dash_v2_gen_vp9-baseline_1920x1080
          const dimM = parsed.vencode_tag.match(/(\d{3,4})x(\d{3,4})/i);
          if (dimM) {
            out.widthHint = Number(dimM[1]);
            out.heightHint = Number(dimM[2]);
          } else {
            const cM = parsed.vencode_tag.match(/\.C\d+\.(\d{3,4})\b/i);
            if (cM) {
              const dimNum = Number(cM[1]);
              // Facebook C3 tag number indicates short/long progressive target pixel size
              if (dimNum >= 2160) out.heightHint = 2160;
              else if (dimNum >= 1440) out.heightHint = 1440;
              else if (dimNum >= 1280) out.heightHint = 720; // 1280px wide -> 720p HD
              else if (dimNum >= 1080) out.heightHint = 1080;
              else if (dimNum >= 840) out.heightHint = 480;
              else if (dimNum >= 640) out.heightHint = 480;
              else if (dimNum >= 360) out.heightHint = 360;
              else out.heightHint = 240;
            }
          }
        }
      }
    }
  } catch {}
  return out;
}

function mapQualityToTier(label: string, width: number, height: number): {
  resolution: string;
  rank: number;
  tierName: string;
} {
  const numMatch = label.match(/(\d{3,4})p/i);
  const shortDim = width > 0 && height > 0 ? Math.min(width, height) : (height || width || 0);
  const qNum = numMatch ? Number(numMatch[1]) : shortDim;

  if (qNum >= 2160) return { resolution: '4K', rank: 2160, tierName: '4K Ultra HD' };
  if (qNum >= 1440) return { resolution: '2K', rank: 1440, tierName: '2K Quad HD' };
  if (qNum >= 1080) return { resolution: '1080p', rank: 1080, tierName: '1080p Full HD' };
  if (qNum >= 720) return { resolution: '720p', rank: 720, tierName: '720p HD' };
  if (qNum >= 640) return { resolution: '640p', rank: 640, tierName: '640p HD' };
  if (qNum >= 540) return { resolution: '540p', rank: 540, tierName: '540p qHD' };
  if (qNum >= 480) return { resolution: '480p', rank: 480, tierName: '480p SD' };
  if (qNum >= 360) return { resolution: '360p', rank: 360, tierName: '360p SD' };
  if (qNum >= 240) return { resolution: '240p', rank: 240, tierName: '240p Ringan' };
  if (/hd/i.test(label)) return { resolution: '720p', rank: 720, tierName: '720p HD' };
  if (/sd/i.test(label)) return { resolution: '360p', rank: 360, tierName: '360p SD' };
  return { resolution: 'HD', rank: 700, tierName: 'Video Asli' };
}

interface CollectedFbStream {
  url: string;
  resolution: string;
  rank: number;
  tierName: string;
  width: number;
  height: number;
  bandwidth: number;
  contentLength: number;
  isMuxed: boolean;
  dashAudioUrl?: string;
}

interface DashParseResult {
  durationSec: number;
  videoReps: CollectedFbStream[];
  audioUrl: string;
  audioBytes: number;
}

function parseDashManifest(manifestXml: string): DashParseResult {
  const durationMatch = manifestXml.match(/mediaPresentationDuration="([^"]+)"/i);
  const durationSec = parseIsoDuration(durationMatch?.[1]);

  let bestAudioUrl = '';
  let bestAudioBandwidth = -1;
  let bestAudioBytes = 0;
  const videoReps: CollectedFbStream[] = [];

  const repMatches = manifestXml.matchAll(/<Representation([^>]*)>[\s\S]*?<BaseURL>([^<]+)<\/BaseURL>/gi);
  for (const m of repMatches) {
    const attrs = m[1] || '';
    const baseUrl = cleanFacebookMediaUrl(m[2]);
    if (!baseUrl) continue;

    const mime = (attrs.match(/mimeType="([^"]+)"/i)?.[1] || '').toLowerCase();
    const width = Number(attrs.match(/\bwidth="(\d+)"/i)?.[1] || 0);
    const height = Number(attrs.match(/\bheight="(\d+)"/i)?.[1] || 0);
    const bandwidth = Number(attrs.match(/\bbandwidth="(\d+)"/i)?.[1] || 0);
    const contentLength = Number(attrs.match(/FBContentLength="(\d+)"/i)?.[1] || 0);
    const qualityLabel = attrs.match(/FBQualityLabel="([^"]+)"/i)?.[1] || '';
    const codecs = (attrs.match(/codecs="([^"]+)"/i)?.[1] || '').toLowerCase();

    const isAudio = mime.startsWith('audio/') || (!width && !height && (mime.includes('mp4a') || codecs.includes('mp4a')));
    if (isAudio) {
      if (bandwidth > bestAudioBandwidth) {
        bestAudioBandwidth = bandwidth;
        bestAudioUrl = baseUrl;
        bestAudioBytes = contentLength;
      }
      continue;
    }

    const isVideo = mime.startsWith('video/') || (width > 0 && height > 0);
    if (!isVideo) continue;

    const tier = mapQualityToTier(qualityLabel, width, height);
    const hasEmbeddedAudio = codecs.includes('mp4a');
    videoReps.push({
      url: baseUrl,
      resolution: tier.resolution,
      rank: tier.rank,
      tierName: tier.tierName,
      width,
      height,
      bandwidth,
      contentLength,
      isMuxed: hasEmbeddedAudio
    });
  }

  for (const rep of videoReps) {
    if (!rep.isMuxed && bestAudioUrl) {
      rep.dashAudioUrl = bestAudioUrl;
    }
  }

  return {
    durationSec,
    videoReps,
    audioUrl: bestAudioUrl,
    audioBytes: bestAudioBytes
  };
}

interface ParsedFacebookPage {
  streams: CollectedFbStream[];
  audioUrl: string;
  audioBytes: number;
  hasNoAudioFlag: boolean;
  title: string;
  author: string;
  authorUrl?: string;
  thumbnail: string;
  durationSec: number;
  views?: string;
  likes?: string;
  comments?: string;
}

function normalizeFbTitle(rawTitle: string): {
  cleanTitle: string;
  views?: string;
  likes?: string;
} {
  let text = decodeHtmlEntities(rawTitle || '').replace(/\s+/g, ' ').trim();
  let views: string | undefined;
  let likes: string | undefined;

  // Example og:title: "2.8M views · 1.3K reactions | How to share with just friends. | Facebook"
  const ogMetricMatch = text.match(
    /^([\d.,]+\s*[KMB]?\s*views?)(?:\s*[·•]\s*([\d.,]+\s*[KMB]?\s*(?:reactions?|likes?)))?\s*\|\s*(.+)$/i
  );
  if (ogMetricMatch) {
    views = ogMetricMatch[1].replace(/\s*views?/i, '').trim();
    if (ogMetricMatch[2]) {
      likes = ogMetricMatch[2].replace(/\s*(?:reactions?|likes?)/i, '').trim();
    }
    text = ogMetricMatch[3].trim();
  }

  text = text
    .replace(/\s*\|\s*Facebook\s*$/i, '')
    .replace(/\s*-\s*Watch\s*$/i, '')
    .replace(/^Facebook$/i, '')
    .trim();

  return { cleanTitle: text, views, likes };
}

function isUsefulThumbnailUrl(u: string): boolean {
  if (!u || !/^https?:\/\//i.test(u)) return false;
  if (/\/(?:s|p)(?:24x24|32x32|40x40|48x48|50x50|60x60)\//i.test(u)) return false;
  if (/safe_image\.php|emoji|rsrc\.php/i.test(u)) return false;
  return true;
}

function inspectJsonObjectForFbVideo(
  root: any,
  acc: ParsedFacebookPage,
  dashXmlSet: Set<string>,
  dashManifestUrls: Set<string>
) {
  const stack: any[] = [root];
  const seen = new Set<any>();

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || typeof node !== 'object' || seen.has(node)) continue;
    seen.add(node);

    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        if (node[i] && typeof node[i] === 'object') stack.push(node[i]);
      }
      continue;
    }

    // Audio availability flag
    if (typeof node.audio_availability === 'string' && node.audio_availability.toUpperCase() === 'NONE') {
      acc.hasNoAudioFlag = true;
    }

    // Duration
    const durMs = Number(node.playable_duration_in_ms || node.length_in_ms || 0);
    if (durMs > 0 && Number.isFinite(durMs) && !acc.durationSec) {
      acc.durationSec = Math.round(durMs / 1000);
    }

    // Metadata (title, owner/author, counts, thumbnail)
    if (!acc.author && node.owner && typeof node.owner === 'object' && typeof node.owner.name === 'string') {
      acc.author = node.owner.name.trim();
      if (typeof node.owner.url === 'string' && node.owner.url.startsWith('http')) {
        acc.authorUrl = node.owner.url;
      }
    }
    if (!acc.title) {
      const cap =
        (typeof node.message?.text === 'string' && node.message.text) ||
        (typeof node.savable_description?.text === 'string' && node.savable_description.text) ||
        (typeof node.title?.text === 'string' && node.title.text);
      if (cap && cap.trim() && cap.trim().length > 1) {
        acc.title = cap.trim().slice(0, 140);
      }
    }
    if (!acc.thumbnail) {
      const thumbUri =
        node.preferred_thumbnail?.image?.uri ||
        node.thumbnailImage?.uri ||
        node.first_frame_thumbnail;
      if (typeof thumbUri === 'string' && isUsefulThumbnailUrl(cleanFacebookMediaUrl(thumbUri))) {
        acc.thumbnail = cleanFacebookMediaUrl(thumbUri);
      }
    }
    if (!acc.views && typeof node.video_view_count === 'number' && node.video_view_count > 0) {
      acc.views = String(node.video_view_count);
    }
    if (!acc.likes && typeof node.reaction_count?.count === 'number') {
      acc.likes = String(node.reaction_count.count);
    }
    if (!acc.comments && typeof node.total_comment_count === 'number') {
      acc.comments = String(node.total_comment_count);
    }

    const masterW = Number(node.width || node.original_width || 0);
    const masterH = Number(node.height || node.original_height || 0);

    // 1. Modern videoDeliveryResponseResult.progressive_urls
    if (Array.isArray(node.progressive_urls)) {
      for (const item of node.progressive_urls) {
        const pUrl = cleanFacebookMediaUrl(item?.progressive_url || item?.url);
        if (!pUrl) continue;
        const metaQ = String(item?.metadata?.quality || item?.quality || '').toLowerCase();
        const hints = parseFbUrlHints(pUrl);
        if (hints.durationSec && !acc.durationSec) acc.durationSec = hints.durationSec;

        let inferredResLabel = '';
        if (metaQ.includes('hd') || hints.tagHint === 'hd') inferredResLabel = '720p';
        else if (metaQ.includes('sd') || hints.tagHint === 'sd') inferredResLabel = '360p';

        const hVal = hints.heightHint || (inferredResLabel === '720p' ? 720 : inferredResLabel === '360p' ? 360 : masterH);
        const wVal = hints.widthHint || masterW;
        const tier = mapQualityToTier(inferredResLabel || metaQ, wVal, hVal);
        acc.streams.push({
          url: pUrl,
          resolution: tier.resolution,
          rank: tier.rank,
          tierName: tier.tierName,
          width: wVal,
          height: hVal,
          bandwidth: hints.bitrateBps || (tier.rank >= 720 ? 1800000 : 600000),
          contentLength: 0,
          isMuxed: true
        });
      }
    }

    // 2. Modern dash_manifests array
    if (Array.isArray(node.dash_manifests)) {
      for (const dm of node.dash_manifests) {
        if (typeof dm?.manifest_xml === 'string' && dm.manifest_xml.includes('<MPD')) {
          dashXmlSet.add(dm.manifest_xml);
        }
        const dmUrl = cleanFacebookMediaUrl(dm?.manifest_url);
        if (dmUrl) dashManifestUrls.add(dmUrl);
      }
    }

    // 3. Inline DASH manifest fields
    for (const xmlKey of ['dash_manifest_xml_string', 'dash_manifest', 'video_dash_manifest']) {
      if (typeof node[xmlKey] === 'string' && node[xmlKey].includes('<MPD')) {
        dashXmlSet.add(node[xmlKey]);
      }
    }
    if (typeof node.dash_manifest_url === 'string') {
      const dmUrl = cleanFacebookMediaUrl(node.dash_manifest_url);
      if (dmUrl) dashManifestUrls.add(dmUrl);
    }

    // 4. Legacy / progressive direct video URLs
    const directUrlPairs: Array<{ val: unknown; isHd: boolean }> = [
      { val: node.browser_native_hd_url, isHd: true },
      { val: node.playable_url_quality_hd, isHd: true },
      { val: node.hd_src_no_ratelimit, isHd: true },
      { val: node.hd_src, isHd: true },
      { val: node.browser_native_sd_url, isHd: false },
      { val: node.playable_url, isHd: false },
      { val: node.sd_src_no_ratelimit, isHd: false },
      { val: node.sd_src, isHd: false }
    ];

    for (const pair of directUrlPairs) {
      const pUrl = cleanFacebookMediaUrl(typeof pair.val === 'string' ? pair.val : '');
      if (!pUrl || pUrl.includes('.mpd')) continue;
      const hints = parseFbUrlHints(pUrl);
      if (hints.durationSec && !acc.durationSec) acc.durationSec = hints.durationSec;

      const hVal = hints.heightHint || (pair.isHd ? (masterH >= 720 ? Math.min(masterW, masterH) || 720 : 720) : 360);
      const wVal = hints.widthHint || (pair.isHd ? masterW : 640);
      const label = pair.isHd ? (hVal >= 1080 ? '1080p' : '720p') : '360p';
      const tier = mapQualityToTier(label, wVal, hVal);
      acc.streams.push({
        url: pUrl,
        resolution: tier.resolution,
        rank: tier.rank,
        tierName: tier.tierName,
        width: wVal,
        height: hVal,
        bandwidth: hints.bitrateBps || (pair.isHd ? 1800000 : 500000),
        contentLength: 0,
        isMuxed: true
      });
    }

    // Traverse children
    const keys = Object.keys(node);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const v = node[k];
      if (v && typeof v === 'object') {
        stack.push(v);
      }
    }
  }
}

async function parseFacebookHtmlDocument(html: string): Promise<ParsedFacebookPage> {
  const acc: ParsedFacebookPage = {
    streams: [],
    audioUrl: '',
    audioBytes: 0,
    hasNoAudioFlag: false,
    title: '',
    author: '',
    thumbnail: '',
    durationSec: 0
  };

  const dashXmlSet = new Set<string>();
  const dashManifestUrls = new Set<string>();

  const $ = cheerio.load(html);

  const ogTitle = $('meta[property="og:title"]').attr('content') || $('title').text() || '';
  if (ogTitle) {
    const norm = normalizeFbTitle(ogTitle);
    if (norm.cleanTitle) acc.title = norm.cleanTitle;
    if (norm.views) acc.views = norm.views;
    if (norm.likes) acc.likes = norm.likes;
  }

  const ogDesc = $('meta[property="og:description"]').attr('content') || '';
  if (ogDesc && !acc.title) {
    const normDesc = normalizeFbTitle(ogDesc);
    if (normDesc.cleanTitle) acc.title = normDesc.cleanTitle;
  }

  const ogImage = $('meta[property="og:image"]').attr('content') || '';
  if (ogImage && isUsefulThumbnailUrl(cleanFacebookMediaUrl(ogImage))) {
    acc.thumbnail = cleanFacebookMediaUrl(ogImage);
  }

  // Parse all <script type="application/json"> blobs embedded by Relay SSR
  $('script[type="application/json"]').each((_, el) => {
    const raw = $(el).html();
    if (!raw || raw.length < 20) return;
    if (!/(?:browser_native_|playable_url|dash_manifest|progressive_urls|videoDelivery)/i.test(raw)) return;
    try {
      const parsed = JSON.parse(raw);
      inspectJsonObjectForFbVideo(parsed, acc, dashXmlSet, dashManifestUrls);
    } catch {}
  });

  // Regex fallback on raw HTML / plugin inline scripts (hd_src, sd_src, browser_native_*, dash_manifest)
  const regexPairs: Array<{ re: RegExp; isHd: boolean }> = [
    { re: /"(?:browser_native_hd_url|playable_url_quality_hd|hd_src_no_ratelimit|hd_src)"\s*:\s*"(https?:[^"]+)"/gi, isHd: true },
    { re: /"(?:browser_native_sd_url|playable_url|sd_src_no_ratelimit|sd_src)"\s*:\s*"(https?:[^"]+)"/gi, isHd: false },
    { re: /\bhd_src(?:_no_ratelimit)?\s*:\s*"(https?:[^"]+)"/gi, isHd: true },
    { re: /\bsd_src(?:_no_ratelimit)?\s*:\s*"(https?:[^"]+)"/gi, isHd: false }
  ];

  for (const { re, isHd } of regexPairs) {
    for (const m of html.matchAll(re)) {
      const urlCandidate = cleanFacebookMediaUrl(decodeEscapedJsonString(m[1]));
      if (!urlCandidate || urlCandidate.includes('.mpd')) continue;
      if (acc.streams.some((s) => s.url === urlCandidate)) continue;
      const hints = parseFbUrlHints(urlCandidate);
      if (hints.durationSec && !acc.durationSec) acc.durationSec = hints.durationSec;
      const hVal = hints.heightHint || (isHd ? 720 : 360);
      const wVal = hints.widthHint || (isHd ? 1280 : 640);
      const tier = mapQualityToTier(isHd ? `${hVal}p` : '360p', wVal, hVal);
      acc.streams.push({
        url: urlCandidate,
        resolution: tier.resolution,
        rank: tier.rank,
        tierName: tier.tierName,
        width: wVal,
        height: hVal,
        bandwidth: hints.bitrateBps || (isHd ? 1800000 : 500000),
        contentLength: 0,
        isMuxed: true
      });
    }
  }

  // Regex fallback for inline escaped dash_manifest strings
  for (const m of html.matchAll(/"dash_manifest(?:_xml_string)?"\s*:\s*"((?:[^"\\]|\\.)+)"/gi)) {
    const unescaped = decodeEscapedJsonString(m[1]);
    if (unescaped.includes('<MPD')) {
      dashXmlSet.add(unescaped);
    }
  }

  // Regex fallback for inline dash_manifest_url if no inline XML was present
  if (dashXmlSet.size === 0) {
    for (const m of html.matchAll(/"dash_manifest_url"\s*:\s*"(https?:[^"]+)"/gi)) {
      const dmUrl = cleanFacebookMediaUrl(decodeEscapedJsonString(m[1]));
      if (dmUrl) dashManifestUrls.add(dmUrl);
    }
  }

  // Fetch external MPD manifest URL if XML was not inline
  if (dashXmlSet.size === 0 && dashManifestUrls.size > 0) {
    for (const dmUrl of dashManifestUrls) {
      if (!isSafePublicUrl(dmUrl).safe) continue;
      try {
        const mpdRes = await fetch(dmUrl, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
            'Referer': 'https://www.facebook.com/'
          },
          signal: AbortSignal.timeout(7000)
        });
        if (mpdRes.ok) {
          const mpdText = await mpdRes.text();
          if (mpdText.includes('<MPD')) {
            dashXmlSet.add(mpdText);
            break;
          }
        }
      } catch {}
    }
  }

  // Parse collected DASH manifests
  for (const xml of dashXmlSet) {
    const parsedDash = parseDashManifest(xml);
    if (parsedDash.durationSec > 0 && !acc.durationSec) {
      acc.durationSec = parsedDash.durationSec;
    }
    if (parsedDash.audioUrl && !acc.audioUrl) {
      acc.audioUrl = parsedDash.audioUrl;
      acc.audioBytes = parsedDash.audioBytes;
    }
    for (const rep of parsedDash.videoReps) {
      acc.streams.push(rep);
    }
  }

  // Fallback thumbnail scan for video cover (t15.5256-10) in HTML
  if (!acc.thumbnail) {
    const thumbM = html.match(/https?:\/\/scontent[^"'\s\\]+\/v\/t15\.5256-10\/[^"'\s\\]+/i);
    if (thumbM?.[0]) {
      const cleanedThumb = cleanFacebookMediaUrl(decodeEscapedJsonString(thumbM[0]));
      if (isUsefulThumbnailUrl(cleanedThumb)) {
        acc.thumbnail = cleanedThumb;
      }
    }
  }

  // Fallback author from plugin page links or title
  if (!acc.author) {
    const pubLinkText = $('a[href*="facebook.com/"]').first().text().trim();
    if (pubLinkText && pubLinkText.length > 1 && pubLinkText.length < 60 && !/^facebook$/i.test(pubLinkText)) {
      acc.author = pubLinkText;
    }
  }

  return acc;
}

function mergeParsedPages(base: ParsedFacebookPage, extra: ParsedFacebookPage): ParsedFacebookPage {
  return {
    streams: [...base.streams, ...extra.streams],
    audioUrl: base.audioUrl || extra.audioUrl,
    audioBytes: base.audioBytes || extra.audioBytes,
    hasNoAudioFlag: base.hasNoAudioFlag || extra.hasNoAudioFlag,
    title: base.title || extra.title,
    author: base.author || extra.author,
    authorUrl: base.authorUrl || extra.authorUrl,
    thumbnail: base.thumbnail || extra.thumbnail,
    durationSec: base.durationSec || extra.durationSec,
    views: base.views || extra.views,
    likes: base.likes || extra.likes,
    comments: base.comments || extra.comments
  };
}

async function fetchFacebookHtml(targetUrl: string): Promise<string | null> {
  if (!isSafePublicUrl(targetUrl).safe) return null;
  try {
    const res = await fetch(targetUrl, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-User': '?1',
        'Sec-Fetch-Dest': 'document',
        'Upgrade-Insecure-Requests': '1'
      },
      signal: AbortSignal.timeout(12000)
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text || text.length < 500) return null;
    return text;
  } catch {
    return null;
  }
}

async function extractFacebookPageData(rawUrl: string): Promise<{
  canonicalUrl: string;
  videoId: string;
  data: ParsedFacebookPage;
}> {
  const canonicalUrl = await resolveFacebookUrl(rawUrl);
  const videoId = extractFacebookVideoId(canonicalUrl);

  let merged: ParsedFacebookPage = {
    streams: [],
    audioUrl: '',
    audioBytes: 0,
    hasNoAudioFlag: false,
    title: '',
    author: '',
    thumbnail: '',
    durationSec: 0
  };

  // Tier 1: Direct www.facebook.com SSR HTML
  const candidateUrls: string[] = [canonicalUrl];
  if (videoId) {
    const watchUrl = `https://www.facebook.com/watch/?v=${videoId}`;
    if (!candidateUrls.includes(watchUrl)) {
      candidateUrls.push(watchUrl);
    }
  }

  for (const candidateUrl of candidateUrls) {
    const html = await fetchFacebookHtml(candidateUrl);
    if (html) {
      const parsed = await parseFacebookHtmlDocument(html);
      merged = mergeParsedPages(merged, parsed);
      if (merged.streams.length >= 2) break;
    }
  }

  // Tier 2: Facebook official Video Plugin endpoint (reliable for progressive HD/SD + metadata)
  if (merged.streams.length < 2 || !merged.title || !merged.author) {
    const pluginUrl = `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(canonicalUrl)}&show_text=0`;
    const pluginHtml = await fetchFacebookHtml(pluginUrl);
    if (pluginHtml) {
      const parsedPlugin = await parseFacebookHtmlDocument(pluginHtml);
      merged = mergeParsedPages(merged, parsedPlugin);
    }
  }

  // Tier 3: mbasic.facebook.com /video_redirect/ fallback if still no streams
  if (merged.streams.length === 0) {
    try {
      const mbasicUrl = canonicalUrl.replace(/^https?:\/\/(?:www\.)?facebook\.com/i, 'https://mbasic.facebook.com');
      const mbRes = await fetch(mbasicUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9'
        },
        signal: AbortSignal.timeout(9000)
      });
      if (mbRes.ok) {
        const mbHtml = await mbRes.text();
        const redirMatches = mbHtml.matchAll(/href="(\/video_redirect\/\?src=[^"]+)"/gi);
        for (const m of redirMatches) {
          try {
            const fullRedir = new URL(`https://mbasic.facebook.com${decodeHtmlEntities(m[1])}`);
            const srcParam = fullRedir.searchParams.get('src');
            const cleanSrc = cleanFacebookMediaUrl(srcParam || '');
            if (cleanSrc) {
              const hints = parseFbUrlHints(cleanSrc);
              const hVal = hints.heightHint || 480;
              const tier = mapQualityToTier(`${hVal}p`, hints.widthHint || 0, hVal);
              merged.streams.push({
                url: cleanSrc,
                resolution: tier.resolution,
                rank: tier.rank,
                tierName: tier.tierName,
                width: hints.widthHint || 0,
                height: hVal,
                bandwidth: hints.bitrateBps || 900000,
                contentLength: 0,
                isMuxed: true
              });
            }
          } catch {}
        }
        const parsedMb = await parseFacebookHtmlDocument(mbHtml);
        merged = mergeParsedPages(merged, parsedMb);
      }
    } catch {}
  }

  return { canonicalUrl, videoId, data: merged };
}

function deduplicateAndSortStreams(streams: CollectedFbStream[]): CollectedFbStream[] {
  const byResolution = new Map<string, CollectedFbStream>();

  for (const s of streams) {
    if (!s.url || !s.url.startsWith('http')) continue;
    const key = s.resolution.toLowerCase();
    const existing = byResolution.get(key);
    if (!existing) {
      byResolution.set(key, s);
      continue;
    }

    // Prefer already-muxed progressive streams when matching exact same resolution (instant streaming without DASH mux overhead)
    if (s.isMuxed && !existing.isMuxed) {
      byResolution.set(key, s);
    } else if (s.isMuxed === existing.isMuxed) {
      if (s.bandwidth > existing.bandwidth || s.contentLength > existing.contentLength) {
        byResolution.set(key, s);
      }
    }
  }

  return Array.from(byResolution.values()).sort((a, b) => b.rank - a.rank);
}

/**
 * Facebook Server 2 — Keyless Direct Extractor supporting Resolution Selection & Audio MP3.
 */
export async function scrapeFacebookServer2(rawUrl: string): Promise<MediaMetadata> {
  const { canonicalUrl, videoId, data } = await extractFacebookPageData(rawUrl);

  const streams = deduplicateAndSortStreams(data.streams);
  if (streams.length === 0) {
    throw new Error('Server 2 tidak dapat menemukan video publik Facebook dari tautan ini. Pastikan video bersifat publik dan tidak terkunci login.');
  }

  const durSec = data.durationSec > 0 ? data.durationSec : 0;
  const formats: MediaFormat[] = [];

  streams.forEach((s, idx) => {
    const estBytes =
      s.contentLength > 0
        ? s.contentLength + (!s.isMuxed ? (data.audioBytes || 0) : 0)
        : (durSec > 0 && s.bandwidth > 0 ? Math.round((s.bandwidth / 8) * durSec) : 0);

    formats.push({
      id: `fb-s2-${s.resolution.toLowerCase().replace(/[^a-z0-9]/g, '')}-${idx}`,
      quality: `${s.tierName} (Original MP4)`,
      resolution: s.resolution,
      type: 'video',
      extension: 'mp4',
      filesize: estBytes > 0 ? formatBytes(estBytes) : undefined,
      filesizeBytes: estBytes > 0 ? estBytes : undefined,
      url: s.url,
      isDirect: true,
      dashAudioUrl: !s.isMuxed ? (s.dashAudioUrl || data.audioUrl || undefined) : undefined,
      note: s.isMuxed
        ? 'Stream asli Facebook tanpa kompresi ulang'
        : 'Stream DASH Facebook HD + Audio (Muxing Otomatis)'
    });
  });

  // Expose MP3 Audio extraction tiers (320 / 256 / 128 kbps) unless explicitly marked audio-less
  const audioSourceUrl = data.audioUrl || streams[0].url;
  if (!data.hasNoAudioFlag && audioSourceUrl) {
    const audioTiers = [
      { kbps: 320, label: '320 kbps (Audio MP3 Studio)', note: 'Bitrate tertinggi MP3 Facebook' },
      { kbps: 256, label: '256 kbps (Audio MP3 High)', note: 'Audio jernih kualitas tinggi' },
      { kbps: 128, label: '128 kbps (Audio MP3 Standar)', note: 'Ukuran hemat & cepat' }
    ];
    for (const tier of audioTiers) {
      const estAudioBytes = durSec > 0 ? Math.round(((tier.kbps * 1000) / 8) * durSec) : 0;
      formats.push({
        id: `fb-s2-audio-${tier.kbps}`,
        quality: tier.label,
        resolution: `${tier.kbps} kbps`,
        type: 'audio',
        extension: 'mp3',
        filesize: estAudioBytes > 0 ? `~ ${formatBytes(estAudioBytes)}` : undefined,
        filesizeBytes: estAudioBytes > 0 ? estAudioBytes : undefined,
        url: audioSourceUrl,
        isDirect: false,
        note: tier.note
      });
    }
  }

  return {
    id: videoId ? `fb-s2-${videoId}` : `fb-s2-${Date.now()}`,
    url: canonicalUrl,
    platform: 'facebook',
    title: data.title || 'Facebook Video',
    author: data.author || 'Facebook Creator',
    authorUrl: data.authorUrl,
    thumbnail: data.thumbnail || '',
    duration: durSec || undefined,
    durationFormatted: durSec > 0 ? formatDuration(durSec) : undefined,
    views: data.views,
    likes: data.likes,
    comments: data.comments,
    formats,
    source: 'Server 2 Engine (Facebook Native Multi-Resolusi)',
    createdAt: new Date().toISOString()
  };
}

/**
 * On-demand resolution helper for /api/start-job & proxy CDN expiry self-healing.
 */
export async function resolveFacebookServer2(
  rawUrl: string,
  targetResolution: string,
  type: 'video' | 'audio' = 'video'
): Promise<{
  downloadUrl: string;
  quality: string;
  resolution?: string;
  dashAudioUrl?: string;
}> {
  const meta = await scrapeFacebookServer2(rawUrl);

  if (type === 'audio') {
    const audioFmt =
      meta.formats.find((f) => f.type === 'audio' && targetResolution && f.resolution?.includes(targetResolution)) ||
      meta.formats.find((f) => f.type === 'audio');
    if (audioFmt && audioFmt.url) {
      return {
        downloadUrl: audioFmt.url,
        quality: audioFmt.quality || '320 kbps Audio MP3',
        resolution: audioFmt.resolution || '320 kbps'
      };
    }
  }

  const videoFmts = meta.formats.filter((f) => f.type === 'video' && f.url);
  if (videoFmts.length === 0) {
    throw new Error('Tautan video Facebook tidak ditemukan.');
  }

  const reqLower = (targetResolution || '').toLowerCase().trim();
  if (reqLower === 'original') {
    const topFb = videoFmts[0];
    return {
      downloadUrl: topFb.url,
      quality: `Original (${topFb.resolution || topFb.quality || 'MP4'})`,
      resolution: 'Original',
      dashAudioUrl: topFb.dashAudioUrl
    };
  }

  const isSameRes = (resStr: string): boolean => {
    const r = resStr.toLowerCase().trim();
    if (!reqLower) return false;
    if (r === reqLower) return true;
    if ((reqLower === '4k' || reqLower.includes('2160')) && (r === '4k' || r.includes('2160'))) return true;
    if ((reqLower === '2k' || reqLower.includes('1440')) && (r === '2k' || r.includes('1440'))) return true;
    return r.replace(/p$/i, '') === reqLower.replace(/p$/i, '');
  };

  let picked = videoFmts.find((f) => isSameRes(f.resolution || ''));
  if (!picked && reqLower) {
    const reqNum = Number(reqLower.replace(/[^0-9]/g, '')) || 720;
    picked = [...videoFmts].sort((a, b) => {
      const na = Number((a.resolution || '').replace(/[^0-9]/g, '')) || 720;
      const nb = Number((b.resolution || '').replace(/[^0-9]/g, '')) || 720;
      return Math.abs(na - reqNum) - Math.abs(nb - reqNum);
    })[0];
  }
  picked = picked || videoFmts[0];

  return {
    downloadUrl: picked.url,
    quality: picked.quality,
    resolution: picked.resolution,
    dashAudioUrl: picked.dashAudioUrl
  };
}
