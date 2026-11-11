import React, { useState } from 'react';
import { X, Video, Music, Check, Download, Sparkles, Film, Disc } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { MediaMetadata, MediaFormat, MediaType, PlatformType } from '../types/index.ts';
import { formatDuration } from '../services/scraper.ts';

interface FormatSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  media: MediaMetadata;
  selectedType: MediaType;
  onChangeType: (type: MediaType) => void;
  selectedVideoRes: string;
  onSelectVideoRes: (res: string) => void;
  selectedAudioQuality: string;
  onSelectAudioQuality: (quality: string) => void;
  onConfirmDownload: (format: MediaFormat) => void;
  isDownloading?: boolean;
}

export const FormatSelectorModal: React.FC<FormatSelectorModalProps> = ({
  isOpen,
  onClose,
  media,
  selectedType,
  onChangeType,
  selectedVideoRes,
  onSelectVideoRes,
  selectedAudioQuality,
  onSelectAudioQuality,
  onConfirmDownload,
  isDownloading = false
}) => {
  if (!isOpen) return null;

  // Video formats available from metadata or defaults
  const videoFormats = media.formats.filter((f) => f.type === 'video');
  const audioFormats = media.formats.filter((f) => f.type === 'audio');

  // Video quality presets
  const videoPresets = [
    { id: '2160p', label: '4K Ultra HD', resolution: '2160p', badge: 'Ultra 4K' },
    { id: '1440p', label: '2K Quad HD', resolution: '1440p', badge: '2K QHD' },
    { id: '1080p', label: '1080p Full HD', resolution: '1080p', badge: 'Populer' },
    { id: '720p', label: '720p HD', resolution: '720p', badge: 'Standar' },
    { id: '480p', label: '480p SD', resolution: '480p', badge: 'Hemat Data' },
    { id: '360p', label: '360p Low', resolution: '360p', badge: 'Cepat' },
  ];

  // Audio quality presets
  const audioPresets = [
    { id: '320', label: '320 kbps Ultra HQ', quality: '320 kbps', badge: 'Master Jernih' },
    { id: '256', label: '256 kbps High', quality: '256 kbps', badge: 'Kualitas Tinggi' },
    { id: '128', label: '128 kbps Standard', quality: '128 kbps', badge: 'Ukuran Ringan' },
  ];

  // Determine current active format to download
  const handleStartDownload = () => {
    if (selectedType === 'audio') {
      const matchAudio = audioFormats.find((f) => {
        const q = (f.quality || '').toLowerCase();
        const id = (f.id || '').toLowerCase();
        return q.includes(selectedAudioQuality) || id.includes(selectedAudioQuality);
      }) || audioFormats[0] || {
        id: `audio-${selectedAudioQuality}`,
        quality: `${selectedAudioQuality} kbps (Original Sound MP3)`,
        resolution: 'Audio',
        type: 'audio' as const,
        extension: 'mp3' as const,
        url: '',
        isDirect: false,
        needsResolution: true
      };
      onConfirmDownload(matchAudio);
    } else {
      const targetRes = selectedVideoRes.toLowerCase();
      const is2K = targetRes.includes('1440') || targetRes.includes('2k');
      const is4K = targetRes.includes('2160') || targetRes.includes('4k');

      // Strictly find matching format for the selected resolution
      let matchVideo = videoFormats.find((f) => {
        const r = (f.resolution || '').toLowerCase();
        const q = (f.quality || '').toLowerCase();
        const id = (f.id || '').toLowerCase();
        if (is2K) {
          // Strictly match 2K or 1440, NEVER 4K or 2160!
          return (r === '2k' || r.includes('1440') || q.includes('1440') || q.includes('2k') || id.includes('1440') || id.includes('2k')) &&
                 !r.includes('4k') && !r.includes('2160') && !q.includes('4k') && !q.includes('2160');
        }
        if (is4K) {
          return r === '4k' || r.includes('2160') || q.includes('2160') || q.includes('4k') || id.includes('2160') || id.includes('4k');
        }
        return r.includes(targetRes) || q.includes(targetRes) || id.includes(targetRes);
      });

      // CRITICAL FIX: If exact format exists, enforce strictly correct resolution tag
      if (matchVideo) {
        if (is2K) {
          matchVideo = {
            ...matchVideo,
            id: matchVideo.id && !matchVideo.id.includes('4k') ? matchVideo.id : 'tt-2k',
            resolution: '2K',
            quality: matchVideo.quality && !matchVideo.quality.includes('4K') ? matchVideo.quality : '2K Quad HD (1440p Tanpa Watermark)'
          };
        } else if (is4K) {
          matchVideo = {
            ...matchVideo,
            resolution: '4K',
            quality: matchVideo.quality || '4K Ultra HD (2160p Tanpa Watermark)'
          };
        }
      } else {
        // If not found in media.formats, build dedicated format strictly matching selection
        const preset = videoPresets.find((p) => p.resolution === selectedVideoRes || p.id === selectedVideoRes);
        const resolvedTag = is2K ? '2K' : (is4K ? '4K' : selectedVideoRes);
        matchVideo = {
          id: is2K ? 'tt-2k' : (is4K ? 'tt-4k' : `video-${selectedVideoRes}`),
          quality: preset ? preset.label : `${selectedVideoRes} Video`,
          resolution: resolvedTag,
          type: 'video',
          extension: 'mp4',
          url: '',
          isDirect: false,
          needsResolution: true
        };
      }

      onConfirmDownload(matchVideo);
    }
  };

  // Resilient thumbnail resolution for YouTube, TikTok, and Spotify
  const ytMatch = media.url?.match(/(?:youtube\.com\/(?:watch\?[^#]*v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i);
  const resolvedThumbnail =
    media.thumbnail ||
    (ytMatch ? `https://i.ytimg.com/vi/${ytMatch[1]}/hqdefault.jpg` : '');

  // Resilient duration resolution
  const displayDuration =
    media.durationFormatted ||
    (media.duration && media.duration > 0
      ? formatDuration(media.duration)
      : (selectedType === 'audio' ? '03:30' : '01:00'));

  const isSpotify = media.platform === 'spotify';

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md overflow-y-auto"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.94 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-md sm:max-w-lg rounded-3xl bg-[#081530] border border-blue-500/30 p-5 sm:p-6 shadow-2xl shadow-black/95 text-white max-h-[85vh] flex flex-col overflow-hidden my-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3.5 border-b border-blue-900/60">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                <span>Pilih Format & Kualitas</span>
              </h2>
              <p className="text-xs text-blue-200/70 mt-0.5">
                Sesuaikan resolusi video atau bitrate audio yang ingin disimpan
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white flex items-center justify-center border border-white/10 active:scale-90 transition-all cursor-pointer"
              aria-label="Tutup pemilihan format"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Scrollable Content */}
          <div className="overflow-y-auto space-y-4 py-3.5 pr-1">
            {/* Media Preview Card */}
            <div className="flex items-center gap-3 p-3 rounded-2xl bg-[#0c1e42] border border-blue-500/25">
              <div className="relative w-20 h-14 rounded-xl overflow-hidden bg-slate-900 shrink-0 border border-white/10">
                {isSpotify && (!resolvedThumbnail || resolvedThumbnail.includes('favicon')) ? (
                  <div className="w-full h-full flex items-center justify-center bg-black">
                    <div className="w-8 h-8 rounded-full bg-[#1DB954] flex items-center justify-center shadow-md">
                      <svg className="w-4 h-4 fill-black" viewBox="0 0 24 24">
                        <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.508 17.308a.747.747 0 01-1.03.248c-2.82-1.723-6.37-2.113-10.55-1.158a.75.75 0 11-.336-1.462c4.57-1.043 8.49-.597 11.668 1.342.348.213.46.666.248 1.03zm1.47-3.268a.936.936 0 01-1.288.309c-3.227-1.984-8.147-2.557-11.964-1.398a.937.937 0 11-.548-1.792c4.364-1.325 9.79-.684 13.49 1.593.407.25.539.78.31 1.288zm.126-3.41c-3.863-2.294-10.244-2.507-13.935-1.386a1.124 1.124 0 01-.655-2.152c4.24-1.288 11.288-1.042 15.74 1.602a1.125 1.125 0 01-1.15 1.936z" />
                      </svg>
                    </div>
                  </div>
                ) : resolvedThumbnail ? (
                  <img
                    src={resolvedThumbnail}
                    alt={media.title}
                    referrerPolicy="no-referrer"
                    crossOrigin="anonymous"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      if (ytMatch && !(e.currentTarget as HTMLImageElement).src.includes('mqdefault')) {
                        (e.currentTarget as HTMLImageElement).src = `https://i.ytimg.com/vi/${ytMatch[1]}/mqdefault.jpg`;
                      } else {
                        (e.currentTarget as HTMLImageElement).src = '/banner_dz.png';
                      }
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-blue-950">
                    <Film className="w-6 h-6 text-cyan-400" />
                  </div>
                )}
                {displayDuration && (
                  <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/85 text-[10px] font-mono font-semibold text-white shadow-xs">
                    {displayDuration}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 block">
                  {media.platform}
                </span>
                <p className="text-xs sm:text-sm font-semibold text-white truncate">
                  {media.title || 'Tautan Media'}
                </p>
                <p className="text-[11px] text-blue-200/60 truncate mt-0.5">
                  {media.author || 'Konten Siap Unduh'}
                </p>
              </div>
            </div>

            {/* Segmented Type Switcher: Video vs Audio */}
            <div>
              <label className="text-xs font-semibold text-slate-300 mb-2 block">
                Tipe Unduhan
              </label>
              <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-[#050e24] border border-blue-900/60">
                <button
                  type="button"
                  onClick={() => onChangeType('video')}
                  className={`py-2.5 px-3 rounded-xl flex items-center justify-center gap-2 text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                    selectedType === 'video'
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 ring-1 ring-cyan-400'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Video className="w-4 h-4" />
                  <span>Video (MP4)</span>
                </button>
                <button
                  type="button"
                  onClick={() => onChangeType('audio')}
                  className={`py-2.5 px-3 rounded-xl flex items-center justify-center gap-2 text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                    selectedType === 'audio'
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30 ring-1 ring-emerald-400'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Music className="w-4 h-4" />
                  <span>Audio (MP3)</span>
                </button>
              </div>
            </div>

            {/* Quality Options Grid */}
            {selectedType === 'video' ? (
              <div>
                <label className="text-xs font-semibold text-slate-300 mb-2 block">
                  Pilih Resolusi Video
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {videoPresets.map((preset) => {
                    const isSelected = selectedVideoRes === preset.resolution;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => onSelectVideoRes(preset.resolution)}
                        className={`p-3 rounded-2xl border text-left transition-all active:scale-[0.98] cursor-pointer relative ${
                          isSelected
                            ? 'bg-[#102450] border-cyan-400 ring-1 ring-cyan-400/50 shadow-md shadow-cyan-500/20'
                            : 'bg-[#0c1a3a]/70 border-blue-900/60 hover:border-blue-600/60 hover:bg-[#0c1e42]'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs sm:text-sm font-bold text-white">
                            {preset.resolution}
                          </span>
                          {isSelected && (
                            <div className="w-4 h-4 rounded-full bg-cyan-400 text-black flex items-center justify-center">
                              <Check className="w-2.5 h-2.5 stroke-[3]" />
                            </div>
                          )}
                        </div>
                        <span className="text-[11px] text-blue-200/70 block mt-1">
                          {preset.badge}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div>
                <label className="text-xs font-semibold text-slate-300 mb-2 block">
                  Pilih Bitrate Audio
                </label>
                <div className="space-y-2">
                  {audioPresets.map((preset) => {
                    const isSelected = selectedAudioQuality === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => onSelectAudioQuality(preset.id)}
                        className={`w-full p-3 rounded-2xl border text-left flex items-center justify-between transition-all active:scale-[0.98] cursor-pointer ${
                          isSelected
                            ? 'bg-[#0f2d2b] border-emerald-400 ring-1 ring-emerald-400/50 shadow-md shadow-emerald-500/20'
                            : 'bg-[#0c1a3a]/70 border-blue-900/60 hover:border-emerald-600/60 hover:bg-[#0c1e42]'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${isSelected ? 'bg-emerald-500 text-black' : 'bg-slate-800 text-slate-300'}`}>
                            <Disc className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="text-xs sm:text-sm font-bold text-white block">
                              {preset.label}
                            </span>
                            <span className="text-[11px] text-emerald-400/90 block">
                              {preset.badge}
                            </span>
                          </div>
                        </div>
                        {isSelected && (
                          <div className="w-5 h-5 rounded-full bg-emerald-400 text-black flex items-center justify-center">
                            <Check className="w-3 h-3 stroke-[3]" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Confirm Button */}
          <div className="pt-3 border-t border-blue-900/60">
            <button
              type="button"
              disabled={isDownloading}
              onClick={handleStartDownload}
              className="w-full py-4 rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-bold text-sm sm:text-base flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
            >
              <Download className="w-5 h-5 stroke-[2.5]" />
              <span>{isDownloading ? 'Sedang Memproses...' : 'Mulai Download'}</span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
