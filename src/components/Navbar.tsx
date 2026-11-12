import React from 'react';
import { Settings, Menu, Clock } from 'lucide-react';
import { DZCanvasLogo } from './DZCanvasLogo.tsx';

interface NavbarProps {
  onOpenSettings: () => void;
  onOpenMenu: () => void;
  onOpenHistory: () => void;
  historyCount?: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenSettings,
  onOpenMenu,
  onOpenHistory,
  historyCount = 0
}) => {
  return (
    <header className="w-full select-none py-2">
      {/* Main Header Bar */}
      <div className="flex items-center justify-between">
        {/* Brand Lockup: Permanent Canvas DZ Logo + DownloaderZero */}
        <div className="flex items-center gap-2.5">
          <DZCanvasLogo size={40} showCrown={true} showGlow={true} />
          <span className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white transition-colors">
            Downloader<span className="text-cyan-500 dark:text-cyan-400">Zero</span>
          </span>
        </div>

        {/* Right Action Buttons: History + Menu + Settings */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* History Button with 24-hr badge */}
          <button
            type="button"
            onClick={onOpenHistory}
            aria-label="Riwayat Unduhan"
            title="Riwayat Unduhan (Offline 24 Jam)"
            className="relative flex items-center gap-1.5 px-3 h-10 sm:h-11 rounded-xl bg-white dark:bg-[#09152e] border border-slate-300 dark:border-cyan-500/40 text-slate-700 dark:text-cyan-300 hover:border-cyan-400 hover:text-slate-950 dark:hover:text-white active:scale-[0.94] hover:-translate-y-0.5 transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] cursor-pointer font-bold text-xs touch-manipulation shadow-sm"
          >
            <Clock className="h-4.5 w-4.5 text-cyan-500 dark:text-cyan-400" />
            <span className="hidden sm:inline">Riwayat</span>
            {historyCount > 0 && (
              <span className="flex items-center justify-center min-w-4.5 h-4.5 px-1 rounded-full bg-cyan-500 text-slate-950 text-[10px] font-black">
                {historyCount > 99 ? '99+' : historyCount}
              </span>
            )}
          </button>

          {/* Hamburger Menu Button */}
          <button
            type="button"
            onClick={onOpenMenu}
            aria-label="Menu"
            className="flex items-center justify-center h-10 w-10 sm:h-11 sm:w-11 rounded-xl bg-white dark:bg-[#09152e] border border-slate-300 dark:border-blue-900/60 text-slate-700 dark:text-cyan-300 hover:border-cyan-400/80 hover:text-slate-950 dark:hover:text-white active:scale-[0.94] hover:-translate-y-0.5 transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] cursor-pointer touch-manipulation shadow-sm"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Settings Button */}
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="Pengaturan"
            className="flex items-center justify-center h-10 w-10 sm:h-11 sm:w-11 rounded-xl bg-white dark:bg-[#09152e] border border-slate-300 dark:border-blue-900/60 text-slate-700 dark:text-cyan-300 hover:border-cyan-400/80 hover:text-slate-950 dark:hover:text-white active:scale-[0.94] hover:-translate-y-0.5 transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] cursor-pointer touch-manipulation shadow-sm"
          >
            <Settings className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  );
};
