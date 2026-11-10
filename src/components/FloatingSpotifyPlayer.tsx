import React, { useRef, useState, useEffect } from 'react';
import { X, Play, Pause, Download, Volume2, VolumeX, Disc3, Music2, Check, Share2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { HistoryItem } from '../types/index.ts';

interface FloatingSpotifyPlayerProps {
  item: HistoryItem | null;
  onClose: () => void;
  onDownloadAgain?: (item: HistoryItem) => void;
}

export const FloatingSpotifyPlayer: React.FC<FloatingSpotifyPlayerProps> = ({
  item,
  onClose,
  onDownloadAgain
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(item?.duration || 0);
  const [volume, setVolume] = useState<number>(0.85);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isCopied, setIsCopied] = useState<boolean>(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === ' ') {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  if (!item) return null;

  const audioUrl = item.downloadUrl || item.sourceUrl;

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (audioRef.current.paused) {
      audioRef.current.play().catch(() => {});
      setIsPlaying(true);
    } else {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  };

  const toggleMute = () => {
    setIsMuted((prev) => !prev);
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
      if (audioRef.current.duration && !isNaN(audioRef.current.duration)) {
        setDuration(audioRef.current.duration);
      }
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const formatSeconds = (sec: number): string => {
    if (!sec || isNaN(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleCopyLink = () => {
    if (audioUrl) {
      navigator.clipboard.writeText(audioUrl).catch(() => {});
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 20 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-sm sm:max-w-md rounded-3xl bg-gradient-to-b from-[#0b1f48] via-[#07132e] to-[#040b1b] border border-blue-500/30 p-5 sm:p-6 shadow-2xl shadow-black/95 text-white overflow-hidden"
        >
          {/* Subtle Spotify Ambient Glow */}
          <div className="absolute -top-16 -left-16 w-44 h-44 rounded-full bg-[#1DB954]/15 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-16 -right-16 w-44 h-44 rounded-full bg-cyan-500/15 blur-3xl pointer-events-none" />

          {/* Top Bar: Platform pill and Close button */}
          <div className="relative flex items-center justify-between pb-4 border-b border-white/10 z-10">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-[#1DB954] flex items-center justify-center shrink-0">
                <Music2 className="w-3 h-3 text-black fill-current" />
              </div>
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                Pemutar Audio {item.platform === 'spotify' ? 'Spotify' : item.platform}
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center border border-white/10 active:scale-90 transition-all cursor-pointer"
              aria-label="Tutup pemutar audio"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Hidden HTML5 Audio Element */}
          <audio
            ref={audioRef}
            src={audioUrl}
            autoPlay
            onTimeUpdate={handleTimeUpdate}
            onEnded={() => setIsPlaying(false)}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onLoadedMetadata={(e) => {
              const dur = (e.target as HTMLAudioElement).duration;
              if (dur && !isNaN(dur)) setDuration(dur);
            }}
          />

          {/* Centered Album Cover with Vinyl Effect */}
          <div className="relative my-6 flex items-center justify-center">
            <div className="relative group">
              {/* Spinning Disc behind the cover when playing */}
              <div
                className={`absolute -right-4 top-2 w-48 h-48 sm:w-56 sm:h-56 rounded-full bg-slate-950 border-4 border-slate-800 shadow-2xl flex items-center justify-center transition-transform duration-700 ${
                  isPlaying ? 'translate-x-6 sm:translate-x-8 animate-spin' : 'translate-x-0'
                }`}
                style={{ animationDuration: '6s' }}
              >
                <div className="w-16 h-16 rounded-full bg-[#1DB954]/20 border-2 border-[#1DB954] flex items-center justify-center">
                  <div className="w-4 h-4 rounded-full bg-white" />
                </div>
              </div>

              {/* Main Album Artwork */}
              <div className="relative z-10 w-48 h-48 sm:w-56 sm:h-56 rounded-2xl overflow-hidden bg-slate-900 border-2 border-white/20 shadow-2xl shadow-blue-950/80">
                {item.thumbnail ? (
                  <img
                    src={item.thumbnail}
                    alt={item.title}
                    className="w-full h-full object-cover select-none"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = '/banner_dz.png';
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-emerald-600 to-blue-800">
                    <Disc3 className="w-16 h-16 text-white/80 animate-spin" />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Song Info */}
          <div className="relative z-10 text-center px-2">
            <h3 className="font-extrabold text-base sm:text-lg text-white truncate">
              {item.title}
            </h3>
            <p className="text-xs sm:text-sm text-emerald-400/90 font-medium mt-1 truncate">
              {item.artist || item.author || 'Artis Musik'}
            </p>
            <span className="inline-block mt-1 text-[11px] font-semibold text-slate-400 bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">
              {item.quality || '320 kbps'} • MP3 Audio
            </span>
          </div>

          {/* Scrubber / Progress Bar */}
          <div className="relative z-10 mt-5 space-y-1.5">
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={handleSeek}
              className="w-full h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-[#1DB954]"
            />
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
              <span>{formatSeconds(currentTime)}</span>
              <span>{formatSeconds(duration)}</span>
            </div>
          </div>

          {/* Playback Controls */}
          <div className="relative z-10 flex items-center justify-center gap-6 my-4">
            <button
              type="button"
              onClick={toggleMute}
              className="text-slate-400 hover:text-white p-2 active:scale-90 transition-all cursor-pointer"
              title={isMuted ? 'Batal bisu' : 'Bisu'}
            >
              {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>

            {/* Big Play/Pause Button */}
            <button
              type="button"
              onClick={togglePlay}
              className="w-14 h-14 rounded-full bg-[#1DB954] hover:bg-[#1ed760] text-black flex items-center justify-center shadow-lg shadow-[#1DB954]/30 active:scale-95 transition-all cursor-pointer"
              aria-label={isPlaying ? 'Jeda lagu' : 'Putar lagu'}
            >
              {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-0.5" />}
            </button>

            <button
              type="button"
              onClick={handleCopyLink}
              className="text-slate-400 hover:text-white p-2 active:scale-90 transition-all cursor-pointer"
              title="Salin tautan audio"
            >
              {isCopied ? <Check className="w-5 h-5 text-emerald-400" /> : <Share2 className="w-5 h-5" />}
            </button>
          </div>

          {/* Bottom Actions: Unduh MP3 */}
          <div className="relative z-10 pt-2 border-t border-white/10">
            {onDownloadAgain && (
              <button
                type="button"
                onClick={() => onDownloadAgain(item)}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 active:scale-95 transition-all cursor-pointer"
              >
                <Download className="w-4 h-4 stroke-[2.5]" />
                <span>Unduh Berkas MP3</span>
              </button>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
