import React from 'react';
import {
  Link as LinkIcon,
  Clipboard,
  Download,
  Loader2,
  X,
  Youtube,
  Film,
  Music,
  Share2,
  AlertCircle
} from 'lucide-react';
import type { PlatformType, MediaType } from '../types/index.ts';

interface DownloaderFormProps {
  url: string;
  setUrl: (val: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  isLoading: boolean;
  detectedPlatform: PlatformType;
  mediaTypeFilter: MediaType;
  setMediaTypeFilter: (val: MediaType) => void;
  errorMessage: string | null;
  onClearError: () => void;
}

export const DownloaderForm: React.FC<DownloaderFormProps> = ({
  url,
  setUrl,
  onSubmit,
  isLoading,
  detectedPlatform,
  mediaTypeFilter,
  setMediaTypeFilter,
  errorMessage,
  onClearError
}) => {
  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrl(text.trim());
        onClearError();
      }
    } catch {
      // Clipboard access denied or not supported in iframe, user can paste manually
    }
  };

  const handleClear = () => {
    setUrl('');
    onClearError();
  };

  const getPlatformIcon = () => {
    switch (detectedPlatform) {
      case 'youtube':
        return <Youtube className="h-4 w-4 text-red-500" />;
      case 'tiktok':
        return <Film className="h-4 w-4 text-cyan-400" />;
      case 'facebook':
        return <Share2 className="h-4 w-4 text-blue-500" />;
      case 'instagram':
        return <Music className="h-4 w-4 text-pink-500" />;
      default:
        return <LinkIcon className="h-4 w-4 text-slate-500" />;
    }
  };

  const getPlatformLabel = () => {
    switch (detectedPlatform) {
      case 'youtube':
        return 'YouTube Terdeteksi';
      case 'tiktok':
        return 'TikTok Terdeteksi';
      case 'facebook':
        return 'Facebook Terdeteksi';
      case 'instagram':
        return 'Instagram Terdeteksi';
      default:
        return 'Otomatis Deteksi';
    }
  };

  return (
    <div className="relative w-full max-w-4xl mx-auto rounded-3xl p-6 sm:p-8 glass-panel glow-cyan transition-all border border-slate-800/80 light:border-slate-200">
      {/* 3D Decorative corner gradients */}
      <div className="absolute -top-12 -left-12 h-32 w-32 rounded-full bg-cyan-500/15 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-12 -right-12 h-32 w-32 rounded-full bg-blue-600/15 blur-3xl pointer-events-none" />

      {/* Mode Selector Tabs (Video vs Audio MP3) */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-900/90 border border-slate-800 light:bg-slate-100 light:border-slate-300">
          <button
            type="button"
            onClick={() => setMediaTypeFilter('video')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
              mediaTypeFilter === 'video'
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md shadow-cyan-500/25'
                : 'text-slate-400 hover:text-white light:text-slate-600 light:hover:text-slate-900'
            }`}
          >
            <Film className="h-3.5 w-3.5" />
            <span>Video (360p - 4K)</span>
          </button>

          <button
            type="button"
            onClick={() => setMediaTypeFilter('audio')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
              mediaTypeFilter === 'audio'
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md shadow-cyan-500/25'
                : 'text-slate-400 hover:text-white light:text-slate-600 light:hover:text-slate-900'
            }`}
          >
            <Music className="h-3.5 w-3.5" />
            <span>Audio MP3 (64 - 320 kbps)</span>
          </button>
        </div>

        {/* Live Detected Platform Pill */}
        <div className="flex items-center gap-2 text-xs font-mono text-slate-400 light:text-slate-600 bg-slate-900/60 light:bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-800/60 light:border-slate-200">
          {getPlatformIcon()}
          <span>{getPlatformLabel()}</span>
        </div>
      </div>

      {/* Main Input Form */}
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="relative flex flex-col sm:flex-row items-stretch gap-2.5">
          <div className="relative flex-1 group">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              {getPlatformIcon()}
            </div>
            <input
              type="url"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (errorMessage) onClearError();
              }}
              placeholder="Tempel tautan video atau audio (YouTube, TikTok, Facebook, Instagram)..."
              className="w-full h-14 pl-11 pr-24 rounded-2xl bg-slate-900/90 text-white placeholder-slate-500 border border-slate-700/80 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-500/20 text-sm md:text-base transition-all light:bg-white light:text-slate-900 light:border-slate-300 light:placeholder-slate-400 font-sans"
              required
              disabled={isLoading}
            />

            {/* Quick Actions inside input */}
            <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center gap-1.5">
              {url ? (
                <button
                  type="button"
                  onClick={handleClear}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 light:hover:bg-slate-200 transition-colors"
                  title="Hapus input"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handlePaste}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-cyan-400 hover:text-cyan-300 bg-cyan-950/60 hover:bg-cyan-900/70 border border-cyan-800/60 rounded-xl transition-all"
                  title="Tempel dari Clipboard"
                >
                  <Clipboard className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Paste</span>
                </button>
              )}
            </div>
          </div>

          {/* Primary Submit Button */}
          <button
            type="submit"
            disabled={isLoading || !url.trim()}
            className="h-14 px-8 rounded-2xl font-bold text-sm tracking-wide text-white bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:from-cyan-400 hover:via-blue-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/35 transition-all flex items-center justify-center gap-2.5 shrink-0 active:scale-[0.98]"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Mengekstrak...</span>
              </>
            ) : (
              <>
                <Download className="h-5 w-5" />
                <span>Download Media</span>
              </>
            )}
          </button>
        </div>

        {/* Error Notification */}
        {errorMessage && (
          <div className="flex items-start justify-between gap-3 p-4 rounded-xl bg-red-950/60 border border-red-800/80 text-red-200 text-xs sm:text-sm animate-in fade-in duration-200">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
              <p className="leading-relaxed">{errorMessage}</p>
            </div>
            <button
              type="button"
              onClick={onClearError}
              className="text-red-400 hover:text-red-200 p-1"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </form>
    </div>
  );
};
