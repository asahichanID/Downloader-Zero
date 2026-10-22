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
          <span className={`font-cyber font-black text-xl italic tracking-tighter ${isSpotifyPlaylist ? 'text-[#1DB954]' : 'text-cyan-400'}`}>///</span>
        </div>

        {/* CTA Button */}
        <button
          type="button"
          onClick={onDownload}
          disabled={isLoading || isDownloading}
          className={`flex-1 h-14 sm:h-15 rounded-2xl text-white flex items-center justify-center gap-2.5 text-base sm:text-lg font-extrabold tracking-wide active:scale-[0.98] transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed shadow-md shadow-black/40 border-t ${
            isSpotifyPlaylist
              ? 'bg-gradient-to-r from-[#1DB954] via-emerald-600 to-teal-700 hover:from-[#1ed760] hover:to-emerald-500 border-emerald-300/40'
              : 'bg-gradient-to-r from-[#00c6ff] via-[#0072ff] to-[#0052d4] hover:from-[#26d0ce] hover:to-[#1a2980] border-cyan-200/40'
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
              <span>Proses Playlist Spotify</span>
            </>
          ) : (
            <>
              <Download className="h-6 w-6 text-white stroke-[2.5]" />
              <span>Download</span>
            </>
          )}
        </button>

        {/* Right Cyber Accents */}
        <div className="hidden xs:flex items-center gap-1 opacity-90 select-none">
          <span className={`font-cyber font-black text-xl italic tracking-tighter ${isSpotifyPlaylist ? 'text-[#1DB954]' : 'text-cyan-400'}`}>///</span>
        </div>
      </div>

      {/* Real-time Progress Bar & Status (when active) with fluid height and opacity */}
      <AnimatePresence>
        {isDownloading && (
          <motion.div
            initial={{ opacity: 0, height: 0, y: -6 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={{ opacity: 0, height: 0, y: -6 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="w-full overflow-hidden"
          >
            <div className="w-full dz-card rounded-xl p-3 border border-cyan-500/40 shadow-md shadow-black/30 mt-2">
              <div className="flex items-center justify-between text-xs text-cyan-300 font-semibold mb-1.5">
                <span>{downloadStatusText || 'Sedang memproses...'}</span>
                <span className="font-mono text-white">{downloadProgress}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-900 overflow-hidden border border-blue-900">
                <div
                  className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all duration-300 rounded-full"
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
