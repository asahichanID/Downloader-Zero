import React, { useState } from 'react';
import { History, Search, Trash2, Clock, Filter, ArrowLeft } from 'lucide-react';
import type { HistoryItem, PlatformType } from '../types/index.ts';
import { HistoryItemRow } from './HistoryItemRow.tsx';

interface HistoryFullViewProps {
  items: HistoryItem[];
  onBackToHome: () => void;
  onPlay: (item: HistoryItem) => void;
  onDownloadAgain: (item: HistoryItem) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
}

export const HistoryFullView: React.FC<HistoryFullViewProps> = ({
  items,
  onBackToHome,
  onPlay,
  onDownloadAgain,
  onDelete,
  onClearAll
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedFilter, setSelectedFilter] = useState<string>('all');
  const [showClearConfirm, setShowClearConfirm] = useState<boolean>(false);

  // Filter items by search query and platform filter
  const filteredItems = items.filter((item) => {
    const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.author.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = selectedFilter === 'all' || item.platform === selectedFilter;
    return matchesSearch && matchesFilter;
  });

  const platforms = [
    { id: 'all', label: 'Semua' },
    { id: 'youtube', label: 'YouTube' },
    { id: 'tiktok', label: 'TikTok' },
    { id: 'twitter', label: 'Twitter (X)' },
    { id: 'spotify', label: 'Spotify' },
    { id: 'instagram', label: 'Instagram' },
    { id: 'facebook', label: 'Facebook' },
    { id: 'pinterest', label: 'Pinterest' },
    { id: 'terabox', label: 'TeraBox' },
  ];

  return (
    <div className="w-full space-y-4 pb-24">
      {/* View Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBackToHome}
            className="w-8 h-8 rounded-full bg-white dark:bg-slate-900/80 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white flex items-center justify-center border border-slate-200 dark:border-white/10 active:scale-90 transition-all cursor-pointer"
            aria-label="Kembali ke Beranda"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-sky-600 dark:text-cyan-400" />
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">Semua Riwayat Unduhan</h1>
          </div>
        </div>

        {items.length > 0 && (
          <button
            type="button"
            onClick={() => setShowClearConfirm(true)}
            className="text-xs font-semibold text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/40 active:scale-95 transition-all cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Hapus Semua</span>
          </button>
        )}
      </div>

      {/* Expiration Note Card */}
      <div className="p-3 rounded-2xl bg-sky-50 dark:bg-[#091a3c] border border-sky-200 dark:border-blue-500/20 flex items-center gap-2.5 text-xs text-sky-900 dark:text-blue-200/80">
        <Clock className="w-4 h-4 text-sky-600 dark:text-cyan-400 shrink-0" />
        <p className="leading-snug">
          Riwayat tersimpan di browser Anda dan otomatis kadaluarsa setelah 24 jam.
        </p>
      </div>

      {/* Search Input */}
      {items.length > 0 && (
        <div className="relative w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari judul atau platform..."
            className="w-full h-11 pl-10 pr-4 bg-white dark:bg-[#0a183d]/90 border border-slate-300 dark:border-blue-500/25 rounded-2xl text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-sky-500 dark:focus:border-cyan-400 focus:ring-1 focus:ring-sky-500/30 dark:focus:ring-cyan-400/40"
          />
        </div>
      )}

      {/* Platform Filter Buttons */}
      {items.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {platforms.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedFilter(p.id)}
              className={`py-1.5 px-3 rounded-full text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                selectedFilter === p.id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white dark:bg-[#0c1836] border border-slate-200 dark:border-blue-500/20 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      {/* History Items List */}
      {filteredItems.length === 0 ? (
        <div className="p-8 rounded-2xl bg-white dark:bg-[#0c1836]/60 border border-slate-200 dark:border-blue-500/15 shadow-xs shadow-slate-900/5 dark:shadow-none text-center flex flex-col items-center justify-center">
          <Clock className="w-8 h-8 text-slate-400 dark:text-slate-500 mb-2" />
          <p className="text-sm font-bold text-slate-800 dark:text-slate-300">
            {searchQuery ? 'Tidak ada hasil pencarian' : 'Belum ada riwayat'}
          </p>
          <p className="text-xs text-slate-500 mt-1 max-w-xs">
            {searchQuery
              ? 'Coba gunakan kata kunci pencarian yang lain.'
              : 'Unduhan Anda akan otomatis tersimpan di sini selama 24 jam.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredItems.map((item) => (
            <HistoryItemRow
              key={item.id}
              item={item}
              onPlay={onPlay}
              onDownloadAgain={onDownloadAgain}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}

      {/* Confirmation Dialog for Clear All */}
      {showClearConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md"
          onClick={() => setShowClearConfirm(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-3xl bg-white dark:bg-[#081530] border border-red-300 dark:border-red-500/40 p-5 shadow-2xl text-slate-900 dark:text-white text-center space-y-3"
          >
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-950/80 border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Hapus Semua Riwayat?</h3>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Semua daftar unduhan di perangkat ini akan dibersihkan secara permanen.
            </p>
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  onClearAll();
                  setShowClearConfirm(false);
                }}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold cursor-pointer"
              >
                Ya, Hapus Semua
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
