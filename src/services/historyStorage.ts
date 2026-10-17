/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { HistoryItem } from '../types/index.ts';

const DB_NAME = 'DownloaderZero_DB';
const DB_VERSION = 1;
const STORE_NAME = 'history';
const CYCLE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
const CYCLE_KEY = 'dz_history_cycle_start';

// In-memory fallback if IndexedDB is blocked
const memoryHistoryFallback = new Map<string, HistoryItem>();

function getStoredCycleStart(): number {
  try {
    const val = localStorage.getItem(CYCLE_KEY);
    if (val) {
      const num = Number(val);
      if (!isNaN(num) && num > 0) return num;
    }
  } catch {}
  const now = Date.now();
  try {
    localStorage.setItem(CYCLE_KEY, String(now));
  } catch {}
  return now;
}

export function setStoredCycleStart(timestamp: number): void {
  try {
    localStorage.setItem(CYCLE_KEY, String(timestamp));
  } catch {}
}

export function getCycleStatus(): {
  cycleStartTime: number;
  cycleExpiresAt: number;
  timeRemainingMs: number;
  formattedRemaining: string;
  isExpired: boolean;
  progressPercent: number; // 0 to 100% elapsed
} {
  const cycleStartTime = getStoredCycleStart();
  const cycleExpiresAt = cycleStartTime + CYCLE_DURATION_MS;
  const now = Date.now();
  const timeRemainingMs = Math.max(0, cycleExpiresAt - now);
  const isExpired = timeRemainingMs <= 0;

  const totalSecs = Math.floor(timeRemainingMs / 1000);
  const hours = Math.floor(totalSecs / 3600);
  const minutes = Math.floor((totalSecs % 3600) / 60);
  const seconds = totalSecs % 60;

  const formattedRemaining = `${hours.toString().padStart(2, '0')}j ${minutes
    .toString()
    .padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}d`;

  const elapsedMs = Math.min(CYCLE_DURATION_MS, Math.max(0, now - cycleStartTime));
  const progressPercent = Math.min(100, Math.round((elapsedMs / CYCLE_DURATION_MS) * 100));

  return {
    cycleStartTime,
    cycleExpiresAt,
    timeRemainingMs,
    formattedRemaining,
    isExpired,
    progressPercent
  };
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported in this environment'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('downloadedAt', 'downloadedAt', { unique: false });
        store.createIndex('platform', 'platform', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

/**
 * Check if the 24-hour cycle has expired.
 * If expired, perform full cleanup (pembersihan berjalan full) of all history items.
 */
export async function checkAndRunCycleCleanup(): Promise<{
  purged: boolean;
  purgedCount: number;
}> {
  const status = getCycleStatus();
  if (!status.isExpired) {
    return { purged: false, purgedCount: 0 };
  }

  // Cycle has expired! Wipe the entire history store at once (full trash purge)
  try {
    const db = await openDB();
    const count = await new Promise<number>((res) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const countReq = tx.objectStore(STORE_NAME).count();
      countReq.onsuccess = () => res(countReq.result || 0);
      countReq.onerror = () => res(0);
    });

    await new Promise<void>((res, rej) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const req = tx.objectStore(STORE_NAME).clear();
      req.onsuccess = () => res();
      req.onerror = () => rej(req.error);
    });

    memoryHistoryFallback.clear();
    setStoredCycleStart(Date.now());
    notifyHistoryChange();

    return { purged: true, purgedCount: count };
  } catch (err) {
    console.warn('Cycle cleanup fallback wipe:', err);
    memoryHistoryFallback.clear();
    setStoredCycleStart(Date.now());
    notifyHistoryChange();
    return { purged: true, purgedCount: 0 };
  }
}

/**
 * Save downloaded media item into local IndexedDB history with its binary blob.
 */
export async function saveDownloadedMedia(
  item: Omit<HistoryItem, 'id' | 'downloadedAt'>
): Promise<string> {
  // First check if existing cycle expired and clean up if needed
  await checkAndRunCycleCleanup();

  const id = `dz_dl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const record: HistoryItem = {
    ...item,
    id,
    downloadedAt: Date.now()
  };

  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    // If Blob cloning failed (e.g. WebKit bug in some browsers), convert blob to ArrayBuffer and retry
    if (record.blob) {
      try {
        const buffer = await record.blob.arrayBuffer();
        const fallbackRecord = { ...record, buffer, blob: undefined };
        const db = await openDB();
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          const req = store.put(fallbackRecord);
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        });
        notifyHistoryChange();
        return id;
      } catch (bufErr) {
        console.warn('ArrayBuffer save failed:', bufErr);
      }
    }
    console.warn('IndexedDB save failed, using memory fallback:', err);
    memoryHistoryFallback.set(id, record);
  }

  notifyHistoryChange();
  return id;
}

/**
 * Fetch all history items ordered from newest to oldest.
 */
export async function getAllHistory(): Promise<HistoryItem[]> {
  await checkAndRunCycleCleanup();

  try {
    const db = await openDB();
    const items = await new Promise<HistoryItem[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('downloadedAt');
      const req = index.getAll();
      req.onsuccess = () => resolve((req.result as HistoryItem[]) || []);
      req.onerror = () => reject(req.error);
    });

    // Reconstruct blob from buffer if stored in ArrayBuffer format
    for (const item of items) {
      if (!item.blob && (item as any).buffer) {
        const mime = getMimeType(item.extension);
        item.blob = new Blob([(item as any).buffer], { type: mime });
      }
    }

    // Sort descending (newest first)
    return items.sort((a, b) => b.downloadedAt - a.downloadedAt);
  } catch (err) {
    console.warn('IndexedDB read failed, using memory fallback:', err);
    return Array.from(memoryHistoryFallback.values()).sort(
      (a, b) => b.downloadedAt - a.downloadedAt
    );
  }
}

/**
 * Delete a single history item manually.
 */
export async function deleteHistoryItem(id: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const req = tx.objectStore(STORE_NAME).delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('IndexedDB delete failed, removing from memory fallback:', err);
    memoryHistoryFallback.delete(id);
  }

  notifyHistoryChange();
}

/**
 * Clean up any old corrupted items (e.g. 44-byte error responses from previous bugs).
 */
export async function removeCorruptedHistoryItems(): Promise<number> {
  try {
    const items = await getAllHistory();
    let removedCount = 0;
    for (const item of items) {
      if (item.filesizeBytes && item.filesizeBytes <= 60 && item.mediaType !== 'photos') {
        await deleteHistoryItem(item.id);
        removedCount++;
      }
    }
    return removedCount;
  } catch {
    return 0;
  }
}

/**
 * Clear all history manually and reset the 24-hour cycle.
 */
export async function clearAllHistory(): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const req = tx.objectStore(STORE_NAME).clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('IndexedDB clear failed:', err);
  }

  memoryHistoryFallback.clear();
  setStoredCycleStart(Date.now());
  notifyHistoryChange();
}

export function getMimeType(extension: string): string {
  switch (extension.toLowerCase()) {
    case 'mp4':
      return 'video/mp4';
    case 'mp3':
      return 'audio/mpeg';
    case 'm4a':
      return 'audio/mp4';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'zip':
      return 'application/zip';
    default:
      return 'application/octet-stream';
  }
}

/**
 * Save an already-downloaded history item directly into the user's gallery / device.
 * ZERO RE-DOWNLOADING: Purely uses the local offline binary blob already in storage.
 * - Mobile (Android/iOS): Invokes Web Share API so user can pick "Simpan ke Galeri / Foto" directly.
 * - Desktop/Chromium: Uses showSaveFilePicker to write to user's desired folder directly.
 * - Fallback: Creates local memory blob link without making any network request.
 */
export async function saveHistoryItemToDevice(
  item: HistoryItem
): Promise<{ success: boolean; method: 'share' | 'filesystem' | 'download' | 'cancelled' | 'failed'; message?: string }> {
  if (!item.blob) {
    return {
      success: false,
      method: 'failed',
      message: 'Berkas lokal belum ada atau telah terhapus. Silakan unduh baru dari halaman utama.'
    };
  }

  // Ensure blob has proper media MIME type
  const mimeType = getMimeType(item.extension);
  const properBlob = item.blob.type === mimeType ? item.blob : new Blob([item.blob], { type: mimeType });
  const file = new File([properBlob], item.filename, {
    type: mimeType,
    lastModified: Date.now()
  });

  // 1. Primary for Mobile Devices (Android / iOS): Native Web Share API
  // This opens the native Android/iOS system sheet where user can tap "Simpan ke Galeri / Foto / Google Photos"
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: item.title,
          text: `Simpan ke Galeri: ${item.title}`
        });
        return {
          success: true,
          method: 'share',
          message: 'Menu Galeri / Foto HP terbuka! Berkas masuk langsung ke Galeri perangkat.'
        };
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return { success: true, method: 'cancelled' };
      }
      console.warn('Web Share notice:', err);
    }
  }

  // 2. Desktop / Chromium File System Access API
  // Directly writes binary bytes from memory to user's chosen folder without browser download prompt
  if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: item.filename,
        types: [
          {
            description: item.mediaType === 'video' ? 'Video File' : item.mediaType === 'audio' ? 'Audio File' : item.mediaType === 'photos' ? 'ZIP Archive' : 'Media File',
            accept: { [mimeType]: [`.${item.extension}`] }
          }
        ]
      });
      const writable = await handle.createWritable();
      await writable.write(properBlob);
      await writable.close();
      return {
        success: true,
        method: 'filesystem',
        message: 'Berkas berhasil disimpan langsung dari memori lokal ke folder pilihan Anda.'
      };
    } catch (fsErr: any) {
      if (fsErr.name === 'AbortError') {
        return { success: true, method: 'cancelled' };
      }
      console.warn('File System Access notice:', fsErr);
    }
  }

  // 3. Direct In-Memory Blob Save (100% Offline, 0 KB Internet Data)
  try {
    const blobUrl = URL.createObjectURL(properBlob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = blobUrl;
    a.download = item.filename;
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      try {
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
      } catch {}
    }, 15000);

    return {
      success: true,
      method: 'download',
      message: 'Berkas dipindahkan langsung dari memori lokal ke Galeri / Download perangkat (0 KB kuota internet).'
    };
  } catch (e: any) {
    console.error('Save from blob failed:', e);
    return { success: false, method: 'failed', message: e.message };
  }
}

export function notifyHistoryChange() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('dz_history_updated'));
  }
}
