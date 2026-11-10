import React from 'react';
import { Zap, ChevronRight } from 'lucide-react';

interface TipPromoCardProps {
  onTap?: () => void;
}

export const TipPromoCard: React.FC<TipPromoCardProps> = ({ onTap }) => {
  return (
    <div
      onClick={onTap}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onTap?.();
        }
      }}
      className="relative w-full rounded-2xl bg-gradient-to-r from-[#0c2354] via-[#091b40] to-[#0b275e] border border-blue-500/30 p-3.5 sm:p-4 shadow-lg shadow-black/40 flex items-center justify-between gap-3 overflow-hidden cursor-pointer hover:border-cyan-400/50 active:scale-[0.99] transition-all group select-none"
    >
      {/* Glossy light shard effect */}
      <div className="pointer-events-none absolute -right-6 -top-6 w-36 h-36 bg-cyan-400/10 rounded-full blur-2xl group-hover:bg-cyan-400/20 transition-colors" />

      {/* Left Icon: Glowing lightning bolt */}
      <div className="relative flex items-center justify-center w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500/30 to-cyan-500/20 border border-cyan-400/40 shadow-inner shrink-0">
        <Zap className="w-5 h-5 text-amber-400 fill-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.7)]" />
      </div>

      {/* Text Content */}
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-bold text-white tracking-tight truncate">
          Download lebih cepat & mudah!
        </h4>
        <p className="text-xs text-blue-200/80 truncate mt-0.5 font-medium">
          Salin link, lalu tekan tombol Download
        </p>
      </div>

      {/* Right Action: Chevron */}
      <div className="shrink-0 text-blue-300/80 group-hover:text-cyan-300 group-hover:translate-x-0.5 transition-all">
        <ChevronRight className="w-5 h-5" />
      </div>
    </div>
  );
};
