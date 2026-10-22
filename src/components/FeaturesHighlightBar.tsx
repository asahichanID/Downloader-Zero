import React from 'react';
import { Zap, ShieldCheck, Link2, Smartphone } from 'lucide-react';

export const FeaturesHighlightBar: React.FC = () => {
  const features = [
    {
      icon: <Zap className="h-4 w-4 text-cyan-400 fill-cyan-400/30" />,
      title: 'Proses Cepat',
      desc: 'dan Stabil'
    },
    {
      icon: <ShieldCheck className="h-4 w-4 text-cyan-400" />,
      title: 'Kualitas Terbaik',
      desc: 'HD hingga 4K'
    },
    {
      icon: <Link2 className="h-4 w-4 text-cyan-400 rotate-45" />,
      title: 'Mudah Digunakan',
      desc: 'Cukup Tempel URL'
    },
    {
      icon: <Smartphone className="h-4 w-4 text-cyan-400" />,
      title: 'Support HP',
      desc: '& Desktop'
    }
  ];

  return (
    <div className="w-full dz-card rounded-2xl p-2 sm:p-2.5 border border-slate-300 dark:border-blue-900/60 shadow-md">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-blue-900/40">
        {features.map((f, i) => (
          <div
            key={i}
            className={`flex items-center gap-2 p-1.5 ${i > 0 ? 'pt-2 sm:pt-1.5 sm:pl-3' : ''}`}
          >
            {/* Cyan Square Badge */}
            <div className="w-8 h-8 rounded-xl bg-sky-100 dark:bg-cyan-950/70 border border-sky-300 dark:border-cyan-500/40 flex items-center justify-center shrink-0 shadow-sm">
              {f.icon}
            </div>
            {/* Text */}
            <div className="flex flex-col text-[11px] leading-tight">
              <span className="font-bold text-slate-900 dark:text-white whitespace-nowrap">{f.title}</span>
              <span className="text-slate-600 dark:text-slate-400 whitespace-nowrap">{f.desc}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
