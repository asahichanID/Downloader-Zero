import type { MediaMetadata, MediaFormat, ServerMode } from '../types/index.ts';

const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes fallback when CDN URL has no explicit expiry
const EXPIRY_SAFETY_BUFFER_MS = 45 * 1000; // Refresh 45s before actual CDN expiry
const SESSION_STORAGE_KEY = 'dz_media_result_cache_v2';

export interface CachedExtractEntry {
  key: string;
  normalizedUrl: string;
  media: MediaMetadata;
  expiresAt: number;
  cachedAt: number;
}

export interface CachedPreparedEntry {
  key: string;
  normalizedUrl: string;
  formatKey: string;
  media: MediaMetadata;
  format: MediaFormat;
  resolvedUrl: string;
  expiresAt: number;
  cachedAt: number;
}

interface PersistedCacheStore {
  extracts: Record<string, CachedExtractEntry>;
  prepared: Record<string, CachedPreparedEntry>;
}

const extractCache = new Map<string, CachedExtractEntry>();
const preparedCache = new Map<string, CachedPreparedEntry>();
let hydratedFromStorage = false;

export function normalizeUrlForCache(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  try {
    const u = new URL(trimmed);
    const host = u.hostname.toLowerCase();
    // Preserve path and search params accurately, strip trailing slash only for bare origin/pathname
    const pathname = u.pathname.length > 1 ? u.pathname.replace(/\/+$/, '') : u.pathname;
    return `${u.protocol.toLowerCase()}//${host}${pathname}${u.search}`;
  } catch {
    return trimmed;
  }
}

function makeServerScope(serverMode: ServerMode, apiKey?: string): string {
  const keySig = apiKey && apiKey.trim() ? `k:${apiKey.trim().slice(0, 6)}:${apiKey.trim().length}` : 'k:default';
  return `${serverMode}|${keySig}`;
}

export function buildExtractCacheKey(rawUrl: string, serverMode: ServerMode, apiKey?: string): string {
  return `${normalizeUrlForCache(rawUrl)}::${makeServerScope(serverMode, apiKey)}`;
}

export function buildFormatCacheKey(format: Pick<MediaFormat, 'id' | 'type' | 'resolution' | 'quality' | 'fps'>): string {
  return `${format.type}|${format.resolution || ''}|${format.fps || ''}|${format.id || ''}|${format.quality || ''}`;
}

export function buildPreparedCacheKey(
  rawUrl: string,
  formatKey: string,
  serverMode: ServerMode,
  apiKey?: string
): string {
  return `${normalizeUrlForCache(rawUrl)}::${formatKey}::${makeServerScope(serverMode, apiKey)}`;
}

/**
 * Inspect a single CDN/media URL for explicit expiration query parameters
 * (expire, expires, x-expires, e, exp, oe hex timestamp used by Meta/FB/IG CDNs).
 */
export function getUrlExpirationTimestamp(rawUrl?: string): number | null {
  if (!rawUrl || !rawUrl.startsWith('http')) return null;

  try {
    const parsed = new URL(rawUrl);
    const params = parsed.searchParams;

    // 1. Standard decimal unix timestamps (expire, expires, x-expires, exp, e, Expires)
    const decimalKeys = ['expire', 'expires', 'x-expires', 'exp', 'e', 'Expires'];
    for (const k of decimalKeys) {
      const val = params.get(k);
      if (val && /^\d{10,13}$/.test(val)) {
        const num = Number(val);
        const ms = val.length === 13 ? num : num * 1000;
        if (ms > Date.now() - 86_400_000) {
          return ms;
        }
      }
    }

    // 2. Facebook / Instagram CDN hex timestamp (`oe=67A1B2C3`)
    const oeVal = params.get('oe');
    if (oeVal && /^[0-9a-fA-F]{7,10}$/.test(oeVal)) {
      const sec = parseInt(oeVal, 16);
      if (!isNaN(sec) && sec > 1_500_000_000) {
        return sec * 1000;
      }
    }
  } catch {
    return null;
  }

  return null;
}

function computeEarliestExpiration(urls: Array<string | undefined>): number {
  const now = Date.now();
  let earliestExplicit: number | null = null;

  for (const u of urls) {
    const exp = getUrlExpirationTimestamp(u);
    if (exp !== null) {
      if (earliestExplicit === null || exp < earliestExplicit) {
        earliestExplicit = exp;
      }
    }
  }

  if (earliestExplicit !== null) {
    // Subtract safety buffer, but cap max at 6 hours to keep fresh metadata
    const safeExp = earliestExplicit - EXPIRY_SAFETY_BUFFER_MS;
    return Math.min(safeExp, now + 6 * 60 * 60 * 1000);
  }

  return now + DEFAULT_CACHE_TTL_MS;
}

function hydrateCacheOnce() {
  if (hydratedFromStorage || typeof window === 'undefined') return;
  hydratedFromStorage = true;
  try {
    const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as PersistedCacheStore;
    const now = Date.now();

    if (parsed.extracts) {
      Object.entries(parsed.extracts).forEach(([k, v]) => {
        if (v && v.expiresAt > now) {
          extractCache.set(k, v);
        }
      });
    }
    if (parsed.prepared) {
      Object.entries(parsed.prepared).forEach(([k, v]) => {
        if (v && v.expiresAt > now) {
          preparedCache.set(k, v);
        }
      });
    }
  } catch {
    // Ignore storage parse failures
  }
}

function persistCache() {
  if (typeof window === 'undefined') return;
  try {
    const now = Date.now();
    const extractsObj: Record<string, CachedExtractEntry> = {};
    const preparedObj: Record<string, CachedPreparedEntry> = {};

    // Keep at most 15 non-expired entries per bucket
    Array.from(extractCache.entries())
      .filter(([, v]) => v.expiresAt > now)
      .slice(-15)
      .forEach(([k, v]) => {
        extractsObj[k] = v;
      });

    Array.from(preparedCache.entries())
      .filter(([, v]) => v.expiresAt > now)
      .slice(-20)
      .forEach(([k, v]) => {
        preparedObj[k] = v;
      });

    window.sessionStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ extracts: extractsObj, prepared: preparedObj })
    );
  } catch {
    // Ignore storage quota errors
  }
}

export function getCachedExtract(
  rawUrl: string,
  serverMode: ServerMode,
  apiKey?: string
): MediaMetadata | null {
  hydrateCacheOnce();
  const key = buildExtractCacheKey(rawUrl, serverMode, apiKey);
  const entry = extractCache.get(key);
  if (!entry) return null;

  if (Date.now() >= entry.expiresAt) {
    extractCache.delete(key);
    persistCache();
    return null;
  }
  return entry.media;
}

export function setCachedExtract(
  rawUrl: string,
  serverMode: ServerMode,
  apiKey: string | undefined,
  media: MediaMetadata
): void {
  hydrateCacheOnce();
  const urls: Array<string | undefined> = [
    ...(media.formats || []).map((f) => f.url),
    ...(media.files || []).map((f) => f.url),
    ...(media.images || [])
  ];
  const expiresAt = computeEarliestExpiration(urls);
  // Only cache if not already expired
  if (expiresAt <= Date.now() + 5000) return;

  const key = buildExtractCacheKey(rawUrl, serverMode, apiKey);
  extractCache.set(key, {
    key,
    normalizedUrl: normalizeUrlForCache(rawUrl),
    media,
    expiresAt,
    cachedAt: Date.now()
  });
  persistCache();
}

export function getCachedPrepared(
  rawUrl: string,
  format: Pick<MediaFormat, 'id' | 'type' | 'resolution' | 'quality' | 'fps'>,
  serverMode: ServerMode,
  apiKey?: string
): CachedPreparedEntry | null {
  hydrateCacheOnce();
  const formatKey = buildFormatCacheKey(format);
  const key = buildPreparedCacheKey(rawUrl, formatKey, serverMode, apiKey);
  const entry = preparedCache.get(key);
  if (!entry) return null;

  if (Date.now() >= entry.expiresAt) {
    preparedCache.delete(key);
    persistCache();
    return null;
  }
  return entry;
}

export function setCachedPrepared(
  rawUrl: string,
  format: MediaFormat,
  serverMode: ServerMode,
  apiKey: string | undefined,
  media: MediaMetadata,
  resolvedUrl: string
): void {
  hydrateCacheOnce();
  const urls: Array<string | undefined> = [
    resolvedUrl,
    ...(media.files || []).map((f) => f.url),
    ...(media.images || [])
  ];
  const expiresAt = computeEarliestExpiration(urls);
  if (expiresAt <= Date.now() + 5000) return;

  const formatKey = buildFormatCacheKey(format);
  const key = buildPreparedCacheKey(rawUrl, formatKey, serverMode, apiKey);
  preparedCache.set(key, {
    key,
    normalizedUrl: normalizeUrlForCache(rawUrl),
    formatKey,
    media,
    format,
    resolvedUrl,
    expiresAt,
    cachedAt: Date.now()
  });
  persistCache();
}

export function invalidateCacheForUrl(rawUrl: string): void {
  hydrateCacheOnce();
  const norm = normalizeUrlForCache(rawUrl);
  for (const [k, v] of extractCache.entries()) {
    if (v.normalizedUrl === norm) extractCache.delete(k);
  }
  for (const [k, v] of preparedCache.entries()) {
    if (v.normalizedUrl === norm) preparedCache.delete(k);
  }
  persistCache();
}
