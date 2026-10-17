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

/**
 * Save an already-downloaded history item directly into the user's gallery / downloads folder.
 * Uses the locally stored Blob, meaning zero network traffic and zero redownloading!
 */
export function saveHistoryItemToDevice(item: HistoryItem): boolean {
  if (item.blob) {
    try {
      const blobUrl = URL.createObjectURL(item.blob);
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
      }, 8000);
      return true;
    } catch (e) {
      console.error('Save from blob failed:', e);
    }
  }

  // Fallback if Blob was evicted: download via proxy
  if (item.sourceUrl) {
    const proxyUrl = `/api/proxy-download?url=${encodeURIComponent(
      item.sourceUrl
    )}&filename=${encodeURIComponent(item.filename)}`;
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = proxyUrl;
    a.download = item.filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try {
        document.body.removeChild(a);
      } catch {}
    }, 5000);
    return true;
  }

  return false;
}

export function notifyHistoryChange() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('dz_history_updated'));
  }
}
