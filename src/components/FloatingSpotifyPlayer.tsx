import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import JSZip from 'jszip';
import { X, Play, Pause, Download, Volume2, VolumeX, Disc3, Music2, Check, Copy } from 'lucide-react';
import type { HistoryItem } from '../types/index.ts';

interface FloatingSpotifyPlayerProps {
  item: HistoryItem | null;
  onClose: () => void;
  onDownloadAgain?: (item: HistoryItem) => void;
}

interface ExtractedZipTrack {
  name: string;
  url: string;
}

const formatSeconds = (sec: number): string => {
  if (!sec || isNaN(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
};

export const FloatingSpotifyPlayer: React.FC<FloatingSpotifyPlayerProps> = React.memo(({
  item,
  onClose,
  onDownloadAgain
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastUiTickRef = useRef<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(item?.duration || 0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isCopied, setIsCopied] = useState<boolean>(false);

  const [blobAudioUrl, setBlobAudioUrl] = useState<string>('');
  const [zipTracks, setZipTracks] = useState<ExtractedZipTrack[]>([]);
  const [activeZipIndex, setActiveZipIndex] = useState<number>(0);
  const [forceProxy, setForceProxy] = useState<boolean>(false);
  const [audioError, setAudioError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const createdUrls: string[] = [];

    setForceProxy(false);
    setAudioError(null);
    setCurrentTime(0);
    setDuration(item?.duration || 0);
    setZipTracks([]);
    setActiveZipIndex(0);
    setBlobAudioUrl('');

    if (!item?.blob) {
      return;
    }

    if (item.extension === 'zip') {
      JSZip.loadAsync(item.blob)
        .then(async (zip) => {
          const audioEntries = Object.values(zip.files)
            .filter((entry) => !entry.dir && /\.(mp3|m4a|ogg|wav)$/i.test(entry.name))
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

          const parsed: ExtractedZipTrack[] = [];
          for (const entry of audioEntries) {
            const rawBlob = await entry.async('blob');
            const ext = entry.name.split('.').pop()?.toLowerCase() || 'mp3';
            const mime = ext === 'm4a' ? 'audio/mp4' : 'audio/mpeg';
            const typed = new Blob([rawBlob], { type: mime });
            const objUrl = URL.createObjectURL(typed);
            createdUrls.push(objUrl);
            const cleanName = entry.name.split('/').pop()?.replace(/\.[^.]+$/, '') || entry.name;
            parsed.push({ name: cleanName, url: objUrl });
          }

          if (!cancelled) {
            if (parsed.length > 0) {
              setZipTracks(parsed);
              setActiveZipIndex(0);
            } else {
              setAudioError('Arsip ZIP tidak berisi file audio yang dapat diputar.');
            }
          }
        })
        .catch(() => {
          if (!cancelled) {
            setAudioError('Gagal membaca arsip audio ZIP.');
          }
        });
    } else {
      const mime = item.extension === 'm4a' ? 'audio/mp4' : 'audio/mpeg';
      const typed = item.blob.type === mime ? item.blob : new Blob([item.blob], { type: mime });
      const objUrl = URL.createObjectURL(typed);
      createdUrls.push(objUrl);
      setBlobAudioUrl(objUrl);
    }

    return () => {
      cancelled = true;
      for (const u of createdUrls) {
        URL.revokeObjectURL(u);
      }
    };
  }, [item]);

  const proxyFallbackUrl = useMemo(() => {
    if (!item || item.extension === 'zip') return '';
    const target = item.downloadUrl || item.sourceUrl || '';
    if (!target) return '';
    const filename = item.filename || `audio.${item.extension || 'mp3'}`;
    const kbpsMatch = `${item.resolution || ''} ${item.quality || ''}`.match(/(320|256|192|128|64)/);
    const bitrate = kbpsMatch ? `${kbpsMatch[1]}k` : (item.platform === 'spotify' ? '320k' : '192k');
    return `/api/proxy-download?url=${encodeURIComponent(target)}&filename=${encodeURIComponent(filename)}&platform=${encodeURIComponent(item.platform)}&sourceUrl=${encodeURIComponent(item.sourceUrl || '')}&bitrate=${encodeURIComponent(bitrate)}&title=${encodeURIComponent(item.title || '')}&artist=${encodeURIComponent(item.artist || item.author || '')}&album=${encodeURIComponent(item.album || '')}&cover=${encodeURIComponent(item.thumbnail || '')}&duration=${item.duration || 0}&inline=1`;
  }, [item]);

  const activeAudioUrl = useMemo(() => {
    if (zipTracks.length > 0) {
      return zipTracks[activeZipIndex]?.url || '';
    }
    if (!forceProxy && blobAudioUrl) {
      return blobAudioUrl;
    }
    return proxyFallbackUrl;
  }, [zipTracks, activeZipIndex, forceProxy, blobAudioUrl, proxyFallbackUrl]);

  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;
    if (audioRef.current.paused) {
      audioRef.current.play().catch(() => {});
      setIsPlaying(true);
    } else {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  }, []);

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
  }, [onClose, togglePlay]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : 0.85;
    }
  }, [isMuted]);

  useEffect(() => {
    if (!audioRef.current || !activeAudioUrl) return;
    audioRef.current.load();
    audioRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
  }, [activeAudioUrl]);

  if (!item) return null;

  const originalUrl = (item.sourceUrl || item.downloadUrl || '').trim();
  const activeTrackTitle = zipTracks.length > 0 ? (zipTracks[activeZipIndex]?.name || item.title) : item.title;

  const toggleMute = () => {
    setIsMuted((prev) => !prev);
  };

  const handleTimeUpdate = () => {
    const audio = audioRef.current;
    if (!audio) return;
    const now = performance.now();
    if (now - lastUiTickRef.current < 240) return;
    lastUiTickRef.current = now;
    setCurrentTime(audio.currentTime);
    if (audio.duration && !isNaN(audio.duration)) {
      setDuration(audio.duration);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const handleCopyLink = () => {
    if (originalUrl) {
      navigator.clipboard?.writeText(originalUrl).catch(() => {});
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm sm:max-w-md rounded-3xl bg-gradient-to-b from-[#0b1f48] via-[#07132e] to-[#040b1b] border border-blue-500/30 p-5 sm:p-6 shadow-2xl shadow-black/95 text-white overflow-hidden dz-animate-scale max-h-[92vh] overflow-y-auto"
      >
        {/* Top Bar */}
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
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center border border-white/10 active:scale-90 transition-transform duration-150 cursor-pointer"
            aria-label="Tutup pemutar audio"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Hidden HTML5 Audio Element */}
        {activeAudioUrl && (
          <audio
            ref={audioRef}
            src={activeAudioUrl}
            autoPlay
            onTimeUpdate={handleTimeUpdate}
            onEnded={() => {
              if (zipTracks.length > 0 && activeZipIndex < zipTracks.length - 1) {
                setActiveZipIndex((prev) => prev + 1);
              } else {
                setIsPlaying(false);
              }
            }}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onLoadedMetadata={(e) => {
              const dur = (e.target as HTMLAudioElement).duration;
              if (dur && !isNaN(dur)) setDuration(dur);
            }}
            onError={() => {
              if (!forceProxy && blobAudioUrl && proxyFallbackUrl) {
                setForceProxy(true);
              } else {
                setAudioError('Audio tidak dapat diputar. Gunakan tombol Unduh Berkas.');
              }
            }}
          />
        )}

        {/* Centered Album Cover with Vinyl Effect */}
        <div className="relative my-5 flex items-center justify-center">
          <div className="relative group">
            <div
              className={`absolute -right-4 top-2 w-40 h-40 sm:w-48 sm:h-48 rounded-full bg-slate-950 border-4 border-slate-800 shadow-xl flex items-center justify-center will-change-transform transition-transform duration-500 ${
                isPlaying ? 'translate-x-5 sm:translate-x-7 animate-spin' : 'translate-x-0'
              }`}
              style={{ animationDuration: '6s' }}
            >
              <div className="w-14 h-14 rounded-full bg-[#1DB954]/20 border-2 border-[#1DB954] flex items-center justify-center">
                <div className="w-3.5 h-3.5 rounded-full bg-white" />
              </div>
            </div>

            <div className="relative z-10 w-40 h-40 sm:w-48 sm:h-48 rounded-2xl overflow-hidden bg-slate-900 border-2 border-white/20 shadow-2xl shadow-blue-950/80">
              {item.thumbnail ? (
                <img
                  src={item.thumbnail}
                  alt={item.title}
                  decoding="async"
                  className="w-full h-full object-cover select-none"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = '/banner_dz.png';
                  }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-emerald-600 to-blue-800">
                  <Disc3 className={`w-14 h-14 text-white/80 ${isPlaying ? 'animate-spin' : ''}`} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Song Info */}
        <div className="relative z-10 text-center px-2">
          <h3 className="font-extrabold text-base sm:text-lg text-white truncate">
            {activeTrackTitle}
          </h3>
          <p className="text-xs sm:text-sm text-emerald-400/90 font-medium mt-1 truncate">
            {item.artist || item.author || 'Artis Musik'}
          </p>
          <span className="inline-block mt-1 text-[11px] font-semibold text-slate-400">
            {item.quality || '320 kbps'} • MP3 Audio
          </span>
        </div>

        {audioError && (
          <p className="mt-3 text-center text-xs text-amber-300 bg-amber-950/40 border border-amber-500/30 rounded-xl px-3 py-2">
            {audioError}
          </p>
        )}

        {/* Scrubber / Progress Bar */}
        <div className="relative z-10 mt-4 space-y-1.5">
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-[#1DB954]"
          />
          <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-400">
            <span>{formatSeconds(currentTime)}</span>
            <span>{formatSeconds(duration)}</span>
          </div>
        </div>

        {/* Playback Controls */}
        <div className="relative z-10 flex items-center justify-center gap-6 my-3.5">
          <button
            type="button"
            onClick={toggleMute}
            className="text-slate-400 hover:text-white p-2 active:scale-90 transition-transform duration-150 cursor-pointer"
            title={isMuted ? 'Batal bisu' : 'Bisu'}
          >
            {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>

          <button
            type="button"
            onClick={togglePlay}
            className="w-14 h-14 rounded-full bg-[#1DB954] hover:bg-[#1ed760] text-black flex items-center justify-center shadow-lg shadow-[#1DB954]/30 active:scale-95 transition-transform duration-150 cursor-pointer"
            aria-label={isPlaying ? 'Jeda lagu' : 'Putar lagu'}
          >
            {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-0.5" />}
          </button>

          <button
            type="button"
            onClick={handleCopyLink}
            className="text-slate-400 hover:text-white p-2 active:scale-90 transition-transform duration-150 cursor-pointer"
            title="Salin URL ori"
          >
            {isCopied ? <Check className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5" />}
          </button>
        </div>

        {/* Playlist ZIP Track Switcher */}
        {zipTracks.length > 0 && (
          <div className="relative z-10 mb-3 max-h-36 overflow-y-auto rounded-xl bg-slate-950/60 border border-white/10 divide-y divide-white/10">
            {zipTracks.map((trk, idx) => (
              <button
                key={`${trk.name}-${idx}`}
                type="button"
                onClick={() => setActiveZipIndex(idx)}
                className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                  idx === activeZipIndex
                    ? 'bg-emerald-500/20 text-emerald-300 font-bold'
                    : 'text-slate-300 hover:bg-white/5'
                }`}
              >
                <span className="truncate">{trk.name}</span>
                {idx === activeZipIndex && <Play className="w-3 h-3 fill-current shrink-0" />}
              </button>
            ))}
          </div>
        )}

        {/* Bottom Actions: Unduh MP3 */}
        <div className="relative z-10 pt-2 border-t border-white/10">
          {onDownloadAgain && (
            <button
              type="button"
              onClick={() => onDownloadAgain(item)}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 active:scale-95 transition-transform duration-150 cursor-pointer"
            >
              <Download className="w-4 h-4 stroke-[2.5]" />
              <span>{item.extension === 'zip' ? 'Unduh Arsip ZIP' : 'Unduh Berkas MP3'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
});
