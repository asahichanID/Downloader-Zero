import React from 'react';
import { Crown, Tv, Music, Film } from 'lucide-react';
import type { MediaType } from '../types/index.ts';

interface QualitySelectorCardProps {
  mediaType: MediaType;
  setMediaType: (type: MediaType) => void;
  selectedVideoRes: string;
  setSelectedVideoRes: (res: string) => void;
  selectedAudioQuality: string;
  setSelectedAudioQuality: (qual: string) => void;
}

export const QualitySelectorCard: React.FC<QualitySelectorCardProps> = ({
  mediaType,
  setMediaType,
  selectedVideoRes,
  setSelectedVideoRes,
  selectedAudioQuality,
  setSelectedAudioQuality
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

  return (
    <div className="dz-card rounded-2xl p-4 sm:p-5 w-full shadow-lg space-y-4 select-none transition-all">
      {/* Header: Crown + Title + Sub-mode badge */}
      <div className="flex items-center justify-between pb-1 border-b border-blue-900/40">
        <div className="flex items-center gap-2 text-white font-bold text-sm sm:text-base tracking-wide">
          <Crown className="h-4 w-4 text-cyan-400 fill-cyan-400 drop-shadow-[0_0_6px_rgba(6,182,212,0.8)]" />
          <span>
            {mediaType === 'video' ? 'Pilih Resolusi Video' : 'Pilih Kualitas Audio MP3'}
          </span>
        </div>

        {/* Mode Indicator Button to switch cleanly */}
        <div className="flex items-center bg-[#050e24] p-1 rounded-xl border border-blue-900/60 text-xs">
          <button
            type="button"
            onClick={() => setMediaType('video')}
            className={`px-3 py-1 rounded-lg font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              mediaType === 'video'
                ? 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Film className="h-3 w-3" />
            <span>Video</span>
          </button>
          <button
            type="button"
            onClick={() => setMediaType('audio')}
            className={`px-3 py-1 rounded-lg font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              mediaType === 'audio'
                ? 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Music className="h-3 w-3" />
            <span>Audio</span>
          </button>
        </div>
      </div>

      {/* DEDICATED VIDEO RESOLUTION VIEW (Audio completely separated) */}
      {mediaType === 'video' && (
        <div className="space-y-3 animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-cyan-950/80 border border-cyan-500/50 flex items-center justify-center text-cyan-400 shrink-0">
                <span className="text-[11px] font-black tracking-tighter">HD</span>
              </div>
              <div>
                <span className="text-xs sm:text-sm font-bold text-white block">
                  Resolusi Video (MP4)
                </span>
                <span className="text-[11px] text-cyan-300/80">
                  Unduh video tanpa watermark dari SD hingga 4K
                </span>
              </div>
            </div>
            <span className="text-xs font-mono font-bold text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded-md border border-cyan-800/60">
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
                  className={`py-2.5 px-2 rounded-xl text-center text-xs font-bold transition-all cursor-pointer flex flex-col items-center justify-center min-h-[46px] ${
                    isActive
                      ? 'dz-pill-active scale-[1.02]'
                      : 'dz-pill'
                  }`}
                >
                  <span className="text-xs sm:text-sm">{opt.label}</span>
                  {opt.badge ? (
                    <span className="text-[9px] font-bold text-cyan-300 leading-none mt-0.5">
                      {opt.badge}
                    </span>
                  ) : (
                    <span className="text-[9px] text-slate-400 leading-none mt-0.5 font-normal">
                      {opt.desc}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* DEDICATED AUDIO QUALITY VIEW (Video completely separated) */}
      {mediaType === 'audio' && (
        <div className="space-y-3 animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-cyan-950/80 border border-cyan-500/50 flex items-center justify-center text-cyan-400 shrink-0">
                <Music className="h-4 w-4" />
              </div>
              <div>
                <span className="text-xs sm:text-sm font-bold text-white block">
                  Kualitas Bitrate Audio (MP3)
                </span>
                <span className="text-[11px] text-cyan-300/80">
                  Audio murni jernih dari 64 kbps hingga 320 kbps Lossless
                </span>
              </div>
            </div>
            <span className="text-xs font-mono font-bold text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded-md border border-cyan-800/60">
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
                  className={`py-2.5 px-2 rounded-xl text-center text-xs font-bold transition-all cursor-pointer flex flex-col items-center justify-center min-h-[46px] ${
                    isActive
                      ? 'dz-pill-active scale-[1.02]'
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
        </div>
      )}
    </div>
  );
};
