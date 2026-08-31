'use client'

import { useState, useEffect, startTransition } from 'react'
import { X } from 'lucide-react'

const STORAGE_KEY = 'neuridion-prototype-banner-dismissed'

export function PrototypeBanner() {
  const [dismissed, setDismissed] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    startTransition(() => {
      setMounted(true)
      if (localStorage.getItem(STORAGE_KEY) === 'true') setDismissed(true)
    })
  }, [])

  function handleDismiss() {
    setDismissed(true)
    localStorage.setItem(STORAGE_KEY, 'true')
  }

  // Avoid flash before localStorage is read
  if (!mounted || dismissed) return null

  return (
    <div className="relative z-[60] bg-[#0F1F3D] border-b border-[#0D9488]/30 overflow-hidden">
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4">
        {/* Left spacer mirrors close button */}
        <div className="w-6 shrink-0 hidden sm:block" />

        <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4 flex-1 text-center">
          {/* Wordmark + badge */}
          <div className="flex items-center gap-3">
            <span
              className="text-white font-bold tracking-wide uppercase"
              style={{ fontSize: 'clamp(0.875rem, 2vw, 1rem)', fontFamily: 'var(--font-geist-sans)' }}
            >
              NEURIDION
            </span>
            <span className="px-2 py-0.5 rounded border border-[#0D9488]/60 bg-[#0D9488]/10 text-[#0D9488] text-[10px] font-mono font-medium tracking-[0.2em] uppercase leading-none">
              EARLY ACCESS
            </span>
          </div>

          {/* Divider */}
          <span className="hidden sm:block text-[#134E4A] select-none">|</span>

          {/* Message */}
          <p className="text-[#0F766E] text-sm leading-snug">
            You&apos;re using an <span className="text-white font-medium">early-access build</span>.
            {' '}Features may change.
          </p>
        </div>

        {/* Dismiss */}
        <button
          onClick={handleDismiss}
          aria-label="Dismiss banner"
          className="shrink-0 w-6 h-6 flex items-center justify-center rounded text-[#0F766E] hover:text-white transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
