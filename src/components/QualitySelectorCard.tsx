import React from 'react';
import { Crown, Tv, Music, Film } from 'lucide-react';
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

export const QualitySelectorCard: React.FC<QualitySelectorCardProps> = ({
  mediaType,
  setMediaType,
  selectedVideoRes,
  setSelectedVideoRes,
  selectedAudioQuality,
  setSelectedAudioQuality,
  isAudioOnly = false
}) => {
  const videoOptions = [
    { id: '360p', label: '360p', desc: 'Ringan' },
    { id: '480p', label: '480p', desc: 'Standar' },
    { id: '720p', label: '720p', badge: 'HD' },
    { id: '1080p', label: '1080p', badge: 'Full HD' },
    { id: '2K', label: '2K', desc: 'Quad HD' },
    { id: '4K', label: '4K', desc: 'Ultra HD' }
  ];

  const audioOptions = [
    { id: '64', label: '64', desc: 'Hemat' },
    { id: '96', label: '96', desc: 'Ringkas' },
    { id: '128', label: '128', desc: 'Standar' },
    { id: '192', label: '192', desc: 'Tinggi' },
    { id: '256', label: '256', desc: 'Jernih' },
    { id: '320', label: '320 kbps', desc: 'Studio' }
  ];

  const currentMediaType = isAudioOnly ? 'audio' : mediaType;

  return (
    <div className="dz-card rounded-2xl p-4 sm:p-5 w-full space-y-4 select-none transition-all duration-200">
      {/* Header: Crown + Title + Sub-mode badge */}
      <div className="flex items-center justify-between pb-1 border-b border-slate-200 dark:border-blue-900/40">
        <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-sm sm:text-base tracking-wide">
          <Crown className="h-4 w-4 text-cyan-500 dark:text-cyan-400 fill-cyan-400" />
          <span>
            {currentMediaType === 'video' ? 'Pilih Resolusi Video' : 'Pilih Kualitas Audio MP3'}
          </span>
          {isAudioOnly && (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/50 font-bold">
              Spotify Audio Saja
            </span>
          )}
        </div>

        {/* Mode Indicator Button to switch cleanly */}
        {!isAudioOnly ? (
          <div className="flex items-center bg-slate-100 dark:bg-[#050e24] p-1 rounded-xl border border-slate-300 dark:border-blue-900/60 text-xs">
            <button
              type="button"
              onClick={() => setMediaType('video')}
              className={`px-3 py-1 rounded-lg font-bold flex items-center gap-1.5 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.96] cursor-pointer ${
                mediaType === 'video'
                  ? 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Film className="h-3 w-3" />
              <span>Video</span>
            </button>
            <button
              type="button"
              onClick={() => setMediaType('audio')}
              className={`px-3 py-1 rounded-lg font-bold flex items-center gap-1.5 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.96] cursor-pointer ${
                mediaType === 'audio'
                  ? 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Music className="h-3 w-3" />
              <span>Audio</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-500/40 text-[11px] font-bold text-emerald-800 dark:text-emerald-300">
            <Music className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Format MP3</span>
          </div>
        )}
      </div>

      {/* DEDICATED RESOLUTION VIEWS WITH FLUID CROSSFADE */}
      <AnimatePresence mode="wait">
        {!isAudioOnly && mediaType === 'video' ? (
          <motion.div
            key="video-view"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-sky-100 dark:bg-cyan-950/80 border border-sky-300 dark:border-cyan-500/50 flex items-center justify-center text-cyan-600 dark:text-cyan-400 shrink-0">
                  <span className="text-[11px] font-black tracking-tighter">HD</span>
                </div>
                <div>
                  <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white block">
                    Resolusi Video (MP4)
                  </span>
                  <span className="text-[11px] text-slate-600 dark:text-cyan-300/80">
                    Unduh video tanpa watermark dari SD hingga 4K
                  </span>
                </div>
              </div>
              <span className="text-xs font-mono font-bold text-cyan-700 dark:text-cyan-400 bg-sky-100 dark:bg-cyan-950/60 px-2 py-0.5 rounded-md border border-sky-300 dark:border-cyan-800/60">
                Pilihan: {selectedVideoRes}
              </span>
            </div>

            {/* Video Resolution Pills Grid */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 sm:gap-2.5">
              {videoOptions.map((opt) => {
                const isActive = selectedVideoRes === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSelectedVideoRes(opt.id)}
                    className={`py-2.5 px-2 rounded-xl text-center text-xs font-bold cursor-pointer flex flex-col items-center justify-center min-h-[46px] touch-manipulation transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                      isActive
                        ? 'dz-pill-active'
                        : 'dz-pill'
                    }`}
                  >
                    <span className="text-xs sm:text-sm">{opt.label}</span>
                    {opt.badge ? (
                      <span className="text-[9px] font-bold text-cyan-600 dark:text-cyan-300 leading-none mt-0.5">
                        {opt.badge}
                      </span>
                    ) : (
                      <span className="text-[9px] text-slate-500 dark:text-slate-400 leading-none mt-0.5 font-normal">
                        {opt.desc}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="audio-view"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-sky-100 dark:bg-cyan-950/80 border border-sky-300 dark:border-cyan-500/50 flex items-center justify-center text-cyan-600 dark:text-cyan-400 shrink-0">
                  <Music className="h-4 w-4" />
                </div>
                <div>
                  <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white block">
                    Kualitas Bitrate Audio (MP3)
                  </span>
                  <span className="text-[11px] text-slate-600 dark:text-cyan-300/80">
                    Audio murni jernih dari 64 kbps hingga 320 kbps Lossless
                  </span>
                </div>
              </div>
              <span className="text-xs font-mono font-bold text-cyan-700 dark:text-cyan-400 bg-sky-100 dark:bg-cyan-950/60 px-2 py-0.5 rounded-md border border-sky-300 dark:border-cyan-800/60">
                Pilihan: {selectedAudioQuality} kbps
              </span>
            </div>

            {/* Audio Bitrate Pills Grid */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 sm:gap-2.5">
              {audioOptions.map((opt) => {
                const isActive = selectedAudioQuality === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSelectedAudioQuality(opt.id)}
                    className={`py-2.5 px-2 rounded-xl text-center text-xs font-bold cursor-pointer flex flex-col items-center justify-center min-h-[46px] touch-manipulation transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                      isActive
                        ? 'dz-pill-active'
                        : 'dz-pill'
                    }`}
                  >
                    <span className="text-xs sm:text-sm">{opt.label}</span>
                    <span className="text-[9px] text-slate-400 leading-none mt-0.5 font-normal">
                      {opt.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
