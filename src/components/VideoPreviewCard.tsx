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
  // If no real media or media is Spotify, do not render preview card (per user requirement to remove contoh video and avoid preview on Spotify)
  if (!media || media.platform === 'spotify') {
    return null;
  }

  const title = media.title || 'Video';
  const duration = media.durationFormatted || 'Durasi: --:--';
  const thumbnail = (media.thumbnail && media.thumbnail.trim()) ? media.thumbnail : animeMascot;

  // Find format corresponding to selectedResolution
  const matchedFormat = media.formats?.find((f) => {
    const r = (f.resolution || '').toLowerCase();
    const q = (f.quality || '').toLowerCase();
    const target = (selectedResolution || '').toLowerCase().trim();
    if (target === '2k' || target === '1440' || target === '1440p') {
      return r === '2k' || r.includes('1440') || q.includes('2k') || q.includes('1440');
    }
    if (target === '4k' || target === '2160' || target === '2160p') {
      return r === '4k' || r.includes('2160') || q.includes('4k') || q.includes('2160');
    }
    const cleanTarget = target.replace(/p$/i, '');
    return r.includes(cleanTarget) || q.includes(cleanTarget);
  }) || media.formats?.[0];

  const badgeText = matchedFormat?.resolution || selectedResolution || 'HD';
  const displayQuality = matchedFormat?.quality || `${selectedResolution} Video MP4`;
  const filesize = matchedFormat?.filesize || (selectedResolution.toUpperCase().includes('2K') ? '2K Quad HD (1440p)' : selectedResolution.toUpperCase().includes('4K') ? '4K Ultra HD (2160p)' : matchedFormat?.quality || 'Format HD');

  return (
    <div
      onClick={onClick}
      className="dz-card rounded-2xl p-2.5 sm:p-3 w-full flex items-center justify-between gap-3 border border-slate-300 dark:border-blue-800/60 hover:border-cyan-500/50 hover:-translate-y-0.5 active:scale-[0.985] transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] cursor-pointer group touch-manipulation"
    >
      {/* Left Thumbnail with Play Button & Resolution Badge */}
      <div className="relative w-28 sm:w-32 h-16 sm:h-18 rounded-xl overflow-hidden shrink-0 border border-slate-300 dark:border-cyan-500/30 bg-slate-200 dark:bg-[#050e24]">
        <img
          src={thumbnail}
          alt={title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]"
          onError={(e) => {
            (e.target as HTMLElement).setAttribute('src', animeMascot);
          }}
        />
        {/* Dark overlay */}
        <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
          <div className="w-7 h-7 rounded-full bg-cyan-500/80 backdrop-blur-xs flex items-center justify-center text-white shadow-md shadow-cyan-500/40 group-hover:scale-110 transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]">
            <Play className="h-3.5 w-3.5 fill-current ml-0.5" />
          </div>
        </div>
        {/* Dynamic Resolution Badge at bottom-right */}
        <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-gradient-to-r from-blue-600 to-cyan-600 text-[9px] font-black text-white leading-none border border-cyan-300/40 uppercase">
          {badgeText}
        </div>
      </div>

      {/* Center Metadata */}
      <div className="flex-1 min-w-0 flex flex-col justify-center space-y-1">
        <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate group-hover:text-cyan-600 dark:group-hover:text-cyan-300 transition-colors">
          {title}
        </h4>

        <div className="flex flex-col text-[11px] text-slate-600 dark:text-slate-300 space-y-0.5 font-medium">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3 w-3 text-cyan-600 dark:text-cyan-400 shrink-0" />
            <span className="truncate">{duration.startsWith('Durasi:') ? duration : `Durasi: ${duration}`}</span>
          </div>

          <div className="flex items-center gap-1.5">
            <HardDrive className="h-3 w-3 text-cyan-600 dark:text-cyan-400 shrink-0" />
            <span className="truncate">{displayQuality}</span>
          </div>
        </div>
      </div>

      {/* Right Chevron */}
      <div className="text-cyan-600 dark:text-cyan-400 pr-1 group-hover:translate-x-1 transition-transform">
        <ChevronRight className="h-5 w-5" />
      </div>
    </div>
  );
};
