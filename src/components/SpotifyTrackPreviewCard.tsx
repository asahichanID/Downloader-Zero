import React, { useState, useRef, useEffect } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Download,
  Loader2,
  Music2,
  Disc3,
  Calendar,
  Sparkles,
  CheckCircle2,
  Clock,
  Radio,
  FileCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { MediaMetadata, MediaFormat } from '../types/index.ts';

interface SpotifyTrackPreviewCardProps {
  media: MediaMetadata;
  onDownload: (format: MediaFormat) => void;
  isDownloading: boolean;
  downloadProgress: number;
  downloadStatusText: string;
}

export const SpotifyTrackPreviewCard: React.FC<SpotifyTrackPreviewCardProps> = ({
  media,
  onDownload,
  isDownloading,
  downloadProgress,
  downloadStatusText
}) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(30);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isAudioLoading, setIsAudioLoading] = useState<boolean>(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [cacheCountdown, setCacheCountdown] = useState<number | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressBarRef = useRef<HTMLDivElement | null>(null);

  const previewAudioUrl = media.previewUrl || media.tracks?.[0]?.previewUrl || '';
  const albumName = media.album || media.tracks?.[0]?.album || 'Single Track';
  const genreName = media.genre || media.tracks?.[0]?.genre || 'Pop';
  const releaseYear = media.releaseDate?.slice(0, 4) || media.tracks?.[0]?.releaseDate?.slice(0, 4) || '';

  // Best format for download
  const downloadFormat =
    media.formats?.find((f) => f.quality?.includes('320')) ||
    media.formats?.find((f) => f.type === 'audio') ||
    media.formats?.[0] || {
      id: 'sp-default-320',
      quality: '320 kbps (Neo MP3 • Metadata & Cover)',
      resolution: '320 kbps',
      type: 'audio',
      extension: 'mp3',
      url: media.url,
      isDirect: true
    };

  // Setup HTML5 Audio element
  useEffect(() => {
    if (!previewAudioUrl) {
      setAudioError('Pratinjau audio tidak tersedia dari server sumber.');
      return;
    }

    setAudioError(null);
    const audio = new Audio();
    audio.src = previewAudioUrl;
    audio.preload = 'metadata';
    audioRef.current = audio;

    audio.onloadedmetadata = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        setDuration(Math.round(audio.duration));
      }
    };

    audio.ontimeupdate = () => {
      setCurrentTime(audio.currentTime);
    };

    audio.onwaiting = () => {
      setIsAudioLoading(true);
    };

    audio.onplaying = () => {
      setIsAudioLoading(false);
      setIsPlaying(true);
    };

    audio.onpause = () => {
      setIsPlaying(false);
    };

    audio.onended = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.onerror = () => {
      setIsAudioLoading(false);
      setIsPlaying(false);
      setAudioError('Gagal memuat pratinjau audio langsung. Coba lagi.');
    };

    return () => {
      audio.pause();
      audio.src = '';
      audioRef.current = null;
    };
  }, [previewAudioUrl]);

  // Handle Play/Pause toggle
  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch((err) => {
        console.warn('Audio play notice:', err);
        setAudioError('Izin pemutaran audio browser diperlukan. Klik tombol putar.');
      });
    }
  };

  // Toggle Mute
  const toggleMute = () => {
    if (!audioRef.current) return;
    const nextMute = !isMuted;
    audioRef.current.muted = nextMute;
    setIsMuted(nextMute);
  };

  // Seek on progress bar click
  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || !audioRef.current || duration <= 0) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, clickX / rect.width));
    const newTime = pct * duration;
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  // Format seconds to MM:SS
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Cache 15-second countdown watcher when download completes
  useEffect(() => {
    if (!isDownloading && downloadStatusText.includes('selesai')) {
      setCacheCountdown(15);
      const interval = setInterval(() => {
        setCacheCountdown((prev) => {
          if (prev === null || prev <= 1) {
            clearInterval(interval);
            return null;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [isDownloading, downloadStatusText]);

  return (
    <div className="w-full dz-card rounded-3xl p-4 sm:p-6 border-2 border-emerald-500/40 dark:border-[#1DB954]/50 shadow-xl shadow-black/40 relative overflow-hidden transition-all duration-200">
      {/* Background Subtle Gradient Glow */}
      <div className="absolute top-0 right-0 -mr-16 -mt-16 w-48 h-48 rounded-full bg-[#1DB954]/10 blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-48 h-48 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />

      {/* Header Badges: Spotify Badge + Genre + Embedded ID3 Tag info */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3.5 mb-4 border-b border-slate-200 dark:border-blue-900/60 relative z-10">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-[#1DB954] flex items-center justify-center text-slate-950 font-black shadow-sm">
            <Radio className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white tracking-wide">
            Pratinjau Asli Spotify
          </span>
          <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 dark:bg-emerald-500/20 text-[#1DB954] border border-[#1DB954]/40 text-[10px] sm:text-xs font-bold uppercase tracking-wider">
            {genreName}
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-100/80 dark:bg-emerald-950/80 px-2.5 py-1 rounded-full border border-emerald-400/40">
          <FileCheck className="w-3.5 h-3.5 text-[#1DB954]" />
          <span>Metadata & Cover Tertanam</span>
        </div>
      </div>

      {/* Main Preview Box: Cover Art + Info + Playable Audio Player */}
      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6 relative z-10">
        {/* Cover Art with Vinyl Styling */}
        <div className="relative group shrink-0">
          <div className="w-32 h-32 sm:w-36 sm:h-36 rounded-2xl overflow-hidden border-2 border-emerald-500/40 shadow-lg shadow-black/50 relative bg-slate-900">
            {media.thumbnail ? (
              <img
                src={media.thumbnail}
                alt={media.title}
                className={`w-full h-full object-cover transition-transform duration-500 ${isPlaying ? 'scale-105' : 'scale-100'}`}
                crossOrigin="anonymous"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-slate-900 text-[#1DB954]">
                <Disc3 className="w-12 h-12 animate-spin-slow" />
              </div>
            )}

            {/* Dark overlay with animated play/pause on cover */}
            <div
              onClick={togglePlay}
              className="absolute inset-0 bg-black/40 hover:bg-black/20 flex items-center justify-center cursor-pointer transition-all duration-200"
              title={isPlaying ? 'Jeda Audio' : 'Putar Audio Pratinjau'}
            >
              <div className="w-12 h-12 rounded-full bg-[#1DB954] hover:bg-[#1ed760] active:scale-95 text-slate-950 flex items-center justify-center shadow-lg shadow-[#1DB954]/50 transition-all duration-200">
                {isAudioLoading ? (
                  <Loader2 className="w-6 h-6 animate-spin text-slate-950" />
                ) : isPlaying ? (
                  <Pause className="w-6 h-6 fill-current" />
                ) : (
                  <Play className="w-6 h-6 fill-current ml-0.5" />
                )}
              </div>
            </div>
          </div>

          {/* Rotating Disc Indicator when playing */}
          {isPlaying && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-slate-950 border border-[#1DB954] text-[#1DB954] flex items-center justify-center shadow-md animate-spin"
              style={{ animationDuration: '3s' }}
            >
              <Disc3 className="w-5 h-5" />
            </motion.div>
          )}
        </div>

        {/* Track Metadata & Playback Controls */}
        <div className="flex-1 min-w-0 w-full flex flex-col justify-between">
          <div className="space-y-1 text-center sm:text-left">
            <h3 className="text-base sm:text-xl font-extrabold text-slate-900 dark:text-white truncate">
              {media.title}
            </h3>
            <p className="text-sm font-semibold text-emerald-600 dark:text-[#1DB954] truncate">
              {media.author}
            </p>

            {/* Badges: Album, Release Year, Genre */}
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1 text-[11px] font-medium text-slate-600 dark:text-slate-300">
              {albumName && (
                <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-slate-200/80 dark:bg-slate-900/80 border border-slate-300 dark:border-blue-900/60 truncate max-w-[200px]">
                  <Music2 className="w-3 h-3 text-[#1DB954] shrink-0" />
                  <span className="truncate">{albumName}</span>
                </div>
              )}

              {releaseYear && (
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-200/80 dark:bg-slate-900/80 border border-slate-300 dark:border-blue-900/60">
                  <Calendar className="w-3 h-3 text-cyan-500 shrink-0" />
                  <span>{releaseYear}</span>
                </div>
              )}

              <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-200/80 dark:bg-slate-900/80 border border-slate-300 dark:border-blue-900/60">
                <Clock className="w-3 h-3 text-amber-500 shrink-0" />
                <span>{media.durationFormatted || 'Pratinjau'}</span>
              </div>
            </div>
          </div>

          {/* Interactive Audio Player Bar */}
          <div className="mt-4 p-3 rounded-2xl bg-slate-100 dark:bg-slate-900/90 border border-slate-300 dark:border-blue-900/70 space-y-2">
            <div className="flex items-center justify-between text-xs font-mono text-slate-700 dark:text-slate-300">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={togglePlay}
                  className="w-7 h-7 rounded-full bg-[#1DB954] text-slate-950 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform cursor-pointer"
                >
                  {isPlaying ? (
                    <Pause className="w-3.5 h-3.5 fill-current" />
                  ) : (
                    <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                  )}
                </button>
                <span className="font-bold text-slate-900 dark:text-white">
                  {formatTime(currentTime)}
                </span>
                <span className="text-slate-400">/</span>
                <span className="text-slate-500 dark:text-slate-400">
                  {formatTime(duration)}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleMute}
                  className="p-1 rounded text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                  title={isMuted ? 'Batal Bisukan' : 'Bisukan'}
                >
                  {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <span className="text-[10px] uppercase font-bold text-[#1DB954] tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/10">
                  {isPlaying ? 'Memutar' : 'Pratinjau 30s'}
                </span>
              </div>
            </div>

            {/* Clickable Seek Progress Bar */}
            <div
              ref={progressBarRef}
              onClick={handleSeek}
              className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 cursor-pointer relative overflow-hidden group"
              title="Geser pratinjau audio"
            >
              <div
                className="h-full bg-gradient-to-r from-[#1DB954] to-emerald-400 rounded-full transition-all duration-100"
                style={{
                  width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`
                }}
              />
            </div>

            {audioError && (
              <p className="text-[11px] text-amber-500 dark:text-amber-400 font-medium">
                {audioError}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Prominent Download Button Below Preview as Requested */}
      <div className="mt-5 pt-4 border-t border-slate-200 dark:border-blue-900/60 flex flex-col gap-2 relative z-10">
        <button
          type="button"
          onClick={() => onDownload(downloadFormat)}
          disabled={isDownloading}
          className="w-full h-14 sm:h-15 rounded-2xl bg-gradient-to-r from-[#1DB954] via-emerald-600 to-teal-700 hover:from-[#1ed760] hover:to-emerald-500 active:scale-[0.985] text-white flex items-center justify-center gap-3 font-extrabold text-base sm:text-lg shadow-lg shadow-emerald-950/60 cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed transition-all duration-200 border-t border-emerald-300/40"
        >
          {isDownloading ? (
            <>
              <Loader2 className="w-6 h-6 animate-spin text-white" />
              <span>Mengunduh MP3 via Neo ({downloadProgress}%)...</span>
            </>
          ) : (
            <>
              <Download className="w-6 h-6 text-white stroke-[2.5]" />
              <span>Unduh MP3 (Neo + Metadata & Cover Tertanam)</span>
            </>
          )}
        </button>

        {/* Feature Information & 15-second Cache Purge Notice */}
        <div className="flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 px-1 pt-1 gap-1">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[#1DB954]" />
            <span>Kualitas 320 kbps MP3 • ID3 Tag (Judul, Artis, Album, Genre, Cover Art)</span>
          </div>

          {cacheCountdown !== null ? (
            <div className="flex items-center gap-1.5 text-amber-500 dark:text-amber-400 font-mono font-semibold animate-pulse">
              <Clock className="w-3.5 h-3.5" />
              <span>Cache proses akan dihapus dalam {cacheCountdown}s</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-slate-400 dark:text-slate-500">
              <Clock className="w-3.5 h-3.5" />
              <span>Cache proses dihapus otomatis 15 detik setelah selesai</span>
            </div>
          )}
        </div>

        {/* Download Progress Status Bar when active */}
        <AnimatePresence>
          {isDownloading && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-2"
            >
              <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-900 border border-emerald-500/40 shadow-sm space-y-1.5">
                <div className="flex justify-between text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                  <span>{downloadStatusText || 'Mengunduh dan menanam metadata...'}</span>
                  <span className="font-mono">{downloadProgress}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#1DB954] to-emerald-400 rounded-full transition-all duration-300"
                    style={{ width: `${Math.max(5, downloadProgress)}%` }}
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
