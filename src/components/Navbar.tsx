import React from 'react';
import { Settings, Menu, Crown } from 'lucide-react';

interface NavbarProps {
  onOpenSettings: () => void;
  onOpenMenu: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenSettings, onOpenMenu }) => {
  return (
    <header className="w-full select-none py-2">
      {/* Main Header Bar */}
      <div className="flex items-center justify-between">
        {/* Brand Lockup: Crown + DZ + DownloaderZero */}
        <div className="flex items-center gap-3">
          <div className="relative flex flex-col items-center">
            {/* Crown Icon */}
            <Crown className="h-4 w-4 text-cyan-400 drop-shadow-[0_0_8px_rgba(6,182,212,0.8)] fill-cyan-400 -mb-1" />
            {/* DZ Stylized Logo */}
            <div className="relative font-cyber font-black text-2xl sm:text-3xl tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-white via-cyan-300 to-blue-500 drop-shadow-[0_0_12px_rgba(6,182,212,0.7)] italic">
              DZ
            </div>
          </div>
          <span className="text-xl sm:text-2xl font-bold tracking-tight text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.2)]">
            Downloader<span className="text-cyan-400">Zero</span>
          </span>
        </div>

        {/* Right Action Buttons: Menu + Settings */}
        <div className="flex items-center gap-2.5">
          {/* Hamburger Menu Button */}
          <button
            type="button"
            onClick={onOpenMenu}
            aria-label="Menu"
            className="flex items-center justify-center h-10 w-10 sm:h-11 sm:w-11 rounded-xl bg-[#09152e] border border-blue-900/80 text-cyan-300 hover:border-cyan-400 hover:text-white hover:shadow-[0_0_12px_rgba(6,182,212,0.5)] transition-all cursor-pointer"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Settings Button */}
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="Pengaturan"
            className="flex items-center justify-center h-10 w-10 sm:h-11 sm:w-11 rounded-xl bg-[#09152e] border border-blue-900/80 text-cyan-300 hover:border-cyan-400 hover:text-white hover:shadow-[0_0_12px_rgba(6,182,212,0.5)] transition-all cursor-pointer"
          >
            <Settings className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  );
};
