'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'

const STORAGE_KEY = 'kodex-prototype-banner-dismissed'

export function PrototypeBanner() {
  const [dismissed, setDismissed] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    if (localStorage.getItem(STORAGE_KEY) === 'true') setDismissed(true)
  }, [])

  function handleDismiss() {
    setDismissed(true)
    localStorage.setItem(STORAGE_KEY, 'true')
  }

  // Avoid flash before localStorage is read
  if (!mounted || dismissed) return null

  return (
    <div className="relative z-[60] bg-[#030712] border-b border-cyan-500/20 overflow-hidden">
      {/* Animated scan line */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(105deg, transparent 40%, rgba(6,182,212,0.04) 50%, transparent 60%)',
          animation: 'scan 4s linear infinite',
        }}
      />
      {/* Glow strip at bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4">
        {/* Left spacer mirrors close button */}
        <div className="w-6 shrink-0 hidden sm:block" />

        <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4 flex-1 text-center">
          {/* Wordmark + badge */}
          <div className="flex items-center gap-3">
            <span
              className="text-white font-black tracking-[0.25em] uppercase"
              style={{ fontSize: 'clamp(1rem, 2.5vw, 1.5rem)', fontFamily: 'var(--font-geist-sans)' }}
            >
              KODEX MEDICAL
            </span>
            <span className="px-2 py-0.5 rounded border border-cyan-500/60 bg-cyan-500/10 text-cyan-400 text-[10px] font-mono font-bold tracking-[0.2em] uppercase leading-none animate-pulse">
              PROTOTYPE
            </span>
          </div>

          {/* Divider */}
          <span className="hidden sm:block text-slate-700 select-none">|</span>

          {/* Message */}
          <p className="text-slate-400 text-sm leading-snug">
            You&apos;re previewing an early build —&nbsp;
            <span className="text-white font-semibold">
              full launch&nbsp;<span className="text-cyan-400">June&nbsp;2026</span>
            </span>
            . Features may change.
          </p>
        </div>

        {/* Dismiss */}
        <button
          onClick={handleDismiss}
          aria-label="Dismiss banner"
          className="shrink-0 w-6 h-6 flex items-center justify-center rounded text-slate-600 hover:text-slate-300 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <style>{`
        @keyframes scan {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}</style>
    </div>
  )
}
