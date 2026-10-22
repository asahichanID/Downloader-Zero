import React, { useState } from 'react';
import { X, Download, Loader2, CheckCircle2, Film, Music, Clock, User, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { MediaMetadata, MediaFormat, MediaType } from '../types/index.ts';
import animeMascot from '../assets/images/anime_mascot_hero_1792123758844.jpg';

interface MediaResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  media: MediaMetadata;
  activeFilter: MediaType;
  onDownloadFormat: (fmt: MediaFormat) => void;
  isDownloading: boolean;
  downloadProgress: number;
}

export const MediaResultModal: React.FC<MediaResultModalProps> = ({
  isOpen,
  onClose,
  media,
  activeFilter,
  onDownloadFormat,
  isDownloading,
  downloadProgress
}) => {
  const formats = media.formats.filter((f) => f.type === activeFilter);
  const displayFormats = formats.length > 0 ? formats : media.formats;
  const thumbnail = (media.thumbnail && media.thumbnail.trim()) ? media.thumbnail : animeMascot;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="media-result-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
          onClick={onClose}
        >
          <motion.div
            key="media-result-card"
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-lg rounded-3xl p-5 dz-card border border-cyan-500/50 shadow-2xl shadow-black/85 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-blue-900/60">
              <div className="flex items-center gap-2">
                <span className="font-cyber font-black text-cyan-400 italic">DZ</span>
                <span className="font-bold text-white text-base">Format Tersedia</span>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-lg bg-[#0c224a] border border-blue-900 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer active:scale-90 transition-transform"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Media Info Header */}
            <div className="py-4 flex gap-3 border-b border-blue-900/40">
              <img
                src={thumbnail}
                alt={media.title || 'Media thumbnail'}
                className="w-24 h-16 rounded-xl object-cover shrink-0 border border-cyan-500/30 bg-slate-900"
                onError={(e) => {
                  (e.target as HTMLElement).setAttribute('src', animeMascot);
                }}
              />
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-bold text-white line-clamp-2 leading-snug">
                  {media.title}
                </h4>
                <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                  <span>{media.author}</span>
                  <span>·</span>
                  <span>{media.durationFormatted}</span>
                </div>
              </div>
            </div>

            {/* Formats List */}
            <div className="py-4 space-y-2.5">
              <span className="text-xs font-bold text-cyan-300 uppercase tracking-wider">
                Pilih Resolusi / Bitrate:
              </span>
              <div className="space-y-2">
                {displayFormats.map((fmt) => (
                  <div
                    key={fmt.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-[#07132e] border border-blue-900/80 hover:border-cyan-400/60 transition-all duration-200"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-cyan-950/80 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shrink-0">
                        {fmt.type === 'video' ? <Film className="h-4 w-4" /> : <Music className="h-4 w-4" />}
                      </div>
                      <div>
                        <span className="text-xs sm:text-sm font-bold text-white block">
                          {fmt.quality}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {fmt.extension.toUpperCase()} {fmt.filesize ? `· ${fmt.filesize}` : ''} {fmt.note ? `· ${fmt.note}` : ''}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onDownloadFormat(fmt)}
                      disabled={isDownloading}
                      className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm shadow-black/30 cursor-pointer active:scale-95 transition-all duration-150 disabled:opacity-60"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>Download</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
