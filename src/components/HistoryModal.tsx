/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  X,
  Clock,
  Trash2,
  Download,
  Film,
  Music,
  Images,
  Play,
  Pause,
  AlertTriangle,
  HardDrive,
  CheckCircle2,
  Sparkles,
  ExternalLink,
  Info
} from 'lucide-react';
import type { HistoryItem } from '../types/index.ts';
import {
  getAllHistory,
  deleteHistoryItem,
  clearAllHistory,
  saveHistoryItemToDevice,
  getCycleStatus
} from '../services/historyStorage.ts';

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({ isOpen, onClose }) => {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [cycleInfo, setCycleInfo] = useState(getCycleStatus());
  const [confirmClearOpen, setConfirmClearOpen] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Active preview item
  const [previewItem, setPreviewItem] = useState<{
    item: HistoryItem;
    url: string;
  } | null>(null);

  // Load history from IndexedDB
  const refreshHistory = async () => {
    setIsLoading(true);
    try {
      const data = await getAllHistory();
      setItems(data);
    } catch (e) {
      console.warn('Failed to load history:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      refreshHistory();
    }
  }, [isOpen]);

  // Live 1-second interval to update cycle countdown
  useEffect(() => {
    if (!isOpen) return;

    const timer = setInterval(() => {
      const status = getCycleStatus();
      setCycleInfo(status);

      // If cycle just expired while modal is open, trigger auto-refresh
      if (status.isExpired) {
        refreshHistory();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen]);

  // Listen to custom event for history updates
  useEffect(() => {
    const handleUpdate = () => {
      refreshHistory();
    };
    window.addEventListener('dz_history_updated', handleUpdate);
    return () => window.removeEventListener('dz_history_updated', handleUpdate);
  }, []);

  // Cleanup object URL on unmount or preview close
  useEffect(() => {
    return () => {
      if (previewItem?.url) {
        URL.revokeObjectURL(previewItem.url);
      }
    };
  }, [previewItem]);

  if (!isOpen) return null;

  // Handle instant save to device/gallery
  const handleSaveToDevice = (item: HistoryItem) => {
    const success = saveHistoryItemToDevice(item);
    if (success) {
      showToast(`Berkas "${item.title.slice(0, 25)}..." berhasil disimpan ke galeri/perangkat!`);
    } else {
      showToast('Gagal mengekspor berkas.');
    }
  };

  // Handle item deletion
  const handleDeleteItem = async (id: string) => {
    await deleteHistoryItem(id);
    await refreshHistory();
    showToast('Item riwayat dihapus.');
  };

  // Handle full cleanup
  const handleConfirmClearAll = async () => {
    await clearAllHistory();
    await refreshHistory();
    setConfirmClearOpen(false);
    showToast('Seluruh riwayat berhasil dibersihkan.');
  };

  // Open preview
  const handleOpenPreview = (item: HistoryItem) => {
    if (previewItem?.url) {
      URL.revokeObjectURL(previewItem.url);
    }

    if (item.blob) {
      const url = URL.createObjectURL(item.blob);
      setPreviewItem({ item, url });
    } else {
      showToast('Data berkas tidak dapat diputar.');
    }
  };

  const closePreview = () => {
    if (previewItem?.url) {
      URL.revokeObjectURL(previewItem.url);
    }
    setPreviewItem(null);
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  const totalBytes = items.reduce((acc, curr) => acc + (curr.filesizeBytes || 0), 0);
  const totalSizeFormatted =
    totalBytes > 1024 * 1024 * 1024
      ? `${(totalBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
      : `${(totalBytes / (1024 * 1024)).toFixed(1)} MB`;

  const getPlatformBadge = (platform: string) => {
    switch (platform) {
      case 'youtube':
        return 'bg-red-500/20 text-red-400 border-red-500/40';
      case 'tiktok':
        return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40';
      case 'facebook':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/40';
      case 'instagram':
        return 'bg-pink-500/20 text-pink-400 border-pink-500/40';
      case 'pinterest':
        return 'bg-rose-500/20 text-rose-400 border-rose-500/40';
      default:
        return 'bg-slate-700/40 text-slate-300 border-slate-600/40';
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl rounded-3xl p-4 sm:p-6 dz-card border border-cyan-500/60 shadow-2xl shadow-cyan-500/25 max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Toast Alert */}
        {toastMessage && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-cyan-950/95 border border-cyan-400 text-cyan-200 text-xs font-semibold shadow-xl flex items-center gap-2 animate-in fade-in slide-in-from-top-3">
            <CheckCircle2 className="h-4 w-4 text-cyan-400 shrink-0" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-blue-900/60 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-cyan-950/90 border border-cyan-500/50 flex items-center justify-center text-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.4)]">
              <Clock className="h-4.5 w-4.5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-cyber font-black text-cyan-400 italic text-sm">DZ</span>
                <span className="font-bold text-white text-base sm:text-lg">Riwayat Unduhan</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Tersimpan offline di memori lokal peramban · Siap simpan ke galeri
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-[#0c224a] border border-blue-900 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 24-Hour Full-Purge Cycle Status Bar */}
        <div className="mt-3.5 p-3 sm:p-3.5 rounded-2xl bg-[#06122b]/90 border border-cyan-500/30 shrink-0 space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
              <span className="text-xs font-bold text-cyan-300 tracking-wide uppercase">
                Siklus Pembersihan Otomatis (Full 24 Jam)
              </span>
            </div>
            <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-cyan-400 bg-cyan-950/80 px-2.5 py-1 rounded-lg border border-cyan-500/40 w-fit">
              <Clock className="h-3.5 w-3.5" />
              <span>Bersih serentak dalam: {cycleInfo.formattedRemaining}</span>
            </div>
          </div>

          {/* Progress bar of the 24-hour cycle */}
          <div className="w-full bg-slate-900/80 rounded-full h-1.5 overflow-hidden border border-blue-900/40">
            <div
              className="bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500 h-full rounded-full transition-all duration-1000"
              style={{ width: `${cycleInfo.progressPercent}%` }}
            />
          </div>

          <p className="text-[11px] text-slate-400 leading-tight flex items-start gap-1">
            <Info className="h-3 w-3 text-cyan-400 shrink-0 mt-0.5" />
            <span>
              Tempat riwayat ini berfungsi sebagai tempat penampungan berjalan. Seluruh riwayat akan
              dibersihkan total serentak saat waktu 24 jam habis agar memori perangkat Anda tetap
              lega.
            </span>
          </p>
        </div>

        {/* Secondary Bar: Count, Size, & Action */}
        <div className="py-3 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-300 font-medium">
            <span className="font-bold text-white">{items.length}</span> Berkas Tersimpan{' '}
            {items.length > 0 && (
              <span className="text-cyan-400 font-mono">({totalSizeFormatted})</span>
            )}
          </div>

          {items.length > 0 && (
            <button
              type="button"
              onClick={() => setConfirmClearOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-red-950/40 hover:bg-red-900/50 border border-red-500/40 hover:border-red-400 text-red-300 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm hover:shadow-[0_0_10px_rgba(239,68,68,0.3)]"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Bersihkan Riwayat</span>
            </button>
          )}
        </div>

        {/* Confirmation Modal Overlay for Clear All */}
        {confirmClearOpen && (
          <div className="p-3.5 mb-3 rounded-2xl bg-red-950/80 border border-red-500/60 animate-in fade-in shrink-0">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <h5 className="text-xs font-bold text-white">Hapus Seluruh Riwayat Sekarang?</h5>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  Semua berkas offline yang tersimpan dalam riwayat ini akan dihapus dari memori dan
                  siklus 24 jam akan direset kembali.
                </p>
                <div className="flex items-center gap-2 mt-2.5">
                  <button
                    type="button"
                    onClick={handleConfirmClearAll}
                    className="px-3 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold cursor-pointer transition-colors"
                  >
                    Ya, Bersihkan Sekarang
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClearOpen(false)}
                    className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
                  >
                    Batal
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* History List or Empty State */}
        <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 -mr-1">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400">
              <div className="w-8 h-8 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin mb-3"></div>
              <p className="text-xs">Memuat riwayat unduhan lokal...</p>
            </div>
          ) : items.length === 0 ? (
            <div className="py-12 px-4 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-3xl bg-[#09152e] border border-blue-900 flex items-center justify-center text-cyan-400 mb-3 shadow-[0_0_20px_rgba(6,182,212,0.15)]">
                <HardDrive className="h-7 w-7 opacity-70" />
              </div>
              <h4 className="text-sm font-bold text-white mb-1">Riwayat Masih Kosong</h4>
              <p className="text-xs text-slate-400 max-w-sm leading-relaxed">
                Setiap kali Anda mengunduh video atau musik, berkasnya otomatis tersimpan di sini
                secara offline selama 24 jam. Anda dapat langsung menyimpannya ke galeri perangkat
                kapan saja tanpa unduh ulang!
              </p>
            </div>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className="p-3 sm:p-3.5 rounded-2xl bg-[#081735]/90 border border-blue-900/70 hover:border-cyan-500/50 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 group shadow-md shadow-black/40"
              >
                {/* Media details */}
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  {/* Thumbnail / Icon */}
                  <div className="relative w-20 h-16 sm:w-24 sm:h-18 rounded-xl overflow-hidden bg-slate-900 border border-cyan-500/30 shrink-0 group-hover:border-cyan-400/70 transition-colors">
                    {item.thumbnail ? (
                      <img
                        src={item.thumbnail}
                        alt={item.title}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-slate-900 text-slate-600">
                        {item.mediaType === 'audio' ? (
                          <Music className="h-6 w-6" />
                        ) : item.mediaType === 'photos' ? (
                          <Images className="h-6 w-6" />
                        ) : (
                          <Film className="h-6 w-6" />
                        )}
                      </div>
                    )}

                    {/* Media Type Overlay */}
                    <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-xs text-[10px] font-bold text-white flex items-center gap-1">
                      {item.mediaType === 'audio' ? (
                        <Music className="h-2.5 w-2.5 text-cyan-400" />
                      ) : item.mediaType === 'photos' ? (
                        <Images className="h-2.5 w-2.5 text-pink-400" />
                      ) : (
                        <Film className="h-2.5 w-2.5 text-blue-400" />
                      )}
                      <span>{item.extension.toUpperCase()}</span>
                    </div>
                  </div>

                  {/* Text details */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap mb-1">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${getPlatformBadge(
                          item.platform
                        )}`}
                      >
                        {item.platform}
                      </span>
                      <span className="px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-cyan-950/80 border border-cyan-500/30 text-cyan-300">
                        {item.resolution || item.quality}
                      </span>
                      {item.filesize && (
                        <span className="text-[10px] text-slate-400 font-mono">
                          {item.filesize}
                        </span>
                      )}
                    </div>

                    <h4
                      className="text-xs sm:text-sm font-bold text-white truncate group-hover:text-cyan-300 transition-colors"
                      title={item.title}
                    >
                      {item.title}
                    </h4>

                    <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                      <span>{item.author}</span>
                      <span>·</span>
                      <span>{new Date(item.downloadedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  {/* Preview / Play button */}
                  {item.blob && (item.mediaType === 'video' || item.mediaType === 'audio') && (
                    <button
                      type="button"
                      onClick={() => handleOpenPreview(item)}
                      title="Putar Pratinjau Berkas"
                      className="h-9 px-2.5 rounded-xl bg-[#0c224a] hover:bg-[#12316b] border border-blue-800 hover:border-cyan-400 text-cyan-300 hover:text-white flex items-center gap-1.5 text-xs font-semibold cursor-pointer transition-all"
                    >
                      <Play className="h-3.5 w-3.5 fill-current" />
                      <span className="hidden sm:inline">Putar</span>
                    </button>
                  )}

                  {/* Primary Save to Gallery Button */}
                  <button
                    type="button"
                    onClick={() => handleSaveToDevice(item)}
                    title="Simpan langsung ke Galeri / Folder Download tanpa kuota"
                    className="h-9 px-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-cyan-500/30 hover:shadow-cyan-500/50 cursor-pointer transition-all active:scale-95"
                  >
                    <HardDrive className="h-3.5 w-3.5" />
                    <span>Simpan ke Galeri</span>
                  </button>

                  {/* Delete individual item */}
                  <button
                    type="button"
                    onClick={() => handleDeleteItem(item.id)}
                    title="Hapus dari Riwayat"
                    className="w-9 h-9 rounded-xl bg-slate-900/80 hover:bg-red-950/50 border border-slate-700/60 hover:border-red-500/50 text-slate-400 hover:text-red-400 flex items-center justify-center cursor-pointer transition-all"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Video / Audio Preview Overlay */}
        {previewItem && (
          <div className="absolute inset-0 z-50 rounded-3xl bg-slate-950/95 p-4 flex flex-col justify-between border border-cyan-400 animate-in fade-in">
            <div className="flex items-center justify-between pb-2 border-b border-blue-900/60">
              <div className="min-w-0 flex-1 pr-2">
                <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider block">
                  Pratinjau Berkas Offline Lokal
                </span>
                <h4 className="text-xs sm:text-sm font-bold text-white truncate">
                  {previewItem.item.title}
                </h4>
              </div>
              <button
                type="button"
                onClick={closePreview}
                className="w-7 h-7 rounded-lg bg-slate-800 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 flex items-center justify-center p-2 min-h-0">
              {previewItem.item.mediaType === 'audio' ? (
                <div className="w-full max-w-md p-6 rounded-2xl bg-[#09152e] border border-cyan-500/40 text-center space-y-4">
                  <div className="w-16 h-16 mx-auto rounded-full bg-cyan-950 border border-cyan-400 flex items-center justify-center text-cyan-400">
                    <Music className="h-8 w-8" />
                  </div>
                  <div>
                    <h5 className="text-sm font-bold text-white">{previewItem.item.title}</h5>
                    <p className="text-xs text-slate-400">{previewItem.item.author}</p>
                  </div>
                  <audio
                    src={previewItem.url}
                    controls
                    autoPlay
                    className="w-full mt-2 accent-cyan-400"
                  />
                </div>
              ) : (
                <video
                  src={previewItem.url}
                  controls
                  autoPlay
                  className="max-h-[50vh] max-w-full rounded-2xl border border-cyan-500/40 shadow-xl bg-black"
                />
              )}
            </div>

            <div className="pt-2 border-t border-blue-900/60 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">
                {previewItem.item.quality} · {previewItem.item.filesize}
              </span>
              <button
                type="button"
                onClick={() => handleSaveToDevice(previewItem.item)}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-cyan-500/40 cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Simpan ke Galeri Sekarang</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
