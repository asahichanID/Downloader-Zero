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

          {/* 3. Neoxr API Engine Status & Custom API Key */}
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-blue-900/60 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-white font-semibold text-xs">
                <Server className="h-4 w-4 text-cyan-400" />
                <span>Mesin Utama: api.neoxr.eu</span>
              </div>
              <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-800/60 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Dual Engine Aktif
              </span>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="neoxr-key" className="text-[11px] font-bold text-slate-300 block">
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
                  className="flex-1 h-9 px-3 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 font-mono"
                />
                {keySaved && (
                  <span className="text-[10px] font-bold text-emerald-400 shrink-0">
                    Tersimpan!
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                Jika Anda memiliki akun atau kuota di api.neoxr.eu, masukkan API Key di sini agar permintaan Spotify & media lainnya langsung diprioritaskan melalui jalur Neoxr Anda.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-1 text-[11px] text-slate-400">
              <Info className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
              <span>Jika API Key kosong, sistem otomatis memakai server fallback berkecepatan tinggi.</span>
            </div>
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
