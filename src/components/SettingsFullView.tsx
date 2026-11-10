import React, { useState, useEffect } from 'react';
import { Settings, Moon, Sun, Key, Trash2, FileText, Shield, Info, ArrowLeft, Check, Sparkles, Server, Cpu, CheckCircle2 } from 'lucide-react';
import type { ServerMode } from '../types/index.ts';

interface SettingsFullViewProps {
  isDark: boolean;
  onToggleTheme: () => void;
  onBackToHome: () => void;
  onOpenTerms: (tab: 'terms' | 'privacy') => void;
  onClearHistory: () => void;
  serverMode?: ServerMode;
  onSelectServerMode?: (mode: ServerMode) => void;
}

export const SettingsFullView: React.FC<SettingsFullViewProps> = ({
  isDark,
  onToggleTheme,
  onBackToHome,
  onOpenTerms,
  onClearHistory,
  serverMode = 'auto',
  onSelectServerMode
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

  useEffect(() => {
    if (serverMode && serverMode !== currentMode) {
      setCurrentMode(serverMode);
    }
  }, [serverMode]);

  const handleSelectMode = (mode: ServerMode) => {
    setCurrentMode(mode);
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
      localStorage.setItem('dz_neoxr_api_key', apiKey.trim());
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2000);
    } catch {}
  };

  return (
    <div className="w-full space-y-4 pb-24">
      {/* View Header */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBackToHome}
          className="w-8 h-8 rounded-full bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white flex items-center justify-center border border-white/10 active:scale-90 transition-all cursor-pointer"
          aria-label="Kembali ke Beranda"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-cyan-400" />
          <h1 className="text-lg font-bold text-white">Pengaturan & Konfigurasi</h1>
        </div>
      </div>

      {/* 1. Server API Engine Selection (Server 1 & Server 2) */}
      <div className="p-4 rounded-2xl bg-[#0c1836]/90 border border-blue-500/20 space-y-3.5 shadow-lg shadow-black/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-400 shrink-0">
              <Server className="w-4 h-4 stroke-[2.2]" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-white">Pilihan Server Unduhan</h2>
              <p className="text-[11px] text-slate-400">Pilih penggunaan API utama atau API kedua</p>
            </div>
          </div>

          <span className="text-[10px] font-bold text-cyan-300 bg-cyan-950/60 px-2 py-0.5 rounded-full border border-cyan-700/60 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-cyan-400" />
            Fleksibel
          </span>
        </div>

        {/* Server Cards: Instant toggle without confirm button */}
        <div className="grid grid-cols-1 gap-2.5 pt-1">
          {/* Option A: Otomatis (Default) */}
          <button
            type="button"
            onClick={() => handleSelectMode('auto')}
            className={`w-full p-3.5 rounded-xl text-left transition-all duration-200 cursor-pointer flex items-start gap-3 border ${
              currentMode === 'auto'
                ? 'bg-gradient-to-r from-blue-950/80 to-cyan-950/70 border-cyan-400 shadow-md shadow-cyan-500/10'
                : 'bg-[#060e22]/80 hover:bg-[#0a1738]/80 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
              currentMode === 'auto' ? 'border-cyan-400 bg-cyan-500 text-slate-950' : 'border-slate-600 bg-slate-900/60'
            }`}>
              {currentMode === 'auto' && <Check className="w-3.5 h-3.5 stroke-[3]" />}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs font-bold ${currentMode === 'auto' ? 'text-cyan-300' : 'text-white'}`}>
                  Otomatis (Default)
                </span>
                <span className="text-[10px] font-semibold px-2 py-0.2 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Rekomendasi
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                Prioritas Server 1, dan otomatis beralih ke Server 2 jika terjadi gangguan pada server pertama.
              </p>
            </div>
          </button>

          {/* Option B: Server 1 */}
          <button
            type="button"
            onClick={() => handleSelectMode('server1')}
            className={`w-full p-3.5 rounded-xl text-left transition-all duration-200 cursor-pointer flex items-start gap-3 border ${
              currentMode === 'server1'
                ? 'bg-gradient-to-r from-blue-950/80 to-blue-900/50 border-blue-400 shadow-md shadow-blue-500/10'
                : 'bg-[#060e22]/80 hover:bg-[#0a1738]/80 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
              currentMode === 'server1' ? 'border-blue-400 bg-blue-500 text-white' : 'border-slate-600 bg-slate-900/60'
            }`}>
              {currentMode === 'server1' && <Check className="w-3.5 h-3.5 stroke-[3]" />}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs font-bold ${currentMode === 'server1' ? 'text-blue-300' : 'text-white'}`}>
                  Server 1
                </span>
                <span className="text-[10px] font-semibold px-2 py-0.2 rounded-md bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  Utama
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                Koneksi terkunci hanya pada Server 1 tanpa pengalihan otomatis (1 API utama).
              </p>
            </div>
          </button>

          {/* Option C: Server 2 */}
          <button
            type="button"
            onClick={() => handleSelectMode('server2')}
            className={`w-full p-3.5 rounded-xl text-left transition-all duration-200 cursor-pointer flex items-start gap-3 border ${
              currentMode === 'server2'
                ? 'bg-gradient-to-r from-purple-950/80 to-cyan-950/60 border-cyan-400 shadow-md shadow-cyan-500/10'
                : 'bg-[#060e22]/80 hover:bg-[#0a1738]/80 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
              currentMode === 'server2' ? 'border-cyan-400 bg-cyan-500 text-slate-950' : 'border-slate-600 bg-slate-900/60'
            }`}>
              {currentMode === 'server2' && <Check className="w-3.5 h-3.5 stroke-[3]" />}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs font-bold ${currentMode === 'server2' ? 'text-cyan-300' : 'text-white'}`}>
                  Server 2
                </span>
                <span className="text-[10px] font-semibold px-2 py-0.2 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  Alternatif
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                Koneksi terkunci hanya pada Server 2 (API generasi baru tanpa pengalihan otomatis).
              </p>
            </div>
          </button>
        </div>

        <div className="flex items-center gap-2 pt-1 text-[11px] text-slate-400">
          <Info className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span>Pengaturan langsung diterapkan tanpa perlu menekan tombol konfirmasi.</span>
        </div>
      </div>

      {/* 2. Theme Settings Card */}
      <div className="p-4 rounded-2xl bg-[#0c1836]/90 border border-blue-500/20 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-cyan-400">
              {isDark ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">Tema Tampilan</h3>
              <p className="text-xs text-slate-400">Pilih mode gelap atau terang</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onToggleTheme}
            className="px-3.5 py-2 rounded-xl bg-blue-600/30 hover:bg-blue-600/50 border border-blue-400/40 text-cyan-300 font-bold text-xs flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
          >
            {isDark ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            <span>{isDark ? 'Mode Gelap' : 'Mode Terang'}</span>
          </button>
        </div>
      </div>

      {/* 3. Custom Server 1 API Key Card (Clean naming - No Neo text) */}
      <div className="p-4 rounded-2xl bg-[#0c1836]/90 border border-blue-500/20 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
            <Key className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-sm text-white">Kunci API Server 1 (Opsional)</h3>
            <p className="text-xs text-slate-400 leading-relaxed mt-0.5">
              Gunakan API Key Server 1 pribadi Anda jika memiliki kuota tersendiri. Jika kosong, sistem otomatis memakai konfigurasi bawaan server.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <input
                type="text"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Masukkan API Key Server 1 jika ada..."
                className="flex-1 h-10 px-3 bg-[#050e24] border border-blue-900/80 rounded-xl text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-cyan-400"
              />
              <button
                type="button"
                onClick={handleSaveApiKey}
                className="h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
              >
                {isSaved ? <Check className="w-4 h-4 text-emerald-300" /> : null}
                <span>{isSaved ? 'Tersimpan' : 'Simpan'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Cache & Data Management */}
      <div className="p-4 rounded-2xl bg-[#0c1836]/90 border border-blue-500/20 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-600/20 border border-red-500/30 flex items-center justify-center text-red-400">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">Bersihkan Riwayat Unduhan</h3>
              <p className="text-xs text-slate-400">Hapus cache lokal IndexedDB secara manual</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClearHistory}
            className="px-3.5 py-2 rounded-xl bg-red-950/60 hover:bg-red-900/60 border border-red-700/50 text-red-300 font-semibold text-xs cursor-pointer active:scale-95 transition-all"
          >
            Bersihkan
          </button>
        </div>
      </div>

      {/* 5. Legal & Policy Links */}
      <div className="p-4 rounded-2xl bg-[#0c1836]/90 border border-blue-500/20 space-y-2">
        <h3 className="font-bold text-xs text-slate-400 uppercase tracking-wider mb-1">
          Kebijakan & Informasi
        </h3>
        <button
          type="button"
          onClick={() => onOpenTerms('terms')}
          className="w-full p-2.5 rounded-xl hover:bg-white/5 flex items-center justify-between text-left cursor-pointer transition-colors"
        >
          <span className="text-xs sm:text-sm font-semibold text-slate-200 flex items-center gap-2">
            <FileText className="w-4 h-4 text-cyan-400" />
            <span>Ketentuan Layanan (Terms of Service)</span>
          </span>
          <span className="text-xs text-slate-500">Lihat</span>
        </button>

        <button
          type="button"
          onClick={() => onOpenTerms('privacy')}
          className="w-full p-2.5 rounded-xl hover:bg-white/5 flex items-center justify-between text-left cursor-pointer transition-colors"
        >
          <span className="text-xs sm:text-sm font-semibold text-slate-200 flex items-center gap-2">
            <Shield className="w-4 h-4 text-cyan-400" />
            <span>Kebijakan Privasi (Privacy Policy)</span>
          </span>
          <span className="text-xs text-slate-500">Lihat</span>
        </button>
      </div>

      {/* About Box */}
      <div className="p-4 rounded-2xl bg-[#07132e] border border-blue-500/15 text-center text-xs text-slate-400 space-y-1">
        <p className="font-bold text-slate-300">DownloaderZero (DZ)</p>
        <p className="text-[11px] text-slate-500">
          Media Engine v2026.1 • YouTube, TikTok, Spotify, Instagram, Facebook, Pinterest, TeraBox
        </p>
      </div>
    </div>
  );
};
