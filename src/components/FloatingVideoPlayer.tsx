import React, { useRef, useState, useEffect, useMemo } from 'react';
import { X, Download, Check, Copy } from 'lucide-react';
import type { HistoryItem } from '../types/index.ts';

interface FloatingVideoPlayerProps {
  item: HistoryItem | null;
  onClose: () => void;
  onDownloadAgain?: (item: HistoryItem) => void;
}

export const FloatingVideoPlayer: React.FC<FloatingVideoPlayerProps> = React.memo(({
  item,
  onClose,
  onDownloadAgain
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [blobUrl, setBlobUrl] = useState<string>('');
  const [forceProxy, setForceProxy] = useState<boolean>(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  useEffect(() => {
    setForceProxy(false);
    setPlaybackError(null);

    if (!item?.blob) {
      setBlobUrl('');
      return;
    }

    const mime = item.blob.type && item.blob.type !== 'application/octet-stream' ? item.blob.type : 'video/mp4';
    const typedBlob = item.blob.type === mime ? item.blob : new Blob([item.blob], { type: mime });
    const objectUrl = URL.createObjectURL(typedBlob);
    setBlobUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [item]);

  const proxyUrl = useMemo(() => {
    if (!item) return '';
    const target = item.downloadUrl || item.sourceUrl || '';
    if (!target) return '';
    const filename = item.filename || `preview.${item.extension || 'mp4'}`;
    return `/api/proxy-download?url=${encodeURIComponent(target)}&filename=${encodeURIComponent(filename)}&platform=${encodeURIComponent(item.platform)}&sourceUrl=${encodeURIComponent(item.sourceUrl || '')}${item.resolution ? `&res=${encodeURIComponent(item.resolution)}` : ''}&inline=1`;
  }, [item]);

  const activeSrc = (!forceProxy && blobUrl) ? blobUrl : proxyUrl;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (!videoRef.current || !activeSrc) return;
    videoRef.current.load();
    videoRef.current.play().catch(() => {});
  }, [activeSrc]);

  if (!item) return null;

  const originalUrl = (item.sourceUrl || item.downloadUrl || '').trim();

  const handleCopyLink = () => {
    if (originalUrl) {
      navigator.clipboard?.writeText(originalUrl).catch(() => {});
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg rounded-3xl bg-[#081530] border border-blue-500/30 p-4 sm:p-5 shadow-2xl shadow-black/90 overflow-hidden text-white dz-animate-scale"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-blue-900/50">
          <div className="flex items-center gap-2 min-w-0 pr-2">
            <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">
              {item.platform} • {item.resolution || item.quality}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white flex items-center justify-center border border-white/10 active:scale-90 transition-transform duration-150 cursor-pointer"
            aria-label="Tutup pemutar video"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Video Container */}
        <div className="relative aspect-video w-full rounded-2xl overflow-hidden bg-black border border-blue-900/40 shadow-inner flex items-center justify-center">
          {playbackError ? (
            <p className="text-xs text-slate-300 px-4 text-center">{playbackError}</p>
          ) : (
            <video
              ref={videoRef}
              src={activeSrc}
              poster={item.thumbnail}
              autoPlay
              playsInline
              controls
              onError={() => {
                if (!forceProxy && blobUrl && proxyUrl) {
                  setForceProxy(true);
                } else {
                  setPlaybackError('Video tidak dapat diputar di browser ini. Gunakan tombol Unduh Lagi.');
                }
              }}
              className="w-full h-full object-contain"
            />
          )}
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
                className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 active:scale-95 transition-transform duration-150 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Unduh Lagi</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleCopyLink}
              className="py-3 px-4 rounded-xl bg-[#0d224a] hover:bg-[#123068] border border-blue-500/30 text-white text-xs sm:text-sm font-semibold flex items-center gap-1.5 active:scale-95 transition-colors duration-150 cursor-pointer"
            >
              {isCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              <span>{isCopied ? 'Tersalin' : 'Salin URL Ori'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});
