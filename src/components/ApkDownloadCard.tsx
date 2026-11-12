import React, { useState } from 'react';
import { Download, Check, Sparkles, ShieldCheck, Smartphone, Cpu, HardDrive } from 'lucide-react';
import { DZCanvasLogo } from './DZCanvasLogo.tsx';

interface ApkDownloadCardProps {
  className?: string;
}

export const ApkDownloadCard: React.FC<ApkDownloadCardProps> = ({ className = '' }) => {
  const [downloading, setDownloading] = useState<boolean>(false);

  const handleDownloadApk = () => {
    // Sekali pencet otomatis DownloaderZero.apk langsung terunduh secara nyata tanpa cache basi
    setDownloading(true);

    const cacheBuster = Date.now();
    const link = document.createElement('a');
    link.href = `/api/download-apk?v=2.4.0&t=${cacheBuster}`;
    link.setAttribute('download', 'DownloaderZero.apk');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => {
      setDownloading(false);
    }, 2800);
  };

  return (
    <div
      className={`relative overflow-hidden rounded-2xl p-4 sm:p-5 bg-gradient-to-br from-[#071536] via-[#091a42] to-[#040c21] border border-cyan-400/50 shadow-xl shadow-cyan-950/40 text-white ${className}`}
    >
      {/* Ambient Premium Gold & Cyan Glow Accents */}
      <div className="absolute -top-16 -right-16 w-40 h-40 bg-gradient-to-br from-amber-400/20 via-cyan-400/20 to-transparent rounded-full blur-2xl pointer-events-none" />
      <div className="absolute -bottom-16 -left-16 w-36 h-36 bg-blue-600/20 rounded-full blur-2xl pointer-events-none" />

      {/* Top Status & VIP Badges */}
      <div className="relative z-10 flex items-center justify-between gap-2 mb-3.5">
        <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-400/40 text-amber-300">
          <Sparkles className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
          <span className="text-[10px] sm:text-[11px] font-black tracking-wider uppercase">
            Aplikasi Resmi Android
          </span>
        </div>

        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-950/70 border border-cyan-500/40 text-cyan-300 flex items-center gap-1">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>Play Protect Aman</span>
        </span>
      </div>

      {/* Content Area with Canvas Logo */}
      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center gap-4">
        {/* Left: Canvas DZ Logo with glow frame */}
        <div className="flex items-center gap-3.5">
          <div className="relative flex items-center justify-center p-2 rounded-2xl bg-gradient-to-b from-[#0e2456] to-[#050f26] border border-cyan-400/40 shadow-md shadow-cyan-500/10 shrink-0">
            <DZCanvasLogo size={58} showCrown={true} showGlow={true} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-black tracking-tight text-white flex items-center gap-1.5">
                <span>DownloaderZero</span>
                <span className="text-xs px-1.5 py-0.2 rounded-md bg-cyan-500 text-slate-950 font-black">
                  .APK
                </span>
              </h2>
            </div>
            <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">
              Unduh aplikasi Android resmi untuk download video & audio tanpa batas langsung dari ponsel Anda.
            </p>
          </div>
        </div>
      </div>

      {/* Technical Spec Pills */}
      <div className="relative z-10 grid grid-cols-3 gap-2 mt-3.5 pt-3 border-t border-blue-500/15">
        <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl bg-slate-900/60 border border-slate-800 text-[11px]">
          <Smartphone className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span className="text-slate-300 font-semibold truncate">v2.4.0 (Resmi)</span>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl bg-slate-900/60 border border-slate-800 text-[11px]">
          <HardDrive className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="text-slate-300 font-semibold truncate">Ukuran 4.5 MB</span>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl bg-slate-900/60 border border-slate-800 text-[11px]">
          <Cpu className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="text-slate-300 font-semibold truncate">Android 5.0 - 15</span>
        </div>
      </div>

      {/* Main Download Button */}
      <div className="relative z-10 mt-4">
        <button
          type="button"
          onClick={handleDownloadApk}
          className={`w-full py-3 sm:py-3.5 px-5 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer transition-all duration-200 active:scale-[0.98] shadow-lg ${
            downloading
              ? 'bg-emerald-500 text-slate-950 shadow-emerald-500/30'
              : 'bg-gradient-to-r from-amber-400 via-cyan-400 to-blue-500 hover:from-amber-300 hover:via-cyan-300 hover:to-blue-400 text-slate-950 shadow-cyan-500/25 hover:shadow-cyan-400/40'
          }`}
        >
          {downloading ? (
            <>
              <Check className="w-4 h-4 stroke-[3] animate-bounce" />
              <span>Memulai Unduhan DownloaderZero.apk...</span>
            </>
          ) : (
            <>
              <Download className="w-4 h-4 stroke-[2.5]" />
              <span>Unduh DownloaderZero.apk Sekarang</span>
            </>
          )}
        </button>

        <p className="text-[10px] text-center text-slate-400 mt-2">
          ✨ Sekali klik langsung terunduh ke perangkat Anda · Tanpa perantara · 100% Gratis
        </p>
      </div>
    </div>
  );
};
