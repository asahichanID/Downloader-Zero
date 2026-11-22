import React, { useEffect, useRef, useCallback } from 'react';
import { Download } from 'lucide-react';
import bannerImage from '../assets/images/banner_dz.png';
import type { BannerOptionId } from '../services/bannerStorage.ts';

const BANNER_IMAGE_CDN = 'https://cdn.jsdelivr.net/gh/asahichanID/media@main/banner_dz.png';
const FADE_OUT_LEAD_SEC = 0.72;
const FADE_DURATION_MS = 500;

interface BannerDZProps {
  activeBanner?: BannerOptionId;
  animatedBannerUrl?: string | null;
}

export const BannerDZ: React.FC<BannerDZProps> = React.memo(({
  activeBanner = 'default',
  animatedBannerUrl = null
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const isLoopingRef = useRef<boolean>(false);
  const loopTimerRef = useRef<number | null>(null);
  const revealTimerRef = useRef<number | null>(null);

  const showAnimatedVideo = activeBanner === 'lily_wuwa' && Boolean(animatedBannerUrl);

  const clearTimers = useCallback(() => {
    if (loopTimerRef.current !== null) {
      window.clearTimeout(loopTimerRef.current);
      loopTimerRef.current = null;
    }
    if (revealTimerRef.current !== null) {
      window.clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    isLoopingRef.current = false;
    clearTimers();

    const video = videoRef.current;
    if (showAnimatedVideo && video) {
      video.style.opacity = '0';
      video.play().catch(() => {});
    }

    return () => {
      clearTimers();
    };
  }, [showAnimatedVideo, animatedBannerUrl, clearTimers]);

  const fadeInVideo = useCallback(() => {
    const video = videoRef.current;
    if (!video || isLoopingRef.current) return;
    if (video.style.opacity !== '1') {
      video.style.opacity = '1';
    }
  }, []);

  const performSmoothLoopReset = useCallback((delayMs: number) => {
    const video = videoRef.current;
    if (!video) return;

    isLoopingRef.current = true;
    video.style.opacity = '0';
    clearTimers();

    loopTimerRef.current = window.setTimeout(() => {
      const v = videoRef.current;
      if (!v) return;

      let revealed = false;
      const reveal = () => {
        if (revealed) return;
        revealed = true;
        isLoopingRef.current = false;
        requestAnimationFrame(() => {
          if (videoRef.current) {
            videoRef.current.style.opacity = '1';
          }
        });
      };

      const onSeeked = () => {
        v.removeEventListener('seeked', onSeeked);
        if (v.paused) {
          v.play().then(reveal).catch(reveal);
        } else {
          reveal();
        }
      };

      v.addEventListener('seeked', onSeeked, { once: true });
      try {
        v.currentTime = 0;
      } catch {
        v.removeEventListener('seeked', onSeeked);
        v.play().then(reveal).catch(reveal);
      }

      // Safety fallback in case seeked event doesn't fire
      revealTimerRef.current = window.setTimeout(() => {
        v.removeEventListener('seeked', onSeeked);
        if (v.paused) {
          v.play().catch(() => {});
        }
        reveal();
      }, 220);
    }, delayMs);
  }, [clearTimers]);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video || isLoopingRef.current) return;
    const dur = video.duration;
    if (!Number.isFinite(dur) || dur <= 1.4) return;

    if (dur - video.currentTime <= FADE_OUT_LEAD_SEC) {
      performSmoothLoopReset(FADE_DURATION_MS);
    } else if (video.style.opacity !== '1' && !video.paused && video.currentTime >= 0.02) {
      video.style.opacity = '1';
    }
  }, [performSmoothLoopReset]);

  const handleEnded = useCallback(() => {
    if (!isLoopingRef.current) {
      performSmoothLoopReset(360);
    }
  }, [performSmoothLoopReset]);

  return (
    <div className="relative w-full overflow-hidden select-none bg-[#f0f4fa] dark:bg-[#050B18] dz-contain-card">
      {/* Background Media Container (Full-width edge-to-edge) */}
      <div className="relative w-full h-[270px] sm:h-[320px] md:h-[360px] lg:h-[400px] overflow-hidden">
        {/* Banner Media Layer (Zero per-frame maskImage cost on live video; bottom gradient handles fade cleanly) */}
        <div
          className={`absolute inset-0 w-full h-full ${showAnimatedVideo ? 'bg-[#050B18]' : ''}`}
        >
          {showAnimatedVideo && animatedBannerUrl ? (
            <video
              ref={videoRef}
              key={animatedBannerUrl}
              src={animatedBannerUrl}
              autoPlay
              loop
              muted
              playsInline
              disablePictureInPicture
              disableRemotePlayback
              preload="auto"
              onLoadedData={fadeInVideo}
              onPlaying={fadeInVideo}
              onTimeUpdate={handleTimeUpdate}
              onEnded={handleEnded}
              onPause={(e) => {
                const v = e.currentTarget;
                if (!v.ended && !isLoopingRef.current) {
                  v.play().catch(() => {});
                }
              }}
              style={{ opacity: 0, transform: 'translateZ(0)' }}
              className="absolute inset-0 w-full h-full object-cover object-top sm:object-center will-change-[opacity] transition-opacity duration-500 ease-in-out"
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
