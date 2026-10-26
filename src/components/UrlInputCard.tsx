import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link2, Clipboard, X, AlertCircle, Sparkles, CheckCircle2, Bookmark } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { PlatformType } from '../types/index.ts';
import { detectPlatform } from '../services/scraper.ts';

interface UrlInputCardProps {
  url: string;
  setUrl: (url: string) => void;
  selectedPlatform: PlatformType;
  errorMessage: string | null;
  onClearError: () => void;
  isAutoDetected?: boolean;
  onOpenPlatformModal?: () => void;
}

export const UrlInputCard: React.FC<UrlInputCardProps> = ({
  url,
  setUrl,
  selectedPlatform,
  errorMessage,
  onClearError,
  isAutoDetected = false,
  onOpenPlatformModal
}) => {
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isTutorialOpen) {
        setIsTutorialOpen(false);
      }
    };
    if (isTutorialOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isTutorialOpen]);

  const getPlaceholder = () => {
    switch (selectedPlatform) {
      case 'youtube':
        return 'Tempel link YouTube (video, shorts, atau audio)...';
      case 'tiktok':
        return 'Tempel link TikTok (video tanpa watermark atau slide foto)...';
      case 'facebook':
        return 'Tempel link Facebook (video publik atau reels)...';
      case 'instagram':
        return 'Tempel link Instagram (reels, video, carousel foto)...';
      case 'pinterest':
        return 'Tempel link Pinterest (video pin, reels, atau foto 4K)...';
      case 'spotify':
        return 'Tempel link Spotify (lagu, album, atau playlist)...';
      case 'terabox':
        return 'Tempel link TeraBox (video atau berkas cloud link)...';
      default:
        return 'Tempel tautan video/audio apa saja di sini...';
    }
  };

  const handleInputChange = (newVal: string) => {
    setUrl(newVal);
    onClearError();
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrl(text.trim());
        onClearError();
      }
    } catch {
      // If clipboard permission is restricted in iframe, user can paste manually
    }
  };

  const handleClear = () => {
    setUrl('');
    onClearError();
  };

  const detectedNow = url ? detectPlatform(url) : 'unknown';
  const showDetectedBadge = detectedNow !== 'unknown';

  const tutorialModalContent = (
    <AnimatePresence>
      {isTutorialOpen && (
        <motion.div
          key="tutorial-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-0 z-[1000] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5"
          onClick={() => setIsTutorialOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <motion.div
            key="tutorial-modal-card"
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-[#07132e] border-2 border-amber-400/80 rounded-3xl p-5 sm:p-7 shadow-2xl shadow-black/95 max-h-[85vh] flex flex-col relative text-slate-100"
          >
            {/* Top Bar: Book accent tab and close button ONLY (strictly NO title/heading as requested) */}
            <div className="flex items-center justify-between pb-3.5 mb-3.5 border-b border-amber-400/25">
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-full border-2 border-yellow-400 bg-transparent text-yellow-400 font-black text-xs flex items-center justify-center">
                  ?
                </div>
                <Bookmark className="h-4.5 w-4.5 text-amber-400" />
                <div className="h-1.5 w-10 rounded-full bg-amber-400/60" />
              </div>
              <button
                type="button"
                onClick={() => setIsTutorialOpen(false)}
                className="h-8 w-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-white bg-slate-900/80 hover:bg-slate-800 active:scale-90 transition-all cursor-pointer border border-slate-800"
                aria-label="Tutup petunjuk"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            {/* Tutorial Content: Detailed step-by-step instructions */}
            <div className="overflow-y-auto pr-1 space-y-3 text-xs sm:text-sm text-slate-200 leading-relaxed font-sans">
              {/* Step 1 */}
              <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-[#0b1b3d] border border-blue-900/60">
                <div className="w-6 h-6 rounded-lg bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                  1
                </div>
                <div className="space-y-1">
                  <p className="font-bold text-white text-xs sm:text-sm">Salin Tautan Media</p>
                  <p className="text-slate-300 text-[11px] sm:text-xs">
                    Buka aplikasi atau website media sosial pilihan Anda (YouTube, TikTok, Facebook, Instagram, Pinterest, Spotify, atau TeraBox). Pilih konten yang ingin disimpan, klik menu <strong>Bagikan (Share)</strong>, lalu pilih <strong>Salin Tautan (Copy Link)</strong>.
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-[#0b1b3d] border border-blue-900/60">
                <div className="w-6 h-6 rounded-lg bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                  2
                </div>
                <div className="space-y-1">
                  <p className="font-bold text-white text-xs sm:text-sm">Tempelkan Tautan ke Kolom Input</p>
                  <p className="text-slate-300 text-[11px] sm:text-xs">
                    Kembali ke DownloaderZero, lalu klik tombol <strong>Paste</strong> atau tempel langsung tautan ke dalam kolom teks. Platform sumber akan otomatis terdeteksi tanpa perlu dipilih manual.
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-[#0b1b3d] border border-blue-900/60">
                <div className="w-6 h-6 rounded-lg bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                  3
                </div>
                <div className="space-y-1">
                  <p className="font-bold text-white text-xs sm:text-sm">Pilih Format & Kualitas Unduhan</p>
                  <p className="text-slate-300 text-[11px] sm:text-xs">
                    Pilih tab <strong>Video</strong> untuk resolusi mulai dari 360p, 720p HD, 1080p FHD, hingga 4K. Atau pilih tab <strong>Audio</strong> jika Anda ingin mengunduh berkas MP3 dengan opsi bitrate 128 kbps, 192 kbps, hingga 320 kbps jernih.
                  </p>
                </div>
              </div>

              {/* Step 4 */}
              <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-[#0b1b3d] border border-blue-900/60">
                <div className="w-6 h-6 rounded-lg bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                  4
                </div>
                <div className="space-y-1">
                  <p className="font-bold text-white text-xs sm:text-sm">Fitur Khusus Platform</p>
                  <div className="text-slate-300 text-[11px] sm:text-xs space-y-1 mt-1">
                    <p>• <strong>TikTok</strong>: Otomatis bersih tanpa watermark. Untuk konten slide foto, Anda dapat mengunduh foto satu per satu atau sekaligus dalam 1 paket ZIP.</p>
                    <p>• <strong>Spotify</strong>: Mengunduh trek satuan atau seluruh lagu album & playlist langsung dipaketkan rapi ke berkas ZIP.</p>
                    <p>• <strong>TeraBox</strong>: Mendukung konversi link cloud video/file langsung menjadi link unduhan langsung berkecepatan tinggi.</p>
                    <p>• <strong>Instagram & Pinterest</strong>: Mendukung video reel, slide foto carousel, dan gambar resolusi penuh.</p>
                  </div>
                </div>
              </div>

              {/* Step 5 */}
              <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-[#0b1b3d] border border-blue-900/60">
                <div className="w-6 h-6 rounded-lg bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                  5
                </div>
                <div className="space-y-1">
                  <p className="font-bold text-white text-xs sm:text-sm">Mulai Unduh & Simpan ke Perangkat</p>
                  <p className="text-slate-300 text-[11px] sm:text-xs">
                    Klik tombol <strong>Unduh Sekarang</strong>. Media akan diproses secara instan dan berkas langsung tersimpan ke folder Unduhan (Downloads) perangkat Anda. Riwayat unduhan juga tersimpan aman di browser selama 24 jam sehingga Anda dapat mengunduh ulang kapan pun tanpa menghabiskan kuota ganda.
                  </p>
                </div>
              </div>
            </div>

            {/* Bottom Action */}
            <div className="mt-4 pt-3.5 border-t border-amber-400/25 flex justify-end">
              <button
                type="button"
                onClick={() => setIsTutorialOpen(false)}
                className="px-5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs sm:text-sm active:scale-95 transition-all duration-150 cursor-pointer shadow-sm"
              >
                Tutup
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <>
      <div className="dz-card rounded-2xl p-3.5 sm:p-5 w-full transition-all duration-200 border border-slate-300 dark:border-blue-900/60 hover:border-cyan-500/50 relative">
        {/* Card Header: Gold guide circle + Link icon + Label + Auto-detect indicator */}
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-cyan-800 dark:text-cyan-300">
            {/* Outlined yellow circle with yellow '?' - transparent center, opens floating tutorial panel */}
            <button
              type="button"
              onClick={() => setIsTutorialOpen(true)}
              className="w-5 h-5 rounded-full border-2 border-yellow-500 dark:border-yellow-400 hover:border-yellow-400 dark:hover:border-yellow-300 bg-transparent text-yellow-600 dark:text-yellow-400 hover:text-yellow-500 dark:hover:text-yellow-300 active:scale-90 font-bold text-xs flex items-center justify-center shrink-0 cursor-pointer transition-all duration-150 touch-manipulation select-none"
              title="Buka petunjuk cara penggunaan"
              aria-label="Buka petunjuk cara penggunaan"
            >
              ?
            </button>
            <Link2 className="h-4 w-4 text-cyan-600 dark:text-cyan-400 rotate-45 shrink-0" />
            <span className="tracking-wide">Tempelkan Tautan Media</span>
          </div>

          {/* Dynamic Auto-Detect Badge with Fluid Entrance & Exit */}
          <AnimatePresence>
            {showDetectedBadge && (
              <motion.div
                key={`detected-${detectedNow}`}
                initial={{ opacity: 0, scale: 0.88, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.88, y: -4 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/80 border border-emerald-300 dark:border-emerald-500/50 text-[11px] font-bold text-emerald-800 dark:text-emerald-300 shadow-sm"
              >
                <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                <span className="capitalize">{detectedNow} Terdeteksi Otomatis</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      {/* Input Row */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            type="url"
            value={url}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder={getPlaceholder()}
            className="w-full h-11 sm:h-12 pl-3.5 pr-9 bg-white dark:bg-[#050e24] border border-slate-300 dark:border-blue-900/80 rounded-xl text-slate-900 dark:text-white text-xs sm:text-sm placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 font-mono transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]"
          />
          <AnimatePresence>
            {url && (
              <motion.button
                key="clear-url-btn"
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.7 }}
                transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                type="button"
                onClick={handleClear}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-800 dark:hover:text-white p-1 active:scale-[0.88] transition-colors duration-150 cursor-pointer"
                title="Hapus teks tautan"
              >
                <X className="h-4 w-4" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* Paste Button */}
        <button
          type="button"
          onClick={handlePaste}
          className="h-11 sm:h-12 px-3.5 sm:px-4 rounded-xl border border-sky-300 dark:border-cyan-500/40 bg-sky-50 dark:bg-[#0c224a] hover:bg-sky-100 dark:hover:bg-[#12316b] hover:border-sky-400 dark:hover:border-cyan-400 text-sky-900 dark:text-white flex items-center gap-1.5 text-xs sm:text-sm font-bold active:scale-[0.97] transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] cursor-pointer shrink-0 touch-manipulation shadow-sm"
          title="Tempel dari papan klip"
        >
          <Clipboard className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
          <span>Paste</span>
        </button>
      </div>

      {/* Helper text under input */}
      <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400 mt-2 px-1">
        <span className="flex items-center gap-1">
          <Sparkles className="h-3 w-3 text-cyan-600 dark:text-cyan-400" />
          Platform langsung terpilih otomatis begitu tautan ditempelkan.
        </span>
        {onOpenPlatformModal && (
          <button
            type="button"
            onClick={onOpenPlatformModal}
            className="text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 font-semibold cursor-pointer underline underline-offset-2 ml-2 shrink-0 hidden sm:inline transition-colors duration-150"
          >
            Ganti Manual
          </button>
        )}
      </div>

      {/* Error Message with Smooth Expansion & Collapse */}
      <AnimatePresence>
        {errorMessage && (
          <motion.div
            key="url-error-box"
            initial={{ opacity: 0, height: 0, y: -6 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={{ opacity: 0, height: 0, y: -6 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-3 p-3 rounded-xl bg-red-950/70 border border-red-800/80 text-red-200 text-xs flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
              <span className="flex-1 leading-relaxed">{errorMessage}</span>
              <button
                type="button"
                onClick={onClearError}
                className="text-red-400 hover:text-red-200 p-0.5 active:scale-90 transition-transform cursor-pointer"
                aria-label="Tutup pesan galat"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>

    {/* Floating Notice Book Modal Portaled to Body (Truly floating, cannot penetrate or get clipped by other panels) */}
    {typeof document !== 'undefined' && createPortal(tutorialModalContent, document.body)}
  </>
  );
};
