import React from 'react';
import { Home, History, Settings } from 'lucide-react';
import { motion } from 'motion/react';

export type TabType = 'beranda' | 'riwayat' | 'pengaturan';

interface BottomNavbarProps {
  activeTab: TabType;
  onChangeTab: (tab: TabType) => void;
  historyCount?: number;
}

export const BottomNavbar: React.FC<BottomNavbarProps> = ({
  activeTab,
  onChangeTab,
  historyCount = 0
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
      <div className="relative rounded-full bg-[#081530]/92 backdrop-blur-xl border border-blue-500/25 shadow-2xl shadow-black/80 px-2 py-1.5 flex items-center justify-around">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChangeTab(tab.id)}
              className="relative flex-1 py-2 px-3 flex flex-col items-center justify-center rounded-full transition-colors duration-150 cursor-pointer touch-manipulation"
            >
              {/* Animated sliding background pill for active tab */}
              {isActive && (
                <motion.div
                  layoutId="bottomNavIndicator"
                  className="absolute inset-0 rounded-full bg-blue-600/30 border border-cyan-400/50 shadow-inner"
                  transition={{
                    type: 'spring',
                    stiffness: 400,
                    damping: 32
                  }}
                />
              )}

              {/* Icon & Label */}
              <div className="relative z-10 flex flex-col items-center gap-0.5">
                <div className="relative">
                  <Icon
                    className={`w-5 h-5 transition-transform duration-150 ${
                      isActive
                        ? 'text-cyan-400 scale-110 drop-shadow-[0_0_8px_rgba(34,211,238,0.6)]'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  />
                  {tab.badge !== undefined && (
                    <span className="absolute -top-1 -right-2 px-1 py-0.2 rounded-full bg-cyan-400 text-slate-950 text-[9px] font-extrabold">
                      {tab.badge > 99 ? '99+' : tab.badge}
                    </span>
                  )}
                </div>
                <span
                  className={`text-[11px] tracking-tight transition-colors duration-150 ${
                    isActive ? 'text-cyan-400 font-bold' : 'text-slate-400 font-medium'
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
};
