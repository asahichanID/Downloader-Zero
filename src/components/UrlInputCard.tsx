import React from 'react';
import { Link2, Clipboard, X, AlertCircle } from 'lucide-react';
import type { PlatformType } from '../types/index.ts';

interface UrlInputCardProps {
  url: string;
  setUrl: (url: string) => void;
  selectedPlatform: PlatformType;
  errorMessage: string | null;
  onClearError: () => void;
}

export const UrlInputCard: React.FC<UrlInputCardProps> = ({
  url,
  setUrl,
  selectedPlatform,
  errorMessage,
  onClearError
}) => {
  const getPlaceholder = () => {
    switch (selectedPlatform) {
      case 'youtube':
        return 'https://www.youtube.com/watch?v=...';
      case 'tiktok':
        return 'https://www.tiktok.com/@user/video/...';
      case 'facebook':
        return 'https://www.facebook.com/watch/?v=...';
      case 'instagram':
        return 'https://www.instagram.com/reel/...';
      default:
        return 'https://www.youtube.com/watch?v=...';
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrl(text.trim());
        onClearError();
      }
    } catch {
      // If clipboard permission is restricted in iframe, user can paste with keyboard/tap
    }
  };

  const handleClear = () => {
    setUrl('');
    onClearError();
  };

  return (
    <div className="dz-card rounded-2xl p-3 sm:p-4 w-full shadow-lg transition-all">
      {/* Card Header: Link icon + Label */}
      <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-cyan-300 mb-2.5">
        <Link2 className="h-4 w-4 text-cyan-400 rotate-45" />
        <span className="tracking-wide">Tempelkan URL di sini...</span>
      </div>

      {/* Input Row */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            type="url"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              onClearError();
            }}
            placeholder={getPlaceholder()}
            className="w-full h-11 sm:h-12 pl-3.5 pr-8 bg-[#050e24] border border-blue-900/80 rounded-xl text-white text-xs sm:text-sm placeholder-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 font-mono transition-all"
          />
          {url && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Paste Button */}
        <button
          type="button"
          onClick={handlePaste}
          className="h-11 sm:h-12 px-3.5 sm:px-4 rounded-xl border border-cyan-500/60 bg-[#0c224a] hover:bg-[#12316b] text-white flex items-center gap-1.5 text-xs sm:text-sm font-bold shadow-md hover:shadow-[0_0_12px_rgba(6,182,212,0.4)] transition-all cursor-pointer shrink-0"
        >
          <Clipboard className="h-4 w-4 text-cyan-400" />
          <span>Paste</span>
        </button>
      </div>

      {/* Error Message */}
      {errorMessage && (
        <div className="mt-2.5 p-2.5 rounded-xl bg-red-950/70 border border-red-800/80 text-red-200 text-xs flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
          <span className="flex-1">{errorMessage}</span>
          <button
            type="button"
            onClick={onClearError}
            className="text-red-400 hover:text-red-200"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
