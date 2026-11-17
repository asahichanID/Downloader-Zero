import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  Download,
  User,
  Eye,
  Heart,
  MessageCircle,
  Play,
  Pause,
  Volume2,
  VolumeX,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Loader2,
  FileArchive,
  Film,
  Music,
  Image as ImageIcon,
  FileText,
  Check,
  Clock,
  AlertCircle,
  Disc3
} from 'lucide-react';
import type { MediaMetadata, MediaFormat, TeraboxFile, AudioTrack, ServerMode } from '../types/index.ts';
import { formatCount } from '../services/scraper.ts';

export type BerandaStage = 'idle' | 'preparing' | 'preview' | 'downloading' | 'completed';

export interface PreparedDownloadPayload {
  media: MediaMetadata;
  format: MediaFormat;
  resolvedUrl: string;
  previewProxyUrl: string;
}

interface BerandaResultViewProps {
  stage: Exclude<BerandaStage, 'idle'>;
  prepared: PreparedDownloadPayload | null;
  progress: number;
  statusText: string;
  errorMessage: string | null;
  completedCountdown: number;
  completedLabel?: string;
  serverMode?: ServerMode;
  selectedTeraboxFileIds: string[];
  onToggleTeraboxFile: (fileId: string) => void;
  selectedSpotifyTrackId: string | null;
  spotifyPlayTrigger?: number;
  spotifyTrackStatuses?: Record<string, 'downloading' | 'done' | 'error'>;
  photoDownloadStatuses?: Record<number, 'downloading' | 'done' | 'error'>;
  onSelectSpotifyTrack: (track: AudioTrack) => void;
  onDownloadSingleSpotifyTrack?: (track: AudioTrack) => void;
  onDownloadAllSpotifyZip?: () => void;
  onDownloadSinglePhoto?: (photoUrl: string, slideIndex: number) => void;
  onClickDownload: () => void;
  onBackToHome: () => void;
}

const formatSecs = (s: number) => {
  if (!s || isNaN(s) || s < 0) return '00:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};

interface AudioPreviewCardProps {
  audioUrl: string;
  title?: string;
  author?: string;
  genre?: string;
  thumbnail?: string;
  fallbackDuration?: number;
  playTrigger?: number;
  isPreviewClip?: boolean;
  onPlayingStateChange?: (playing: boolean) => void;
}

const AudioPreviewCard: React.FC<AudioPreviewCardProps> = React.memo(({
  audioUrl,
  title,
  author,
  genre,
  thumbnail,
  fallbackDuration,
  playTrigger = 0,
  isPreviewClip = false,
  onPlayingStateChange
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastTickRef = useRef<number>(0);
  const lastTriggerRef = useRef<number>(playTrigger);
  const [isAudioPlaying, setIsAudioPlaying] = useState<boolean>(false);
  const [audioCurrentTime, setAudioCurrentTime] = useState<number>(0);
  const [audioDuration, setAudioDuration] = useState<number>(fallbackDuration || 30);
  const [isAudioMuted, setIsAudioMuted] = useState<boolean>(false);
  const [isAudioLoading, setIsAudioLoading] = useState<boolean>(false);

  useEffect(() => {
    onPlayingStateChange?.(isAudioPlaying);
  }, [isAudioPlaying, onPlayingStateChange]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsAudioPlaying(false);
    setAudioCurrentTime(0);

    if (!audioUrl) return;

    const shouldAutoPlay = playTrigger > 0 && playTrigger !== lastTriggerRef.current;
    lastTriggerRef.current = playTrigger;

    const audio = new Audio();
    audio.src = audioUrl;
    audio.preload = 'metadata';

    audio.onloadedmetadata = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        setAudioDuration(audio.duration);
      } else {
        setAudioDuration(fallbackDuration || 30);
      }
    };
    audio.ontimeupdate = () => {
      const now = performance.now();
      if (now - lastTickRef.current < 240) return;
      lastTickRef.current = now;
      setAudioCurrentTime(audio.currentTime);
    };
    audio.onwaiting = () => setIsAudioLoading(true);
    audio.onplaying = () => {
      setIsAudioLoading(false);
      setIsAudioPlaying(true);
    };
    audio.onpause = () => setIsAudioPlaying(false);
    audio.onended = () => {
      setIsAudioPlaying(false);
      setAudioCurrentTime(0);
    };
    audio.onerror = () => {
      setIsAudioLoading(false);
      setIsAudioPlaying(false);
    };

    audioRef.current = audio;

    if (shouldAutoPlay) {
      setIsAudioLoading(true);
      audio.play().catch(() => setIsAudioLoading(false));
    }

    return () => {
      audio.pause();
      audio.src = '';
      audioRef.current = null;
    };
  }, [audioUrl, fallbackDuration]);

  // Toggle play/pause when user taps the currently active track row again
  useEffect(() => {
    if (playTrigger === 0 || playTrigger === lastTriggerRef.current) return;
    lastTriggerRef.current = playTrigger;
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [playTrigger]);

  const toggleAudioPlay = () => {
    if (!audioRef.current) return;
    if (isAudioPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(() => {});
    }
  };

  const toggleAudioMute = () => {
    if (!audioRef.current) return;
    audioRef.current.muted = !isAudioMuted;
    setIsAudioMuted(!isAudioMuted);
  };

  const handleAudioSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setAudioCurrentTime(val);
    if (audioRef.current) {
      audioRef.current.currentTime = val;
    }
  };

  return (
    <div className="relative rounded-2xl sm:rounded-3xl overflow-hidden bg-white dark:bg-[#091738] border border-slate-200 dark:border-blue-500/25 shadow-xl shadow-slate-900/10 dark:shadow-black/60 dz-contain-card">
      <div className="relative z-10 p-4 sm:p-6 bg-gradient-to-br from-emerald-50/60 via-white to-sky-50/60 dark:from-[#0b1f48] dark:via-[#091738] dark:to-[#07132e] space-y-5">
        <div className="flex items-center gap-4">
          <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden bg-slate-200 dark:bg-slate-900 ring-1 ring-black/10 dark:ring-white/15 shrink-0 shadow-lg">
            {thumbnail ? (
              <img
                src={thumbnail}
                alt={title || 'Cover audio'}
                decoding="async"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-emerald-500 bg-slate-900">
                <Disc3 className={`w-10 h-10 ${isAudioPlaying ? 'animate-spin' : ''}`} />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0 space-y-1">
            <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 truncate">
              {isPreviewClip ? 'Pratinjau Audio' : 'Audio MP3'} {genre ? `· ${genre}` : ''}
            </p>
            <p className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white truncate">
              {title}
            </p>
            <p className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300 truncate">
              {author}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={toggleAudioPlay}
            disabled={!audioUrl}
            className="w-12 h-12 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center justify-center shadow-lg shadow-emerald-500/25 shrink-0 cursor-pointer disabled:opacity-50 transition-transform duration-150 active:scale-95"
            aria-label={isAudioPlaying ? 'Jeda audio' : 'Putar audio'}
          >
            {isAudioLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : isAudioPlaying ? (
              <Pause className="w-5 h-5 fill-current" />
            ) : (
              <Play className="w-5 h-5 fill-current ml-0.5" />
            )}
          </button>

          <div className="flex-1 space-y-1.5">
            <input
              type="range"
              min={0}
              max={audioDuration || 30}
              step={0.2}
              value={audioCurrentTime}
              onChange={handleAudioSeek}
              className="w-full h-1.5 bg-slate-300 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
            <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
              <span>{formatSecs(audioCurrentTime)}</span>
              <span>{formatSecs(audioDuration || fallbackDuration || 30)}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={toggleAudioMute}
            className="w-11 h-11 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-900/90 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center cursor-pointer transition-colors duration-150"
            aria-label={isAudioMuted ? 'Batal bisukan' : 'Bisukan'}
          >
            {isAudioMuted ? <VolumeX className="w-4 h-4 text-red-500" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
});

export const BerandaResultView: React.FC<BerandaResultViewProps> = React.memo(({
  stage,
  prepared,
  progress,
  statusText,
  errorMessage,
  completedCountdown,
  completedLabel,
  serverMode = 'auto',
  selectedTeraboxFileIds,
  onToggleTeraboxFile,
  selectedSpotifyTrackId,
  spotifyPlayTrigger = 0,
  spotifyTrackStatuses = {},
  photoDownloadStatuses = {},
  onSelectSpotifyTrack,
  onDownloadSingleSpotifyTrack,
  onDownloadAllSpotifyZip,
  onDownloadSinglePhoto,
  onClickDownload,
  onBackToHome
}) => {
  const media = prepared?.media;
  const format = prepared?.format;

  const [photoIndex, setPhotoIndex] = useState<number>(0);
  const [videoError, setVideoError] = useState<boolean>(false);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState<boolean>(false);

  // Active TeraBox file being previewed (defaults to first selected or first file)
  const teraboxFiles: TeraboxFile[] = media?.files && media.files.length > 0
    ? media.files
    : media?.platform === 'terabox'
      ? [{
          id: media.id,
          filename: media.title || 'TeraBox_File.mp4',
          size: format?.filesize,
          sizeBytes: format?.filesizeBytes,
          extension: format?.extension || 'mp4',
          thumbnail: media.thumbnail,
          duration: media.duration,
          durationFormatted: media.durationFormatted,
          url: prepared?.resolvedUrl || format?.url || '',
          mediaType: format?.type === 'audio' ? 'audio' : format?.type === 'photos' ? 'photos' : 'video'
        }]
      : [];

  const [activeTeraboxPreviewId, setActiveTeraboxPreviewId] = useState<string>(
    teraboxFiles[0]?.id || ''
  );

  useEffect(() => {
    setVideoError(false);
    setPhotoIndex(0);
    if (teraboxFiles.length > 0) {
      setActiveTeraboxPreviewId(teraboxFiles[0].id);
    }
  }, [media?.id]);

  // Determine active Spotify track if playlist
  const spotifyTracks: AudioTrack[] = media?.tracks || [];
  const activeSpotifyTrack: AudioTrack | undefined =
    spotifyTracks.find((t) => t.id === selectedSpotifyTrackId) || spotifyTracks[0];

  const activeTeraboxFile: TeraboxFile | undefined =
    teraboxFiles.find((f) => f.id === activeTeraboxPreviewId) ||
    teraboxFiles.find((f) => selectedTeraboxFileIds.includes(f.id)) ||
    teraboxFiles[0];

  const isTerabox = media?.platform === 'terabox';
  const isSpotify = media?.platform === 'spotify';

  const effectiveMediaType: 'video' | 'audio' | 'photos' | 'file' = (() => {
    if (isTerabox && activeTeraboxFile) {
      return activeTeraboxFile.mediaType;
    }
    if (isSpotify) return 'audio';
    if (format?.type === 'audio') return 'audio';
    if (format?.type === 'photos' || (media?.isPhotoSlide && format?.type !== 'video')) return 'photos';
    return 'video';
  })();

  const buildInlineProxyUrl = (rawUrl: string, filename: string, track?: AudioTrack) => {
    if (!rawUrl || !rawUrl.startsWith('http')) return '';
    let href = `/api/proxy-download?url=${encodeURIComponent(rawUrl)}&filename=${encodeURIComponent(filename)}&platform=${encodeURIComponent(media?.platform || '')}&sourceUrl=${encodeURIComponent(media?.url || '')}&server=${encodeURIComponent(serverMode)}&inline=1`;
    if (media?.platform === 'spotify') {
      let customKey = '';
      try {
        customKey = localStorage.getItem('dz_neoxr_api_key') || '';
      } catch {}
      const tTitle = track?.title || media.title || '';
      const tArtist = track?.artist || media.author || '';
      const tAlbum = track?.album || media.album || '';
      const tCover = track?.thumbnail || media.thumbnail || '';
      const tDuration = track?.duration || media.duration || 0;
      href += `&title=${encodeURIComponent(tTitle)}&artist=${encodeURIComponent(tArtist)}&album=${encodeURIComponent(tAlbum)}&cover=${encodeURIComponent(tCover)}&duration=${tDuration}&apiKey=${encodeURIComponent(customKey)}`;
    }
    return href;
  };

  const activeVideoUrl = (() => {
    if (isTerabox && activeTeraboxFile) {
      return buildInlineProxyUrl(activeTeraboxFile.url, activeTeraboxFile.filename);
    }
    return prepared?.previewProxyUrl || '';
  })();

  const activeAudioUrl = (() => {
    if (isTerabox && activeTeraboxFile && activeTeraboxFile.mediaType === 'audio') {
      return buildInlineProxyUrl(activeTeraboxFile.url, activeTeraboxFile.filename);
    }
    if (isSpotify) {
      const spPreview = activeSpotifyTrack?.previewUrl || media?.previewUrl;
      if (spPreview && spPreview.startsWith('http')) {
        return spPreview;
      }
      if (activeSpotifyTrack) {
        const trackId = activeSpotifyTrack.id?.replace(/^sp-track-/, '') || '';
        const spUrl =
          activeSpotifyTrack.url?.startsWith('http') && !activeSpotifyTrack.url.includes('mp3-preview')
            ? activeSpotifyTrack.url
            : trackId
              ? `https://open.spotify.com/track/${trackId}`
              : (prepared?.resolvedUrl || '');
        if (spUrl.startsWith('http')) {
          return buildInlineProxyUrl(spUrl, `${activeSpotifyTrack.title || media?.title || 'audio'}.mp3`, activeSpotifyTrack);
        }
      }
      if (prepared?.previewProxyUrl) {
        return prepared.previewProxyUrl;
      }
    }
    return prepared?.previewProxyUrl || '';
  })();

  const activePhotos: string[] = (() => {
    if (isTerabox && activeTeraboxFile && activeTeraboxFile.mediaType === 'photos') {
      return [activeTeraboxFile.url];
    }
    if (media?.images && media.images.length > 0) return media.images;
    if (media?.thumbnail) return [media.thumbnail];
    return [];
  })();

  const platformLabel =
    media?.platform === 'twitter'
      ? 'Twitter (X)'
      : media?.platform
        ? media.platform.charAt(0).toUpperCase() + media.platform.slice(1)
        : 'Media';

  const displayTitle = isSpotify && activeSpotifyTrack
    ? activeSpotifyTrack.title
    : isTerabox && activeTeraboxFile
      ? activeTeraboxFile.filename
      : media?.title;

  const displayAuthor = isSpotify && activeSpotifyTrack
    ? activeSpotifyTrack.artist
    : media?.author;

  const displayThumbnail = isSpotify && activeSpotifyTrack
    ? (activeSpotifyTrack.thumbnail || media?.thumbnail)
    : isTerabox && activeTeraboxFile
      ? (activeTeraboxFile.thumbnail || media?.thumbnail)
      : media?.thumbnail;

  const displayDuration = isSpotify && activeSpotifyTrack
    ? activeSpotifyTrack.durationFormatted
    : isTerabox && activeTeraboxFile
      ? activeTeraboxFile.durationFormatted
      : media?.durationFormatted;

  // ==================== STAGE 1: PREPARING ====================
  if (stage === 'preparing') {
    return (
      <div className="w-full py-6 sm:py-10 space-y-6 dz-animate-enter">
        <div className="flex flex-col items-center text-center space-y-5 max-w-md mx-auto">
          {displayThumbnail ? (
            <div className="relative w-28 h-20 rounded-2xl overflow-hidden shadow-xl ring-1 ring-slate-900/10 dark:ring-white/15">
              <img
                src={displayThumbnail}
                alt={displayTitle || 'Media'}
                decoding="async"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover opacity-80"
              />
              <div className="absolute inset-0 bg-slate-950/45 flex items-center justify-center">
                <Loader2 className="w-7 h-7 text-cyan-400 animate-spin" />
              </div>
            </div>
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-sky-100 dark:bg-blue-600/20 border border-sky-300 dark:border-cyan-400/40 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-sky-600 dark:text-cyan-400 animate-spin" />
            </div>
          )}

          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-sky-600 dark:text-cyan-400">
              {platformLabel} · {format?.resolution || format?.quality || 'Memproses'}
            </p>
            <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white line-clamp-2 text-balance">
              {displayTitle || 'Menyiapkan pratinjau media...'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {statusText || 'Menghubungkan ke server media untuk menyiapkan pratinjau...'}
            </p>
          </div>

          <div className="w-full space-y-2 pt-1">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
              <span>Progres Persiapan</span>
              <span className="font-mono tabular-nums text-sky-600 dark:text-cyan-400">{progress}%</span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800/90 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-600 via-sky-500 to-cyan-400 transition-[width] duration-200 rounded-full"
                style={{ width: `${Math.max(8, progress)}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==================== STAGE 3: DOWNLOADING ====================
  if (stage === 'downloading') {
    return (
      <div className="w-full py-6 sm:py-10 space-y-6 dz-animate-enter">
        <div className="flex flex-col items-center text-center space-y-5 max-w-md mx-auto">
          {displayThumbnail ? (
            <div className="relative w-28 h-20 rounded-2xl overflow-hidden shadow-xl ring-1 ring-sky-500/30 dark:ring-cyan-400/30">
              <img
                src={displayThumbnail}
                alt={displayTitle || 'Media'}
                decoding="async"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover opacity-80"
              />
              <div className="absolute inset-0 bg-slate-950/45 flex items-center justify-center">
                <Loader2 className="w-7 h-7 text-cyan-400 animate-spin" />
              </div>
            </div>
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-sky-100 dark:bg-blue-600/25 border border-sky-300 dark:border-cyan-400/50 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-sky-600 dark:text-cyan-400 animate-spin" />
            </div>
          )}

          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-sky-600 dark:text-cyan-400">
              Sedang Mengunduh · {platformLabel}
            </p>
            <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white line-clamp-2 text-balance">
              {displayTitle || 'Media'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {statusText || 'Mengunduh berkas ke penyimpanan perangkat...'}
            </p>
          </div>

          <div className="w-full space-y-2 pt-1">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
              <span>Mengunduh Berkas</span>
              <span className="font-mono tabular-nums text-sky-600 dark:text-cyan-400">{progress}%</span>
            </div>
            <div className="w-full h-2.5 rounded-full bg-slate-200 dark:bg-slate-800/90 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-600 via-sky-500 to-cyan-400 transition-[width] duration-150 rounded-full"
                style={{ width: `${Math.max(5, progress)}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==================== STAGE 4: COMPLETED (CHECKMARK + 3s AUTO RETURN) ====================
  if (stage === 'completed') {
    return (
      <div className="w-full py-8 sm:py-12 dz-animate-scale">
        <div className="flex flex-col items-center text-center space-y-4 max-w-md mx-auto">
          <div className="w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-500/20 border-2 border-emerald-500 dark:border-emerald-400 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <CheckCircle2 className="w-11 h-11 text-emerald-600 dark:text-emerald-400" />
          </div>

          <div className="space-y-1.5">
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              {completedLabel || (effectiveMediaType === 'audio' ? 'Audio Terunduh!' : effectiveMediaType === 'photos' ? 'Foto Terunduh!' : 'Video Terunduh!')}
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 line-clamp-2">
              {displayTitle || 'Berkas berhasil disimpan ke perangkat Anda.'}
            </p>
          </div>

          <div className="inline-flex items-center gap-2 pt-2 text-xs font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
            <Clock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Kembali ke Beranda dalam {completedCountdown} detik...</span>
          </div>
        </div>
      </div>
    );
  }

  // ==================== STAGE 2: MULTI-SECTION PREMIUM PREVIEW RESULT VIEW ====================
  if (!media || !format) return null;

  const qualitySummary = isTerabox
    ? `${teraboxFiles.length} File · ${selectedTeraboxFileIds.length} Dipilih`
    : `${format.resolution || format.quality}${format.filesize ? ` · ${format.filesize}` : ''}`;

  return (
    <div className="w-full space-y-5 sm:space-y-6 dz-animate-enter">
      {/* ZONE 1: Minimal Floating Top Bar (Back Button + Clean Unboxed Metadata) */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBackToHome}
          className="min-h-[44px] inline-flex items-center gap-2 pr-3 rounded-full text-slate-700 dark:text-slate-200 hover:text-sky-600 dark:hover:text-cyan-400 active:scale-[0.98] transition-colors duration-150 cursor-pointer group"
          aria-label="Kembali ke Beranda"
        >
          <span className="w-9 h-9 rounded-full bg-white dark:bg-[#0a1838] border border-slate-200 dark:border-blue-500/25 group-hover:border-sky-400 dark:group-hover:border-cyan-400/60 flex items-center justify-center shadow-xs transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </span>
          <span className="text-sm font-bold whitespace-nowrap">Kembali</span>
        </button>

        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 tabular-nums truncate">
          <span className="text-sky-600 dark:text-cyan-400 font-bold">{platformLabel}</span>
          <span aria-hidden="true">·</span>
          <span className="truncate">{isTerabox ? `${teraboxFiles.length} File` : (format.resolution || format.quality)}</span>
          {displayDuration && displayDuration !== '00:00' && (
            <>
              <span aria-hidden="true">·</span>
              <span>{displayDuration}</span>
            </>
          )}
        </div>
      </div>

      {/* ZONE 2: Standalone Hero Media Showcase (Edge-to-Edge Cinema Frame, NOT inside an info box) */}
      {effectiveMediaType === 'video' && (
        <div className="relative w-full aspect-video max-h-[440px] rounded-2xl sm:rounded-3xl overflow-hidden bg-slate-950 ring-1 ring-slate-900/10 dark:ring-white/10 shadow-2xl shadow-slate-900/20 dark:shadow-black/80">
          {activeVideoUrl && !videoError ? (
            <video
              key={activeVideoUrl}
              src={activeVideoUrl}
              poster={displayThumbnail || undefined}
              controls
              playsInline
              preload="metadata"
              onError={() => setVideoError(true)}
              className="w-full h-full object-contain bg-black"
            />
          ) : (
            <div className="relative w-full h-full flex flex-col items-center justify-center bg-slate-900 text-slate-200">
              {displayThumbnail && (
                <img
                  src={displayThumbnail}
                  alt={displayTitle || 'Preview video'}
                  referrerPolicy="no-referrer"
                  className="absolute inset-0 w-full h-full object-cover opacity-55"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/20" />
              <div className="relative z-10 flex flex-col items-center gap-2.5 p-5 text-center max-w-xs">
                <div className="w-12 h-12 rounded-full bg-white/15 border border-white/25 flex items-center justify-center">
                  <Film className="w-6 h-6 text-cyan-300" />
                </div>
                <p className="text-xs sm:text-sm font-semibold text-white leading-relaxed">
                  Pratinjau streaming tidak tersedia, media siap langsung diunduh
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {effectiveMediaType === 'audio' && (
        <AudioPreviewCard
          audioUrl={activeAudioUrl}
          title={displayTitle}
          author={displayAuthor}
          genre={media.genre}
          thumbnail={displayThumbnail}
          fallbackDuration={activeSpotifyTrack?.previewUrl ? 30 : (activeSpotifyTrack?.duration || media.duration)}
          playTrigger={isSpotify && spotifyTracks.length > 1 ? spotifyPlayTrigger : 0}
          isPreviewClip={isSpotify && Boolean(activeSpotifyTrack?.previewUrl || media.previewUrl)}
          onPlayingStateChange={setIsPreviewPlaying}
        />
      )}

      {effectiveMediaType === 'photos' && (
        <div className="space-y-3">
          <div className="relative w-full aspect-square sm:aspect-[16/10] max-h-[420px] mx-auto rounded-2xl sm:rounded-3xl overflow-hidden bg-slate-950 ring-1 ring-slate-900/10 dark:ring-white/10 shadow-2xl shadow-slate-900/20 dark:shadow-black/80">
            {activePhotos[photoIndex] ? (
              <img
                src={activePhotos[photoIndex]}
                alt={`${displayTitle} (${photoIndex + 1})`}
                decoding="async"
                referrerPolicy="no-referrer"
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-400">
                <ImageIcon className="w-12 h-12" />
              </div>
            )}

            {activePhotos.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => setPhotoIndex((p) => (p > 0 ? p - 1 : activePhotos.length - 1))}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/75 hover:bg-black/90 text-white flex items-center justify-center border border-white/20 cursor-pointer transition-transform duration-150 active:scale-95"
                  aria-label="Foto sebelumnya"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => setPhotoIndex((p) => (p < activePhotos.length - 1 ? p + 1 : 0))}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/75 hover:bg-black/90 text-white flex items-center justify-center border border-white/20 cursor-pointer transition-transform duration-150 active:scale-95"
                  aria-label="Foto berikutnya"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
                <div className="absolute bottom-3 right-3 px-2.5 py-1 rounded-lg bg-black/80 text-white text-xs font-mono tabular-nums font-bold">
                  {photoIndex + 1} / {activePhotos.length}
                </div>
              </>
            )}
          </div>

          {/* Direct Thumbnail Strip & Single-Photo Serial Download for Multi-Photo Slides ONLY */}
          {activePhotos.length > 1 && (
            <>
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {activePhotos.map((imgUrl, idx) => {
                  const active = idx === photoIndex;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setPhotoIndex(idx)}
                      className={`relative w-14 h-14 rounded-xl overflow-hidden shrink-0 cursor-pointer transition-opacity duration-150 ${
                        active
                          ? 'ring-2 ring-sky-500 dark:ring-cyan-400 opacity-100 scale-[1.03]'
                          : 'opacity-65 hover:opacity-95 ring-1 ring-slate-300 dark:ring-slate-700'
                      }`}
                      aria-label={`Pilih foto ${idx + 1}`}
                    >
                      <img
                        src={imgUrl}
                        alt={`Slide ${idx + 1}`}
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                      <span className="absolute bottom-1 left-1 px-1 py-0.5 rounded bg-black/80 text-white text-[10px] font-mono tabular-nums font-bold leading-none">
                        {idx + 1}
                      </span>
                    </button>
                  );
                })}
              </div>

              {(() => {
                const currentPhotoUrl = activePhotos[photoIndex];
                const singleStatus = photoDownloadStatuses[photoIndex];
                return (
                  <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-2xl bg-white/95 dark:bg-[#091635]/95 border border-slate-200 dark:border-blue-500/20 shadow-sm">
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                        Foto #{photoIndex + 1} dari {activePhotos.length}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        Simpan 1 gambar ini saja
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        if (currentPhotoUrl && singleStatus !== 'downloading') {
                          onDownloadSinglePhoto?.(currentPhotoUrl, photoIndex);
                        }
                      }}
                      disabled={!currentPhotoUrl || singleStatus === 'downloading'}
                      aria-label={`Unduh Foto #${photoIndex + 1}`}
                      className={`min-h-[44px] px-4 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shrink-0 transition-colors duration-150 cursor-pointer active:scale-[0.98] disabled:opacity-60 ${
                        singleStatus === 'done'
                          ? 'bg-teal-700 hover:bg-teal-600 text-white'
                          : singleStatus === 'error'
                            ? 'bg-rose-600 hover:bg-rose-500 text-white'
                            : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm'
                      }`}
                    >
                      {singleStatus === 'downloading' ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Mengunduh #{photoIndex + 1}...</span>
                        </>
                      ) : singleStatus === 'done' ? (
                        <>
                          <Check className="w-4 h-4 stroke-[2.5]" />
                          <span>Foto #{photoIndex + 1} Terunduh</span>
                        </>
                      ) : singleStatus === 'error' ? (
                        <>
                          <AlertCircle className="w-4 h-4" />
                          <span>Coba Foto #{photoIndex + 1}</span>
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4 stroke-[2.2]" />
                          <span>Unduh Foto #{photoIndex + 1}</span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })()}
            </>
          )}
        </div>
      )}

      {effectiveMediaType === 'file' && activeTeraboxFile && (
        <div className="p-5 sm:p-6 rounded-2xl sm:rounded-3xl bg-white dark:bg-[#0a1838] border border-slate-200 dark:border-blue-500/25 shadow-lg shadow-slate-900/5 dark:shadow-black/50 flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-sky-100 dark:bg-blue-600/20 border border-sky-200 dark:border-cyan-400/30 flex items-center justify-center text-sky-600 dark:text-cyan-400 shrink-0">
            <FileArchive className="w-8 h-8" />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-base font-bold text-slate-900 dark:text-white truncate">
              {activeTeraboxFile.filename}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-mono">
              {activeTeraboxFile.extension} {activeTeraboxFile.size ? `· ${activeTeraboxFile.size}` : ''}
            </p>
          </div>
        </div>
      )}

      {/* ZONE 3: Open Editorial Title, Author & Unified Metric Strip (NOT boxed inside the player!) */}
      <div className="space-y-4 px-0.5">
        <div className="space-y-2">
          <h1 className="text-lg sm:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-snug text-balance">
            {displayTitle || 'Media DownloaderZero'}
          </h1>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300">
            <span className="inline-flex items-center gap-1.5">
              <User className="w-4 h-4 text-sky-600 dark:text-cyan-400 shrink-0" />
              <span className="font-semibold text-slate-800 dark:text-slate-100">
                {displayAuthor || 'Creator'}
              </span>
            </span>
            {media.album && (
              <>
                <span aria-hidden="true" className="text-slate-400">·</span>
                <span className="text-slate-500 dark:text-slate-400 truncate">{media.album}</span>
              </>
            )}
          </div>
        </div>

        {/* Sleek Unified Metric Strip with Hairline Dividers */}
        <div className="grid grid-cols-3 divide-x divide-slate-200 dark:divide-blue-800/60 rounded-2xl bg-white/90 dark:bg-[#091635]/90 border border-slate-200/90 dark:border-blue-500/20 shadow-sm">
          <div className="py-3.5 px-3 flex flex-col items-center text-center gap-1">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              <Eye className="w-3.5 h-3.5 text-sky-600 dark:text-cyan-400" />
              <span>Views</span>
            </span>
            <span className="text-sm sm:text-base font-extrabold tabular-nums text-slate-900 dark:text-white">
              {formatCount(media.views)}
            </span>
          </div>

          <div className="py-3.5 px-3 flex flex-col items-center text-center gap-1">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              <Heart className="w-3.5 h-3.5 text-rose-500 dark:text-rose-400" />
              <span>Like</span>
            </span>
            <span className="text-sm sm:text-base font-extrabold tabular-nums text-slate-900 dark:text-white">
              {formatCount(media.likes)}
            </span>
          </div>

          <div className="py-3.5 px-3 flex flex-col items-center text-center gap-1">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              <MessageCircle className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
              <span>Komen</span>
            </span>
            <span className="text-sm sm:text-base font-extrabold tabular-nums text-slate-900 dark:text-white">
              {formatCount(media.comments)}
            </span>
          </div>
        </div>
      </div>

      {/* ZONE 4: Standalone File / Track Selector Section (TeraBox max 2 files, Spotify 1 track) */}
      {isTerabox && teraboxFiles.length > 0 && (
        <section aria-label="Pilih File TeraBox" className="space-y-2.5">
          <div className="flex items-end justify-between gap-2 px-0.5">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                Pilih File TeraBox
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Ketuk untuk mempratinjau dan pilih hingga 2 file sekaligus
              </p>
            </div>
            <span className="text-xs font-mono tabular-nums font-bold text-sky-600 dark:text-cyan-400 shrink-0">
              {selectedTeraboxFileIds.length} / 2 dipilih
            </span>
          </div>

          <div className="rounded-2xl bg-white/95 dark:bg-[#091635]/95 border border-slate-200 dark:border-blue-500/25 divide-y divide-slate-100 dark:divide-blue-900/50 overflow-hidden shadow-sm max-h-64 overflow-y-auto">
            {teraboxFiles.map((file, idx) => {
              const isSelected = selectedTeraboxFileIds.includes(file.id);
              const isPreviewing = activeTeraboxFile?.id === file.id;
              const FileIcon =
                file.mediaType === 'video'
                  ? Film
                  : file.mediaType === 'audio'
                    ? Music
                    : file.mediaType === 'photos'
                      ? ImageIcon
                      : FileText;

              return (
                <button
                  key={file.id}
                  type="button"
                  onClick={() => {
                    setActiveTeraboxPreviewId(file.id);
                    setVideoError(false);
                    onToggleTeraboxFile(file.id);
                  }}
                  className={`w-full min-h-[60px] px-3.5 sm:px-4 py-3 text-left flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-sky-50/90 dark:bg-blue-900/30'
                      : 'hover:bg-slate-50 dark:hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="text-xs font-mono tabular-nums font-bold text-slate-400 dark:text-slate-500 w-5 text-center shrink-0">
                      {String(idx + 1).padStart(2, '0')}
                    </span>

                    <div className="w-10 h-10 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-blue-800/50 flex items-center justify-center shrink-0">
                      {file.thumbnail ? (
                        <img
                          src={file.thumbnail}
                          alt={file.filename}
                          loading="lazy"
                          decoding="async"
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <FileIcon className="w-5 h-5 text-sky-600 dark:text-cyan-400" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                        {file.filename}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5 truncate">
                        <span className="uppercase font-mono">{file.extension}</span>
                        {file.size && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{file.size}</span>
                          </>
                        )}
                        {isPreviewing && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-sky-600 dark:text-cyan-400 font-semibold">Sedang dipratinjau</span>
                          </>
                        )}
                      </p>
                    </div>
                  </div>

                  <div
                    className={`w-6 h-6 rounded-lg flex items-center justify-center border shrink-0 transition-colors ${
                      isSelected
                        ? 'bg-sky-600 dark:bg-cyan-400 border-sky-600 dark:border-cyan-400 text-white dark:text-slate-950'
                        : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-transparent'
                    }`}
                  >
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {isSpotify && spotifyTracks.length > 1 && (
        <section aria-label="Daftar Lagu Spotify" className="space-y-2.5">
          <div className="flex items-end justify-between gap-2 px-0.5">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                Daftar Lagu Playlist
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Ketuk lagu untuk memutar pratinjau • Ketuk ikon unduh untuk 1 lagu
              </p>
            </div>
            <span className="text-xs font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
              {spotifyTracks.length} Lagu
            </span>
          </div>

          <div className="rounded-2xl bg-white/95 dark:bg-[#091635]/95 border border-slate-200 dark:border-blue-500/25 divide-y divide-slate-100 dark:divide-blue-900/50 overflow-hidden shadow-sm max-h-[400px] overflow-y-auto">
            {spotifyTracks.map((trk, idx) => {
              const isSelected = activeSpotifyTrack?.id === trk.id;
              const isTrackPlaying = isSelected && isPreviewPlaying;
              const trkStatus = spotifyTrackStatuses[trk.id];

              return (
                <div
                  key={trk.id || idx}
                  className={`w-full min-h-[64px] px-3 sm:px-4 py-2.5 flex items-center justify-between gap-2.5 transition-colors ${
                    isSelected
                      ? 'bg-emerald-50/90 dark:bg-emerald-950/35'
                      : 'hover:bg-slate-50 dark:hover:bg-white/5'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectSpotifyTrack(trk)}
                    className="flex-1 min-w-0 flex items-center gap-3 text-left cursor-pointer py-0.5"
                    aria-label={isTrackPlaying ? `Jeda pratinjau ${trk.title}` : `Putar pratinjau ${trk.title}`}
                  >
                    <span className="w-6 flex items-center justify-center shrink-0 text-xs font-mono tabular-nums font-bold text-slate-400 dark:text-slate-500">
                      {isSelected ? (
                        isTrackPlaying ? (
                          <Pause className="w-4 h-4 text-emerald-600 dark:text-emerald-400 fill-current" />
                        ) : (
                          <Play className="w-4 h-4 text-emerald-600 dark:text-emerald-400 fill-current" />
                        )
                      ) : (
                        String(idx + 1).padStart(2, '0')
                      )}
                    </span>

                    <div className="relative w-11 h-11 rounded-xl overflow-hidden shrink-0 border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 flex items-center justify-center">
                      {trk.thumbnail || media.thumbnail ? (
                        <img
                          src={trk.thumbnail || media.thumbnail}
                          alt={trk.title}
                          loading="lazy"
                          decoding="async"
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Music className="w-5 h-5 text-emerald-500" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className={`text-xs sm:text-sm font-bold truncate ${
                        isSelected ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-900 dark:text-white'
                      }`}>
                        {trk.title}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5 flex items-center gap-1.5">
                        <span className="truncate">{trk.artist}</span>
                        {trk.durationFormatted && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums shrink-0">{trk.durationFormatted}</span>
                          </>
                        )}
                        {isTrackPlaying && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-emerald-600 dark:text-emerald-400 font-semibold shrink-0">Memutar pratinjau</span>
                          </>
                        )}
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (trkStatus !== 'downloading') {
                        onDownloadSingleSpotifyTrack?.(trk);
                      }
                    }}
                    disabled={trkStatus === 'downloading'}
                    title={`Unduh lagu penuh: ${trk.title}`}
                    aria-label={`Unduh lagu penuh ${trk.title}`}
                    className={`min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center border shrink-0 transition-colors cursor-pointer active:scale-95 ${
                      trkStatus === 'done'
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
                        : trkStatus === 'error'
                          ? 'bg-red-500/10 border-red-400/40 text-red-600 dark:text-red-400'
                          : 'bg-slate-100 hover:bg-emerald-500 hover:text-white dark:bg-slate-900/90 dark:hover:bg-emerald-500 dark:hover:text-slate-950 border-slate-200 dark:border-blue-500/25 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    {trkStatus === 'downloading' ? (
                      <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
                    ) : trkStatus === 'done' ? (
                      <Check className="w-4 h-4 stroke-[2.5]" />
                    ) : trkStatus === 'error' ? (
                      <AlertCircle className="w-4 h-4" />
                    ) : (
                      <Download className="w-4 h-4 stroke-[2.2]" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Error notice if download attempt failed */}
      {errorMessage && (
        <div className="p-3.5 rounded-2xl bg-red-50 dark:bg-red-950/80 border border-red-200 dark:border-red-800/80 text-red-700 dark:text-red-200 text-xs flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-red-500 dark:text-red-400 shrink-0 mt-0.5" />
          <span className="leading-relaxed">{errorMessage}</span>
        </div>
      )}

      {/* ZONE 5: Dedicated Primary Download Action */}
      <div className="space-y-2 pt-1">
        {isSpotify && spotifyTracks.length > 1 ? (
          <>
            <button
              type="button"
              onClick={() => (onDownloadAllSpotifyZip ? onDownloadAllSpotifyZip() : onClickDownload())}
              className="w-full h-13 sm:h-14 rounded-full bg-gradient-to-r from-[#1864f7] via-[#1d74fe] to-[#00b4d8] hover:from-[#1354d4] hover:to-[#009ec0] active:scale-[0.985] text-white font-bold flex items-center justify-center gap-2.5 shadow-xl shadow-blue-600/25 transition-transform duration-150 text-sm sm:text-base cursor-pointer"
            >
              <FileArchive className="w-5 h-5 stroke-[2.2]" />
              <span className="whitespace-nowrap">
                Unduh Semua ({spotifyTracks.length} Lagu · ZIP)
              </span>
            </button>
            <p className="text-center text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {spotifyTracks.length > 10
                ? `Semua ${spotifyTracks.length} lagu penuh MP3 dikemas ke 1 ZIP (maks 10 paralel, sisanya mengantri)`
                : `Semua ${spotifyTracks.length} lagu penuh MP3 dikemas menjadi 1 file ZIP`}
            </p>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onClickDownload}
              disabled={isTerabox && selectedTeraboxFileIds.length === 0}
              className="w-full h-13 sm:h-14 rounded-full bg-gradient-to-r from-[#1864f7] via-[#1d74fe] to-[#00b4d8] hover:from-[#1354d4] hover:to-[#009ec0] active:scale-[0.985] text-white font-bold flex items-center justify-center gap-2.5 shadow-xl shadow-blue-600/25 transition-transform duration-150 text-sm sm:text-base cursor-pointer disabled:opacity-50"
            >
              <Download className="w-5 h-5 stroke-[2.5]" />
              <span className="whitespace-nowrap">
                {isTerabox && selectedTeraboxFileIds.length > 1
                  ? `Download (${selectedTeraboxFileIds.length} File)`
                  : 'Download'}
              </span>
            </button>

            <p className="text-center text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Siap disimpan · {qualitySummary}
            </p>
          </>
        )}
      </div>
    </div>
  );
});
