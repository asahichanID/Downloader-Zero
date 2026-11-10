/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
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
import { TermsModal } from './components/TermsModal.tsx';
import { AnimatePresence, motion } from 'motion/react';
import { Loader2, Download, CheckCircle2, AlertCircle, X } from 'lucide-react';

import { detectPlatform, formatDuration, formatBytes } from './services/scraper.ts';
import {
  saveDownloadedMedia,
  getAllHistory,
  deleteHistoryItem,
  clearAllHistory,
  purgeExpiredHistoryItems
} from './services/historyStorage.ts';
import type { PlatformType, MediaType, MediaMetadata, MediaFormat, HistoryItem } from './types/index.ts';

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
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [downloadStatusText, setDownloadStatusText] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Extracted media metadata
  const [mediaData, setMediaData] = useState<MediaMetadata | null>(null);

  // Modals state
  const [isFormatModalOpen, setIsFormatModalOpen] = useState<boolean>(false);
  const [isPlatformsModalOpen, setIsPlatformsModalOpen] = useState<boolean>(false);
  const [isTermsOpen, setIsTermsOpen] = useState<boolean>(false);
  const [termsDefaultTab, setTermsDefaultTab] = useState<'terms' | 'privacy'>('terms');

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

  // Handle URL change with auto platform detection (NO auto-select badge text!)
  const handleUrlChange = (newUrl: string) => {
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
  };

  // Helper to map MediaFormat to loader.to format
  const mapFormatForLoader = (fmt: MediaFormat): string => {
    if (fmt.type === 'audio') return 'mp3';
    const id = (fmt.id || '').toLowerCase();
    const res = (fmt.resolution || '').toLowerCase();
    const qual = (fmt.quality || '').toLowerCase();

    if (id.includes('2160') || res.includes('2160') || res === '4k' || qual.includes('2160') || qual.includes('4k')) {
      return '2160';
    }
    if (id.includes('1440') || res.includes('1440') || res === '2k' || qual.includes('1440') || qual.includes('2k')) {
      return '1440';
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

  // When clicking the main "Download" button on Beranda:
  // Extracts media metadata if not done yet, then opens FormatSelectorModal!
  const handleDownloadButtonClick = async () => {
    const trimmed = url.trim();
    if (!trimmed) {
      setErrorMessage('Silakan tempelkan link video atau audio terlebih dahulu.');
      return;
    }

    setErrorMessage(null);

    // If media already extracted for this URL, open modal directly
    if (mediaData && mediaData.url === trimmed) {
      setIsFormatModalOpen(true);
      return;
    }

    setIsLoading(true);
    try {
      const customKey = localStorage.getItem('dz_neoxr_api_key') || '';
      const response = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed, apiKey: customKey })
      });

      const result = await response.json();
      if (!response.ok || !result.success || !result.data) {
        throw new Error(result.error || 'Gagal mengekstrak media dari link yang diberikan.');
      }

      const meta: MediaMetadata = result.data;
      setMediaData(meta);
      setSelectedPlatform(meta.platform);
      if (meta.platform === 'spotify') {
        setMediaType('audio');
      }

      setIsFormatModalOpen(true);
    } catch (err: any) {
      console.error('Extraction error:', err);
      setErrorMessage(err.message || 'Terjadi kesalahan saat memeriksa tautan.');
    } finally {
      setIsLoading(false);
    }
  };

  // Execute download after format and resolution are chosen in FormatSelectorModal
  const handleConfirmDownload = async (targetFormat: MediaFormat) => {
    if (!mediaData) return;

    setIsFormatModalOpen(false);
    setIsDownloading(true);
    setDownloadProgress(20);
    setDownloadStatusText(`Menyiapkan ${targetFormat.quality || targetFormat.resolution}...`);

    const ext = targetFormat.extension || (targetFormat.type === 'audio' ? 'mp3' : 'mp4');
    const sanitizedTitle = (mediaData.title || 'media').slice(0, 40).replace(/[^a-zA-Z0-9_-]/g, '_');
    const resTag = targetFormat.resolution || targetFormat.quality.split(' ')[0] || '1080p';
    const filename = `DownloaderZero_${sanitizedTitle}_${resTag}.${ext}`;

    try {
      let finalUrl = targetFormat.url;
      let jobId = targetFormat.jobId;

      // Handle resolution if url is missing or requires async conversion
      if (!finalUrl || !finalUrl.startsWith('http')) {
        const loaderFormat = mapFormatForLoader(targetFormat);
        setDownloadStatusText(`Memulai resolusi ${targetFormat.quality}...`);
        try {
          const startRes = await fetch('/api/start-job', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              format: loaderFormat,
              url: mediaData.url
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
          setDownloadStatusText('Sedang menyiapkan format...');
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
        throw new Error('Tautan unduhan tidak tersedia dari server sumber saat ini.');
      }

      setDownloadProgress(50);
      setDownloadStatusText('Mengunduh berkas media...');

      let downloadHref = `/api/proxy-download?url=${encodeURIComponent(finalUrl)}&filename=${encodeURIComponent(filename)}&platform=${encodeURIComponent(mediaData.platform)}&sourceUrl=${encodeURIComponent(mediaData.url)}`;
      if (mediaData.platform === 'spotify') {
        const customKey = localStorage.getItem('dz_neoxr_api_key') || '';
        downloadHref += `&title=${encodeURIComponent(mediaData.title || '')}&artist=${encodeURIComponent(mediaData.author || '')}&album=${encodeURIComponent(mediaData.album || '')}&genre=${encodeURIComponent(mediaData.genre || 'Pop')}&year=${encodeURIComponent(mediaData.releaseDate || '')}&cover=${encodeURIComponent(mediaData.thumbnail || '')}&apiKey=${encodeURIComponent(customKey)}`;
      }

      // Fetch the binary media stream and verify it is not an HTML/JSON error
      const dlResponse = await fetch(downloadHref);
      if (!dlResponse.ok) {
        const errText = await dlResponse.text();
        let errMsg = 'Gagal mengunduh media dari server sumber.';
        try {
          const parsed = JSON.parse(errText);
          if (parsed.error) errMsg = parsed.error;
        } catch {}
        throw new Error(errMsg);
      }

      const contentType = dlResponse.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const parsed = await dlResponse.json();
        throw new Error(parsed.error || 'Server sumber gagal menyediakan stream media.');
      }

      setDownloadProgress(80);
      setDownloadStatusText('Menyimpan berkas ke perangkat...');

      const mediaBlob = await dlResponse.blob();
      if (mediaBlob.size < 120 && mediaBlob.type.includes('text')) {
        throw new Error('Berkas media yang diterima tidak valid.');
      }

      // Trigger instant automatic browser download from in-memory verified blob
      const blobUrl = URL.createObjectURL(mediaBlob);
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

      // Save to lightweight IndexedDB history with duration, thumbnail, and streamable URL
      try {
        const finalDuration = mediaData.duration || (targetFormat.type === 'audio' ? 210 : 60);
        const finalDurationFormatted = mediaData.durationFormatted || formatDuration(finalDuration);
        const finalThumbnail = mediaData.thumbnail || (mediaData.platform === 'spotify' ? 'https://open.spotifycdn.com/cdn/images/favicon.0f31d2ea.ico' : '');

        await saveDownloadedMedia({
          sourceUrl: mediaData.url,
          platform: mediaData.platform,
          title: mediaData.title || 'Media DownloaderZero',
          author: mediaData.author || mediaData.platform,
          artist: mediaData.author,
          album: mediaData.album,
          thumbnail: finalThumbnail,
          duration: finalDuration,
          durationFormatted: finalDurationFormatted,
          quality: targetFormat.quality || selectedVideoRes,
          resolution: targetFormat.resolution || selectedVideoRes,
          mediaType: targetFormat.type,
          extension: ext as any,
          filename: filename,
          filesize: targetFormat.filesize || formatBytes(mediaBlob.size),
          filesizeBytes: mediaBlob.size,
          downloadUrl: finalUrl,
          blob: mediaBlob
        });
        await loadHistory();
      } catch (histErr) {
        console.warn('Save history notice:', histErr);
      }

      setDownloadProgress(100);
      setDownloadStatusText('Unduhan selesai!');
      setTimeout(() => {
        setIsDownloading(false);
        setDownloadProgress(0);
        setDownloadStatusText('');
      }, 1500);
    } catch (err: any) {
      console.error('Download execution error:', err);
      setIsDownloading(false);
      setErrorMessage(err.message || 'Gagal memulai unduhan.');
    }
  };

  // Re-download from history item
  const handleDownloadAgain = (item: HistoryItem) => {
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
  };

  // Delete history item
  const handleDeleteHistory = async (id: string) => {
    try {
      await deleteHistoryItem(id);
      await loadHistory();
    } catch (err) {
      console.warn('Delete history item error:', err);
    }
  };

  // Clear all history
  const handleClearAllHistory = async () => {
    try {
      await clearAllHistory();
      await loadHistory();
    } catch (err) {
      console.warn('Clear history error:', err);
    }
  };

  // Play item in floating player (video or Spotify-like audio)
  const handlePlayItem = (item: HistoryItem) => {
    setPlayingItem(item);
  };

  // Quick clipboard paste on TipPromoCard tap
  const handleTipCardTap = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim().startsWith('http')) {
        handleUrlChange(text.trim());
      }
    } catch {}
  };

  return (
    <div className="relative min-h-screen w-full bg-[#050B18] text-slate-100 flex flex-col items-center overflow-x-hidden">
      {/* Top Banner (Spans 100% full-width across the screen) */}
      <header className="w-full">
        <BannerDZ />
      </header>

      {/* Main Content Area (Spans full width on mobile/Android, gracefully expanding on larger screens) */}
      <main className="w-full max-w-3xl lg:max-w-4xl mx-auto px-3.5 sm:px-6 relative z-20 pb-28">
        {/* TAB 1: BERANDA (HOME VIEW) */}
        {activeTab === 'beranda' && (
          <div className="space-y-5">
            {/* URL Input Bar & Download CTA (Overlaps into bottom 10% of BannerDZ) */}
            <section aria-label="Input Link Unduhan" className="-mt-10 sm:-mt-12 relative z-20">
              <UrlInputCard
                url={url}
                setUrl={handleUrlChange}
                selectedPlatform={selectedPlatform}
                errorMessage={errorMessage}
                onClearError={() => setErrorMessage(null)}
                onDownloadClick={handleDownloadButtonClick}
                isLoading={isLoading}
              />
            </section>

            {/* Platform yang didukung (7 platforms in 4 columns, exactly matching photo) */}
            <section aria-label="Platform yang didukung">
              <PlatformCards
                selectedPlatform={selectedPlatform}
                onSelectPlatform={(p) => {
                  setSelectedPlatform(p);
                  if (p === 'spotify') setMediaType('audio');
                }}
                onViewAll={() => setIsPlatformsModalOpen(true)}
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
                onViewAll={() => setActiveTab('riwayat')}
                onPlay={handlePlayItem}
                onDownloadAgain={handleDownloadAgain}
                onDelete={handleDeleteHistory}
              />
            </section>
          </div>
        )}

        {/* TAB 2: RIWAYAT (FULL HISTORY VIEW) */}
        {activeTab === 'riwayat' && (
          <HistoryFullView
            items={historyItems}
            onBackToHome={() => setActiveTab('beranda')}
            onPlay={handlePlayItem}
            onDownloadAgain={handleDownloadAgain}
            onDelete={handleDeleteHistory}
            onClearAll={handleClearAllHistory}
          />
        )}

        {/* TAB 3: PENGATURAN (SETTINGS VIEW) */}
        {activeTab === 'pengaturan' && (
          <SettingsFullView
            isDark={isDark}
            onToggleTheme={() => setIsDark((prev) => !prev)}
            onBackToHome={() => setActiveTab('beranda')}
            onOpenTerms={(tab) => {
              setTermsDefaultTab(tab);
              setIsTermsOpen(true);
            }}
            onClearHistory={handleClearAllHistory}
          />
        )}
      </main>

      {/* Floating Bottom Navigation Bar (Rounded ends, smooth animated indicator) */}
      <BottomNavbar
        activeTab={activeTab}
        onChangeTab={(tab) => setActiveTab(tab)}
        historyCount={historyItems.length}
      />

      {/* MODAL 1: Format & Quality Selector (Triggered when pressing Download) */}
      {mediaData && (
        <FormatSelectorModal
          isOpen={isFormatModalOpen}
          onClose={() => setIsFormatModalOpen(false)}
          media={mediaData}
          selectedType={mediaType}
          onChangeType={setMediaType}
          selectedVideoRes={selectedVideoRes}
          onSelectVideoRes={setSelectedVideoRes}
          selectedAudioQuality={selectedAudioQuality}
          onSelectAudioQuality={setSelectedAudioQuality}
          onConfirmDownload={handleConfirmDownload}
          isDownloading={isDownloading}
        />
      )}

      {/* MODAL 2: Floating Video Player (Played directly from history streamable URL) */}
      {playingItem && playingItem.mediaType === 'video' && (
        <FloatingVideoPlayer
          item={playingItem}
          onClose={() => setPlayingItem(null)}
          onDownloadAgain={handleDownloadAgain}
        />
      )}

      {/* MODAL 3: Floating Spotify Player (Played directly with Spotify aesthetic) */}
      {playingItem && playingItem.mediaType === 'audio' && (
        <FloatingSpotifyPlayer
          item={playingItem}
          onClose={() => setPlayingItem(null)}
          onDownloadAgain={handleDownloadAgain}
        />
      )}

      {/* MODAL 4: Supported Platforms Details */}
      <SupportedPlatformsModal
        isOpen={isPlatformsModalOpen}
        onClose={() => setIsPlatformsModalOpen(false)}
        onSelectPlatform={(p) => {
          setSelectedPlatform(p);
          if (p === 'spotify') setMediaType('audio');
        }}
      />

      {/* MODAL 5: Terms of Service & Privacy */}
      <TermsModal
        isOpen={isTermsOpen}
        onClose={() => setIsTermsOpen(false)}
        defaultTab={termsDefaultTab}
      />

      {/* Download Progress Floating Notification */}
      <AnimatePresence>
        {isDownloading && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-24 inset-x-4 max-w-sm mx-auto z-50 p-4 rounded-2xl bg-[#091b40]/95 border border-cyan-400/50 shadow-2xl backdrop-blur-md text-white flex items-center gap-3.5"
          >
            <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-cyan-400/50 flex items-center justify-center shrink-0">
              {downloadProgress >= 100 ? (
                <CheckCircle2 className="w-5 h-5 text-cyan-400" />
              ) : (
                <Loader2 className="w-5 h-5 text-cyan-400 animate-spin" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between text-xs font-bold mb-1">
                <span className="truncate">{downloadStatusText || 'Sedang mengunduh...'}</span>
                <span className="font-mono text-cyan-400 ml-2">{downloadProgress}%</span>
              </div>
              <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-300"
                  style={{ width: `${downloadProgress}%` }}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
