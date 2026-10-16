import React, { useState } from 'react';
import {
  Download,
  Film,
  Music,
  CheckCircle2,
  Clock,
  User,
  RefreshCw,
  Loader2,
  FileCheck
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
  const displayFormats = availableFormats.length > 0 ? availableFormats : media.formats;

  const [selectedFormatId, setSelectedFormatId] = useState<string>(displayFormats[0]?.id || '');
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [downloadStatusText, setDownloadStatusText] = useState<string>('');
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);

  const currentFormat = displayFormats.find((f) => f.id === selectedFormatId) || displayFormats[0];

  // Automated Direct Download without redirects or new tabs
  const handleDownloadTrigger = async (fmt: MediaFormat) => {
    if (isDownloading) return;

    setIsDownloading(true);
    setDownloadSuccess(null);
    setDownloadProgress(10);
    setDownloadStatusText('Menghubungkan ke server media...');

    const ext = fmt.extension;
    const sanitizedTitle = (media.title || 'media').slice(0, 40).replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `DownloaderZero_${sanitizedTitle}_${fmt.resolution || fmt.quality.split(' ')[0]}.${ext}`;

    try {
      let targetDownloadUrl = fmt.url;

      // If format requires async conversion job (e.g. YouTube loader)
      if (fmt.jobId) {
        setDownloadStatusText('Memproses konversi resolusi/audio...');
        let finished = false;
        let attempts = 0;

        while (!finished && attempts < 25) {
          attempts++;
          await new Promise((r) => setTimeout(r, 1200));

          try {
            const progRes = await fetch(`/api/progress/${encodeURIComponent(fmt.jobId)}`);
            if (progRes.ok) {
              const pData = await progRes.json();
              if (pData.success && pData.downloadUrl) {
                targetDownloadUrl = pData.downloadUrl;
                finished = true;
                break;
              } else if (typeof pData.progress === 'number' && pData.progress > 0) {
                setDownloadProgress(Math.min(85, Math.round(pData.progress)));
                setDownloadStatusText(pData.statusText || 'Sedang memproses konversi video...');
              }
            }
          } catch {
            // Keep polling
          }
        }
      }

      setDownloadProgress(40);
      setDownloadStatusText('Mengalirkan data berkas asli...');

      const proxyUrl = `/api/proxy-download?url=${encodeURIComponent(targetDownloadUrl)}&filename=${encodeURIComponent(filename)}`;

      // Fetch file as Blob with streaming progress so browser saves directly to disk
      const response = await fetch(proxyUrl);
      if (!response.ok) {
        throw new Error(`Server merespons kode ${response.status}`);
      }

      const contentLength = Number(response.headers.get('content-length')) || 0;
      const reader = response.body?.getReader();

      if (!reader) {
        // Fallback to direct blob
        const blob = await response.blob();
        saveBlobLocally(blob, filename);
      } else {
        const chunks: BlobPart[] = [];
        let received = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value.buffer as ArrayBuffer);
            received += value.length;
          }

          if (contentLength > 0) {
            const pct = Math.min(98, Math.round((received / contentLength) * 100));
            setDownloadProgress(Math.max(40, pct));
          } else {
            setDownloadProgress((prev) => Math.min(95, prev + 5));
          }
          setDownloadStatusText(`Mengunduh berkas: ${formatLoadedBytes(received)}...`);
        }

        const fullBlob = new Blob(chunks, { type: 'application/octet-stream' });
        saveBlobLocally(fullBlob, filename);
      }

      setDownloadProgress(100);
      setDownloadStatusText('Unduhan selesai!');
      setDownloadSuccess(`Berkas "${filename}" telah tersimpan otomatis ke folder Downloads Anda.`);

      setTimeout(() => {
        setIsDownloading(false);
        setDownloadProgress(0);
      }, 2500);
    } catch (err: any) {
      console.warn('Blob download fallback to hidden iframe:', err);
      // Fallback: trigger hidden iframe download so browser handles it natively without opening any tab
      setDownloadStatusText('Mengalihkan ke download manager peramban...');
      triggerHiddenIframeDownload(fmt.url, filename);
      setDownloadProgress(100);
      setDownloadSuccess(`Berkas "${filename}" sedang diunduh oleh peramban Anda.`);
      setTimeout(() => {
        setIsDownloading(false);
        setDownloadProgress(0);
      }, 2000);
    }
  };

  // Helper to trigger browser save dialog from local memory blob
  const saveBlobLocally = (blob: Blob, filename: string) => {
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    }, 4000);
  };

  // Helper for hidden iframe download fallback (never navigates away or opens a new tab)
  const triggerHiddenIframeDownload = (url: string, filename: string) => {
    const proxyUrl = `/api/proxy-download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`;
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = proxyUrl;
    document.body.appendChild(iframe);
    setTimeout(() => {
      try {
        document.body.removeChild(iframe);
      } catch {}
    }, 60000);
  };

  const formatLoadedBytes = (bytes: number): string => {
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="w-full max-w-4xl mx-auto my-8 rounded-3xl p-6 sm:p-8 glass-panel border border-slate-800/90 light:border-slate-200 shadow-2xl transition-all animate-in fade-in duration-300">
      {/* Top Header Bar of Result */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-slate-800/80 light:border-slate-200">
        <div className="flex items-center gap-2">
          <span className="flex h-2.5 w-2.5 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-xs font-mono font-semibold uppercase tracking-wider text-cyan-400">
            Media Siap Diunduh Otomatis · {media.platform.toUpperCase()}
          </span>
        </div>

        <button
          type="button"
          onClick={onReset}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white light:text-slate-600 light:hover:text-slate-900 py-1.5 px-3 rounded-lg bg-slate-900/60 light:bg-slate-100 hover:bg-slate-800 transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Ganti Link</span>
        </button>
      </div>

      {/* Main Media Info & Thumbnail */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 my-6 items-start">
        {/* Thumbnail Preview */}
        <div className="md:col-span-5 relative group overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900 shadow-lg aspect-video md:aspect-[4/3]">
          {media.thumbnail && media.thumbnail.trim() ? (
            <img
              src={media.thumbnail.trim()}
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

          {/* Format selection cards */}
          <div className="rounded-2xl bg-slate-900/60 light:bg-slate-100/80 p-4 border border-slate-800/80 light:border-slate-200">
            <span className="text-xs font-semibold text-slate-300 light:text-slate-700 block mb-2.5">
              Pilih Kualitas Unduhan ({activeFilter === 'video' ? 'Video MP4' : 'Audio MP3'}):
            </span>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {displayFormats.map((fmt) => {
                const isSelected = currentFormat?.id === fmt.id;
                return (
                  <button
                    key={fmt.id}
                    type="button"
                    onClick={() => setSelectedFormatId(fmt.id)}
                    className={`flex flex-col items-start p-2.5 rounded-xl border text-left transition-all ${
                      isSelected
                        ? 'border-cyan-400 bg-cyan-950/50 text-cyan-200 ring-2 ring-cyan-500/25 shadow-sm'
                        : 'border-slate-800 bg-slate-900/80 text-slate-300 hover:border-slate-700 light:bg-white light:border-slate-200 light:text-slate-700'
                    }`}
                  >
                    <span className="text-xs font-bold truncate w-full">{fmt.quality}</span>
                    <div className="flex items-center justify-between w-full mt-1 text-[10px] text-slate-400 light:text-slate-500">
                      <span className="font-mono">{fmt.extension.toUpperCase()}</span>
                      {fmt.filesize && <span>{fmt.filesize}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Download Progress Bar if active */}
          {isDownloading && (
            <div className="space-y-2 p-4 rounded-2xl bg-cyan-950/50 border border-cyan-800/70 animate-in fade-in duration-200">
              <div className="flex items-center justify-between text-xs text-cyan-300">
                <span className="flex items-center gap-2 font-medium">
                  <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
                  <span>{downloadStatusText}</span>
                </span>
                <span className="font-mono font-bold">{downloadProgress}%</span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-900">
                <div
                  className="h-full bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-500 transition-all duration-200 rounded-full"
                  style={{ width: `${downloadProgress}%` }}
                />
              </div>
              <span className="text-[11px] text-slate-400 block text-right">
                Mengunduh langsung ke penyimpanan tanpa membuka tab baru
              </span>
            </div>
          )}

          {/* Success Banner */}
          {downloadSuccess && !isDownloading && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-emerald-950/50 border border-emerald-800/70 text-emerald-200 text-xs animate-in fade-in duration-200">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <span className="font-bold block">Unduhan Berhasil!</span>
                <p>{downloadSuccess}</p>
              </div>
            </div>
          )}

          {/* Primary Action Button: Automatic Instant Download */}
          <div className="pt-2">
            <button
              type="button"
              disabled={isDownloading || !currentFormat}
              onClick={() => currentFormat && handleDownloadTrigger(currentFormat)}
              className="w-full h-14 rounded-2xl font-bold text-sm text-white bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:from-cyan-400 hover:via-blue-500 hover:to-indigo-500 disabled:opacity-50 shadow-lg shadow-cyan-500/25 transition-all flex items-center justify-center gap-2.5 active:scale-[0.99] cursor-pointer"
            >
              {isDownloading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Sedang Mengunduh Otomatis...</span>
                </>
              ) : (
                <>
                  <Download className="h-5 w-5" />
                  <span>Unduh Otomatis ({currentFormat?.quality || 'Pilihan'})</span>
                </>
              )}
            </button>
            <span className="text-[11px] text-slate-400 light:text-slate-500 text-center block mt-2">
              Berkas langsung disimpan otomatis ke folder Downloads tanpa diarahkan ke link eksternal.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
