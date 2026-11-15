import React from 'react';
import { ArrowLeft, ShieldCheck, Layers } from 'lucide-react';

interface AdminPanelViewProps {
  onBackToSettings: () => void;
}

/**
 * Dedicated Administrator Panel View.
 * Structured with modular sections so future admin features can be plugged in directly here.
 */
export const AdminPanelView: React.FC<AdminPanelViewProps> = ({
  onBackToSettings
}) => {
  return (
    <div className="w-full space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBackToSettings}
          className="w-9 h-9 rounded-full bg-white dark:bg-slate-900/90 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white flex items-center justify-center border border-slate-200 dark:border-white/10 active:scale-95 transition-transform cursor-pointer shrink-0"
          aria-label="Kembali ke Pengaturan"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2 leading-tight">
            <ShieldCheck className="w-4 h-4 text-sky-600 dark:text-cyan-400" />
            <span>Administrasi</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Area khusus administrator
          </p>
        </div>
      </div>

      {/* Extensible Admin Modules Container */}
      <div className="dz-card rounded-2xl p-6 text-center space-y-3">
        <div className="w-12 h-12 rounded-2xl bg-sky-100 dark:bg-cyan-500/15 border border-sky-200 dark:border-cyan-400/30 flex items-center justify-center text-sky-600 dark:text-cyan-400 mx-auto">
          <Layers className="w-6 h-6" />
        </div>
        <div className="space-y-1 max-w-sm mx-auto">
          <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
            Akses Admin Aktif
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Belum ada modul atau fitur khusus yang ditambahkan di ruang administrasi ini. Area ini siap digunakan untuk penambahan fitur admin berikutnya.
          </p>
        </div>
      </div>
    </div>
  );
};
