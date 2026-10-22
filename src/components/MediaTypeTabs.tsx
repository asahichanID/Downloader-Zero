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
        className={`group h-12 sm:h-13 rounded-2xl flex items-center justify-center gap-2 text-sm sm:text-base font-bold transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.98] border ${
          isAudioOnly
            ? 'opacity-40 cursor-not-allowed dz-card text-slate-500 border-slate-800'
            : mediaType === 'video'
            ? 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white border-cyan-300/50 cursor-pointer shadow-md shadow-black/30'
            : 'dz-card text-slate-300 hover:text-white hover:border-cyan-500/40 hover:bg-[#0c224a]/60 cursor-pointer'
        }`}
        title={isAudioOnly ? 'Platform ini hanya mendukung unduhan audio' : 'Format Video'}
      >
        <Play className="h-4 w-4 sm:h-5 sm:w-5 fill-current transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105" />
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
        className={`group h-12 sm:h-13 rounded-2xl flex items-center justify-center gap-2 text-sm sm:text-base font-bold transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.98] cursor-pointer border ${
          mediaType === 'audio'
            ? isAudioOnly
              ? 'bg-gradient-to-r from-emerald-600 to-teal-500 text-white border-emerald-300/50 shadow-md shadow-black/30'
              : 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white border-cyan-300/50 shadow-md shadow-black/30'
            : 'dz-card text-slate-300 hover:text-white hover:border-cyan-500/40 hover:bg-[#0c224a]/60'
        }`}
      >
        <Music className="h-4 w-4 sm:h-5 sm:w-5 transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105" />
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
