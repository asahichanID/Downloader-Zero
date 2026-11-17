import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  MoreVertical,
  Play,
  Download,
  Trash2,
  Copy,
  Music,
  Film,
  Images,
  CheckCheck,
  Link2
} from 'lucide-react';
import type { HistoryItem } from '../types/index.ts';

interface HistoryItemRowProps {
  item: HistoryItem;
  onPlay: (item: HistoryItem) => void;
  onDownloadAgain: (item: HistoryItem) => void;
  onDelete: (id: string) => void;
}

interface MenuCoords {
  top?: number;
  bottom?: number;
  right: number;
}

export const HistoryItemRow: React.FC<HistoryItemRowProps> = React.memo(({
  item,
  onPlay,
  onDownloadAgain,
  onDelete
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const [menuCoords, setMenuCoords] = useState<MenuCoords | null>(null);
  const [isCopied, setIsCopied] = useState<boolean>(false);

  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const portalMenuRef = useRef<HTMLDivElement | null>(null);

  const originalUrl = (item.sourceUrl || item.downloadUrl || '').trim();

  const updateMenuPosition = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const menuEstimatedHeight = 190;
    const spaceBelow = window.innerHeight - rect.bottom;
    const right = Math.max(8, window.innerWidth - rect.right);

    if (spaceBelow < menuEstimatedHeight && rect.top > menuEstimatedHeight) {
      setMenuCoords({
        bottom: window.innerHeight - rect.top + 6,
        right
      });
    } else {
      setMenuCoords({
        top: rect.bottom + 6,
        right
      });
    }
  }, []);

  useEffect(() => {
    if (!isMenuOpen) return;

    updateMenuPosition();

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        buttonRef.current?.contains(target) ||
        portalMenuRef.current?.contains(target)
      ) {
        return;
      }
      setIsMenuOpen(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMenuOpen(false);
    };

    const handleViewportChange = () => {
      updateMenuPosition();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleViewportChange, true);
    window.addEventListener('resize', handleViewportChange);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleViewportChange, true);
      window.removeEventListener('resize', handleViewportChange);
    };
  }, [isMenuOpen, updateMenuPosition]);

  const handleCopyOriginalUrl = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!originalUrl) return;
    navigator.clipboard?.writeText(originalUrl).catch(() => {});
    setIsCopied(true);
    setTimeout(() => {
      setIsCopied(false);
    }, 1600);
  };

  const handleCopyFromMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!originalUrl) return;
    navigator.clipboard?.writeText(originalUrl).catch(() => {});
    setIsCopied(true);
    setTimeout(() => {
      setIsCopied(false);
      setIsMenuOpen(false);
    }, 900);
  };

  const platformDisplayName =
    item.platform === 'twitter'
      ? 'Twitter (X)'
      : item.platform
        ? item.platform.charAt(0).toUpperCase() + item.platform.slice(1)
        : 'Media';

  const formatTag = item.extension ? item.extension.toUpperCase() : 'MP4';
  const qualityTag = item.resolution || item.quality || '1080p';
  const isSpotify = item.platform === 'spotify';

  const displayDuration =
    item.durationFormatted ||
    (item.duration && item.duration > 0
      ? (function () {
          const mins = Math.floor(item.duration / 60);
          const secs = Math.floor(item.duration % 60);
          return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        })()
      : (item.mediaType === 'audio' ? '03:30' : item.mediaType === 'photos' ? '' : '01:00'));

  const ytMatch = (item.sourceUrl || item.downloadUrl || '').match(/(?:watch\?[^#]*v=|shorts\/|youtu\.be\/)([A-Za-z0-9_-]{11})/i);
  const resolvedThumbnail =
    item.thumbnail ||
    (ytMatch ? `https://i.ytimg.com/vi/${ytMatch[1]}/hqdefault.jpg` : '');

  const popupMenu =
    isMenuOpen && menuCoords && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={portalMenuRef}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: menuCoords.top !== undefined ? `${menuCoords.top}px` : undefined,
              bottom: menuCoords.bottom !== undefined ? `${menuCoords.bottom}px` : undefined,
              right: `${menuCoords.right}px`,
              zIndex: 9999
            }}
            className="w-44 rounded-2xl bg-white dark:bg-[#081530] border border-slate-200 dark:border-blue-500/35 p-1.5 shadow-2xl shadow-slate-900/25 dark:shadow-black/90 text-xs font-semibold text-slate-800 dark:text-white dz-animate-scale"
          >
            <button
              type="button"
              onClick={() => {
                setIsMenuOpen(false);
                onPlay(item);
              }}
              className="w-full px-3 py-2.5 rounded-xl hover:bg-sky-50 dark:hover:bg-blue-600/30 text-left flex items-center gap-2 text-sky-600 dark:text-cyan-300 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current shrink-0" />
              <span>Putar Media</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsMenuOpen(false);
                onDownloadAgain(item);
              }}
              className="w-full px-3 py-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-blue-600/30 text-left flex items-center gap-2 text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 shrink-0" />
              <span>Unduh Ulang</span>
            </button>

            {originalUrl && (
              <button
                type="button"
                onClick={handleCopyFromMenu}
                className="w-full px-3 py-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-blue-600/30 text-left flex items-center gap-2 text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                {isCopied ? (
                  <CheckCheck className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400 shrink-0" />
                ) : (
                  <Copy className="w-3.5 h-3.5 shrink-0" />
                )}
                <span>{isCopied ? 'Tersalin!' : 'Salin URL Ori'}</span>
              </button>
            )}

            <div className="h-px bg-slate-200 dark:bg-white/10 my-1" />

            <button
              type="button"
              onClick={() => {
                setIsMenuOpen(false);
                onDelete(item.id);
              }}
              className="w-full px-3 py-2.5 rounded-xl hover:bg-red-50 dark:hover:bg-red-500/20 text-left flex items-center gap-2 text-red-600 dark:text-red-400 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5 shrink-0" />
              <span>Hapus</span>
            </button>
          </div>,
          document.body
        )
      : null;

  return (
    <div
      onClick={() => onPlay(item)}
      className="group relative w-full p-2.5 sm:p-3 rounded-2xl bg-white dark:bg-[#0c1836]/95 hover:bg-slate-50 dark:hover:bg-[#102450] border border-slate-200 dark:border-blue-500/20 hover:border-sky-400 dark:hover:border-cyan-400/50 shadow-sm shadow-slate-900/5 dark:shadow-md dark:shadow-black/25 flex flex-col gap-2 transition-colors duration-150 cursor-pointer select-none"
    >
      {/* Top Row: Thumbnail + Title & Metadata + Checkmark & 3-dots */}
      <div className="flex items-center justify-between gap-3">
        {/* Left Thumbnail + Duration Badge */}
        <div className="relative w-20 h-13 sm:w-22 sm:h-14 rounded-xl overflow-hidden bg-slate-200 dark:bg-slate-900 border border-slate-200 dark:border-white/10 shrink-0">
          {isSpotify && (!resolvedThumbnail || resolvedThumbnail.includes('favicon')) ? (
            <div className="w-full h-full flex items-center justify-center bg-black">
              <div className="w-9 h-9 rounded-full bg-[#1DB954] flex items-center justify-center shadow-md">
                <svg className="w-5 h-5 fill-black" viewBox="0 0 24 24">
                  <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.508 17.308a.747.747 0 01-1.03.248c-2.82-1.723-6.37-2.113-10.55-1.158a.75.75 0 11-.336-1.462c4.57-1.043 8.49-.597 11.668 1.342.348.213.46.666.248 1.03zm1.47-3.268a.936.936 0 01-1.288.309c-3.227-1.984-8.147-2.557-11.964-1.398a.937.937 0 11-.548-1.792c4.364-1.325 9.79-.684 13.49 1.593.407.25.539.78.31 1.288zm.126-3.41c-3.863-2.294-10.244-2.507-13.935-1.386a1.124 1.124 0 01-.655-2.152c4.24-1.288 11.288-1.042 15.74 1.602a1.125 1.125 0 01-1.15 1.936z" />
                </svg>
              </div>
            </div>
          ) : resolvedThumbnail ? (
            <img
              src={resolvedThumbnail}
              alt={item.title}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              crossOrigin="anonymous"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
              onError={(e) => {
                if (ytMatch && !(e.currentTarget as HTMLImageElement).src.includes('mqdefault')) {
                  (e.currentTarget as HTMLImageElement).src = `https://i.ytimg.com/vi/${ytMatch[1]}/mqdefault.jpg`;
                } else {
                  (e.currentTarget as HTMLImageElement).src = '/banner_dz.png';
                }
              }}
            />
          ) : item.mediaType === 'audio' ? (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-emerald-600 to-blue-900">
              <Music className="w-6 h-6 text-white" />
            </div>
          ) : item.mediaType === 'photos' ? (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-pink-600 to-indigo-900">
              <Images className="w-6 h-6 text-white" />
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-slate-800">
              <Film className="w-6 h-6 text-cyan-400" />
            </div>
          )}

          {/* Play Overlay on hover */}
          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
            <Play className="w-4 h-4 text-white fill-white" />
          </div>

          {/* Duration badge at bottom-right corner */}
          {displayDuration && (
            <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/85 text-[10px] font-mono font-semibold text-white shadow-xs leading-none">
              {displayDuration}
            </span>
          )}
        </div>

        {/* Middle: Title & Metadata */}
        <div className="flex-1 min-w-0 pr-1">
          <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate leading-snug group-hover:text-sky-700 dark:group-hover:text-cyan-300 transition-colors">
            {item.title}
          </h4>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5 font-medium truncate">
            <span>{platformDisplayName}</span>
            <span className="text-slate-300 dark:text-slate-600">•</span>
            <span>{formatTag}</span>
            <span className="text-slate-300 dark:text-slate-600">•</span>
            <span>{qualityTag}</span>
          </p>
        </div>

        {/* Right side: Solid Blue checkmark & 3-dots action */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div
            className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#1d6fe9] text-white flex items-center justify-center shadow-md shadow-blue-500/20"
            title="Telah selesai diunduh"
          >
            <Check className="w-4 h-4 stroke-[3]" />
          </div>

          <button
            ref={buttonRef}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsMenuOpen((prev) => !prev);
            }}
            className="w-9 h-9 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center active:scale-90 transition-colors cursor-pointer"
            aria-label="Menu opsi riwayat"
            aria-expanded={isMenuOpen}
          >
            <MoreVertical className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Bottom Row: Original URL (URL Ori) with One-Tap Copy Button */}
      {originalUrl && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-slate-100/85 dark:bg-[#060f24] border border-slate-200/80 dark:border-blue-500/20 cursor-default"
        >
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <Link2 className="w-3.5 h-3.5 text-sky-600 dark:text-cyan-400 shrink-0" />
            <span
              className="font-mono text-[11px] text-slate-600 dark:text-slate-300 truncate select-all"
              title={originalUrl}
            >
              {originalUrl}
            </span>
          </div>

          <button
            type="button"
            onClick={handleCopyOriginalUrl}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 shrink-0 transition-colors cursor-pointer active:scale-95 ${
              isCopied
                ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-300/70 dark:border-emerald-500/30'
                : 'bg-white dark:bg-[#0e2046] hover:bg-sky-50 dark:hover:bg-blue-600/30 text-sky-700 dark:text-cyan-300 border border-slate-200 dark:border-blue-500/30'
            }`}
            title="Salin URL asli"
          >
            {isCopied ? (
              <>
                <CheckCheck className="w-3 h-3" />
                <span>Tersalin</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                <span>Salin</span>
              </>
            )}
          </button>
        </div>
      )}

      {popupMenu}
    </div>
  );
});
