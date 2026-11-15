import React, { useEffect, useState } from 'react';
import { X, Moon, Sun, Shield, Server, CheckCircle2, Check, Key } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { ServerMode } from '../types/index.ts';

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
  const [serverMode, setServerMode] = useState<ServerMode>(() => {
    try {
      const saved = localStorage.getItem('dz_server_mode');
      if (saved === 'server1' || saved === 'server2' || saved === 'auto') {
        return saved;
      }
      return 'auto';
    } catch {
      return 'auto';
    }
  });

  const [apiKey, setApiKey] = useState<string>(() => {
    try {
      return localStorage.getItem('dz_neoxr_api_key') || '';
    } catch {
      return '';
    }
  });
  const [keySaved, setKeySaved] = useState<boolean>(false);
  const [showApiInfo, setShowApiInfo] = useState<boolean>(false);

  const handleSelectMode = (mode: ServerMode) => {
    setServerMode(mode);
    if (mode !== 'server1') {
      setShowApiInfo(false);
    }
    try {
      localStorage.setItem('dz_server_mode', mode);
      window.dispatchEvent(new CustomEvent('dz_server_mode_changed', { detail: mode }));
    } catch {}
  };

  const handleSaveApiKey = () => {
    try {
      const trimmed = apiKey.trim();
      if (trimmed) {
        localStorage.setItem('dz_neoxr_api_key', trimmed);
      } else {
        localStorage.removeItem('dz_neoxr_api_key');
      }
      setKeySaved(true);
      setTimeout(() => setKeySaved(false), 2000);
    } catch {}
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const serverOptions: Array<{ id: ServerMode; label: string; badge: string }> = [
    { id: 'auto', label: 'Otomatis', badge: 'Rekomendasi' },
    { id: 'server1', label: 'Server 1', badge: 'Utama' },
    { id: 'server2', label: 'Server 2', badge: 'Alternatif' }
  ];

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
          <motion.div
            key="settings-modal-card"
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-lg rounded-3xl p-6 sm:p-7 bg-white/95 dark:bg-[#07132e]/95 border border-slate-300 dark:border-slate-700/80 shadow-2xl shadow-slate-900/10 dark:shadow-black/85 text-slate-900 dark:text-white max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800/80">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-xl bg-sky-100 dark:bg-cyan-950/60 border border-sky-300 dark:border-cyan-800/60 flex items-center justify-center text-cyan-600 dark:text-cyan-400">
                  <Sun className="h-4 w-4" />
                </div>
                <div>
                  <h2 id="settings-title" className="text-base font-bold text-slate-900 dark:text-white leading-tight">
                    Pengaturan
                  </h2>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    DownloaderZero (DZ) · Engine v2026.1
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="h-8 w-8 rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white bg-slate-100 dark:bg-slate-900/60 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                aria-label="Tutup pengaturan"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="py-5 space-y-4">
              {/* 1. Server Selection (Horizontal) */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-blue-900/50 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-xs">
                    <Server className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
                    <span>Pilihan Server Unduhan</span>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-800/60 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Langsung Aktif
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {serverOptions.map((opt) => {
                    const isSelected = serverMode === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handleSelectMode(opt.id)}
                        className={`p-2.5 rounded-xl text-left border cursor-pointer flex flex-col gap-1 min-w-0 ${
                          isSelected
                            ? 'bg-cyan-50 dark:bg-cyan-950/50 border-cyan-500 dark:border-cyan-400 text-slate-900 dark:text-white'
                            : 'bg-white dark:bg-slate-950/60 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-bold truncate">{opt.label}</span>
                          <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${
                            isSelected ? 'border-cyan-500 bg-cyan-500 text-white' : 'border-slate-400 dark:border-slate-600'
                          }`}>
                            {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                          </span>
                        </div>
                        <span className="text-[9px] font-semibold text-slate-500 dark:text-slate-400">
                          {opt.badge}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Server 1 Optional API Key */}
                {serverMode === 'server1' && (
                  <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Key className="w-3.5 h-3.5 text-amber-500" />
                      <label htmlFor="modal-server1-key" className="text-xs font-bold text-slate-900 dark:text-white">
                        API Key Server 1
                      </label>
                      <span className="text-sm font-extrabold text-amber-600 dark:text-amber-400">
                        (Opsional)
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowApiInfo((prev) => !prev)}
                        aria-label="Penjelasan API Key Server 1"
                        className="w-5 h-5 rounded-full border border-slate-400 dark:border-slate-600 text-slate-600 dark:text-slate-300 flex items-center justify-center text-[11px] font-bold cursor-pointer"
                      >
                        ?
                      </button>
                    </div>

                    {showApiInfo && (
                      <div className="p-2.5 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed">
                        API Key ini bersifat opsional. Server 1 tetap dapat digunakan tanpa mengisinya, namun Anda bisa menambahkan API Key pribadi untuk kuota sendiri. Untuk mendapatkan API Key klik{' '}
                        <a
                          href="https://api.neoxr.eu"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-bold text-sky-600 dark:text-cyan-400 underline underline-offset-2"
                        >
                          disini
                        </a>
                        .
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <input
                        id="modal-server1-key"
                        type="text"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="Masukkan API Key..."
                        className="flex-1 h-9 px-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
                      />
                      <button
                        type="button"
                        onClick={handleSaveApiKey}
                        className="h-9 px-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs cursor-pointer"
                      >
                        {keySaved ? 'Tersimpan' : 'Simpan'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* 2. Theme Toggle */}
              <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800">
                <div className="space-y-0.5">
                  <span className="text-sm font-semibold text-slate-900 dark:text-white block">
                    Tema Tampilan
                  </span>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Mode saat ini: <strong className="text-cyan-600 dark:text-cyan-400">{isDark ? 'Mode Gelap' : 'Mode Terang'}</strong>
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
                      <span>Terang</span>
                    </>
                  ) : (
                    <>
                      <Moon className="h-4 w-4 text-cyan-600 dark:text-cyan-500" />
                      <span>Gelap</span>
                    </>
                  )}
                </button>
              </div>

              {/* 3. S&K Link */}
              <div className="p-4 rounded-2xl bg-sky-50 dark:bg-cyan-950/40 border border-sky-200 dark:border-cyan-800/60">
                <div className="flex items-start gap-3">
                  <Shield className="h-5 w-5 text-cyan-600 dark:text-cyan-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-300 block">
                      Ketentuan Layanan & Privasi
                    </span>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      Penggunaan downloader tunduk pada aturan platform.{' '}
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenTerms();
                        }}
                        className="font-bold text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 underline underline-offset-2 transition-colors cursor-pointer"
                      >
                        Baca Syarat & Ketentuan (S&K)
                      </button>
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800/80 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 text-xs font-bold text-white bg-slate-800 hover:bg-slate-700 rounded-xl active:scale-[0.96] transition-all cursor-pointer"
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
