/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type BannerOptionId = 'default' | 'lily_wuwa';

export const ACTIVE_BANNER_KEY = 'dz_active_banner';
export const LILY_WUWA_CDN_URL = 'https://cdn.jsdelivr.net/gh/asahichanID/media@main/banner_dz.mp4';
const LILY_OPFS_FILENAME = 'dz_banner_lily_wuwa_v1.mp4';

// Dedicated private IndexedDB (completely separate from DownloaderZero_DB history so clearing history NEVER touches it)
const PRIVATE_ASSETS_DB_NAME = 'DownloaderZero_PrivateAssets_DB';
const PRIVATE_ASSETS_DB_VERSION = 1;
const PRIVATE_ASSETS_STORE = 'banner_assets';
const LILY_IDB_KEY = 'lily_wuwa_mp4';

interface StoredBannerAssetRecord {
  id: string;
  buffer: ArrayBuffer;
  mimeType: string;
  size: number;
  savedAt: number;
}

export function getStoredActiveBanner(): BannerOptionId {
  try {
    const val = localStorage.getItem(ACTIVE_BANNER_KEY);
    if (val === 'lily_wuwa' || val === 'default') {
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

async function saveToOpfs(buffer: ArrayBuffer): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage || typeof navigator.storage.getDirectory !== 'function') {
      return false;
    }
    const root = await navigator.storage.getDirectory();
    const fileHandle = await root.getFileHandle(LILY_OPFS_FILENAME, { create: true });
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

async function readFromOpfs(): Promise<Blob | null> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage || typeof navigator.storage.getDirectory !== 'function') {
      return null;
    }
    const root = await navigator.storage.getDirectory();
    const fileHandle = await root.getFileHandle(LILY_OPFS_FILENAME, { create: false });
    const file = await fileHandle.getFile();
    if (file && file.size > 100_000) {
      return file.type ? file : new Blob([file], { type: 'video/mp4' });
    }
  } catch {}
  return null;
}

async function saveToPrivateIndexedDB(buffer: ArrayBuffer): Promise<boolean> {
  try {
    const db = await openPrivateAssetsDB();
    const record: StoredBannerAssetRecord = {
      id: LILY_IDB_KEY,
      buffer,
      mimeType: 'video/mp4',
      size: buffer.byteLength,
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

async function readFromPrivateIndexedDB(): Promise<Blob | null> {
  try {
    const db = await openPrivateAssetsDB();
    const record = await new Promise<StoredBannerAssetRecord | undefined>((resolve, reject) => {
      const tx = db.transaction(PRIVATE_ASSETS_STORE, 'readonly');
      const store = tx.objectStore(PRIVATE_ASSETS_STORE);
      const req = store.get(LILY_IDB_KEY);
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
 * Loads the permanently stored "Lily - Wuwa" animated banner from Chrome/browser private storage
 * (OPFS first, private IndexedDB fallback). Returns null if not yet downloaded.
 */
export async function loadLilyWuwaBannerFromPrivateStorage(): Promise<{
  blob: Blob;
  sizeBytes: number;
} | null> {
  const opfsBlob = await readFromOpfs();
  if (opfsBlob) {
    return { blob: opfsBlob, sizeBytes: opfsBlob.size };
  }

  const idbBlob = await readFromPrivateIndexedDB();
  if (idbBlob) {
    return { blob: idbBlob, sizeBytes: idbBlob.size };
  }

  return null;
}

/**
 * Downloads "Lily - Wuwa" video banner from CDN with real-time percentage progress
 * and stores it permanently inside browser private storage (OPFS + private IndexedDB).
 * Note: There is intentionally NO delete method so the downloaded browser asset remains permanent.
 */
export async function downloadAndPersistLilyWuwaBanner(
  onProgress: (percent: number, loadedBytes: number, totalBytes: number) => void,
  signal?: AbortSignal
): Promise<{ blob: Blob; sizeBytes: number }> {
  await requestPersistentBrowserStorage();

  const response = await fetch(LILY_WUWA_CDN_URL, {
    method: 'GET',
    mode: 'cors',
    cache: 'no-store',
    signal
  });

  if (!response.ok) {
    throw new Error(`Gagal mengunduh banner dari CDN (HTTP ${response.status}).`);
  }

  const totalBytesHeader = Number(response.headers.get('content-length')) || 0;
  let arrayBuffer: ArrayBuffer;

  if (response.body && typeof response.body.getReader === 'function') {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let loadedBytes = 0;
    let lastEmitAt = 0;

    onProgress(0, 0, totalBytesHeader);

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        loadedBytes += value.length;

        const now = performance.now();
        if (now - lastEmitAt >= 60 || (totalBytesHeader > 0 && loadedBytes >= totalBytesHeader)) {
          lastEmitAt = now;
          const pct =
            totalBytesHeader > 0
              ? Math.min(99, Math.round((loadedBytes / totalBytesHeader) * 100))
              : Math.min(95, Math.round((loadedBytes / (12.5 * 1024 * 1024)) * 95));
          onProgress(pct, loadedBytes, totalBytesHeader);
        }
      }
    }

    const combined = new Uint8Array(loadedBytes);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    arrayBuffer = combined.buffer;
  } else {
    onProgress(25, 0, totalBytesHeader);
    arrayBuffer = await response.arrayBuffer();
  }

  if (!arrayBuffer || arrayBuffer.byteLength < 100_000) {
    throw new Error('Berkas banner animasi dari CDN tidak valid atau terpotong.');
  }

  // Persist into browser's Origin Private File System (OPFS) and private IndexedDB fallback
  const savedOpfs = await saveToOpfs(arrayBuffer);
  const savedIdb = savedOpfs ? true : await saveToPrivateIndexedDB(arrayBuffer);

  if (!savedOpfs && !savedIdb) {
    throw new Error('Browser menolak penyimpanan internal pribadi untuk aset banner.');
  }

  const finalBlob = new Blob([arrayBuffer], { type: 'video/mp4' });
  onProgress(100, arrayBuffer.byteLength, totalBytesHeader || arrayBuffer.byteLength);

  return {
    blob: finalBlob,
    sizeBytes: arrayBuffer.byteLength
  };
}
