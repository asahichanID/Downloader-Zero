import React from 'react';
import bannerImage from '../assets/images/banner_dz.png';

export const BannerDZ: React.FC = () => {
  return (
    <section 
      aria-label="Banner DownloaderZero"
      className="relative w-full rounded-2xl sm:rounded-3xl border border-blue-700/60 bg-[#06122d]/85 p-1.5 sm:p-2.5 shadow-xl shadow-blue-950/60 backdrop-blur-md transition-all duration-300 hover:border-cyan-400/60 overflow-hidden"
    >
      {/* Decorative Subtle Blue / Cyan Glows */}
      <div className="pointer-events-none absolute -top-16 -left-16 h-48 w-48 rounded-full bg-cyan-500/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 -right-16 h-48 w-48 rounded-full bg-blue-600/20 blur-3xl" />

      {/* Cyber Corner Borders (Dekorasi pembatas sisi sudut) */}
      <div className="pointer-events-none absolute top-2 left-2 w-3.5 h-3.5 border-t-2 border-l-2 border-cyan-400/80 rounded-tl-sm z-10" />
      <div className="pointer-events-none absolute top-2 right-2 w-3.5 h-3.5 border-t-2 border-r-2 border-cyan-400/80 rounded-tr-sm z-10" />
      <div className="pointer-events-none absolute bottom-2 left-2 w-3.5 h-3.5 border-b-2 border-l-2 border-cyan-400/80 rounded-bl-sm z-10" />
      <div className="pointer-events-none absolute bottom-2 right-2 w-3.5 h-3.5 border-b-2 border-r-2 border-cyan-400/80 rounded-br-sm z-10" />

      {/* Full Image Container */}
      <div className="relative w-full overflow-hidden rounded-xl sm:rounded-2xl border border-blue-900/60 bg-[#030818]">
        <img
          src={bannerImage}
          alt="DownloaderZero Official Banner"
          className="w-full h-auto aspect-[1671/941] object-contain block select-none"
          loading="eager"
        />
      </div>
    </section>
  );
};
