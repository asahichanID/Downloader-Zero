import React from 'react';
import { X, Youtube, Film, Music, Shield, Info, ExternalLink, Sparkles } from 'lucide-react';
import type { PlatformType } from '../types/index.ts';

interface MenuModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPlatform: (platform: PlatformType) => void;
  onOpenTerms: () => void;
  onOpenPrivacy: () => void;
}

export const MenuModal: React.FC<MenuModalProps> = ({
  isOpen,
  onClose,
  onSelectPlatform,
  onOpenTerms,
  onOpenPrivacy
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm rounded-3xl p-5 dz-card border border-cyan-500/50 shadow-2xl shadow-cyan-500/20"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-blue-900/60">
          <div className="flex items-center gap-2">
            <span className="font-cyber font-black text-cyan-400 italic">DZ</span>
            <span className="font-bold text-white text-base">Menu Navigasi</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-[#0c224a] border border-blue-900 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Platforms List */}
        <div className="py-4 space-y-2">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Pilih Platform
          </span>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                onSelectPlatform('youtube');
                onClose();
              }}
              className="flex items-center gap-2 p-2.5 rounded-xl bg-[#07132e] border border-blue-900 hover:border-red-500/60 hover:bg-red-950/20 text-xs font-bold text-white cursor-pointer"
            >
              <Youtube className="h-4 w-4 text-red-500 shrink-0" />
              <span>YouTube</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onSelectPlatform('tiktok');
                onClose();
              }}
              className="flex items-center gap-2 p-2.5 rounded-xl bg-[#07132e] border border-blue-900 hover:border-cyan-400 hover:bg-cyan-950/20 text-xs font-bold text-white cursor-pointer"
            >
              <Film className="h-4 w-4 text-cyan-400 shrink-0" />
              <span>TikTok</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onSelectPlatform('facebook');
                onClose();
              }}
              className="flex items-center gap-2 p-2.5 rounded-xl bg-[#07132e] border border-blue-900 hover:border-blue-500 hover:bg-blue-950/20 text-xs font-bold text-white cursor-pointer"
            >
              <Film className="h-4 w-4 text-blue-500 shrink-0" />
              <span>Facebook</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onSelectPlatform('instagram');
                onClose();
              }}
              className="flex items-center gap-2 p-2.5 rounded-xl bg-[#07132e] border border-blue-900 hover:border-pink-500 hover:bg-pink-950/20 text-xs font-bold text-white cursor-pointer"
            >
              <Music className="h-4 w-4 text-pink-500 shrink-0" />
              <span>Instagram</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onSelectPlatform('pinterest');
                onClose();
              }}
              className="flex items-center gap-2 p-2.5 rounded-xl bg-[#07132e] border border-blue-900 hover:border-red-500 hover:bg-red-950/20 text-xs font-bold text-white cursor-pointer col-span-2"
            >
              <Film className="h-4 w-4 text-red-500 shrink-0" />
              <span>Pinterest</span>
            </button>
          </div>
        </div>

        {/* Legal Links */}
        <div className="pt-3 border-t border-blue-900/60 space-y-2">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenTerms();
            }}
            className="w-full flex items-center justify-between p-2 rounded-xl text-xs font-medium text-slate-300 hover:text-white hover:bg-blue-950/40 cursor-pointer"
          >
            <span>Syarat &amp; Ketentuan (S&amp;K)</span>
            <Shield className="h-3.5 w-3.5 text-cyan-400" />
          </button>

          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenPrivacy();
            }}
            className="w-full flex items-center justify-between p-2 rounded-xl text-xs font-medium text-slate-300 hover:text-white hover:bg-blue-950/40 cursor-pointer"
          >
            <span>Kebijakan Privasi</span>
            <Info className="h-3.5 w-3.5 text-cyan-400" />
          </button>
        </div>

        {/* Footer Credit */}
        <div className="pt-3 text-center text-[11px] text-slate-500">
          DownloaderZero (DZ) · Engine 2026.1
        </div>
      </div>
    </div>
  );
};
