import React from 'react';
import { Link2, X, Download, AlertCircle, Loader2, Clipboard } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { PlatformType } from '../types/index.ts';

interface UrlInputCardProps {
  url: string;
  setUrl: (url: string) => void;
  selectedPlatform: PlatformType;
  errorMessage: string | null;
  onClearError: () => void;
  onDownloadClick: () => void;
  isLoading?: boolean;
}

export const UrlInputCard: React.FC<UrlInputCardProps> = ({
  url,
  setUrl,
  selectedPlatform,
  errorMessage,
  onClearError,
  onDownloadClick,
  isLoading = false
}) => {
  const handleClear = () => {
    setUrl('');
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
      // If clipboard permission prompt is blocked, allow user manual paste
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onDownloadClick();
    }
  };

  return (
    <div className="w-full space-y-3">
      {/* URL Input Capsule Bar */}
      <div className="relative w-full rounded-full bg-white/95 dark:bg-[#0a183d]/90 border border-slate-300 dark:border-blue-500/35 hover:border-sky-500 dark:hover:border-cyan-400/60 focus-within:border-sky-500 dark:focus-within:border-cyan-400 focus-within:ring-2 focus-within:ring-sky-500/25 dark:focus-within:ring-cyan-500/30 backdrop-blur-md px-3.5 sm:px-4 py-2.5 sm:py-3.5 flex items-center gap-2.5 sm:gap-3 shadow-lg shadow-slate-900/10 dark:shadow-xl dark:shadow-black/50 transition-all">
        {/* Glowing Chain Link Icon */}
        <div className="w-8 h-8 rounded-full bg-sky-100 dark:bg-blue-500/20 border border-sky-300 dark:border-blue-400/40 flex items-center justify-center text-sky-600 dark:text-cyan-400 shrink-0">
          <Link2 className="w-4 h-4 rotate-45 stroke-[2.5]" />
        </div>

        {/* Input Field */}
        <input
          type="url"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            onClearError();
          }}
          onKeyDown={handleKeyDown}
          placeholder="Tempel link di sini..."
          className="flex-1 bg-transparent text-slate-900 dark:text-white placeholder-slate-400 text-sm font-sans focus:outline-none min-w-0"
        />

        {/* Dynamic Action Button: Smooth switch between "Tempel" (before URL) and "X" (after URL) */}
        <div className="shrink-0 flex items-center">
          <AnimatePresence mode="wait" initial={false}>
            {url ? (
              <motion.button
                key="clear-button"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                type="button"
                onClick={handleClear}
                className="w-8 h-8 rounded-full bg-slate-200 hover:bg-slate-300 dark:bg-white/10 dark:hover:bg-white/20 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white flex items-center justify-center active:scale-90 transition-all cursor-pointer"
                title="Hapus tautan"
                aria-label="Hapus tautan"
              >
                <X className="w-4 h-4 stroke-[2.5]" />
              </motion.button>
            ) : (
              <motion.button
                key="paste-button"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                type="button"
                onClick={handlePaste}
                className="px-3.5 py-1.5 rounded-full bg-sky-100 hover:bg-sky-200 dark:bg-blue-500/20 dark:hover:bg-blue-500/35 border border-sky-300 dark:border-cyan-400/40 text-sky-700 dark:text-cyan-300 text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer shadow-xs"
                title="Tempel tautan dari papan klip"
                aria-label="Tempel tautan dari papan klip"
              >
                <Clipboard className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Tempel</span>
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Main Download Button */}
      <button
        type="button"
        disabled={isLoading}
        onClick={onDownloadClick}
        className="w-full py-3.5 sm:py-4 rounded-full bg-gradient-to-r from-[#1864f7] via-[#1d74fe] to-[#00b4d8] hover:from-[#1354d4] hover:to-[#009ec0] active:scale-[0.98] text-white font-bold flex items-center justify-center gap-2.5 shadow-lg shadow-blue-600/30 dark:shadow-blue-600/35 transition-all text-sm sm:text-base cursor-pointer disabled:opacity-60"
      >
        {isLoading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Memeriksa Media...</span>
          </>
        ) : (
          <>
            <Download className="w-5 h-5 stroke-[2.5]" />
            <span>Download</span>
          </>
        )}
      </button>

      {/* Error Message */}
      <AnimatePresence>
        {errorMessage && (
          <motion.div
            initial={{ opacity: 0, y: -6, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -6, height: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="p-3 rounded-2xl bg-red-50 dark:bg-red-950/80 border border-red-200 dark:border-red-800/80 text-red-700 dark:text-red-200 text-xs flex items-start gap-2.5 shadow-md">
              <AlertCircle className="w-4 h-4 text-red-500 dark:text-red-400 shrink-0 mt-0.5" />
              <span className="flex-1 leading-relaxed">{errorMessage}</span>
              <button
                type="button"
                onClick={onClearError}
                className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-white p-0.5 active:scale-90 transition-all cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
