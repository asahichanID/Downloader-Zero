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
import { saveDownloadedMedia } from '../services/historyStorage.ts';

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
    const resTag = fmt.resolution || (fmt.quality.includes('2K') ? '2K' : fmt.quality.includes('4K') ? '4K' : fmt.quality.split(' ')[0]);
    const filename = `DownloaderZero_${sanitizedTitle}_${resTag}.${ext}`;

    try {
      let targetDownloadUrl = fmt.url;
      let jobId = fmt.jobId;

      // If format requires async conversion job (e.g. YouTube loader)
      if (!fmt.isDirect || fmt.url.includes('loader.to') || fmt.id.startsWith('yt-')) {
        if (!jobId) {
          const rawRes = (fmt.resolution || '').toLowerCase();
          const rawQual = (fmt.quality || '').toLowerCase();
          const rawId = (fmt.id || '').toLowerCase();
          let loaderFormat = '1080';
          if (fmt.type === 'audio') {
            loaderFormat = 'mp3';
          } else if (rawRes.includes('2160') || rawRes === '4k' || rawQual.includes('4k') || rawId.includes('2160')) {
            loaderFormat = '2160';
          } else if (rawRes.includes('1440') || rawRes === '2k' || rawQual.includes('2k') || rawQual.includes('1440') || rawId.includes('1440')) {
            loaderFormat = '1440';
          } else if (rawRes.includes('1080') || rawQual.includes('1080')) {
            loaderFormat = '1080';
          } else if (rawRes.includes('720') || rawQual.includes('720')) {
            loaderFormat = '720';
          } else if (rawRes.includes('480') || rawQual.includes('480')) {
            loaderFormat = '480';
          } else if (rawRes.includes('360') || rawQual.includes('360')) {
            loaderFormat = '360';
          }

          setDownloadStatusText(`Memulai antrean konversi ${fmt.quality}...`);
          try {
            const startRes = await fetch('/api/start-job', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                format: loaderFormat,
                url: media.url
              })
            });
            if (startRes.ok) {
              const startData = await startRes.json();
              if (startData.downloadUrl) {
                targetDownloadUrl = startData.downloadUrl;
              } else if (startData.id) {
                jobId = startData.id;
              }
            }
          } catch (e) {
            console.warn('Start job notice:', e);
          }
        }

        if (jobId && (!targetDownloadUrl.startsWith('http') || targetDownloadUrl.includes('loader.to'))) {
          setDownloadStatusText('Sedang memproses konversi video...');
          let finished = false;
          let attempts = 0;

          while (!finished && attempts < 35) {
            attempts++;
            await new Promise((r) => setTimeout(r, 1200));

            try {
              const progRes = await fetch(`/api/progress/${encodeURIComponent(jobId)}`);
              if (progRes.ok) {
                const pData = await progRes.json();
                if (pData.success && pData.downloadUrl) {
                  targetDownloadUrl = pData.downloadUrl;
                  finished = true;
                  break;
                } else if (typeof pData.progress === 'number' && pData.progress > 0) {
                  setDownloadProgress(Math.min(85, Math.round(pData.progress)));
                  setDownloadStatusText(pData.statusText || 'Sedang memproses konversi...');
                }
              }
            } catch {
              // Keep polling
            }
          }

          if (!finished || !targetDownloadUrl.startsWith('http') || targetDownloadUrl.includes('loader.to')) {
            throw new Error('Waktu tunggu konversi habis. Silakan coba kembali.');
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

      let finalBlob: Blob;
      if (!reader) {
        // Fallback to direct blob
        finalBlob = await response.blob();
        saveBlobLocally(finalBlob, filename);
      } else {
        const chunks: Uint8Array[] = [];
        let received = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
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

        const mimeType = fmt.type === 'video' ? 'video/mp4' : fmt.type === 'audio' ? 'audio/mpeg' : 'application/octet-stream';
        finalBlob = new Blob(chunks as BlobPart[], { type: mimeType });
        saveBlobLocally(finalBlob, filename);
      }

      // Automatically store in IndexedDB local history (available for 24 hours)
      try {
        await saveDownloadedMedia({
          sourceUrl: targetDownloadUrl,
          platform: media.platform,
          title: media.title || 'Media DownloaderZero',
          author: media.author || 'Creator',
          thumbnail: media.thumbnail || '',
          quality: fmt.quality,
          resolution: fmt.resolution,
          mediaType: fmt.type,
          extension: fmt.extension,
          filename,
          filesize: fmt.filesize || formatLoadedBytes(finalBlob.size),
          filesizeBytes: finalBlob.size,
          blob: finalBlob
        });
      } catch (histErr) {
        console.warn('History auto-save notice:', histErr);
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
    <div className="w-full max-w-4xl mx-auto my-8 rounded-3xl p-6 sm:p-8 dz-card border border-slate-300 dark:border-slate-800/90 shadow-2xl transition-all animate-in fade-in duration-300">
      {/* Top Header Bar of Result */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-800/80">
        <div className="flex items-center gap-2">
          <span className="flex h-2.5 w-2.5 rounded-full bg-cyan-500 dark:bg-cyan-400" />
          <span className="text-xs font-mono font-semibold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
            Media Siap Diunduh Otomatis · {media.platform.toUpperCase()}
          </span>
        </div>

        <button
          type="button"
          onClick={onReset}
          className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white py-1.5 px-3 rounded-lg bg-slate-100 dark:bg-slate-900/60 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Ganti Link</span>
        </button>
      </div>

      {/* Main Media Info & Thumbnail */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 my-6 items-start">
        {/* Thumbnail Preview */}
        <div className="md:col-span-5 relative group overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800/80 bg-slate-100 dark:bg-slate-900 shadow-lg aspect-video md:aspect-[4/3]">
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
            <div className="h-full w-full flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-900 text-slate-400 dark:text-slate-600">
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
            <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white leading-snug line-clamp-2">
              {media.title}
            </h3>

            <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-slate-600 dark:text-slate-400">
              <span className="flex items-center gap-1">
                <User className="h-3.5 w-3.5 text-cyan-500 dark:text-cyan-400" />
                <span>{media.author}</span>
              </span>

              <span aria-hidden="true" className="text-slate-400 dark:text-slate-700">·</span>

              <span className="font-mono text-cyan-600 dark:text-cyan-300 font-medium">
                {media.source}
              </span>
            </div>
          </div>

          {/* Format selection cards */}
          <div className="rounded-2xl bg-slate-50 dark:bg-slate-900/60 p-4 border border-slate-200 dark:border-slate-800/80">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-2.5">
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
                    className={`flex flex-col items-start p-2.5 rounded-xl border text-left transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                      isSelected
                        ? 'border-cyan-500 dark:border-cyan-400 bg-cyan-50 dark:bg-cyan-950/60 text-cyan-900 dark:text-cyan-200 ring-2 ring-cyan-500/30'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 text-slate-700 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-700'
                    }`}
                  >
                    <span className="text-xs font-bold truncate w-full">{fmt.quality}</span>
                    <div className="flex items-center justify-between w-full mt-1 text-[10px] text-slate-500 dark:text-slate-400">
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
            <div className="space-y-2 p-4 rounded-2xl bg-cyan-50 dark:bg-cyan-950/50 border border-cyan-200 dark:border-cyan-800/70 animate-in fade-in duration-200">
              <div className="flex items-center justify-between text-xs text-cyan-800 dark:text-cyan-300">
                <span className="flex items-center gap-2 font-medium">
                  <Loader2 className="h-4 w-4 animate-spin text-cyan-500 dark:text-cyan-400" />
                  <span>{downloadStatusText}</span>
                </span>
                <span className="font-mono font-bold">{downloadProgress}%</span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-900">
                <div
                  className="h-full bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-500 transition-all duration-200 rounded-full"
                  style={{ width: `${downloadProgress}%` }}
                />
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block text-right">
                Mengunduh langsung ke penyimpanan tanpa membuka tab baru
              </span>
            </div>
          )}

          {/* Success Banner */}
          {downloadSuccess && !isDownloading && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/70 text-emerald-800 dark:text-emerald-200 text-xs animate-in fade-in duration-200">
              <CheckCircle2 className="h-4 w-4 text-emerald-500 dark:text-emerald-400 shrink-0 mt-0.5" />
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
              className="w-full h-14 rounded-2xl font-bold text-sm text-white bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:from-cyan-400 hover:via-blue-500 hover:to-indigo-500 disabled:opacity-50 shadow-md shadow-black/40 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] flex items-center justify-center gap-2.5 active:scale-[0.99] cursor-pointer"
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
            <span className="text-[11px] text-slate-500 dark:text-slate-400 text-center block mt-2">
              Berkas langsung disimpan otomatis ke folder Downloads tanpa diarahkan ke link eksternal.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
