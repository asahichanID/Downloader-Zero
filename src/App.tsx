/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Navbar } from './components/Navbar.tsx';
import { BannerDZ } from './components/BannerDZ.tsx';
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
import { SpotifyPlaylistModal } from './components/SpotifyPlaylistModal.tsx';
import { HistoryModal } from './components/HistoryModal.tsx';
import JSZip from 'jszip';
import { motion, AnimatePresence } from 'motion/react';

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
  const [isSpotifyModalOpen, setIsSpotifyModalOpen] = useState<boolean>(false);
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

  // Theme setting with persistent localStorage
  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('dz_theme');
      return saved !== null ? saved === 'dark' : true;
    } catch {
      return true;
    }
  });

  // Apply theme to documentElement and body
  React.useEffect(() => {
    const root = document.documentElement;
    try {
      localStorage.setItem('dz_theme', isDark ? 'dark' : 'light');
    } catch (e) {
      console.warn('Theme storage error:', e);
    }

    if (isDark) {
      root.classList.add('dark');
      root.classList.remove('light');
      document.body.className = 'bg-slate-950 text-slate-100 antialiased min-h-screen selection:bg-cyan-500/30 selection:text-cyan-200 transition-colors duration-200';
    } else {
      root.classList.remove('dark');
      root.classList.add('light');
      document.body.className = 'bg-[#f0f4fa] text-slate-900 antialiased min-h-screen selection:bg-cyan-500/30 selection:text-cyan-800 transition-colors duration-200';
    }
  }, [isDark]);

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

// Helper to map MediaFormat to loader.to format
function mapFormatForLoader(fmt: MediaFormat): string {
  if (fmt.type === 'audio') return 'mp3';
  const id = (fmt.id || '').toLowerCase();
  const res = (fmt.resolution || '').toLowerCase();
  const qual = (fmt.quality || '').toLowerCase();

  if (id.includes('2160') || res.includes('2160') || res === '4k' || qual.includes('2160') || qual.includes('4k')) {
    return '2160';
  }
  if (id.includes('1440') || res.includes('1440') || res === '2k' || qual.includes('1440') || qual.includes('2k') || qual.includes('qhd')) {
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
}

// Robust resolution format finder matching user selected resolution
function findMatchingVideoFormat(formats: MediaFormat[], targetRes: string): MediaFormat {
  if (!formats || formats.length === 0) {
    throw new Error('Tidak ada format video yang tersedia.');
  }

  const target = (targetRes || '').toLowerCase().trim();

  // 1. If user chose 2K / 1440p
  if (target === '2k' || target === '1440' || target === '1440p' || target.includes('2k') || target.includes('1440')) {
    const match2k = formats.find((f) => {
      const r = (f.resolution || '').toLowerCase();
      const q = (f.quality || '').toLowerCase();
      const id = (f.id || '').toLowerCase();
      return r === '2k' || r.includes('1440') || q.includes('2k') || q.includes('1440') || id.includes('1440');
    });
    if (match2k) return match2k;
  }

  // 2. If user chose 4K / 2160p
  if (target === '4k' || target === '2160' || target === '2160p' || target.includes('4k') || target.includes('2160')) {
    const match4k = formats.find((f) => {
      const r = (f.resolution || '').toLowerCase();
      const q = (f.quality || '').toLowerCase();
      const id = (f.id || '').toLowerCase();
      return r === '4k' || r.includes('2160') || q.includes('4k') || q.includes('2160') || id.includes('2160');
    });
    if (match4k) return match4k;
  }

  // 3. If user chose 1080p
  if (target === '1080p' || target === '1080' || target.includes('1080')) {
    const match1080 = formats.find((f) => {
      const r = (f.resolution || '').toLowerCase();
      const q = (f.quality || '').toLowerCase();
      const id = (f.id || '').toLowerCase();
      return (r.includes('1080') || q.includes('1080') || id.includes('1080')) && !r.includes('1440') && !r.includes('2160');
    });
    if (match1080) return match1080;
  }

  // 4. If user chose 720p
  if (target === '720p' || target === '720' || target.includes('720')) {
    const match720 = formats.find((f) => {
      const r = (f.resolution || '').toLowerCase();
      const q = (f.quality || '').toLowerCase();
      const id = (f.id || '').toLowerCase();
      return (r.includes('720') || q.includes('720') || id.includes('720')) && !r.includes('1080');
    });
    if (match720) return match720;
  }

  // 5. If user chose 480p
  if (target === '480p' || target === '480' || target.includes('480')) {
    const match480 = formats.find((f) => {
      const r = (f.resolution || '').toLowerCase();
      const q = (f.quality || '').toLowerCase();
      return r.includes('480') || q.includes('480');
    });
    if (match480) return match480;
  }

  // 6. If user chose 360p
  if (target === '360p' || target === '360' || target.includes('360')) {
    const match360 = formats.find((f) => {
      const r = (f.resolution || '').toLowerCase();
      const q = (f.quality || '').toLowerCase();
      return r.includes('360') || q.includes('360');
    });
    if (match360) return match360;
  }

  // Fallback: match by substring
  const cleanTarget = target.replace(/p$/i, '');
  const generalMatch = formats.find((f) => {
    const r = (f.resolution || '').toLowerCase();
    const q = (f.quality || '').toLowerCase();
    return r.includes(cleanTarget) || q.includes(cleanTarget);
  });
  if (generalMatch) return generalMatch;

  return formats[0];
}

  // Perform download execution
  const executeDownload = async (targetFormat: MediaFormat, currentMedia: MediaMetadata) => {
    setIsDownloading(true);
    setDownloadProgress(15);
    setDownloadStatusText(`Menghubungkan ke server ${targetFormat.quality}...`);

    const ext = targetFormat.extension;
    const sanitizedTitle = (currentMedia.title || 'media').slice(0, 40).replace(/[^a-zA-Z0-9_-]/g, '_');
    const resTag = targetFormat.resolution || (targetFormat.quality.includes('2K') ? '2K' : targetFormat.quality.includes('4K') ? '4K' : targetFormat.quality.split(' ')[0]);
    const filename = `DownloaderZero_${sanitizedTitle}_${resTag}.${ext}`;

    try {
      let finalUrl = targetFormat.url;
      let jobId = targetFormat.jobId;

      // If format requires async conversion job (e.g. YouTube loader)
      if (!targetFormat.isDirect || targetFormat.url.includes('loader.to') || targetFormat.id.startsWith('yt-')) {
        if (!jobId) {
          const loaderFormat = mapFormatForLoader(targetFormat);
          setDownloadStatusText(`Memulai antrean konversi ${targetFormat.quality}...`);
          try {
            const startRes = await fetch('/api/start-job', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                format: loaderFormat,
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
          setDownloadStatusText(`Sedang memproses konversi ${targetFormat.quality}...`);
          let finished = false;
          let attempts = 0;

          while (!finished && attempts < 40) {
            attempts++;
            await new Promise((r) => setTimeout(r, 1200));
            setDownloadProgress((prev) => Math.min(88, prev + 2));

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

      if (!finalUrl || typeof finalUrl !== 'string' || (!finalUrl.startsWith('http') && !finalUrl.startsWith('//'))) {
        throw new Error('Tautan unduhan tidak valid atau berkas belum siap dari server sumber.');
      }

      const downloadHref = `/api/proxy-download?url=${encodeURIComponent(finalUrl)}&filename=${encodeURIComponent(filename)}`;

      // TeraBox Direct Background Download: Browser downloads directly without buffering huge files into RAM
      if (currentMedia.platform === 'terabox') {
        setDownloadProgress(100);
        setDownloadStatusText('Memulai unduhan langsung di browser...');

        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = downloadHref;
        document.body.appendChild(iframe);
        setTimeout(() => {
          try {
            document.body.removeChild(iframe);
          } catch {}
        }, 60000);

        try {
          await saveDownloadedMedia({
            sourceUrl: finalUrl,
            platform: currentMedia.platform,
            title: currentMedia.title || 'Berkas TeraBox',
            author: currentMedia.author || 'TeraBox Cloud',
            thumbnail: currentMedia.thumbnail || '',
            quality: targetFormat.quality,
            resolution: targetFormat.resolution,
            mediaType: targetFormat.type,
            extension: targetFormat.extension,
            filename,
            filesize: targetFormat.filesize || 'Direct Cloud File',
            filesizeBytes: targetFormat.filesizeBytes || 0
          });
        } catch (e) {
          console.warn('History save notice:', e);
        }

        setTimeout(() => {
          setIsDownloading(false);
          setDownloadProgress(0);
          setDownloadStatusText('');
        }, 2200);
        return;
      }

      setDownloadProgress(70);
      setDownloadStatusText('Mengunduh & menyiapkan berkas...');
      
      try {
        const response = await fetch(downloadHref);
        if (!response.ok) {
          const errText = await response.text().catch(() => '');
          throw new Error(errText || `Gagal mengunduh berkas dari server (kode: ${response.status})`);
        }

        const contentLength = +(response.headers.get('content-length') || 0);
        let rawBlob: Blob;

        if (response.body && typeof response.body.getReader === 'function') {
          const reader = response.body.getReader();
          const chunks: Uint8Array[] = [];
          let received = 0;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              chunks.push(value);
              received += value.length;
              if (contentLength > 0) {
                const streamPct = Math.min(97, 70 + Math.round((received / contentLength) * 27));
                setDownloadProgress(streamPct);
              } else {
                setDownloadProgress((prev) => Math.min(95, prev + 1));
              }
            }
          }
          const targetMime = targetFormat.type === 'video' ? 'video/mp4' : targetFormat.type === 'audio' ? 'audio/mpeg' : 'application/octet-stream';
          rawBlob = new Blob(chunks as any, { type: targetMime });
        } else {
          setDownloadProgress(90);
          rawBlob = await response.blob();
        }

        if (rawBlob.size <= 60 && targetFormat.type !== 'photos') {
          const text = await rawBlob.text();
          if (text.includes('gagal') || text.includes('Error')) {
            throw new Error(text);
          }
        }

        const targetMime = targetFormat.type === 'video' ? 'video/mp4' : targetFormat.type === 'audio' ? 'audio/mpeg' : rawBlob.type || 'application/octet-stream';
        const blob = rawBlob.type === targetMime ? rawBlob : new Blob([rawBlob], { type: targetMime });

        setDownloadProgress(98);
        setDownloadStatusText('Menyimpan berkas...');

        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);

        // Automatically cache in local IndexedDB history without blocking completion
        saveDownloadedMedia({
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
        }).catch((histErr) => {
          console.warn('History save notice:', histErr);
        });
      } catch (fetchErr: any) {
        throw new Error(fetchErr.message || 'Gagal mengunduh berkas media.');
      }

      setDownloadProgress(100);
      setDownloadStatusText('Unduhan selesai & tersimpan di Riwayat!');

      setTimeout(() => {
        setIsDownloading(false);
        setDownloadProgress(0);
        setDownloadStatusText('');
      }, 2000);
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

    const isPlaylist =
      (detected === 'spotify' || selectedPlatform === 'spotify') &&
      /(?:spotify\.com\/(?:intl-[a-z]+\/)?(playlist|album)\/|spotify\.link\/)/i.test(url.trim());

    setIsLoading(true);
    setErrorMessage(null);

    const customKey = localStorage.getItem('dz_neoxr_api_key') || '';

    try {
      // 1. Extract metadata from URL (sending optional user API key to backend)
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), apiKey: customKey })
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Gagal mengekstrak media dari URL.');
      }

      const media: MediaMetadata = json.data;
      setIsLoading(false);

      // 1. If Spotify Playlist/Album: Open SpotifyPlaylistModal floating panel immediately
      if (media.platform === 'spotify' && (media.isAudioPlaylist || isPlaylist)) {
        setMediaData(media);
        setIsSpotifyModalOpen(true);
        return;
      }

      // 2. If Spotify Single Track: Directly download without showing preview card!
      if (media.platform === 'spotify') {
        setMediaData(null); // No preview shown per requirement
        const chosenFormat = media.formats.find((f) => f.type === 'audio') || media.formats[0];
        if (chosenFormat) {
          await executeDownload(chosenFormat, media);
        } else {
          throw new Error('Format audio Spotify tidak ditemukan.');
        }
        return;
      }

      setMediaData(media);

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

      // If TeraBox: Directly download the file without video/audio quality prompt
      if (media.platform === 'terabox') {
        const chosenFormat = media.formats[0];
        if (chosenFormat && chosenFormat.url) {
          await executeDownload(chosenFormat, media);
        } else {
          throw new Error('Tautan unduhan berkas TeraBox tidak ditemukan.');
        }
        return;
      }

      // 3. Find best matching format for video or other platforms
      const filteredFormats = media.formats.filter((f) => f.type === mediaType);
      const searchPool = filteredFormats.length > 0 ? filteredFormats : media.formats;

      let chosenFormat: MediaFormat | undefined;
      if (mediaType === 'video') {
        chosenFormat = findMatchingVideoFormat(searchPool, selectedVideoRes);
      } else {
        chosenFormat =
          searchPool.find((f) => f.quality.includes(selectedAudioQuality) || f.type === 'audio') ||
          searchPool[0];
      }

      if (chosenFormat && chosenFormat.url && (chosenFormat.url.startsWith('http') || chosenFormat.isDirect === false)) {
        await executeDownload(chosenFormat, media);
      }
    } catch (err: any) {
      setIsLoading(false);
      setErrorMessage(err.message || 'Gagal memproses media. Pastikan URL publik dan dapat diakses.');
    }
  };

  const isSpotifyPlaylist =
    selectedPlatform === 'spotify' &&
    /(?:spotify\.com\/(?:intl-[a-z]+\/)?(playlist|album)\/|spotify\.link\/)/i.test(url.trim());

  return (
    <div className={`min-h-screen w-full flex flex-col items-center justify-start antialiased transition-colors duration-200 ${
      isDark
        ? 'bg-[#030718] text-slate-100 selection:bg-cyan-500/30 selection:text-cyan-200'
        : 'bg-[#f0f4fa] text-slate-900 selection:bg-cyan-500/30 selection:text-cyan-800'
    }`}>
      {/* Full-Screen Expansive Container */}
      <main className="w-full max-w-5xl lg:max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-6 flex flex-col items-center gap-4 sm:gap-6">
        {/* 1. Header & Brand Navigation */}
        <Navbar
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenMenu={() => setIsMenuOpen(true)}
          onOpenHistory={() => setIsHistoryOpen(true)}
          historyCount={historyCount}
        />

        {/* 2. Full Image Banner with Blue Decorative Frame */}
        <BannerDZ />

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

        {/* 5 & 6. Media Type Tabs and Quality Selection Card (Smoothly transitions for TeraBox Direct Mode) */}
        <AnimatePresence mode="wait" initial={false}>
          {selectedPlatform === 'terabox' ? (
            <motion.div
              key="terabox-cloud-panel"
              initial={{ opacity: 0, scale: 0.98, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: -6 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="w-full"
            >
              <div className="w-full dz-card rounded-2xl p-4 sm:p-5 border border-sky-500/40 flex items-center gap-3.5 shadow-sm">
                <div className="w-11 h-11 rounded-2xl bg-sky-500/20 border border-sky-400/40 flex items-center justify-center text-sky-400 shrink-0">
                  <svg className="w-6 h-6 text-sky-400 fill-current" viewBox="0 0 24 24">
                    <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/>
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs sm:text-sm font-bold text-white tracking-tight">
                      Mode Berkas TeraBox Cloud
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-sky-950/90 text-sky-300 border border-sky-500/50 font-bold">
                      Direct Cloud File
                    </span>
                  </div>
                  <p className="text-[11px] sm:text-xs text-slate-300 leading-relaxed">
                    Video atau berkas cloud diunduh langsung dalam kualitas dan ukuran aslinya tanpa perlu memilih resolusi manual.
                  </p>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="platform-selectors-panel"
              initial={{ opacity: 0, scale: 0.98, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: -6 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="w-full flex flex-col gap-4 sm:gap-5"
            >
              <MediaTypeTabs
                mediaType={mediaType}
                setMediaType={setMediaType}
                isAudioOnly={selectedPlatform === 'spotify'}
              />

              <QualitySelectorCard
                mediaType={mediaType}
                setMediaType={setMediaType}
                selectedVideoRes={selectedVideoRes}
                setSelectedVideoRes={setSelectedVideoRes}
                selectedAudioQuality={selectedAudioQuality}
                setSelectedAudioQuality={setSelectedAudioQuality}
                isAudioOnly={selectedPlatform === 'spotify'}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* 7. Huge Download Button with Cyber Accents */}
        <DownloadButton
          onDownload={handleMainDownload}
          isLoading={isLoading}
          isDownloading={isDownloading}
          downloadProgress={downloadProgress}
          downloadStatusText={downloadStatusText}
          isSpotifyPlaylist={isSpotifyPlaylist}
        />

        {/* 8. Media Preview Card: only real video or photo slide; animated fluid entrance */}
        <AnimatePresence>
          {mediaData?.isPhotoSlide && mediaData.images && mediaData.images.length > 0 ? (
            <motion.div
              key="photo-slide-preview"
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.98 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="w-full"
            >
              <PhotoSlideCard media={mediaData} />
            </motion.div>
          ) : mediaData && mediaData.platform !== 'spotify' ? (
            <motion.div
              key="video-preview"
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.98 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="w-full"
            >
              <VideoPreviewCard
                media={mediaData}
                selectedResolution={selectedVideoRes}
                onClick={() => {
                  if (mediaData) {
                    setIsFormatModalOpen(true);
                  }
                }}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>

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

      {/* Spotify Playlist Modal (Floating large square panel with signature Spotify look) */}
      {mediaData && mediaData.platform === 'spotify' && (mediaData.isAudioPlaylist || (mediaData.tracks && mediaData.tracks.length > 1)) && (
        <SpotifyPlaylistModal
          isOpen={isSpotifyModalOpen}
          onClose={() => setIsSpotifyModalOpen(false)}
          media={mediaData}
        />
      )}
    </div>
  );
}
