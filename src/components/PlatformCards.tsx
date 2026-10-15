import React from 'react';
import { Youtube, Film, Music, Share2, Sparkles, CheckCircle2 } from 'lucide-react';
import type { PlatformType } from '../types/index.ts';

interface PlatformCardsProps {
  onSelectSample: (url: string) => void;
  activePlatform: PlatformType;
}

interface PlatformCardData {
  type: PlatformType;
  title: string;
  badge: string;
  icon: React.ComponentType<{ className?: string }>;
  accentColor: string;
  borderColor: string;
  glowColor: string;
  features: string[];
  sampleUrl: string;
  sampleLabel: string;
}

const PLATFORMS: PlatformCardData[] = [
  {
    type: 'youtube',
    title: 'YouTube',
    badge: '4K & MP3',
    icon: Youtube,
    accentColor: 'text-red-500',
    borderColor: 'hover:border-red-500/40',
    glowColor: 'group-hover:shadow-red-500/10',
    features: ['360p, 720p, 1080p FHD, 2K, 4K', 'Audio MP3 128 - 320 kbps', 'Shorts & Long Form Videos'],
    sampleUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    sampleLabel: 'Contoh: Rick Astley 4K Remaster'
  },
  {
    type: 'tiktok',
    title: 'TikTok',
    badge: 'No Watermark HD',
    icon: Film,
    accentColor: 'text-cyan-400',
    borderColor: 'hover:border-cyan-500/40',
    glowColor: 'group-hover:shadow-cyan-500/10',
    features: ['HD 1080p Tanpa Watermark', 'Original Sound MP3 High Quality', 'Video VT, VM & Regular URLs'],
    sampleUrl: 'https://www.tiktok.com/@tiktok/video/7106594312292453675',
    sampleLabel: 'Contoh: TikTok Official Video'
  },
  {
    type: 'facebook',
    title: 'Facebook',
    badge: 'HD & SD MP4',
    icon: Share2,
    accentColor: 'text-blue-500',
    borderColor: 'hover:border-blue-500/40',
    glowColor: 'group-hover:shadow-blue-500/10',
    features: ['Facebook Watch, Reels, Posts', 'Direct High Definition 720p/1080p', 'Ekstraksi Audio MP3'],
    sampleUrl: 'https://www.facebook.com/watch/?v=1393572814172251',
    sampleLabel: 'Contoh: Facebook Watch Video'
  },
  {
    type: 'instagram',
    title: 'Instagram',
    badge: 'Reels & MP3',
    icon: Music,
    accentColor: 'text-pink-500',
    borderColor: 'hover:border-pink-500/40',
    glowColor: 'group-hover:shadow-pink-500/10',
    features: ['Reels, IGTV & Post Videos', 'Kualitas Penuh Resolusi Asli', 'Penyimpanan Cepat 1-Klik'],
    sampleUrl: 'https://www.instagram.com/reel/C_q-jOypD2V/',
    sampleLabel: 'Contoh: Instagram Reels'
  }
];

export const PlatformCards: React.FC<PlatformCardsProps> = ({ onSelectSample, activePlatform }) => {
  return (
    <section className="w-full my-8">
      <div className="flex items-center justify-between mb-4 px-1">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 light:text-slate-600">
            Platform Terintegrasi
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Ekstraksi gratis tanpa watermark dengan scraper aktif
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {PLATFORMS.map((p) => {
          const Icon = p.icon;
          const isCurrentActive = activePlatform === p.type;

          return (
            <div
              key={p.type}
              className={`group relative rounded-2xl border p-4 transition-all duration-200 glass-panel shadow-lg ${p.glowColor} ${
                isCurrentActive
                  ? 'border-cyan-500 ring-2 ring-cyan-500/30'
                  : 'border-slate-800/80 light:border-slate-200 ' + p.borderColor
              }`}
            >
              {/* Top Card Bar */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`p-2 rounded-xl bg-slate-900 border border-slate-800 light:bg-slate-100 light:border-slate-300 ${p.accentColor}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white light:text-slate-900 leading-tight">
                      {p.title}
                    </h3>
                    <span className="text-[10px] text-cyan-400 font-medium">
                      {p.badge}
                    </span>
                  </div>
                </div>
              </div>

              {/* Feature list */}
              <ul className="space-y-1.5 my-3 text-xs text-slate-400 light:text-slate-600">
                {p.features.map((feat, idx) => (
                  <li key={idx} className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                    <span className="truncate">{feat}</span>
                  </li>
                ))}
              </ul>

              {/* Try sample button */}
              <div className="pt-2 border-t border-slate-800/60 light:border-slate-200/80">
                <button
                  type="button"
                  onClick={() => onSelectSample(p.sampleUrl)}
                  className="w-full flex items-center justify-between text-[11px] font-medium text-slate-400 hover:text-cyan-400 py-1 px-2 rounded-lg hover:bg-slate-900/60 light:hover:bg-slate-100 transition-colors"
                >
                  <span className="truncate">{p.sampleLabel}</span>
                  <span className="text-cyan-400 shrink-0 ml-1">Coba →</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
