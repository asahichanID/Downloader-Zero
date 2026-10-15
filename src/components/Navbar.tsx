import React from 'react';
import { Settings, Sparkles, Youtube, Film, Music, ShieldCheck } from 'lucide-react';
import logo3d from '../assets/images/logo_3d_cyber_zero_1792076525926.jpg';

interface NavbarProps {
  onOpenSettings: () => void;
  onOpenTerms: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenSettings, onOpenTerms }) => {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-slate-950/85 backdrop-blur-xl transition-colors dark:border-slate-800/80 dark:bg-slate-950/85 light:border-slate-200 light:bg-white/85">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-8 px-4 sm:px-6 lg:px-8">
        {/* Zone 1: Brand Wordmark & 3D Logo */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="relative h-10 w-10 overflow-hidden rounded-xl border border-cyan-500/30 shadow-sm shadow-cyan-500/20">
            <img
              src={logo3d}
              alt="DownloaderZero DZ Logo"
              className="h-full w-full object-cover"
              referrerPolicy="no-referrer"
              onError={(e) => {
                // Fallback styled container if image fails
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-tr from-cyan-500/20 to-transparent pointer-events-none" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-lg font-extrabold tracking-tight text-white light:text-slate-900">
                Downloader<span className="text-cyan-400">Zero</span>
              </span>
              <span className="rounded bg-cyan-950/80 px-1.5 py-0.5 text-[10px] font-mono font-bold tracking-wider text-cyan-300 border border-cyan-500/30">
                DZ
              </span>
            </div>
            <span className="text-[11px] text-slate-400 light:text-slate-500 hidden sm:block">
              Free Video & MP3 Engine
            </span>
          </div>
        </div>

        {/* Zone 2: Supported Platform Badges */}
        <div className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-400 light:text-slate-600">
          <span className="flex items-center gap-1.5 hover:text-cyan-400 transition-colors">
            <Youtube className="h-3.5 w-3.5 text-red-500" />
            <span>YouTube 4K</span>
          </span>
          <span aria-hidden="true" className="text-slate-700 light:text-slate-300">·</span>
          <span className="flex items-center gap-1.5 hover:text-cyan-400 transition-colors">
            <Film className="h-3.5 w-3.5 text-emerald-400" />
            <span>TikTok HD</span>
          </span>
          <span aria-hidden="true" className="text-slate-700 light:text-slate-300">·</span>
          <span className="flex items-center gap-1.5 hover:text-cyan-400 transition-colors">
            <Film className="h-3.5 w-3.5 text-blue-500" />
            <span>Facebook</span>
          </span>
          <span aria-hidden="true" className="text-slate-700 light:text-slate-300">·</span>
          <span className="flex items-center gap-1.5 hover:text-cyan-400 transition-colors">
            <Music className="h-3.5 w-3.5 text-pink-500" />
            <span>Instagram</span>
          </span>
        </div>

        {/* Zone 3: Settings & Legal Trigger */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onOpenTerms}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-cyan-400 hover:bg-slate-900 light:hover:bg-slate-100 rounded-lg transition-colors border border-transparent hover:border-slate-800"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Legal & S&K</span>
          </button>

          <button
            onClick={onOpenSettings}
            className="flex items-center justify-center h-9 w-9 rounded-xl border border-slate-800 bg-slate-900/80 text-slate-300 hover:text-cyan-300 hover:border-cyan-500/50 hover:bg-cyan-950/30 transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/40 light:bg-slate-100 light:border-slate-200 light:text-slate-700 light:hover:bg-slate-200"
            aria-label="Buka Pengaturan"
            title="Pengaturan"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
