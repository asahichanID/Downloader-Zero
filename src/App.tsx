/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import JSZip from 'jszip';
import { BannerDZ } from './components/BannerDZ.tsx';
import { UrlInputCard } from './components/UrlInputCard.tsx';
import { PlatformCards } from './components/PlatformCards.tsx';
import { TipPromoCard } from './components/TipPromoCard.tsx';
import { HistorySection } from './components/HistorySection.tsx';
import { BottomNavbar, type TabType } from './components/BottomNavbar.tsx';
import { FormatSelectorModal } from './components/FormatSelectorModal.tsx';
import { FloatingVideoPlayer } from './components/FloatingVideoPlayer.tsx';
import { FloatingSpotifyPlayer } from './components/FloatingSpotifyPlayer.tsx';
import { FloatingPhotoViewer } from './components/FloatingPhotoViewer.tsx';
import { SupportedPlatformsModal } from './components/SupportedPlatformsModal.tsx';
import { HistoryFullView } from './components/HistoryFullView.tsx';
import { SettingsFullView } from './components/SettingsFullView.tsx';
import { AdminPanelView } from './components/AdminPanelView.tsx';
import { TermsModal } from './components/TermsModal.tsx';
import {
  BerandaResultView,
  type BerandaStage,
  type PreparedDownloadPayload
} from './components/BerandaResultView.tsx';

import { detectPlatform, formatDuration, formatBytes, extractMedia, resolveTikTokDownload } from './services/scraper.ts';
import {
  getCachedExtract,
  setCachedExtract,
  getCachedPrepared,
  setCachedPrepared,
  invalidateCacheForUrl
} from './services/mediaCache.ts';
import {
  saveDownloadedMedia,
  getAllHistory,
  deleteHistoryItem,
  clearAllHistory,
  purgeExpiredHistoryItems
} from './services/historyStorage.ts';
import { registerWebViewOnce, logDownloadActivity } from './services/firebase.ts';
import { initAutoRefresh, AUTO_REFRESH_PENDING_KEY } from './services/autoRefresh.ts';
import type {
  PlatformType,
  MediaType,
  MediaMetadata,
  MediaFormat,
  HistoryItem,
  ServerMode,
  AudioTrack
} from './types/index.ts';

const PRESERVED_SESSION_KEY = 'dz_preserved_session_v1';

interface PreservedSessionState {
  savedAt: number;
  activeTab: TabType;
  isAdminPanelOpen: boolean;
  url: string;
  selectedPlatform: PlatformType;
  mediaType: MediaType;
  selectedVideoRes: string;
  selectedAudioQuality: string;
  mediaData: MediaMetadata | null;
  isFormatModalOpen: boolean;
  berandaStage: BerandaStage;
  preparedDownload: PreparedDownloadPayload | null;
  selectedTeraboxFileIds: string[];
  selectedSpotifyTrackId: string | null;
  pendingPreparingFormat?: MediaFormat | null;
  pendingExtractOnRestore?: boolean;
}

let cachedInitialSnapshot: PreservedSessionState | null | undefined;
function getInitialPreservedSession(): PreservedSessionState | null {
  if (cachedInitialSnapshot !== undefined) return cachedInitialSnapshot;
  if (typeof window === 'undefined') {
    cachedInitialSnapshot = null;
    return null;
  }
  try {
    const pending = sessionStorage.getItem(AUTO_REFRESH_PENDING_KEY);
    const raw = sessionStorage.getItem(PRESERVED_SESSION_KEY);
    if (pending === '1' && raw) {
      const parsed = JSON.parse(raw) as PreservedSessionState;
      if (parsed && typeof parsed.savedAt === 'number' && Date.now() - parsed.savedAt < 120_000) {
        cachedInitialSnapshot = parsed;
        return parsed;
      }
    }
  } catch {}
  cachedInitialSnapshot = null;
  return null;
}

export default function App() {
  const initialSnap = getInitialPreservedSession();

  // Navigation tab: 'beranda' | 'riwayat' | 'pengaturan'
  const [activeTab, setActiveTab] = useState<TabType>(() => initialSnap?.activeTab || 'beranda');

  // Input and Platform states
  const [url, setUrl] = useState<string>(() => initialSnap?.url || '');
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformType>(() => initialSnap?.selectedPlatform || 'youtube');
  const [mediaType, setMediaType] = useState<MediaType>(() => initialSnap?.mediaType || 'video');

  // Quality selection states
  const [selectedVideoRes, setSelectedVideoRes] = useState<string>(() => initialSnap?.selectedVideoRes || '1080p');
  const [selectedAudioQuality, setSelectedAudioQuality] = useState<string>(() => initialSnap?.selectedAudioQuality || '320');

  // Processing & Download states
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [berandaStage, setBerandaStage] = useState<BerandaStage>(() => {
    if (initialSnap?.berandaStage === 'preview' && initialSnap.preparedDownload) {
      return 'preview';
    }
    return 'idle';
  });
  const [preparedDownload, setPreparedDownload] = useState<PreparedDownloadPayload | null>(() =>
    initialSnap?.berandaStage === 'preview' ? initialSnap.preparedDownload : null
  );
  const [downloadProgress, setDownloadProgress] = useState<number>(() =>
    initialSnap?.berandaStage === 'preview' ? 100 : 0
  );
  const [downloadStatusText, setDownloadStatusText] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [completedCountdown, setCompletedCountdown] = useState<number>(3);
  const [completedLabel, setCompletedLabel] = useState<string>('');
  const [selectedTeraboxFileIds, setSelectedTeraboxFileIds] = useState<string[]>(() => initialSnap?.selectedTeraboxFileIds || []);
  const [selectedSpotifyTrackId, setSelectedSpotifyTrackId] = useState<string | null>(() => initialSnap?.selectedSpotifyTrackId ?? null);
  const [spotifyPlayTrigger, setSpotifyPlayTrigger] = useState<number>(0);
  const [spotifyTrackStatuses, setSpotifyTrackStatuses] = useState<Record<string, 'downloading' | 'done' | 'error'>>({});
  const [photoDownloadStatuses, setPhotoDownloadStatuses] = useState<Record<number, 'downloading' | 'done' | 'error'>>({});

  // Extracted media metadata
  const [mediaData, setMediaData] = useState<MediaMetadata | null>(() => initialSnap?.mediaData || null);

  // Modals state
  const [isFormatModalOpen, setIsFormatModalOpen] = useState<boolean>(() => Boolean(initialSnap?.isFormatModalOpen && initialSnap?.mediaData));
  const [isPlatformsModalOpen, setIsPlatformsModalOpen] = useState<boolean>(false);
  const [isTermsOpen, setIsTermsOpen] = useState<boolean>(false);
  const [termsDefaultTab, setTermsDefaultTab] = useState<'terms' | 'privacy'>('terms');

  // Admin access mode (unlocked via secret access code in Settings Server 1 input)
  const [isAdmin, setIsAdmin] = useState<boolean>(() => {
    try {
      return localStorage.getItem('dz_admin_access') === '1';
    } catch {
      return false;
    }
  });
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState<boolean>(() => Boolean(initialSnap?.isAdminPanelOpen));

  // Floating Player state (for video or Spotify-style audio)
  const [playingItem, setPlayingItem] = useState<HistoryItem | null>(null);

  // History list & count
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);

  // Refresh history items
  const loadHistory = async () => {
    try {
      await purgeExpiredHistoryItems();
      const items = await getAllHistory();
      setHistoryItems(items);
    } catch (err) {
      console.warn('Load history error:', err);
    }
  };

  const pendingPreparingFormatRef = useRef<MediaFormat | null>(null);
  const latestSessionRef = useRef<PreservedSessionState>({
    savedAt: Date.now(),
    activeTab,
    isAdminPanelOpen,
    url,
    selectedPlatform,
    mediaType,
    selectedVideoRes,
    selectedAudioQuality,
    mediaData,
    isFormatModalOpen,
    berandaStage,
    preparedDownload,
    selectedTeraboxFileIds,
    selectedSpotifyTrackId,
    pendingPreparingFormat: null,
    pendingExtractOnRestore: false
  });

  useEffect(() => {
    latestSessionRef.current = {
      savedAt: Date.now(),
      activeTab,
      isAdminPanelOpen,
      url,
      selectedPlatform,
      mediaType,
      selectedVideoRes,
      selectedAudioQuality,
      mediaData,
      isFormatModalOpen,
      berandaStage,
      preparedDownload,
      selectedTeraboxFileIds,
      selectedSpotifyTrackId,
      pendingPreparingFormat: berandaStage === 'preparing' ? pendingPreparingFormatRef.current : null,
      pendingExtractOnRestore: isLoading
    };
  }, [
    activeTab,
    isAdminPanelOpen,
    url,
    selectedPlatform,
    mediaType,
    selectedVideoRes,
    selectedAudioQuality,
    mediaData,
    isFormatModalOpen,
    berandaStage,
    preparedDownload,
    selectedTeraboxFileIds,
    selectedSpotifyTrackId,
    isLoading
  ]);

  const resumeActionsRef = useRef<{
    resumeExtract: () => void;
    resumeConfirm: (fmt: MediaFormat) => void;
  }>({
    resumeExtract: () => {},
    resumeConfirm: () => {}
  });

  useEffect(() => {
    try {
      sessionStorage.removeItem(AUTO_REFRESH_PENDING_KEY);
      sessionStorage.removeItem(PRESERVED_SESSION_KEY);
    } catch {}

    void registerWebViewOnce();
    const stopAutoRefresh = initAutoRefresh({
      isDownloading: () => latestSessionRef.current.berandaStage === 'downloading',
      onBeforeReload: () => {
        try {
          sessionStorage.setItem(
            PRESERVED_SESSION_KEY,
            JSON.stringify({
              ...latestSessionRef.current,
              savedAt: Date.now()
            })
          );
        } catch {}
      }
    });

    if (initialSnap?.pendingPreparingFormat && initialSnap.mediaData) {
      const fmt = initialSnap.pendingPreparingFormat;
      window.setTimeout(() => resumeActionsRef.current.resumeConfirm(fmt), 50);
    } else if (initialSnap?.pendingExtractOnRestore && initialSnap.url) {
      window.setTimeout(() => resumeActionsRef.current.resumeExtract(), 50);
    }

    loadHistory();
    const handleUpdate = () => loadHistory();
    window.addEventListener('dz_history_updated', handleUpdate);
    const expiryTimer = window.setInterval(() => {
      loadHistory();
    }, 60_000);
    return () => {
      stopAutoRefresh();
      window.removeEventListener('dz_history_updated', handleUpdate);
      window.clearInterval(expiryTimer);
    };
  }, []);

  // Theme setting with persistent localStorage
  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('dz_theme');
      return saved !== null ? saved === 'dark' : true;
    } catch {
      return true;
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    try {
      localStorage.setItem('dz_theme', isDark ? 'dark' : 'light');
    } catch (e) {
      console.warn('Theme storage error:', e);
    }

    if (isDark) {
      root.classList.add('dark');
      root.classList.remove('light');
      document.body.className = 'bg-[#050B18] text-slate-100 antialiased min-h-screen selection:bg-cyan-500/30 selection:text-cyan-200';
    } else {
      root.classList.remove('dark');
      root.classList.add('light');
      document.body.className = 'bg-[#f0f4fa] text-slate-900 antialiased min-h-screen selection:bg-cyan-500/30 selection:text-cyan-800';
    }
  }, [isDark]);

  // Server mode selection ('auto' | 'server1' | 'server2')
  const [serverMode, setServerMode] = useState<ServerMode>(() => {
    try {
      const saved = localStorage.getItem('dz_server_mode');
      if (saved === 'server1' || saved === 'server2' || saved === 'auto') {
        return saved;
      }
      return 'auto';
    } catch {
      return 'auto';
    }
  });
  const [isServer1Limited, setIsServer1Limited] = useState<boolean>(false);

  const refreshNeoxrStatus = useCallback(async (force = false, customKeyOverride?: string) => {
    try {
      const activeCustomKey =
        typeof customKeyOverride === 'string'
          ? customKeyOverride.trim()
          : (localStorage.getItem('dz_neoxr_api_key') || '').trim();
      const qs = new URLSearchParams();
      if (activeCustomKey) qs.set('apiKey', activeCustomKey);
      if (force) qs.set('force', '1');
      const res = await fetch(`/api/neoxr-status${qs.toString() ? `?${qs.toString()}` : ''}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.success) {
          const limited = Boolean(data.isLimited);
          setIsServer1Limited(limited);
          return limited;
        }
      }
    } catch {}
    return undefined;
  }, []);

  useEffect(() => {
    void refreshNeoxrStatus();
  }, [refreshNeoxrStatus]);

  useEffect(() => {
    if (activeTab === 'pengaturan' && !isAdminPanelOpen) {
      void refreshNeoxrStatus();
    }
  }, [activeTab, isAdminPanelOpen, refreshNeoxrStatus]);

  // If Server 1 API is at limit, allow inspecting/configuring Server 1 inside Settings,
  // but automatically switch to Server 2 whenever user leaves Settings or is elsewhere.
  useEffect(() => {
    const isInsideSettings = activeTab === 'pengaturan' && !isAdminPanelOpen;
    if (!isInsideSettings && isServer1Limited && serverMode === 'server1') {
      setServerMode('server2');
      try {
        localStorage.setItem('dz_server_mode', 'server2');
        window.dispatchEvent(new CustomEvent('dz_server_mode_changed', { detail: 'server2' }));
      } catch {}
    }
  }, [activeTab, isAdminPanelOpen, isServer1Limited, serverMode]);

  useEffect(() => {
    const handleServerModeChange = (e: any) => {
      const newMode = e.detail;
      if (newMode === 'auto' || newMode === 'server1' || newMode === 'server2') {
        setServerMode(newMode);
      }
    };
    window.addEventListener('dz_server_mode_changed', handleServerModeChange);
    return () => window.removeEventListener('dz_server_mode_changed', handleServerModeChange);
  }, []);

  // Banner video always-play preference (default: true / aktif)
  const [bannerAlwaysPlay, setBannerAlwaysPlay] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('dz_banner_always_play');
      return saved !== null ? saved === '1' : true;
    } catch {
      return true;
    }
  });

  // Auto-return to initial Beranda view 3 seconds after download completes
  useEffect(() => {
    if (berandaStage !== 'completed') return;

    setCompletedCountdown(3);
    const interval = setInterval(() => {
      setCompletedCountdown((prev) => (prev > 1 ? prev - 1 : 1));
    }, 1000);

    const resetTimer = setTimeout(() => {
      setBerandaStage('idle');
      setPreparedDownload(null);
      setMediaData(null);
      setUrl('');
      setDownloadProgress(0);
      setDownloadStatusText('');
      setErrorMessage(null);
      setCompletedLabel('');
      setSelectedTeraboxFileIds([]);
      setSelectedSpotifyTrackId(null);
    }, 3000);

    return () => {
      clearInterval(interval);
      clearTimeout(resetTimer);
    };
  }, [berandaStage]);

  const extractCleanUrl = (raw: string): string => {
    const trimmed = (raw || '').trim();
    const match = trimmed.match(/https?:\/\/[^\s<>"'`]+/i);
    return match ? match[0].replace(/[),.;!?]+$/, '') : trimmed;
  };

  // Handle URL change with auto platform detection (NO auto-select badge text!)
  const handleUrlChange = useCallback((newUrl: string) => {
    const hasShareText = /\s+https?:\/\//i.test(newUrl) || /https?:\/\/\S+\s+/i.test(newUrl);
    const cleaned = hasShareText ? extractCleanUrl(newUrl) : newUrl;
    setUrl(cleaned);
    setErrorMessage(null);

    if (cleaned.trim()) {
      const detected = detectPlatform(cleaned);
      if (detected !== 'unknown') {
        setSelectedPlatform(detected);
        if (detected === 'spotify') {
          setMediaType('audio');
        }
      }
    }
  }, []);

  // Helper to map MediaFormat to loader.to format
  const mapFormatForLoader = (fmt: MediaFormat): string => {
    if (fmt.type === 'audio') return 'mp3';
    const id = (fmt.id || '').toLowerCase();
    const res = (fmt.resolution || '').toLowerCase();
    const qual = (fmt.quality || '').toLowerCase();

    // Check 2K / 1440p explicitly first so 2K never gets overridden by 4K
    if (res === '2k' || res.includes('1440') || id.includes('1440') || id === 'tt-2k' || qual.includes('1440') || qual.includes('2k')) {
      return '1440';
    }
    if (id.includes('2160') || res.includes('2160') || res === '4k' || qual.includes('2160') || qual.includes('4k')) {
      return '2160';
    }
    if (id.includes('1080') || res.includes('1080') || qual.includes('1080')) {
      return '1080';
    }
    if (id.includes('720') || res.includes('720') || qual.includes('720')) {
      return '720';
    }
    if (id.includes('480') || res.includes('480') || qual.includes('480')) {
      return '480';
    }
    if (id.includes('360') || res.includes('360') || qual.includes('360')) {
      return '360';
    }
    return res.replace(/p$/i, '') || '1080';
  };

  const buildProxyHref = (
    targetUrl: string,
    filename: string,
    meta: MediaMetadata,
    inline: boolean,
    trackOverride?: AudioTrack,
    formatOverride?: MediaFormat
  ): string => {
    let href = `/api/proxy-download?url=${encodeURIComponent(targetUrl)}&filename=${encodeURIComponent(filename)}&platform=${encodeURIComponent(meta.platform)}&sourceUrl=${encodeURIComponent(meta.url)}&server=${encodeURIComponent(serverMode)}`;
    if (inline) {
      href += '&inline=1';
    }
    const bitrateMatch =
      (formatOverride?.resolution || '').match(/(320|256|192|128|64)/) ||
      (formatOverride?.quality || '').match(/(320|256|192|128|64)\s*k/i) ||
      (formatOverride?.id || '').match(/(320|256|192|128|64)/) ||
      String(selectedAudioQuality || '').match(/(320|256|192|128|64)/);
    const bitrate = bitrateMatch ? `${bitrateMatch[1]}k` : (meta.platform === 'spotify' ? '320k' : '192k');

    if (meta.platform === 'spotify') {
      const customKey = localStorage.getItem('dz_neoxr_api_key') || '';
      const tTitle = trackOverride?.title || meta.title || '';
      const tArtist = trackOverride?.artist || meta.author || '';
      const tAlbum = trackOverride?.album || meta.album || '';
      const tGenre = trackOverride?.genre || meta.genre || 'Pop';
      const tYear = trackOverride?.releaseDate || meta.releaseDate || '';
      const tCover = trackOverride?.thumbnail || meta.thumbnail || '';
      const tDuration = trackOverride?.duration || meta.duration || 0;
      href += `&bitrate=${encodeURIComponent(bitrate)}&title=${encodeURIComponent(tTitle)}&artist=${encodeURIComponent(tArtist)}&album=${encodeURIComponent(tAlbum)}&genre=${encodeURIComponent(tGenre)}&year=${encodeURIComponent(tYear)}&cover=${encodeURIComponent(tCover)}&duration=${tDuration}&apiKey=${encodeURIComponent(customKey)}`;
    } else if (formatOverride?.type === 'audio' || filename.toLowerCase().endsWith('.mp3')) {
      href += `&bitrate=${encodeURIComponent(bitrate)}&title=${encodeURIComponent(meta.title || '')}&artist=${encodeURIComponent(meta.author || '')}`;
    } else if (formatOverride?.dashAudioUrl && formatOverride.dashAudioUrl.startsWith('http')) {
      href += `&audioUrl=${encodeURIComponent(formatOverride.dashAudioUrl)}`;
    }
    return href;
  };

  const triggerBlobDownload = (blob: Blob, filename: string) => {
    const blobUrl = URL.createObjectURL(blob);
    const dlLink = document.createElement('a');
    dlLink.href = blobUrl;
    dlLink.download = filename;
    document.body.appendChild(dlLink);
    dlLink.click();
    setTimeout(() => {
      try {
        document.body.removeChild(dlLink);
        URL.revokeObjectURL(blobUrl);
      } catch {}
    }, 30000);
  };

  const triggerDirectDownloadFallback = (directUrl: string, filename: string) => {
    const dlLink = document.createElement('a');
    dlLink.href = directUrl;
    dlLink.target = '_blank';
    dlLink.rel = 'noreferrer noopener';
    dlLink.download = filename;
    document.body.appendChild(dlLink);
    dlLink.click();
    setTimeout(() => {
      try {
        document.body.removeChild(dlLink);
      } catch {}
    }, 5000);
  };

  const enterPreviewStage = (meta: MediaMetadata, fmt: MediaFormat, resolvedUrl: string) => {
    const ext = fmt.extension || (fmt.type === 'audio' ? 'mp3' : 'mp4');
    const previewProxyUrl = buildProxyHref(resolvedUrl, `preview.${ext}`, meta, true, undefined, fmt);
    if (meta.platform === 'terabox') {
      const firstId = meta.files?.[0]?.id || meta.id;
      setSelectedTeraboxFileIds(firstId ? [firstId] : []);
    } else {
      setSelectedTeraboxFileIds([]);
    }
    if (meta.platform === 'spotify' && meta.tracks && meta.tracks.length > 0) {
      setSelectedSpotifyTrackId(meta.tracks[0].id);
      setSpotifyPlayTrigger(0);
      setSpotifyTrackStatuses({});
    } else {
      setSelectedSpotifyTrackId(null);
      setSpotifyPlayTrigger(0);
      setSpotifyTrackStatuses({});
    }
    setPhotoDownloadStatuses({});
    setPreparedDownload({
      media: meta,
      format: fmt,
      resolvedUrl,
      previewProxyUrl
    });
    setDownloadProgress(100);
    setDownloadStatusText('');
    setBerandaStage('preview');
  };

  const handleBackFromPreview = useCallback(() => {
    setBerandaStage((prev) => (prev === 'preview' ? 'idle' : prev));
    setErrorMessage(null);
    setDownloadStatusText('');
  }, []);

  const openAfterExtraction = (meta: MediaMetadata) => {
    setMediaData(meta);
    setSelectedPlatform(meta.platform);
    if (meta.platform === 'spotify') {
      setMediaType('audio');
    } else if (meta.platform === 'twitter') {
      setMediaType('video');
      const topTwitterVideo = meta.formats.find((f) => f.type === 'video' && f.resolution);
      if (topTwitterVideo?.resolution) {
        setSelectedVideoRes(topTwitterVideo.resolution);
      }
    } else if (meta.platform === 'youtube' || meta.platform === 'instagram' || meta.platform === 'pinterest') {
      const resVideos = meta.formats.filter((f) => f.type === 'video' && f.resolution);
      if (resVideos.length > 0) {
        const curLower = selectedVideoRes.toLowerCase();
        const curMatch = resVideos.find((f) => {
          const r = (f.resolution || '').toLowerCase();
          if (r === curLower) return true;
          if ((r === '4k' || r.includes('2160')) && (curLower === '4k' || curLower.includes('2160'))) return true;
          if ((r === '2k' || r.includes('1440')) && (curLower === '2k' || curLower.includes('1440'))) return true;
          return false;
        });
        if (curMatch?.resolution) {
          setSelectedVideoRes(curMatch.resolution);
        } else {
          const fallbackRes =
            resVideos.find((f) => f.resolution === '1080p') ||
            resVideos.find((f) => f.resolution === '720p') ||
            resVideos[0];
          if (fallbackRes?.resolution) {
            setSelectedVideoRes(fallbackRes.resolution);
          }
        }
      }
    }

    if (meta.platform === 'terabox' && meta.formats[0]) {
      enterPreviewStage(meta, meta.formats[0], meta.formats[0].url);
      return;
    }
    if (meta.platform === 'spotify' && meta.isAudioPlaylist && meta.formats[0]) {
      enterPreviewStage(meta, meta.formats[0], meta.formats[0].url);
      return;
    }
    const photoFmt = meta.formats.find((f) => f.type === 'photos');
    const hasVideoFmt = meta.formats.some((f) => f.type === 'video');
    if (photoFmt && (meta.isPhotoSlide || !hasVideoFmt)) {
      enterPreviewStage(meta, photoFmt, photoFmt.url);
      return;
    }
    setIsFormatModalOpen(true);
  };

  // When clicking the main "Download" button on Beranda:
  // Checks expiration-aware cache first so returning back and using the same link makes ZERO API requests
  const handleDownloadButtonClick = async () => {
    if (berandaStage !== 'idle' || isLoading) return;

    const trimmed = extractCleanUrl(url);
    if (!trimmed) {
      setErrorMessage('Silakan tempelkan link video atau audio terlebih dahulu.');
      return;
    }
    if (trimmed !== url) {
      setUrl(trimmed);
    }

    setErrorMessage(null);

    const customKey = localStorage.getItem('dz_neoxr_api_key') || '';
    const cachedMeta = getCachedExtract(trimmed, serverMode, customKey);
    if (cachedMeta) {
      openAfterExtraction(cachedMeta);
      return;
    }

    setIsLoading(true);
    try {
      let meta: MediaMetadata | null = null;

      let backendExplicitError: string | null = null;
      try {
        const response = await fetch('/api/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: trimmed, apiKey: customKey, server: serverMode })
        });

        const ct = response.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          const result = await response.json();
          if (response.ok && result && result.success && result.data) {
            meta = result.data;
          } else if (result?.error && response.status >= 400) {
            backendExplicitError = result.error;
          }
        }
      } catch (backendErr) {
        console.warn('Backend extract notice, falling back to direct client extractor:', backendErr);
      }

      if (backendExplicitError) {
        throw new Error(backendExplicitError);
      }

      // Client-side fallback: extract directly in client only if backend endpoint was unavailable
      if (!meta) {
        meta = await extractMedia(trimmed, customKey, serverMode);
      }

      if (!meta) {
        throw new Error('Gagal mengekstrak media dari link yang diberikan.');
      }

      setCachedExtract(trimmed, serverMode, customKey, meta);
      if (meta.url && meta.url !== trimmed) {
        setCachedExtract(meta.url, serverMode, customKey, meta);
      }
      openAfterExtraction(meta);
    } catch (err: any) {
      console.error('Extraction error:', err);
      const errMsg = err.message || 'Terjadi kesalahan saat memeriksa tautan.';
      setErrorMessage(errMsg);
      if (/limit|habis|server 1/i.test(errMsg)) {
        void refreshNeoxrStatus(true);
      }
      const detected = detectPlatform(trimmed);
      void logDownloadActivity({
        platform: detected !== 'unknown' ? detected : selectedPlatform,
        url: trimmed,
        resolution: mediaType === 'audio' ? `${selectedAudioQuality} kbps` : selectedVideoRes,
        status: 'gagal',
        mediaType,
        title: ''
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Prepare media stream & switch Beranda view to Preview Result View (uses cache if URL is still valid)
  const handleConfirmDownload = async (targetFormat: MediaFormat) => {
    if (!mediaData || berandaStage !== 'idle') return;

    const customKey = localStorage.getItem('dz_neoxr_api_key') || '';
    const cachedPrep = getCachedPrepared(mediaData.url, targetFormat, serverMode, customKey);
    if (cachedPrep) {
      setIsFormatModalOpen(false);
      setErrorMessage(null);
      enterPreviewStage(cachedPrep.media, cachedPrep.format, cachedPrep.resolvedUrl);
      return;
    }

    pendingPreparingFormatRef.current = targetFormat;
    setIsFormatModalOpen(false);
    setErrorMessage(null);
    setBerandaStage('preparing');
    setDownloadProgress(20);
    setDownloadStatusText(`Menyiapkan pratinjau ${targetFormat.quality || targetFormat.resolution}...`);

    try {
      let resolvedFormat: MediaFormat = targetFormat;
      let finalUrl = targetFormat.url;
      let jobId = targetFormat.jobId;
      let startJobError = '';

      if (!finalUrl || !finalUrl.startsWith('http') || targetFormat.needsResolution) {
        const loaderFormat = mapFormatForLoader(targetFormat);
        setDownloadStatusText(`Menyiapkan ${targetFormat.quality}...`);
        try {
          const startRes = await fetch('/api/start-job', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              platform: mediaData.platform,
              format: loaderFormat,
              formatId: targetFormat.id,
              resolution: targetFormat.resolution,
              quality: targetFormat.quality,
              type: targetFormat.type,
              url: mediaData.url,
              server: serverMode,
              apiKey: customKey
            })
          });
          const ct = startRes.headers.get('content-type') || '';
          if (ct.includes('application/json')) {
            const startData = await startRes.json();
            if (startRes.ok && startData.downloadUrl) {
              finalUrl = startData.downloadUrl;
              resolvedFormat = {
                ...resolvedFormat,
                url: finalUrl,
                ...(typeof startData.dashAudioUrl === 'string' && startData.dashAudioUrl.startsWith('http')
                  ? { dashAudioUrl: startData.dashAudioUrl }
                  : {})
              };
            } else if (startRes.ok && startData.id) {
              jobId = startData.id;
            } else if (startData?.error) {
              startJobError = startData.error;
            }
          }
        } catch (e: any) {
          console.warn('Start job notice:', e);
        }

        // Poll progress if jobId exists
        if (jobId && (!finalUrl || !finalUrl.startsWith('http'))) {
          setDownloadStatusText('Sedang menyiapkan media...');
          let finished = false;
          let attempts = 0;

          while (!finished && attempts < 25) {
            attempts++;
            await new Promise((r) => setTimeout(r, 1000));
            setDownloadProgress((prev) => Math.min(85, prev + 3));

            try {
              const progRes = await fetch(`/api/progress/${encodeURIComponent(jobId)}`);
              if (progRes.ok) {
                const pData = await progRes.json();
                if (pData.success && pData.downloadUrl) {
                  finalUrl = pData.downloadUrl;
                  finished = true;
                  break;
                } else if (pData.statusText) {
                  setDownloadStatusText(pData.statusText);
                }
              }
            } catch (e) {
              console.warn('Progress poll notice:', e);
            }
          }
        }

        // TikTok direct client fallback if start-job not resolved
        if (!finalUrl && (mediaData.platform === 'tiktok' || detectPlatform(mediaData.url) === 'tiktok')) {
          try {
            const resolved = await resolveTikTokDownload(
              mediaData.url,
              targetFormat.id || 'tt-1080',
              targetFormat.resolution || '1080p',
              targetFormat.type || 'video',
              serverMode,
              customKey
            );
            if (resolved && resolved.downloadUrl) {
              finalUrl = resolved.downloadUrl;
            }
          } catch (ttErr) {
            console.warn('Direct TikTok resolution notice:', ttErr);
          }
        }
      }

      // Direct fallback to best available format from metadata if still missing
      if (!finalUrl || !finalUrl.startsWith('http')) {
        const directFallback = mediaData.formats.find(
          (f) => f.isDirect && f.url && f.url.startsWith('http') && !f.url.includes('loader.to')
        );
        if (directFallback) {
          finalUrl = directFallback.url;
        }
      }

      if (!finalUrl || typeof finalUrl !== 'string' || !finalUrl.startsWith('http')) {
        throw new Error(startJobError || 'Tautan media tidak tersedia dari server sumber saat ini.');
      }

      setCachedPrepared(mediaData.url, resolvedFormat, serverMode, customKey, mediaData, finalUrl);
      setDownloadProgress(95);
      setDownloadStatusText('Memuat pratinjau...');
      enterPreviewStage(mediaData, resolvedFormat, finalUrl);
    } catch (err: any) {
      console.error('Prepare preview error:', err);
      void logDownloadActivity({
        platform: mediaData.platform,
        url: mediaData.url,
        resolution: targetFormat.resolution || targetFormat.quality || '-',
        status: 'gagal',
        mediaType: targetFormat.type,
        title: mediaData.title || ''
      });
      invalidateCacheForUrl(mediaData.url);
      if (url.trim() && url.trim() !== mediaData.url) {
        invalidateCacheForUrl(url.trim());
      }
      setBerandaStage('idle');
      setPreparedDownload(null);
      setDownloadProgress(0);
      setDownloadStatusText('');
      setErrorMessage(err.message || 'Gagal menyiapkan pratinjau media.');
    } finally {
      pendingPreparingFormatRef.current = null;
    }
  };

  resumeActionsRef.current = {
    resumeExtract: () => {
      void handleDownloadButtonClick();
    },
    resumeConfirm: (fmt: MediaFormat) => {
      void handleConfirmDownload(fmt);
    }
  };

  // Fetch binary blob with live streaming progress
  const fetchBlobWithProgress = async (
    downloadHref: string,
    progressStart: number,
    progressSpan: number
  ): Promise<Blob | null> => {
    const dlResponse = await fetch(downloadHref);
    if (!dlResponse.ok) {
      const ctErr = (dlResponse.headers.get('content-type') || '').toLowerCase();
      let errMsg = '';
      if (ctErr.includes('application/json')) {
        const j = await dlResponse.json().catch(() => null);
        errMsg = j?.error || '';
      } else if (ctErr.includes('text/')) {
        errMsg = await dlResponse.text().catch(() => '');
      }
      throw new Error(errMsg || `Server gagal mengunduh berkas (HTTP ${dlResponse.status}).`);
    }
    const contentType = dlResponse.headers.get('content-type') || '';
    if (contentType.includes('application/json')) return null;

    const totalBytes = Number(dlResponse.headers.get('content-length')) || 0;
    if (dlResponse.body && typeof dlResponse.body.getReader === 'function') {
      const reader = dlResponse.body.getReader();
      const chunks: Uint8Array[] = [];
      let received = 0;
      let lastPct = progressStart;
      let lastTickAt = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          received += value.length;
          const now = performance.now();
          if (now - lastTickAt >= 100) {
            if (totalBytes > 0) {
              const pct = Math.min(
                progressStart + progressSpan,
                progressStart + Math.round((received / totalBytes) * progressSpan)
              );
              if (pct !== lastPct) {
                lastPct = pct;
                lastTickAt = now;
                setDownloadProgress(pct);
              }
            } else {
              lastTickAt = now;
              setDownloadProgress((prev) => Math.min(progressStart + progressSpan - 5, prev + 2));
            }
          }
        }
      }

      const blob = new Blob(chunks as BlobPart[], { type: contentType || 'application/octet-stream' });
      if (blob.size >= 120 || !blob.type.includes('text')) {
        return blob;
      }
      return null;
    }

    const blob = await dlResponse.blob();
    if (blob.size >= 120 || !blob.type.includes('text')) {
      return blob;
    }
    return null;
  };

  // Toggle TeraBox file selection (minimum 1 kept selected, maximum 2 files allowed)
  const handleToggleTeraboxFile = (fileId: string) => {
    setSelectedTeraboxFileIds((prev) => {
      if (prev.includes(fileId)) {
        if (prev.length === 1) return prev;
        return prev.filter((id) => id !== fileId);
      }
      if (prev.length >= 2) {
        return [prev[1], fileId];
      }
      return [...prev, fileId];
    });
  };

  // Handle Spotify track selection (preview playback only)
  const handleSelectSpotifyTrack = (track: AudioTrack) => {
    setSelectedSpotifyTrackId(track.id);
    setSpotifyPlayTrigger((prev) => prev + 1);
  };

  // Resolve canonical full-song Spotify track URL (never mp3-preview)
  const getSpotifyCanonicalTrackUrl = (track: AudioTrack, fallbackUrl: string): string => {
    if (track.url?.startsWith('http') && !track.url.includes('mp3-preview')) {
      return track.url;
    }
    const trackId = track.id?.replace(/^sp-track-/, '') || '';
    if (trackId && !trackId.startsWith('sp-')) {
      return `https://open.spotify.com/track/${trackId}`;
    }
    return fallbackUrl;
  };

  // Download 1 individual full song from Spotify playlist row button
  const handleDownloadSingleSpotifyTrack = async (track: AudioTrack) => {
    if (!preparedDownload) return;
    const { media, format: targetFormat } = preparedDownload;
    const trackId = track.id;

    setSpotifyTrackStatuses((prev) => ({ ...prev, [trackId]: 'downloading' }));
    setErrorMessage(null);

    try {
      const effectiveUrl = getSpotifyCanonicalTrackUrl(track, media.url);
      const brMatch =
        (targetFormat?.resolution || '').match(/(320|256|192|128|64)/) ||
        (targetFormat?.id || '').match(/(320|256|192|128|64)/) ||
        String(selectedAudioQuality || '').match(/(320|256|192|128|64)/);
      const activeKbps = brMatch ? brMatch[1] : '320';
      const safeTitle = (track.title || 'Spotify_Track').slice(0, 40).replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `DownloaderZero_${safeTitle}_${activeKbps}kbps.mp3`;
      const downloadHref = buildProxyHref(effectiveUrl, filename, media, false, track, targetFormat);

      const res = await fetch(downloadHref);
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(errText || `Gagal mengunduh "${track.title}" (HTTP ${res.status}).`);
      }
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('text/html')) {
        throw new Error(`Respon server tidak valid untuk "${track.title}".`);
      }
      const mp3Blob = await res.blob();
      if (mp3Blob.size < 10000) {
        throw new Error(`File audio "${track.title}" terlalu kecil.`);
      }

      triggerBlobDownload(mp3Blob, filename);
      setSpotifyTrackStatuses((prev) => ({ ...prev, [trackId]: 'done' }));

      await saveDownloadedMedia({
        sourceUrl: effectiveUrl || media.url,
        platform: 'spotify',
        title: track.title || media.title,
        author: track.artist || media.author,
        artist: track.artist || media.author,
        album: track.album || media.album,
        thumbnail: track.thumbnail || media.thumbnail || '',
        duration: track.duration || 200,
        durationFormatted: track.durationFormatted || formatDuration(track.duration || 200),
        quality: `${activeKbps} kbps (MP3 Lagu Penuh)`,
        resolution: `${activeKbps} kbps`,
        mediaType: 'audio',
        extension: 'mp3',
        filename,
        filesize: formatBytes(mp3Blob.size),
        filesizeBytes: mp3Blob.size,
        downloadUrl: effectiveUrl,
        blob: mp3Blob
      }).catch(() => {});

      await loadHistory();
      void logDownloadActivity({
        platform: 'spotify',
        url: effectiveUrl,
        resolution: `${activeKbps} kbps`,
        status: 'berhasil',
        mediaType: 'audio',
        title: `${track.artist} - ${track.title}`
      });
    } catch (err: any) {
      console.warn('[Spotify Playlist] Single track download error:', err);
      setSpotifyTrackStatuses((prev) => ({ ...prev, [trackId]: 'error' }));
      setErrorMessage(err?.message || `Gagal mengunduh "${track.title}".`);
    }
  };

  // Download 1 individual slide photo by serial number (does NOT wrap in ZIP)
  const handleDownloadSingleSlidePhoto = async (photoUrl: string, slideIndex: number) => {
    if (!preparedDownload || !photoUrl || !photoUrl.startsWith('http')) return;
    const { media } = preparedDownload;
    const slideNumber = slideIndex + 1;

    setPhotoDownloadStatuses((prev) => ({ ...prev, [slideIndex]: 'downloading' }));
    setErrorMessage(null);

    try {
      const extMatch = photoUrl.match(/\.(png|jpg|jpeg)(?:[?#]|$)/i);
      const rawExt = extMatch ? extMatch[1].toLowerCase() : 'jpg';
      const ext: 'jpg' | 'png' = rawExt === 'png' ? 'png' : 'jpg';

      const sanitizedTitle = (media.title || 'Media_Foto').slice(0, 35).replace(/[^a-zA-Z0-9_-]/g, '_');
      const serialTag = String(slideNumber).padStart(2, '0');
      const activePhotoResLabel = 'Ultra HD';
      const activeResSlug = 'Ultra_HD';
      const filename = `DownloaderZero_${sanitizedTitle}_foto_${serialTag}_${activeResSlug}.${ext}`;
      const downloadHref = buildProxyHref(photoUrl, filename, media, false);

      const res = await fetch(downloadHref);
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(errText || `Gagal mengunduh Foto #${slideNumber} (HTTP ${res.status}).`);
      }
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('text/html') || ct.includes('application/json')) {
        throw new Error(`Respon server tidak valid untuk Foto #${slideNumber}.`);
      }

      const imgBlob = await res.blob();
      if (imgBlob.size < 500) {
        throw new Error(`Berkas Foto #${slideNumber} tidak valid atau terlalu kecil.`);
      }

      triggerBlobDownload(imgBlob, filename);
      setPhotoDownloadStatuses((prev) => ({ ...prev, [slideIndex]: 'done' }));

      await saveDownloadedMedia({
        sourceUrl: media.url,
        platform: media.platform,
        title: `${media.title || 'Foto Slide'} (Foto #${slideNumber})`,
        author: media.author || media.platform,
        thumbnail: photoUrl || media.thumbnail || '',
        quality: `Foto #${slideNumber} · ${activePhotoResLabel}`,
        resolution: `Foto #${slideNumber} (${activePhotoResLabel})`,
        mediaType: 'photos',
        extension: ext,
        filename,
        filesize: formatBytes(imgBlob.size),
        filesizeBytes: imgBlob.size,
        downloadUrl: photoUrl,
        blob: imgBlob
      }).catch(() => {});

      await loadHistory();
      void logDownloadActivity({
        platform: media.platform,
        url: media.url,
        resolution: `Foto #${slideNumber} ${activePhotoResLabel}`,
        status: 'berhasil',
        mediaType: 'photos',
        title: `${media.title || 'Foto Slide'} #${slideNumber}`
      });
    } catch (err: any) {
      console.warn('[Photo Slide] Single photo download error:', err);
      setPhotoDownloadStatuses((prev) => ({ ...prev, [slideIndex]: 'error' }));
      setErrorMessage(err?.message || `Gagal mengunduh Foto #${slideNumber}.`);
    }
  };

  // Download ALL tracks in Spotify playlist into 1 ZIP archive using max 10 concurrent queue
  const handleDownloadAllSpotifyZip = async () => {
    if (berandaStage !== 'preview' || !preparedDownload) return;
    const { media, format: targetFormat } = preparedDownload;
    const tracks = media.tracks || [];
    if (tracks.length === 0) return;

    setErrorMessage(null);
    setBerandaStage('downloading');
    setDownloadProgress(6);
    const total = tracks.length;
    const MAX_CONCURRENT = Math.min(10, total);
    setDownloadStatusText(
      total > 10
        ? `Menyiapkan antrean ${total} lagu penuh (maks 10 paralel, sisanya mengantri)...`
        : `Mengunduh ${total} lagu penuh secara paralel...`
    );

    try {
      const results: Array<{ index: number; entryName: string; blob: Blob } | null> = new Array(total).fill(null);
      let nextCursor = 0;
      let finishedCount = 0;
      let successCount = 0;

      const fetchSingleTrackWithRetry = async (trk: AudioTrack, idx: number): Promise<Blob | null> => {
        const effectiveUrl = getSpotifyCanonicalTrackUrl(trk, media.url);
        const safeTrackName = (trk.title || `Track_${idx + 1}`).slice(0, 45).replace(/[^a-zA-Z0-9._ -]/g, '_').trim();
        const downloadHref = buildProxyHref(effectiveUrl, `${safeTrackName}.mp3`, media, false, trk, targetFormat);

        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const res = await fetch(downloadHref);
            if (!res.ok) continue;
            const ct = (res.headers.get('content-type') || '').toLowerCase();
            if (ct.includes('text/html')) continue;
            const blob = await res.blob();
            if (blob.size >= 10000) {
              return blob;
            }
          } catch {}
          await new Promise((r) => setTimeout(r, 400));
        }
        return null;
      };

      const worker = async () => {
        while (true) {
          const idx = nextCursor;
          nextCursor += 1;
          if (idx >= total) break;

          const trk = tracks[idx];
          const blob = await fetchSingleTrackWithRetry(trk, idx);
          if (blob) {
            const cleanArtist = (trk.artist || 'Artist').slice(0, 30).replace(/[\\/:*?"<>|]/g, '_').trim();
            const cleanTitle = (trk.title || `Track_${idx + 1}`).slice(0, 45).replace(/[\\/:*?"<>|]/g, '_').trim();
            const entryName = `${String(idx + 1).padStart(2, '0')}_${cleanArtist} - ${cleanTitle}.mp3`;
            results[idx] = { index: idx, entryName, blob };
            successCount += 1;
          }

          finishedCount += 1;
          const remainingQueue = Math.max(0, total - finishedCount);
          setDownloadProgress(8 + Math.round((finishedCount / total) * 76));
          setDownloadStatusText(
            remainingQueue > 0 && total > 10
              ? `Mengunduh ${finishedCount} / ${total} lagu (${successCount} selesai · ${remainingQueue} dalam antrean)...`
              : `Mengunduh ${finishedCount} / ${total} lagu penuh (${successCount} berhasil)...`
          );
        }
      };

      // Launch worker pool capped at max 10 concurrent downloads
      await Promise.all(Array.from({ length: MAX_CONCURRENT }, () => worker()));

      if (successCount === 0) {
        throw new Error('Gagal mengunduh lagu-lagu dari playlist Spotify. Silakan coba lagi.');
      }

      setDownloadProgress(88);
      setDownloadStatusText(`Mengemas ${successCount} lagu penuh MP3 ke dalam 1 file ZIP...`);

      const zip = new JSZip();
      const sanitizedPlaylist = (media.title || 'Spotify_Playlist').slice(0, 35).replace(/[^a-zA-Z0-9_-]/g, '_');
      const folder = zip.folder(sanitizedPlaylist) || zip;

      for (const item of results) {
        if (item) {
          folder.file(item.entryName, item.blob);
        }
      }

      // Use STORE (fast) because MP3 frames are already compressed
      const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'STORE'
      });

      const zipFilename = `DownloaderZero_${sanitizedPlaylist}_${successCount}Lagu.zip`;
      triggerBlobDownload(zipBlob, zipFilename);

      const brZipMatch =
        (targetFormat?.resolution || '').match(/(320|256|192|128|64)/) ||
        (targetFormat?.id || '').match(/(320|256|192|128|64)/) ||
        String(selectedAudioQuality || '').match(/(320|256|192|128|64)/);
      const zipKbps = brZipMatch ? brZipMatch[1] : '320';

      await saveDownloadedMedia({
        sourceUrl: media.url,
        platform: 'spotify',
        title: `${media.title || 'Playlist Spotify'} (${successCount} Lagu MP3)`,
        author: media.author || 'Spotify Playlist',
        album: media.album || media.title,
        thumbnail: media.thumbnail || tracks[0]?.thumbnail || '',
        quality: `${successCount} Lagu MP3 (ZIP)`,
        resolution: `${zipKbps} kbps ZIP`,
        mediaType: 'audio',
        extension: 'zip',
        filename: zipFilename,
        filesize: formatBytes(zipBlob.size),
        filesizeBytes: zipBlob.size,
        downloadUrl: media.url,
        blob: zipBlob
      }).catch(() => {});

      await loadHistory();
      void logDownloadActivity({
        platform: 'spotify',
        url: media.url,
        resolution: `${successCount}/${total} Lagu ZIP`,
        status: 'berhasil',
        mediaType: 'audio',
        title: media.title || 'Playlist Spotify'
      });

      setDownloadProgress(100);
      setDownloadStatusText('Unduhan selesai!');
      setCompletedLabel(
        successCount === total
          ? `${successCount} Lagu Terunduh (ZIP)!`
          : `${successCount} dari ${total} Lagu Terunduh (ZIP)!`
      );
      setBerandaStage('completed');
    } catch (err: any) {
      console.error('Spotify playlist ZIP error:', err);
      void logDownloadActivity({
        platform: 'spotify',
        url: media.url,
        resolution: `${total} Lagu ZIP`,
        status: 'gagal',
        mediaType: 'audio',
        title: media.title || 'Playlist Spotify'
      });
      setBerandaStage('preview');
      setDownloadProgress(0);
      setDownloadStatusText('');
      setErrorMessage(err?.message || 'Gagal mengunduh playlist Spotify menjadi ZIP.');
    }
  };

  // Execute actual download when user clicks the "Download" button in BerandaResultView
  const handleExecuteActualDownload = async () => {
    if (berandaStage !== 'preview' || !preparedDownload) return;

    const { media, format: targetFormat, resolvedUrl } = preparedDownload;
    setErrorMessage(null);
    setBerandaStage('downloading');
    setDownloadProgress(10);
    setDownloadStatusText('Mengunduh berkas media...');

    try {
      // CASE A: TeraBox (1 or 2 selected files)
      if (media.platform === 'terabox') {
        const allFiles = media.files && media.files.length > 0
          ? media.files
          : [{
              id: media.id,
              filename: media.title || 'TeraBox_File.mp4',
              size: targetFormat.filesize,
              sizeBytes: targetFormat.filesizeBytes,
              extension: targetFormat.extension || 'mp4',
              thumbnail: media.thumbnail,
              duration: media.duration,
              durationFormatted: media.durationFormatted,
              url: resolvedUrl || targetFormat.url,
              mediaType: targetFormat.type === 'audio' ? 'audio' as const : targetFormat.type === 'photos' ? 'photos' as const : 'video' as const
            }];

        const chosenFiles = allFiles.filter((f) => selectedTeraboxFileIds.includes(f.id));
        const filesToDownload = chosenFiles.length > 0 ? chosenFiles : [allFiles[0]];

        for (let i = 0; i < filesToDownload.length; i++) {
          const tbFile = filesToDownload[i];
          const basePct = 10 + Math.round((i / filesToDownload.length) * 80);
          const spanPct = Math.round(75 / filesToDownload.length);
          setDownloadProgress(basePct);
          setDownloadStatusText(
            filesToDownload.length > 1
              ? `Mengunduh file ${i + 1} dari ${filesToDownload.length}: ${tbFile.filename}...`
              : `Mengunduh ${tbFile.filename}...`
          );

          const safeName = tbFile.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
          const filename = safeName.startsWith('DownloaderZero_') ? safeName : `DownloaderZero_${safeName}`;
          const downloadHref = buildProxyHref(tbFile.url, filename, media, false);

          let mediaBlob: Blob | null = null;
          try {
            mediaBlob = await fetchBlobWithProgress(downloadHref, basePct, spanPct);
          } catch (tbErr) {
            console.warn('TeraBox proxy download notice, falling back to direct URL:', tbErr);
          }

          if (i > 0) {
            await new Promise((r) => setTimeout(r, 350));
          }

          if (mediaBlob) {
            triggerBlobDownload(mediaBlob, filename);
          } else {
            triggerDirectDownloadFallback(tbFile.url, filename);
          }

          const historyMediaType = tbFile.mediaType === 'audio' ? 'audio' : tbFile.mediaType === 'photos' ? 'photos' : 'video';
          await saveDownloadedMedia({
            sourceUrl: media.url,
            platform: 'terabox',
            title: tbFile.filename,
            author: media.author || 'TeraBox Cloud',
            thumbnail: tbFile.thumbnail || media.thumbnail || '',
            duration: tbFile.duration || 0,
            durationFormatted: tbFile.durationFormatted || '',
            quality: tbFile.size || 'Original',
            resolution: tbFile.extension.toUpperCase(),
            mediaType: historyMediaType,
            extension: (tbFile.extension as any) || 'mp4',
            filename,
            filesize: tbFile.size || (mediaBlob ? formatBytes(mediaBlob.size) : ''),
            filesizeBytes: mediaBlob ? mediaBlob.size : (tbFile.sizeBytes || 0),
            downloadUrl: tbFile.url,
            blob: mediaBlob || undefined
          }).catch(() => {});
        }

        await loadHistory();
        void logDownloadActivity({
          platform: 'terabox',
          url: media.url,
          resolution: filesToDownload.map((f) => f.extension.toUpperCase()).join(', ') || targetFormat.resolution || 'File',
          status: 'berhasil',
          mediaType: filesToDownload[0]?.mediaType || 'file',
          title: filesToDownload.map((f) => f.filename).join(', ')
        });
        setDownloadProgress(100);
        setDownloadStatusText('Unduhan selesai!');
        setCompletedLabel(
          filesToDownload.length > 1
            ? `${filesToDownload.length} File Terunduh!`
            : filesToDownload[0].mediaType === 'video'
              ? 'Video Terunduh!'
              : 'File Terunduh!'
        );
        setBerandaStage('completed');
        return;
      }

      // CASE B: Photo Slideshow (2+ images -> ZIP, 1 image -> JPG/PNG, automatic Ultra HD)
      const activePhotoSlideImages = media.images;
      const activePhotoResLabel = 'Ultra HD';

      if (targetFormat.type === 'photos' && activePhotoSlideImages && activePhotoSlideImages.length > 1) {
        const total = activePhotoSlideImages.length;
        const zip = new JSZip();
        const sanitizedTitle = (media.title || 'Media_Photos').slice(0, 30).replace(/[^a-zA-Z0-9_-]/g, '_');
        const folder = zip.folder(sanitizedTitle) || zip;

        let downloadedPhotoCount = 0;
        for (let i = 0; i < total; i++) {
          setDownloadStatusText(`Mengunduh foto ${i + 1} dari ${total} (${activePhotoResLabel})...`);
          setDownloadProgress(10 + Math.round(((i + 1) / total) * 70));
          const imgUrl = activePhotoSlideImages[i];
          const isPng = /\.(png)(?:[?#]|$)/i.test(imgUrl);
          const photoExt = isPng ? 'png' : 'jpg';
          const photoEntryName = `${sanitizedTitle}_foto_${String(i + 1).padStart(2, '0')}.${photoExt}`;
          const res = await fetch(
            `/api/proxy-download?url=${encodeURIComponent(imgUrl)}&filename=${encodeURIComponent(photoEntryName)}&platform=${encodeURIComponent(media.platform)}&sourceUrl=${encodeURIComponent(media.url)}`
          );
          if (res.ok) {
            const ct = (res.headers.get('content-type') || '').toLowerCase();
            if (!ct.includes('text/html') && !ct.includes('application/json')) {
              const imgBlob = await res.blob();
              if (imgBlob.size >= 500) {
                folder.file(photoEntryName, imgBlob);
                downloadedPhotoCount++;
              }
            }
          }
        }
        if (downloadedPhotoCount === 0) {
          throw new Error('Gagal mengunduh koleksi foto dari server sumber.');
        }

        setDownloadProgress(85);
        setDownloadStatusText('Mengemas arsip ZIP...');
        const zipBlob = await zip.generateAsync({
          type: 'blob',
          compression: 'DEFLATE',
          compressionOptions: { level: 6 }
        });
        const resSlug = activePhotoResLabel.replace(/\s+/g, '_');
        const zipFilename = `DownloaderZero_${sanitizedTitle}_${resSlug}_Semua_Foto.zip`;
        triggerBlobDownload(zipBlob, zipFilename);

        await saveDownloadedMedia({
          sourceUrl: media.url,
          platform: media.platform,
          title: `${media.title || 'Slide Foto'} (${total} Foto)`,
          author: media.author || media.platform,
          thumbnail: media.thumbnail || activePhotoSlideImages[0] || '',
          quality: `${total} Foto · ${activePhotoResLabel} (ZIP)`,
          resolution: activePhotoResLabel,
          mediaType: 'photos',
          extension: 'zip',
          filename: zipFilename,
          filesize: formatBytes(zipBlob.size),
          filesizeBytes: zipBlob.size,
          downloadUrl: activePhotoSlideImages[0],
          blob: zipBlob
        }).catch(() => {});

        await loadHistory();
        void logDownloadActivity({
          platform: media.platform,
          url: media.url,
          resolution: `${total} Foto ${activePhotoResLabel} (ZIP)`,
          status: 'berhasil',
          mediaType: 'photos',
          title: media.title || 'Slide Foto'
        });
        setDownloadProgress(100);
        setDownloadStatusText('Unduhan selesai!');
        setCompletedLabel('Foto Terunduh!');
        setBerandaStage('completed');
        return;
      }

      // CASE C: Spotify (single track or selected track from playlist)
      const selectedTrack =
        media.platform === 'spotify' && media.tracks && media.tracks.length > 0
          ? media.tracks.find((t) => t.id === selectedSpotifyTrackId) || media.tracks[0]
          : undefined;

      const effectiveTitle = selectedTrack?.title || media.title || 'media';
      const effectiveAuthor = selectedTrack?.artist || media.author || media.platform;
      const effectiveThumb = selectedTrack?.thumbnail || media.thumbnail || '';
      const effectiveDuration = selectedTrack?.duration || media.duration || (targetFormat.type === 'audio' ? 210 : 60);
      const effectiveDurationFmt = selectedTrack?.durationFormatted || media.durationFormatted || formatDuration(effectiveDuration);

      let effectiveUrl = resolvedUrl;
      if (media.platform === 'spotify' && selectedTrack && media.isAudioPlaylist) {
        const trackId = selectedTrack.id?.replace(/^sp-track-/, '') || '';
        effectiveUrl =
          selectedTrack.url?.startsWith('http') && !selectedTrack.url.includes('mp3-preview')
            ? selectedTrack.url
            : `https://open.spotify.com/track/${trackId || selectedTrack.id}`;
      } else if (targetFormat.type === 'photos') {
        const singlePhotoUrl = (activePhotoSlideImages && activePhotoSlideImages[0]) || resolvedUrl;
        if (singlePhotoUrl && singlePhotoUrl.startsWith('http')) {
          effectiveUrl = singlePhotoUrl;
        }
      }

      const rawExt = targetFormat.extension || (targetFormat.type === 'audio' ? 'mp3' : targetFormat.type === 'photos' ? 'jpg' : 'mp4');
      const ext =
        targetFormat.type === 'photos' && rawExt === 'zip'
          ? (/\.(png)(?:[?#]|$)/i.test(effectiveUrl) ? 'png' : 'jpg')
          : rawExt;
      const sanitizedTitle = effectiveTitle.slice(0, 40).replace(/[^a-zA-Z0-9_-]/g, '_');
      const rawResTag =
        targetFormat.type === 'photos'
          ? 'Ultra_HD'
          : (targetFormat.resolution || targetFormat.quality.split(' ')[0] || (targetFormat.type === 'audio' ? 'Audio' : '1080p'));
      const resTag = rawResTag.replace(/\s+/g, '_');
      const filename = `DownloaderZero_${sanitizedTitle}_${resTag}.${ext}`;

      const effectiveFormatForHistory: MediaFormat =
        targetFormat.type === 'photos'
          ? { ...targetFormat, resolution: 'Ultra HD', quality: 'Foto Ultra HD' }
          : targetFormat;

      const downloadHref = buildProxyHref(effectiveUrl, filename, media, false, selectedTrack, effectiveFormatForHistory);

      let mediaBlob: Blob | null = null;
      let proxyError: Error | null = null;
      try {
        mediaBlob = await fetchBlobWithProgress(downloadHref, 15, 70);
      } catch (dlErr: any) {
        proxyError = dlErr instanceof Error ? dlErr : new Error(String(dlErr || 'Gagal mengunduh media.'));
        console.warn('Proxy download notice:', dlErr);
      }

      setDownloadProgress(90);
      setDownloadStatusText('Menyimpan berkas ke perangkat...');

      const isAudioOrSpotify = media.platform === 'spotify' || targetFormat.type === 'audio' || ext === 'mp3';
      if (mediaBlob) {
        triggerBlobDownload(mediaBlob, filename);
      } else if (isAudioOrSpotify) {
        throw proxyError || new Error('Gagal mengunduh audio MP3 sesuai bitrate yang dipilih dari server. Silakan coba lagi.');
      } else {
        triggerDirectDownloadFallback(effectiveUrl, filename);
      }

      try {
        const finalThumbnail =
          effectiveThumb || (media.platform === 'spotify' ? 'https://open.spotifycdn.com/cdn/images/favicon.0f31d2ea.ico' : '');

        await saveDownloadedMedia({
          sourceUrl: media.url,
          platform: media.platform,
          title: effectiveTitle || 'Media DownloaderZero',
          author: effectiveAuthor || media.platform,
          artist: effectiveAuthor,
          album: selectedTrack?.album || media.album,
          thumbnail: finalThumbnail,
          duration: effectiveDuration,
          durationFormatted: effectiveDurationFmt,
          quality: effectiveFormatForHistory.quality || (targetFormat.type === 'audio' ? `${selectedAudioQuality} kbps` : selectedVideoRes),
          resolution: effectiveFormatForHistory.resolution || (targetFormat.type === 'audio' ? `${selectedAudioQuality} kbps` : selectedVideoRes),
          mediaType: targetFormat.type,
          extension: ext as any,
          filename,
          filesize: mediaBlob ? formatBytes(mediaBlob.size) : (targetFormat.filesize || ''),
          filesizeBytes: mediaBlob ? mediaBlob.size : (targetFormat.filesizeBytes || 0),
          downloadUrl: effectiveUrl,
          blob: mediaBlob || undefined
        });
        await loadHistory();
      } catch (histErr) {
        console.warn('Save history notice:', histErr);
      }

      void logDownloadActivity({
        platform: media.platform,
        url: media.url,
        resolution: targetFormat.resolution || targetFormat.quality || (targetFormat.type === 'audio' ? `${selectedAudioQuality} kbps` : selectedVideoRes),
        status: 'berhasil',
        mediaType: targetFormat.type,
        title: effectiveTitle || 'Media DownloaderZero'
      });

      setDownloadProgress(100);
      setDownloadStatusText('Unduhan selesai!');
      setCompletedLabel(
        targetFormat.type === 'audio'
          ? 'Audio Terunduh!'
          : targetFormat.type === 'photos'
            ? 'Foto Terunduh!'
            : 'Video Terunduh!'
      );
      setBerandaStage('completed');
    } catch (err: any) {
      console.error('Download execution error:', err);
      void logDownloadActivity({
        platform: media.platform,
        url: media.url,
        resolution: targetFormat.resolution || targetFormat.quality || (targetFormat.type === 'audio' ? `${selectedAudioQuality} kbps` : selectedVideoRes),
        status: 'gagal',
        mediaType: targetFormat.type,
        title: media.title || ''
      });
      invalidateCacheForUrl(media.url);
      if (url.trim() && url.trim() !== media.url) {
        invalidateCacheForUrl(url.trim());
      }
      setBerandaStage('preview');
      setDownloadProgress(0);
      setDownloadStatusText('');
      setErrorMessage(err.message || 'Gagal mengunduh media. Silakan coba kembali.');
    }
  };

  // Re-download from history item
  const handleDownloadAgain = useCallback((item: HistoryItem) => {
    const ext = item.extension || 'mp4';
    const filename = item.filename || `DownloaderZero_${item.title.slice(0, 30)}.${ext}`;
    const streamUrl = item.downloadUrl || item.sourceUrl;

    let downloadHref = `/api/proxy-download?url=${encodeURIComponent(streamUrl)}&filename=${encodeURIComponent(filename)}&platform=${encodeURIComponent(item.platform)}&sourceUrl=${encodeURIComponent(item.sourceUrl)}&server=${encodeURIComponent(serverMode)}`;
    const kbpsMatch = `${item.resolution || ''} ${item.quality || ''}`.match(/(320|256|192|128|64)/);
    if (item.platform === 'spotify') {
      const customKey = localStorage.getItem('dz_neoxr_api_key') || '';
      const bitrate = kbpsMatch ? `${kbpsMatch[1]}k` : '320k';
      downloadHref += `&bitrate=${encodeURIComponent(bitrate)}&title=${encodeURIComponent(item.title || '')}&artist=${encodeURIComponent(item.artist || item.author || '')}&album=${encodeURIComponent(item.album || '')}&cover=${encodeURIComponent(item.thumbnail || '')}&duration=${item.duration || 0}&apiKey=${encodeURIComponent(customKey)}`;
    } else if (item.mediaType === 'audio' || ext.toLowerCase() === 'mp3') {
      const bitrate = kbpsMatch ? `${kbpsMatch[1]}k` : '192k';
      downloadHref += `&bitrate=${encodeURIComponent(bitrate)}&title=${encodeURIComponent(item.title || '')}&artist=${encodeURIComponent(item.artist || item.author || '')}`;
    }

    const a = document.createElement('a');
    a.href = downloadHref;
    a.download = filename;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try {
        document.body.removeChild(a);
      } catch {}
    }, 1500);
  }, []);

  // Delete history item
  const handleDeleteHistory = useCallback(async (id: string) => {
    try {
      await deleteHistoryItem(id);
      await loadHistory();
    } catch (err) {
      console.warn('Delete history item error:', err);
    }
  }, []);

  // Clear all history
  const handleClearAllHistory = useCallback(async () => {
    try {
      await clearAllHistory();
      await loadHistory();
    } catch (err) {
      console.warn('Clear history error:', err);
    }
  }, []);

  // Play item in floating player (video or Spotify-style audio)
  const handlePlayItem = useCallback((item: HistoryItem) => {
    setPlayingItem(item);
  }, []);

  // Quick clipboard paste on TipPromoCard tap
  const handleTipCardTap = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim().startsWith('http')) {
        handleUrlChange(text.trim());
      }
    } catch {}
  }, [handleUrlChange]);

  const handleClearError = useCallback(() => setErrorMessage(null), []);

  const handleSelectPlatform = useCallback((p: PlatformType) => {
    setSelectedPlatform(p);
    if (p === 'spotify') setMediaType('audio');
  }, []);

  const handleOpenPlatformsModal = useCallback(() => setIsPlatformsModalOpen(true), []);
  const handleClosePlatformsModal = useCallback(() => setIsPlatformsModalOpen(false), []);
  const handleGoToHistory = useCallback(() => setActiveTab('riwayat'), []);
  const handleBackToBeranda = useCallback(() => setActiveTab('beranda'), []);
  const handleToggleTheme = useCallback(() => setIsDark((prev) => !prev), []);
  const handleToggleBannerAlwaysPlay = useCallback(() => {
    setBannerAlwaysPlay((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('dz_banner_always_play', next ? '1' : '0');
      } catch {}
      return next;
    });
  }, []);
  const handleOpenTerms = useCallback((tab: 'terms' | 'privacy') => {
    setTermsDefaultTab(tab);
    setIsTermsOpen(true);
  }, []);
  const handleCloseTerms = useCallback(() => setIsTermsOpen(false), []);
  const handleCloseFormatModal = useCallback(() => setIsFormatModalOpen(false), []);
  const handleClosePlayer = useCallback(() => setPlayingItem(null), []);
  const handleSelectServerMode = useCallback((mode: ServerMode) => setServerMode(mode), []);
  const handleAdminAccessChange = useCallback((active: boolean, openPanel?: boolean) => {
    setIsAdmin(active);
    setIsAdminPanelOpen(Boolean(active && openPanel));
  }, []);
  const handleOpenAdmin = useCallback(() => setIsAdminPanelOpen(true), []);
  const handleBackFromAdmin = useCallback(() => setIsAdminPanelOpen(false), []);

  const isBusy = berandaStage === 'preparing' || berandaStage === 'downloading';
  const handleChangeTab = useCallback((tab: TabType) => {
    if (!isBusy) {
      setIsAdminPanelOpen(false);
      setActiveTab(tab);
    }
  }, [isBusy]);

  const isBannerPaused =
    !bannerAlwaysPlay && (
      activeTab !== 'beranda' ||
      berandaStage !== 'idle' ||
      isFormatModalOpen ||
      isPlatformsModalOpen ||
      isTermsOpen ||
      Boolean(playingItem)
    );

  return (
    <div className="relative min-h-screen w-full bg-[#f0f4fa] dark:bg-[#050B18] text-slate-900 dark:text-slate-100 flex flex-col items-center overflow-x-hidden transition-colors duration-200">
      {/* Top Banner (Spans 100% full-width across the screen) */}
      <header className="w-full bg-[#f0f4fa] dark:bg-[#050B18]">
        <BannerDZ paused={isBannerPaused} alwaysPlay={bannerAlwaysPlay} />
      </header>

      {/* Main Content Area (Spans full width on mobile/Android, gracefully expanding on larger screens) */}
      <main className="w-full max-w-3xl lg:max-w-4xl mx-auto px-3.5 sm:px-6 relative z-20 pb-28">
        {/* TAB 1: BERANDA (HOME VIEW OR IN-PLACE RESULT VIEW) */}
        {activeTab === 'beranda' && (
          berandaStage !== 'idle' ? (
            <section aria-label="Hasil Pratinjau Media" className="pt-4 relative z-20">
              <BerandaResultView
                stage={berandaStage}
                prepared={preparedDownload}
                progress={downloadProgress}
                statusText={downloadStatusText}
                errorMessage={errorMessage}
                completedCountdown={completedCountdown}
                completedLabel={completedLabel}
                serverMode={serverMode}
                selectedTeraboxFileIds={selectedTeraboxFileIds}
                onToggleTeraboxFile={handleToggleTeraboxFile}
                selectedSpotifyTrackId={selectedSpotifyTrackId}
                spotifyPlayTrigger={spotifyPlayTrigger}
                spotifyTrackStatuses={spotifyTrackStatuses}
                photoDownloadStatuses={photoDownloadStatuses}
                onOpenVideoFormatModal={() => {
                  setBerandaStage('idle');
                  setIsFormatModalOpen(true);
                }}
                onSelectSpotifyTrack={handleSelectSpotifyTrack}
                onDownloadSingleSpotifyTrack={handleDownloadSingleSpotifyTrack}
                onDownloadAllSpotifyZip={handleDownloadAllSpotifyZip}
                onDownloadSinglePhoto={handleDownloadSingleSlidePhoto}
                onClickDownload={handleExecuteActualDownload}
                onBackToHome={handleBackFromPreview}
              />
            </section>
          ) : (
            <div className="space-y-5">
              {/* URL Input Bar & Download CTA (Overlaps into bottom 10% of BannerDZ) */}
              <section aria-label="Input Link Unduhan" className="-mt-10 sm:-mt-12 relative z-20">
                <UrlInputCard
                  url={url}
                  setUrl={handleUrlChange}
                  selectedPlatform={selectedPlatform}
                  errorMessage={errorMessage}
                  onClearError={handleClearError}
                  onDownloadClick={handleDownloadButtonClick}
                  isLoading={isLoading}
                />
              </section>

              {/* Platform yang didukung (7 platforms in 4 columns, exactly matching photo) */}
              <section aria-label="Platform yang didukung">
                <PlatformCards
                  selectedPlatform={selectedPlatform}
                  onSelectPlatform={handleSelectPlatform}
                  onViewAll={handleOpenPlatformsModal}
                />
              </section>

              {/* Tip Promo Banner: "Download lebih cepat & mudah!" */}
              <section aria-label="Tips Unduhan">
                <TipPromoCard onTap={handleTipCardTap} />
              </section>

              {/* Riwayat Download: 3 Latest items only or clean empty state (NO dummy data!) */}
              <section aria-label="Riwayat Unduhan">
                <HistorySection
                  items={historyItems}
                  onViewAll={handleGoToHistory}
                  onPlay={handlePlayItem}
                  onDownloadAgain={handleDownloadAgain}
                  onDelete={handleDeleteHistory}
                />
              </section>
            </div>
          )
        )}

        {/* TAB 2: RIWAYAT (FULL HISTORY VIEW) */}
        {activeTab === 'riwayat' && (
          <HistoryFullView
            items={historyItems}
            onBackToHome={handleBackToBeranda}
            onPlay={handlePlayItem}
            onDownloadAgain={handleDownloadAgain}
            onDelete={handleDeleteHistory}
            onClearAll={handleClearAllHistory}
          />
        )}

        {/* TAB 3: PENGATURAN (SETTINGS VIEW OR ADMIN PANEL VIEW) */}
        {activeTab === 'pengaturan' && (
          isAdmin && isAdminPanelOpen ? (
            <AdminPanelView
              onBackToSettings={handleBackFromAdmin}
            />
          ) : (
            <SettingsFullView
              isDark={isDark}
              onToggleTheme={handleToggleTheme}
              onBackToHome={handleBackToBeranda}
              onOpenTerms={handleOpenTerms}
              onClearHistory={handleClearAllHistory}
              serverMode={serverMode}
              onSelectServerMode={handleSelectServerMode}
              isServer1Limited={isServer1Limited}
              onRefreshNeoxrStatus={refreshNeoxrStatus}
              isAdmin={isAdmin}
              onAdminAccessChange={handleAdminAccessChange}
              onOpenAdmin={handleOpenAdmin}
              bannerAlwaysPlay={bannerAlwaysPlay}
              onToggleBannerAlwaysPlay={handleToggleBannerAlwaysPlay}
            />
          )
        )}
      </main>

      {/* Floating Bottom Navigation Bar (Locked only while actively preparing or downloading) */}
      <BottomNavbar
        activeTab={activeTab}
        onChangeTab={handleChangeTab}
        historyCount={historyItems.length}
        locked={isBusy}
      />

      {/* MODAL 1: Format & Quality Selector (Triggered when pressing Download) */}
      {mediaData && (
        <FormatSelectorModal
          isOpen={isFormatModalOpen}
          onClose={handleCloseFormatModal}
          media={mediaData}
          selectedType={mediaType}
          onChangeType={setMediaType}
          selectedVideoRes={selectedVideoRes}
          onSelectVideoRes={setSelectedVideoRes}
          selectedAudioQuality={selectedAudioQuality}
          onSelectAudioQuality={setSelectedAudioQuality}
          onConfirmDownload={handleConfirmDownload}
          isDownloading={isBusy}
        />
      )}

      {/* MODAL 2: Floating Video Player (Played directly from history streamable URL) */}
      {playingItem && playingItem.mediaType === 'video' && (
        <FloatingVideoPlayer
          item={playingItem}
          onClose={handleClosePlayer}
          onDownloadAgain={handleDownloadAgain}
        />
      )}

      {/* MODAL 3: Floating Spotify Player (Played directly with Spotify aesthetic) */}
      {playingItem && playingItem.mediaType === 'audio' && (
        <FloatingSpotifyPlayer
          item={playingItem}
          onClose={handleClosePlayer}
          onDownloadAgain={handleDownloadAgain}
        />
      )}

      {/* MODAL 4: Floating Photo Viewer (Played directly from history photos / photo ZIP) */}
      {playingItem && playingItem.mediaType === 'photos' && (
        <FloatingPhotoViewer
          item={playingItem}
          onClose={handleClosePlayer}
          onDownloadAgain={handleDownloadAgain}
        />
      )}

      {/* MODAL 4: Supported Platforms Details */}
      <SupportedPlatformsModal
        isOpen={isPlatformsModalOpen}
        onClose={handleClosePlatformsModal}
        onSelectPlatform={handleSelectPlatform}
      />

      {/* MODAL 5: Terms of Service & Privacy */}
      <TermsModal
        isOpen={isTermsOpen}
        onClose={handleCloseTerms}
        defaultTab={termsDefaultTab}
      />
    </div>
  );
}
