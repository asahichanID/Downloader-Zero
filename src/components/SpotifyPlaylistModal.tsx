import React, { useState, useEffect } from 'react';
import {
  X,
  Music,
  Download,
  Archive,
  Search,
  CheckCircle2,
  Clock,
  Loader2,
  Play,
  Pause,
  AlertCircle,
  Sparkles
} from 'lucide-react';
import JSZip from 'jszip';
import type { MediaMetadata, AudioTrack } from '../types/index.ts';
import { saveDownloadedMedia } from '../services/historyStorage.ts';

interface SpotifyPlaylistModalProps {
  isOpen: boolean;
  onClose: () => void;
  media: MediaMetadata;
}

export const SpotifyPlaylistModal: React.FC<SpotifyPlaylistModalProps> = ({
  isOpen,
  onClose,
  media
}) => {
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

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [downloadingTrackId, setDownloadingTrackId] = useState<string | null>(null);
  const [downloadedTrackIds, setDownloadedTrackIds] = useState<Set<string>>(new Set());
  const [trackProgress, setTrackProgress] = useState<Record<string, number>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Audio preview playback state
  const [activePreviewId, setActivePreviewId] = useState<string | null>(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState<boolean>(false);
  const audioPreviewRef = React.useRef<HTMLAudioElement | null>(null);

  // Bulk ZIP state
  const [isZippingAll, setIsZippingAll] = useState<boolean>(false);
  const [zipProgress, setZipProgress] = useState<number>(0);
  const [zipStatusText, setZipStatusText] = useState<string>('');

  // Close on ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Clean up audio on unmount or close
  useEffect(() => {
    if (!isOpen && audioPreviewRef.current) {
      audioPreviewRef.current.pause();
      audioPreviewRef.current = null;
      setActivePreviewId(null);
      setIsPlayingPreview(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Filtered tracks based on search query
  const filteredTracks = tracks.filter((t) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q);
  });

  // Toggle quick audio preview
  const handleTogglePreview = (trk: AudioTrack) => {
    if (activePreviewId === trk.id && isPlayingPreview) {
      audioPreviewRef.current?.pause();
      setIsPlayingPreview(false);
      return;
    }

    if (audioPreviewRef.current) {
      audioPreviewRef.current.pause();
      audioPreviewRef.current = null;
    }

    const streamUrl = trk.previewUrl || trk.url;
    if (!streamUrl || !streamUrl.startsWith('http')) {
      setErrorMessage(`Pratinjau audio tidak tersedia untuk "${trk.title}".`);
      setTimeout(() => setErrorMessage(null), 3000);
      return;
    }

    const audio = new Audio();
    audio.src = `/api/proxy-download?url=${encodeURIComponent(streamUrl)}&filename=preview.mp3&platform=spotify&inline=1`;
    audio.onplaying = () => setIsPlayingPreview(true);
    audio.onpause = () => setIsPlayingPreview(false);
    audio.onended = () => {
      setIsPlayingPreview(false);
      setActivePreviewId(null);
    };
    audio.onerror = () => {
      setIsPlayingPreview(false);
      setActivePreviewId(null);
    };

    audioPreviewRef.current = audio;
    setActivePreviewId(trk.id);
    audio.play().catch(() => {
      setIsPlayingPreview(false);
      setActivePreviewId(null);
    });
  };

  // Download a single song from playlist
  const handleDownloadTrack = async (trk: AudioTrack, idx: number) => {
    if (downloadingTrackId) return;

    setDownloadingTrackId(trk.id);
    setTrackProgress((prev) => ({ ...prev, [trk.id]: 20 }));
    setErrorMessage(null);

    const sanitizedTitle = (trk.title || `Track_${idx + 1}`).slice(0, 35).replace(/[^a-zA-Z0-9_-]/g, '_');
    const sanitizedArtist = (trk.artist || 'Artist').slice(0, 25).replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `DownloaderZero_${sanitizedArtist}_${sanitizedTitle}.mp3`;

    try {
      let finalAudioUrl = '';
      const customKey = localStorage.getItem('dz_neoxr_api_key') || 'j3i3mg';
      const trackId = trk.id?.replace(/^sp-track-/, '') || '';
      const trackUrl = trk.url?.startsWith('http') && !trk.url.includes('mp3-preview') && !trk.url.includes('undefined')
        ? trk.url
        : `https://open.spotify.com/track/${trackId || trk.id}`;

      setTrackProgress((prev) => ({ ...prev, [trk.id]: 35 }));

      // Extract full 320 kbps song URL using Neoxr primary API with API key
      const extractRes = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trackUrl, apiKey: customKey })
      });

      if (extractRes.ok) {
        const resJson = await extractRes.json();
        if (resJson.success && resJson.data?.formats?.length > 0) {
          const bestAudio = resJson.data.formats.find((f: any) => f.type === 'audio' && f.url && !f.url.includes('mp3-preview')) || resJson.data.formats[0];
          if (bestAudio?.url) {
            finalAudioUrl = bestAudio.url;
          }
        }
      }

      if (!finalAudioUrl || finalAudioUrl.includes('mp3-preview')) {
        finalAudioUrl = trackUrl;
      }

      setTrackProgress((prev) => ({ ...prev, [trk.id]: 65 }));

      const trackCover = trk.thumbnail || media.thumbnail || '';
      const trackAlbum = trk.album || media.album || media.title || '';
      const proxyUrl = `/api/proxy-download?url=${encodeURIComponent(finalAudioUrl)}&filename=${encodeURIComponent(filename)}&platform=spotify&sourceUrl=${encodeURIComponent(trackUrl)}&bitrate=320k&title=${encodeURIComponent(trk.title || '')}&artist=${encodeURIComponent(trk.artist || '')}&album=${encodeURIComponent(trackAlbum)}&cover=${encodeURIComponent(trackCover)}&duration=${trk.duration || 0}&apiKey=${encodeURIComponent(customKey)}`;
      const response = await fetch(proxyUrl);

      if (!response.ok) {
        throw new Error(`Gagal mengunduh audio (HTTP ${response.status})`);
      }

      const contentLength = +(response.headers.get('content-length') || 0);
      let rawBlob: Blob;

      if (response.body && typeof response.body.getReader === 'function') {
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let received = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            received += value.length;
            if (contentLength > 0) {
              const p = Math.min(96, 65 + Math.round((received / contentLength) * 31));
              setTrackProgress((prev) => ({ ...prev, [trk.id]: p }));
            } else {
              const p = Math.min(96, 65 + Math.round((received / 10485760) * 31));
              setTrackProgress((prev) => ({ ...prev, [trk.id]: p }));
            }
          }
        }
        rawBlob = new Blob(chunks as any, { type: 'audio/mpeg' });
      } else {
        setTrackProgress((prev) => ({ ...prev, [trk.id]: 90 }));
        rawBlob = await response.blob();
      }

      setTrackProgress((prev) => ({ ...prev, [trk.id]: 100 }));

      // Trigger instant browser download
      const blobUrl = URL.createObjectURL(rawBlob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);

      // Mark as downloaded
      setDownloadedTrackIds((prev) => new Set(prev).add(trk.id));
      setSuccessToast(`Lagu "${trk.title}" berhasil diunduh!`);
      setTimeout(() => setSuccessToast(null), 3000);

      // Save to offline history asynchronously without blocking
      saveDownloadedMedia({
        sourceUrl: finalAudioUrl,
        platform: 'spotify',
        title: trk.title,
        author: trk.artist,
        thumbnail: trk.thumbnail || media.thumbnail,
        quality: '320 kbps MP3',
        resolution: 'Audio',
        mediaType: 'audio',
        extension: 'mp3',
        filename,
        filesize: `${(rawBlob.size / (1024 * 1024)).toFixed(1)} MB`,
        filesizeBytes: rawBlob.size,
        blob: rawBlob
      }).catch((e) => console.warn('History save notice:', e));
    } catch (err: any) {
      console.error('Download track error:', err);
      setErrorMessage(`Gagal mengunduh "${trk.title}": ${err.message || 'Error koneksi'}`);
      setTimeout(() => setErrorMessage(null), 4000);
    } finally {
      setDownloadingTrackId(null);
    }
  };

  // Bulk ZIP Download for all songs
  const handleDownloadAllZip = async () => {
    if (isZippingAll || tracks.length === 0) return;

    setIsZippingAll(true);
    setZipProgress(5);
    setZipStatusText('Menyiapkan antrean lagu ke dalam ZIP...');
    setErrorMessage(null);

    try {
      const zip = new JSZip();
      const sanitizedPlaylist = (media.title || 'Spotify_Playlist').slice(0, 30).replace(/[^a-zA-Z0-9_-]/g, '_');
      const folder = zip.folder(sanitizedPlaylist) || zip;

      const customKey = localStorage.getItem('dz_neoxr_api_key') || 'j3i3mg';

      for (let i = 0; i < tracks.length; i++) {
        const trk = tracks[i];
        const pct = Math.min(85, 5 + Math.round(((i + 1) / tracks.length) * 80));
        setZipProgress(pct);
        setZipStatusText(`Mengunduh lagu ${i + 1} dari ${tracks.length}: ${trk.title}...`);

        let targetUrl = '';
        const trackId = trk.id?.replace(/^sp-track-/, '') || '';
        const trackUrl = trk.url?.startsWith('http') && !trk.url.includes('mp3-preview') && !trk.url.includes('undefined')
          ? trk.url
          : `https://open.spotify.com/track/${trackId || trk.id}`;

        try {
          const exRes = await fetch('/api/extract', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: trackUrl, apiKey: customKey })
          });
          if (exRes.ok) {
            const d = await exRes.json();
            if (d.success && d.data?.formats?.length > 0) {
              const bestAudio = d.data.formats.find((f: any) => f.type === 'audio' && f.url && !f.url.includes('mp3-preview')) || d.data.formats[0];
              targetUrl = bestAudio?.url || '';
            }
          }
        } catch {}

        if (!targetUrl || targetUrl.includes('mp3-preview')) {
          targetUrl = trackUrl;
        }

        const songName = `${String(i + 1).padStart(2, '0')}_${trk.artist}_${trk.title}`.slice(0, 40).replace(/[^a-zA-Z0-9_-]/g, '_');
        const songFilename = `${songName}.mp3`;

        try {
          const trackCover = trk.thumbnail || media.thumbnail || '';
          const trackAlbum = trk.album || media.album || media.title || '';
          const res = await fetch(`/api/proxy-download?url=${encodeURIComponent(targetUrl)}&filename=${encodeURIComponent(songFilename)}&platform=spotify&sourceUrl=${encodeURIComponent(trackUrl)}&bitrate=320k&title=${encodeURIComponent(trk.title || '')}&artist=${encodeURIComponent(trk.artist || '')}&album=${encodeURIComponent(trackAlbum)}&cover=${encodeURIComponent(trackCover)}&duration=${trk.duration || 0}&apiKey=${encodeURIComponent(customKey)}`);
          if (res.ok) {
            const blob = await res.blob();
            folder.file(songFilename, blob);
            setDownloadedTrackIds((prev) => new Set(prev).add(trk.id));
          }
        } catch (e) {
          console.warn(`Gagal memuat lagu ${trk.title} ke zip:`, e);
        }
      }

      setZipProgress(90);
      setZipStatusText('Mengompres dan merapikan arsip ZIP...');

      const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
      const zipFilename = `DownloaderZero_${sanitizedPlaylist}_Lengkap.zip`;

      const dlUrl = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = dlUrl;
      link.download = zipFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(dlUrl), 15000);

      // Save to local offline history
      saveDownloadedMedia({
        sourceUrl: media.url,
        platform: 'spotify',
        title: `${media.title} (${tracks.length} Lagu ZIP)`,
        author: media.author,
        thumbnail: media.thumbnail,
        quality: `${tracks.length} Lagu MP3 (ZIP)`,
        resolution: 'Audio ZIP',
        mediaType: 'audio',
        extension: 'zip',
        filename: zipFilename,
        filesize: `${(zipBlob.size / (1024 * 1024)).toFixed(1)} MB`,
        filesizeBytes: zipBlob.size,
        blob: zipBlob
      }).catch(() => {});

      setZipProgress(100);
      setZipStatusText('Semua lagu berhasil dikemas & tersimpan!');
      setSuccessToast(`Seluruh playlist (${tracks.length} lagu) tersimpan dalam ZIP!`);
      setTimeout(() => setSuccessToast(null), 3500);
    } catch (err: any) {
      console.error('ZIP All error:', err);
      setErrorMessage(`Gagal membungkus ZIP: ${err.message || 'Error proses'}`);
    } finally {
      setIsZippingAll(false);
      setTimeout(() => {
        setZipProgress(0);
        setZipStatusText('');
      }, 3000);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="spotify-modal-title"
    >
      {/* Large Square Floating Modal Container */}
      <div
        className="relative w-full max-w-3xl max-h-[90vh] sm:max-h-[85vh] rounded-3xl bg-white dark:bg-[#0c1322] border-2 border-[#1DB954]/50 shadow-2xl shadow-black/90 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header Card */}
        <div className="p-4 sm:p-6 bg-gradient-to-b from-emerald-50 via-slate-50 to-white dark:from-[#13281a] dark:via-[#0f1d18] dark:to-[#0c1322] border-b border-[#1DB954]/30 shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3.5 sm:gap-4 min-w-0">
              {/* Cover Art */}
              <div className="relative w-18 h-18 sm:w-22 sm:h-22 rounded-2xl overflow-hidden shrink-0 border-2 border-[#1DB954]/60 bg-black shadow-lg shadow-black/60">
                <img
                  src={media.thumbnail}
                  alt={media.title}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
                <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded-md bg-black/70 backdrop-blur-xs text-[9px] font-black text-[#1DB954] uppercase tracking-wider flex items-center gap-1 border border-[#1DB954]/40">
                  <Music className="h-2.5 w-2.5" />
                  <span>DZ</span>
                </div>
              </div>

              {/* Title & Metadata */}
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-[#1DB954] font-mono px-2 py-0.5 rounded-full bg-[#1DB954]/15 border border-[#1DB954]/40">
                    Spotify Playlist / Album
                  </span>
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                    {tracks.length} Lagu
                  </span>
                </div>

                <h2 id="spotify-modal-title" className="text-base sm:text-xl font-extrabold text-slate-900 dark:text-white truncate drop-shadow-sm">
                  {media.title}
                </h2>

                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 truncate font-medium">
                  {media.author}
                </p>
              </div>
            </div>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-900/80 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700/80 transition-colors shrink-0 cursor-pointer"
              aria-label="Tutup pilihan lagu"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Toast / Error Banner */}
          {successToast && (
            <div className="mt-3 p-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 text-black font-bold text-xs flex items-center justify-between shadow-lg animate-in slide-in-from-top-1">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-black" />
                <span>{successToast}</span>
              </div>
              <button
                type="button"
                onClick={() => setSuccessToast(null)}
                className="text-[10px] px-2 py-0.5 rounded bg-black/20 hover:bg-black/30 font-black"
              >
                Tutup
              </button>
            </div>
          )}

          {errorMessage && (
            <div className="mt-3 p-2.5 rounded-xl bg-red-950/80 border border-red-700/60 text-red-200 text-xs flex items-center gap-2 animate-in slide-in-from-top-1">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
              <span className="truncate">{errorMessage}</span>
            </div>
          )}

          {/* Quick Action & Search Bar */}
          <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
            {/* Search Filter Box */}
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari lagu atau artis dalam playlist..."
                className="w-full h-10 pl-10 pr-3 rounded-xl bg-slate-50 dark:bg-slate-900/90 border border-slate-300 dark:border-slate-700/70 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-[#1DB954] focus:ring-1 focus:ring-[#1DB954]/50 transition-all font-medium"
              />
            </div>

            {/* Unduh Semua (.ZIP) Action Button */}
            <button
              type="button"
              onClick={handleDownloadAllZip}
              disabled={isZippingAll}
              className={`h-10 px-4 rounded-xl font-extrabold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-98 shrink-0 ${
                isZippingAll
                  ? 'bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-[#1DB954] to-emerald-400 hover:from-[#1ed760] hover:to-teal-300 text-black shadow-md shadow-black/40 border border-[#1DB954]'
              }`}
            >
              {isZippingAll ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                  <span>Membungkus ZIP ({zipProgress}%)...</span>
                </>
              ) : (
                <>
                  <Archive className="h-4 w-4 text-black stroke-[2.5]" />
                  <span>Unduh Semua ({tracks.length} Lagu ZIP)</span>
                </>
              )}
            </button>
          </div>

          {/* Bulk ZIP Progress Bar when active */}
          {isZippingAll && (
            <div className="mt-2.5 p-2 rounded-xl bg-black/60 border border-emerald-900/60 space-y-1">
              <div className="flex items-center justify-between text-[11px] font-semibold text-emerald-300">
                <span className="truncate">{zipStatusText}</span>
                <span className="font-mono">{zipProgress}%</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-slate-900 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#1DB954] to-teal-400 transition-all duration-300"
                  style={{ width: `${zipProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Scrollable Song List (Spotify Characteristic Selection Look) */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-2">
          {filteredTracks.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs">
              Tidak ada lagu yang cocok dengan kata kunci "{searchQuery}".
            </div>
          ) : (
            filteredTracks.map((trk, idx) => {
              const isThisDownloading = downloadingTrackId === trk.id;
              const isThisDownloaded = downloadedTrackIds.has(trk.id);
              const isThisPlaying = activePreviewId === trk.id && isPlayingPreview;
              const pct = trackProgress[trk.id] || 0;

              return (
                <div
                  key={trk.id || idx}
                  className={`group p-2.5 sm:p-3 rounded-2xl flex items-center justify-between gap-3 transition-all border ${
                    isThisDownloading
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-[#1DB954]/60'
                      : isThisPlaying
                      ? 'bg-emerald-50/80 dark:bg-[#12261b] border-[#1DB954]/40'
                      : 'bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-800/70 border-slate-200 dark:border-slate-800/80 hover:border-emerald-500/50'
                  }`}
                >
                  {/* Left: Index + Cover Art + Play Preview Button */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* Index Number */}
                    <span className="text-xs font-mono font-bold text-slate-400 dark:text-slate-500 group-hover:text-emerald-500 dark:group-hover:text-emerald-400 w-5 text-center shrink-0">
                      {String(idx + 1).padStart(2, '0')}
                    </span>

                    {/* Thumbnail with hover Play Preview */}
                    <div className="relative w-11 h-11 sm:w-12 sm:h-12 rounded-xl overflow-hidden shrink-0 border border-slate-300 dark:border-slate-700/60 bg-black group/thumb">
                      <img
                        src={trk.thumbnail || media.thumbnail}
                        alt={trk.title}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                      {/* Play/Pause overlay */}
                      <button
                        type="button"
                        onClick={() => handleTogglePreview(trk)}
                        className={`absolute inset-0 bg-black/50 flex items-center justify-center transition-opacity cursor-pointer ${
                          isThisPlaying ? 'opacity-100 bg-[#1DB954]/40' : 'opacity-0 group-hover/thumb:opacity-100'
                        }`}
                        title={isThisPlaying ? 'Jeda preview' : 'Putar preview'}
                      >
                        {isThisPlaying ? (
                          <Pause className="h-4 w-4 text-white fill-current" />
                        ) : (
                          <Play className="h-4 w-4 text-white fill-current ml-0.5" />
                        )}
                      </button>
                    </div>

                    {/* Title & Artist */}
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate group-hover:text-[#1DB954] transition-colors">
                          {trk.title}
                        </h4>
                        {isThisPlaying && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded font-mono font-bold text-[#1DB954] bg-[#1DB954]/15 animate-pulse shrink-0">
                            Pratinjau
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate font-medium">
                        {trk.artist}
                      </p>
                    </div>
                  </div>

                  {/* Right: Duration + Individual Unduh Button */}
                  <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
                    {trk.durationFormatted && (
                      <div className="hidden xs:flex items-center gap-1 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                        <Clock className="h-3 w-3 text-slate-400 dark:text-slate-500" />
                        <span>{trk.durationFormatted}</span>
                      </div>
                    )}

                    {/* Individual Download Button */}
                    <button
                      type="button"
                      onClick={() => handleDownloadTrack(trk, idx)}
                      disabled={isThisDownloading}
                      className={`h-9 px-3 sm:px-3.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 ${
                        isThisDownloaded
                          ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-400 dark:border-emerald-600/60'
                          : isThisDownloading
                          ? 'bg-slate-200 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 border border-[#1DB954]/50 cursor-not-allowed'
                          : 'bg-[#1DB954]/20 hover:bg-[#1DB954] text-[#0f7a35] dark:text-[#1DB954] hover:text-black border border-[#1DB954]/40 hover:border-[#1DB954] shadow-sm'
                      }`}
                      title={`Unduh lagu ${trk.title}`}
                    >
                      {isThisDownloading ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-500 dark:text-emerald-400" />
                          <span className="text-[11px]">{pct}%</span>
                        </>
                      ) : isThisDownloaded ? (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                          <span className="hidden sm:inline text-[11px]">Tersimpan</span>
                        </>
                      ) : (
                        <>
                          <Download className="h-3.5 w-3.5" />
                          <span className="text-[11px]">Unduh</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Bottom Footer */}
        <div className="p-3.5 sm:p-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 shrink-0">
          <div className="flex items-center gap-1.5 font-mono text-[11px]">
            <Sparkles className="h-3.5 w-3.5 text-[#1DB954]" />
            <span>Audio MP3 Jernih 320 kbps</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold transition-colors cursor-pointer text-xs"
          >
            Selesai
          </button>
        </div>
      </div>
    </div>
  );
};
