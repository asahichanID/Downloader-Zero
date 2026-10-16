import React from 'react';
import { Play, Music } from 'lucide-react';
import type { MediaType } from '../types/index.ts';

interface MediaTypeTabsProps {
  mediaType: MediaType;
  setMediaType: (type: MediaType) => void;
}

export const MediaTypeTabs: React.FC<MediaTypeTabsProps> = ({
  mediaType,
  setMediaType
}) => {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:gap-3 w-full">
      {/* Video Tab */}
      <button
        type="button"
        onClick={() => setMediaType('video')}
        className={`h-12 sm:h-13 rounded-2xl flex items-center justify-center gap-2 text-sm sm:text-base font-bold transition-all cursor-pointer ${
          mediaType === 'video'
            ? 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-[0_0_20px_rgba(6,182,212,0.5)] border-t border-cyan-300/40'
            : 'dz-card text-slate-300 hover:text-white hover:border-cyan-500/40 hover:bg-[#0c224a]/60'
        }`}
      >
        <Play className="h-4 w-4 sm:h-5 sm:w-5 fill-current" />
        <span>Video</span>
      </button>

      {/* MP3 Audio Tab */}
      <button
        type="button"
        onClick={() => setMediaType('audio')}
        className={`h-12 sm:h-13 rounded-2xl flex items-center justify-center gap-2 text-sm sm:text-base font-bold transition-all cursor-pointer ${
          mediaType === 'audio'
            ? 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-[0_0_20px_rgba(6,182,212,0.5)] border-t border-cyan-300/40'
            : 'dz-card text-slate-300 hover:text-white hover:border-cyan-500/40 hover:bg-[#0c224a]/60'
        }`}
      >
        <Music className="h-4 w-4 sm:h-5 sm:w-5" />
        <span>MP3 Audio</span>
      </button>
    </div>
  );
};
