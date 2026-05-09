'use client'

import { useEffect, useRef, useState } from 'react'
import { Globe, Check, ChevronDown } from 'lucide-react'
import { useLanguage } from './language-context'
import type { Locale } from '@/lib/i18n'

const LOCALES: { id: Locale; label: string; flag: string }[] = [
  { id: 'en', label: 'English', flag: '🇬🇧' },
  { id: 'de', label: 'Deutsch', flag: '🇩🇪' },
]

export function LanguageSelector() {
  const { locale, setLocale } = useLanguage()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const current = LOCALES.find((l) => l.id === locale) ?? LOCALES[0]

  // Close on click-outside
  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  function choose(l: Locale) {
    setLocale(l)
    setOpen(false)
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[#134E4A] hover:bg-[#F0FDFA] transition-colors text-sm"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Globe className="w-4 h-4" />
        <span className="text-base leading-none">{current.flag}</span>
        <span className="font-medium">{current.label}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-[#0D9488] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 top-full mt-1 w-40 rounded-lg border border-[#E2E8F0] bg-white shadow-lg z-50 overflow-hidden"
        >
          {LOCALES.map((l) => (
            <button
              key={l.id}
              type="button"
              role="option"
              aria-selected={locale === l.id}
              onClick={() => choose(l.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-[#F0FDFA] transition-colors ${
                locale === l.id ? 'font-semibold text-blue-600 bg-blue-50/40' : 'text-[#134E4A]'
              }`}
            >
              <span className="text-base leading-none">{l.flag}</span>
              <span className="flex-1 text-left">{l.label}</span>
              {locale === l.id && <Check className="w-4 h-4 text-blue-600" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
