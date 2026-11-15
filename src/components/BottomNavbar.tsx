import React from 'react';
import { Home, History, Settings } from 'lucide-react';

export type TabType = 'beranda' | 'riwayat' | 'pengaturan';

interface BottomNavbarProps {
  activeTab: TabType;
  onChangeTab: (tab: TabType) => void;
  historyCount?: number;
  locked?: boolean;
}

export const BottomNavbar: React.FC<BottomNavbarProps> = React.memo(({
  activeTab,
  onChangeTab,
  historyCount = 0,
  locked = false
}) => {
  const tabs = [
    {
      id: 'beranda' as TabType,
      label: 'Beranda',
      icon: Home
    },
    {
      id: 'riwayat' as TabType,
      label: 'Riwayat',
      icon: History,
      badge: historyCount > 0 ? historyCount : undefined
    },
    {
      id: 'pengaturan' as TabType,
      label: 'Pengaturan',
      icon: Settings
    }
  ];

  return (
    <nav
      aria-label="Navigasi Utama"
      className="fixed bottom-3 sm:bottom-4 inset-x-3 sm:inset-x-6 max-w-xl md:max-w-2xl mx-auto z-40 select-none"
    >
      <div className="relative rounded-full bg-white/97 dark:bg-[#081530]/97 border border-slate-200 dark:border-blue-500/25 shadow-xl shadow-slate-900/15 dark:shadow-2xl dark:shadow-black/75 px-2 py-1.5 flex items-center justify-around">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          const isDisabled = locked && !isActive;

          return (
            <button
              key={tab.id}
              type="button"
              disabled={isDisabled}
              onClick={() => {
                if (!locked) onChangeTab(tab.id);
              }}
              className={`relative flex-1 py-2 px-3 flex flex-col items-center justify-center rounded-full border transition-colors duration-150 touch-manipulation ${
                isActive
                  ? 'bg-sky-100 dark:bg-blue-600/30 border-sky-400/60 dark:border-cyan-400/50'
                  : 'border-transparent hover:bg-slate-100/70 dark:hover:bg-white/5'
              } ${
                isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
              }`}
            >
              {/* Icon & Label */}
              <div className="relative z-10 flex flex-col items-center gap-0.5">
                <div className="relative">
                  <Icon
                    className={`w-5 h-5 transition-transform duration-150 ${
                      isActive
                        ? 'text-sky-600 dark:text-cyan-400 scale-110'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  />
                  {tab.badge !== undefined && (
                    <span className="absolute -top-1 -right-2 px-1 py-0.2 rounded-full bg-sky-600 dark:bg-cyan-400 text-white dark:text-slate-950 text-[9px] font-extrabold">
                      {tab.badge > 99 ? '99+' : tab.badge}
                    </span>
                  )}
                </div>
                <span
                  className={`text-[11px] tracking-tight transition-colors duration-150 ${
                    isActive ? 'text-sky-600 dark:text-cyan-400 font-bold' : 'text-slate-500 dark:text-slate-400 font-medium'
                  }`}
                >
                  {tab.label}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </nav>
  );
});
