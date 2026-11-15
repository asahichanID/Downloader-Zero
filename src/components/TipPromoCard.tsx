import React from 'react';
import { Zap, ChevronRight } from 'lucide-react';

interface TipPromoCardProps {
  onTap?: () => void;
}

export const TipPromoCard: React.FC<TipPromoCardProps> = React.memo(({ onTap }) => {
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
      className="relative w-full rounded-2xl bg-gradient-to-r from-sky-50 via-white to-blue-50 dark:from-[#0c2354] dark:via-[#091b40] dark:to-[#0b275e] border border-sky-200 dark:border-blue-500/30 p-3.5 sm:p-4 shadow-md shadow-slate-900/5 dark:shadow-lg dark:shadow-black/35 flex items-center justify-between gap-3 overflow-hidden cursor-pointer hover:border-sky-400 dark:hover:border-cyan-400/50 active:scale-[0.99] transition-[border-color,transform] duration-150 group select-none dz-contain-card"
    >
      {/* Left Icon */}
      <div className="relative flex items-center justify-center w-11 h-11 rounded-2xl bg-sky-100 dark:bg-gradient-to-br dark:from-blue-500/30 dark:to-cyan-500/20 border border-sky-300 dark:border-cyan-400/40 shrink-0">
        <Zap className="w-5 h-5 text-amber-500 dark:text-amber-400 fill-amber-500 dark:fill-amber-400" />
      </div>

      {/* Text Content */}
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight truncate">
          Download lebih cepat & mudah!
        </h4>
        <p className="text-xs text-slate-600 dark:text-blue-200/80 truncate mt-0.5 font-medium">
          Salin link, lalu tekan tombol Download
        </p>
      </div>

      {/* Right Action: Chevron */}
      <div className="shrink-0 text-sky-600 dark:text-blue-300/80 group-hover:text-sky-700 dark:group-hover:text-cyan-300 group-hover:translate-x-0.5 transition-transform duration-150">
        <ChevronRight className="w-5 h-5" />
      </div>
    </div>
  );
});
