import React, { useState } from 'react';
import {
  Download,
  ExternalLink,
  Film,
  Music,
  CheckCircle,
  Clock,
  User,
  HardDrive,
  RefreshCw,
  Sparkles,
  Loader2
} from 'lucide-react';
import type { MediaMetadata, MediaFormat, MediaType } from '../types/index.ts';

interface MediaResultProps {
  media: MediaMetadata;
  activeFilter: MediaType;
  onReset: () => void;
}

export const MediaResult: React.FC<MediaResultProps> = ({
  media,
  activeFilter,
  onReset
}) => {
  // Filter formats based on selected tab (Video vs MP3)
  const availableFormats = media.formats.filter((f) => f.type === activeFilter);
  // If no formats match the filter, fallback to all formats
  const displayFormats = availableFormats.length > 0 ? availableFormats : media.formats;

  const [selectedFormatId, setSelectedFormatId] = useState<string>(displayFormats[0]?.id || '');
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [downloadStatusText, setDownloadStatusText] = useState<string>('');

  const currentFormat = displayFormats.find((f) => f.id === selectedFormatId) || displayFormats[0];

  const handleDownloadTrigger = async (fmt: MediaFormat) => {
    setIsDownloading(true);
    setDownloadProgress(10);
    setDownloadStatusText('Memulai sambungan unduhan...');

    const ext = fmt.extension;
    const sanitizedTitle = (media.title || 'media').slice(0, 50).replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `DownloaderZero_${sanitizedTitle}_${fmt.resolution || fmt.quality}.${ext}`;

    try {
      // If it's a direct URL, initiate proxy download attachment
      if (fmt.isDirect) {
        setDownloadProgress(60);
        setDownloadStatusText('Mengalirkan berkas...');

        const proxyUrl = `/api/proxy-download?url=${encodeURIComponent(fmt.url)}&filename=${encodeURIComponent(filename)}`;
        
        // Trigger browser download via invisible anchor
        const a = document.createElement('a');
        a.href = proxyUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        setDownloadProgress(100);
        setDownloadStatusText('Unduhan siap!');
        setTimeout(() => {
          setIsDownloading(false);
          setDownloadProgress(0);
        }, 2000);
        return;
      }

      // If it has a loader.to job or needs polling
      if (fmt.jobId) {
        setDownloadStatusText('Menyiapkan konversi audio/video...');
        let finished = false;
        let attempts = 0;

        while (!finished && attempts < 20) {
          attempts++;
          await new Promise((r) => setTimeout(r, 1200));

          try {
            const progRes = await fetch(`/api/progress/${encodeURIComponent(fmt.jobId)}`);
            if (progRes.ok) {
              const pData = await progRes.json();
              if (pData.success && pData.downloadUrl) {
                setDownloadProgress(100);
                setDownloadStatusText('Selesai! Mengunduh berkas...');
                
                const a = document.createElement('a');
                a.href = pData.downloadUrl;
                a.download = filename;
                a.target = '_blank';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);

                finished = true;
                setTimeout(() => {
                  setIsDownloading(false);
                  setDownloadProgress(0);
                }, 2000);
                return;
              } else if (pData.progress) {
                setDownloadProgress(pData.progress);
                setDownloadStatusText(pData.statusText || 'Sedang memproses konversi...');
              }
            }
          } catch {
            // continue polling
          }
        }
      }

      // Fallback: trigger directly
      setDownloadProgress(100);
      setDownloadStatusText('Membuka tautan unduhan...');
      const fallbackUrl = `/api/proxy-download?url=${encodeURIComponent(fmt.url)}&filename=${encodeURIComponent(filename)}`;
      window.open(fallbackUrl, '_blank');
      setTimeout(() => {
        setIsDownloading(false);
        setDownloadProgress(0);
      }, 1500);
    } catch (err: any) {
      alert(`Gagal mengunduh: ${err.message}. Membuka tautan langsung...`);
      window.open(fmt.url, '_blank');
      setIsDownloading(false);
      setDownloadProgress(0);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto my-8 rounded-3xl p-6 sm:p-8 glass-panel border border-slate-800/90 light:border-slate-200 shadow-2xl transition-all animate-in fade-in duration-300">
      {/* Top Header Bar of Result */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-slate-800/80 light:border-slate-200">
        <div className="flex items-center gap-2">
          <span className="flex h-2.5 w-2.5 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-xs font-mono font-semibold uppercase tracking-wider text-cyan-400">
            Media Siap Diunduh · {media.platform.toUpperCase()}
          </span>
        </div>

        <button
          type="button"
          onClick={onReset}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white light:text-slate-600 light:hover:text-slate-900 py-1 px-3 rounded-lg bg-slate-900/60 light:bg-slate-100 hover:bg-slate-800 transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Unduh Lainnya</span>
        </button>
      </div>

      {/* Main Media Info & Thumbnail */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 my-6 items-start">
        {/* Thumbnail Preview */}
        <div className="md:col-span-5 relative group overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900 shadow-lg aspect-video md:aspect-[4/3]">
          {media.thumbnail ? (
            <img
              src={media.thumbnail}
              alt={media.title}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              referrerPolicy="no-referrer"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          ) : (
            <div className="h-full w-full flex flex-col items-center justify-center bg-slate-900 text-slate-600">
              {activeFilter === 'video' ? <Film className="h-12 w-12" /> : <Music className="h-12 w-12" />}
              <span className="text-xs mt-2 font-mono">Media Preview</span>
            </div>
          )}

          {/* Floating Duration Tag */}
          {media.durationFormatted && media.durationFormatted !== '00:00' && (
            <div className="absolute bottom-2.5 right-2.5 flex items-center gap-1 px-2.5 py-1 rounded-md bg-black/80 backdrop-blur-md text-[11px] font-mono text-white border border-white/10">
              <Clock className="h-3 w-3 text-cyan-400" />
              <span>{media.durationFormatted}</span>
            </div>
          )}
        </div>

        {/* Media Details */}
        <div className="md:col-span-7 flex flex-col justify-between space-y-4">
          <div>
            <h3 className="text-lg sm:text-xl font-bold text-white light:text-slate-900 leading-snug line-clamp-2">
              {media.title}
            </h3>

            <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-slate-400 light:text-slate-600">
              <span className="flex items-center gap-1">
                <User className="h-3.5 w-3.5 text-cyan-400" />
                <span>{media.author}</span>
              </span>

              <span aria-hidden="true" className="text-slate-700">·</span>

              <span className="font-mono text-cyan-300">
                {media.source}
              </span>
            </div>
          </div>

          {/* Format selection info */}
          <div className="rounded-xl bg-slate-900/60 light:bg-slate-100/80 p-3.5 border border-slate-800/80 light:border-slate-200">
            <span className="text-xs font-semibold text-slate-400 light:text-slate-600 block mb-2">
              Pilih Kualitas ({activeFilter === 'video' ? 'Video' : 'Audio MP3'}):
            </span>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {displayFormats.map((fmt) => {
                const isSelected = (currentFormat?.id === fmt.id);
                return (
                  <button
                    key={fmt.id}
                    type="button"
                    onClick={() => setSelectedFormatId(fmt.id)}
                    className={`flex flex-col items-start p-2.5 rounded-xl border text-left transition-all ${
                      isSelected
                        ? 'border-cyan-400 bg-cyan-950/40 text-cyan-200 ring-2 ring-cyan-500/20'
                        : 'border-slate-800 bg-slate-900/80 text-slate-300 hover:border-slate-700 light:bg-white light:border-slate-200 light:text-slate-700'
                    }`}
                  >
                    <span className="text-xs font-bold truncate w-full">{fmt.quality}</span>
                    <div className="flex items-center justify-between w-full mt-1 text-[10px] text-slate-400 light:text-slate-500">
                      <span>{fmt.extension.toUpperCase()}</span>
                      {fmt.filesize && <span>{fmt.filesize}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Download Progress Bar if active */}
          {isDownloading && (
            <div className="space-y-1.5 p-3 rounded-xl bg-cyan-950/40 border border-cyan-800/60">
              <div className="flex items-center justify-between text-xs text-cyan-300">
                <span className="flex items-center gap-1.5 font-medium">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>{downloadStatusText}</span>
                </span>
                <span className="font-mono font-bold">{downloadProgress}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-900">
                <div
                  className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all duration-300 rounded-full"
                  style={{ width: `${downloadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
            <button
              type="button"
              disabled={isDownloading || !currentFormat}
              onClick={() => currentFormat && handleDownloadTrigger(currentFormat)}
              className="w-full sm:flex-1 h-12 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:from-cyan-400 hover:via-blue-500 hover:to-indigo-500 disabled:opacity-50 shadow-lg shadow-cyan-500/25 transition-all flex items-center justify-center gap-2 active:scale-[0.99]"
            >
              <Download className="h-4 w-4" />
              <span>
                {isDownloading ? 'Sedang Memproses...' : `Download ${currentFormat?.quality || 'Sekarang'}`}
              </span>
            </button>

            {currentFormat?.url && (
              <a
                href={currentFormat.url}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto h-12 px-4 rounded-xl font-medium text-xs text-slate-400 hover:text-white bg-slate-900/80 light:bg-slate-100 light:text-slate-700 light:hover:text-slate-900 border border-slate-800 light:border-slate-200 transition-colors flex items-center justify-center gap-1.5 shrink-0"
                title="Buka tautan media langsung"
              >
                <span>Buka Link Asli</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
