import React, { useEffect } from 'react';
import { X, Moon, Sun, Shield, Server, CheckCircle2, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

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
  const [neoxrKey, setNeoxrKey] = React.useState<string>(() => {
    try {
      return localStorage.getItem('dz_neoxr_api_key') || '';
    } catch {
      return '';
    }
  });
  const [keySaved, setKeySaved] = React.useState<boolean>(false);

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

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="settings-modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-title"
        >
          {/* Modal Card - Exactly Center */}
          <motion.div
            key="settings-modal-card"
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-lg rounded-3xl p-6 sm:p-8 bg-white/95 dark:bg-[#07132e]/95 border border-slate-300 dark:border-slate-700/80 shadow-2xl shadow-slate-900/10 dark:shadow-black/85 text-slate-900 dark:text-white"
            onClick={(e) => e.stopPropagation()} // Prevent outside click close when clicking inside
          >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800/80">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-sky-100 dark:bg-cyan-950/60 border border-sky-300 dark:border-cyan-800/60 flex items-center justify-center text-cyan-600 dark:text-cyan-400">
              <Sun className="h-4 w-4" />
            </div>
            <div>
              <h2 id="settings-title" className="text-base font-bold text-slate-900 dark:text-white leading-tight">
                Pengaturan Aplikasi
              </h2>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                DownloaderZero (DZ) · Engine v2026.1
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white bg-slate-100 dark:bg-slate-900/60 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
            aria-label="Tutup pengaturan"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="py-6 space-y-6">
          {/* 1. Theme Toggle (Light / Dark) */}
          <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800">
            <div className="space-y-0.5">
              <span className="text-sm font-semibold text-slate-900 dark:text-white block">
                Tema Tampilan
              </span>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Mode saat ini: <strong className="text-cyan-600 dark:text-cyan-400">{isDark ? 'Mode Gelap (Cyber Dark)' : 'Mode Terang (Clean Light)'}</strong>
              </p>
            </div>

            <button
              type="button"
              onClick={toggleTheme}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-900 dark:text-white transition-all shadow-sm cursor-pointer active:scale-95"
            >
              {isDark ? (
                <>
                  <Sun className="h-4 w-4 text-amber-500" />
                  <span>Ubah ke Terang</span>
                </>
              ) : (
                <>
                  <Moon className="h-4 w-4 text-cyan-600 dark:text-cyan-500" />
                  <span>Ubah ke Gelap</span>
                </>
              )}
            </button>
          </div>

          {/* 2. Bright Blue S&K Link (Mandatory Requirement) */}
          <div className="p-4 rounded-2xl bg-sky-50 dark:bg-cyan-950/40 border border-sky-200 dark:border-cyan-800/60">
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-cyan-600 dark:text-cyan-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-300 block">
                  Ketentuan Layanan & Hak Cipta
                </span>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Penggunaan scraper tunduk pada aturan platform & fair use.{' '}
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenTerms();
                    }}
                    className="font-bold text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 underline underline-offset-2 transition-colors cursor-pointer"
                  >
                    Baca Syarat & Ketentuan (S&K)
                  </button>{' '}
                  serta kebijakan privasi kami.
                </p>
              </div>
            </div>
          </div>

          {/* 3. Neoxr API Engine Status & Custom API Key */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-blue-900/60 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-900 dark:text-white font-semibold text-xs">
                <Server className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
                <span>Mesin Utama: api.neoxr.eu</span>
              </div>
              <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-800/60 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Dual Engine Aktif
              </span>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="neoxr-key" className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block">
                API Key Neoxr (Opsional / Kustom):
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="neoxr-key"
                  type="text"
                  value={neoxrKey}
                  onChange={(e) => {
                    const val = e.target.value;
                    setNeoxrKey(val);
                    try {
                      if (val.trim()) {
                        localStorage.setItem('dz_neoxr_api_key', val.trim());
                      } else {
                        localStorage.removeItem('dz_neoxr_api_key');
                      }
                      setKeySaved(true);
                      setTimeout(() => setKeySaved(false), 2000);
                    } catch {}
                  }}
                  placeholder="Masukkan API Key Neoxr jika ada..."
                  className="flex-1 h-9 px-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
                />
                {keySaved && (
                  <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
                    Tersimpan!
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Jika Anda memiliki akun atau kuota di api.neoxr.eu, masukkan API Key di sini agar permintaan Spotify & media lainnya langsung diprioritaskan melalui jalur Neoxr Anda.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-1 text-[11px] text-slate-500 dark:text-slate-400">
              <Info className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400 shrink-0" />
              <span>Jika API Key kosong, sistem otomatis memakai server fallback berkecepatan tinggi.</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800/80 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold text-white bg-slate-800 hover:bg-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl active:scale-[0.96] transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </motion.div>
    </motion.div>
  )}
</AnimatePresence>
  );
};
