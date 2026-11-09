import React, { useState, useEffect, useRef } from 'react';
import bannerImage from '../assets/images/banner_dz.png';

const LOCAL_VIDEO_URL = '/banner_zero.mp4';
const CDN_FALLBACK_URL = 'https://cdn.jsdelivr.net/gh/asahichanID/media@main/banner_zero.mp4';
const GITHUB_FALLBACK_URL = 'https://raw.githubusercontent.com/asahichanID/media/main/banner_zero.mp4';

export const BannerDZ: React.FC = () => {
  // false = showing PNG banner (3 seconds), true = showing MP4 banner (5 seconds)
  const [showVideo, setShowVideo] = useState<boolean>(false);
  const [videoSrc, setVideoSrc] = useState<string>(LOCAL_VIDEO_URL);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Infinitely alternate: Photo for 3 seconds -> Video for 5 seconds -> Photo for 3 seconds...
  useEffect(() => {
    const duration = showVideo ? 5000 : 3000;
    const timer = setTimeout(() => {
      setShowVideo((prev) => !prev);
    }, duration);

    return () => clearTimeout(timer);
  }, [showVideo]);

  // Video play & resource management with smooth restart on every video turn
  useEffect(() => {
    if (showVideo) {
      if (videoRef.current) {
        videoRef.current.currentTime = 0;
        videoRef.current.play().catch((err) => {
          console.warn('[BannerDZ] Video autoplay notice:', err);
        });
      }
    } else {
      const pauseTimer = setTimeout(() => {
        if (!showVideo && videoRef.current) {
          videoRef.current.pause();
        }
      }, 750);
      return () => clearTimeout(pauseTimer);
    }
  }, [showVideo]);

  // Fallback cascade: Local -> jsDelivr CDN -> Raw GitHub
  const handleVideoError = () => {
    if (videoSrc === LOCAL_VIDEO_URL) {
      console.warn('[BannerDZ] Local video failed, falling back to jsDelivr CDN');
      setVideoSrc(CDN_FALLBACK_URL);
    } else if (videoSrc === CDN_FALLBACK_URL) {
      console.warn('[BannerDZ] CDN video failed, falling back to GitHub raw');
      setVideoSrc(GITHUB_FALLBACK_URL);
    }
  };

  return (
    <section 
      aria-label="Banner DownloaderZero"
      className="relative w-full rounded-2xl sm:rounded-3xl border border-blue-600/30 bg-[#06122d] p-1.5 sm:p-2 shadow-md shadow-blue-950/40 transition-colors duration-150 hover:border-cyan-500/40 overflow-hidden"
    >
      {/* Decorative Subtle Blue / Cyan Accents */}
      <div className="pointer-events-none absolute -top-12 -left-12 h-36 w-36 rounded-full bg-cyan-500/5" />
      <div className="pointer-events-none absolute -bottom-12 -right-12 h-36 w-36 rounded-full bg-blue-600/5" />

      {/* Cyber Corner Borders (Dekorasi pembatas sisi sudut) */}
      <div className="pointer-events-none absolute top-2 left-2 w-3.5 h-3.5 border-t-2 border-l-2 border-cyan-400/80 rounded-tl-sm z-20" />
      <div className="pointer-events-none absolute top-2 right-2 w-3.5 h-3.5 border-t-2 border-r-2 border-cyan-400/80 rounded-tr-sm z-20" />
      <div className="pointer-events-none absolute bottom-2 left-2 w-3.5 h-3.5 border-b-2 border-l-2 border-cyan-400/80 rounded-bl-sm z-20" />
      <div className="pointer-events-none absolute bottom-2 right-2 w-3.5 h-3.5 border-b-2 border-r-2 border-cyan-400/80 rounded-br-sm z-20" />

      {/* Media Container with exact aspect ratio preserving size */}
      <div className="relative w-full aspect-[1671/941] overflow-hidden rounded-xl sm:rounded-2xl border border-blue-900/60 bg-[#030818]">
        {/* Banner PNG Image (Visible for 3 seconds) */}
        <img
          src={bannerImage}
          alt="DownloaderZero Official Banner"
          className={`absolute inset-0 w-full h-full object-contain block select-none transition-opacity duration-700 ease-in-out ${
            showVideo ? 'opacity-0 pointer-events-none z-0' : 'opacity-100 z-10'
          }`}
          loading="eager"
        />

        {/* Banner MP4 Video (Visible for 5 seconds) */}
        <video
          ref={videoRef}
          src={videoSrc}
          onError={handleVideoError}
          muted
          playsInline
          loop
          preload="auto"
          className={`absolute inset-0 w-full h-full object-contain block select-none transition-opacity duration-700 ease-in-out ${
            showVideo ? 'opacity-100 z-10' : 'opacity-0 pointer-events-none z-0'
          }`}
        />
      </div>
    </section>
  );
};
