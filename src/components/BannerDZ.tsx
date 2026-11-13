import React, { useState, useEffect, useRef } from 'react';
import { Download } from 'lucide-react';
import bannerImage from '../assets/images/banner_dz.png';

export const BannerDZ: React.FC = () => {
  const [showVideo, setShowVideo] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Smoothly alternate image and video without jarring jumps (full video duration)
  useEffect(() => {
    if (showVideo) return;
    const timer = setTimeout(() => {
      setShowVideo(true);
    }, 4000);
    return () => clearTimeout(timer);
  }, [showVideo]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (showVideo) {
      video.currentTime = 0;
      video.play().catch(() => {
        setShowVideo(false);
      });
    } else {
      video.pause();
    }
  }, [showVideo]);

  return (
    <div className="relative w-full overflow-hidden select-none bg-[#050B18]">
      {/* Background Media Container (Full-width edge-to-edge) */}
      <div className="relative w-full h-[270px] sm:h-[320px] md:h-[360px] lg:h-[400px] overflow-hidden">
        {/* Banner Media Layer with 5% bottom transparency fade mask */}
        <div
          className="absolute inset-0 w-full h-full"
          style={{
            maskImage: 'linear-gradient(to bottom, black 0%, black 95%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 95%, transparent 100%)',
          }}
        >
          {/* Banner PNG Image */}
          <img
            src={bannerImage}
            alt="DownloaderZero Banner"
            className={`absolute inset-0 w-full h-full object-cover object-top sm:object-center transition-opacity duration-700 ease-in-out ${
              showVideo ? 'opacity-0' : 'opacity-100'
            }`}
            loading="eager"
          />

          {/* Banner MP4 Video (Smooth background transition, full duration) */}
          <video
            ref={videoRef}
            src="/banner_eksperimen.mp4"
            muted
            playsInline
            preload="auto"
            onEnded={() => setShowVideo(false)}
            onError={() => setShowVideo(false)}
            className={`absolute inset-0 w-full h-full object-cover object-top sm:object-center transition-opacity duration-700 ease-in-out ${
              showVideo ? 'opacity-100' : 'opacity-0'
            }`}
          />
        </div>

        {/* Ambient Dark-Blue & Shimmer Overlays */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#050B18]/90 via-[#050B18]/45 to-transparent pointer-events-none" />
        <div className="absolute inset-0 bg-blue-950/20 mix-blend-color pointer-events-none" />

        {/* Bottom 5% Gradient Fade: Fades down smoothly to background black (#050B18) at the very bottom edge */}
        <div
          className="absolute inset-x-0 -bottom-[1px] h-[6%] min-h-[16px] max-h-[22px] bg-gradient-to-b from-transparent via-[#050B18]/75 to-[#050B18] pointer-events-none"
          aria-hidden="true"
        />
        {/* 1.5px subpixel seam-eliminator ensuring zero border/line in production */}
        <div
          className="absolute inset-x-0 -bottom-[1px] h-[1.5px] bg-[#050B18] pointer-events-none"
          aria-hidden="true"
        />

        {/* Brand Lockup Overlay (Aligned with content container) */}
        <div className="absolute inset-0 max-w-4xl mx-auto px-4 sm:px-6 pointer-events-none flex flex-col justify-start">
          <div className="pt-7 sm:pt-10 max-w-[280px] sm:max-w-sm pointer-events-auto">
            {/* Blue Download Icon Badge */}
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 p-0.5 shadow-lg shadow-blue-500/40 mb-3 flex items-center justify-center">
              <div className="w-full h-full rounded-[14px] bg-[#0c245c]/70 backdrop-blur-xs flex items-center justify-center">
                <Download className="w-6 h-6 text-white stroke-[2.5]" />
              </div>
            </div>

            {/* Title */}
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white drop-shadow-md">
              Downloader<span className="text-cyan-400">Zero</span>
            </h1>

            {/* Subtitle */}
            <p className="text-xs sm:text-sm font-medium text-blue-100/90 mt-1 leading-snug drop-shadow-xs">
              Download Video & Audio <br className="hidden sm:inline" />
              dari berbagai platform
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
