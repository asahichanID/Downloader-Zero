import React from 'react';
import { Film, Music, Check, Sparkles, SlidersHorizontal, Info, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { MediaType } from '../types/index.ts';

interface QualitySelectorCardProps {
  mediaType: MediaType;
  setMediaType: (type: MediaType) => void;
  selectedVideoRes: string;
  setSelectedVideoRes: (res: string) => void;
  selectedAudioQuality: string;
  setSelectedAudioQuality: (qual: string) => void;
  isAudioOnly?: boolean;
}

interface ResolutionOption {
  id: string;
  label: string;
  tag: string;
  desc: string;
  badge?: string;
  badgeStyle: 'popular' | 'cinema' | 'hd' | 'balanced' | 'save';
}

export const QualitySelectorCard: React.FC<QualitySelectorCardProps> = ({
  mediaType,
  setMediaType,
  selectedVideoRes,
  setSelectedVideoRes,
  selectedAudioQuality,
  setSelectedAudioQuality,
  isAudioOnly = false
}) => {
  const videoOptions: ResolutionOption[] = [
    {
      id: '4K',
      label: '4K UHD',
      tag: '2160p',
      desc: 'Cinema Ultra HD',
      badge: '4K CINEMA',
      badgeStyle: 'cinema'
    },
    {
      id: '2K',
      label: '2K QHD',
      tag: '1440p',
      desc: 'Quad HD Tajam',
      badge: 'QUAD HD',
      badgeStyle: 'hd'
    },
    {
      id: '1080p',
      label: '1080p',
      tag: 'FHD',
      desc: 'Kualitas Rekomendasi',
      badge: 'POPULER',
      badgeStyle: 'popular'
    },
    {
      id: '720p',
      label: '720p',
      tag: 'HD',
      desc: 'Seimbang & Lancar',
      badge: 'BALANCED',
      badgeStyle: 'balanced'
    },
    {
      id: '480p',
      label: '480p',
      tag: 'SD',
      desc: 'Standar Ringan',
      badge: 'HEMAT',
      badgeStyle: 'save'
    },
    {
      id: '360p',
      label: '360p',
      tag: 'LQ',
      desc: 'Hemat Kuota',
      badge: 'MINIMAL',
      badgeStyle: 'save'
    }
  ];

  const audioOptions: ResolutionOption[] = [
    {
      id: '320',
      label: '320 kbps',
      tag: 'HQ',
      desc: 'Studio Master Lossless',
      badge: 'STUDIO HQ',
      badgeStyle: 'popular'
    },
    {
      id: '256',
      label: '256 kbps',
      tag: 'HQ',
      desc: 'Jernih Bening Bersih',
      badge: 'JERNIH',
      badgeStyle: 'hd'
    },
    {
      id: '192',
      label: '192 kbps',
      tag: 'MQ',
      desc: 'Suara Mantap & Seimbang',
      badge: 'REKOMENDASI',
      badgeStyle: 'balanced'
    },
    {
      id: '128',
      label: '128 kbps',
      tag: 'SQ',
      desc: 'Standar Kompatibel',
      badge: 'STANDAR',
      badgeStyle: 'save'
    },
    {
      id: '96',
      label: '96 kbps',
      tag: 'LQ',
      desc: 'Ukuran Sangat Ringkas',
      badge: 'HEMAT',
      badgeStyle: 'save'
    },
    {
      id: '64',
      label: '64 kbps',
      tag: 'LQ',
      desc: 'Ukuran Paling Kecil',
      badge: 'MINIMAL',
      badgeStyle: 'save'
    }
  ];

  const currentMediaType = isAudioOnly ? 'audio' : mediaType;

  const getBadgeClass = (style: ResolutionOption['badgeStyle'], isActive: boolean) => {
    if (isActive) {
      return 'bg-cyan-500 text-slate-950 dark:text-slate-950 font-black shadow-xs';
    }
    switch (style) {
      case 'popular':
        return 'bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 border border-amber-300/80 dark:border-amber-600/40';
      case 'cinema':
        return 'bg-purple-100 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300 border border-purple-300/80 dark:border-purple-600/40';
      case 'hd':
        return 'bg-sky-100 dark:bg-sky-950/70 text-sky-700 dark:text-sky-300 border border-sky-300/80 dark:border-sky-600/40';
      case 'balanced':
        return 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-300/80 dark:border-emerald-600/40';
      case 'save':
      default:
        return 'bg-slate-200 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700/60';
    }
  };

  return (
    <section 
      aria-label="Pilihan Format dan Kualitas Unduhan"
      className="dz-card rounded-2xl p-4 sm:p-5 w-full space-y-4 select-none transition-all duration-200"
    >
      {/* 1. SINGLE UNIFIED HEADER: Format Switcher (No Duplicate Buttons) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-slate-200 dark:border-blue-900/40">
        {/* Title & Mode Kicker */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-cyan-100 dark:bg-cyan-950/70 border border-cyan-300 dark:border-cyan-500/40 flex items-center justify-center text-cyan-600 dark:text-cyan-400 shrink-0 shadow-xs">
            {currentMediaType === 'video' ? (
              <Film className="h-4 w-4" />
            ) : (
              <Music className="h-4 w-4" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white tracking-tight">
                {currentMediaType === 'video' ? 'Pilih Resolusi Video' : 'Pilih Kualitas Audio MP3'}
              </h3>
              {isAudioOnly && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/50 font-semibold">
                  Spotify Audio
                </span>
              )}
            </div>
            <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 truncate">
              {currentMediaType === 'video' 
                ? 'Unduh video MP4 tanpa watermark hingga resolusi 4K'
                : 'Ekstrak audio murni MP3 berkualitas tinggi hingga 320 kbps'}
            </p>
          </div>
        </div>

        {/* Unified Segmented Media Type Switcher (Single source of truth) */}
        {!isAudioOnly ? (
          <div 
            role="tablist"
            aria-label="Tipe Media"
            className="inline-flex items-center bg-slate-100 dark:bg-[#050e24] p-1 rounded-xl border border-slate-300 dark:border-blue-900/60 shrink-0 self-start sm:self-auto"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mediaType === 'video'}
              onClick={() => setMediaType('video')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.97] cursor-pointer ${
                mediaType === 'video'
                  ? 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-sm ring-1 ring-cyan-300/40'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Film className="h-3.5 w-3.5" />
              <span>Video (MP4)</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mediaType === 'audio'}
              onClick={() => setMediaType('audio')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.97] cursor-pointer ${
                mediaType === 'audio'
                  ? 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-sm ring-1 ring-cyan-300/40'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Music className="h-3.5 w-3.5" />
              <span>Audio (MP3)</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-100 dark:bg-emerald-950/70 border border-emerald-300 dark:border-emerald-500/40 text-xs font-bold text-emerald-800 dark:text-emerald-300 self-start sm:self-auto">
            <Music className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Mode Audio Otomatis</span>
          </div>
        )}
      </div>

      {/* 2. RESOLUTION / BITRATE UPGRADED CARD GRID */}
      <AnimatePresence mode="wait">
        {!isAudioOnly && mediaType === 'video' ? (
          <motion.div
            key="video-resolutions"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-3"
          >
            {/* Grid of 6 distinct video cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-2.5">
              {videoOptions.map((opt) => {
                const isActive = selectedVideoRes === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSelectedVideoRes(opt.id)}
                    className={`relative p-3 rounded-xl text-left cursor-pointer flex flex-col justify-between min-h-[76px] touch-manipulation transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.98] ${
                      isActive
                        ? 'dz-card-active ring-2 ring-cyan-400/40 bg-gradient-to-b from-blue-600/25 to-cyan-500/15 dark:from-blue-600/30 dark:to-cyan-500/20'
                        : 'bg-white/70 dark:bg-slate-900/60 border border-slate-200 dark:border-blue-900/40 hover:border-cyan-500/40 hover:bg-white dark:hover:bg-slate-800/80 text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    {/* Top Row: Badge & Check Indicator */}
                    <div className="flex items-center justify-between w-full gap-1 mb-1.5">
                      <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded leading-none uppercase tracking-wide ${getBadgeClass(opt.badgeStyle, isActive)}`}>
                        {opt.badge}
                      </span>
                      {isActive && (
                        <div className="w-4 h-4 rounded-full bg-cyan-400 text-slate-950 flex items-center justify-center shrink-0">
                          <Check className="h-2.5 w-2.5 stroke-[3]" />
                        </div>
                      )}
                    </div>

                    {/* Middle: Resolution Title */}
                    <div className="mt-auto">
                      <span className={`text-base sm:text-lg font-black tracking-tight block ${
                        isActive ? 'text-cyan-700 dark:text-cyan-300' : 'text-slate-900 dark:text-white'
                      }`}>
                        {opt.label}
                      </span>
                      {/* Sub-label description */}
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate mt-0.5">
                        {opt.desc}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Video Format Info Summary Footer */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-slate-500 dark:text-slate-400">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-cyan-500 dark:text-cyan-400" />
                <span>Format MP4 (H.264)</span>
                <span aria-hidden="true">·</span>
                <span>Resolusi Terpilih: <strong className="text-cyan-700 dark:text-cyan-300 font-bold">{selectedVideoRes}</strong></span>
              </div>
              <span className="text-[11px] text-slate-400 dark:text-slate-500">
                Otomatis memilih stream video kualitas tertinggi
              </span>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="audio-bitrates"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-3"
          >
            {/* Grid of 6 distinct audio cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-2.5">
              {audioOptions.map((opt) => {
                const isActive = selectedAudioQuality === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSelectedAudioQuality(opt.id)}
                    className={`relative p-3 rounded-xl text-left cursor-pointer flex flex-col justify-between min-h-[76px] touch-manipulation transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.98] ${
                      isActive
                        ? 'dz-card-active ring-2 ring-cyan-400/40 bg-gradient-to-b from-blue-600/25 to-cyan-500/15 dark:from-blue-600/30 dark:to-cyan-500/20'
                        : 'bg-white/70 dark:bg-slate-900/60 border border-slate-200 dark:border-blue-900/40 hover:border-cyan-500/40 hover:bg-white dark:hover:bg-slate-800/80 text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    {/* Top Row: Badge & Check Indicator */}
                    <div className="flex items-center justify-between w-full gap-1 mb-1.5">
                      <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded leading-none uppercase tracking-wide ${getBadgeClass(opt.badgeStyle, isActive)}`}>
                        {opt.badge}
                      </span>
                      {isActive && (
                        <div className="w-4 h-4 rounded-full bg-cyan-400 text-slate-950 flex items-center justify-center shrink-0">
                          <Check className="h-2.5 w-2.5 stroke-[3]" />
                        </div>
                      )}
                    </div>

                    {/* Middle: Bitrate Title */}
                    <div className="mt-auto">
                      <span className={`text-base sm:text-lg font-black tracking-tight block ${
                        isActive ? 'text-cyan-700 dark:text-cyan-300' : 'text-slate-900 dark:text-white'
                      }`}>
                        {opt.label}
                      </span>
                      {/* Sub-label description */}
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate mt-0.5">
                        {opt.desc}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Audio Format Info Summary Footer */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-slate-500 dark:text-slate-400">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-cyan-500 dark:text-cyan-400" />
                <span>Format Audio MP3</span>
                <span aria-hidden="true">·</span>
                <span>Bitrate Terpilih: <strong className="text-cyan-700 dark:text-cyan-300 font-bold">{selectedAudioQuality} kbps</strong></span>
              </div>
              <span className="text-[11px] text-slate-400 dark:text-slate-500">
                Termasuk metadata judul & cover art lagu
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
};
