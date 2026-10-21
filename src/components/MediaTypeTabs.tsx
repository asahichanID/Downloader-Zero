import React from 'react';
import { Play, Music } from 'lucide-react';
import type { MediaType } from '../types/index.ts';

interface MediaTypeTabsProps {
  mediaType: MediaType;
  setMediaType: (type: MediaType) => void;
  isAudioOnly?: boolean;
}

export const MediaTypeTabs: React.FC<MediaTypeTabsProps> = ({
  mediaType,
  setMediaType,
  isAudioOnly = false
}) => {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:gap-3 w-full">
      {/* Video Tab */}
      <button
        type="button"
        disabled={isAudioOnly}
        onClick={() => !isAudioOnly && setMediaType('video')}
        className={`h-12 sm:h-13 rounded-2xl flex items-center justify-center gap-2 text-sm sm:text-base font-bold transition-all duration-200 ease-out ${
          isAudioOnly
            ? 'opacity-40 cursor-not-allowed dz-card text-slate-500'
            : mediaType === 'video'
            ? 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-[0_0_18px_rgba(6,182,212,0.55)] border-t border-cyan-300/50 cursor-pointer'
            : 'dz-card text-slate-300 hover:text-white hover:border-cyan-500/40 hover:bg-[#0c224a]/60 cursor-pointer'
        }`}
        title={isAudioOnly ? 'Platform ini hanya mendukung unduhan audio' : 'Format Video'}
      >
        <Play className="h-4 w-4 sm:h-5 sm:w-5 fill-current" />
        <span>Video</span>
        {isAudioOnly && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
            N/A
          </span>
        )}
      </button>

      {/* MP3 Audio Tab */}
      <button
        type="button"
        onClick={() => setMediaType('audio')}
        className={`h-12 sm:h-13 rounded-2xl flex items-center justify-center gap-2 text-sm sm:text-base font-bold transition-all duration-200 ease-out cursor-pointer ${
          mediaType === 'audio'
            ? isAudioOnly
              ? 'bg-gradient-to-r from-emerald-600 to-teal-500 text-white shadow-[0_0_18px_rgba(34,197,94,0.5)] border-t border-emerald-300/50'
              : 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-[0_0_18px_rgba(6,182,212,0.55)] border-t border-cyan-300/50'
            : 'dz-card text-slate-300 hover:text-white hover:border-cyan-500/40 hover:bg-[#0c224a]/60'
        }`}
      >
        <Music className="h-4 w-4 sm:h-5 sm:w-5" />
        <span>MP3 Audio</span>
        {isAudioOnly && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/40 text-emerald-200 font-mono font-bold">
            Aktif
          </span>
        )}
      </button>
    </div>
  );
};
