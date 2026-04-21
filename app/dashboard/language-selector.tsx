'use client'

import { Globe } from 'lucide-react'
import { useLanguage } from './language-context'

const LOCALES = [
  { id: 'en', label: 'English', flag: '🇬🇧' },
  { id: 'de', label: 'Deutsch', flag: '🇩🇪' },
] as const

export function LanguageSelector() {
  const { locale, setLocale } = useLanguage()
  const current = LOCALES.find((l) => l.id === locale) ?? LOCALES[0]

  return (
    <div className="relative group">
      <button
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors text-sm"
        aria-label="Select language"
      >
        <Globe className="w-4 h-4" />
        <span className="text-base">{current.flag}</span>
        <span className="font-medium">{current.label}</span>
        <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      <div className="absolute right-0 top-full mt-1 w-36 rounded-lg border border-slate-200 bg-white shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
        {LOCALES.map((l) => (
          <button
            key={l.id}
            onClick={() => setLocale(l.id)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-slate-50 transition-colors first:rounded-t-lg last:rounded-b-lg ${
              locale === l.id ? 'font-semibold text-blue-600' : 'text-slate-700'
            }`}
          >
            <span className="text-base">{l.flag}</span>
            {l.label}
            {locale === l.id && (
              <svg className="w-3.5 h-3.5 ml-auto text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
