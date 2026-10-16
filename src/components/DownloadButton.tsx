import React from 'react';
import { Download, Loader2 } from 'lucide-react';

interface DownloadButtonProps {
  onDownload: () => void;
  isLoading: boolean;
  isDownloading: boolean;
  downloadProgress: number;
  downloadStatusText: string;
}

export const DownloadButton: React.FC<DownloadButtonProps> = ({
  onDownload,
  isLoading,
  isDownloading,
  downloadProgress,
  downloadStatusText
}) => {
  return (
    <div className="w-full flex flex-col items-center gap-2 select-none">
      {/* Button Row with Cyber Slashes */}
      <div className="w-full flex items-center justify-between gap-3">
        {/* Left Cyber Accents */}
        <div className="hidden xs:flex items-center gap-1 text-cyan-400 opacity-90 select-none">
          <span className="font-cyber font-black text-xl italic tracking-tighter drop-shadow-[0_0_8px_rgba(6,182,212,0.8)]">///</span>
        </div>

        {/* Big Glow CTA Button */}
        <button
          type="button"
          onClick={onDownload}
          disabled={isLoading || isDownloading}
          className="flex-1 h-14 sm:h-15 rounded-2xl bg-gradient-to-r from-[#00c6ff] via-[#0072ff] to-[#0052d4] hover:from-[#26d0ce] hover:to-[#1a2980] text-white flex items-center justify-center gap-2.5 text-base sm:text-lg font-extrabold tracking-wide shadow-[0_0_25px_rgba(6,182,212,0.65)] hover:shadow-[0_0_35px_rgba(6,182,212,0.85)] border-t border-cyan-200/50 active:scale-[0.99] transition-all cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed"
        >
          {isLoading || isDownloading ? (
            <>
              <Loader2 className="h-6 w-6 animate-spin text-white" />
              <span>{isDownloading ? 'Mengunduh...' : 'Memproses...'}</span>
            </>
          ) : (
            <>
              <Download className="h-6 w-6 text-white stroke-[2.5]" />
              <span className="drop-shadow-md">Download</span>
            </>
          )}
        </button>

        {/* Right Cyber Accents */}
        <div className="hidden xs:flex items-center gap-1 text-cyan-400 opacity-90 select-none">
          <span className="font-cyber font-black text-xl italic tracking-tighter drop-shadow-[0_0_8px_rgba(6,182,212,0.8)]">///</span>
        </div>
      </div>

      {/* Real-time Progress Bar & Status (when active) */}
      {isDownloading && (
        <div className="w-full dz-card rounded-xl p-3 border border-cyan-500/40 shadow-lg animate-in fade-in">
          <div className="flex items-center justify-between text-xs text-cyan-300 font-semibold mb-1.5">
            <span>{downloadStatusText || 'Sedang memproses...'}</span>
            <span className="font-mono text-white">{downloadProgress}%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-slate-900 overflow-hidden border border-blue-900">
            <div
              className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all duration-300 shadow-[0_0_8px_rgba(6,182,212,0.8)]"
              style={{ width: `${Math.max(5, downloadProgress)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
