import React from 'react';
import { X, Check, ShieldCheck, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { PlatformType } from '../types/index.ts';

interface SupportedPlatformsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPlatform: (platform: PlatformType) => void;
}

export const SupportedPlatformsModal: React.FC<SupportedPlatformsModalProps> = ({
  isOpen,
  onClose,
  onSelectPlatform
}) => {
  if (!isOpen) return null;

  const platforms = [
    {
      id: 'youtube' as PlatformType,
      name: 'YouTube & Shorts',
      desc: 'Download video hingga resolusi 4K / 1080p 60fps dan audio MP3 320 kbps jernih.',
      formats: 'MP4, MP3, 4K, 2K, 1080p, 720p',
      color: 'bg-red-600'
    },
    {
      id: 'tiktok' as PlatformType,
      name: 'TikTok Video & Slides',
      desc: 'Unduh video tanpa watermark HD jernih serta paket slide foto ZIP otomatis.',
      formats: 'MP4 (No WM), Foto HD, ZIP, Audio',
      color: 'bg-black'
    },
    {
      id: 'spotify' as PlatformType,
      name: 'Spotify Music & Playlists',
      desc: 'Unduh lagu satuan atau seluruh playlist MP3 320 kbps dengan cover art & ID3 tag lengkap.',
      formats: 'MP3 320kbps, Cover Art, ZIP Album',
      color: 'bg-[#1DB954]'
    },
    {
      id: 'pinterest' as PlatformType,
      name: 'Pinterest Pins & Reels',
      desc: 'Unduh video pin durasi penuh dan gambar fotografi resolusi original 4K.',
      formats: 'MP4 HD, JPG Original, Video Pin',
      color: 'bg-[#E60023]'
    },
    {
      id: 'terabox' as PlatformType,
      name: 'TeraBox Cloud Links',
      desc: 'Bypass batas unduhan TeraBox untuk mengunduh video dan file besar langsung berkecepatan tinggi.',
      formats: 'MP4, Video Asli, File Cloud',
      color: 'bg-[#0086FF]'
    },
    {
      id: 'instagram' as PlatformType,
      name: 'Instagram Reels & Carousel',
      desc: 'Unduh video reels, postingan video feed, dan multi-foto slide carousel berkualitas tinggi.',
      formats: 'MP4 Reels, Foto Carousel, Audio',
      color: 'bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888]'
    },
    {
      id: 'facebook' as PlatformType,
      name: 'Facebook Watch & Reels',
      desc: 'Unduh video publik, reel, dan siaran langsung tersimpan dengan pilihan kualitas HD & SD.',
      formats: 'MP4 1080p, 720p, SD, Audio MP3',
      color: 'bg-[#1877F2]'
    }
  ];

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 16 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-lg rounded-3xl bg-[#081530] border border-blue-500/30 p-5 sm:p-6 shadow-2xl shadow-black/95 text-white max-h-[85vh] flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3.5 border-b border-blue-900/60">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-5 bg-blue-500 rounded-full" />
              <h2 className="text-base sm:text-lg font-bold text-white">
                Platform yang Didukung
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white flex items-center justify-center border border-white/10 active:scale-90 transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* List of Platforms */}
          <div className="overflow-y-auto space-y-3 py-3 pr-1">
            {platforms.map((p) => (
              <div
                key={p.id}
                onClick={() => {
                  onSelectPlatform(p.id);
                  onClose();
                }}
                className="p-3.5 rounded-2xl bg-[#0c1a3a]/80 hover:bg-[#102450] border border-blue-500/20 hover:border-cyan-400/50 flex items-start gap-3.5 transition-all cursor-pointer active:scale-[0.99]"
              >
                <div className={`w-10 h-10 rounded-xl ${p.color} flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-md`}>
                  {p.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-sm text-white">{p.name}</h3>
                    <span className="text-[10px] text-cyan-400 font-semibold bg-cyan-950/60 border border-cyan-800/40 px-2 py-0.5 rounded-full">
                      Didukung
                    </span>
                  </div>
                  <p className="text-xs text-blue-200/70 mt-1 leading-relaxed">
                    {p.desc}
                  </p>
                  <p className="text-[11px] font-mono text-slate-400 mt-1">
                    Format: {p.formats}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Footer Note */}
          <div className="pt-3 border-t border-blue-900/60 flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1.5 text-cyan-400 font-medium">
              <ShieldCheck className="w-4 h-4" />
              <span>Otomatis terdeteksi saat link ditempel</span>
            </span>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs cursor-pointer"
            >
              Selesai
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
