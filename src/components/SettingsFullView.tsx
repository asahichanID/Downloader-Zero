import React, { useState } from 'react';
import { Settings, Moon, Sun, Key, Trash2, FileText, Shield, Info, ArrowLeft, Check, Sparkles } from 'lucide-react';

interface SettingsFullViewProps {
  isDark: boolean;
  onToggleTheme: () => void;
  onBackToHome: () => void;
  onOpenTerms: (tab: 'terms' | 'privacy') => void;
  onClearHistory: () => void;
}

export const SettingsFullView: React.FC<SettingsFullViewProps> = ({
  isDark,
  onToggleTheme,
  onBackToHome,
  onOpenTerms,
  onClearHistory
}) => {
  const [apiKey, setApiKey] = useState<string>(() => {
    try {
      return localStorage.getItem('dz_neoxr_api_key') || '';
    } catch {
      return '';
    }
  });
  const [isSaved, setIsSaved] = useState<boolean>(false);

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

      {/* Theme Settings Card */}
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

      {/* Custom API Key Card */}
      <div className="p-4 rounded-2xl bg-[#0c1836]/90 border border-blue-500/20 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
            <Key className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-sm text-white">Kunci API Neoxr Kustom (Opsional)</h3>
            <p className="text-xs text-slate-400 leading-relaxed mt-0.5">
              Gunakan API Key Neoxr pribadi Anda untuk kuota unduhan tanpa batas. Jika kosong, sistem otomatis memakai kunci bawaan server.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <input
                type="text"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Masukkan API Key Neoxr Anda..."
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

      {/* Cache & Data Management */}
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

      {/* Legal & Policy Links */}
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
