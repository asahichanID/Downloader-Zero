import React from 'react';
import { Play, Clock, HardDrive, ChevronRight } from 'lucide-react';
import animeMascot from '../assets/images/anime_mascot_hero_1792123758844.jpg';
import type { MediaMetadata } from '../types/index.ts';

interface VideoPreviewCardProps {
  media: MediaMetadata | null;
  selectedResolution: string;
  onClick?: () => void;
}

export const VideoPreviewCard: React.FC<VideoPreviewCardProps> = ({
  media,
  selectedResolution,
  onClick
}) => {
  // If media is extracted, display real data; otherwise show "Contoh Video" as in screenshot
  const title = media?.title || 'Contoh Video';
  const duration = media?.durationFormatted || 'Durasi: 03:45';
  const thumbnail = (media?.thumbnail && media.thumbnail.trim()) ? media.thumbnail : animeMascot;
  const filesize = media?.formats?.[0]?.filesize || 'Ukuran: ~ 45.2 MB';

  return (
    <div
      onClick={onClick}
      className="dz-card rounded-2xl p-2.5 sm:p-3 w-full flex items-center justify-between gap-3 shadow-lg border border-blue-800/60 hover:border-cyan-500/50 transition-all cursor-pointer group"
    >
      {/* Left Thumbnail with Play Button & HD Badge */}
      <div className="relative w-28 sm:w-32 h-16 sm:h-18 rounded-xl overflow-hidden shrink-0 border border-cyan-500/30 bg-[#050e24]">
        <img
          src={thumbnail}
          alt={title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          onError={(e) => {
            (e.target as HTMLElement).setAttribute('src', animeMascot);
          }}
        />
        {/* Dark overlay */}
        <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
          <div className="w-7 h-7 rounded-full bg-cyan-500/80 backdrop-blur-xs flex items-center justify-center text-white shadow-md shadow-cyan-500/40 group-hover:scale-110 transition-transform">
            <Play className="h-3.5 w-3.5 fill-current ml-0.5" />
          </div>
        </div>
        {/* HD Badge at bottom-right */}
        <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-blue-600/90 text-[9px] font-black text-white leading-none border border-cyan-300/40">
          HD
        </div>
      </div>

      {/* Center Metadata */}
      <div className="flex-1 min-w-0 flex flex-col justify-center space-y-1">
        <h4 className="text-xs sm:text-sm font-bold text-white truncate group-hover:text-cyan-300 transition-colors">
          {title}
        </h4>

        <div className="flex flex-col text-[11px] text-slate-300 space-y-0.5 font-medium">
          <div className="flex items-center gap-1.5 text-slate-300">
            <Clock className="h-3 w-3 text-cyan-400 shrink-0" />
            <span className="truncate">{duration.startsWith('Durasi:') ? duration : `Durasi: ${duration}`}</span>
          </div>

          <div className="flex items-center gap-1.5 text-slate-300">
            <HardDrive className="h-3 w-3 text-cyan-400 shrink-0" />
            <span className="truncate">{filesize.startsWith('Ukuran:') ? filesize : `Ukuran: ~ ${filesize}`}</span>
          </div>
        </div>
      </div>

      {/* Right Chevron */}
      <div className="text-cyan-400 pr-1 group-hover:translate-x-1 transition-transform">
        <ChevronRight className="h-5 w-5" />
      </div>
    </div>
  );
};
