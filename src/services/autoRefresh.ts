/**
 * Silent background auto-refresh service for Vercel deployments.
 *
 * Behavior:
 * - Polls lightweight /version.json (and validates HTML + entry assets) only in production builds.
 * - Never triggers continuous reloads: only acts when a strictly newer, valid buildId is detected.
 * - If a deployment or network check fails (offline, 5xx, missing assets, broken HTML), aborts
 *   silently and keeps the currently working version of the app intact.
 * - Waits 3 seconds after confirming the deployment succeeded before reloading, and defers if a
 *   download/preparation is currently in progress.
 */

const CHECK_INTERVAL_MS = 20_000;
const INITIAL_CHECK_DELAY_MS = 5_000;
const MIN_CHECK_GAP_MS = 8_000;
const POST_SUCCESS_RELOAD_DELAY_MS = 3_000;
const RELOAD_COOLDOWN_MS = 15_000;
const FETCH_TIMEOUT_MS = 6_000;

const RELOADED_BUILD_KEY = 'dz_auto_reloaded_build';
const RELOADED_AT_KEY = 'dz_auto_reloaded_at';

function getCurrentBuildId(): string {
  if (typeof document === 'undefined') return '';
  const meta = document.querySelector('meta[name="dz-build-id"]');
  return meta?.getAttribute('content')?.trim() || '';
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

async function verifyAssetAvailable(assetUrl: string): Promise<boolean> {
  try {
    const res = await fetchWithNoCache(assetUrl, 'HEAD');
    if (res.ok) return true;
    if (res.status === 405) {
      const getRes = await fetchWithNoCache(assetUrl, 'GET');
      return getRes.ok;
    }
    return false;
  } catch {
    return false;
  }
}

async function verifyRemoteBuildReady(expectedBuildId?: string): Promise<string | null> {
  try {
    const htmlRes = await fetchWithNoCache(`/?_dz_check=${Date.now()}`, 'GET');
    if (!htmlRes.ok) return null;

    const contentType = htmlRes.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) return null;

    const html = await htmlRes.text();
    // Ensure response is a healthy built DownloaderZero shell (not an error/maintenance page)
    if (!html.includes('id="root"') && !html.includes("id='root'")) {
      return null;
    }

    const remoteBuildId = extractRemoteBuildId(html);
    if (!remoteBuildId) return null;
    if (expectedBuildId && remoteBuildId !== expectedBuildId) {
      return null;
    }

    const assets = extractEntryAssets(html);
    if (assets.length === 0) return null;

    // Verify every entry JS/CSS bundle resolves cleanly with HTTP 200
    const checks = await Promise.all(assets.slice(0, 4).map(verifyAssetAvailable));
    if (checks.some((ok) => !ok)) {
      return null;
    }

    return remoteBuildId;
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

export function initAutoRefresh(isBusy?: () => boolean): () => void {
  if (typeof window === 'undefined' || !import.meta.env.PROD) {
    return () => {};
  }

  const currentBuildId = getCurrentBuildId();
  if (!currentBuildId) {
    return () => {};
  }

  let disposed = false;
  let checking = false;
  let reloadScheduled = false;
  let lastCheckAt = 0;
  let reloadTimer: number | null = null;
  let initialTimer: number | null = null;
  let intervalId: number | null = null;

  const performSafeReload = (targetBuildId: string) => {
    if (disposed) return;

    if (isBusy && isBusy()) {
      // Wait quietly until active download/preparation finishes
      reloadTimer = window.setTimeout(() => performSafeReload(targetBuildId), 2000);
      return;
    }

    if (alreadyReloadedRecently(targetBuildId)) {
      return;
    }

    try {
      sessionStorage.setItem(RELOADED_BUILD_KEY, targetBuildId);
      sessionStorage.setItem(RELOADED_AT_KEY, String(Date.now()));
    } catch {}

    window.location.reload();
  };

  const scheduleReloadAfterDelay = (targetBuildId: string) => {
    if (disposed || reloadScheduled || alreadyReloadedRecently(targetBuildId)) return;
    reloadScheduled = true;
    reloadTimer = window.setTimeout(() => {
      performSafeReload(targetBuildId);
    }, POST_SUCCESS_RELOAD_DELAY_MS);
  };

  const checkForUpdate = async (force = false) => {
    if (disposed || checking || reloadScheduled) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

    const now = Date.now();
    if (!force && now - lastCheckAt < MIN_CHECK_GAP_MS) return;

    checking = true;
    lastCheckAt = now;

    try {
      let candidateBuildId = '';

      // 1. Lightweight manifest check first
      try {
        const verRes = await fetchWithNoCache(`/version.json?_dz_v=${Date.now()}`, 'GET');
        const ct = verRes.headers.get('content-type') || '';
        if (verRes.ok && ct.includes('application/json')) {
          const json = await verRes.json();
          if (json && typeof json.buildId === 'string') {
            if (json.buildId === currentBuildId) {
              return;
            }
            candidateBuildId = json.buildId.trim();
          }
        }
      } catch {
        // Fallback to HTML check below
      }

      // 2. Verify full HTML & entry JS/CSS assets are healthy before scheduling reload
      const verifiedBuildId = await verifyRemoteBuildReady(candidateBuildId || undefined);
      if (!verifiedBuildId || verifiedBuildId === currentBuildId) {
        return;
      }

      scheduleReloadAfterDelay(verifiedBuildId);
    } catch {
      // Network or parse failure: preserve current working app silently
    } finally {
      checking = false;
    }
  };

  const onVisibilityOrFocus = () => {
    if (document.visibilityState === 'visible') {
      void checkForUpdate(false);
    }
  };

  const onOnline = () => {
    void checkForUpdate(true);
  };

  const onPreloadError = () => {
    void checkForUpdate(true);
  };

  initialTimer = window.setTimeout(() => {
    void checkForUpdate(true);
  }, INITIAL_CHECK_DELAY_MS);

  intervalId = window.setInterval(() => {
    if (document.visibilityState === 'visible') {
      void checkForUpdate(false);
    }
  }, CHECK_INTERVAL_MS);

  document.addEventListener('visibilitychange', onVisibilityOrFocus);
  window.addEventListener('focus', onVisibilityOrFocus);
  window.addEventListener('online', onOnline);
  window.addEventListener('vite:preloadError', onPreloadError);

  return () => {
    disposed = true;
    if (initialTimer !== null) window.clearTimeout(initialTimer);
    if (intervalId !== null) window.clearInterval(intervalId);
    if (reloadTimer !== null) window.clearTimeout(reloadTimer);
    document.removeEventListener('visibilitychange', onVisibilityOrFocus);
    window.removeEventListener('focus', onVisibilityOrFocus);
    window.removeEventListener('online', onOnline);
    window.removeEventListener('vite:preloadError', onPreloadError);
  };
}
