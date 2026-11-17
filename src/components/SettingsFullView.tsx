import React, { useState, useEffect } from 'react';
import {
  Settings,
  Moon,
  Sun,
  Key,
  Trash2,
  FileText,
  Shield,
  ArrowLeft,
  Check,
  Server,
  ChevronRight,
  ShieldCheck,
  Film,
  AlertTriangle
} from 'lucide-react';
import type { ServerMode } from '../types/index.ts';

const ADMIN_ENTER_CODE = 'AA56026';
const ADMIN_EXIT_CODE = 'AC52026';

interface SettingsFullViewProps {
  isDark: boolean;
  onToggleTheme: () => void;
  onBackToHome: () => void;
  onOpenTerms: (tab: 'terms' | 'privacy') => void;
  onClearHistory: () => void;
  serverMode?: ServerMode;
  onSelectServerMode?: (mode: ServerMode) => void;
  isServer1Limited?: boolean;
  onRefreshNeoxrStatus?: (force?: boolean, customKeyOverride?: string) => Promise<boolean | void> | void;
  isAdmin?: boolean;
  onAdminAccessChange?: (active: boolean, openPanel?: boolean) => void;
  onOpenAdmin?: () => void;
  bannerAlwaysPlay?: boolean;
  onToggleBannerAlwaysPlay?: () => void;
}

export const SettingsFullView: React.FC<SettingsFullViewProps> = React.memo(({
  isDark,
  onToggleTheme,
  onBackToHome,
  onOpenTerms,
  onClearHistory,
  serverMode = 'auto',
  onSelectServerMode,
  isServer1Limited = false,
  onRefreshNeoxrStatus,
  isAdmin = false,
  onAdminAccessChange,
  onOpenAdmin,
  bannerAlwaysPlay = true,
  onToggleBannerAlwaysPlay
}) => {
  const [currentMode, setCurrentMode] = useState<ServerMode>(() => {
    try {
      const saved = localStorage.getItem('dz_server_mode');
      if (saved === 'server1' || saved === 'server2' || saved === 'auto') {
        return saved;
      }
      return serverMode || 'auto';
    } catch {
      return serverMode || 'auto';
    }
  });

  const [apiKey, setApiKey] = useState<string>(() => {
    try {
      return localStorage.getItem('dz_neoxr_api_key') || '';
    } catch {
      return '';
    }
  });
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [showApiInfo, setShowApiInfo] = useState<boolean>(false);
  const [historyCleared, setHistoryCleared] = useState<boolean>(false);

  useEffect(() => {
    if (serverMode && serverMode !== currentMode) {
      setCurrentMode(serverMode);
    }
  }, [serverMode]);

  const handleSelectMode = (mode: ServerMode) => {
    setCurrentMode(mode);
    if (mode !== 'server1') {
      setShowApiInfo(false);
    }
    try {
      localStorage.setItem('dz_server_mode', mode);
      window.dispatchEvent(new CustomEvent('dz_server_mode_changed', { detail: mode }));
    } catch {}
    if (onSelectServerMode) {
      onSelectServerMode(mode);
    }
  };

  const handleSaveApiKey = () => {
    try {
      const trimmed = apiKey.trim();

      // Kode khusus akses admin (tidak pernah disimpan sebagai API key)
      if (trimmed === ADMIN_ENTER_CODE) {
        localStorage.setItem('dz_admin_access', '1');
        setApiKey(localStorage.getItem('dz_neoxr_api_key') || '');
        if (onAdminAccessChange) {
          onAdminAccessChange(true, true);
        }
        return;
      }

      if (trimmed === ADMIN_EXIT_CODE) {
        localStorage.removeItem('dz_admin_access');
        setApiKey(localStorage.getItem('dz_neoxr_api_key') || '');
        if (onAdminAccessChange) {
          onAdminAccessChange(false, false);
        }
        return;
      }

      if (trimmed) {
        localStorage.setItem('dz_neoxr_api_key', trimmed);
      } else {
        localStorage.removeItem('dz_neoxr_api_key');
      }
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2000);
      void onRefreshNeoxrStatus?.(true, trimmed);
    } catch {}
  };

  const handleClear = () => {
    onClearHistory();
    setHistoryCleared(true);
    setTimeout(() => setHistoryCleared(false), 2000);
  };

  const serverOptions: Array<{
    id: ServerMode;
    label: string;
    badge: string;
    desc: string;
  }> = [
    {
      id: 'auto',
      label: 'Otomatis',
      badge: 'Rekomendasi',
      desc: 'Prioritas S1, cadangan S2'
    },
    {
      id: 'server1',
      label: 'Server 1',
      badge: 'Utama',
      desc: 'API utama terkunci'
    },
    {
      id: 'server2',
      label: 'Server 2',
      badge: 'Alternatif',
      desc: 'API kedua terkunci'
    }
  ];

  return (
    <div className="w-full space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBackToHome}
          className="w-9 h-9 rounded-full bg-white dark:bg-slate-900/90 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white flex items-center justify-center border border-slate-200 dark:border-white/10 active:scale-95 transition-transform cursor-pointer shrink-0"
          aria-label="Kembali ke Beranda"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2 leading-tight">
            <Settings className="w-4 h-4 text-sky-600 dark:text-cyan-400" />
            <span>Pengaturan</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Atur server unduhan, tampilan, dan cache lokal
          </p>
        </div>
      </div>

      {/* 1. Pemilihan Server Unduhan (Horizontal / Menyamping) */}
      <div className="dz-card rounded-2xl p-4 space-y-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-sky-100 dark:bg-cyan-500/15 border border-sky-200 dark:border-cyan-400/30 flex items-center justify-center text-sky-600 dark:text-cyan-400 shrink-0">
              <Server className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-slate-900 dark:text-white leading-tight">
                Pilihan Server Unduhan
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Langsung aktif tanpa tombol konfirmasi
              </p>
            </div>
          </div>

          <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border shrink-0 ${
            currentMode === 'server1' && isServer1Limited
              ? 'bg-amber-100/80 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-300/70 dark:border-amber-500/30'
              : 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30'
          }`}>
            {currentMode === 'auto'
              ? 'Otomatis'
              : currentMode === 'server1'
                ? (isServer1Limited ? 'Server 1 • Limit' : 'Server 1')
                : 'Server 2'}
          </span>
        </div>

        {/* 3 Pilihan Server Menyamping */}
        <div className="grid grid-cols-3 gap-2">
          {serverOptions.map((opt) => {
            const isLimitedServer1 = opt.id === 'server1' && isServer1Limited;
            const isSelected = isLimitedServer1 ? false : currentMode === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleSelectMode(opt.id)}
                className={`p-2.5 sm:p-3 rounded-xl text-left border cursor-pointer flex flex-col justify-between gap-1.5 min-w-0 transition-colors ${
                  isLimitedServer1
                    ? 'bg-slate-100/80 dark:bg-[#040a1a]/80 hover:bg-slate-100 dark:hover:bg-[#071128] border-slate-200/80 dark:border-slate-800/80 text-slate-400 dark:text-slate-500'
                    : isSelected
                      ? 'bg-sky-50 dark:bg-cyan-950/60 border-sky-500 dark:border-cyan-400 text-slate-900 dark:text-white'
                      : 'bg-slate-50 dark:bg-[#060e22]/90 hover:bg-slate-100 dark:hover:bg-[#0a1738] border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className={`text-xs sm:text-sm font-bold truncate ${
                    isLimitedServer1
                      ? 'text-slate-400 dark:text-slate-500'
                      : isSelected
                        ? 'text-sky-700 dark:text-cyan-300'
                        : 'text-slate-900 dark:text-white'
                  }`}>
                    {opt.label}
                  </span>
                  <span className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                    isLimitedServer1
                      ? 'border-slate-300/70 dark:border-slate-700/80 opacity-60'
                      : isSelected
                        ? 'border-sky-600 dark:border-cyan-400 bg-sky-600 dark:bg-cyan-400 text-white dark:text-slate-950'
                        : 'border-slate-300 dark:border-slate-600'
                  }`}>
                    {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                  </span>
                </div>

                {isLimitedServer1 ? (
                  <div className="pt-0.5">
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-500/20 border border-amber-300/80 dark:border-amber-400/40 text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="w-3 h-3 shrink-0 stroke-[2.5]" />
                      <span className="text-[10px] font-bold">Limit</span>
                    </span>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                      opt.id === 'auto'
                        ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                        : opt.id === 'server1'
                        ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300'
                        : 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300'
                    }`}>
                      {opt.badge}
                    </span>
                    <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 leading-snug line-clamp-2">
                      {opt.desc}
                    </p>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Input API Key Server 1: Muncul tepat di bawah pilihan server saat Server 1 dipilih */}
        {currentMode === 'server1' && (
          <div className="pt-3 border-t border-slate-200 dark:border-blue-500/20 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Key className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0" />
                <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                  API Key Server 1
                </span>
                <span className="text-sm sm:text-base font-extrabold text-amber-600 dark:text-amber-400">
                  (Opsional)
                </span>
                <button
                  type="button"
                  onClick={() => setShowApiInfo((prev) => !prev)}
                  aria-label="Penjelasan API Key Server 1"
                  aria-expanded={showApiInfo}
                  className={`w-6 h-6 rounded-full border flex items-center justify-center text-xs font-bold cursor-pointer shrink-0 ${
                    showApiInfo
                      ? 'border-sky-600 dark:border-cyan-400 bg-sky-100 dark:bg-cyan-950 text-sky-700 dark:text-cyan-300'
                      : 'border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-sky-500 dark:hover:border-cyan-400'
                  }`}
                >
                  ?
                </button>
              </div>
            </div>

            {/* Penjelasan ringan & ringkas (tanpa efek berat, tidak selayar) */}
            {showApiInfo && (
              <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-[#050e24] border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                API Key ini bersifat opsional. Server 1 tetap dapat digunakan tanpa mengisinya, namun Anda bisa menambahkan API Key pribadi untuk memakai kuota sendiri. Untuk mendapatkan API Key klik{' '}
                <a
                  href="https://api.neoxr.eu"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-sky-600 dark:text-cyan-400 underline underline-offset-2 hover:text-sky-700 dark:hover:text-cyan-300"
                >
                  disini
                </a>
                .
              </div>
            )}

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Masukkan API Key..."
                className="flex-1 min-w-0 h-10 px-3 bg-white dark:bg-[#050e24] border border-slate-300 dark:border-blue-900/80 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 font-mono focus:outline-none focus:border-sky-500 dark:focus:border-cyan-400"
              />
              <button
                type="button"
                onClick={handleSaveApiKey}
                className="h-10 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 dark:bg-blue-600 dark:hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer active:scale-95 transition-transform shrink-0"
              >
                {isSaved && <Check className="w-4 h-4 text-emerald-300" />}
                <span>{isSaved ? 'Tersimpan' : 'Simpan'}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 2. Tampilan (Tema Tampilan & Banner Selalu Jalan tepat di bawahnya) */}
      <div className="dz-card rounded-2xl overflow-hidden divide-y divide-slate-200 dark:divide-blue-500/15">
        {/* Tema Tampilan */}
        <div className="p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-sky-100 dark:bg-blue-600/20 border border-sky-200 dark:border-blue-500/30 flex items-center justify-center text-sky-600 dark:text-cyan-400 shrink-0">
              {isDark ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white truncate">
                Tema Tampilan
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {isDark ? 'Mode Gelap' : 'Mode Terang'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onToggleTheme}
            className="px-3 py-2 rounded-xl bg-sky-50 hover:bg-sky-100 dark:bg-blue-600/25 dark:hover:bg-blue-600/40 border border-sky-200 dark:border-blue-400/40 text-sky-700 dark:text-cyan-300 font-bold text-xs flex items-center gap-1.5 cursor-pointer active:scale-95 transition-transform shrink-0"
          >
            {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            <span>{isDark ? 'Terang' : 'Gelap'}</span>
          </button>
        </div>

        {/* Banner Selalu Jalan (On/Off Toggle tepat di bawah Tema Tampilan) */}
        <div className="p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-sky-100 dark:bg-cyan-500/15 border border-sky-200 dark:border-cyan-400/30 flex items-center justify-center text-sky-600 dark:text-cyan-400 shrink-0">
              <Film className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white truncate">
                Banner Selalu Jalan
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {bannerAlwaysPlay
                  ? 'Aktif • Video banner terus diputar'
                  : 'Nonaktif • Video jeda saat tidak terlihat'}
              </p>
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={bannerAlwaysPlay}
            aria-label="Banner Selalu Jalan"
            onClick={onToggleBannerAlwaysPlay}
            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors duration-150 cursor-pointer ${
              bannerAlwaysPlay
                ? 'bg-sky-600 dark:bg-cyan-500 border-sky-500 dark:border-cyan-400'
                : 'bg-slate-200 dark:bg-slate-800 border-slate-300 dark:border-slate-700'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-150 ${
                bannerAlwaysPlay ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* 3. Bersihkan Riwayat */}
      <div className="dz-card rounded-2xl p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-red-100 dark:bg-red-600/20 border border-red-200 dark:border-red-500/30 flex items-center justify-center text-red-600 dark:text-red-400 shrink-0">
            <Trash2 className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white truncate">
              Riwayat Unduhan
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              Hapus cache lokal
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleClear}
          className="px-3 py-2 rounded-xl bg-red-50 hover:bg-red-100 dark:bg-red-950/60 dark:hover:bg-red-900/60 border border-red-200 dark:border-red-700/50 text-red-600 dark:text-red-300 font-semibold text-xs cursor-pointer active:scale-95 transition-transform shrink-0"
        >
          {historyCleared ? 'Bersih!' : 'Bersihkan'}
        </button>
      </div>

      {/* Administrasi (Hanya tampil saat mode admin aktif, sejajar dengan kartu pengaturan lain) */}
      {isAdmin && (
        <button
          type="button"
          onClick={onOpenAdmin}
          className="w-full dz-card rounded-2xl p-4 flex items-center justify-between gap-3 text-left cursor-pointer active:scale-[0.99] transition-transform"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-sky-100 dark:bg-cyan-500/15 border border-sky-200 dark:border-cyan-400/30 flex items-center justify-center text-sky-600 dark:text-cyan-400 shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white truncate">
                Administrasi
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                Panel khusus administrator
              </p>
            </div>
          </div>

          <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
        </button>
      )}

      {/* 3. Kebijakan & Informasi */}
      <div className="dz-card rounded-2xl overflow-hidden divide-y divide-slate-200 dark:divide-blue-500/15">
        <div className="px-4 py-2.5">
          <h3 className="font-bold text-[11px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Kebijakan & Informasi
          </h3>
        </div>

        <button
          type="button"
          onClick={() => onOpenTerms('terms')}
          className="w-full px-4 py-3 hover:bg-slate-50 dark:hover:bg-white/5 flex items-center justify-between text-left cursor-pointer transition-colors"
        >
          <span className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2.5">
            <FileText className="w-4 h-4 text-sky-600 dark:text-cyan-400" />
            <span>Ketentuan Layanan (Terms of Service)</span>
          </span>
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </button>

        <button
          type="button"
          onClick={() => onOpenTerms('privacy')}
          className="w-full px-4 py-3 hover:bg-slate-50 dark:hover:bg-white/5 flex items-center justify-between text-left cursor-pointer transition-colors"
        >
          <span className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2.5">
            <Shield className="w-4 h-4 text-sky-600 dark:text-cyan-400" />
            <span>Kebijakan Privasi (Privacy Policy)</span>
          </span>
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      {/* 4. Info Versi Ringkas */}
      <div className="px-4 py-3 rounded-2xl bg-white/70 dark:bg-[#07132e] border border-slate-200 dark:border-blue-500/15 text-center text-xs text-slate-500 dark:text-slate-400">
        <span className="font-bold text-slate-700 dark:text-slate-300">DownloaderZero (DZ)</span>
        <span className="mx-1.5">•</span>
        <span>Media Engine v2026.1</span>
      </div>
    </div>
  );
});
