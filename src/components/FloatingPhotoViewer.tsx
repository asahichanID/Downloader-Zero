import React, { useState, useEffect, useMemo } from 'react';
import JSZip from 'jszip';
import { X, Download, Check, Copy, ChevronLeft, ChevronRight, Images } from 'lucide-react';
import type { HistoryItem } from '../types/index.ts';

interface FloatingPhotoViewerProps {
  item: HistoryItem | null;
  onClose: () => void;
  onDownloadAgain?: (item: HistoryItem) => void;
}

export const FloatingPhotoViewer: React.FC<FloatingPhotoViewerProps> = React.memo(({
  item,
  onClose,
  onDownloadAgain
}) => {
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [viewerError, setViewerError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const createdUrls: string[] = [];

    setActiveIndex(0);
    setViewerError(null);
    setImageUrls([]);

    if (!item) return;

    if (item.blob && item.extension === 'zip') {
      JSZip.loadAsync(item.blob)
        .then(async (zip) => {
          const entries = Object.values(zip.files)
            .filter((entry) => !entry.dir && /\.(jpg|jpeg|png|webp|gif)$/i.test(entry.name))
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

          const urls: string[] = [];
          for (const entry of entries) {
            const raw = await entry.async('blob');
            const ext = entry.name.split('.').pop()?.toLowerCase() || 'jpg';
            const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
            const objUrl = URL.createObjectURL(new Blob([raw], { type: mime }));
            createdUrls.push(objUrl);
            urls.push(objUrl);
          }

          if (!cancelled) {
            if (urls.length > 0) {
              setImageUrls(urls);
            } else {
              setViewerError('Arsip ZIP tidak berisi foto yang dapat ditampilkan.');
            }
          }
        })
        .catch(() => {
          if (!cancelled) {
            setViewerError('Gagal membuka arsip foto ZIP.');
          }
        });
    } else if (item.blob) {
      const mime = item.extension === 'png' ? 'image/png' : 'image/jpeg';
      const objUrl = URL.createObjectURL(item.blob.type ? item.blob : new Blob([item.blob], { type: mime }));
      createdUrls.push(objUrl);
      setImageUrls([objUrl]);
    } else if (item.downloadUrl || item.thumbnail) {
      const target = item.downloadUrl || item.thumbnail || '';
      const proxied = target.startsWith('http')
        ? `/api/proxy-download?url=${encodeURIComponent(target)}&filename=${encodeURIComponent(item.filename || 'photo.jpg')}&platform=${encodeURIComponent(item.platform)}&inline=1`
        : target;
      setImageUrls([proxied]);
    } else {
      setViewerError('Foto tidak tersedia untuk pratinjau.');
    }

    return () => {
      cancelled = true;
      for (const u of createdUrls) {
        URL.revokeObjectURL(u);
      }
    };
  }, [item]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && imageUrls.length > 1) {
        setActiveIndex((prev) => (prev - 1 + imageUrls.length) % imageUrls.length);
      }
      if (e.key === 'ArrowRight' && imageUrls.length > 1) {
        setActiveIndex((prev) => (prev + 1) % imageUrls.length);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, imageUrls.length]);

  const originalUrl = useMemo(() => (item?.sourceUrl || item?.downloadUrl || '').trim(), [item]);

  if (!item) return null;

  const handleCopyLink = () => {
    if (originalUrl) {
      navigator.clipboard?.writeText(originalUrl).catch(() => {});
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  const currentSrc = imageUrls[activeIndex] || '';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
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
            <Images className="w-4 h-4 text-cyan-400 shrink-0" />
            <span className="text-xs font-bold uppercase tracking-wider text-cyan-400 truncate">
              {item.platform} • {imageUrls.length > 1 ? `Foto ${activeIndex + 1} / ${imageUrls.length}` : item.resolution || 'Foto HD'}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white flex items-center justify-center border border-white/10 active:scale-90 transition-transform duration-150 cursor-pointer"
            aria-label="Tutup penampil foto"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Photo Viewport */}
        <div className="relative aspect-[4/3] w-full rounded-2xl overflow-hidden bg-black border border-blue-900/40 flex items-center justify-center">
          {viewerError ? (
            <p className="text-xs text-slate-300 px-4 text-center">{viewerError}</p>
          ) : currentSrc ? (
            <img
              src={currentSrc}
              alt={item.title}
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="w-7 h-7 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
          )}

          {imageUrls.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => setActiveIndex((prev) => (prev - 1 + imageUrls.length) % imageUrls.length)}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/70 hover:bg-black/90 text-white flex items-center justify-center border border-white/15 cursor-pointer"
                aria-label="Foto sebelumnya"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => setActiveIndex((prev) => (prev + 1) % imageUrls.length)}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/70 hover:bg-black/90 text-white flex items-center justify-center border border-white/15 cursor-pointer"
                aria-label="Foto berikutnya"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </>
          )}
        </div>

        {/* Photo Info & Controls */}
        <div className="mt-4 space-y-3">
          <div>
            <h3 className="font-bold text-sm sm:text-base text-white line-clamp-2 leading-snug">
              {item.title}
            </h3>
            <p className="text-xs text-blue-200/70 mt-1 flex items-center gap-2">
              <span>{item.author || item.platform}</span>
              <span>•</span>
              <span className="uppercase">{item.extension}</span>
            </p>
          </div>

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
