/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Navbar } from './components/Navbar.tsx';
import { HeroBanner } from './components/HeroBanner.tsx';
import { PlatformCards } from './components/PlatformCards.tsx';
import { UrlInputCard } from './components/UrlInputCard.tsx';
import { MediaTypeTabs } from './components/MediaTypeTabs.tsx';
import { QualitySelectorCard } from './components/QualitySelectorCard.tsx';
import { DownloadButton } from './components/DownloadButton.tsx';
import { VideoPreviewCard } from './components/VideoPreviewCard.tsx';
import { FeaturesHighlightBar } from './components/FeaturesHighlightBar.tsx';
import { FooterDZ } from './components/FooterDZ.tsx';
import { MenuModal } from './components/MenuModal.tsx';
import { SettingsModal } from './components/SettingsModal.tsx';
import { TermsModal } from './components/TermsModal.tsx';
import { MediaResultModal } from './components/MediaResultModal.tsx';
import { PhotoSlideCard } from './components/PhotoSlideCard.tsx';
import { SpotifyPlaylistSlideCard } from './components/SpotifyPlaylistSlideCard.tsx';
import { HistoryModal } from './components/HistoryModal.tsx';
import JSZip from 'jszip';

import { detectPlatform, formatBytes } from './services/scraper.ts';
import { saveDownloadedMedia, getAllHistory } from './services/historyStorage.ts';
import type { PlatformType, MediaType, MediaMetadata, MediaFormat } from './types/index.ts';

export default function App() {
  // Input and Platform states
  const [url, setUrl] = useState<string>('');
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformType>('youtube');
  const [mediaType, setMediaType] = useState<MediaType>('video');

  // Quality selection states
  const [selectedVideoRes, setSelectedVideoRes] = useState<string>('1080p');
  const [selectedAudioQuality, setSelectedAudioQuality] = useState<string>('128');

  // Processing & Download states
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [downloadStatusText, setDownloadStatusText] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Extracted media metadata
  const [mediaData, setMediaData] = useState<MediaMetadata | null>(null);

  // Modals state
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isTermsOpen, setIsTermsOpen] = useState<boolean>(false);
  const [termsDefaultTab, setTermsDefaultTab] = useState<'terms' | 'privacy'>('terms');
  const [isFormatModalOpen, setIsFormatModalOpen] = useState<boolean>(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);
  const [historyCount, setHistoryCount] = useState<number>(0);

  // Sync history count
  React.useEffect(() => {
    const updateCount = async () => {
      try {
        const items = await getAllHistory();
        setHistoryCount(items.length);
      } catch (err) {
        console.warn('History count error:', err);
      }
    };
    updateCount();
    window.addEventListener('dz_history_updated', updateCount);
    return () => window.removeEventListener('dz_history_updated', updateCount);
  }, []);

  // Theme setting
  const [isDark, setIsDark] = useState<boolean>(true);
  const [isAutoDetected, setIsAutoDetected] = useState<boolean>(false);

  // Handle URL change with immediate platform auto-detection
  const handleUrlChange = (newUrl: string) => {
    setUrl(newUrl);
    setErrorMessage(null);

    if (newUrl.trim()) {
      const detected = detectPlatform(newUrl);
      if (detected !== 'unknown') {
        setSelectedPlatform(detected);
        setIsAutoDetected(true);
        if (detected === 'spotify') {
          setMediaType('audio');
        }
      }
    } else {
      setIsAutoDetected(false);
    }
  };

  // Handle manual platform change
  const handleSelectPlatform = (platform: PlatformType) => {
    setSelectedPlatform(platform);
    setIsAutoDetected(false);
    setErrorMessage(null);
    if (platform === 'spotify') {
      setMediaType('audio');
    }
  };

  // Perform download execution
  const executeDownload = async (targetFormat: MediaFormat, currentMedia: MediaMetadata) => {
    setIsDownloading(true);
    setDownloadProgress(15);
    setDownloadStatusText('Menghubungkan ke server media...');

    const ext = targetFormat.extension;
    const sanitizedTitle = (currentMedia.title || 'media').slice(0, 40).replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `DownloaderZero_${sanitizedTitle}_${targetFormat.resolution || targetFormat.quality.split(' ')[0]}.${ext}`;

    try {
      let finalUrl = targetFormat.url;
      let jobId = targetFormat.jobId;

      // If format requires async conversion job (e.g. YouTube loader)
      if (!targetFormat.isDirect || targetFormat.url.includes('loader.to') || targetFormat.id.startsWith('yt-')) {
        if (!jobId) {
          setDownloadStatusText('Memulai antrean konversi media...');
          try {
            const startRes = await fetch('/api/start-job', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                format: targetFormat.resolution?.replace(/p$/i, '') || (targetFormat.type === 'audio' ? 'mp3' : '1080'),
                url: currentMedia.url
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
          } catch (e) {
            console.warn('Start job notice:', e);
          }
        }

        if (jobId && (!finalUrl.startsWith('http') || finalUrl.includes('loader.to'))) {
          setDownloadStatusText(`Sedang memproses ${targetFormat.quality}...`);
          let finished = false;
          let attempts = 0;

          while (!finished && attempts < 35) {
            attempts++;
            await new Promise((r) => setTimeout(r, 1200));
            setDownloadProgress((prev) => Math.min(85, prev + 2));

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
              console.warn('Progress poll check:', e);
            }
          }

          if (!finished || !finalUrl.startsWith('http') || finalUrl.includes('loader.to')) {
            throw new Error('Waktu tunggu konversi habis. Silakan pilih resolusi lain atau coba kembali.');
          }
        }
      }

      setDownloadProgress(85);
      setDownloadStatusText('Mengunduh & menyimpan berkas ke riwayat lokal...');

      const downloadHref = `/api/proxy-download?url=${encodeURIComponent(finalUrl)}&filename=${encodeURIComponent(filename)}`;
      
      try {
        const response = await fetch(downloadHref);
        if (!response.ok) {
          const errText = await response.text().catch(() => '');
          throw new Error(errText || `Gagal mengunduh berkas dari server (kode: ${response.status})`);
        }

        const rawBlob = await response.blob();
        if (rawBlob.size <= 60 && targetFormat.type !== 'photos') {
          const text = await rawBlob.text();
          if (text.includes('gagal') || text.includes('Error')) {
            throw new Error(text);
          }
        }

        const targetMime = targetFormat.type === 'video' ? 'video/mp4' : targetFormat.type === 'audio' ? 'audio/mpeg' : rawBlob.type || 'application/octet-stream';
        const blob = rawBlob.type === targetMime ? rawBlob : new Blob([rawBlob], { type: targetMime });

        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);

        // Automatically cache in local IndexedDB history
        try {
          await saveDownloadedMedia({
            sourceUrl: finalUrl,
            platform: currentMedia.platform,
            title: currentMedia.title || 'Media DownloaderZero',
            author: currentMedia.author || 'Creator',
            thumbnail: currentMedia.thumbnail || '',
            quality: targetFormat.quality,
            resolution: targetFormat.resolution,
            mediaType: targetFormat.type,
            extension: targetFormat.extension,
            filename,
            filesize: targetFormat.filesize || formatBytes(blob.size),
            filesizeBytes: blob.size,
            blob
          });
        } catch (histErr) {
          console.warn('History save notice:', histErr);
        }
      } catch (fetchErr: any) {
        throw new Error(fetchErr.message || 'Gagal mengunduh berkas media.');
      }

      setDownloadProgress(100);
      setDownloadStatusText('Unduhan selesai & tersimpan di Riwayat!');

      setTimeout(() => {
        setIsDownloading(false);
        setDownloadProgress(0);
        setDownloadStatusText('');
      }, 2500);
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal memulai unduhan.');
      setIsDownloading(false);
      setDownloadProgress(0);
    }
  };

  // Main Download Trigger button
  const handleMainDownload = async () => {
    if (!url.trim()) {
      setErrorMessage('Tempelkan URL video atau audio terlebih dahulu pada kolom input.');
      return;
    }

    // Auto-detect platform from URL if entered
    const detected = detectPlatform(url);
    if (detected !== 'unknown') {
      setSelectedPlatform(detected);
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      // 1. Extract metadata from URL (API key is securely loaded by server environment)
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() })
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Gagal mengekstrak media dari URL.');
      }

      const media: MediaMetadata = json.data;
      setMediaData(media);
      setIsLoading(false);

      // If content is a Photo Slide and user is on Video tab, package all photos into a ZIP directly
      if (media.isPhotoSlide && media.images && media.images.length > 0 && mediaType !== 'audio') {
        setIsDownloading(true);
        setDownloadProgress(20);
        setDownloadStatusText(`Menyiapkan ${media.images.length} foto ke dalam ZIP...`);
        try {
          const zip = new JSZip();
          const sanitizedTitle = (media.title || 'TikTok_Photos').slice(0, 30).replace(/[^a-zA-Z0-9_-]/g, '_');
          const folder = zip.folder(sanitizedTitle) || zip;

          for (let i = 0; i < media.images.length; i++) {
            const pct = Math.min(85, 20 + Math.round(((i + 1) / media.images.length) * 65));
            setDownloadProgress(pct);
            setDownloadStatusText(`Mengunduh foto ${i + 1} dari ${media.images.length}...`);
            const res = await fetch(`/api/proxy-download?url=${encodeURIComponent(media.images[i])}&filename=photo_${i + 1}.jpg`);
            if (res.ok) {
              const blob = await res.blob();
              folder.file(`${sanitizedTitle}_foto_${String(i + 1).padStart(2, '0')}.jpg`, blob);
            }
          }

          setDownloadProgress(90);
          setDownloadStatusText('Membuat berkas ZIP...');
          const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
          const zipFilename = `DownloaderZero_${sanitizedTitle}_Semua_Foto.zip`;
          const dlUrl = URL.createObjectURL(zipBlob);
          const link = document.createElement('a');
          link.href = dlUrl;
          link.download = zipFilename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(dlUrl);

          // Save to local offline history
          try {
            await saveDownloadedMedia({
              sourceUrl: media.url,
              platform: media.platform,
              title: `${media.title || 'Foto TikTok'} (${media.images.length} Slide Foto)`,
              author: media.author || 'Kreator',
              thumbnail: media.thumbnail || media.images[0] || '',
              quality: `${media.images.length} Foto HD (ZIP)`,
              resolution: 'HD Foto',
              mediaType: 'photos',
              extension: 'zip',
              filename: zipFilename,
              filesize: formatBytes(zipBlob.size),
              filesizeBytes: zipBlob.size,
              blob: zipBlob
            });
          } catch (histErr) {
            console.warn('ZIP history auto-save notice:', histErr);
          }

          setDownloadProgress(100);
          setDownloadStatusText('Semua foto berhasil diunduh dalam ZIP & tersimpan di Riwayat!');
          setTimeout(() => {
            setIsDownloading(false);
            setDownloadProgress(0);
            setDownloadStatusText('');
          }, 3000);
          return;
        } catch (zipErr) {
          console.error('Auto zip error:', zipErr);
          setIsDownloading(false);
          setDownloadProgress(0);
          return;
        }
      }

      // 2. Find best matching format
      const filteredFormats = media.formats.filter((f) => f.type === mediaType);
      const searchPool = filteredFormats.length > 0 ? filteredFormats : media.formats;

      let chosenFormat: MediaFormat | undefined;
      if (mediaType === 'video') {
        chosenFormat =
          searchPool.find((f) => f.resolution?.includes(selectedVideoRes) || f.quality.includes(selectedVideoRes)) ||
          searchPool[0];
      } else {
        chosenFormat =
          searchPool.find((f) => f.quality.includes(selectedAudioQuality) || f.type === 'audio') ||
          searchPool[0];
      }

      if (chosenFormat) {
        await executeDownload(chosenFormat, media);
      }
    } catch (err: any) {
      setIsLoading(false);
      setErrorMessage(err.message || 'Gagal memproses media. Pastikan URL publik dan dapat diakses.');
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#030718] text-slate-100 flex flex-col items-center justify-start antialiased selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Full-Screen Expansive Container */}
      <main className="w-full max-w-5xl lg:max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-6 flex flex-col items-center gap-4 sm:gap-6">
        {/* 1. Header & Brand Navigation */}
        <Navbar
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenMenu={() => setIsMenuOpen(true)}
          onOpenHistory={() => setIsHistoryOpen(true)}
          historyCount={historyCount}
        />

        {/* 2. Hero Mascot & Typography Banner */}
        <HeroBanner />

        {/* 3. Single Button Platform Selector with Floating Modal */}
        <PlatformCards
          selectedPlatform={selectedPlatform}
          onSelectPlatform={handleSelectPlatform}
          isAutoDetected={isAutoDetected}
        />

        {/* 4. URL Input Box Card with Paste Button & Realtime Auto-Detect */}
        <UrlInputCard
          url={url}
          setUrl={handleUrlChange}
          selectedPlatform={selectedPlatform}
          errorMessage={errorMessage}
          onClearError={() => setErrorMessage(null)}
          isAutoDetected={isAutoDetected}
        />

        {/* 5. Media Type Tabs (Video vs MP3 Audio) */}
        <MediaTypeTabs
          mediaType={mediaType}
          setMediaType={setMediaType}
          isAudioOnly={selectedPlatform === 'spotify'}
        />

        {/* 6. "Pilih Kualitas" (Quality Selection Card - Video and Audio separated) */}
        <QualitySelectorCard
          mediaType={mediaType}
          setMediaType={setMediaType}
          selectedVideoRes={selectedVideoRes}
          setSelectedVideoRes={setSelectedVideoRes}
          selectedAudioQuality={selectedAudioQuality}
          setSelectedAudioQuality={setSelectedAudioQuality}
          isAudioOnly={selectedPlatform === 'spotify'}
        />

        {/* 7. Huge Download Button with Cyber Accents */}
        <DownloadButton
          onDownload={handleMainDownload}
          isLoading={isLoading}
          isDownloading={isDownloading}
          downloadProgress={downloadProgress}
          downloadStatusText={downloadStatusText}
        />

        {/* 8. Contoh Video Preview Card OR Photo Slide Card OR Spotify Playlist Slide */}
        {mediaData?.platform === 'spotify' && mediaData.isAudioPlaylist && mediaData.tracks && mediaData.tracks.length > 0 ? (
          <SpotifyPlaylistSlideCard media={mediaData} />
        ) : mediaData?.isPhotoSlide && mediaData.images && mediaData.images.length > 0 ? (
          <PhotoSlideCard media={mediaData} />
        ) : (
          <VideoPreviewCard
            media={mediaData}
            selectedResolution={selectedVideoRes}
            onClick={() => {
              if (mediaData) {
                setIsFormatModalOpen(true);
              }
            }}
          />
        )}

        {/* 9. Feature Highlights Badge Bar */}
        <FeaturesHighlightBar />

        {/* 10. Footer with Handwritten Doodle, Crown Copyright, and Cat Line-Art */}
        <FooterDZ
          onOpenTerms={() => {
            setTermsDefaultTab('terms');
            setIsTermsOpen(true);
          }}
          onOpenPrivacy={() => {
            setTermsDefaultTab('privacy');
            setIsTermsOpen(true);
          }}
        />
      </main>

      {/* Navigation Menu Modal */}
      <MenuModal
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        onSelectPlatform={handleSelectPlatform}
        onOpenTerms={() => {
          setTermsDefaultTab('terms');
          setIsTermsOpen(true);
        }}
        onOpenPrivacy={() => {
          setTermsDefaultTab('privacy');
          setIsTermsOpen(true);
        }}
        onOpenHistory={() => setIsHistoryOpen(true)}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onOpenTerms={() => {
          setTermsDefaultTab('terms');
          setIsTermsOpen(true);
        }}
        isDark={isDark}
        toggleTheme={() => setIsDark((p) => !p)}
      />

      {/* History (Riwayat Unduhan Offline 24 Jam) Modal */}
      <HistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
      />

      {/* Terms & Privacy Modal */}
      <TermsModal
        isOpen={isTermsOpen}
        onClose={() => setIsTermsOpen(false)}
        defaultTab={termsDefaultTab}
      />

      {/* All Available Formats Modal (if media extracted) */}
      {mediaData && (
        <MediaResultModal
          isOpen={isFormatModalOpen}
          onClose={() => setIsFormatModalOpen(false)}
          media={mediaData}
          activeFilter={mediaType}
          onDownloadFormat={(fmt) => {
            setIsFormatModalOpen(false);
            executeDownload(fmt, mediaData);
          }}
          isDownloading={isDownloading}
          downloadProgress={downloadProgress}
        />
      )}
    </div>
  );
}
