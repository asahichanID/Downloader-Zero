import React from 'react';
import { ShieldCheck, Heart } from 'lucide-react';

interface FooterProps {
  onOpenTerms: () => void;
  onOpenPrivacy: () => void;
}

export const Footer: React.FC<FooterProps> = ({ onOpenTerms, onOpenPrivacy }) => {
  return (
    <footer className="w-full border-t border-slate-800/80 light:border-slate-200 bg-slate-950/60 light:bg-slate-50/80 backdrop-blur-md py-8 mt-16 transition-colors">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400 light:text-slate-600">
          {/* Main Brand and Author Lockup */}
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 text-center sm:text-left">
            <span className="font-bold text-white light:text-slate-900 tracking-tight">
              DownloaderZero (DZ)
            </span>
            <span aria-hidden="true" className="text-slate-700 light:text-slate-300">·</span>
            <span className="text-cyan-400 font-medium">
              Created &amp; Protected by Shiro Anna
            </span>
            <span aria-hidden="true" className="text-slate-700 light:text-slate-300">·</span>
            <span className="font-mono text-slate-500">
              © 2026
            </span>
          </div>

          {/* Legal Links */}
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={onOpenTerms}
              className="hover:text-cyan-400 transition-colors cursor-pointer"
            >
              Syarat &amp; Ketentuan (S&amp;K)
            </button>
            <span aria-hidden="true" className="text-slate-700 light:text-slate-300">·</span>
            <button
              type="button"
              onClick={onOpenPrivacy}
              className="hover:text-cyan-400 transition-colors cursor-pointer"
            >
              Kebijakan Privasi
            </button>
          </div>
        </div>

        {/* Disclaimer subtext */}
        <div className="mt-4 pt-4 border-t border-slate-900 light:border-slate-200/60 text-center sm:text-left">
          <p className="text-[11px] text-slate-500 light:text-slate-500 leading-relaxed max-w-3xl">
            DownloaderZero adalah sarana konversi dan unduhan web gratis yang mendukung fair use untuk backup offline dan riset edukasi. Mohon hormati hak cipta setiap kreator di YouTube, TikTok, Facebook, dan Instagram.
          </p>
        </div>
      </div>
    </footer>
  );
};
