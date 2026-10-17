import React, { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Archive,
  Maximize2,
  X,
  Loader2,
  CheckCircle2,
  Music,
  Camera
} from 'lucide-react';
import JSZip from 'jszip';
import type { MediaMetadata } from '../types/index.ts';
import { saveDownloadedMedia } from '../services/historyStorage.ts';

interface PhotoSlideCardProps {
  media: MediaMetadata;
}

export const PhotoSlideCard: React.FC<PhotoSlideCardProps> = ({ media }) => {
  const images = media.images && media.images.length > 0 ? media.images : [media.thumbnail];
  const total = images.length;

  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState<boolean>(false);
  const [isZipping, setIsZipping] = useState<boolean>(false);
  const [zipProgress, setZipProgress] = useState<string>('');
  const [isDownloadingSingle, setIsDownloadingSingle] = useState<boolean>(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const currentImage = images[currentIndex] || images[0];

  // Navigation handlers
  const handlePrev = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : total - 1));
  };

  const handleNext = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCurrentIndex((prev) => (prev < total - 1 ? prev + 1 : 0));
  };

  // 1. Download Current Single Photo
  const handleDownloadSingle = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isDownloadingSingle) return;

    setIsDownloadingSingle(true);
    setSuccessToast(null);

    try {
      const sanitizedTitle = (media.title || 'TikTok_Photo')
        .slice(0, 30)
        .replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `${sanitizedTitle}_slide_${currentIndex + 1}.jpg`;

      // Use backend proxy to trigger direct attachment download
      const proxyUrl = `/api/proxy-download?url=${encodeURIComponent(currentImage)}&filename=${encodeURIComponent(filename)}`;
      const link = document.createElement('a');
      link.href = proxyUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setSuccessToast(`Foto #${currentIndex + 1} berhasil diunduh!`);
      setTimeout(() => setSuccessToast(null), 3000);
    } catch (err: any) {
      console.error('Download single photo error:', err);
    } finally {
      setIsDownloadingSingle(false);
    }
  };

  // 2. Download All Photos Packaged as ZIP (without corruption)
  const handleDownloadAllZip = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isZipping) return;

    setIsZipping(true);
    setSuccessToast(null);
    setZipProgress(`Menyiapkan ${total} foto...`);

    try {
      const zip = new JSZip();
      const sanitizedTitle = (media.title || 'TikTok_Photos')
        .slice(0, 30)
        .replace(/[^a-zA-Z0-9_-]/g, '_');

      const photoFolder = zip.folder(sanitizedTitle) || zip;

      // Download each image safely via our proxy to avoid CORS and ensure valid binary blobs
      for (let i = 0; i < total; i++) {
        setZipProgress(`Mengunduh foto ${i + 1} dari ${total}...`);
        const imgUrl = images[i];

        const proxyFetchUrl = `/api/proxy-download?url=${encodeURIComponent(imgUrl)}&filename=photo_${i + 1}.jpg`;
        const res = await fetch(proxyFetchUrl);

        if (!res.ok) {
          throw new Error(`Gagal mengambil foto ke-${i + 1}`);
        }

        const blob = await res.blob();
        const paddedIndex = String(i + 1).padStart(2, '0');
        photoFolder.file(`${sanitizedTitle}_foto_${paddedIndex}.jpg`, blob);
      }

      // If background music is present, add it to the ZIP package too!
      const audioFormat = media.formats.find((f) => f.type === 'audio');
      if (audioFormat?.url) {
        try {
          setZipProgress('Menambahkan audio musik TikTok...');
          const audioProxy = `/api/proxy-download?url=${encodeURIComponent(audioFormat.url)}&filename=Audio_TikTok.mp3`;
          const aRes = await fetch(audioProxy);
          if (aRes.ok) {
            const aBlob = await aRes.blob();
            photoFolder.file(`${sanitizedTitle}_Audio_Musik.mp3`, aBlob);
          }
        } catch (e) {
          console.warn('Audio inclusion skipped:', e);
        }
      }

      setZipProgress('Mengompresi berkas ZIP...');
      const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      });

      const zipFilename = `DownloaderZero_${sanitizedTitle}_Semua_Foto.zip`;
      const downloadUrl = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = zipFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(downloadUrl);

      // Save to local offline history (available for 24 hours)
      try {
        const sizeMb = (zipBlob.size / (1024 * 1024)).toFixed(1);
        await saveDownloadedMedia({
          sourceUrl: media.url,
          platform: media.platform,
          title: `${media.title || 'Foto TikTok'} (${total} Foto Slide)`,
          author: media.author || 'Kreator',
          thumbnail: media.thumbnail || images[0] || '',
          quality: `${total} Foto HD (ZIP)`,
          resolution: 'HD Foto',
          mediaType: 'photos',
          extension: 'zip',
          filename: zipFilename,
          filesize: `${sizeMb} MB`,
          filesizeBytes: zipBlob.size,
          blob: zipBlob
        });
      } catch (histErr) {
        console.warn('ZIP history save notice:', histErr);
      }

      setSuccessToast(`Semua ${total} foto berhasil dibungkus ke ZIP & tersimpan di Riwayat!`);
      setTimeout(() => setSuccessToast(null), 3500);
    } catch (err: any) {
      console.error('ZIP generation error:', err);
      alert(err.message || 'Gagal membuat file ZIP. Silakan coba lagi.');
    } finally {
      setIsZipping(false);
      setZipProgress('');
    }
  };

  return (
    <div className="dz-card rounded-3xl p-4 sm:p-5 w-full shadow-2xl border border-cyan-500/60 select-none animate-in fade-in duration-300">
      {/* Top Header Information */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-blue-900/60">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-cyan-950/80 border border-cyan-500/50 flex items-center justify-center text-cyan-400 shrink-0">
            <Camera className="h-4 w-4" />
          </div>
          <div>
            <h4 className="text-xs sm:text-sm font-bold text-white truncate max-w-[200px] sm:max-w-md">
              {media.title || 'TikTok Slide Foto HD'}
            </h4>
            <span className="text-[11px] text-cyan-300/90 font-medium">
              {media.author} · {total} Foto Slide Beresolusi Penuh
            </span>
          </div>
        </div>

        {/* Counter Badge */}
        <div className="px-2.5 py-1 rounded-full bg-cyan-950/80 border border-cyan-400/60 text-cyan-300 font-mono text-xs font-bold shrink-0">
          {currentIndex + 1} / {total}
        </div>
      </div>

      {/* 1:1 FIXED ASPECT RATIO SLIDE CONTAINER */}
      <div className="relative w-full max-w-sm sm:max-w-md mx-auto aspect-square rounded-2xl overflow-hidden border-2 border-cyan-500/50 bg-[#020617] group shadow-inner">
        {/* The Slide Image */}
        <img
          src={currentImage}
          alt={`TikTok Slide ${currentIndex + 1}`}
          onClick={() => setIsLightboxOpen(true)}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02] cursor-pointer"
        />

        {/* Floating Hint Pill */}
        <div
          onClick={() => setIsLightboxOpen(true)}
          className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-xl bg-black/60 backdrop-blur-md border border-white/20 text-white text-[10px] sm:text-xs font-bold flex items-center gap-1.5 shadow-md cursor-pointer hover:bg-black/80 transition-colors"
        >
          <Maximize2 className="h-3.5 w-3.5 text-cyan-400" />
          <span>Lihat Ukuran Penuh</span>
        </div>

        {/* Previous Button Arrow */}
        {total > 1 && (
          <button
            type="button"
            onClick={handlePrev}
            aria-label="Foto Sebelumnya"
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/65 backdrop-blur-md border border-cyan-500/50 text-white flex items-center justify-center hover:bg-cyan-500 hover:text-black hover:scale-110 shadow-lg transition-all cursor-pointer"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}

        {/* Next Button Arrow */}
        {total > 1 && (
          <button
            type="button"
            onClick={handleNext}
            aria-label="Foto Selanjutnya"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/65 backdrop-blur-md border border-cyan-500/50 text-white flex items-center justify-center hover:bg-cyan-500 hover:text-black hover:scale-110 shadow-lg transition-all cursor-pointer"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}

        {/* Dots Strip at Bottom of 1:1 Frame */}
        {total > 1 && (
          <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/10 max-w-[80%] overflow-x-auto">
            {images.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrentIndex(idx);
                }}
                className={`w-2 h-2 rounded-full transition-all shrink-0 cursor-pointer ${
                  idx === currentIndex
                    ? 'w-4 bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.8)]'
                    : 'bg-white/40 hover:bg-white/80'
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Success Toast */}
      {successToast && (
        <div className="mt-3 p-2.5 rounded-xl bg-emerald-950/80 border border-emerald-500/60 text-emerald-300 text-xs font-bold flex items-center gap-2 justify-center animate-in fade-in">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <span>{successToast}</span>
        </div>
      )}

      {/* Action Buttons Row: Unduh Foto Ini vs Unduh Semua (ZIP) */}
      <div className="mt-4 pt-3 border-t border-blue-900/60 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {/* Button 1: Unduh Foto Ini */}
        <button
          type="button"
          onClick={handleDownloadSingle}
          disabled={isDownloadingSingle || isZipping}
          className="h-12 rounded-xl bg-[#0c224a] hover:bg-[#12316b] border border-cyan-500/50 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-md hover:shadow-[0_0_15px_rgba(6,182,212,0.4)] transition-all cursor-pointer disabled:opacity-60"
        >
          {isDownloadingSingle ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
              <span>Mengunduh...</span>
            </>
          ) : (
            <>
              <Download className="h-4 w-4 text-cyan-400" />
              <span>Unduh Foto Ini (#{currentIndex + 1})</span>
            </>
          )}
        </button>

        {/* Button 2: Unduh Semua Foto (Bungkus ZIP) */}
        <button
          type="button"
          onClick={handleDownloadAllZip}
          disabled={isZipping || isDownloadingSingle}
          className="h-12 rounded-xl bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(6,182,212,0.5)] hover:shadow-[0_0_30px_rgba(6,182,212,0.7)] transition-all cursor-pointer disabled:opacity-60"
        >
          {isZipping ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-white" />
              <span className="truncate">{zipProgress || 'Memproses ZIP...'}</span>
            </>
          ) : (
            <>
              <Archive className="h-4 w-4 text-white" />
              <span>Unduh Semua Foto (ZIP · {total})</span>
            </>
          )}
        </button>
      </div>

      {/* FLOATING LIGHTBOX MODAL (GAMBAR NGAMBANG & SESUAI UKURAN) */}
      {isLightboxOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/90 backdrop-blur-xl animate-in fade-in duration-200"
          onClick={() => setIsLightboxOpen(false)}
        >
          {/* Floating Container */}
          <div
            className="relative max-w-4xl max-h-[92vh] flex flex-col items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top Close & Counter Bar */}
            <div className="w-full flex items-center justify-between pb-3 text-white">
              <span className="text-xs sm:text-sm font-mono font-bold text-cyan-300 bg-black/50 px-3 py-1 rounded-full border border-cyan-500/40">
                Foto {currentIndex + 1} dari {total}
              </span>
              <button
                type="button"
                onClick={() => setIsLightboxOpen(false)}
                className="w-9 h-9 rounded-full bg-slate-900/80 border border-white/20 text-white flex items-center justify-center hover:bg-red-600 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Floating Full-Size Image */}
            <div className="relative max-h-[75vh] rounded-2xl overflow-hidden border border-cyan-500/50 shadow-2xl shadow-cyan-500/30 bg-black">
              <img
                src={currentImage}
                alt={`Full Slide ${currentIndex + 1}`}
                className="max-h-[75vh] w-auto object-contain mx-auto"
              />

              {/* Lightbox Navigation Controls */}
              {total > 1 && (
                <>
                  <button
                    type="button"
                    onClick={handlePrev}
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/70 border border-cyan-400 text-white flex items-center justify-center hover:bg-cyan-500 hover:text-black transition-all cursor-pointer"
                  >
                    <ChevronLeft className="h-7 w-7" />
                  </button>
                  <button
                    type="button"
                    onClick={handleNext}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/70 border border-cyan-400 text-white flex items-center justify-center hover:bg-cyan-500 hover:text-black transition-all cursor-pointer"
                  >
                    <ChevronRight className="h-7 w-7" />
                  </button>
                </>
              )}
            </div>

            {/* Lightbox Action Controls */}
            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                onClick={handleDownloadSingle}
                className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-cyan-500/40 cursor-pointer"
              >
                <Download className="h-4 w-4" />
                <span>Unduh Foto Ini</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadAllZip}
                disabled={isZipping}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-blue-500/40 cursor-pointer"
              >
                <Archive className="h-4 w-4" />
                <span>Unduh Semua (ZIP)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
