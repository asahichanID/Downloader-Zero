import React from 'react';
import { Crown } from 'lucide-react';

interface FooterDZProps {
  onOpenTerms: () => void;
  onOpenPrivacy: () => void;
}

export const FooterDZ: React.FC<FooterDZProps> = ({ onOpenTerms, onOpenPrivacy }) => {
  return (
    <footer className="w-full pt-4 pb-8 select-none">
      <div className="flex items-center justify-between gap-2 px-1">
        {/* Left Handwritten Doodle Text */}
        <div className="w-28 sm:w-36 leading-tight">
          <p className="font-doodle text-sm sm:text-base font-bold text-slate-300 leading-snug drop-shadow-sm -rotate-3">
            Download Tanpa Batas Bersama DZ! ♡
          </p>
        </div>

        {/* Center Main Copyright & Legal */}
        <div className="flex-1 flex flex-col items-center justify-center text-center space-y-1">
          {/* Brand with Crowns */}
          <div className="flex items-center gap-1.5 text-xs sm:text-sm font-extrabold text-white">
            <Crown className="h-3 w-3 text-cyan-400 fill-cyan-400" />
            <span className="tracking-wide">DownloaderZero (DZ)</span>
            <Crown className="h-3 w-3 text-cyan-400 fill-cyan-400" />
          </div>

          {/* Author */}
          <p className="text-[10px] sm:text-[11px] text-slate-400 font-medium">
            Created &amp; Protected by Shiro Anna © 2026
          </p>

          {/* S&K and Kebijakan Privasi */}
          <div className="flex items-center gap-2 text-[11px] text-cyan-400 pt-0.5">
            <button
              type="button"
              onClick={onOpenTerms}
              className="hover:underline hover:text-cyan-300 cursor-pointer"
            >
              S&amp;K
            </button>
            <span className="text-slate-600">|</span>
            <button
              type="button"
              onClick={onOpenPrivacy}
              className="hover:underline hover:text-cyan-300 cursor-pointer"
            >
              Kebijakan Privasi
            </button>
          </div>
        </div>

        {/* Right Cute Cat Doodle */}
        <div className="w-28 sm:w-36 flex justify-end">
          <div className="text-cyan-400 opacity-80 hover:opacity-100 transition-opacity">
            <svg
              className="w-10 h-10 sm:w-12 sm:h-12 drop-shadow-[0_0_6px_rgba(6,182,212,0.6)]"
              viewBox="0 0 48 48"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {/* Cat Ears */}
              <path d="M12 18 L16 8 L24 16 L32 8 L36 18" />
              {/* Cat Head */}
              <circle cx="24" cy="24" r="16" />
              {/* Eyes */}
              <circle cx="18" cy="22" r="1.5" fill="currentColor" />
              <circle cx="30" cy="22" r="1.5" fill="currentColor" />
              {/* Nose & Mouth */}
              <path d="M22 26 L24 28 L26 26" />
              <path d="M24 28 L24 30" />
              <path d="M20 30 Q24 33 28 30" />
              {/* Whiskers */}
              <path d="M10 24 L4 22" />
              <path d="M10 26 L4 28" />
              <path d="M38 24 L44 22" />
              <path d="M38 26 L44 28" />
            </svg>
          </div>
        </div>
      </div>
    </footer>
  );
};
