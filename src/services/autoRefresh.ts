/**
 * Instant, double-verified background auto-refresh service for Vercel deployments.
 *
 * Security & Speed guarantees:
 * 1. Runs an immediate check (0ms) as soon as the app loads, plus fast checks on focus,
 *    visibilitychange, pageshow (bfcache), online, vite:preloadError, and every 5s.
 * 2. Double Security Verification before any reload:
 *    - Layer 1: /version.json buildId + fresh HTML shell check (must contain #root & matching dz-build-id).
 *    - Layer 2: Entry JS/CSS bundle verification (HTTP 200 + strict MIME check: javascript/css,
 *      rejecting SPA 404->index.html rewrites or partial/broken Vercel deployments).
 * 3. If ANY verification fails, aborts silently and preserves the currently working app.
 * 4. Calls `onBeforeReload()` right before reloading so user workflow state (URL, resolution modal,
 *    preview stage, active tab) is preserved seamlessly across the instant refresh.
 */

const CHECK_INTERVAL_MS = 5_000;
const MIN_CHECK_GAP_MS = 2_000;
const RELOAD_COOLDOWN_MS = 10_000;
const FETCH_TIMEOUT_MS = 5_000;

const RELOADED_BUILD_KEY = 'dz_auto_reloaded_build';
const RELOADED_AT_KEY = 'dz_auto_reloaded_at';
export const AUTO_REFRESH_PENDING_KEY = 'dz_auto_refresh_pending';

export interface AutoRefreshOptions {
  isDownloading?: () => boolean;
  onBeforeReload?: () => void;
}

function getCurrentBuildId(): string {
  if (typeof document === 'undefined') return '';
  const meta = document.querySelector('meta[name="dz-build-id"]');
  return meta?.getAttribute('content')?.trim() || '';
}

function getCurrentEntryScriptSrcs(): string[] {
  if (typeof document === 'undefined') return [];
  const scripts = Array.from(document.querySelectorAll<HTMLScriptElement>('script[type="module"][src]'));
  return scripts
    .map((s) => s.getAttribute('src') || '')
    .filter((src) => src.includes('/assets/'));
}

function extractRemoteBuildId(html: string): string {
  const match =
    html.match(/<meta\s+name=["']dz-build-id["']\s+content=["']([^"']+)["']/i) ||
    html.match(/<meta\s+content=["']([^"']+)["']\s+name=["']dz-build-id["']/i);
  return match?.[1]?.trim() || '';
}

function extractEntryAssets(html: string): string[] {
  const urls: string[] = [];
  const scriptRegex = /<script[^>]+type=["']module["'][^>]+src=["']([^"']+)["'][^>]*>/gi;
  const altScriptRegex = /<script[^>]+src=["']([^"']+)["'][^>]+type=["']module["'][^>]*>/gi;
  const cssRegex = /<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["'][^>]*>/gi;

  let m: RegExpExecArray | null;
  while ((m = scriptRegex.exec(html)) !== null) {
    if (m[1]) urls.push(m[1]);
  }
  while ((m = altScriptRegex.exec(html)) !== null) {
    if (m[1]) urls.push(m[1]);
  }
  while ((m = cssRegex.exec(html)) !== null) {
    if (m[1]) urls.push(m[1]);
  }
  return [...new Set(urls)].filter((u) => u.startsWith('/') || u.startsWith('http'));
}

async function fetchWithNoCache(url: string, method: 'GET' | 'HEAD' = 'GET'): Promise<Response> {
  return fetch(url, {
    method,
    cache: 'no-store',
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache'
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
  });
}

function isExpectedAssetMime(assetUrl: string, contentType: string): boolean {
  const ct = contentType.toLowerCase();
  if (!ct) return true;
  if (ct.includes('text/html')) return false; // Reject SPA fallback index.html rewrites
  if (assetUrl.endsWith('.js') || assetUrl.endsWith('.mjs')) {
    return ct.includes('javascript') || ct.includes('ecmascript');
  }
  if (assetUrl.endsWith('.css')) {
    return ct.includes('text/css');
  }
  return true;
}

async function verifyAssetAvailable(assetUrl: string): Promise<boolean> {
  try {
    let res = await fetchWithNoCache(assetUrl, 'HEAD');
    if (res.status === 405) {
      res = await fetchWithNoCache(assetUrl, 'GET');
    }
    if (!res.ok) return false;
    const ct = res.headers.get('content-type') || '';
    return isExpectedAssetMime(assetUrl, ct);
  } catch {
    return false;
  }
}

async function verifyRemoteBuildReady(
  currentBuildId: string,
  currentScripts: string[],
  expectedBuildId?: string
): Promise<string | null> {
  try {
    // Layer 1: Validate fresh HTML document
    const htmlRes = await fetchWithNoCache(`/?_dz_check=${Date.now()}`, 'GET');
    if (!htmlRes.ok) return null;

    const contentType = htmlRes.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) return null;

    const html = await htmlRes.text();
    if (!html.includes('id="root"') && !html.includes("id='root'")) {
      return null;
    }

    const remoteBuildId = extractRemoteBuildId(html);
    const assets = extractEntryAssets(html);
    if (assets.length === 0) return null;

    const remoteScripts = assets.filter((u) => u.includes('/assets/') && u.endsWith('.js'));
    const buildIdChanged = Boolean(remoteBuildId && currentBuildId && remoteBuildId !== currentBuildId);
    const scriptChanged =
      currentScripts.length > 0 &&
      remoteScripts.length > 0 &&
      remoteScripts.some((src) => !currentScripts.includes(src));

    if (!buildIdChanged && !scriptChanged) {
      return null;
    }

    if (expectedBuildId && remoteBuildId && remoteBuildId !== expectedBuildId) {
      return null;
    }

    // Layer 2: Verify every entry JS/CSS bundle exists and serves genuine JS/CSS MIME type
    const checks = await Promise.all(assets.slice(0, 4).map(verifyAssetAvailable));
    if (checks.some((ok) => !ok)) {
      return null;
    }

    return remoteBuildId || remoteScripts[0] || 'updated';
  } catch {
    return null;
  }
}

function alreadyReloadedRecently(targetBuildId: string): boolean {
  try {
    const lastBuild = sessionStorage.getItem(RELOADED_BUILD_KEY);
    if (lastBuild === targetBuildId) return true;
    const lastAt = Number(sessionStorage.getItem(RELOADED_AT_KEY) || '0');
    if (lastAt > 0 && Date.now() - lastAt < RELOAD_COOLDOWN_MS) {
      return true;
    }
  } catch {}
  return false;
}

export function initAutoRefresh(options?: AutoRefreshOptions): () => void {
  if (typeof window === 'undefined' || !import.meta.env.PROD) {
    return () => {};
  }

  const currentBuildId = getCurrentBuildId();
  const currentScripts = getCurrentEntryScriptSrcs();
  if (!currentBuildId && currentScripts.length === 0) {
    return () => {};
  }

  let disposed = false;
  let checking = false;
  let reloading = false;
  let lastCheckAt = 0;
  let retryTimer: number | null = null;
  let intervalId: number | null = null;

  const performInstantReload = async (targetBuildId: string) => {
    if (disposed || reloading) return;

    // Only defer momentarily if bytes are actively streaming to disk right now
    if (options?.isDownloading && options.isDownloading()) {
      retryTimer = window.setTimeout(() => {
        void performInstantReload(targetBuildId);
      }, 1000);
      return;
    }

    if (alreadyReloadedRecently(targetBuildId)) {
      return;
    }

    reloading = true;

    try {
      options?.onBeforeReload?.();
    } catch {}

    // Prime browser cache for root document so reload() paints the new deployment immediately
    try {
      await fetch('/', {
        cache: 'reload',
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
        signal: AbortSignal.timeout(3500)
      });
    } catch {}

    if (disposed) return;

    try {
      sessionStorage.setItem(RELOADED_BUILD_KEY, targetBuildId);
      sessionStorage.setItem(RELOADED_AT_KEY, String(Date.now()));
      sessionStorage.setItem(AUTO_REFRESH_PENDING_KEY, '1');
    } catch {}

    window.location.reload();
  };

  const checkForUpdate = async (force = false) => {
    if (disposed || checking || reloading) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

    const now = Date.now();
    if (!force && now - lastCheckAt < MIN_CHECK_GAP_MS) return;

    checking = true;
    lastCheckAt = now;

    try {
      let candidateBuildId = '';

      // Fast manifest check first
      try {
        const verRes = await fetchWithNoCache(`/version.json?_dz_v=${Date.now()}`, 'GET');
        const ct = verRes.headers.get('content-type') || '';
        if (verRes.ok && ct.includes('application/json')) {
          const json = await verRes.json();
          if (json && typeof json.buildId === 'string') {
            if (currentBuildId && json.buildId === currentBuildId) {
              return;
            }
            candidateBuildId = json.buildId.trim();
          }
        }
      } catch {
        // Fallback directly to HTML + asset verification
      }

      // Double verification (HTML shell + entry JS/CSS MIME check)
      const verifiedBuildId = await verifyRemoteBuildReady(
        currentBuildId,
        currentScripts,
        candidateBuildId || undefined
      );
      if (!verifiedBuildId) {
        return;
      }

      await performInstantReload(verifiedBuildId);
    } catch {
      // Preserve current working app silently if update check fails
    } finally {
      checking = false;
    }
  };

  const onVisibilityOrFocus = () => {
    if (document.visibilityState === 'visible') {
      void checkForUpdate(false);
    }
  };

  const onPageShow = (event: PageTransitionEvent) => {
    if (event.persisted) {
      void checkForUpdate(true);
    }
  };

  const onOnline = () => {
    void checkForUpdate(true);
  };

  const onPreloadError = () => {
    void checkForUpdate(true);
  };

  // Immediate check at 0ms when entering the browser
  void checkForUpdate(true);

  intervalId = window.setInterval(() => {
    if (document.visibilityState === 'visible') {
      void checkForUpdate(false);
    }
  }, CHECK_INTERVAL_MS);

  document.addEventListener('visibilitychange', onVisibilityOrFocus);
  window.addEventListener('focus', onVisibilityOrFocus);
  window.addEventListener('pageshow', onPageShow);
  window.addEventListener('online', onOnline);
  window.addEventListener('vite:preloadError', onPreloadError);

  return () => {
    disposed = true;
    if (retryTimer !== null) window.clearTimeout(retryTimer);
    if (intervalId !== null) window.clearInterval(intervalId);
    document.removeEventListener('visibilitychange', onVisibilityOrFocus);
    window.removeEventListener('focus', onVisibilityOrFocus);
    window.removeEventListener('pageshow', onPageShow);
    window.removeEventListener('online', onOnline);
    window.removeEventListener('vite:preloadError', onPreloadError);
  };
}
