import React, { useState, useEffect } from 'react';
import { X, ShieldCheck, Info, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { PlatformType } from '../types/index.ts';

interface SupportedPlatformsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPlatform: (platform: PlatformType) => void;
}

interface PlatformCatalogItem {
  id: PlatformType;
  name: string;
  fullTitle: string;
  desc: string;
  formats: string;
  renderLogo: (sizeClass: string, iconClass: string) => React.ReactNode;
}

const PLATFORM_CATALOG: PlatformCatalogItem[] = [
  {
    id: 'youtube',
    name: 'YouTube',
    fullTitle: 'YouTube & Shorts',
    desc: 'Unduh video reguler maupun YouTube Shorts hingga resolusi 4K / 1080p dan audio MP3 320 kbps jernih.',
    formats: 'MP4, MP3 · 4K, 2K, 1080p, 720p',
    renderLogo: (sizeClass, iconClass) => (
      <div className={`${sizeClass} rounded-2xl bg-[#FF0000] flex items-center justify-center shadow-md shadow-red-900/25`}>
        <svg className={`${iconClass} text-white fill-current`} viewBox="0 0 24 24">
          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
        </svg>
      </div>
    )
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    fullTitle: 'TikTok Video & Slides',
    desc: 'Simpan video TikTok tanpa watermark dalam kualitas HD serta koleksi slide foto (ZIP otomatis) dan suara asli.',
    formats: 'MP4 (No WM), Foto HD, ZIP, MP3',
    renderLogo: (sizeClass, iconClass) => (
      <div className={`${sizeClass} rounded-2xl bg-black flex items-center justify-center border border-slate-700 shadow-md`}>
        <svg className={iconClass} viewBox="0 0 24 24">
          <path
            fill="#25F4EE"
            d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.24 1.07-.14 1.61.24 1.25 1.2 2.23 2.41 2.45.51.1 1.04.06 1.55-.08 1.19-.34 2.05-1.43 2.15-2.67.06-2.58.03-5.16.03-7.74.01-3.62.01-7.24.01-10.86z"
          />
          <path
            fill="#FE2C55"
            d="M16.435 0c-.08 1.53.47 3.09 1.59 4.17 1.12 1.11 2.7 1.62 4.24 1.79v1.98c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93V0h-.01z"
          />
        </svg>
      </div>
    )
  },
  {
    id: 'spotify',
    name: 'Spotify',
    fullTitle: 'Spotify Music & Playlists',
    desc: 'Unduh lagu satuan, putar pratinjau playlist, atau unduh semua lagu sekaligus menjadi 1 arsip ZIP MP3 penuh lengkap dengan cover art dan metadata ID3.',
    formats: 'MP3 Lagu Penuh, ZIP Playlist, Cover Art & ID3',
    renderLogo: (sizeClass, iconClass) => (
      <div className={`${sizeClass} rounded-2xl bg-[#1DB954] flex items-center justify-center shadow-md shadow-emerald-900/25`}>
        <svg className={`${iconClass} text-black fill-current`} viewBox="0 0 24 24">
          <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.494 17.303c-.217.356-.677.469-1.033.252-2.83-1.73-6.393-2.12-10.59-1.162-.407.094-.814-.16-.907-.568-.094-.407.16-.814.568-.907 4.593-1.049 8.528-.607 11.71 1.352.356.217.469.677.252 1.033zm1.464-3.257c-.273.444-.855.586-1.299.313-3.24-1.992-8.18-2.568-12.012-1.405-.498.152-1.032-.132-1.184-.63-.152-.498.132-1.032.63-1.184 4.382-1.33 9.821-.689 13.552 1.607.444.273.586.855.313 1.299zm.126-3.398c-3.886-2.308-10.297-2.52-14.018-1.391-.595.181-1.233-.16-1.414-.755-.181-.595.16-1.233.755-1.414 4.277-1.299 11.352-1.05 15.828 1.607.534.317.708 1.01.391 1.544-.317.534-1.01.708-1.544.391z" />
        </svg>
      </div>
    )
  },
  {
    id: 'pinterest',
    name: 'Pinterest',
    fullTitle: 'Pinterest Pins, Video & Slides',
    desc: 'Simpan video pin sesuai resolusi yang dipilih serta foto satuan maupun slide carousel otomatis resolusi Ultra HD asli langsung dari Pinterest.',
    formats: 'MP4 Multi-Resolusi, Foto & Slide Ultra HD, MP3 Audio',
    renderLogo: (sizeClass, iconClass) => (
      <div className={`${sizeClass} rounded-2xl bg-[#E60023] flex items-center justify-center shadow-md shadow-red-900/25`}>
        <svg className={`${iconClass} text-white fill-current`} viewBox="0 0 24 24">
          <path d="M12 0C5.373 0 0 5.372 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 0 1 .083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12 0-6.628-5.373-12-12-12z" />
        </svg>
      </div>
    )
  },
  {
    id: 'terabox',
    name: 'Terabox',
    fullTitle: 'TeraBox Cloud Links',
    desc: 'Ambil dan unduh hingga 2 berkas sekaligus dari tautan berbagi TeraBox secara langsung tanpa batas.',
    formats: 'Berkas Asli Cloud (Video, Dokumen, Arsip)',
    renderLogo: (sizeClass, iconClass) => (
      <div className={`${sizeClass} rounded-2xl bg-[#0086FF] flex items-center justify-center shadow-md shadow-blue-900/25`}>
        <svg className={`${iconClass} text-white fill-current`} viewBox="0 0 24 24">
          <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z" />
        </svg>
      </div>
    )
  },
  {
    id: 'instagram',
    name: 'Instagram',
    fullTitle: 'Instagram Reels & Carousel',
    desc: 'Unduh video Reels, postingan video feed, serta seluruh foto slide carousel berkualitas tinggi.',
    formats: 'MP4 Reels, Foto Carousel HD, MP3 Audio',
    renderLogo: (sizeClass, iconClass) => (
      <div className={`${sizeClass} rounded-2xl bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888] flex items-center justify-center shadow-md shadow-pink-900/25`}>
        <svg className={`${iconClass} text-white fill-current`} viewBox="0 0 24 24">
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
        </svg>
      </div>
    )
  },
  {
    id: 'facebook',
    name: 'Facebook',
    fullTitle: 'Facebook Watch & Reels',
    desc: 'Simpan video publik Facebook Watch maupun Reels dengan pilihan kualitas HD hingga 1080p dan audio MP3.',
    formats: 'MP4 1080p, 720p, SD, MP3 Audio',
    renderLogo: (sizeClass, iconClass) => (
      <div className={`${sizeClass} rounded-2xl bg-[#1877F2] flex items-center justify-center shadow-md shadow-blue-900/25`}>
        <svg className={`${iconClass} text-white fill-current`} viewBox="0 0 24 24">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
      </div>
    )
  },
  {
    id: 'twitter',
    name: 'Twitter (X)',
    fullTitle: 'Twitter (X) Video, Audio & Foto',
    desc: 'Unduh video dan GIF dari postingan Twitter (X) sesuai resolusi asli yang tersedia, ekstrak audio MP3 (320/256/128 kbps), serta foto resolusi penuh.',
    formats: 'MP4 Multi-Resolusi Asli, MP3 Audio, Foto HD',
    renderLogo: (sizeClass, iconClass) => (
      <div className={`${sizeClass} rounded-2xl bg-black flex items-center justify-center border border-slate-700 shadow-md`}>
        <svg className={`${iconClass} text-white fill-current`} viewBox="0 0 24 24">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      </div>
    )
  }
];

export const SupportedPlatformsModal: React.FC<SupportedPlatformsModalProps> = React.memo(({
  isOpen,
  onClose,
  onSelectPlatform
}) => {
  const [expandedId, setExpandedId] = useState<PlatformType | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setExpandedId(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const expandedPlatform = expandedId
    ? PLATFORM_CATALOG.find((item) => item.id === expandedId) || null
    : null;

  const handleSelect = (platformId: PlatformType) => {
    onSelectPlatform(platformId);
    setExpandedId(null);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg rounded-3xl bg-white dark:bg-[#081530] border border-slate-200 dark:border-blue-500/30 p-5 sm:p-6 shadow-2xl shadow-slate-900/20 dark:shadow-black/90 text-slate-900 dark:text-white max-h-[85vh] flex flex-col overflow-hidden dz-animate-scale"
      >
          {/* Header */}
          <div className="flex items-center justify-between pb-3.5 border-b border-slate-200 dark:border-blue-900/60 shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-5 bg-blue-500 rounded-full" />
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                Platform yang Didukung
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-900/80 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white flex items-center justify-center border border-slate-200 dark:border-white/10 active:scale-95 transition-transform cursor-pointer"
              aria-label="Tutup daftar platform"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 3-Column Platform Grid + Elevated Opaque Detail Layer */}
          <div className="relative flex-1 min-h-0 my-3 overflow-hidden">
            <div
              className={`h-full overflow-y-auto pr-0.5 py-1 transition-opacity duration-150 ${
                expandedPlatform ? 'pointer-events-none select-none opacity-35' : 'opacity-100'
              }`}
            >
              <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
                {PLATFORM_CATALOG.map((p) => (
                  <div
                    key={p.id}
                    className="rounded-2xl bg-slate-50 dark:bg-[#0c1a3a] border border-slate-200 dark:border-blue-500/20 p-3 flex flex-col items-center text-center"
                  >
                    {/* Logo: Tap to select platform */}
                    <button
                      type="button"
                      onClick={() => handleSelect(p.id)}
                      className="rounded-2xl active:scale-95 transition-transform cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:focus-visible:ring-cyan-400"
                      title={`Pilih ${p.name}`}
                      aria-label={`Pilih platform ${p.name}`}
                    >
                      {p.renderLogo('w-12 h-12', 'w-6 h-6')}
                    </button>

                    {/* Nama Platform */}
                    <span className="mt-2 text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate w-full">
                      {p.name}
                    </span>

                    {/* Tombol Deskripsi di bawah nama platform */}
                    <button
                      type="button"
                      onClick={() => setExpandedId(p.id)}
                      className="mt-1.5 w-full min-h-[28px] px-2 py-1 rounded-lg bg-white dark:bg-[#081530] hover:bg-sky-50 dark:hover:bg-[#102450] border border-slate-200 dark:border-blue-500/25 text-[11px] font-semibold text-sky-700 dark:text-cyan-300 flex items-center justify-center gap-1 active:scale-95 transition-colors cursor-pointer"
                    >
                      <Info className="w-3 h-3 shrink-0" />
                      <span>Deskripsi</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Elevated Spotlight Card (Opaque z-30 layer ON TOP of all platforms so nothing bleeds through) */}
            <AnimatePresence>
              {expandedPlatform && (
                <motion.div
                  key={`elevated-${expandedPlatform.id}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                  onClick={() => setExpandedId(null)}
                  className="absolute inset-0 z-30 flex items-center justify-center p-2 sm:p-3 bg-slate-900/35 dark:bg-black/65 rounded-2xl"
                >
                  <motion.div
                    initial={{ opacity: 0, scale: 0.92, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.94, y: 8 }}
                    transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full max-h-full overflow-y-auto rounded-2xl bg-white dark:bg-[#0d2049] border border-sky-300 dark:border-cyan-400/50 p-4 sm:p-5 shadow-2xl shadow-slate-950/30 dark:shadow-black/90"
                  >
                    <div className="flex items-start gap-3.5 sm:gap-4">
                      {/* Left: Logo acts as clickable Thumbnail */}
                      <button
                        type="button"
                        onClick={() => handleSelect(expandedPlatform.id)}
                        className="shrink-0 rounded-2xl active:scale-95 transition-transform cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:focus-visible:ring-cyan-400"
                        title={`Pilih ${expandedPlatform.name}`}
                        aria-label={`Pilih ${expandedPlatform.name}`}
                      >
                        {expandedPlatform.renderLogo('w-16 h-16 sm:w-20 sm:h-20', 'w-8 h-8 sm:w-10 sm:h-10')}
                      </button>

                      {/* Right: Platform title, detailed description, formats & controls */}
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white leading-snug">
                            {expandedPlatform.fullTitle}
                          </h3>
                          <button
                            type="button"
                            onClick={() => setExpandedId(null)}
                            className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-900/80 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0 cursor-pointer"
                            aria-label="Tutup deskripsi"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-200 leading-relaxed">
                          {expandedPlatform.desc}
                        </p>

                        <p className="text-[11px] font-mono text-sky-700 dark:text-cyan-300">
                          {expandedPlatform.formats}
                        </p>

                        <div className="flex items-center gap-2 pt-1.5">
                          <button
                            type="button"
                            onClick={() => handleSelect(expandedPlatform.id)}
                            className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-transform cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                            <span>Pilih {expandedPlatform.name}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setExpandedId(null)}
                            className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold cursor-pointer"
                          >
                            Tutup
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Footer Note */}
          <div className="pt-3 border-t border-slate-200 dark:border-blue-900/60 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 shrink-0">
            <span className="flex items-center gap-1.5 text-sky-600 dark:text-cyan-400 font-medium">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>Ketuk logo untuk memilih platform</span>
            </span>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs cursor-pointer"
            >
              Selesai
            </button>
          </div>
        </div>
      </div>
  );
});
