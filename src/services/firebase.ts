import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAnalytics, isSupported as isAnalyticsSupported } from 'firebase/analytics';
import {
  getFirestore,
  doc,
  collection,
  getDocFromServer,
  runTransaction,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  serverTimestamp,
  type Timestamp,
  type Unsubscribe
} from 'firebase/firestore';
import type { PlatformType } from '../types/index.ts';

export const TARGET_WEB_DOMAIN = 'https://downloader-zero.vercel.app/';
const FIREBASE_PROJECT_ID = 'viewing-and-download';
const FIRESTORE_REST_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;

const firebaseConfig = {
  apiKey: (typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_FIREBASE_API_KEY : '') || '',
  authDomain: 'viewing-and-download.firebaseapp.com',
  projectId: FIREBASE_PROJECT_ID,
  storageBucket: 'viewing-and-download.firebasestorage.app',
  messagingSenderId: '277373651997',
  appId: '1:277373651997:web:50df7db704fa3821ed8af4',
  measurementId: 'G-3NQEGCD6HN'
};

const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

const app = isFirebaseConfigured
  ? (getApps().length > 0 ? getApp() : initializeApp(firebaseConfig))
  : null;

export const db = app ? getFirestore(app) : null;

// Initialize Analytics safely in browser environments only
if (typeof window !== 'undefined' && app && firebaseConfig.measurementId) {
  isAnalyticsSupported()
    .then((supported) => {
      if (supported) {
        getAnalytics(app);
      }
    })
    .catch(() => {});
}

// Validate Firestore connection on boot when SDK is active
async function testConnection() {
  if (typeof window === 'undefined' || !db) return;
  try {
    await getDocFromServer(doc(db, 'site_stats', 'downloader_zero'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('[Firebase] Client is offline — using Firestore REST fallback.');
    }
  }
}
void testConnection();

export interface DownloadActivityRecord {
  id: string;
  platform: PlatformType | string;
  url: string;
  resolution: string;
  status: 'berhasil' | 'gagal';
  mediaType: 'video' | 'audio' | 'photos' | 'file';
  title: string;
  visitorId: string;
  createdAtMs: number;
}

const VIEW_COUNTED_STORAGE_KEY = 'dz_web_view_counted_v1';
const VISITOR_ID_STORAGE_KEY = 'dz_web_visitor_id_v1';
const VIEW_COOKIE_NAME = 'dz_vw_v1';

// In-memory cache prevents temporary 0 flicker across tab switches
let cachedSiteViews: number | null = null;
let cachedDownloadActivities: DownloadActivityRecord[] | null = null;

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  try {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

function writeCookie(name: string, value: string) {
  if (typeof document === 'undefined') return;
  try {
    document.cookie = `${name}=${encodeURIComponent(value)}; max-age=31536000; path=/; SameSite=Lax`;
  } catch {}
}

function hashStringHex(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= c + i;
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

function getCanvasSignature(): string {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'no-ctx';
    ctx.textBaseline = 'top';
    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#0ea5e9';
    ctx.fillRect(4, 4, 48, 18);
    ctx.fillStyle = '#0f172a';
    ctx.fillText('DownloaderZero-FP', 8, 8);
    return canvas.toDataURL().slice(-48);
  } catch {
    return 'no-canvas';
  }
}

function generateFirestoreId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 20; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

/**
 * Generates a deterministic, auth-free browser/device ID matching ^[a-zA-Z0-9_-]+$
 * so the same browser/device cannot spam view counts even if localStorage is cleared.
 */
export function getStableVisitorId(): string {
  if (typeof window === 'undefined') return 'fp_server';

  try {
    const saved = localStorage.getItem(VISITOR_ID_STORAGE_KEY);
    if (saved && /^[a-zA-Z0-9_-]{8,64}$/.test(saved)) {
      return saved;
    }
  } catch {}

  const traits = [
    navigator.userAgent || '',
    navigator.language || '',
    navigator.platform || '',
    String(window.screen?.width || 0),
    String(window.screen?.height || 0),
    String(window.screen?.colorDepth || 0),
    String(Intl.DateTimeFormat().resolvedOptions().timeZone || ''),
    String(navigator.hardwareConcurrency || 0),
    String((navigator as any).deviceMemory || 0),
    String(navigator.maxTouchPoints || 0),
    getCanvasSignature()
  ].join('|');

  const visitorId = `fp_${hashStringHex(traits)}`;
  try {
    localStorage.setItem(VISITOR_ID_STORAGE_KEY, visitorId);
  } catch {}
  return visitorId;
}

function isDownloaderWebContext(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  if (navigator.webdriver) return false;
  const protocol = window.location.protocol;
  if (protocol !== 'http:' && protocol !== 'https:') return false;

  const host = window.location.hostname.toLowerCase();
  const isOfficialOrPreviewHost =
    host === 'downloader-zero.vercel.app' ||
    host.endsWith('.vercel.app') ||
    host.endsWith('.run.app') ||
    host === 'localhost' ||
    host === '127.0.0.1';

  const hasDownloaderMarker =
    document.title.toLowerCase().includes('downloaderzero') ||
    Boolean(document.getElementById('root'));

  return isOfficialOrPreviewHost && hasDownloaderMarker;
}

// ---------- Firestore v1 REST API Helpers ----------

function decodeFirestoreInt(field: any): number {
  if (!field) return 0;
  const raw = field.integerValue ?? field.doubleValue ?? 0;
  const num = Number(raw);
  return Number.isFinite(num) ? num : 0;
}

function decodeFirestoreString(field: any, fallback = ''): string {
  if (!field) return fallback;
  return typeof field.stringValue === 'string' ? field.stringValue : fallback;
}

function decodeFirestoreTimestampMs(field: any, createTimeIso?: string): number {
  const iso = field?.timestampValue || createTimeIso || '';
  if (iso) {
    const parsed = Date.parse(iso);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return Date.now();
}

async function fetchSiteViewsRest(): Promise<number> {
  const res = await fetch(`${FIRESTORE_REST_BASE}/site_stats/downloader_zero`, {
    cache: 'no-store'
  });
  if (res.status === 404) return 0;
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const data = await res.json();
  return decodeFirestoreInt(data?.fields?.totalViews);
}

async function fetchDownloadActivitiesRest(maxItems = 500): Promise<DownloadActivityRecord[]> {
  const res = await fetch(`${FIRESTORE_REST_BASE}:runQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'download_activities' }],
        orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
        limit: maxItems
      }
    })
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const rows = (await res.json()) as Array<{ document?: any }>;
  if (!Array.isArray(rows)) return [];

  const records: DownloadActivityRecord[] = [];
  for (const row of rows) {
    const docData = row?.document;
    if (!docData || !docData.name) continue;
    const f = docData.fields || {};
    const id = String(docData.name).split('/').pop() || generateFirestoreId();
    const mType = decodeFirestoreString(f.mediaType, 'video');
    records.push({
      id,
      platform: decodeFirestoreString(f.platform, 'unknown'),
      url: decodeFirestoreString(f.url, '-'),
      resolution: decodeFirestoreString(f.resolution, '-'),
      status: decodeFirestoreString(f.status, 'berhasil') === 'gagal' ? 'gagal' : 'berhasil',
      mediaType:
        mType === 'audio' || mType === 'photos' || mType === 'file' ? mType : 'video',
      title: decodeFirestoreString(f.title, ''),
      visitorId: decodeFirestoreString(f.visitorId, ''),
      createdAtMs: decodeFirestoreTimestampMs(f.createdAt, docData.createTime)
    });
  }
  return records;
}

async function registerWebViewRest(visitorId: string): Promise<void> {
  // 1. Check whether visitor already recorded
  const checkRes = await fetch(`${FIRESTORE_REST_BASE}/web_visitors/${encodeURIComponent(visitorId)}`, {
    cache: 'no-store'
  });
  if (checkRes.ok) {
    // Already counted for this browser/device
    return;
  }
  if (checkRes.status !== 404) {
    throw new Error(`Visitor check HTTP ${checkRes.status}`);
  }

  // 2. Atomically create visitor record (if not exists) and increment totalViews by 1
  const docBase = `projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;
  const commitRes = await fetch(`${FIRESTORE_REST_BASE}:commit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      writes: [
        {
          update: {
            name: `${docBase}/web_visitors/${visitorId}`,
            fields: {
              visitorId: { stringValue: visitorId },
              domain: { stringValue: TARGET_WEB_DOMAIN }
            }
          },
          updateTransforms: [
            { fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }
          ],
          currentDocument: { exists: false }
        },
        {
          transform: {
            document: `${docBase}/site_stats/downloader_zero`,
            fieldTransforms: [
              { fieldPath: 'totalViews', increment: { integerValue: '1' } },
              { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }
            ]
          }
        }
      ]
    })
  });

  if (!commitRes.ok && commitRes.status !== 409) {
    throw new Error(`Visitor commit HTTP ${commitRes.status}`);
  }
}

async function logDownloadActivityRest(payload: {
  platform: string;
  url: string;
  resolution: string;
  status: 'berhasil' | 'gagal';
  mediaType: 'video' | 'audio' | 'photos' | 'file';
  title: string;
  visitorId: string;
}): Promise<void> {
  const docId = generateFirestoreId();
  const docName = `projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/download_activities/${docId}`;
  const res = await fetch(`${FIRESTORE_REST_BASE}:commit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      writes: [
        {
          update: {
            name: docName,
            fields: {
              platform: { stringValue: payload.platform },
              url: { stringValue: payload.url },
              resolution: { stringValue: payload.resolution },
              status: { stringValue: payload.status },
              mediaType: { stringValue: payload.mediaType },
              title: { stringValue: payload.title },
              visitorId: { stringValue: payload.visitorId }
            }
          },
          updateTransforms: [
            { fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }
          ],
          currentDocument: { exists: false }
        }
      ]
    })
  });
  if (!res.ok) {
    throw new Error(`Activity commit HTTP ${res.status}`);
  }
}

// ---------- Public Firebase / Firestore API ----------

let viewRegistrationInFlight = false;

/**
 * Records exactly 1 view per browser/device for https://downloader-zero.vercel.app/
 * permanently in Firestore. Works both with Web SDK and REST fallback.
 */
export async function registerWebViewOnce(): Promise<void> {
  if (!isDownloaderWebContext() || viewRegistrationInFlight) return;

  try {
    if (localStorage.getItem(VIEW_COUNTED_STORAGE_KEY) === '1' || readCookie(VIEW_COOKIE_NAME) === '1') {
      return;
    }
  } catch {}

  viewRegistrationInFlight = true;
  try {
    const visitorId = getStableVisitorId();

    if (db) {
      const visitorRef = doc(db, 'web_visitors', visitorId);
      const statsRef = doc(db, 'site_stats', 'downloader_zero');

      await runTransaction(db, async (tx) => {
        const visitorSnap = await tx.get(visitorRef);
        if (visitorSnap.exists()) {
          return;
        }

        const statsSnap = await tx.get(statsRef);
        const currentViews =
          statsSnap.exists() && typeof statsSnap.data()?.totalViews === 'number'
            ? statsSnap.data().totalViews
            : 0;

        if (!statsSnap.exists()) {
          tx.set(statsRef, {
            domain: TARGET_WEB_DOMAIN,
            totalViews: 1,
            updatedAt: serverTimestamp()
          });
        } else {
          tx.update(statsRef, {
            domain: TARGET_WEB_DOMAIN,
            totalViews: currentViews + 1,
            updatedAt: serverTimestamp()
          });
        }

        tx.set(visitorRef, {
          visitorId,
          domain: TARGET_WEB_DOMAIN,
          createdAt: serverTimestamp()
        });
      });
    } else {
      await registerWebViewRest(visitorId);
    }

    try {
      localStorage.setItem(VIEW_COUNTED_STORAGE_KEY, '1');
    } catch {}
    writeCookie(VIEW_COOKIE_NAME, '1');
  } catch (err) {
    console.warn('[Firebase Viewing] Gagal mencatat kunjungan:', err);
  } finally {
    viewRegistrationInFlight = false;
  }
}

/**
 * Subscribes to live total view count for https://downloader-zero.vercel.app/.
 * Uses Firestore SDK when available, or live REST polling fallback if VITE_FIREBASE_API_KEY is unset.
 */
export function subscribeSiteViews(
  onUpdate: (views: number) => void,
  onError?: (message: string) => void
): Unsubscribe {
  if (cachedSiteViews !== null) {
    onUpdate(cachedSiteViews);
  }

  let disposed = false;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let unsubSdk: Unsubscribe | null = null;

  const startRestPolling = () => {
    if (disposed || pollTimer) return;
    const load = async () => {
      try {
        const count = await fetchSiteViewsRest();
        if (!disposed) {
          cachedSiteViews = count;
          onUpdate(count);
        }
      } catch (err: any) {
        if (!disposed && cachedSiteViews === null && onError) {
          onError(err?.message || 'Gagal memuat data kunjungan dari Firebase.');
        }
      }
    };
    void load();
    pollTimer = setInterval(() => {
      void load();
    }, 12000);
  };

  if (db) {
    const statsRef = doc(db, 'site_stats', 'downloader_zero');
    unsubSdk = onSnapshot(
      statsRef,
      (snap) => {
        if (disposed) return;
        if (snap.exists()) {
          const raw = snap.data()?.totalViews;
          const val = typeof raw === 'number' && !isNaN(raw) ? raw : 0;
          cachedSiteViews = val;
          onUpdate(val);
        } else {
          cachedSiteViews = 0;
          onUpdate(0);
        }
      },
      (err) => {
        console.warn('[Firebase Viewing] SDK listener fallback ke REST:', err);
        startRestPolling();
      }
    );
  } else {
    startRestPolling();
  }

  return () => {
    disposed = true;
    if (unsubSdk) unsubSdk();
    if (pollTimer) clearInterval(pollTimer);
  };
}

export interface LogDownloadActivityInput {
  platform: PlatformType | string;
  url: string;
  resolution: string;
  status: 'berhasil' | 'gagal';
  mediaType?: 'video' | 'audio' | 'photos' | 'file';
  title?: string;
}

/**
 * Records a single download attempt permanently into Firestore `download_activities`.
 */
export async function logDownloadActivity(input: LogDownloadActivityInput): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const visitorId = getStableVisitorId().slice(0, 64);
    const cleanPlatform = String(input.platform || 'unknown').trim().slice(0, 30) || 'unknown';
    const cleanUrl = String(input.url || '-').trim().slice(0, 1000) || '-';
    const cleanResolution = String(input.resolution || '-').trim().slice(0, 80) || '-';
    const cleanStatus: 'berhasil' | 'gagal' = input.status === 'berhasil' ? 'berhasil' : 'gagal';
    const cleanMediaType =
      input.mediaType === 'audio' || input.mediaType === 'photos' || input.mediaType === 'file'
        ? input.mediaType
        : 'video';
    const cleanTitle = String(input.title || '').trim().slice(0, 200);

    if (db) {
      await addDoc(collection(db, 'download_activities'), {
        platform: cleanPlatform,
        url: cleanUrl,
        resolution: cleanResolution,
        status: cleanStatus,
        mediaType: cleanMediaType,
        title: cleanTitle,
        visitorId,
        createdAt: serverTimestamp()
      });
    } else {
      await logDownloadActivityRest({
        platform: cleanPlatform,
        url: cleanUrl,
        resolution: cleanResolution,
        status: cleanStatus,
        mediaType: cleanMediaType,
        title: cleanTitle,
        visitorId
      });
    }
  } catch (err) {
    console.warn('[Firebase Activity] Gagal mencatat aktivitas unduhan:', err);
  }
}

/**
 * Subscribes to permanent download activity records for AdminPanelView.
 * Uses Firestore SDK when available, or live REST polling fallback if VITE_FIREBASE_API_KEY is unset.
 */
export function subscribeDownloadActivities(
  onUpdate: (items: DownloadActivityRecord[]) => void,
  onError?: (message: string) => void,
  maxItems = 500
): Unsubscribe {
  if (cachedDownloadActivities !== null) {
    onUpdate(cachedDownloadActivities);
  }

  let disposed = false;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let unsubSdk: Unsubscribe | null = null;

  const startRestPolling = () => {
    if (disposed || pollTimer) return;
    const load = async () => {
      try {
        const items = await fetchDownloadActivitiesRest(maxItems);
        if (!disposed) {
          cachedDownloadActivities = items;
          onUpdate(items);
        }
      } catch (err: any) {
        if (!disposed && cachedDownloadActivities === null && onError) {
          onError(err?.message || 'Gagal memuat aktivitas unduhan dari Firebase.');
        }
      }
    };
    void load();
    pollTimer = setInterval(() => {
      void load();
    }, 10000);
  };

  if (db) {
    const q = query(
      collection(db, 'download_activities'),
      orderBy('createdAt', 'desc'),
      limit(maxItems)
    );

    unsubSdk = onSnapshot(
      q,
      (snapshot) => {
        if (disposed) return;
        const items: DownloadActivityRecord[] = snapshot.docs.map((docSnap) => {
          const d = docSnap.data() || {};
          const ts = d.createdAt as Timestamp | undefined;
          const createdAtMs = ts && typeof ts.toMillis === 'function' ? ts.toMillis() : Date.now();
          return {
            id: docSnap.id,
            platform: String(d.platform || 'unknown'),
            url: String(d.url || '-'),
            resolution: String(d.resolution || '-'),
            status: d.status === 'gagal' ? 'gagal' : 'berhasil',
            mediaType:
              d.mediaType === 'audio' || d.mediaType === 'photos' || d.mediaType === 'file'
                ? d.mediaType
                : 'video',
            title: String(d.title || ''),
            visitorId: String(d.visitorId || ''),
            createdAtMs
          };
        });
        cachedDownloadActivities = items;
        onUpdate(items);
      },
      (err) => {
        console.warn('[Firebase Activity] SDK listener fallback ke REST:', err);
        startRestPolling();
      }
    );
  } else {
    startRestPolling();
  }

  return () => {
    disposed = true;
    if (unsubSdk) unsubSdk();
    if (pollTimer) clearInterval(pollTimer);
  };
}
