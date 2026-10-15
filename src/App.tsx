/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar.tsx';
import { DownloaderForm } from './components/DownloaderForm.tsx';
import { MediaResult } from './components/MediaResult.tsx';
import { PlatformCards } from './components/PlatformCards.tsx';
import { SettingsModal } from './components/SettingsModal.tsx';
import { TermsModal } from './components/TermsModal.tsx';
import { Footer } from './components/Footer.tsx';
import { detectPlatform } from './services/scraper.ts';
import type { PlatformType, MediaType, MediaMetadata } from './types/index.ts';

import hero3d from './assets/images/hero_3d_downloader_orb_1792076524936.jpg';
import stream3d from './assets/images/platforms_3d_stream_1792076525876.jpg';
import { Zap, ShieldCheck, Sparkles, Cpu, Layers } from 'lucide-react';

export default function App() {
  const [url, setUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [mediaData, setMediaData] = useState<MediaMetadata | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [mediaTypeFilter, setMediaTypeFilter] = useState<MediaType>('video');

  // Modal states
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isTermsOpen, setIsTermsOpen] = useState<boolean>(false);
  const [termsDefaultTab, setTermsDefaultTab] = useState<'terms' | 'privacy'>('terms');

  // Theme state: default dark, sync with localStorage and root class
  const [isDark, setIsDark] = useState<boolean>(() => {
    const saved = localStorage.getItem('dz_theme');
    return saved ? saved === 'dark' : true;
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
      localStorage.setItem('dz_theme', 'dark');
    } else {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
      localStorage.setItem('dz_theme', 'light');
    }
  }, [isDark]);

  const toggleTheme = () => {
    setIsDark((prev) => !prev);
  };

  const detectedPlatform = detectPlatform(url);

  // Form submit handler
  const handleExtract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url: url.trim() })
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Gagal mengekstrak media dari URL.');
      }

      setMediaData(json.data);
    } catch (err: any) {
      setErrorMessage(
        err.message || 'Terjadi gangguan jaringan atau konten tidak dapat diakses. Pastikan URL publik dan valid.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectSample = (sampleUrl: string) => {
    setUrl(sampleUrl);
    setErrorMessage(null);
    window.scrollTo({ top: 120, behavior: 'smooth' });
  };

  const handleReset = () => {
    setMediaData(null);
    setUrl('');
    setErrorMessage(null);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 transition-colors dark:bg-slate-950 dark:text-slate-100 light:bg-slate-50 light:text-slate-900">
      {/* Navigation */}
      <Navbar
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenTerms={() => {
          setTermsDefaultTab('terms');
          setIsTermsOpen(true);
        }}
      />

      {/* Main Container */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-10">
        {/* Futuristic 3D Hero Section */}
        <section className="relative overflow-hidden rounded-3xl border border-slate-800/80 light:border-slate-200 mb-8 p-6 sm:p-10 lg:p-12 glass-panel">
          {/* Background Ambient Glow */}
          <div className="absolute top-0 right-0 -z-10 h-96 w-96 rounded-full bg-cyan-500/10 blur-[100px] pointer-events-none" />
          <div className="absolute bottom-0 left-0 -z-10 h-96 w-96 rounded-full bg-indigo-600/10 blur-[100px] pointer-events-none" />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Left Column: Headlines */}
            <div className="lg:col-span-7 space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/70 border border-cyan-800/60 text-cyan-300 text-xs font-mono font-medium">
                <Zap className="h-3.5 w-3.5 text-cyan-400" />
                <span>Engine 2026 · Resolusi Hingga 4K & Audio 320 kbps</span>
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white light:text-slate-900 leading-[1.15]">
                Downloader<span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-400">Zero</span>
              </h1>

              <p className="text-sm sm:text-base text-slate-300 light:text-slate-600 leading-relaxed max-w-xl">
                Unduh video tanpa watermark dan audio MP3 berkecepatan tinggi dari YouTube, TikTok, Facebook, dan Instagram secara gratis, tanpa iklan pop-up, dan tanpa instalasi aplikasi.
              </p>

              {/* Trust Badges */}
              <div className="pt-2 flex flex-wrap items-center gap-4 text-xs font-medium text-slate-400 light:text-slate-600">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-cyan-400" />
                  <span>100% Gratis & Aktif</span>
                </span>
                <span aria-hidden="true" className="text-slate-700">·</span>
                <span className="flex items-center gap-1.5">
                  <Cpu className="h-4 w-4 text-cyan-400" />
                  <span>Vercel Cloud Serverless</span>
                </span>
                <span aria-hidden="true" className="text-slate-700">·</span>
                <span className="flex items-center gap-1.5">
                  <Layers className="h-4 w-4 text-cyan-400" />
                  <span>Multi-Kualitas Terlengkap</span>
                </span>
              </div>
            </div>

            {/* Right Column: 3D Orb Visual */}
            <div className="lg:col-span-5 relative flex justify-center">
              <div className="relative w-full max-w-md aspect-video sm:aspect-square rounded-2xl overflow-hidden border border-cyan-500/30 shadow-2xl shadow-cyan-500/10">
                <img
                  src={hero3d}
                  alt="DownloaderZero 3D Engine Orb"
                  className="w-full h-full object-cover transition-transform duration-700 hover:scale-105"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent pointer-events-none" />
                <div className="absolute bottom-3 left-3 right-3 p-2.5 rounded-xl bg-slate-950/70 backdrop-blur-md border border-white/10 flex items-center justify-between text-xs font-mono text-cyan-300">
                  <span className="truncate">DZ High-Speed Proxy Engine</span>
                  <span className="text-emerald-400 font-bold shrink-0 ml-2">● LIVE</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Downloader Input Form */}
        <DownloaderForm
          url={url}
          setUrl={setUrl}
          onSubmit={handleExtract}
          isLoading={isLoading}
          detectedPlatform={detectedPlatform}
          mediaTypeFilter={mediaTypeFilter}
          setMediaTypeFilter={setMediaTypeFilter}
          errorMessage={errorMessage}
          onClearError={() => setErrorMessage(null)}
        />

        {/* Media Result (if extracted) */}
        {mediaData && (
          <MediaResult
            media={mediaData}
            activeFilter={mediaTypeFilter}
            onReset={handleReset}
          />
        )}

        {/* 4 Supported Platforms Grid */}
        <PlatformCards
          onSelectSample={handleSelectSample}
          activePlatform={detectedPlatform}
        />

        {/* Extra Feature & Architecture Showcase */}
        <section className="my-12 rounded-3xl border border-slate-800/80 light:border-slate-200 p-6 sm:p-8 glass-panel">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-6 space-y-4">
              <h3 className="text-xl sm:text-2xl font-bold text-white light:text-slate-900">
                Mengapa Memilih DownloaderZero?
              </h3>
              <p className="text-xs sm:text-sm text-slate-400 light:text-slate-600 leading-relaxed">
                Kami membangun DownloaderZero dengan arsitektur modern yang ringan dan efisien. Tidak ada software berbahaya, tidak ada tombol unduhan palsu yang mengarahkan ke malware, dan tidak ada batasan kuota unduhan.
              </p>

              <div className="grid grid-cols-2 gap-4 pt-2">
                <div className="p-3.5 rounded-xl bg-slate-900/60 light:bg-slate-100 border border-slate-800/80 light:border-slate-200">
                  <span className="text-xs font-bold text-cyan-400 block mb-1">Kualitas 4K Ultra HD</span>
                  <span className="text-[11px] text-slate-400 light:text-slate-600">Video resolusi penuh hingga 2160p untuk kejernihan maksimal.</span>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-900/60 light:bg-slate-100 border border-slate-800/80 light:border-slate-200">
                  <span className="text-xs font-bold text-cyan-400 block mb-1">Audio 320 kbps</span>
                  <span className="text-[11px] text-slate-400 light:text-slate-600">Ekstraksi audio MP3 dengan frekuensi studio yang jernih.</span>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-900/60 light:bg-slate-100 border border-slate-800/80 light:border-slate-200">
                  <span className="text-xs font-bold text-cyan-400 block mb-1">Tanpa Watermark</span>
                  <span className="text-[11px] text-slate-400 light:text-slate-600">Unduh klip TikTok murni bersih tanpa logo yang mengganggu.</span>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-900/60 light:bg-slate-100 border border-slate-800/80 light:border-slate-200">
                  <span className="text-xs font-bold text-cyan-400 block mb-1">Vercel Ready</span>
                  <span className="text-[11px] text-slate-400 light:text-slate-600">Dukungan deployment Serverless Function dengan timeout optimal.</span>
                </div>
              </div>
            </div>

            <div className="lg:col-span-6 relative overflow-hidden rounded-2xl border border-slate-800/80 aspect-video">
              <img
                src={stream3d}
                alt="DownloaderZero Media Pipeline"
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 to-transparent pointer-events-none" />
              <div className="absolute bottom-4 left-4 right-4 text-xs font-mono text-cyan-300">
                High-Concurrency Data Pipeline · Zero In-Memory Buffering
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Centered Settings Modal (With Light/Dark toggle and bright blue S&K) */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onOpenTerms={() => {
          setTermsDefaultTab('terms');
          setIsTermsOpen(true);
        }}
        isDark={isDark}
        toggleTheme={toggleTheme}
      />

      {/* Terms & Conditions / Privacy Modal */}
      <TermsModal
        isOpen={isTermsOpen}
        onClose={() => setIsTermsOpen(false)}
        defaultTab={termsDefaultTab}
      />

      {/* Footer with exact requirements */}
      <Footer
        onOpenTerms={() => {
          setTermsDefaultTab('terms');
          setIsTermsOpen(true);
        }}
        onOpenPrivacy={() => {
          setTermsDefaultTab('privacy');
          setIsTermsOpen(true);
        }}
      />
    </div>
  );
}
