import React, { useEffect } from 'react';
import { X, Download, Check, Film, HardDrive, AlertCircle, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import bannerImage from '../assets/images/banner_dz.png';
import {
  ANIMATED_BANNER_CATALOG,
  type AnimatedBannerId,
  type BannerDownloadPhase,
  type BannerOptionId
} from '../services/bannerStorage.ts';

const BANNER_IMAGE_CDN = 'https://cdn.jsdelivr.net/gh/asahichanID/media@main/banner_dz.png';

export interface AnimatedBannerItemState {
  isDownloaded: boolean;
  url: string | null;
  sizeBytes: number | null;
  isBusy: boolean;
  phase: BannerDownloadPhase | null;
  progress: number;
  loadedBytes: number;
  totalBytes: number;
  error: string | null;
}

interface BannerSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeBanner: BannerOptionId;
  onSelectBanner: (id: BannerOptionId) => void;
  banners: Record<AnimatedBannerId, AnimatedBannerItemState>;
  onDownloadBanner: (id: AnimatedBannerId) => void;
}

function formatMegabytes(bytes: number, fallbackBytes = 12_638_536): string {
  const effective = bytes > 0 ? bytes : fallbackBytes;
  return `${(effective / (1024 * 1024)).toFixed(1)} MB`;
}

const ANIMATED_BANNER_ORDER: AnimatedBannerId[] = ['lily_wuwa', 'wuthering_waves'];

export const BannerSelectorModal: React.FC<BannerSelectorModalProps> = React.memo(({
  isOpen,
  onClose,
  activeBanner,
  onSelectBanner,
  banners,
  onDownloadBanner
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const isDefaultActive = activeBanner === 'default';
  const ringRadius = 18;
  const ringCircumference = 2 * Math.PI * ringRadius;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="banner-selector-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-labelledby="banner-selector-title"
        >
          <motion.div
            key="banner-selector-card"
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md rounded-3xl p-5 sm:p-6 bg-white dark:bg-[#07132e] border border-slate-300 dark:border-blue-500/35 shadow-2xl shadow-slate-900/20 dark:shadow-black/90 text-slate-900 dark:text-white max-h-[88vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-200 dark:border-blue-900/60">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-sky-100 dark:bg-cyan-500/15 border border-sky-200 dark:border-cyan-400/30 flex items-center justify-center text-sky-600 dark:text-cyan-400 shrink-0">
                  <Film className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h2 id="banner-selector-title" className="text-base font-bold text-slate-900 dark:text-white leading-tight truncate">
                    Banner Animasi
                  </h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    Pilih banner utama beranda
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-900/80 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white flex items-center justify-center border border-slate-200 dark:border-white/10 active:scale-95 transition-transform cursor-pointer shrink-0"
                aria-label="Tutup pilihan banner"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Banner Options List */}
            <div className="py-4 space-y-3">
              {/* OPTION 1: Default (Local PNG) */}
              <div
                onClick={() => {
                  if (!isDefaultActive) {
                    onSelectBanner('default');
                  }
                }}
                className={`rounded-2xl p-3.5 border transition-colors ${
                  isDefaultActive
                    ? 'bg-emerald-50/70 dark:bg-emerald-950/25 border-emerald-400/80 dark:border-emerald-500/50'
                    : 'bg-slate-50 dark:bg-[#0b1836] border-slate-200 dark:border-slate-800 hover:border-sky-400 dark:hover:border-cyan-400/50 cursor-pointer'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-20 h-14 rounded-xl overflow-hidden bg-slate-900 border border-slate-300/60 dark:border-white/10 shrink-0">
                    <img
                      src={bannerImage}
                      alt="Banner Default PNG"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        const img = e.currentTarget;
                        if (!img.dataset.cdnFallback) {
                          img.dataset.cdnFallback = '1';
                          img.src = BANNER_IMAGE_CDN;
                        }
                      }}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      Default
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                      Banner gambar PNG · Lokal
                    </p>
                  </div>

                  <div className="shrink-0">
                    {isDefaultActive ? (
                      <span className="inline-flex items-center gap-1 text-xs font-extrabold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                        <Check className="w-4 h-4 stroke-[2.75]" />
                        <span>Dipakai</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectBanner('default');
                        }}
                        className="min-h-[40px] px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 dark:bg-blue-600 dark:hover:bg-blue-500 text-white font-bold text-xs cursor-pointer active:scale-95 transition-transform whitespace-nowrap"
                      >
                        Pakai
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* ANIMATED BANNERS: Lily - Wuwa & Wuthering waves */}
              {ANIMATED_BANNER_ORDER.map((bannerId) => {
                const spec = ANIMATED_BANNER_CATALOG[bannerId];
                const item = banners[bannerId];
                const isReady = item.isDownloaded && Boolean(item.url);
                const isActive = activeBanner === bannerId && isReady;
                const isAdapting = item.isBusy && (item.phase === 'adapting' || item.phase === 'saving');
                const clampedPct = Math.max(0, Math.min(100, item.progress));
                const ringOffset = ringCircumference - (clampedPct / 100) * ringCircumference;
                const displaySize = formatMegabytes(
                  item.sizeBytes || item.totalBytes || spec.fallbackSizeBytes,
                  spec.fallbackSizeBytes
                );

                return (
                  <div
                    key={bannerId}
                    onClick={() => {
                      if (isReady && !isActive) {
                        onSelectBanner(bannerId);
                      }
                    }}
                    className={`rounded-2xl p-3.5 border transition-colors ${
                      isActive
                        ? 'bg-emerald-50/70 dark:bg-emerald-950/25 border-emerald-400/80 dark:border-emerald-500/50'
                        : isReady
                          ? 'bg-slate-50 dark:bg-[#0b1836] border-slate-200 dark:border-slate-800 hover:border-sky-400 dark:hover:border-cyan-400/50 cursor-pointer'
                          : 'bg-slate-50 dark:bg-[#0b1836] border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {/* Preview Thumbnail Slot */}
                      <div className="relative w-20 h-14 rounded-xl overflow-hidden bg-gradient-to-br from-[#0d1f47] via-[#132c63] to-[#08142e] border border-slate-300/60 dark:border-cyan-500/30 shrink-0 flex items-center justify-center">
                        {isReady && item.url ? (
                          <video
                            src={`${item.url}#t=1`}
                            muted
                            playsInline
                            preload="metadata"
                            disablePictureInPicture
                            className="w-full h-full object-cover object-center pointer-events-none"
                          />
                        ) : isAdapting ? (
                          <div className="flex flex-col items-center justify-center text-amber-300">
                            <Loader2 className="w-5 h-5 animate-spin" />
                            <span className="text-[8px] font-bold tracking-wide mt-0.5 uppercase">
                              16:9
                            </span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center text-cyan-300/90">
                            <Film className="w-5 h-5" />
                            <span className="text-[9px] font-bold tracking-wide mt-0.5 text-cyan-200/80">
                              MP4
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                          {spec.name}
                        </h3>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                          {item.isBusy
                            ? isAdapting
                              ? 'Menyesuaikan horizontal 16:9...'
                              : `Mengunduh · ${displaySize}`
                            : isReady
                              ? `Animasi · ${displaySize} · Data Browser`
                              : spec.needsHorizontalAdapt
                                ? `Banner Animasi · ${displaySize} · Auto Horizontal`
                                : `Banner Animasi · ${displaySize}`}
                        </p>
                      </div>

                      {/* Right Slot: Download / Circular Progress Ring / Pakai / Dipakai */}
                      <div className="shrink-0 flex items-center">
                        {isReady ? (
                          isActive ? (
                            <span className="inline-flex items-center gap-1 text-xs font-extrabold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                              <Check className="w-4 h-4 stroke-[2.75]" />
                              <span>Dipakai</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectBanner(bannerId);
                              }}
                              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 dark:bg-blue-600 dark:hover:bg-blue-500 text-white font-bold text-xs cursor-pointer active:scale-95 transition-transform whitespace-nowrap"
                            >
                              Pakai
                            </button>
                          )
                        ) : item.isBusy ? (
                          <div
                            className="relative w-12 h-12 flex items-center justify-center"
                            aria-label={`${isAdapting ? 'Menyesuaikan' : 'Mengunduh'} ${clampedPct}%`}
                          >
                            <svg className="w-12 h-12 -rotate-90" viewBox="0 0 44 44">
                              <circle
                                cx="22"
                                cy="22"
                                r={ringRadius}
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="3.5"
                                className="text-slate-200 dark:text-slate-700"
                              />
                              <circle
                                cx="22"
                                cy="22"
                                r={ringRadius}
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="3.5"
                                strokeLinecap="round"
                                strokeDasharray={ringCircumference}
                                strokeDashoffset={ringOffset}
                                className={`${
                                  isAdapting
                                    ? 'text-amber-500 dark:text-amber-400'
                                    : 'text-sky-600 dark:text-cyan-400'
                                } transition-[stroke-dashoffset] duration-150 ease-out`}
                              />
                            </svg>
                            <span className={`absolute inset-0 flex items-center justify-center text-[11px] font-extrabold font-mono tabular-nums ${
                              isAdapting
                                ? 'text-amber-600 dark:text-amber-300'
                                : 'text-sky-700 dark:text-cyan-300'
                            }`}>
                              {clampedPct}%
                            </span>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDownloadBanner(bannerId);
                            }}
                            aria-label={`Unduh banner animasi ${spec.name}`}
                            title="Unduh banner animasi dari CDN"
                            className="w-11 h-11 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 dark:from-cyan-500 dark:to-blue-600 text-white shadow-md shadow-sky-500/25 flex items-center justify-center cursor-pointer active:scale-95 transition-transform"
                          >
                            <Download className="w-5 h-5 stroke-[2.4]" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Live Download & Adaptation Progress Bar */}
                    {item.isBusy && (
                      <div className="mt-3 pt-2.5 border-t border-slate-200/80 dark:border-blue-900/50 space-y-1.5">
                        <div className="flex items-center justify-between gap-2 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                          <span className="truncate">
                            {isAdapting
                              ? 'Menyesuaikan vertikal ke horizontal (belum dapat dipakai)...'
                              : 'Mengunduh dari CDN...'}
                          </span>
                          <span className={`font-mono font-bold tabular-nums shrink-0 ${
                            isAdapting
                              ? 'text-amber-600 dark:text-amber-300'
                              : 'text-sky-700 dark:text-cyan-300'
                          }`}>
                            {isAdapting
                              ? `Konversi · ${clampedPct}%`
                              : `${item.loadedBytes > 0 ? formatMegabytes(item.loadedBytes, spec.fallbackSizeBytes) : '0.0 MB'} / ${displaySize} · ${clampedPct}%`}
                          </span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-[width] duration-150 ease-out ${
                              isAdapting
                                ? 'bg-gradient-to-r from-amber-500 via-cyan-400 to-emerald-400'
                                : 'bg-gradient-to-r from-sky-500 to-cyan-400'
                            }`}
                            style={{ width: `${clampedPct}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Download / Adaptation Error Feedback */}
                    {!item.isBusy && !isReady && item.error && (
                      <div className="mt-2.5 pt-2 border-t border-red-200/80 dark:border-red-900/40 flex items-center gap-1.5 text-[11px] text-red-600 dark:text-red-400">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{item.error}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Footer Info */}
            <div className="pt-3 border-t border-slate-200 dark:border-blue-900/60 flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 min-w-0">
                <HardDrive className="w-3.5 h-3.5 text-sky-600 dark:text-cyan-400 shrink-0" />
                <span className="truncate">
                  Banner unduhan tersimpan permanen di data internal browser
                </span>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 text-white font-bold text-xs cursor-pointer active:scale-95 transition-transform shrink-0"
              >
                Tutup
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});
