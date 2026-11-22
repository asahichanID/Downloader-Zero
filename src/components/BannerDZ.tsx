import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Download } from 'lucide-react';
import bannerImage from '../assets/images/banner_dz.png';
import type { BannerOptionId } from '../services/bannerStorage.ts';

const BANNER_IMAGE_CDN = 'https://cdn.jsdelivr.net/gh/asahichanID/media@main/banner_dz.png';
const FADE_OUT_WINDOW_SEC = 0.85;

interface BannerDZProps {
  activeBanner?: BannerOptionId;
  animatedBannerUrl?: string | null;
  paused?: boolean;
}

export const BannerDZ: React.FC<BannerDZProps> = React.memo(({
  activeBanner = 'default',
  animatedBannerUrl = null,
  paused = false
}) => {
  const [isInView, setIsInView] = useState<boolean>(true);
  const [isTabVisible, setIsTabVisible] = useState<boolean>(() =>
    typeof document !== 'undefined' ? !document.hidden : true
  );
  const [videoVisible, setVideoVisible] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const isFadingOutRef = useRef<boolean>(false);
  const isRestartingRef = useRef<boolean>(false);
  const restartTimerRef = useRef<number | null>(null);

  const showAnimatedVideo = activeBanner === 'lily_wuwa' && Boolean(animatedBannerUrl);
  const isActive = !paused && isInView && isTabVisible;

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current !== null) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }, []);

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

  useEffect(() => {
    isFadingOutRef.current = false;
    isRestartingRef.current = false;
    clearRestartTimer();
    setVideoVisible(false);
    return () => {
      clearRestartTimer();
    };
  }, [showAnimatedVideo, animatedBannerUrl, clearRestartTimer]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !showAnimatedVideo) return;
    if (isActive) {
      video.play().catch(() => {});
    } else if (!video.paused) {
      video.pause();
    }
  }, [isActive, showAnimatedVideo, animatedBannerUrl]);

  const handleVideoPlaying = useCallback(() => {
    if (!isRestartingRef.current && !isFadingOutRef.current) {
      setVideoVisible(true);
    }
  }, []);

  const handleVideoTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video || isRestartingRef.current) return;
    const dur = video.duration;
    if (!Number.isFinite(dur) || dur <= 1.2) return;

    const remaining = dur - video.currentTime;
    if (remaining <= FADE_OUT_WINDOW_SEC) {
      if (!isFadingOutRef.current) {
        isFadingOutRef.current = true;
        setVideoVisible(false);
      }
    } else if (!isFadingOutRef.current && !video.paused && video.currentTime >= 0.02) {
      setVideoVisible(true);
    }
  }, []);

  const handleVideoEnded = useCallback(() => {
    const video = videoRef.current;
    if (!video || isRestartingRef.current) return;

    const hadPreFaded = isFadingOutRef.current;
    isRestartingRef.current = true;
    isFadingOutRef.current = true;
    setVideoVisible(false);
    clearRestartTimer();

    const waitBeforeSeekMs = hadPreFaded ? 140 : 480;

    restartTimerRef.current = window.setTimeout(() => {
      const v = videoRef.current;
      if (!v) return;

      const finishFadeIn = () => {
        restartTimerRef.current = window.setTimeout(() => {
          isFadingOutRef.current = false;
          isRestartingRef.current = false;
          if (!v.paused) {
            setVideoVisible(true);
          }
        }, 60);
      };

      const startPlaybackFromZero = () => {
        v.play()
          .then(finishFadeIn)
          .catch(() => {
            isFadingOutRef.current = false;
            isRestartingRef.current = false;
          });
      };

      const onSeeked = () => {
        v.removeEventListener('seeked', onSeeked);
        startPlaybackFromZero();
      };

      v.addEventListener('seeked', onSeeked, { once: true });
      try {
        v.currentTime = 0;
      } catch {
        v.removeEventListener('seeked', onSeeked);
        startPlaybackFromZero();
      }
    }, waitBeforeSeekMs);
  }, [clearRestartTimer]);

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden select-none bg-[#f0f4fa] dark:bg-[#050B18] dz-contain-card"
    >
      {/* Background Media Container (Full-width edge-to-edge) */}
      <div className="relative w-full h-[270px] sm:h-[320px] md:h-[360px] lg:h-[400px] overflow-hidden">
        {/* Banner Media Layer with 5% bottom transparency fade mask */}
        <div
          className={`absolute inset-0 w-full h-full ${showAnimatedVideo ? 'bg-[#050B18]' : ''}`}
          style={{
            maskImage: 'linear-gradient(to bottom, black 0%, black 95%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 95%, transparent 100%)',
          }}
        >
          {showAnimatedVideo && animatedBannerUrl ? (
            <video
              ref={videoRef}
              key={animatedBannerUrl}
              src={animatedBannerUrl}
              autoPlay
              muted
              playsInline
              preload="auto"
              onLoadedData={handleVideoPlaying}
              onPlaying={handleVideoPlaying}
              onTimeUpdate={handleVideoTimeUpdate}
              onEnded={handleVideoEnded}
              className={`absolute inset-0 w-full h-full object-cover object-top sm:object-center will-change-[opacity,transform] transition-[opacity,transform] duration-700 ease-in-out ${
                videoVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-[1.018]'
              }`}
            />
          ) : (
            <img
              src={bannerImage}
              alt="DownloaderZero Banner"
              decoding="async"
              referrerPolicy="no-referrer"
              onError={(e) => {
                const img = e.currentTarget;
                if (!img.dataset.cdnFallback) {
                  img.dataset.cdnFallback = '1';
                  img.src = BANNER_IMAGE_CDN;
                }
              }}
              className="absolute inset-0 w-full h-full object-cover object-top sm:object-center"
              loading="eager"
            />
          )}
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
