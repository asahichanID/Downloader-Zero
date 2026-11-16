/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
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
import type {
  PlatformType,
  MediaType,
  MediaMetadata,
  MediaFormat,
  HistoryItem,
  ServerMode,
  AudioTrack
} from './types/index.ts';

export default function App() {
  // Navigation tab: 'beranda' | 'riwayat' | 'pengaturan'
  const [activeTab, setActiveTab] = useState<TabType>('beranda');

  // Input and Platform states
  const [url, setUrl] = useState<string>('');
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformType>('youtube');
  const [mediaType, setMediaType] = useState<MediaType>('video');

  // Quality selection states
  const [selectedVideoRes, setSelectedVideoRes] = useState<string>('1080p');
  const [selectedAudioQuality, setSelectedAudioQuality] = useState<string>('320');

  // Processing & Download states
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [berandaStage, setBerandaStage] = useState<BerandaStage>('idle');
  const [preparedDownload, setPreparedDownload] = useState<PreparedDownloadPayload | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [downloadStatusText, setDownloadStatusText] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [completedCountdown, setCompletedCountdown] = useState<number>(3);
  const [completedLabel, setCompletedLabel] = useState<string>('');
  const [selectedTeraboxFileIds, setSelectedTeraboxFileIds] = useState<string[]>([]);
  const [selectedSpotifyTrackId, setSelectedSpotifyTrackId] = useState<string | null>(null);

  // Extracted media metadata
  const [mediaData, setMediaData] = useState<MediaMetadata | null>(null);

  // Modals state
  const [isFormatModalOpen, setIsFormatModalOpen] = useState<boolean>(false);
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
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState<boolean>(false);

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

  useEffect(() => {
    void registerWebViewOnce();
    loadHistory();
    const handleUpdate = () => loadHistory();
    window.addEventListener('dz_history_updated', handleUpdate);
    return () => window.removeEventListener('dz_history_updated', handleUpdate);
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

  // Handle URL change with auto platform detection (NO auto-select badge text!)
  const handleUrlChange = useCallback((newUrl: string) => {
    setUrl(newUrl);
    setErrorMessage(null);

    if (newUrl.trim()) {
      const detected = detectPlatform(newUrl);
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
    let href = `/api/proxy-download?url=${encodeURIComponent(targetUrl)}&filename=${encodeURIComponent(filename)}&platform=${encodeURIComponent(meta.platform)}&sourceUrl=${encodeURIComponent(meta.url)}`;
    if (inline) {
      href += '&inline=1';
    }
    if (meta.platform === 'spotify') {
      const customKey = localStorage.getItem('dz_neoxr_api_key') || '';
      const tTitle = trackOverride?.title || meta.title || '';
      const tArtist = trackOverride?.artist || meta.author || '';
      const tAlbum = trackOverride?.album || meta.album || '';
      const tGenre = trackOverride?.genre || meta.genre || 'Pop';
      const tYear = trackOverride?.releaseDate || meta.releaseDate || '';
      const tCover = trackOverride?.thumbnail || meta.thumbnail || '';
      href += `&title=${encodeURIComponent(tTitle)}&artist=${encodeURIComponent(tArtist)}&album=${encodeURIComponent(tAlbum)}&genre=${encodeURIComponent(tGenre)}&year=${encodeURIComponent(tYear)}&cover=${encodeURIComponent(tCover)}&apiKey=${encodeURIComponent(customKey)}`;
    } else if (formatOverride?.type === 'audio' || filename.toLowerCase().endsWith('.mp3')) {
      const kbpsMatch = `${formatOverride?.resolution || ''} ${formatOverride?.quality || ''} ${selectedAudioQuality}`.match(/(320|256|192|128|64)/);
      const bitrate = kbpsMatch ? `${kbpsMatch[1]}k` : '192k';
      href += `&bitrate=${encodeURIComponent(bitrate)}&title=${encodeURIComponent(meta.title || '')}&artist=${encodeURIComponent(meta.author || '')}`;
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
    } else {
      setSelectedSpotifyTrackId(null);
    }
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

    const trimmed = url.trim();
    if (!trimmed) {
      setErrorMessage('Silakan tempelkan link video atau audio terlebih dahulu.');
      return;
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

      try {
        const response = await fetch('/api/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: trimmed, apiKey: customKey, server: serverMode })
        });

        if (response.ok) {
          const result = await response.json();
          if (result && result.success && result.data) {
            meta = result.data;
          }
        }
      } catch (backendErr) {
        console.warn('Backend extract notice, falling back to direct client extractor:', backendErr);
      }

      // Client-side fallback: extract directly in client
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
      setErrorMessage(err.message || 'Terjadi kesalahan saat memeriksa tautan.');
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

    setIsFormatModalOpen(false);
    setErrorMessage(null);
    setBerandaStage('preparing');
    setDownloadProgress(20);
    setDownloadStatusText(`Menyiapkan pratinjau ${targetFormat.quality || targetFormat.resolution}...`);

    try {
      let finalUrl = targetFormat.url;
      let jobId = targetFormat.jobId;

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
          if (startRes.ok) {
            const startData = await startRes.json();
            if (startData.downloadUrl) {
              finalUrl = startData.downloadUrl;
            } else if (startData.id) {
              jobId = startData.id;
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
        throw new Error('Tautan media tidak tersedia dari server sumber saat ini.');
      }

      setCachedPrepared(mediaData.url, targetFormat, serverMode, customKey, mediaData, finalUrl);
      setDownloadProgress(95);
      setDownloadStatusText('Memuat pratinjau...');
      enterPreviewStage(mediaData, targetFormat, finalUrl);
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
    }
  };

  // Fetch binary blob with live streaming progress
  const fetchBlobWithProgress = async (
    downloadHref: string,
    progressStart: number,
    progressSpan: number
  ): Promise<Blob | null> => {
    const dlResponse = await fetch(downloadHref);
    if (!dlResponse.ok) return null;
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

  // Handle Spotify track selection (single track)
  const handleSelectSpotifyTrack = (track: AudioTrack) => {
    setSelectedSpotifyTrackId(track.id);
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

      // CASE B: Photo Slideshow (2+ images -> ZIP, 1 image -> JPG/PNG)
      if (targetFormat.type === 'photos' && media.images && media.images.length > 1) {
        const total = media.images.length;
        const zip = new JSZip();
        const sanitizedTitle = (media.title || 'Media_Photos').slice(0, 30).replace(/[^a-zA-Z0-9_-]/g, '_');
        const folder = zip.folder(sanitizedTitle) || zip;

        let downloadedPhotoCount = 0;
        for (let i = 0; i < total; i++) {
          setDownloadStatusText(`Mengunduh foto ${i + 1} dari ${total}...`);
          setDownloadProgress(10 + Math.round(((i + 1) / total) * 70));
          const imgUrl = media.images[i];
          const res = await fetch(`/api/proxy-download?url=${encodeURIComponent(imgUrl)}&filename=photo_${i + 1}.jpg&platform=${encodeURIComponent(media.platform)}`);
          if (res.ok) {
            const imgBlob = await res.blob();
            folder.file(`${sanitizedTitle}_foto_${String(i + 1).padStart(2, '0')}.jpg`, imgBlob);
            downloadedPhotoCount++;
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
        const zipFilename = `DownloaderZero_${sanitizedTitle}_Semua_Foto.zip`;
        triggerBlobDownload(zipBlob, zipFilename);

        await saveDownloadedMedia({
          sourceUrl: media.url,
          platform: media.platform,
          title: `${media.title || 'Slide Foto'} (${total} Foto)`,
          author: media.author || media.platform,
          thumbnail: media.thumbnail || media.images[0] || '',
          quality: `${total} Foto HD (ZIP)`,
          resolution: 'HD Foto',
          mediaType: 'photos',
          extension: 'zip',
          filename: zipFilename,
          filesize: formatBytes(zipBlob.size),
          filesizeBytes: zipBlob.size,
          downloadUrl: media.images[0],
          blob: zipBlob
        }).catch(() => {});

        await loadHistory();
        void logDownloadActivity({
          platform: media.platform,
          url: media.url,
          resolution: `${total} Foto HD (ZIP)`,
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
      }

      const ext = targetFormat.extension || (targetFormat.type === 'audio' ? 'mp3' : 'mp4');
      const sanitizedTitle = effectiveTitle.slice(0, 40).replace(/[^a-zA-Z0-9_-]/g, '_');
      const rawResTag = targetFormat.resolution || targetFormat.quality.split(' ')[0] || (targetFormat.type === 'audio' ? 'Audio' : '1080p');
      const resTag = rawResTag.replace(/\s+/g, '');
      const filename = `DownloaderZero_${sanitizedTitle}_${resTag}.${ext}`;

      const downloadHref = buildProxyHref(effectiveUrl, filename, media, false, selectedTrack, targetFormat);

      let mediaBlob: Blob | null = null;
      try {
        mediaBlob = await fetchBlobWithProgress(downloadHref, 15, 70);
      } catch (dlErr) {
        console.warn('Proxy download notice, falling back to direct download:', dlErr);
      }

      setDownloadProgress(90);
      setDownloadStatusText('Menyimpan berkas ke perangkat...');

      if (mediaBlob) {
        triggerBlobDownload(mediaBlob, filename);
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
          quality: targetFormat.quality || (targetFormat.type === 'audio' ? `${selectedAudioQuality} kbps` : selectedVideoRes),
          resolution: targetFormat.resolution || (targetFormat.type === 'audio' ? 'Audio' : selectedVideoRes),
          mediaType: targetFormat.type,
          extension: ext as any,
          filename,
          filesize: targetFormat.filesize || (mediaBlob ? formatBytes(mediaBlob.size) : ''),
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

    let downloadHref = `/api/proxy-download?url=${encodeURIComponent(streamUrl)}&filename=${encodeURIComponent(filename)}&platform=${encodeURIComponent(item.platform)}&sourceUrl=${encodeURIComponent(item.sourceUrl)}`;
    if (item.platform === 'spotify') {
      const customKey = localStorage.getItem('dz_neoxr_api_key') || '';
      downloadHref += `&title=${encodeURIComponent(item.title || '')}&artist=${encodeURIComponent(item.artist || item.author || '')}&album=${encodeURIComponent(item.album || '')}&cover=${encodeURIComponent(item.thumbnail || '')}&apiKey=${encodeURIComponent(customKey)}`;
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
                selectedTeraboxFileIds={selectedTeraboxFileIds}
                onToggleTeraboxFile={handleToggleTeraboxFile}
                selectedSpotifyTrackId={selectedSpotifyTrackId}
                onSelectSpotifyTrack={handleSelectSpotifyTrack}
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
