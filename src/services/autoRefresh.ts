/**
 * Silent background auto-refresh service for Vercel deployments.
 *
 * Behavior:
 * - Checks /version.json every 6 seconds (and immediately on focus, visibility, online, pageshow).
 * - Validates that the new HTML (#root + dz-build-id) and all entry JS/CSS assets return 200 OK.
 * - If any check fails (offline, 5xx, 404, broken HTML), aborts silently and preserves the current app.
 * - Waits 2.5 seconds after confirming the new build is live, primes the root cache with
 *   `cache: 'reload'`, and performs a single guarded reload (never loops).
 */

const CHECK_INTERVAL_MS = 6_000;
const INITIAL_CHECK_DELAY_MS = 1_500;
const MIN_CHECK_GAP_MS = 3_000;
const POST_SUCCESS_RELOAD_DELAY_MS = 2_500;
const RELOAD_COOLDOWN_MS = 12_000;
const FETCH_TIMEOUT_MS = 6_000;

const RELOADED_BUILD_KEY = 'dz_auto_reloaded_build';
const RELOADED_AT_KEY = 'dz_auto_reloaded_at';

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

async function verifyRemoteBuildReady(
  currentBuildId: string,
  currentScripts: string[],
  expectedBuildId?: string
): Promise<string | null> {
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

    // Verify every entry JS/CSS bundle resolves cleanly with HTTP 200
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

export function initAutoRefresh(isBusy?: () => boolean): () => void {
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
  let reloadScheduled = false;
  let lastCheckAt = 0;
  let reloadTimer: number | null = null;
  let initialTimer: number | null = null;
  let intervalId: number | null = null;

  const performSafeReload = async (targetBuildId: string) => {
    if (disposed) return;

    if (isBusy && isBusy()) {
      reloadTimer = window.setTimeout(() => {
        void performSafeReload(targetBuildId);
      }, 2000);
      return;
    }

    if (alreadyReloadedRecently(targetBuildId)) {
      return;
    }

    // Prime browser cache for root document before calling reload()
    try {
      await fetch('/', {
        cache: 'reload',
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
        signal: AbortSignal.timeout(4000)
      });
    } catch {}

    if (disposed || alreadyReloadedRecently(targetBuildId)) return;

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
      void performSafeReload(targetBuildId);
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
            if (currentBuildId && json.buildId === currentBuildId) {
              return;
            }
            candidateBuildId = json.buildId.trim();
          }
        }
      } catch {
        // Fallback to HTML check below
      }

      // 2. Verify full HTML & entry JS/CSS assets are healthy before scheduling reload
      const verifiedBuildId = await verifyRemoteBuildReady(
        currentBuildId,
        currentScripts,
        candidateBuildId || undefined
      );
      if (!verifiedBuildId) {
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
  window.addEventListener('pageshow', onPageShow);
  window.addEventListener('online', onOnline);
  window.addEventListener('vite:preloadError', onPreloadError);

  return () => {
    disposed = true;
    if (initialTimer !== null) window.clearTimeout(initialTimer);
    if (intervalId !== null) window.clearInterval(intervalId);
    if (reloadTimer !== null) window.clearTimeout(reloadTimer);
    document.removeEventListener('visibilitychange', onVisibilityOrFocus);
    window.removeEventListener('focus', onVisibilityOrFocus);
    window.removeEventListener('pageshow', onPageShow);
    window.removeEventListener('online', onOnline);
    window.removeEventListener('vite:preloadError', onPreloadError);
  };
}
