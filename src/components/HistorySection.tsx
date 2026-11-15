import React from 'react';
import { History, ArrowRight, Clock } from 'lucide-react';
import type { HistoryItem } from '../types/index.ts';
import { HistoryItemRow } from './HistoryItemRow.tsx';

interface HistorySectionProps {
  items: HistoryItem[];
  onViewAll: () => void;
  onPlay: (item: HistoryItem) => void;
  onDownloadAgain: (item: HistoryItem) => void;
  onDelete: (id: string) => void;
}

export const HistorySection: React.FC<HistorySectionProps> = ({
  items,
  onViewAll,
  onPlay,
  onDownloadAgain,
  onDelete
}) => {
  // Only display the 3 latest items on the home screen
  const latestThree = items.slice(0, 3);

  return (
    <div className="w-full space-y-3">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-sky-600 dark:text-cyan-400" />
          <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
            Riwayat Download
          </h2>
        </div>

        {items.length > 0 && (
          <button
            type="button"
            onClick={onViewAll}
            className="text-xs font-semibold text-sky-600 dark:text-blue-400 hover:text-sky-700 dark:hover:text-cyan-300 flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
          >
            <span>Lihat semua</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* History Items or Empty State (Strictly NO dummy data!) */}
      {latestThree.length === 0 ? (
        <div className="p-6 sm:p-7 rounded-2xl bg-white dark:bg-[#0c1836]/60 border border-slate-200 dark:border-blue-500/15 shadow-xs shadow-slate-900/5 dark:shadow-none text-center flex flex-col items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-sky-100 dark:bg-blue-900/30 border border-sky-200 dark:border-blue-500/20 flex items-center justify-center text-sky-600 dark:text-blue-400 mb-2.5">
            <Clock className="w-6 h-6 stroke-[1.5]" />
          </div>
          <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
            Belum ada riwayat
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs leading-relaxed">
            Unduhan Anda akan muncul di sini. Riwayat otomatis kadaluarsa dalam 24 jam.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {latestThree.map((item) => (
            <HistoryItemRow
              key={item.id}
              item={item}
              onPlay={onPlay}
              onDownloadAgain={onDownloadAgain}
              onDelete={onDelete}
            />
          ))}

          {/* Clean Expiry Text */}
          <div className="flex items-center justify-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400 pt-1">
            <Clock className="w-3.5 h-3.5 text-sky-600/80 dark:text-blue-400/80" />
            <span>Riwayat otomatis kadaluarsa dalam 24 jam</span>
          </div>
        </div>
      )}
    </div>
  );
};
