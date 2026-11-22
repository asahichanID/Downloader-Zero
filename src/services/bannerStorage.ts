/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type BannerOptionId = 'default' | 'lily_wuwa' | 'wuthering_waves';
export type AnimatedBannerId = 'lily_wuwa' | 'wuthering_waves';
export type BannerDownloadPhase = 'downloading' | 'adapting' | 'saving';

export interface BannerCatalogEntry {
  id: AnimatedBannerId;
  name: string;
  cdnUrl: string;
  opfsFilename: string;
  idbKey: string;
  fallbackSizeBytes: number;
  needsHorizontalAdapt: boolean;
}

export const ACTIVE_BANNER_KEY = 'dz_active_banner';
export const LILY_WUWA_CDN_URL = 'https://cdn.jsdelivr.net/gh/asahichanID/media@main/banner_dz.mp4';
export const WUTHERING_WAVES_CDN_URL = 'https://cdn.jsdelivr.net/gh/asahichanID/media@main/banner_wuwa.mp4';

export const ANIMATED_BANNER_CATALOG: Record<AnimatedBannerId, BannerCatalogEntry> = {
  lily_wuwa: {
    id: 'lily_wuwa',
    name: 'Lily - Wuwa',
    cdnUrl: LILY_WUWA_CDN_URL,
    opfsFilename: 'dz_banner_lily_wuwa_v1.mp4',
    idbKey: 'lily_wuwa_mp4',
    fallbackSizeBytes: 12_638_536,
    needsHorizontalAdapt: false
  },
  wuthering_waves: {
    id: 'wuthering_waves',
    name: 'Wuthering waves',
    cdnUrl: WUTHERING_WAVES_CDN_URL,
    opfsFilename: 'dz_banner_wuthering_waves_v1.mp4',
    idbKey: 'wuthering_waves_mp4',
    fallbackSizeBytes: 6_187_727,
    needsHorizontalAdapt: true
  }
};

// Dedicated private IndexedDB (completely separate from DownloaderZero_DB history so clearing history NEVER touches it)
const PRIVATE_ASSETS_DB_NAME = 'DownloaderZero_PrivateAssets_DB';
const PRIVATE_ASSETS_DB_VERSION = 1;
const PRIVATE_ASSETS_STORE = 'banner_assets';

interface StoredBannerAssetRecord {
  id: string;
  buffer: ArrayBuffer;
  mimeType: string;
  size: number;
  adaptedHorizontal?: boolean;
  savedAt: number;
}

export function getStoredActiveBanner(): BannerOptionId {
  try {
    const val = localStorage.getItem(ACTIVE_BANNER_KEY);
    if (val === 'lily_wuwa' || val === 'wuthering_waves' || val === 'default') {
      return val;
    }
  } catch {}
  return 'default';
}

export function setStoredActiveBanner(bannerId: BannerOptionId): void {
  try {
    localStorage.setItem(ACTIVE_BANNER_KEY, bannerId);
  } catch {}
}

/**
 * Requests persistent browser storage so Chrome/browser treats private banner assets as permanent site data.
 */
async function requestPersistentBrowserStorage(): Promise<void> {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.persist === 'function') {
      const already = typeof navigator.storage.persisted === 'function' ? await navigator.storage.persisted() : false;
      if (!already) {
        await navigator.storage.persist();
      }
    }
  } catch {}
}

function openPrivateAssetsDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB tidak tersedia di browser ini.'));
      return;
    }
    const request = window.indexedDB.open(PRIVATE_ASSETS_DB_NAME, PRIVATE_ASSETS_DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(PRIVATE_ASSETS_STORE)) {
        db.createObjectStore(PRIVATE_ASSETS_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Gagal membuka penyimpanan internal browser.'));
  });
}

async function saveToOpfs(filename: string, buffer: ArrayBuffer): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage || typeof navigator.storage.getDirectory !== 'function') {
      return false;
    }
    const root = await navigator.storage.getDirectory();
    const fileHandle = await root.getFileHandle(filename, { create: true });
    if (typeof (fileHandle as any).createWritable !== 'function') {
      return false;
    }
    const writable = await (fileHandle as any).createWritable();
    await writable.write(buffer);
    await writable.close();
    return true;
  } catch {
    return false;
  }
}

async function readFromOpfs(filename: string): Promise<Blob | null> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage || typeof navigator.storage.getDirectory !== 'function') {
      return null;
    }
    const root = await navigator.storage.getDirectory();
    const fileHandle = await root.getFileHandle(filename, { create: false });
    const file = await fileHandle.getFile();
    if (file && file.size > 100_000) {
      return file.type ? file : new Blob([file], { type: 'video/mp4' });
    }
  } catch {}
  return null;
}

async function saveToPrivateIndexedDB(
  idbKey: string,
  buffer: ArrayBuffer,
  adaptedHorizontal?: boolean
): Promise<boolean> {
  try {
    const db = await openPrivateAssetsDB();
    const record: StoredBannerAssetRecord = {
      id: idbKey,
      buffer,
      mimeType: 'video/mp4',
      size: buffer.byteLength,
      adaptedHorizontal,
      savedAt: Date.now()
    };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PRIVATE_ASSETS_STORE, 'readwrite');
      const store = tx.objectStore(PRIVATE_ASSETS_STORE);
      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    return true;
  } catch {
    return false;
  }
}

async function readFromPrivateIndexedDB(idbKey: string): Promise<Blob | null> {
  try {
    const db = await openPrivateAssetsDB();
    const record = await new Promise<StoredBannerAssetRecord | undefined>((resolve, reject) => {
      const tx = db.transaction(PRIVATE_ASSETS_STORE, 'readonly');
      const store = tx.objectStore(PRIVATE_ASSETS_STORE);
      const req = store.get(idbKey);
      req.onsuccess = () => resolve(req.result as StoredBannerAssetRecord | undefined);
      req.onerror = () => reject(req.error);
    });
    if (record && record.buffer && record.buffer.byteLength > 100_000) {
      return new Blob([record.buffer], { type: record.mimeType || 'video/mp4' });
    }
  } catch {}
  return null;
}

/**
 * Verifies in-browser that an adapted banner video genuinely has horizontal dimensions (width > height).
 */
async function verifyHorizontalVideoBlob(blob: Blob): Promise<boolean> {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return true;
  return await new Promise<boolean>((resolve) => {
    const tempUrl = URL.createObjectURL(blob);
    const vid = document.createElement('video');
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      try { vid.removeAttribute('src'); vid.load(); } catch {}
      try { URL.revokeObjectURL(tempUrl); } catch {}
      resolve(ok);
    };
    const timer = window.setTimeout(() => finish(true), 2500);
    vid.preload = 'metadata';
    vid.muted = true;
    vid.onloadedmetadata = () => {
      if (vid.videoWidth > 0 && vid.videoHeight > 0) {
        finish(vid.videoWidth > vid.videoHeight);
      } else {
        finish(true);
      }
    };
    vid.onerror = () => finish(false);
    vid.src = tempUrl;
  });
}

async function readResponseWithProgress(
  response: Response,
  fallbackTotal: number,
  onChunk: (loadedBytes: number, totalBytes: number) => void
): Promise<ArrayBuffer> {
  const totalBytesHeader = Number(response.headers.get('content-length')) || 0;
  const effectiveTotal = totalBytesHeader || fallbackTotal;

  if (response.body && typeof response.body.getReader === 'function') {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let loadedBytes = 0;
    let lastEmitAt = 0;

    onChunk(0, effectiveTotal);

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        loadedBytes += value.length;

        const now = performance.now();
        if (now - lastEmitAt >= 60 || (effectiveTotal > 0 && loadedBytes >= effectiveTotal)) {
          lastEmitAt = now;
          onChunk(loadedBytes, effectiveTotal);
        }
      }
    }

    const combined = new Uint8Array(loadedBytes);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    return combined.buffer;
  }

  onChunk(0, effectiveTotal);
  return await response.arrayBuffer();
}

/**
 * Loads a permanently stored animated banner from Chrome/browser private storage
 * (OPFS first, private IndexedDB fallback). Returns null if not yet downloaded.
 */
export async function loadAnimatedBannerFromPrivateStorage(
  bannerId: AnimatedBannerId
): Promise<{
  blob: Blob;
  sizeBytes: number;
} | null> {
  const spec = ANIMATED_BANNER_CATALOG[bannerId];
  const opfsBlob = await readFromOpfs(spec.opfsFilename);
  if (opfsBlob) {
    if (spec.needsHorizontalAdapt) {
      const isHoriz = await verifyHorizontalVideoBlob(opfsBlob);
      if (!isHoriz) return null;
    }
    return { blob: opfsBlob, sizeBytes: opfsBlob.size };
  }

  const idbBlob = await readFromPrivateIndexedDB(spec.idbKey);
  if (idbBlob) {
    if (spec.needsHorizontalAdapt) {
      const isHoriz = await verifyHorizontalVideoBlob(idbBlob);
      if (!isHoriz) return null;
    }
    return { blob: idbBlob, sizeBytes: idbBlob.size };
  }

  return null;
}

/**
 * Downloads an animated video banner from CDN with real-time progress.
 * If the banner requires vertical -> horizontal banner adaptation (e.g. "Wuthering waves"),
 * it keeps the asset unusable until adaptation completes, verifies horizontal orientation,
 * and only then saves it permanently inside Chrome/browser private storage (OPFS + private IndexedDB).
 */
export async function downloadAndPersistAnimatedBanner(
  bannerId: AnimatedBannerId,
  onProgress: (info: {
    phase: BannerDownloadPhase;
    percent: number;
    loadedBytes: number;
    totalBytes: number;
  }) => void,
  signal?: AbortSignal
): Promise<{ blob: Blob; sizeBytes: number }> {
  const spec = ANIMATED_BANNER_CATALOG[bannerId];
  await requestPersistentBrowserStorage();

  // Phase 1: Download raw asset from CDN
  const cdnResponse = await fetch(spec.cdnUrl, {
    method: 'GET',
    mode: 'cors',
    cache: 'no-store',
    signal
  });

  if (!cdnResponse.ok) {
    throw new Error(`Gagal mengunduh banner dari CDN (HTTP ${cdnResponse.status}).`);
  }

  const cdnTotalHeader = Number(cdnResponse.headers.get('content-length')) || spec.fallbackSizeBytes;
  const maxPctDownloadPhase = spec.needsHorizontalAdapt ? 55 : 98;

  const rawBuffer = await readResponseWithProgress(
    cdnResponse,
    spec.fallbackSizeBytes,
    (loaded, total) => {
      const ratio = total > 0 ? Math.min(1, loaded / total) : 0;
      const pct = Math.min(maxPctDownloadPhase, Math.round(ratio * maxPctDownloadPhase));
      onProgress({
        phase: 'downloading',
        percent: pct,
        loadedBytes: loaded,
        totalBytes: total || cdnTotalHeader
      });
    }
  );

  if (!rawBuffer || rawBuffer.byteLength < 100_000) {
    throw new Error('Berkas banner animasi dari CDN tidak valid atau terpotong.');
  }

  let finalArrayBuffer = rawBuffer;

  // Phase 2 (when vertical): Adapt orientation & dimensions to match horizontal banner before allowing use
  if (spec.needsHorizontalAdapt) {
    let adaptPct = 58;
    onProgress({
      phase: 'adapting',
      percent: adaptPct,
      loadedBytes: rawBuffer.byteLength,
      totalBytes: rawBuffer.byteLength
    });

    const adaptTicker = window.setInterval(() => {
      if (adaptPct < 92) {
        adaptPct += adaptPct < 78 ? 3 : 1;
        onProgress({
          phase: 'adapting',
          percent: adaptPct,
          loadedBytes: rawBuffer.byteLength,
          totalBytes: rawBuffer.byteLength
        });
      }
    }, 320);

    try {
      const adaptRes = await fetch(`/api/adapt-banner?bannerId=${encodeURIComponent(bannerId)}`, {
        method: 'GET',
        cache: 'no-store',
        signal
      });

      if (!adaptRes.ok) {
        let msg = `Gagal menyesuaikan orientasi banner menjadi horizontal (HTTP ${adaptRes.status}).`;
        try {
          const errJson = await adaptRes.json();
          if (errJson?.error) msg = errJson.error;
        } catch {}
        throw new Error(msg);
      }

      finalArrayBuffer = await readResponseWithProgress(
        adaptRes,
        7_200_000,
        (loaded, total) => {
          const ratio = total > 0 ? Math.min(1, loaded / total) : 0.5;
          onProgress({
            phase: 'adapting',
            percent: Math.min(98, Math.max(adaptPct, 92 + Math.round(ratio * 6))),
            loadedBytes: loaded,
            totalBytes: total
          });
        }
      );
    } finally {
      window.clearInterval(adaptTicker);
    }

    if (!finalArrayBuffer || finalArrayBuffer.byteLength < 100_000) {
      throw new Error('Hasil penyesuaian horizontal tidak valid atau terpotong.');
    }

    const adaptedBlobCheck = new Blob([finalArrayBuffer], { type: 'video/mp4' });
    const isHorizontal = await verifyHorizontalVideoBlob(adaptedBlobCheck);
    if (!isHorizontal) {
      throw new Error('Video belum horizontal atau tidak kompatibel dengan pemutar browser.');
    }
  }

  // Phase 3: Save permanently to OPFS & Private IndexedDB (only AFTER any adaptation succeeds)
  onProgress({
    phase: 'saving',
    percent: 99,
    loadedBytes: finalArrayBuffer.byteLength,
    totalBytes: finalArrayBuffer.byteLength
  });

  const savedOpfs = await saveToOpfs(spec.opfsFilename, finalArrayBuffer);
  const savedIdb = savedOpfs ? true : await saveToPrivateIndexedDB(spec.idbKey, finalArrayBuffer, spec.needsHorizontalAdapt);

  if (!savedOpfs && !savedIdb) {
    throw new Error('Browser menolak penyimpanan internal pribadi untuk aset banner.');
  }

  const finalBlob = new Blob([finalArrayBuffer], { type: 'video/mp4' });
  onProgress({
    phase: 'saving',
    percent: 100,
    loadedBytes: finalArrayBuffer.byteLength,
    totalBytes: finalArrayBuffer.byteLength
  });

  return {
    blob: finalBlob,
    sizeBytes: finalArrayBuffer.byteLength
  };
}

// Backward-compatible named helpers
export async function loadLilyWuwaBannerFromPrivateStorage(): Promise<{ blob: Blob; sizeBytes: number } | null> {
  return loadAnimatedBannerFromPrivateStorage('lily_wuwa');
}

export async function downloadAndPersistLilyWuwaBanner(
  onProgress: (percent: number, loadedBytes: number, totalBytes: number) => void,
  signal?: AbortSignal
): Promise<{ blob: Blob; sizeBytes: number }> {
  return downloadAndPersistAnimatedBanner(
    'lily_wuwa',
    (info) => onProgress(info.percent, info.loadedBytes, info.totalBytes),
    signal
  );
}
