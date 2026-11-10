import React, { useRef, useState, useEffect } from 'react';
import { X, Download, Play, Pause, Volume2, VolumeX, Maximize, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { HistoryItem } from '../types/index.ts';

interface FloatingVideoPlayerProps {
  item: HistoryItem | null;
  onClose: () => void;
  onDownloadAgain?: (item: HistoryItem) => void;
}

export const FloatingVideoPlayer: React.FC<FloatingVideoPlayerProps> = ({
  item,
  onClose,
  onDownloadAgain
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isCopied, setIsCopied] = useState<boolean>(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!item) return null;

  const streamUrl = item.downloadUrl || item.sourceUrl;

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !videoRef.current.muted;
    setIsMuted(videoRef.current.muted);
  };

  const handleFullscreen = () => {
    if (!videoRef.current) return;
    if (videoRef.current.requestFullscreen) {
      videoRef.current.requestFullscreen();
    }
  };

  const handleCopyLink = () => {
    if (streamUrl) {
      navigator.clipboard.writeText(streamUrl).catch(() => {});
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 16 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-lg rounded-3xl bg-[#081530] border border-blue-500/30 p-4 sm:p-5 shadow-2xl shadow-black/90 overflow-hidden text-white"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-blue-900/50">
            <div className="flex items-center gap-2 min-w-0 pr-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">
                {item.platform} • {item.resolution || item.quality}
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white flex items-center justify-center border border-white/10 active:scale-90 transition-all cursor-pointer"
              aria-label="Tutup pemutar video"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Video Container */}
          <div className="relative aspect-video w-full rounded-2xl overflow-hidden bg-black border border-blue-900/40 shadow-inner group">
            <video
              ref={videoRef}
              src={streamUrl}
              poster={item.thumbnail}
              autoPlay
              playsInline
              controls
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              className="w-full h-full object-contain"
            />
          </div>

          {/* Video Info & Controls */}
          <div className="mt-4 space-y-3">
            <div>
              <h3 className="font-bold text-sm sm:text-base text-white line-clamp-2 leading-snug">
                {item.title}
              </h3>
              <p className="text-xs text-blue-200/70 mt-1 flex items-center gap-2">
                <span>{item.author || item.platform}</span>
                {item.durationFormatted && (
                  <>
                    <span>•</span>
                    <span>Durasi {item.durationFormatted}</span>
                  </>
                )}
                <span>•</span>
                <span className="uppercase">{item.extension}</span>
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 pt-1">
              {onDownloadAgain && (
                <button
                  type="button"
                  onClick={() => onDownloadAgain(item)}
                  className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 active:scale-95 transition-all cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Unduh Lagi</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleCopyLink}
                className="py-3 px-4 rounded-xl bg-[#0d224a] hover:bg-[#123068] border border-blue-500/30 text-white text-xs sm:text-sm font-semibold flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
              >
                {isCopied ? <Check className="w-4 h-4 text-emerald-400" /> : null}
                <span>{isCopied ? 'Tersalin' : 'Salin Link'}</span>
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
