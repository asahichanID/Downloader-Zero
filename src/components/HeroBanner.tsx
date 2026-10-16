import React from 'react';
import { Crown, Sparkles, Heart } from 'lucide-react';
import animeMascot from '../assets/images/anime_mascot_hero_1792123758844.jpg';

export const HeroBanner: React.FC = () => {
  return (
    <section className="relative w-full overflow-hidden py-3 sm:py-6 px-4 sm:px-8 rounded-3xl dz-card border border-blue-900/60 shadow-xl select-none">
      {/* Background radial glow */}
      <div className="absolute top-1/2 left-1/4 -translate-y-1/2 w-96 h-64 bg-cyan-500/15 blur-[100px] pointer-events-none -z-10" />
      <div className="absolute top-1/2 right-1/4 -translate-y-1/2 w-96 h-64 bg-blue-600/15 blur-[100px] pointer-events-none -z-10" />

      <div className="relative flex flex-col sm:flex-row items-center justify-between gap-6 sm:gap-8">
        {/* Left Typography Block */}
        <div className="flex-1 z-10 text-center sm:text-left">
          {/* Crown & Sparkles */}
          <div className="flex items-center justify-center sm:justify-start gap-1.5 text-cyan-400 mb-1">
            <Crown className="h-4 w-4 sm:h-5 sm:w-5 drop-shadow-[0_0_8px_rgba(6,182,212,0.9)] fill-cyan-400" />
            <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-cyan-300 drop-shadow-[0_0_6px_rgba(6,182,212,0.8)]" />
          </div>

          {/* Big Cyber "DZ" */}
          <div className="relative inline-block">
            <span className="font-cyber font-black text-6xl sm:text-7xl md:text-8xl italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white via-cyan-200 to-blue-600 drop-shadow-[0_4px_20px_rgba(6,182,212,0.85)] pr-3">
              DZ
            </span>
            <span className="absolute -top-1 -right-1 text-cyan-300 text-lg animate-pulse">✦</span>
          </div>

          {/* Stylized "DownloaderZero" script */}
          <div className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-white drop-shadow-[0_2px_12px_rgba(6,182,212,0.6)] font-cyber">
            Downloader<span className="text-cyan-400">Zero</span>
          </div>

          {/* Tagline Box */}
          <div className="mt-3 sm:mt-4 max-w-sm text-sm sm:text-base font-semibold text-slate-100 leading-snug drop-shadow-md mx-auto sm:mx-0">
            <p>Download Video &amp; Audio</p>
            <p>dari URL, Mudah,</p>
            <p className="text-cyan-300 font-bold">Cepat, Berkualitas!</p>
          </div>
        </div>

        {/* Right Mascot Block */}
        <div className="relative shrink-0 flex flex-col items-center">
          {/* Speech Bubble: "Yuk Download Sekarang!" */}
          <div className="relative -mb-3.5 sm:-mb-4 z-20 self-center sm:self-end mr-0 sm:mr-3 bg-[#081738]/95 border border-cyan-400/80 rounded-2xl px-4 py-2 shadow-[0_0_15px_rgba(6,182,212,0.5)] backdrop-blur-md">
            <div className="font-doodle text-base sm:text-lg font-bold text-white tracking-wide flex items-center gap-1.5 whitespace-nowrap">
              <span>Yuk Download Sekarang!</span>
              <Heart className="h-4 w-4 text-pink-400 fill-pink-400 animate-pulse" />
            </div>
            {/* Cute cat ears doodle on bubble */}
            <div className="absolute -bottom-1.5 right-6 w-3.5 h-3.5 bg-[#081738] border-r border-b border-cyan-400/80 rotate-45" />
          </div>

          {/* Character Avatar Container with Cyan Glowing Border */}
          <div className="relative w-44 h-44 sm:w-56 sm:h-56 md:w-64 md:h-64 rounded-full overflow-hidden border-3 border-cyan-400 shadow-[0_0_30px_rgba(6,182,212,0.65)] bg-[#0c224a]">
            <img
              src={animeMascot}
              alt="DownloaderZero Anime Mascot"
              className="w-full h-full object-cover object-top scale-105"
            />
            {/* Subtle bottom gradient blend */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#030712]/50 via-transparent to-transparent pointer-events-none" />
          </div>
        </div>
      </div>
    </section>
  );
};
