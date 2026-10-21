import React from 'react';
import { Link2, Clipboard, X, AlertCircle, Sparkles, CheckCircle2 } from 'lucide-react';
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

  return (
    <div className="dz-card rounded-2xl p-3.5 sm:p-5 w-full transition-all duration-200 border border-blue-900/60 hover:border-cyan-500/40">
      {/* Card Header: Link icon + Label + Auto-detect indicator */}
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-cyan-300">
          <Link2 className="h-4 w-4 text-cyan-400 rotate-45 shrink-0" />
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
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/80 border border-emerald-500/50 text-[11px] font-bold text-emerald-300 shadow-sm"
            >
              <CheckCircle2 className="h-3 w-3 text-emerald-400" />
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
            className="w-full h-11 sm:h-12 pl-3.5 pr-9 bg-[#050e24] border border-blue-900/80 rounded-xl text-white text-xs sm:text-sm placeholder-slate-500 focus:outline-none focus:border-cyan-400 focus:shadow-[0_0_10px_rgba(6,182,212,0.25)] font-mono transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]"
          />
          <AnimatePresence>
            {url && (
              <motion.button
                key="clear-url-btn"
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.7 }}
                transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
                type="button"
                onClick={handleClear}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1 active:scale-[0.88] transition-colors duration-150 cursor-pointer"
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
          className="h-11 sm:h-12 px-3.5 sm:px-4 rounded-xl border border-cyan-500/40 bg-[#0c224a] hover:bg-[#12316b] hover:border-cyan-400 text-white flex items-center gap-1.5 text-xs sm:text-sm font-bold shadow-sm hover:shadow-[0_0_10px_rgba(6,182,212,0.3)] active:scale-[0.96] hover:-translate-y-0.5 transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] cursor-pointer shrink-0 touch-manipulation"
          title="Tempel dari papan klip"
        >
          <Clipboard className="h-4 w-4 text-cyan-400" />
          <span>Paste</span>
        </button>
      </div>

      {/* Helper text under input */}
      <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2 px-1">
        <span className="flex items-center gap-1">
          <Sparkles className="h-3 w-3 text-cyan-400" />
          Platform langsung terpilih otomatis begitu tautan ditempelkan.
        </span>
        {onOpenPlatformModal && (
          <button
            type="button"
            onClick={onOpenPlatformModal}
            className="text-cyan-400 hover:text-cyan-300 font-semibold cursor-pointer underline underline-offset-2 ml-2 shrink-0 hidden sm:inline transition-colors duration-150"
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
  );
};
