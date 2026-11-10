import React, { useState, useRef, useEffect } from 'react';
import { Check, MoreVertical, Play, Download, Trash2, Copy, Music, Film, CheckCheck } from 'lucide-react';
import type { HistoryItem } from '../types/index.ts';

interface HistoryItemRowProps {
  item: HistoryItem;
  onPlay: (item: HistoryItem) => void;
  onDownloadAgain: (item: HistoryItem) => void;
  onDelete: (id: string) => void;
}

export const HistoryItemRow: React.FC<HistoryItemRowProps> = ({
  item,
  onPlay,
  onDownloadAgain,
  onDelete
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen]);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = item.downloadUrl || item.sourceUrl;
    if (url) {
      navigator.clipboard.writeText(url).catch(() => {});
      setIsCopied(true);
      setTimeout(() => {
        setIsCopied(false);
        setIsMenuOpen(false);
      }, 1500);
    }
  };

  const platformDisplayName = item.platform
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
      : (item.mediaType === 'audio' ? '03:30' : '01:00'));

  const ytMatch = (item.sourceUrl || item.downloadUrl || '').match(/(?:watch\?[^#]*v=|shorts\/|youtu\.be\/)([A-Za-z0-9_-]{11})/i);
  const resolvedThumbnail =
    item.thumbnail ||
    (ytMatch ? `https://i.ytimg.com/vi/${ytMatch[1]}/hqdefault.jpg` : '');

  return (
    <div
      onClick={() => onPlay(item)}
      className="group relative w-full p-2 sm:p-2.5 rounded-2xl bg-[#0c1836]/90 hover:bg-[#102450] border border-blue-500/20 hover:border-cyan-400/50 shadow-md shadow-black/30 flex items-center justify-between gap-3 transition-all duration-150 cursor-pointer select-none"
    >
      {/* Left Thumbnail + Duration Badge */}
      <div className="relative w-20 h-13 sm:w-22 sm:h-14 rounded-xl overflow-hidden bg-slate-900 border border-white/10 shrink-0">
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
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-slate-800">
            <Film className="w-6 h-6 text-cyan-400" />
          </div>
        )}

        {/* Small Play Overlay on hover */}
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
        <h4 className="text-xs sm:text-sm font-bold text-white truncate leading-snug group-hover:text-cyan-300 transition-colors">
          {item.title}
        </h4>
        <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1.5 font-medium truncate">
          <span>{platformDisplayName}</span>
          <span className="text-slate-600">•</span>
          <span>{formatTag}</span>
          <span className="text-slate-600">•</span>
          <span>{qualityTag}</span>
        </p>
      </div>

      {/* Right side: Solid Blue checkmark & 3-dots action */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Solid Blue Circular Checkmark matching screenshot */}
        <div
          className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#1d6fe9] text-white flex items-center justify-center shadow-md shadow-blue-500/20"
          title="Telah selesai diunduh"
        >
          <Check className="w-4 h-4 stroke-[3]" />
        </div>

        {/* 3-dots Menu Button */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsMenuOpen((prev) => !prev);
            }}
            className="w-8 h-8 rounded-full hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center active:scale-90 transition-colors cursor-pointer"
            aria-label="Menu opsi riwayat"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {/* Popup Dropdown Menu */}
          {isMenuOpen && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute right-0 top-9 w-40 rounded-2xl bg-[#081530] border border-blue-500/30 p-1.5 shadow-2xl shadow-black z-30 text-xs font-semibold text-white animate-in fade-in zoom-in-95 duration-100"
            >
              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  onPlay(item);
                }}
                className="w-full px-3 py-2 rounded-xl hover:bg-blue-600/30 text-left flex items-center gap-2 text-cyan-300 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Putar Media</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  onDownloadAgain(item);
                }}
                className="w-full px-3 py-2 rounded-xl hover:bg-blue-600/30 text-left flex items-center gap-2 text-slate-200 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Unduh Ulang</span>
              </button>

              <button
                type="button"
                onClick={handleCopy}
                className="w-full px-3 py-2 rounded-xl hover:bg-blue-600/30 text-left flex items-center gap-2 text-slate-200 cursor-pointer"
              >
                {isCopied ? <CheckCheck className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{isCopied ? 'Tersalin!' : 'Salin Tautan'}</span>
              </button>

              <div className="h-px bg-white/10 my-1" />

              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  onDelete(item.id);
                }}
                className="w-full px-3 py-2 rounded-xl hover:bg-red-500/20 text-left flex items-center gap-2 text-red-400 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Hapus</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
