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

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: 'viewing-and-download.firebaseapp.com',
  projectId: 'viewing-and-download',
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

// Validate Firestore connection on boot
async function testConnection() {
  if (typeof window === 'undefined' || !db) return;
  try {
    await getDocFromServer(doc(db, 'site_stats', 'downloader_zero'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('[Firebase] Client is offline — check Firebase configuration.');
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
  // Dual 32-bit FNV-1a hash -> 16-char deterministic hex string
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

/**
 * Checks whether the current runtime is genuinely the DownloaderZero web app
 * opened by a real user browser (never triggers on bots or non-downloader origins).
 */
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

let viewRegistrationInFlight = false;

/**
 * Records exactly 1 view per browser/device for https://downloader-zero.vercel.app/
 * without authentication. Safe against page reloads, multi-tab spam, and localStorage resets.
 */
export async function registerWebViewOnce(): Promise<void> {
  if (!db || !isDownloaderWebContext() || viewRegistrationInFlight) return;

  try {
    if (localStorage.getItem(VIEW_COUNTED_STORAGE_KEY) === '1' || readCookie(VIEW_COOKIE_NAME) === '1') {
      return;
    }
  } catch {}

  viewRegistrationInFlight = true;
  try {
    const visitorId = getStableVisitorId();
    const visitorRef = doc(db, 'web_visitors', visitorId);
    const statsRef = doc(db, 'site_stats', 'downloader_zero');

    await runTransaction(db, async (tx) => {
      const visitorSnap = await tx.get(visitorRef);
      if (visitorSnap.exists()) {
        // Already counted for this device/browser
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
 * Subscribes to live total view count for https://downloader-zero.vercel.app/
 */
export function subscribeSiteViews(
  onUpdate: (views: number) => void,
  onError?: (message: string) => void
): Unsubscribe {
  if (!db) {
    onUpdate(0);
    return () => {};
  }
  const statsRef = doc(db, 'site_stats', 'downloader_zero');
  return onSnapshot(
    statsRef,
    (snap) => {
      if (snap.exists()) {
        const raw = snap.data()?.totalViews;
        onUpdate(typeof raw === 'number' && !isNaN(raw) ? raw : 0);
      } else {
        onUpdate(0);
      }
    },
    (err) => {
      console.warn('[Firebase Viewing] Listener error:', err);
      if (onError) {
        onError(err?.message || 'Gagal memuat data kunjungan dari Firebase.');
      }
    }
  );
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
 * Records a single download attempt into Firestore `download_activities` (no auth required).
 */
export async function logDownloadActivity(input: LogDownloadActivityInput): Promise<void> {
  if (typeof window === 'undefined' || !db) return;
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
  } catch (err) {
    console.warn('[Firebase Activity] Gagal mencatat aktivitas unduhan:', err);
  }
}

/**
 * Subscribes to live download activity records for AdminPanelView.
 */
export function subscribeDownloadActivities(
  onUpdate: (items: DownloadActivityRecord[]) => void,
  onError?: (message: string) => void,
  maxItems = 100
): Unsubscribe {
  if (!db) {
    onUpdate([]);
    return () => {};
  }
  const q = query(
    collection(db, 'download_activities'),
    orderBy('createdAt', 'desc'),
    limit(maxItems)
  );

  return onSnapshot(
    q,
    (snapshot) => {
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
      onUpdate(items);
    },
    (err) => {
      console.warn('[Firebase Activity] Listener error:', err);
      if (onError) {
        onError(err?.message || 'Gagal memuat aktivitas unduhan dari Firebase.');
      }
    }
  );
}
