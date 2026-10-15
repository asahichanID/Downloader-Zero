import React, { useEffect } from 'react';
import { X, Moon, Sun, Shield, Server, CheckCircle2, Info } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenTerms: () => void;
  isDark: boolean;
  toggleTheme: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onOpenTerms,
  isDark,
  toggleTheme
}) => {
  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
    >
      {/* Modal Card - Exactly Center */}
      <div
        className="relative w-full max-w-lg rounded-3xl p-6 sm:p-8 glass-panel border border-slate-700/80 light:border-slate-300 shadow-2xl transition-all scale-100"
        onClick={(e) => e.stopPropagation()} // Prevent outside click close when clicking inside
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800/80 light:border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-cyan-950/60 border border-cyan-800/60 flex items-center justify-center text-cyan-400">
              <Sun className="h-4 w-4" />
            </div>
            <div>
              <h2 id="settings-title" className="text-base font-bold text-white light:text-slate-900 leading-tight">
                Pengaturan Aplikasi
              </h2>
              <span className="text-[11px] text-slate-400 light:text-slate-500">
                DownloaderZero (DZ) · Engine v2026.1
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-white light:hover:text-slate-900 bg-slate-900/60 light:bg-slate-100 hover:bg-slate-800 transition-colors"
            aria-label="Tutup pengaturan"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="py-6 space-y-6">
          {/* 1. Theme Toggle (Light / Dark) */}
          <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-900/70 light:bg-slate-100 border border-slate-800 light:border-slate-200">
            <div className="space-y-0.5">
              <span className="text-sm font-semibold text-white light:text-slate-900 block">
                Tema Tampilan
              </span>
              <p className="text-xs text-slate-400 light:text-slate-600">
                Mode saat ini: <strong className="text-cyan-400">{isDark ? 'Mode Gelap (Cyber Dark)' : 'Mode Terang (Clean Light)'}</strong>
              </p>
            </div>

            <button
              type="button"
              onClick={toggleTheme}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 light:bg-white light:border light:border-slate-300 light:hover:bg-slate-50 text-white light:text-slate-900 transition-all shadow-sm"
            >
              {isDark ? (
                <>
                  <Sun className="h-4 w-4 text-amber-400" />
                  <span>Ubah ke Terang</span>
                </>
              ) : (
                <>
                  <Moon className="h-4 w-4 text-cyan-500" />
                  <span>Ubah ke Gelap</span>
                </>
              )}
            </button>
          </div>

          {/* 2. Bright Blue S&K Link (Mandatory Requirement) */}
          <div className="p-4 rounded-2xl bg-cyan-950/40 border border-cyan-800/60">
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-cyan-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="text-xs font-semibold text-slate-300 light:text-slate-700 block">
                  Ketentuan Layanan & Hak Cipta
                </span>
                <p className="text-xs text-slate-400 light:text-slate-600 leading-relaxed">
                  Penggunaan scraper tunduk pada aturan platform & fair use.{' '}
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenTerms();
                    }}
                    className="font-bold text-cyan-400 hover:text-cyan-300 underline underline-offset-2 transition-colors cursor-pointer"
                  >
                    Baca Syarat & Ketentuan (S&K)
                  </button>{' '}
                  serta kebijakan privasi kami.
                </p>
              </div>
            </div>
          </div>

          {/* 3. Vercel Serverless Architecture Note */}
          <div className="p-4 rounded-2xl bg-slate-900/40 light:bg-slate-50 border border-slate-800 light:border-slate-200 text-xs text-slate-400 light:text-slate-600 space-y-2">
            <div className="flex items-center gap-2 text-slate-300 light:text-slate-800 font-semibold">
              <Server className="h-4 w-4 text-cyan-400" />
              <span>Kompatibilitas Cloud & Vercel</span>
            </div>
            <p className="leading-relaxed text-[11px]">
              Aplikasi ini 100% kompatibel dengan arsitektur Vercel Serverless Functions (`/api/extract` & `/api/proxy-download`). Scraper menggunakan koneksi REST ringan tanpa ketergantungan pada proses FFmpeg lokal yang berat sehingga selalu stabil dan cepat.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-slate-800/80 light:border-slate-200 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold text-white bg-slate-800 hover:bg-slate-700 light:bg-slate-200 light:text-slate-900 light:hover:bg-slate-300 rounded-xl transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
