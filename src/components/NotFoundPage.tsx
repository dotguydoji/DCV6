import React from 'react';
import { ArrowLeft, Home, Search, TriangleAlert } from 'lucide-react';

export const NotFoundPage: React.FC = () => {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#1e2122] text-white">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-20 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-brand-yellow/15 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-[28rem] w-[28rem] rounded-full bg-white/5 blur-3xl" />
        <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,0.15)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.15)_1px,transparent_1px)] [background-size:64px_64px]" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl items-center px-6 py-16 lg:px-10">
        <div className="grid w-full grid-cols-1 gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:gap-16">
          <div className="flex flex-col justify-center">
            <div className="mb-6 inline-flex w-fit items-center gap-3 rounded-full border border-brand-yellow/30 bg-brand-yellow/10 px-4 py-2 text-xs font-black uppercase tracking-[0.28em] text-brand-yellow">
              <TriangleAlert size={16} />
              Page not found
            </div>

            <h1 className="max-w-2xl text-5xl font-black uppercase leading-[0.92] tracking-tight text-white sm:text-6xl lg:text-8xl">
              The link you followed does not exist.
            </h1>

            <p className="mt-6 max-w-xl text-base leading-7 text-brand-gray sm:text-lg">
              The page may have been moved, deleted, or typed incorrectly. You can return to the homepage and keep exploring Doji&apos;s Library.
            </p>

            <div className="mt-10 flex flex-col gap-4 sm:flex-row">
              <a
                href="/"
                className="inline-flex items-center justify-center gap-3 rounded-sm border border-brand-yellow bg-brand-yellow px-6 py-4 text-sm font-black uppercase tracking-[0.18em] text-black transition-all hover:bg-transparent hover:text-brand-yellow"
              >
                <Home size={18} />
                Back Home
              </a>
              <a
                href="/"
                className="inline-flex items-center justify-center gap-3 rounded-sm border border-white/10 bg-white/5 px-6 py-4 text-sm font-black uppercase tracking-[0.18em] text-white transition-all hover:border-white/30 hover:bg-white/10"
              >
                <ArrowLeft size={18} />
                Return to Start
              </a>
            </div>

            <div className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
              <div className="flex items-start gap-4">
                <div className="mt-0.5 rounded-full border border-brand-yellow/30 bg-brand-yellow/10 p-3 text-brand-yellow">
                  <Search size={18} />
                </div>
                <div>
                  <p className="text-sm font-black uppercase tracking-[0.18em] text-white/80">
                    Need a quick check?
                  </p>
                  <p className="mt-2 text-sm leading-6 text-brand-gray">
                    Verify the URL for typos, or go back to the homepage and use the site navigation to find the right page.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center">
            <div className="relative w-full max-w-md rounded-[2rem] border border-white/10 bg-[#1a1d1e]/80 p-8 shadow-[0_40px_120px_rgba(0,0,0,0.55)] backdrop-blur-xl">
              <div className="absolute -top-5 left-8 rounded-full border border-brand-yellow/40 bg-[#1e2122] px-4 py-2 text-[11px] font-black uppercase tracking-[0.28em] text-brand-yellow">
                404
              </div>

              <div className="space-y-5 pt-6">
                <div className="h-2 w-20 rounded-full bg-brand-yellow" />
                <div className="h-2 w-40 rounded-full bg-white/15" />
                <div className="h-2 w-28 rounded-full bg-white/10" />

                <div className="rounded-2xl border border-white/10 bg-black/40 p-5">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-brand-gray">
                    Requested URL
                  </p>
                  <p className="mt-3 break-all text-sm text-white/90">
                    {typeof window !== 'undefined' ? window.location.pathname : '/'}
                  </p>
                </div>

                <div className="rounded-2xl border border-brand-yellow/20 bg-brand-yellow/10 p-5">
                  <p className="text-sm font-black uppercase tracking-[0.16em] text-brand-yellow">
                    Deployment ready
                  </p>
                  <p className="mt-2 text-sm leading-6 text-brand-gray">
                    This page is ready for direct-link visits, crawler checks, and clean 404 responses on hosting platforms that support a dedicated error page.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
};
