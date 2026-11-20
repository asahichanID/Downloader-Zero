/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as cheerio from 'cheerio';
import type { MediaMetadata, MediaFormat, PhotoResolutionVariant } from '../../types/index.ts';

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
    .replace(/&#39;/g, "'");
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

/**
 * Resolves Instagram share links (/share/p/..., /share/reel/..., instagr.am/...)
 * to canonical post/reel URLs.
 */
async function resolveInstagramUrl(rawUrl: string): Promise<string> {
  const trimmed = rawUrl.trim();
  if (!/(?:instagram\.com\/share|instagr\.am)/i.test(trimmed)) {
    return trimmed;
  }
  try {
    const res = await fetch(trimmed, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      signal: AbortSignal.timeout(7000)
    });
    if (res.url && res.url !== trimmed && res.url.startsWith('http')) {
      return res.url;
    }
  } catch {}
  return trimmed;
}

function extractShortcode(url: string): { shortcode: string; isReel: boolean } {
  const reelMatch = url.match(/instagram\.com\/(?:[^/]+\/)?(?:reel|reels)\/([A-Za-z0-9_-]+)/i);
  if (reelMatch) {
    return { shortcode: reelMatch[1], isReel: true };
  }
  const postMatch = url.match(/instagram\.com\/(?:[^/]+\/)?(?:p|tv)\/([A-Za-z0-9_-]+)/i);
  if (postMatch) {
    return { shortcode: postMatch[1], isReel: false };
  }
  return { shortcode: '', isReel: false };
}

interface ParsedImageTierSet {
  orig: string;
  r1080?: string;
  r720?: string;
  r480?: string;
  r320?: string;
}

function extractImageTiersFromCandidates(candidates: any[]): ParsedImageTierSet | null {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;

  const valid = candidates.filter((c) => typeof c?.url === 'string' && c.url.startsWith('http'));
  if (valid.length === 0) return null;

  // Prefer uncropped candidates (stp does not start with c<digits>)
  const uncropped = valid.filter((c) => {
    const stp = (c.url.match(/[?&]stp=([^&]+)/)?.[1] || '');
    return !/^c\d+/i.test(stp);
  });
  const pool = uncropped.length > 0 ? uncropped : valid;

  let origUrl = '';
  let r1080 = '';
  let r720 = '';
  let r480 = '';
  let r320 = '';

  let maxDim = -1;

  for (const c of pool) {
    const u: string = c.url;
    const stp = u.match(/[?&]stp=([^&]+)/)?.[1] || '';
    const sizeInStp = stp.match(/_(?:s|p)(\d+)x(\d+)/i);
    const w = typeof c.width === 'number' && c.width > 0 ? c.width : (sizeInStp ? Number(sizeInStp[1]) : 0);
    const h = typeof c.height === 'number' && c.height > 0 ? c.height : (sizeInStp ? Number(sizeInStp[2]) : 0);
    const dim = Math.max(w, h);

    // Master uncropped original has dst-jpg_e35_tt6 without _sWxH or _pWxH downscale
    const isMasterUnscaled = stp ? !/_(?:s|p)\d+x\d+/i.test(stp) : (dim === 0 && pool.indexOf(c) === 0);
    if (isMasterUnscaled && !origUrl) {
      origUrl = u;
    } else if (dim > maxDim) {
      maxDim = dim;
      if (!origUrl) origUrl = u;
    }

    if (dim === 1080 && !r1080) r1080 = u;
    else if ((dim === 720 || dim === 750) && !r720) r720 = u;
    else if (dim === 480 && !r480) r480 = u;
    else if (dim === 320 && !r320) r320 = u;
  }

  if (!origUrl) {
    origUrl = pool[0].url;
  }

  return {
    orig: origUrl,
    r1080: r1080 || undefined,
    r720: r720 || undefined,
    r480: r480 || undefined,
    r320: r320 || undefined
  };
}

function buildPhotoVariantsFromSlideSets(slideSets: ParsedImageTierSet[]): PhotoResolutionVariant[] {
  if (slideSets.length === 0) return [];

  const variants: PhotoResolutionVariant[] = [];
  const origImages = slideSets.map((s) => s.orig).filter(Boolean);
  if (origImages.length === 0) return [];

  variants.push({
    resolution: 'Asli HD',
    label: 'Asli HD',
    images: origImages
  });

  const maybeAddTier = (resKey: string, label: string, getter: (s: ParsedImageTierSet) => string | undefined) => {
    const hasDistinct = slideSets.some((s) => {
      const val = getter(s);
      return Boolean(val && val !== s.orig);
    });
    if (!hasDistinct) return;
    const mapped = slideSets.map((s) => getter(s) || s.orig);
    // Skip if completely identical to any existing variant
    const isDup = variants.some((v) => v.images.length === mapped.length && v.images.every((img, idx) => img === mapped[idx]));
    if (!isDup) {
      variants.push({ resolution: resKey, label, images: mapped });
    }
  };

  maybeAddTier('1080p', '1080p', (s) => s.r1080);
  maybeAddTier('720p', '720p', (s) => s.r720);
  maybeAddTier('480p', '480p', (s) => s.r480);

  return variants;
}

interface DashVideoRep {
  url: string;
  width: number;
  height: number;
  bandwidth: number;
  contentLength: number;
  qualityLabel: string;
  resolution: string;
  rank: number;
  tierName: string;
}

function mapQualityLabelToTier(label: string, width: number, height: number): {
  resolution: string;
  rank: number;
  tierName: string;
  keepStandard: boolean;
} {
  const numMatch = label.match(/(\d{3,4})p/i);
  const qNum = numMatch ? Number(numMatch[1]) : (width > 0 && height > 0 ? Math.min(width, height) : 0);

  if (qNum >= 2160) return { resolution: '4K', rank: 2160, tierName: '4K Ultra HD', keepStandard: true };
  if (qNum >= 1440) return { resolution: '2K', rank: 1440, tierName: '2K Quad HD', keepStandard: true };
  if (qNum === 1080) return { resolution: '1080p', rank: 1080, tierName: '1080p Full HD', keepStandard: true };
  if (qNum === 720) return { resolution: '720p', rank: 720, tierName: '720p HD', keepStandard: true };
  if (qNum === 640) return { resolution: '640p', rank: 640, tierName: '640p HD', keepStandard: false };
  if (qNum === 540) return { resolution: '540p', rank: 540, tierName: '540p qHD', keepStandard: true };
  if (qNum === 480) return { resolution: '480p', rank: 480, tierName: '480p SD', keepStandard: true };
  if (qNum === 360) return { resolution: '360p', rank: 360, tierName: '360p SD', keepStandard: true };
  if (qNum === 270) return { resolution: '270p', rank: 270, tierName: '270p Ringan', keepStandard: false };
  if (qNum === 240) return { resolution: '240p', rank: 240, tierName: '240p Ringan', keepStandard: true };
  if (qNum === 180) return { resolution: '180p', rank: 180, tierName: '180p Hemat', keepStandard: false };
  if (qNum > 0) return { resolution: `${qNum}p`, rank: qNum, tierName: `${qNum}p Video`, keepStandard: true };
  return { resolution: 'HD', rank: 720, tierName: 'Video Asli', keepStandard: true };
}

function parseDashManifest(manifestXml: string): {
  durationSec: number;
  videoReps: DashVideoRep[];
  audioUrl: string;
  audioBytes: number;
} {
  const durationMatch = manifestXml.match(/mediaPresentationDuration="([^"]+)"/i);
  const durationSec = parseIsoDuration(durationMatch?.[1]);

  let bestAudioUrl = '';
  let bestAudioBandwidth = -1;
  let bestAudioBytes = 0;
  const rawVideoReps: DashVideoRep[] = [];

  const repMatches = manifestXml.matchAll(/<Representation([^>]*)>[\s\S]*?<BaseURL>([^<]+)<\/BaseURL>/gi);
  for (const m of repMatches) {
    const attrs = m[1] || '';
    const baseUrl = decodeHtmlEntities((m[2] || '').trim());
    if (!baseUrl.startsWith('http')) continue;

    const mime = (attrs.match(/mimeType="([^"]+)"/i)?.[1] || '').toLowerCase();
    const width = Number(attrs.match(/\bwidth="(\d+)"/i)?.[1] || 0);
    const height = Number(attrs.match(/\bheight="(\d+)"/i)?.[1] || 0);
    const bandwidth = Number(attrs.match(/\bbandwidth="(\d+)"/i)?.[1] || 0);
    const contentLength = Number(attrs.match(/FBContentLength="(\d+)"/i)?.[1] || 0);
    const qualityLabel = (attrs.match(/FBQualityLabel="([^"]+)"/i)?.[1] || '').trim();

    if (mime.includes('audio')) {
      if (bandwidth > bestAudioBandwidth) {
        bestAudioBandwidth = bandwidth;
        bestAudioUrl = baseUrl;
        bestAudioBytes = contentLength;
      }
    } else if (mime.includes('video') || qualityLabel || width > 0) {
      const tier = mapQualityLabelToTier(qualityLabel, width, height);
      rawVideoReps.push({
        url: baseUrl,
        width,
        height,
        bandwidth,
        contentLength,
        qualityLabel: qualityLabel || tier.resolution,
        resolution: tier.resolution,
        rank: tier.rank,
        tierName: tier.tierName
      });
    }
  }

  // Filter intermediate sub-rungs (e.g. 640p, 270p, 180p) when standard tiers exist
  const standardReps = rawVideoReps.filter((r) =>
    mapQualityLabelToTier(r.qualityLabel, r.width, r.height).keepStandard
  );
  const chosenPool = standardReps.length >= 2 ? standardReps : rawVideoReps;

  // Deduplicate by resolution keeping highest bandwidth
  const byRes = new Map<string, DashVideoRep>();
  for (const rep of chosenPool) {
    const existing = byRes.get(rep.resolution);
    if (!existing || rep.bandwidth > existing.bandwidth) {
      byRes.set(rep.resolution, rep);
    }
  }

  const videoReps = [...byRes.values()].sort((a, b) => {
    if (b.rank !== a.rank) return b.rank - a.rank;
    return b.bandwidth - a.bandwidth;
  });

  return {
    durationSec,
    videoReps,
    audioUrl: bestAudioUrl,
    audioBytes: bestAudioBytes
  };
}

function extractVideoFormatsFromNode(
  node: any,
  slideIdx?: number
): { formats: MediaFormat[]; durationSec: number; dashAudioUrl: string; topVideoUrl: string } {
  const formats: MediaFormat[] = [];
  const hasAudio = node?.has_audio !== false;
  const progressiveVersions = Array.isArray(node?.video_versions)
    ? node.video_versions.filter((v: any) => typeof v?.url === 'string' && v.url.startsWith('http'))
    : [];
  const progressiveUrl = progressiveVersions[0]?.url || '';

  let durationSec = typeof node?.video_duration === 'number' && node.video_duration > 0 ? node.video_duration : 0;
  let dashAudioUrl = '';

  if (typeof node?.video_dash_manifest === 'string' && node.video_dash_manifest.includes('<Representation')) {
    const parsedDash = parseDashManifest(node.video_dash_manifest);
    if (!durationSec && parsedDash.durationSec > 0) {
      durationSec = parsedDash.durationSec;
    }
    if (hasAudio && parsedDash.audioUrl) {
      dashAudioUrl = parsedDash.audioUrl;
    }

    const slideTag = typeof slideIdx === 'number' ? ` · Slide #${slideIdx + 1}` : '';
    const slideIdPrefix = typeof slideIdx === 'number' ? `s${slideIdx + 1}-` : '';

    parsedDash.videoReps.forEach((rep, idx) => {
      const totalBytes = rep.contentLength > 0
        ? rep.contentLength + (dashAudioUrl ? parsedDash.audioBytes : 0)
        : 0;
      const dimLabel = rep.width > 0 && rep.height > 0 && rep.rank >= 720
        ? ` (${rep.width}x${rep.height})`
        : '';

      // If DASH has audio and stream is video-only, attach dashAudioUrl for transparent ffmpeg MP4 muxing
      // On highest resolution, we can still use DASH + dashAudioUrl (fast -c copy muxing guarantees exact selected resolution)
      // or progressiveUrl when dashAudioUrl isn't present.
      formats.push({
        id: `ig-s2-${slideIdPrefix}${rep.resolution.toLowerCase()}-${idx}`,
        quality: `${rep.tierName}${dimLabel}${slideTag}`,
        resolution: rep.resolution,
        type: 'video',
        extension: 'mp4',
        filesize: totalBytes > 0 ? formatBytes(totalBytes) : undefined,
        filesizeBytes: totalBytes > 0 ? totalBytes : undefined,
        url: rep.url,
        dashAudioUrl: dashAudioUrl || undefined,
        isDirect: true,
        needsResolution: false,
        note: dashAudioUrl
          ? `Instagram ${rep.resolution} + Audio Asli${slideTag}`
          : `Instagram ${rep.resolution} MP4${slideTag}`
      });
    });
  }

  // Fallback to progressive video_versions if no DASH reps parsed
  if (formats.length === 0 && progressiveVersions.length > 0) {
    const origW = typeof node?.original_width === 'number' ? node.original_width : 0;
    const origH = typeof node?.original_height === 'number' ? node.original_height : 0;
    const firstW = typeof progressiveVersions[0].width === 'number' ? progressiveVersions[0].width : origW;
    const firstH = typeof progressiveVersions[0].height === 'number' ? progressiveVersions[0].height : origH;
    const tier = mapQualityLabelToTier('', firstW, firstH);
    const slideTag = typeof slideIdx === 'number' ? ` · Slide #${slideIdx + 1}` : '';
    const slideIdPrefix = typeof slideIdx === 'number' ? `s${slideIdx + 1}-` : '';

    formats.push({
      id: `ig-s2-${slideIdPrefix}${tier.resolution.toLowerCase()}-0`,
      quality: `${tier.tierName}${firstW > 0 && firstH > 0 ? ` (${firstW}x${firstH})` : ''}${slideTag}`,
      resolution: tier.resolution,
      type: 'video',
      extension: 'mp4',
      url: progressiveUrl,
      isDirect: true,
      needsResolution: false,
      note: `Video MP4 asli Server 2${slideTag}`
    });
  }

  return {
    formats,
    durationSec,
    dashAudioUrl,
    topVideoUrl: progressiveUrl || formats[0]?.url || ''
  };
}

/**
 * Tier 1: Parse Instagram's SSR <script type="application/json"> XIGPolarisMedia payload.
 */
async function fetchInstagramSsrData(shortcode: string, isReel: boolean): Promise<{
  node: any;
  ogTitle?: string;
  ogDescription?: string;
} | null> {
  const paths = isReel
    ? [`https://www.instagram.com/reel/${shortcode}/`, `https://www.instagram.com/p/${shortcode}/`]
    : [`https://www.instagram.com/p/${shortcode}/`, `https://www.instagram.com/reel/${shortcode}/`];

  for (const pageUrl of paths) {
    try {
      const res = await fetch(pageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-User': '?1',
          'Sec-Fetch-Dest': 'document',
          'Upgrade-Insecure-Requests': '1'
        },
        signal: AbortSignal.timeout(10000)
      });

      if (!res.ok) continue;
      const html = await res.text();
      if (!html || html.length < 5000) continue;

      const $ = cheerio.load(html);
      const ogTitle = $('meta[property="og:title"]').attr('content')?.trim();
      const ogDescription = $('meta[name="description"]').attr('content')?.trim() || $('meta[property="og:description"]').attr('content')?.trim();

      let matchedNode: any = null;
      const findPolarisNode = (obj: any): void => {
        if (!obj || typeof obj !== 'object' || matchedNode) return;
        if (Array.isArray(obj)) {
          for (const item of obj) {
            findPolarisNode(item);
            if (matchedNode) return;
          }
          return;
        }
        if (
          (obj.code === shortcode || obj.shortcode === shortcode) &&
          (obj.video_versions || obj.video_dash_manifest || obj.carousel_media || obj.image_versions2)
        ) {
          matchedNode = obj;
          return;
        }
        for (const k of Object.keys(obj)) {
          findPolarisNode(obj[k]);
          if (matchedNode) return;
        }
      };

      $('script[type="application/json"]').each((_, el) => {
        if (matchedNode) return;
        const txt = $(el).text();
        if (!txt || !txt.includes(shortcode)) return;
        try {
          const parsed = JSON.parse(txt);
          findPolarisNode(parsed);
        } catch {}
      });

      if (matchedNode) {
        return { node: matchedNode, ogTitle, ogDescription };
      }
    } catch (err) {
      console.warn('[Server 2 Instagram] SSR fetch notice:', err);
    }
  }

  return null;
}

/**
 * Tier 2: kkinstagram.com Discordbot 302 mirror (handles single media & multi-slide carousels via img_index).
 */
async function fetchViaKkInstagram(shortcode: string, isReel: boolean): Promise<{
  videoUrls: string[];
  imageUrls: string[];
  title?: string;
  author?: string;
} | null> {
  const pathType = isReel ? 'reel' : 'p';
  const baseKk = `https://www.kkinstagram.com/${pathType}/${shortcode}/`;

  const probeKkRedirect = async (targetUrl: string): Promise<{ location: string; isHtml: boolean; htmlText?: string } | null> => {
    try {
      const res = await fetch(targetUrl, {
        redirect: 'manual',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)'
        },
        signal: AbortSignal.timeout(7000)
      });
      const loc = res.headers.get('location') || '';
      if (res.status >= 300 && res.status < 400 && loc.startsWith('http')) {
        return { location: loc, isHtml: false };
      }
      if (res.ok) {
        const htmlText = await res.text();
        return { location: '', isHtml: true, htmlText };
      }
    } catch {}
    return null;
  };

  const first = await probeKkRedirect(baseKk);
  if (!first) return null;

  const videoUrls: string[] = [];
  const imageUrls: string[] = [];
  let title: string | undefined;
  let author: string | undefined;

  const classifyRedirectUrl = (u: string) => {
    if (!u || !u.startsWith('http')) return;
    if (/\.mp4(\?|$)/i.test(u) || u.includes('video')) {
      if (!videoUrls.includes(u)) videoUrls.push(u);
    } else {
      if (!imageUrls.includes(u)) imageUrls.push(u);
    }
  };

  if (first.location) {
    classifyRedirectUrl(first.location);
    // Probe additional carousel slides if index 1 is an image
    if (imageUrls.length > 0 && !isReel) {
      const probePromises = Array.from({ length: 9 }, (_, i) =>
        probeKkRedirect(`${baseKk}?img_index=${i + 2}`)
      );
      const slideResults = await Promise.allSettled(probePromises);
      for (const r of slideResults) {
        if (r.status === 'fulfilled' && r.value?.location) {
          if (r.value.location === first.location) break;
          classifyRedirectUrl(r.value.location);
        } else {
          break;
        }
      }
    }
  } else if (first.htmlText) {
    const $ = cheerio.load(first.htmlText);
    const ogVid = $('meta[property="og:video"], meta[property="og:video:secure_url"]').attr('content')?.trim();
    const ogImg = $('meta[property="og:image"]').attr('content')?.trim();
    const ogDesc = $('meta[property="og:description"]').attr('content')?.trim();
    const ogTitle = $('meta[property="og:title"]').attr('content')?.trim();
    if (ogDesc) title = ogDesc;
    if (ogTitle) author = ogTitle.replace(/^@/, '');
    if (ogVid) classifyRedirectUrl(ogVid);
    if (ogImg) classifyRedirectUrl(ogImg);
  }

  if (videoUrls.length === 0 && imageUrls.length === 0) return null;
  return { videoUrls, imageUrls, title, author };
}

/**
 * Tier 3: embed/captioned fallback
 */
async function fetchViaEmbedCaptioned(shortcode: string): Promise<{
  videoUrls: string[];
  imageUrls: string[];
  title?: string;
  author?: string;
  likes?: string;
  comments?: string;
  views?: string;
} | null> {
  try {
    const res = await fetch(`https://www.instagram.com/p/${shortcode}/embed/captioned/`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      signal: AbortSignal.timeout(7000)
    });
    if (!res.ok) return null;
    const html = await res.text();
    const $ = cheerio.load(html);
    const author = $('.UsernameText').first().text().trim() || undefined;
    const title = $('.Caption').first().text().trim() || undefined;
    const likes = (html.match(/([\d,\.KMB]+)\s+likes/i) || html.match(/"edge_media_preview_like":\{"count":(\d+)/))?.[1];
    const comments = (html.match(/([\d,\.KMB]+)\s+comments/i) || html.match(/"edge_media_to_comment":\{"count":(\d+)/))?.[1];
    const views = html.match(/"video_view_count":(\d+)/)?.[1];

    const cdnMatches = [...html.matchAll(/https:\/\/[^"'\s\\]*(?:cdninstagram\.com|fbcdn\.net)\/[^"'\s\\]+/gi)]
      .map((m) => m[0].replace(/\\u0026/g, '&').replace(/\\/g, ''))
      .filter((u) => !u.includes('rsrc.php'));

    const videoUrls = [...new Set(cdnMatches.filter((u) => u.includes('.mp4')))];
    const imageUrls = [...new Set(cdnMatches.filter((u) => (u.includes('.jpg') || u.includes('.webp')) && !u.includes('s150x150')))];

    if (videoUrls.length === 0 && imageUrls.length === 0) return null;
    return { videoUrls, imageUrls, title, author, likes, comments, views };
  } catch {
    return null;
  }
}

/**
 * =========================================================================
 * SERVER 2 INSTAGRAM SCRAPER (Free Keyless Multi-Tier API)
 * =========================================================================
 * Tier 1: Direct Instagram SSR XIGPolarisMedia JSON
 *   - Full DASH multi-resolution videos (1080p, 720p, 540p, 480p, 360p, 240p) + audio/mp4
 *   - Full multi-slide carousel_media (all photo + video slides)
 *   - Multi-resolution image_versions2 photo tiers (Asli HD, 1080p, 720p, 480p)
 * Tier 2: kkinstagram.com (Discordbot 302 mirror + ?img_index carousel probe)
 * Tier 3: embed/captioned legacy fallback
 */
export async function scrapeInstagramServer2(rawUrl: string): Promise<MediaMetadata> {
  const canonicalUrl = await resolveInstagramUrl(rawUrl);
  const { shortcode, isReel } = extractShortcode(canonicalUrl);

  if (!shortcode) {
    throw new Error('Link Instagram tidak valid. Pastikan menyertakan tautan postingan, Reel, atau carousel (/p/ atau /reel/).');
  }

  let title = '';
  let author = 'Instagram Creator';
  let authorUrl: string | undefined;
  let thumbnail = '';
  let durationSec = 0;
  let views: number | string | undefined;
  let likes: number | string | undefined;
  let comments: number | string | undefined;

  let formats: MediaFormat[] = [];
  let images: string[] = [];
  let photoVariants: PhotoResolutionVariant[] | undefined;

  // ----------------- TIER 1: Instagram SSR XIGPolarisMedia -----------------
  const ssr = await fetchInstagramSsrData(shortcode, isReel);
  if (ssr?.node) {
    const node = ssr.node;

    if (node.caption?.text && typeof node.caption.text === 'string') {
      title = node.caption.text.replace(/\s+/g, ' ').trim();
    } else if (node.accessibility_caption && typeof node.accessibility_caption === 'string') {
      title = node.accessibility_caption.replace(/\s+/g, ' ').trim();
    } else if (ssr.ogTitle) {
      title = ssr.ogTitle.replace(/\s+/g, ' ').trim();
    }

    const uname = node.user?.username || node.owner?.username;
    const fullName = node.user?.full_name || node.owner?.full_name;
    if (fullName || uname) {
      author = fullName && uname ? `${fullName} (@${uname})` : (fullName || `@${uname}`);
      if (uname) authorUrl = `https://www.instagram.com/${uname}/`;
    }

    if (node.play_count !== undefined && node.play_count !== null) views = node.play_count;
    else if (node.video_view_count !== undefined && node.video_view_count !== null) views = node.video_view_count;
    else if (node.view_count !== undefined && node.view_count !== null) views = node.view_count;

    if (node.like_count !== undefined && node.like_count !== null && !node.like_and_view_counts_disabled) {
      likes = node.like_count;
    }
    if (node.comment_count !== undefined && node.comment_count !== null) {
      comments = node.comment_count;
    }

    // Fallback likes/comments from og:description ("638K likes, 13K comments - ...")
    if ((likes === undefined || comments === undefined) && ssr.ogDescription) {
      const ogL = ssr.ogDescription.match(/([\d.,]+[KMB]?)\s+likes/i)?.[1];
      const ogC = ssr.ogDescription.match(/([\d.,]+[KMB]?)\s+comments/i)?.[1];
      if (likes === undefined && ogL) likes = ogL;
      if (comments === undefined && ogC) comments = ogC;
    }

    // Parse Carousel vs Single Media
    if (Array.isArray(node.carousel_media) && node.carousel_media.length > 0) {
      const slideImageSets: ParsedImageTierSet[] = [];
      let primaryAudioUrl = '';
      let primaryTopVideoUrl = '';
      let hasAnySlideAudio = false;

      node.carousel_media.forEach((slide: any, idx: number) => {
        const isVideoSlide =
          slide?.media_type === 2 ||
          Boolean(slide?.video_dash_manifest) ||
          (Array.isArray(slide?.video_versions) && slide.video_versions.length > 0);

        if (isVideoSlide) {
          const vidInfo = extractVideoFormatsFromNode(slide, idx);
          formats.push(...vidInfo.formats);
          if (!durationSec && vidInfo.durationSec > 0) durationSec = vidInfo.durationSec;
          if (!primaryAudioUrl && vidInfo.dashAudioUrl) primaryAudioUrl = vidInfo.dashAudioUrl;
          if (!primaryTopVideoUrl && vidInfo.topVideoUrl) primaryTopVideoUrl = vidInfo.topVideoUrl;
          if (slide?.has_audio !== false) hasAnySlideAudio = true;

          // Thumbnail for mixed carousel fallback
          const slideThumbSet = extractImageTiersFromCandidates(slide?.image_versions2?.candidates || []);
          if (!thumbnail && slideThumbSet?.orig) thumbnail = slideThumbSet.orig;
          // In mixed photo+video carousels, still collect photo slide images only; if carousel has photos, keep slide images clean
        } else {
          const imgSet = extractImageTiersFromCandidates(slide?.image_versions2?.candidates || []);
          if (imgSet) {
            slideImageSets.push(imgSet);
            if (!thumbnail) thumbnail = imgSet.orig;
          }
        }
      });

      if (slideImageSets.length > 0) {
        photoVariants = buildPhotoVariantsFromSlideSets(slideImageSets);
        images = photoVariants[0]?.images || slideImageSets.map((s) => s.orig);

        const defaultPhotoVariant = photoVariants[0];
        formats.push({
          id: images.length > 1 ? 'ig-s2-photos-all' : 'ig-s2-photo-0',
          quality: images.length > 1
            ? `Koleksi Foto Slide (${images.length} Foto · ${defaultPhotoVariant?.resolution || 'Asli HD'})`
            : `Foto Instagram (${defaultPhotoVariant?.resolution || 'Asli HD'})`,
          resolution: defaultPhotoVariant?.resolution || 'Asli HD',
          type: 'photos',
          extension: 'jpg',
          url: images[0],
          isDirect: true,
          needsResolution: false,
          note: images.length > 1
            ? `${images.length} foto slide resolusi penuh siap unduh`
            : 'Foto resolusi asli dari Instagram'
        });
      }

      if (formats.some((f) => f.type === 'video') && hasAnySlideAudio && (primaryAudioUrl || primaryTopVideoUrl)) {
        const audioSource = primaryAudioUrl || primaryTopVideoUrl;
        [320, 256, 128].forEach((kbps) => {
          const estAudioBytes = durationSec > 0 ? Math.round(((kbps * 1000) / 8) * durationSec) : undefined;
          formats.push({
            id: `ig-s2-audio-${kbps}`,
            quality: `${kbps} kbps (Ekstrak Audio MP3)`,
            resolution: `${kbps} kbps`,
            type: 'audio',
            extension: 'mp3',
            filesize: estAudioBytes ? `~ ${formatBytes(estAudioBytes)}` : undefined,
            filesizeBytes: estAudioBytes,
            url: audioSource,
            isDirect: true,
            needsResolution: false,
            note: 'Audio MP3 asli dari video carousel Instagram'
          });
        });
      }
    } else {
      // Single Video / Reel OR Single Photo
      const isVideoPost =
        node.media_type === 2 ||
        Boolean(node.video_dash_manifest) ||
        (Array.isArray(node.video_versions) && node.video_versions.length > 0);

      const coverSet = extractImageTiersFromCandidates(node.image_versions2?.candidates || []);
      if (coverSet?.orig) {
        thumbnail = coverSet.orig;
      } else if (typeof node.display_uri === 'string' && node.display_uri.startsWith('http')) {
        thumbnail = node.display_uri;
      }

      if (isVideoPost) {
        const vidInfo = extractVideoFormatsFromNode(node);
        formats.push(...vidInfo.formats);
        if (vidInfo.durationSec > 0) durationSec = vidInfo.durationSec;

        if (node.has_audio !== false && (vidInfo.dashAudioUrl || vidInfo.topVideoUrl)) {
          const audioSource = vidInfo.dashAudioUrl || vidInfo.topVideoUrl;
          [320, 256, 128].forEach((kbps) => {
            const estAudioBytes = durationSec > 0 ? Math.round(((kbps * 1000) / 8) * durationSec) : undefined;
            formats.push({
              id: `ig-s2-audio-${kbps}`,
              quality: `${kbps} kbps (Ekstrak Audio MP3)`,
              resolution: `${kbps} kbps`,
              type: 'audio',
              extension: 'mp3',
              filesize: estAudioBytes ? `~ ${formatBytes(estAudioBytes)}` : undefined,
              filesizeBytes: estAudioBytes,
              url: audioSource,
              isDirect: true,
              needsResolution: false,
              note: 'Audio MP3 asli dari video Instagram'
            });
          });
        }
      } else if (coverSet) {
        photoVariants = buildPhotoVariantsFromSlideSets([coverSet]);
        images = [coverSet.orig];
        formats.push({
          id: 'ig-s2-photo-0',
          quality: `Foto Instagram (${photoVariants[0]?.resolution || 'Asli HD'})`,
          resolution: photoVariants[0]?.resolution || 'Asli HD',
          type: 'photos',
          extension: 'jpg',
          url: coverSet.orig,
          isDirect: true,
          needsResolution: false,
          note: 'Gambar resolusi asli dari Instagram'
        });
      }
    }
  }

  // ----------------- TIER 2: kkinstagram.com Mirror -----------------
  if (formats.length === 0) {
    const kk = await fetchViaKkInstagram(shortcode, isReel);
    if (kk) {
      if (!title && kk.title) title = kk.title;
      if (author === 'Instagram Creator' && kk.author) author = kk.author;

      if (kk.videoUrls.length > 0) {
        kk.videoUrls.forEach((vUrl, idx) => {
          formats.push({
            id: `ig-s2-kk-vid-${idx}`,
            quality: 'Video HD Instagram (MP4)',
            resolution: 'HD',
            type: 'video',
            extension: 'mp4',
            url: vUrl,
            isDirect: true,
            needsResolution: false,
            note: 'Video MP4 Server 2'
          });
        });
        [320, 256, 128].forEach((kbps) => {
          formats.push({
            id: `ig-s2-audio-${kbps}`,
            quality: `${kbps} kbps (Ekstrak Audio MP3)`,
            resolution: `${kbps} kbps`,
            type: 'audio',
            extension: 'mp3',
            url: kk.videoUrls[0],
            isDirect: true,
            needsResolution: false,
            note: 'Audio MP3 asli dari video Instagram'
          });
        });
      }

      if (kk.imageUrls.length > 0 && kk.videoUrls.length === 0) {
        images = kk.imageUrls;
        if (!thumbnail) thumbnail = images[0];
        formats.push({
          id: images.length > 1 ? 'ig-s2-photos-all' : 'ig-s2-photo-0',
          quality: images.length > 1 ? `Koleksi Foto Slide (${images.length} Foto)` : 'Foto Instagram Asli',
          resolution: 'Asli HD',
          type: 'photos',
          extension: 'jpg',
          url: images[0],
          isDirect: true,
          needsResolution: false,
          note: images.length > 1 ? `${images.length} foto slide siap unduh` : 'Gambar resolusi penuh'
        });
      }
    }
  }

  // ----------------- TIER 3: embed/captioned Fallback -----------------
  if (formats.length === 0) {
    const emb = await fetchViaEmbedCaptioned(shortcode);
    if (emb) {
      if (!title && emb.title) title = emb.title;
      if (author === 'Instagram Creator' && emb.author) author = emb.author;
      if (likes === undefined && emb.likes) likes = emb.likes;
      if (comments === undefined && emb.comments) comments = emb.comments;
      if (views === undefined && emb.views) views = emb.views;

      if (emb.videoUrls.length > 0) {
        formats.push({
          id: 'ig-s2-embed-vid-0',
          quality: 'Video Instagram (MP4)',
          resolution: 'HD',
          type: 'video',
          extension: 'mp4',
          url: emb.videoUrls[0],
          isDirect: true,
          needsResolution: false,
          note: 'Video Instagram Direct CDN'
        });
        [320, 256, 128].forEach((kbps) => {
          formats.push({
            id: `ig-s2-audio-${kbps}`,
            quality: `${kbps} kbps (Ekstrak Audio MP3)`,
            resolution: `${kbps} kbps`,
            type: 'audio',
            extension: 'mp3',
            url: emb.videoUrls[0],
            isDirect: true,
            needsResolution: false,
            note: 'Audio MP3 asli dari video Instagram'
          });
        });
      }
      if (emb.imageUrls.length > 0) {
        images = emb.imageUrls;
        if (!thumbnail) thumbnail = images[0];
        if (emb.videoUrls.length === 0) {
          formats.push({
            id: images.length > 1 ? 'ig-s2-photos-all' : 'ig-s2-photo-0',
            quality: images.length > 1 ? `Koleksi Foto Slide (${images.length} Foto)` : 'Foto Instagram',
            resolution: 'Asli HD',
            type: 'photos',
            extension: 'jpg',
            url: images[0],
            isDirect: true,
            needsResolution: false,
            note: 'Foto Instagram Direct CDN'
          });
        }
      }
    }
  }

  if (formats.length === 0) {
    throw new Error('Server 2 tidak dapat mengekstrak media Instagram ini. Pastikan postingan bersifat publik dan tautan benar.');
  }

  const cleanTitle = (title || `Postingan Instagram #${shortcode}`).replace(/\s+/g, ' ').trim().slice(0, 140);

  return {
    id: shortcode,
    url: canonicalUrl,
    platform: 'instagram',
    title: cleanTitle,
    author,
    authorUrl,
    thumbnail: thumbnail || images[0] || '',
    duration: Math.round(durationSec),
    durationFormatted: durationSec > 0 ? formatDuration(durationSec) : '00:00',
    views,
    likes,
    comments,
    formats,
    images: images.length > 0 ? images : undefined,
    photoVariants: undefined,
    isPhotoSlide: images.length > 1,
    source: 'Server 2 Instagram Engine',
    createdAt: new Date().toISOString()
  };
}

/**
 * Resolves exact requested Instagram format / resolution on demand (used for CDN expiry recovery or /api/start-job).
 */
export async function resolveInstagramServer2(
  rawUrl: string,
  targetResolution: string,
  type: 'video' | 'audio' | 'photos' = 'video'
): Promise<{ downloadUrl: string; dashAudioUrl?: string; quality: string }> {
  const meta = await scrapeInstagramServer2(rawUrl);

  if (type === 'audio') {
    const reqNum = targetResolution.match(/(\d+)/)?.[1] || '320';
    const aud =
      meta.formats.find((f) => f.type === 'audio' && `${f.resolution} ${f.id}`.includes(reqNum)) ||
      meta.formats.find((f) => f.type === 'audio') ||
      meta.formats.find((f) => f.type === 'video');
    if (aud?.url) {
      return { downloadUrl: aud.url, quality: aud.quality || '320 kbps Audio MP3' };
    }
  }

  if (type === 'photos') {
    const variant =
      meta.photoVariants?.find((v) => v.resolution.toLowerCase() === targetResolution.toLowerCase()) ||
      meta.photoVariants?.[0];
    const photoUrl = variant?.images[0] || meta.images?.[0] || meta.formats.find((f) => f.type === 'photos')?.url;
    if (photoUrl) {
      return { downloadUrl: photoUrl, quality: variant?.resolution || 'Asli HD' };
    }
  }

  const videoFmts = meta.formats.filter((f) => f.type === 'video');
  if (videoFmts.length > 0) {
    const targetNorm = targetResolution.toLowerCase().trim();
    const matched =
      videoFmts.find((f) => (f.resolution || '').toLowerCase() === targetNorm) ||
      videoFmts.find((f) => (f.resolution || '').toLowerCase().replace(/p$/, '') === targetNorm.replace(/p$/, '')) ||
      videoFmts[0];
    return {
      downloadUrl: matched.url,
      dashAudioUrl: matched.dashAudioUrl,
      quality: matched.resolution || matched.quality
    };
  }

  const fallback = meta.formats[0];
  if (!fallback?.url) {
    throw new Error('Gagal menemukan format media Instagram yang sesuai.');
  }
  return {
    downloadUrl: fallback.url,
    dashAudioUrl: fallback.dashAudioUrl,
    quality: fallback.resolution || fallback.quality
  };
}
