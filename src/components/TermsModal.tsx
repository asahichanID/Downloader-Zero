import React, { useEffect } from 'react';
import { X, ShieldCheck, FileText, Lock, AlertTriangle } from 'lucide-react';

interface TermsModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: 'terms' | 'privacy';
}

export const TermsModal: React.FC<TermsModalProps> = React.memo(({
  isOpen,
  onClose,
  defaultTab = 'terms'
}) => {
  const [activeTab, setActiveTab] = React.useState<'terms' | 'privacy'>(defaultTab);

  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative w-full max-w-2xl max-h-[85vh] flex flex-col rounded-3xl p-6 sm:p-8 bg-white dark:bg-[#07132e] border border-slate-300 dark:border-slate-700/80 shadow-2xl shadow-slate-900/15 dark:shadow-black/85 text-slate-900 dark:text-white dz-animate-scale"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800/80">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-sky-100 dark:bg-cyan-950/60 border border-sky-300 dark:border-cyan-800/60 flex items-center justify-center text-cyan-600 dark:text-cyan-400">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white leading-tight">
                Syarat, Ketentuan & Kebijakan
              </h2>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                DownloaderZero (DZ) · Perlindungan Hak Cipta & Privasi
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white bg-slate-100 dark:bg-slate-900/60 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
            aria-label="Tutup"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tab switch */}
        <div className="flex items-center gap-2 pt-4">
          <button
            type="button"
            onClick={() => setActiveTab('terms')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-colors duration-150 cursor-pointer ${
              activeTab === 'terms'
                ? 'bg-cyan-500 text-white shadow-sm shadow-black/30'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-900/40'
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            <span>Syarat & Ketentuan (S&K)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('privacy')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-colors duration-150 cursor-pointer ${
              activeTab === 'privacy'
                ? 'bg-cyan-500 text-white shadow-sm shadow-black/30'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-900/40'
            }`}
          >
            <Lock className="h-3.5 w-3.5" />
            <span>Kebijakan Privasi</span>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto my-4 pr-1 text-xs sm:text-sm text-slate-700 dark:text-slate-300 space-y-4 leading-relaxed">
          {activeTab === 'terms' ? (
            <>
              <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800/50 flex items-start gap-2.5 text-amber-900 dark:text-amber-200 text-xs">
                <AlertTriangle className="h-4 w-4 text-amber-500 dark:text-amber-400 shrink-0 mt-0.5" />
                <p>
                  DownloaderZero (DZ) disediakan secara cuma-cuma khusus untuk konsumsi pribadi (Personal Fair Use) atau arsip materi bebas royalti / public domain. Kami tidak mendukung pelanggaran hak cipta.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-slate-900 dark:text-white mb-1">
                  1. Kepatuhan Hak Cipta & Hak Kekayaan Intelektual
                </h4>
                <p className="text-slate-600 dark:text-slate-400 text-xs">
                  Semua video, audio, thumbnail, dan metadata yang diproses melalui layanan ini adalah milik masing-masing pembuat konten dan pemegang hak cipta asli di YouTube, TikTok, Meta (Facebook/Instagram), atau platform terkait. Pengguna bertanggung jawab penuh atas penggunaan materi yang diunduh.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-slate-900 dark:text-white mb-1">
                  2. Batasan Penggunaan yang Diperbolehkan
                </h4>
                <p className="text-slate-600 dark:text-slate-400 text-xs">
                  Anda setuju untuk tidak mendistribusikan ulang, menjual, atau memanfaatkan konten berhak cipta untuk tujuan komersial tanpa izin tertulis dari pemilik hak cipta. Penggunaan downloader hanya diperbolehkan untuk tontonan offline pribadi atau konten milik Anda sendiri.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-slate-900 dark:text-white mb-1">
                  3. Ketersediaan Layanan Tanpa Jaminan (Disclaimer)
                </h4>
                <p className="text-slate-600 dark:text-slate-400 text-xs">
                  Layanan ini memanfaatkan endpoint pengurai gratis yang dapat berubah sewaktu-waktu tergantung pada pembaruan API dari masing-masing platform. Kami berupaya memberikan ketersediaan terbaik tanpa jaminan ketersediaan mutlak.
                </p>
              </div>
            </>
          ) : (
            <>
              <div>
                <h4 className="font-bold text-slate-900 dark:text-white mb-1">
                  1. Kebijakan Tanpa Penyimpanan Data (Zero Logging)
                </h4>
                <p className="text-slate-600 dark:text-slate-400 text-xs">
                  DownloaderZero (DZ) tidak pernah menyimpan rekaman video, riwayat unduhan, maupun data penjelajahan Anda di basis data kami. Semua proses streaming dilakukan secara real-time dan langsung dialirkan ke peramban Anda.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-slate-900 dark:text-white mb-1">
                  2. Bebas Pelacak & Cookie Pihak Ketiga
                </h4>
                <p className="text-slate-600 dark:text-slate-400 text-xs">
                  Kami tidak menyisipkan skrip pelacak pihak ketiga atau iklan yang merusak privasi. Preferensi tema (Gelap/Terang) disimpan secara lokal di perangkat Anda (Local Storage) dan tidak pernah dikirim ke server.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-slate-900 dark:text-white mb-1">
                  3. Keamanan Komunikasi
                </h4>
                <p className="text-slate-600 dark:text-slate-400 text-xs">
                  Seluruh lalu lintas komunikasi data diamankan dengan enkripsi HTTPS TLS modern untuk memastikan koneksi Anda dengan server downloader selalu terenkripsi dan terlindungi.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800/80 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold text-white bg-slate-800 hover:bg-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl active:scale-[0.96] transition-transform duration-150 cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
});
