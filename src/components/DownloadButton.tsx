import { Download, Loader2, ListMusic } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface DownloadButtonProps {
  onDownload: () => void;
  isLoading: boolean;
  isDownloading: boolean;
  downloadProgress: number;
  downloadStatusText: string;
  isSpotifyPlaylist?: boolean;
}

export const DownloadButton: React.FC<DownloadButtonProps> = ({
  onDownload,
  isLoading,
  isDownloading,
  downloadProgress,
  downloadStatusText,
  isSpotifyPlaylist = false
}) => {
  return (
    <div className="w-full flex flex-col items-center gap-2 select-none">
      {/* Button Row with Cyber Slashes */}
      <div className="w-full flex items-center justify-between gap-3">
        {/* Left Cyber Accents */}
        <div className="hidden xs:flex items-center gap-1 opacity-90 select-none">
          <span className={`font-cyber font-black text-xl italic tracking-tighter ${isSpotifyPlaylist ? 'text-[#1DB954] drop-shadow-[0_0_8px_rgba(29,185,84,0.8)]' : 'text-cyan-400 drop-shadow-[0_0_8px_rgba(6,182,212,0.8)]'}`}>///</span>
        </div>

        {/* Big Glow CTA Button */}
        <button
          type="button"
          onClick={onDownload}
          disabled={isLoading || isDownloading}
          className={`flex-1 h-14 sm:h-15 rounded-2xl text-white flex items-center justify-center gap-2.5 text-base sm:text-lg font-extrabold tracking-wide active:scale-[0.975] hover:-translate-y-0.5 transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed disabled:hover:translate-y-0 ${
            isSpotifyPlaylist
              ? 'bg-gradient-to-r from-[#1DB954] via-emerald-600 to-teal-700 hover:from-[#1ed760] hover:to-emerald-500 shadow-[0_0_25px_rgba(29,185,84,0.65)] hover:shadow-[0_0_35px_rgba(29,185,84,0.85)] border-t border-emerald-300/50'
              : 'bg-gradient-to-r from-[#00c6ff] via-[#0072ff] to-[#0052d4] hover:from-[#26d0ce] hover:to-[#1a2980] shadow-[0_0_25px_rgba(6,182,212,0.65)] hover:shadow-[0_0_35px_rgba(6,182,212,0.85)] border-t border-cyan-200/50'
          }`}
        >
          {isLoading || isDownloading ? (
            <>
              <Loader2 className="h-6 w-6 animate-spin text-white" />
              <span>{isDownloading ? 'Mengunduh...' : isSpotifyPlaylist ? 'Memproses Playlist...' : 'Memproses...'}</span>
            </>
          ) : isSpotifyPlaylist ? (
            <>
              <ListMusic className="h-6 w-6 text-white stroke-[2.5]" />
              <span className="drop-shadow-md">Proses Playlist Spotify</span>
            </>
          ) : (
            <>
              <Download className="h-6 w-6 text-white stroke-[2.5]" />
              <span className="drop-shadow-md">Download</span>
            </>
          )}
        </button>

        {/* Right Cyber Accents */}
        <div className="hidden xs:flex items-center gap-1 opacity-90 select-none">
          <span className={`font-cyber font-black text-xl italic tracking-tighter ${isSpotifyPlaylist ? 'text-[#1DB954] drop-shadow-[0_0_8px_rgba(29,185,84,0.8)]' : 'text-cyan-400 drop-shadow-[0_0_8px_rgba(6,182,212,0.8)]'}`}>///</span>
        </div>
      </div>

      {/* Real-time Progress Bar & Status (when active) with fluid height and opacity */}
      <AnimatePresence>
        {isDownloading && (
          <motion.div
            initial={{ opacity: 0, height: 0, y: -6 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={{ opacity: 0, height: 0, y: -6 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="w-full overflow-hidden"
          >
            <div className="w-full dz-card rounded-xl p-3 border border-cyan-500/40 shadow-lg mt-2">
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
