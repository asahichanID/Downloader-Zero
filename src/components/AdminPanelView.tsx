import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  ShieldCheck,
  Eye,
  Activity,
  CheckCircle2,
  XCircle,
  Globe,
  Link2,
  SlidersHorizontal,
  UserCheck,
  Clock,
  ExternalLink
} from 'lucide-react';
import {
  TARGET_WEB_DOMAIN,
  subscribeSiteViews,
  subscribeDownloadActivities,
  type DownloadActivityRecord
} from '../services/firebase.ts';

interface AdminPanelViewProps {
  onBackToSettings: () => void;
}

type ActivityFilter = 'all' | 'berhasil' | 'gagal';

function formatPlatformName(platform: string): string {
  const p = (platform || '').toLowerCase().trim();
  switch (p) {
    case 'youtube':
      return 'YouTube';
    case 'tiktok':
      return 'TikTok';
    case 'twitter':
      return 'Twitter (X)';
    case 'facebook':
      return 'Facebook';
    case 'instagram':
      return 'Instagram';
    case 'pinterest':
      return 'Pinterest';
    case 'spotify':
      return 'Spotify';
    case 'terabox':
      return 'TeraBox';
    default:
      return p ? p.charAt(0).toUpperCase() + p.slice(1) : 'Lainnya';
  }
}

function formatVisitorTag(visitorId: string): string {
  const cleaned = (visitorId || '').replace(/^fp_/, '').toUpperCase();
  return cleaned ? `Pengunjung #${cleaned.slice(0, 6)}` : 'Pengunjung';
}

function formatActivityTime(ms: number): string {
  if (!ms || isNaN(ms)) return 'Baru saja';
  try {
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(ms));
  } catch {
    return 'Baru saja';
  }
}

/**
 * Dedicated Administrator Panel View.
 * Includes non-clickable Web Viewing counter and realtime Download Activity log.
 */
export const AdminPanelView: React.FC<AdminPanelViewProps> = React.memo(({
  onBackToSettings
}) => {
  const [totalViews, setTotalViews] = useState<number | null>(null);
  const [viewsError, setViewsError] = useState<string | null>(null);

  const [activities, setActivities] = useState<DownloadActivityRecord[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState<boolean>(true);
  const [activitiesError, setActivitiesError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ActivityFilter>('all');

  useEffect(() => {
    const unsubViews = subscribeSiteViews(
      (count) => {
        setTotalViews(count);
        setViewsError(null);
      },
      (errMsg) => {
        setViewsError(errMsg);
      }
    );

    const unsubActivities = subscribeDownloadActivities(
      (items) => {
        setActivities(items);
        setActivitiesLoading(false);
        setActivitiesError(null);
      },
      (errMsg) => {
        setActivitiesLoading(false);
        setActivitiesError(errMsg);
      }
    );

    return () => {
      unsubViews();
      unsubActivities();
    };
  }, []);

  const stats = useMemo(() => {
    let successCount = 0;
    let failedCount = 0;
    for (const item of activities) {
      if (item.status === 'berhasil') successCount++;
      else failedCount++;
    }
    return { total: activities.length, successCount, failedCount };
  }, [activities]);

  const filteredActivities = useMemo(() => {
    if (filter === 'all') return activities;
    return activities.filter((item) => item.status === filter);
  }, [activities, filter]);

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

      {/* 1. Viewing Module (Strictly Non-Clickable / Read-Only) */}
      <div
        aria-label="Viewing Kunjungan Web"
        className="dz-card rounded-2xl p-4 flex items-center justify-between gap-3 select-none"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-sky-100 dark:bg-cyan-500/15 border border-sky-200 dark:border-cyan-400/30 flex items-center justify-center text-sky-600 dark:text-cyan-400 shrink-0">
            <Eye className="w-5 h-5" />
          </div>
          <div className="min-w-0 space-y-0.5">
            <h2 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white leading-tight">
              Viewing
            </h2>
            <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 truncate">
              <Globe className="w-3 h-3 text-sky-500 dark:text-cyan-400 shrink-0" />
              <span className="truncate font-mono">{TARGET_WEB_DOMAIN}</span>
            </p>
          </div>
        </div>

        <div className="text-right shrink-0 pl-2">
          <div className="text-xl sm:text-2xl font-extrabold font-mono tabular-nums text-sky-600 dark:text-cyan-400 leading-none">
            {totalViews === null ? '...' : totalViews.toLocaleString('id-ID')}
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mt-1">
            Total Views
          </span>
        </div>
      </div>

      {viewsError && (
        <div className="px-3.5 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-700/50 text-xs text-amber-800 dark:text-amber-200">
          Viewing belum dapat dimuat dari Firebase: {viewsError}
        </div>
      )}

      {/* 2. Aktifitas Unduhan (Download Activity Log) */}
      <div className="dz-card rounded-2xl overflow-hidden">
        {/* Card Header */}
        <div className="p-4 border-b border-slate-200 dark:border-blue-500/15 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-600/20 border border-blue-200 dark:border-blue-400/30 flex items-center justify-center text-blue-600 dark:text-cyan-400 shrink-0">
                <Activity className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h2 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white leading-tight">
                  Aktifitas Unduhan
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  Riwayat unduhan pengguna secara realtime
                </p>
              </div>
            </div>

            <span className="text-xs font-mono font-bold tabular-nums px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 shrink-0">
              {stats.total} Log
            </span>
          </div>

          {/* Filter Tabs */}
          <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-[#050e24] border border-slate-200 dark:border-blue-900/60">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                filter === 'all'
                  ? 'bg-white dark:bg-[#0e2650] text-sky-700 dark:text-cyan-300 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Semua ({stats.total})
            </button>
            <button
              type="button"
              onClick={() => setFilter('berhasil')}
              className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                filter === 'berhasil'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400'
              }`}
            >
              Berhasil ({stats.successCount})
            </button>
            <button
              type="button"
              onClick={() => setFilter('gagal')}
              className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                filter === 'gagal'
                  ? 'bg-red-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400'
              }`}
            >
              Gagal ({stats.failedCount})
            </button>
          </div>
        </div>

        {/* Activity List Body */}
        <div className="divide-y divide-slate-200 dark:divide-blue-500/15 max-h-[480px] overflow-y-auto">
          {activitiesError ? (
            <div className="p-6 text-center text-xs text-amber-700 dark:text-amber-300">
              Gagal memuat aktifitas unduhan: {activitiesError}
            </div>
          ) : activitiesLoading ? (
            <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
              Memuat aktifitas unduhan dari Firebase...
            </div>
          ) : filteredActivities.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800/80 flex items-center justify-center text-slate-400 mx-auto">
                <Activity className="w-5 h-5" />
              </div>
              <p className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300">
                Belum ada aktifitas unduhan
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Aktifitas akan otomatis tercatat setiap kali pengguna menekan tombol download.
              </p>
            </div>
          ) : (
            filteredActivities.map((item) => {
              const isSuccess = item.status === 'berhasil';
              return (
                <div
                  key={item.id}
                  className="p-3.5 sm:p-4 space-y-2 hover:bg-slate-50/70 dark:hover:bg-white/[0.02] transition-colors"
                >
                  {/* Top Row: Platform + Visitor + Status Badge */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      <span className="px-2 py-0.5 rounded-md bg-sky-100 dark:bg-cyan-500/15 border border-sky-200 dark:border-cyan-400/30 text-[11px] font-bold text-sky-700 dark:text-cyan-300">
                        {formatPlatformName(item.platform)}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                        <UserCheck className="w-3 h-3 text-slate-400" />
                        <span>{formatVisitorTag(item.visitorId)}</span>
                      </span>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold shrink-0 border ${
                        isSuccess
                          ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30'
                          : 'bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300 border-red-200 dark:border-red-500/30'
                      }`}
                    >
                      {isSuccess ? (
                        <CheckCircle2 className="w-3 h-3" />
                      ) : (
                        <XCircle className="w-3 h-3" />
                      )}
                      <span>{isSuccess ? 'Berhasil' : 'Gagal'}</span>
                    </span>
                  </div>

                  {/* URL Row */}
                  <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200 bg-slate-100/80 dark:bg-[#050e24] border border-slate-200/80 dark:border-blue-900/50 rounded-xl px-2.5 py-1.5">
                    <Link2 className="w-3.5 h-3.5 text-sky-600 dark:text-cyan-400 shrink-0" />
                    <span className="font-mono text-[11px] truncate flex-1 select-all">
                      {item.url}
                    </span>
                    {item.url.startsWith('http') && (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-400 hover:text-sky-600 dark:hover:text-cyan-400 shrink-0"
                        title="Buka URL"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>

                  {/* Bottom Meta Row: Resolusi + Timestamp */}
                  <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-300">
                      <SlidersHorizontal className="w-3 h-3 text-sky-600 dark:text-cyan-400" />
                      <span>Resolusi: {item.resolution}</span>
                    </span>
                    <span className="inline-flex items-center gap-1 tabular-nums shrink-0">
                      <Clock className="w-3 h-3" />
                      <span>{formatActivityTime(item.createdAtMs)}</span>
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
});
