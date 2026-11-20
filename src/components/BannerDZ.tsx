import React, { useState, useEffect, useRef } from 'react';
import { Download } from 'lucide-react';
import bannerImage from '../assets/images/banner_dz.png';

const BANNER_IMAGE_CDN = 'https://cdn.jsdelivr.net/gh/asahichanID/media@main/banner_dz.png';
const BANNER_VIDEO_CDN = 'https://cdn.jsdelivr.net/gh/asahichanID/media@main/banner_dz.mp4';

interface BannerDZProps {
  paused?: boolean;
  alwaysPlay?: boolean;
}

export const BannerDZ: React.FC<BannerDZProps> = React.memo(({ paused = false, alwaysPlay = true }) => {
  const [showVideo, setShowVideo] = useState<boolean>(false);
  const [videoSrc, setVideoSrc] = useState<string>('/banner_eksperimen.mp4');
  const [isInView, setIsInView] = useState<boolean>(true);
  const [isTabVisible, setIsTabVisible] = useState<boolean>(() =>
    typeof document !== 'undefined' ? !document.hidden : true
  );
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const isActive = alwaysPlay ? true : (!paused && isInView && isTabVisible);

  useEffect(() => {
    const handleVisibility = () => {
      setIsTabVisible(!document.hidden);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]) {
          setIsInView(entries[0].isIntersecting);
        }
      },
      { threshold: 0.05 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Immediately stop video & switch back to crisp image when inactive/offscreen
  useEffect(() => {
    if (!isActive) {
      setShowVideo(false);
    }
  }, [isActive]);

  // Smoothly alternate image and video only when visible and active
  useEffect(() => {
    if (!isActive || showVideo) return;
    const timer = setTimeout(() => {
      setShowVideo(true);
    }, 4000);
    return () => clearTimeout(timer);
  }, [isActive, showVideo]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isActive && showVideo) {
      video.currentTime = 0;
      video.play().catch(() => {
        setShowVideo(false);
      });
    } else if (!video.paused) {
      video.pause();
    }
  }, [isActive, showVideo]);

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden select-none bg-[#f0f4fa] dark:bg-[#050B18] dz-contain-card"
    >
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
            decoding="async"
            onError={(e) => {
              const img = e.currentTarget;
              if (!img.dataset.cdnFallback) {
                img.dataset.cdnFallback = '1';
                img.src = BANNER_IMAGE_CDN;
              }
            }}
            className={`absolute inset-0 w-full h-full object-cover object-top sm:object-center will-change-[opacity] transition-opacity duration-500 ease-in-out ${
              showVideo ? 'opacity-0' : 'opacity-100'
            }`}
            loading="eager"
          />

          {/* Banner MP4 Video (Paused cleanly whenever scrolled out, hidden, or in modal/other tabs) */}
          <video
            ref={videoRef}
            src={videoSrc}
            muted
            playsInline
            preload="metadata"
            onEnded={() => setShowVideo(false)}
            onError={() => {
              if (videoSrc !== BANNER_VIDEO_CDN) {
                setVideoSrc(BANNER_VIDEO_CDN);
              } else {
                setShowVideo(false);
              }
            }}
            className={`absolute inset-0 w-full h-full object-cover object-top sm:object-center will-change-[opacity] transition-opacity duration-500 ease-in-out ${
              showVideo ? 'opacity-100' : 'opacity-0'
            }`}
          />
        </div>

        {/* Ambient Dark-Blue Gradient Overlay (Zero blend-mode readback cost) */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#050B18]/90 via-[#050B18]/45 to-blue-950/15 pointer-events-none" />

        {/* Bottom 5% Gradient Fade: Fades down smoothly to active theme background */}
        <div
          className="absolute inset-x-0 -bottom-[1px] h-[6%] min-h-[16px] max-h-[22px] bg-gradient-to-b from-transparent via-[#f0f4fa]/75 to-[#f0f4fa] dark:via-[#050B18]/75 dark:to-[#050B18] pointer-events-none"
          aria-hidden="true"
        />
        {/* 1.5px subpixel seam-eliminator ensuring zero border/line in production */}
        <div
          className="absolute inset-x-0 -bottom-[1px] h-[1.5px] bg-[#f0f4fa] dark:bg-[#050B18] pointer-events-none"
          aria-hidden="true"
        />

        {/* Brand Lockup Overlay (Title/Subtitle top-left, Download logo bottom-left) */}
        <div className="absolute inset-0 max-w-4xl mx-auto px-4 sm:px-6 pointer-events-none flex flex-col justify-between pt-6 sm:pt-9 pb-14 sm:pb-16">
          {/* Top-Left: DownloaderZero + Subtitle */}
          <div className="max-w-[280px] sm:max-w-sm pointer-events-auto">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white drop-shadow-md">
              Downloader<span className="text-cyan-400">Zero</span>
            </h1>

            <p className="text-xs sm:text-sm font-medium text-blue-100/90 mt-1 leading-snug">
              Download Video &amp; Audio
              <br />
              Dari berbagai platform
            </p>
          </div>

          {/* Bottom-Left: Blue Download Icon Badge */}
          <div className="pointer-events-auto">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 p-0.5 shadow-lg shadow-blue-500/35 flex items-center justify-center">
              <div className="w-full h-full rounded-[14px] bg-[#0c245c]/90 flex items-center justify-center">
                <Download className="w-6 h-6 text-white stroke-[2.5]" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
