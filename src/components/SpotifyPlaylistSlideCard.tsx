import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  Download,
  Archive,
  Music,
  CheckCircle2,
  Clock,
  Disc3,
  ListMusic,
  Volume2,
  VolumeX,
  Sparkles,
  Loader2,
  ExternalLink
} from 'lucide-react';
import JSZip from 'jszip';
import type { MediaMetadata, AudioTrack } from '../types/index.ts';
import { saveDownloadedMedia } from '../services/historyStorage.ts';

interface SpotifyPlaylistSlideCardProps {
  media: MediaMetadata;
}

export const SpotifyPlaylistSlideCard: React.FC<SpotifyPlaylistSlideCardProps> = ({ media }) => {
  const tracks: AudioTrack[] = media.tracks && media.tracks.length > 0 ? media.tracks : [
    {
      id: 'sp-fallback-1',
      title: media.title,
      artist: media.author,
      thumbnail: media.thumbnail,
      url: media.formats[0]?.url || media.url,
      previewUrl: media.formats[0]?.url,
      duration: media.duration,
      durationFormatted: media.durationFormatted
    }
  ];

  const total = tracks.length;
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const currentTrack = tracks[currentIndex] || tracks[0];

  // Audio Playback states (streaming preview outside the thumbnail box)
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isAudioLoading, setIsAudioLoading] = useState<boolean>(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Background ZIP Packaging state
  const [zipProgressPercent, setZipProgressPercent] = useState<number>(0);
  const [zipLoadedCount, setZipLoadedCount] = useState<number>(0);
  const [isZipReady, setIsZipReady] = useState<boolean>(false);
  const [zipBlob, setZipBlob] = useState<Blob | null>(null);
  const [isZippingUserTriggered, setIsZippingUserTriggered] = useState<boolean>(false);
  const [isDownloadingSingle, setIsDownloadingSingle] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showTracklistDrawer, setShowTracklistDrawer] = useState<boolean>(false);

  // Stop previous audio and load new audio preview on track change
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlaying(false);
    setCurrentTime(0);

    const streamUrl = currentTrack.previewUrl || currentTrack.url;
    if (streamUrl && streamUrl.startsWith('http')) {
      const audio = new Audio();
      // Stream audio cleanly
      audio.src = `/api/proxy-download?url=${encodeURIComponent(streamUrl)}&filename=preview_${currentIndex}.mp3&platform=spotify&inline=1`;
      audio.preload = 'metadata';

      audio.onloadedmetadata = () => {
        setAudioDuration(audio.duration || currentTrack.duration || 30);
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

      audioRef.current = audio;
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [currentIndex, currentTrack.previewUrl, currentTrack.url]);

  // Toggle Audio Playback
  const handleTogglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch((err) => {
        console.warn('Audio playback notice:', err);
      });
    }
  };

  // Toggle Mute
  const handleToggleMute = () => {
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  // Handle Seek on audio track timeline
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = Number(e.target.value);
    setCurrentTime(newTime);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
  };

  // Navigation handlers
  const handlePrev = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : total - 1));
  };

  const handleNext = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCurrentIndex((prev) => (prev < total - 1 ? prev + 1 : 0));
  };

  // 1. BACKGROUND ZIP PACKAGING (Executes immediately in parallel with preview display)
  useEffect(() => {
    let isCancelled = false;

    const bundleZipInBackground = async () => {
      try {
        const zip = new JSZip();
        const sanitizedTitle = (media.title || 'Spotify_Playlist')
          .slice(0, 30)
          .replace(/[^a-zA-Z0-9_-]/g, '_');
        const folder = zip.folder(sanitizedTitle) || zip;

        const downloadedBlobs: { filename: string; blob: Blob }[] = [];

        // Concurrently/sequentially fetch tracks through proxy
        for (let i = 0; i < tracks.length; i++) {
          if (isCancelled) return;
          const trk = tracks[i];
          const trackId = trk.id?.replace(/^sp-track-/, '') || '';
          const rawUrl = trk.url?.startsWith('http') && !trk.url.includes('mp3-preview')
            ? trk.url
            : (trackId ? `https://open.spotify.com/track/${trackId}` : (trk.previewUrl || trk.url));
          const sanitizedSong = `${(i + 1).toString().padStart(2, '0')}_${trk.artist}_${trk.title}`
            .slice(0, 40)
            .replace(/[^a-zA-Z0-9_-]/g, '_');
          const filename = `${sanitizedSong}.mp3`;

          try {
            const trackCover = trk.thumbnail || media.thumbnail || '';
            const trackAlbum = trk.album || media.album || media.title || '';
            const proxyUrl = `/api/proxy-download?url=${encodeURIComponent(rawUrl)}&filename=${encodeURIComponent(filename)}&platform=spotify&sourceUrl=${encodeURIComponent(rawUrl)}&bitrate=320k&title=${encodeURIComponent(trk.title || '')}&artist=${encodeURIComponent(trk.artist || '')}&album=${encodeURIComponent(trackAlbum)}&cover=${encodeURIComponent(trackCover)}&duration=${trk.duration || 0}`;
            const res = await fetch(proxyUrl);
            if (res.ok) {
              const b = await res.blob();
              folder.file(filename, b);
              downloadedBlobs.push({ filename, blob: b });
            }
          } catch (e) {
            console.warn(`Track ${i + 1} download notice:`, e);
          }

          if (isCancelled) return;
          setZipLoadedCount(i + 1);
          setZipProgressPercent(Math.round(((i + 1) / tracks.length) * 85));
        }

        if (isCancelled) return;
        setZipProgressPercent(90);

        // Generate the finalized ZIP blob
        const generatedBlob = await zip.generateAsync(
          {
            type: 'blob',
            compression: 'DEFLATE',
            compressionOptions: { level: 5 }
          },
          (metadata) => {
            if (!isCancelled) {
              setZipProgressPercent(90 + Math.round((metadata.percent / 100) * 10));
            }
          }
        );

        if (isCancelled) return;
        setZipBlob(generatedBlob);
        setIsZipReady(true);
        setZipProgressPercent(100);
      } catch (err) {
        console.warn('Background ZIP generator error:', err);
      }
    };

    bundleZipInBackground();

    return () => {
      isCancelled = true;
    };
  }, [media.id, media.title, tracks]);

  // 2. TRIGGER INSTANT ZIP DOWNLOAD
  const handleDownloadAllZip = () => {
    const sanitizedTitle = (media.title || 'Spotify_Playlist')
      .slice(0, 30)
      .replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `DownloaderZero_${sanitizedTitle}_AllTracks.zip`;

    if (isZipReady && zipBlob) {
      // Instant save from prepared in-memory blob! 0ms wait!
      saveBlobLocally(zipBlob, filename);
      setToastMessage('Koleksi playlist ZIP tersimpan otomatis!');
      setTimeout(() => setToastMessage(null), 3500);

      // Save to local history
      saveDownloadedMedia({
        sourceUrl: media.url,
        platform: 'spotify',
        title: media.title,
        author: media.author,
        thumbnail: media.thumbnail,
        quality: `ZIP Album (${total} Lagu)`,
        resolution: 'Audio ZIP',
        mediaType: 'audio',
        extension: 'zip',
        filename,
        filesize: `${(zipBlob.size / (1024 * 1024)).toFixed(1)} MB`,
        filesizeBytes: zipBlob.size,
        blob: zipBlob
      }).catch(() => {});
    } else {
      // If user clicked while still packing in background, mark as triggered
      setIsZippingUserTriggered(true);
      setToastMessage(`Sedang merampungkan ZIP (${zipLoadedCount}/${total} lagu)... Tunggu sebentar.`);
    }
  };

  // Watch for background zip finishing if user already clicked download
  useEffect(() => {
    if (isZippingUserTriggered && isZipReady && zipBlob) {
      const sanitizedTitle = (media.title || 'Spotify_Playlist')
        .slice(0, 30)
        .replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `DownloaderZero_${sanitizedTitle}_AllTracks.zip`;
      saveBlobLocally(zipBlob, filename);
      setIsZippingUserTriggered(false);
      setToastMessage('Semua lagu telah berhasil dikemas & tersimpan!');
      setTimeout(() => setToastMessage(null), 3500);
    }
  }, [isZippingUserTriggered, isZipReady, zipBlob, media.title]);

  // 3. DOWNLOAD SINGLE TRACK
  const handleDownloadSingleTrack = async (trk: AudioTrack, idx: number) => {
    if (isDownloadingSingle) return;
    setIsDownloadingSingle(true);

    try {
      const sanitizedSong = `${trk.artist}_${trk.title}`
        .slice(0, 35)
        .replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `DownloaderZero_${sanitizedSong}.mp3`;
      const trackId = trk.id?.replace(/^sp-track-/, '') || '';
      const dlUrl = trk.url?.startsWith('http') && !trk.url.includes('mp3-preview')
        ? trk.url
        : (trackId ? `https://open.spotify.com/track/${trackId}` : (trk.previewUrl || trk.url));
      const trackCover = trk.thumbnail || media.thumbnail || '';
      const trackAlbum = trk.album || media.album || media.title || '';

      const proxyUrl = `/api/proxy-download?url=${encodeURIComponent(dlUrl)}&filename=${encodeURIComponent(filename)}&platform=spotify&sourceUrl=${encodeURIComponent(dlUrl)}&bitrate=320k&title=${encodeURIComponent(trk.title || '')}&artist=${encodeURIComponent(trk.artist || '')}&album=${encodeURIComponent(trackAlbum)}&cover=${encodeURIComponent(trackCover)}&duration=${trk.duration || 0}`;
      const res = await fetch(proxyUrl);
      if (!res.ok) throw new Error('Gagal mengunduh audio lagu.');

      const blob = await res.blob();
      saveBlobLocally(blob, filename);

      setToastMessage(`Lagu "${trk.title}" berhasil diunduh!`);
      setTimeout(() => setToastMessage(null), 3000);

      // Save to history
      saveDownloadedMedia({
        sourceUrl: dlUrl,
        platform: 'spotify',
        title: trk.title,
        author: trk.artist,
        thumbnail: trk.thumbnail,
        quality: '320 kbps MP3',
        resolution: 'Audio',
        mediaType: 'audio',
        extension: 'mp3',
        filename,
        filesize: `${(blob.size / (1024 * 1024)).toFixed(1)} MB`,
        filesizeBytes: blob.size,
        blob
      }).catch(() => {});
    } catch (err: any) {
      console.warn('Download single track notice:', err);
      setToastMessage('Gagal mengunduh lagu, silakan coba lagi.');
      setTimeout(() => setToastMessage(null), 3000);
    } finally {
      setIsDownloadingSingle(false);
    }
  };

  const saveBlobLocally = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 4000);
  };

  const formatSeconds = (secs: number) => {
    if (isNaN(secs) || secs <= 0) return '00:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="w-full space-y-3.5 select-none animate-in fade-in duration-300">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="p-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-500 text-black font-extrabold text-xs sm:text-sm flex items-center justify-between shadow-[0_0_20px_rgba(34,197,94,0.4)] animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-black" />
            <span>{toastMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="text-xs px-2 py-0.5 rounded bg-black/20 hover:bg-black/40 font-bold"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Main Container Card */}
      <div className="dz-card rounded-3xl p-4 sm:p-5 border border-emerald-500/40 shadow-xl">
        {/* Header Bar */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-emerald-900/40 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-[#1DB954] flex items-center justify-center text-black shrink-0 shadow-sm">
              <Music className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-mono">
                  Spotify Playlist / Album
                </span>
                <span className="text-[9px] px-1.5 py-0.2 rounded font-bold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700/60">
                  {total} Lagu
                </span>
              </div>
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white truncate">
                {media.title}
              </h3>
            </div>
          </div>

          {/* Toggle Tracklist Drawer */}
          <button
            type="button"
            onClick={() => setShowTracklistDrawer(!showTracklistDrawer)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-[#0a1e3a] hover:bg-emerald-100 dark:hover:bg-emerald-950/60 border border-emerald-500/40 text-emerald-700 dark:text-emerald-300 text-xs font-bold transition-all cursor-pointer shrink-0"
          >
            <ListMusic className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Daftar Lagu</span>
            <span className="text-[11px] opacity-80">({total})</span>
          </button>
        </div>

        {/* 1. KOTAK SLIDE THUMBNAIL (DI CROP BIAR PAS) */}
        <div className="relative mt-4 group">
          <div className="relative w-full aspect-square max-h-[340px] sm:max-h-[380px] mx-auto rounded-3xl overflow-hidden bg-gradient-to-b from-[#051329] to-[#010915] border-2 border-emerald-500/50 shadow-2xl flex items-center justify-center">
            {/* Cropped to fit artwork */}
            <img
              src={currentTrack.thumbnail || media.thumbnail}
              alt={currentTrack.title}
              className={`w-full h-full object-cover transition-transform duration-500 ${
                isPlaying ? 'scale-105' : 'scale-100 group-hover:scale-102'
              }`}
            />

            {/* Gradient Dark Backdrop Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-black/60 pointer-events-none" />

            {/* Top Badges */}
            <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none">
              <div className="px-2.5 py-1 rounded-xl bg-black/75 backdrop-blur-md border border-emerald-500/50 text-white font-mono text-xs font-bold flex items-center gap-1.5">
                <span className="text-emerald-400">#{(currentIndex + 1).toString().padStart(2, '0')}</span>
                <span className="text-slate-400">/</span>
                <span>{total.toString().padStart(2, '0')}</span>
              </div>

              {currentTrack.durationFormatted && (
                <div className="px-2.5 py-1 rounded-xl bg-black/75 backdrop-blur-md border border-emerald-500/50 text-emerald-300 text-xs font-bold flex items-center gap-1">
                  <Clock className="h-3 w-3 text-emerald-400" />
                  <span>{currentTrack.durationFormatted}</span>
                </div>
              )}
            </div>

            {/* Bottom Track Title Overlay */}
            <div className="absolute bottom-3 left-3 right-3 p-3 rounded-2xl bg-black/80 backdrop-blur-md border border-emerald-500/40 text-left">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h4 className="text-sm sm:text-base font-extrabold text-white truncate drop-shadow-md">
                    {currentTrack.title}
                  </h4>
                  <p className="text-xs text-emerald-300 truncate font-semibold">
                    {currentTrack.artist}
                  </p>
                </div>
                {/* Vinyl Rotating Disc Animation when playing */}
                <div
                  className={`w-9 h-9 rounded-full bg-emerald-950 border border-emerald-400 flex items-center justify-center shrink-0 ${
                    isPlaying ? 'animate-spin' : ''
                  }`}
                  style={{ animationDuration: '4s' }}
                >
                  <Disc3 className="h-5 w-5 text-emerald-400" />
                </div>
              </div>
            </div>

            {/* Previous Arrow */}
            <button
              type="button"
              onClick={handlePrev}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/80 hover:bg-emerald-600 border border-emerald-500/60 hover:border-emerald-400 text-white hover:text-black flex items-center justify-center transition-all cursor-pointer shadow-lg active:scale-95"
              aria-label="Lagu sebelumnya"
            >
              <ChevronLeft className="h-6 w-6 -ml-0.5" />
            </button>

            {/* Next Arrow */}
            <button
              type="button"
              onClick={handleNext}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/80 hover:bg-emerald-600 border border-emerald-500/60 hover:border-emerald-400 text-white hover:text-black flex items-center justify-center transition-all cursor-pointer shadow-lg active:scale-95"
              aria-label="Lagu selanjutnya"
            >
              <ChevronRight className="h-6 w-6 -mr-0.5" />
            </button>
          </div>
        </div>

        {/* 2. TOMBOL PLAY & AUDIO PLAYER DILUAR KOTAK (AUDIO STREAMING PREVIEW) */}
        <div className="mt-4 p-3.5 sm:p-4 rounded-2xl bg-slate-100 dark:bg-gradient-to-r dark:from-[#04132b] dark:via-[#072045] dark:to-[#04132b] border border-slate-300 dark:border-emerald-500/50 shadow-md space-y-3">
          <div className="flex items-center justify-between gap-3">
            {/* BIG PLAY / PAUSE BUTTON OUTSIDE THE BOX */}
            <button
              type="button"
              onClick={handleTogglePlay}
              className={`w-13 h-13 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center transition-all cursor-pointer shrink-0 active:scale-95 shadow-md ${
                isPlaying
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-black'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-black'
              }`}
              title={isPlaying ? 'Jeda Pratinjau' : 'Putar Pratinjau Audio'}
            >
              {isAudioLoading ? (
                <Loader2 className="h-6 w-6 animate-spin text-black" />
              ) : isPlaying ? (
                <Pause className="h-6 w-6 fill-current text-black" />
              ) : (
                <Play className="h-6 w-6 fill-current ml-1 text-black" />
              )}
            </button>

            {/* Audio Info & Scrubber */}
            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-bold text-slate-900 dark:text-white truncate text-xs sm:text-sm">
                    {currentTrack.title}
                  </span>
                  {isPlaying && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-mono animate-pulse shrink-0">
                      ● Streaming Audio
                    </span>
                  )}
                </div>

                {/* Time Display */}
                <span className="text-[11px] font-mono font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
                  {formatSeconds(currentTime)} / {formatSeconds(audioDuration || currentTrack.duration || 30)}
                </span>
              </div>

              {/* Progress Slider */}
              <div className="relative flex items-center">
                <input
                  type="range"
                  min={0}
                  max={audioDuration || 30}
                  step={0.1}
                  value={currentTime}
                  onChange={handleSeek}
                  className="w-full h-1.5 bg-slate-300 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
              </div>
            </div>

            {/* Mute Button */}
            <button
              type="button"
              onClick={handleToggleMute}
              className="p-2 rounded-xl bg-white dark:bg-[#091d3c] border border-slate-300 dark:border-blue-900/60 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer shrink-0"
              title={isMuted ? 'Batal Bisukan' : 'Bisukan Suara'}
            >
              {isMuted ? <VolumeX className="h-4 w-4 text-red-500" /> : <Volume2 className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />}
            </button>
          </div>
        </div>

        {/* 3. DUAL ACTION BUTTONS: UNDUH SATU-SATU & UNDUH SEMUA (ZIP INSTAN) */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Button 1: Unduh Lagu Ini (Satu-Satu) */}
          <button
            type="button"
            onClick={() => handleDownloadSingleTrack(currentTrack, currentIndex)}
            disabled={isDownloadingSingle}
            className="h-12 sm:h-13 rounded-2xl bg-gradient-to-r from-blue-700 to-cyan-600 hover:from-blue-600 hover:to-cyan-500 text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 border border-cyan-400/40 shadow-md transition-all cursor-pointer active:scale-98 disabled:opacity-50"
          >
            {isDownloadingSingle ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-white" />
                <span>Mengunduh MP3...</span>
              </>
            ) : (
              <>
                <Download className="h-4 w-4 text-cyan-200" />
                <span>Unduh Lagu Ini (MP3 320k)</span>
              </>
            )}
          </button>

          {/* Button 2: Unduh Semua ZIP (Dipersiapkan di latar belakang sejak awal) */}
          <button
            type="button"
            onClick={handleDownloadAllZip}
            className={`relative h-12 sm:h-13 rounded-2xl font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-98 overflow-hidden shadow-sm ${
              isZipReady
                ? 'bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-500 text-black border border-emerald-300'
                : 'bg-emerald-100 dark:bg-emerald-950/80 border border-emerald-400 dark:border-emerald-600/50 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-900/90'
            }`}
          >
            {/* Background progress fill if still bundling */}
            {!isZipReady && (
              <div
                className="absolute inset-0 bg-emerald-200 dark:bg-emerald-900/50 transition-all duration-300 pointer-events-none"
                style={{ width: `${zipProgressPercent}%` }}
              />
            )}

            <div className="relative z-10 flex items-center gap-2">
              <Archive className={`h-4 w-4 ${isZipReady ? 'text-black' : 'text-emerald-700 dark:text-emerald-400'}`} />
              {isZipReady ? (
                <>
                  <Sparkles className="h-4 w-4 text-black animate-spin" style={{ animationDuration: '3s' }} />
                  <span>Unduh Semua (ZIP) — Siap Instan!</span>
                </>
              ) : isZippingUserTriggered ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-emerald-700 dark:text-emerald-400" />
                  <span>Merapikan ZIP ({zipLoadedCount}/{total})...</span>
                </>
              ) : (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-emerald-700 dark:text-emerald-400" />
                  <span>Bungkus ZIP di Background ({zipProgressPercent}%)</span>
                </>
              )}
            </div>
          </button>
        </div>

        {/* Status Pill for Background ZIP */}
        <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 px-1 font-mono">
          <div className="flex items-center gap-1.5">
            {isZipReady ? (
              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold">
                <CheckCircle2 className="h-3.5 w-3.5" />
                ZIP Siap Tanpa Menunggu (Tersimpan di Memori Web)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-cyan-600 dark:text-cyan-300">
                <Loader2 className="h-3 w-3 animate-spin" />
                Menyiapkan {zipLoadedCount} dari {total} lagu di latar belakang...
              </span>
            )}
          </div>
          <span className="text-slate-400 dark:text-slate-500">
            {isZipReady && zipBlob ? `${(zipBlob.size / (1024 * 1024)).toFixed(1)} MB` : `${zipProgressPercent}%`}
          </span>
        </div>

        {/* 4. EXPANDABLE TRACKLIST DRAWER (Daftar Tiap Lagu) */}
        {showTracklistDrawer && (
          <div className="mt-4 pt-3 border-t border-slate-200 dark:border-emerald-900/40 space-y-2 animate-in fade-in duration-200">
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Daftar Lengkap Lagu ({total})
              </span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400">
                Klik lagu untuk putar / unduh
              </span>
            </div>

            <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
              {tracks.map((trk, i) => (
                <div
                  key={trk.id || i}
                  onClick={() => setCurrentIndex(i)}
                  className={`p-2 rounded-xl flex items-center justify-between gap-2 transition-all cursor-pointer ${
                    currentIndex === i
                      ? 'bg-emerald-100 dark:bg-emerald-950/80 border border-emerald-400 dark:border-emerald-500/60 text-slate-900 dark:text-white'
                      : 'bg-slate-50 dark:bg-[#06152d]/60 hover:bg-slate-100 dark:hover:bg-[#0c2652] border border-slate-200 dark:border-blue-900/40 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 w-5 text-right">
                      {(i + 1).toString().padStart(2, '0')}
                    </span>
                    <img
                      src={trk.thumbnail || media.thumbnail}
                      alt={trk.title}
                      className="w-8 h-8 rounded-lg object-cover shrink-0 border border-slate-300 dark:border-slate-700"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-bold truncate text-slate-900 dark:text-white">{trk.title}</p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{trk.artist}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {trk.durationFormatted && (
                      <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 hidden xs:inline">
                        {trk.durationFormatted}
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownloadSingleTrack(trk, i);
                      }}
                      className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-950/80 hover:bg-cyan-600 text-cyan-700 dark:text-cyan-300 hover:text-white border border-cyan-400 dark:border-cyan-500/40 transition-colors"
                      title="Unduh lagu ini"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
