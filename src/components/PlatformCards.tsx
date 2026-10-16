import React, { useState, useEffect } from 'react';
import { ChevronDown, Check, Sparkles, X, Layers, Zap } from 'lucide-react';
import type { PlatformType } from '../types/index.ts';

interface PlatformCardsProps {
  selectedPlatform: PlatformType;
  onSelectPlatform: (platform: PlatformType) => void;
  isAutoDetected?: boolean;
}

export const PlatformCards: React.FC<PlatformCardsProps> = ({
  selectedPlatform,
  onSelectPlatform,
  isAutoDetected = false
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const platforms = [
    {
      id: 'youtube' as PlatformType,
      name: 'YouTube',
      subtitle: 'Video hingga 4K UHD & Audio MP3 320 kbps jernih',
      badge: '4K & Audio 320k',
      accentColor: 'border-red-500/60 shadow-red-500/20 hover:border-red-400',
      activeRing: 'ring-2 ring-red-500 bg-red-950/30 border-red-500',
      icon: (
        <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-red-600 flex items-center justify-center shadow-lg shadow-red-600/40 shrink-0">
          <svg className="w-6 h-6 text-white fill-current" viewBox="0 0 24 24">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
          </svg>
        </div>
      )
    },
    {
      id: 'tiktok' as PlatformType,
      name: 'TikTok',
      subtitle: 'Video HD Tanpa Watermark & Koleksi Foto Slide ZIP',
      badge: 'No Watermark & ZIP',
      accentColor: 'border-cyan-500/60 shadow-cyan-500/20 hover:border-cyan-400',
      activeRing: 'ring-2 ring-cyan-400 bg-cyan-950/30 border-cyan-400',
      icon: (
        <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-black flex items-center justify-center border border-slate-700 shadow-lg shadow-cyan-500/20 shrink-0">
          <svg className="w-6 h-6" viewBox="0 0 24 24">
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
      id: 'facebook' as PlatformType,
      name: 'Facebook',
      subtitle: 'Video Publik HD 1080p, Reels & Ekstrak Audio MP3',
      badge: 'Full HD & Reels',
      accentColor: 'border-blue-500/60 shadow-blue-500/20 hover:border-blue-400',
      activeRing: 'ring-2 ring-blue-500 bg-blue-950/30 border-blue-500',
      icon: (
        <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-[#1877F2] flex items-center justify-center shadow-lg shadow-blue-500/40 shrink-0">
          <svg className="w-6 h-6 text-white fill-current" viewBox="0 0 24 24">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
          </svg>
        </div>
      )
    },
    {
      id: 'instagram' as PlatformType,
      name: 'Instagram',
      subtitle: 'Reels Resolusi Penuh, Postingan Carousel & Audio',
      badge: 'Reels & Carousel',
      accentColor: 'border-pink-500/60 shadow-pink-500/20 hover:border-pink-400',
      activeRing: 'ring-2 ring-pink-500 bg-pink-950/30 border-pink-500',
      icon: (
        <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888] flex items-center justify-center shadow-lg shadow-pink-500/40 shrink-0">
          <svg className="w-6 h-6 text-white fill-current" viewBox="0 0 24 24">
            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
          </svg>
        </div>
      )
    },
    {
      id: 'pinterest' as PlatformType,
      name: 'Pinterest',
      subtitle: 'Video MP4 1080p & Foto Ultra HD Original 4K',
      badge: 'Video & Foto 4K',
      accentColor: 'border-rose-600/60 shadow-rose-600/20 hover:border-rose-500',
      activeRing: 'ring-2 ring-rose-500 bg-rose-950/30 border-rose-500',
      icon: (
        <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-[#E60023] flex items-center justify-center shadow-lg shadow-rose-600/40 shrink-0">
          <svg className="w-6 h-6 text-white fill-current" viewBox="0 0 24 24">
            <path d="M12 0C5.373 0 0 5.372 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 0 1 .083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12 0-6.628-5.373-12-12-12z"/>
          </svg>
        </div>
      )
    }
  ];

  const currentPlatformObj = platforms.find((p) => p.id === selectedPlatform) || platforms[0];

  return (
    <div className="w-full flex flex-col sm:flex-row items-center justify-between gap-2.5">
      {/* The ONE futuristic Action Button: 'Pilih Aplikasi Tautan' */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="group relative w-full sm:w-auto flex items-center justify-between gap-3 px-4 sm:px-5 py-2.5 sm:py-3 rounded-2xl bg-gradient-to-r from-[#0a1838] via-[#0e265c] to-[#0a1838] border border-cyan-500/50 hover:border-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.18)] hover:shadow-[0_0_28px_rgba(6,182,212,0.4)] transition-all cursor-pointer text-left"
        title="Klik untuk memilih platform manual atau lihat daftar aplikasi yang didukung"
      >
        <div className="flex items-center gap-3">
          <div className="scale-90 group-hover:scale-100 transition-transform">
            {currentPlatformObj.icon}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 font-mono">
                Aplikasi Aktif
              </span>
              {isAutoDetected && (
                <span className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-400 bg-emerald-950/80 px-1.5 py-0.2 rounded border border-emerald-700/60">
                  <Sparkles className="h-2.5 w-2.5" />
                  Auto
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm sm:text-base font-extrabold text-white tracking-tight">
                {currentPlatformObj.name}
              </span>
              <span className="text-[11px] text-slate-400 hidden xs:inline">
                ({currentPlatformObj.badge})
              </span>
            </div>
          </div>
        </div>

        {/* Action Badge */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-950/80 group-hover:bg-cyan-900/90 border border-cyan-500/40 text-cyan-300 text-xs font-bold transition-all shadow-inner shrink-0">
          <Layers className="h-3.5 w-3.5 text-cyan-400" />
          <span className="hidden sm:inline">Pilih Aplikasi Tautan</span>
          <span className="sm:hidden">Pilih</span>
          <ChevronDown className="h-3.5 w-3.5 group-hover:translate-y-0.5 transition-transform" />
        </div>
      </button>

      {/* Auto-Detection Status Helper */}
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/60 border border-blue-900/40 text-[11px] text-slate-300">
        <Zap className="h-3.5 w-3.5 text-amber-400 shrink-0 animate-pulse" />
        <span>
          <strong className="text-cyan-300">Tempel URL</strong> otomatis mendeteksi YouTube, TikTok, FB, IG, & Pinterest
        </span>
      </div>

      {/* FLOATING SELECTOR MODAL (Bener-bener mengambang tanpa kepotong UI) */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setIsOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="relative w-full max-w-xl rounded-3xl p-5 sm:p-7 bg-[#07132e]/95 border-2 border-cyan-500/50 shadow-[0_0_50px_rgba(6,182,212,0.3)] transition-all scale-100 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-4 border-b border-cyan-900/50">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-xl bg-cyan-950/80 border border-cyan-500/50 flex items-center justify-center text-cyan-400">
                    <Layers className="h-4 w-4" />
                  </div>
                  <h2 className="text-base sm:text-lg font-extrabold text-white tracking-tight">
                    Pilih Aplikasi Tautan
                  </h2>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Sentuh salah satu platform untuk memilihnya secara instan.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="h-8 w-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-white bg-slate-900/80 hover:bg-slate-800 transition-colors shrink-0"
                aria-label="Tutup pemilih aplikasi"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Smart Auto-Detect Info Banner */}
            <div className="my-4 p-3 rounded-2xl bg-cyan-950/40 border border-cyan-800/60 flex items-start gap-2.5">
              <Sparkles className="h-4 w-4 text-cyan-400 shrink-0 mt-0.5" />
              <div className="text-[11px] text-slate-300 leading-relaxed">
                <strong className="text-cyan-300">Tanpa memilih pun bisa!</strong> Cukup tempelkan tautan video atau audio apa saja di halaman utama, DownloaderZero akan mengenali dan memilih aplikasinya secara otomatis.
              </div>
            </div>

            {/* Platform Grid (One-Tap Selection: langsung kepilih & modal tertutup otomatis) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {platforms.map((p) => {
                const isActive = selectedPlatform === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      onSelectPlatform(p.id);
                      setIsOpen(false);
                    }}
                    className={`flex items-start gap-3.5 p-3.5 rounded-2xl transition-all cursor-pointer text-left border ${
                      isActive
                        ? p.activeRing + ' shadow-[0_0_20px_rgba(6,182,212,0.3)]'
                        : `bg-[#0a1b3d]/70 hover:bg-[#0f285a] ${p.accentColor}`
                    }`}
                  >
                    {p.icon}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span className="text-sm font-bold text-white tracking-tight">
                          {p.name}
                        </span>
                        {isActive ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-cyan-300 bg-cyan-950/90 px-2 py-0.5 rounded-full border border-cyan-500/60">
                            <Check className="h-3 w-3 stroke-[3]" />
                            Terpilih
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold text-slate-400 bg-slate-900/60 px-1.5 py-0.5 rounded border border-slate-800">
                            {p.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-300 line-clamp-2 leading-relaxed">
                        {p.subtitle}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Modal Bottom Note */}
            <div className="mt-4 pt-3 border-t border-cyan-900/40 flex items-center justify-between text-[11px] text-slate-400">
              <span>DownloaderZero Multi-Engine v2026.1</span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-cyan-400 hover:text-cyan-300 font-semibold"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
