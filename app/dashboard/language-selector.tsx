'use client'

import { useState } from 'react'
import { Globe } from 'lucide-react'

const languages = [
  { code: 'en', name: 'English',    flag: '🇬🇧' },
  { code: 'de', name: 'Deutsch',    flag: '🇩🇪' },
  { code: 'fr', name: 'Français',   flag: '🇫🇷' },
  { code: 'es', name: 'Español',    flag: '🇪🇸' },
  { code: 'it', name: 'Italiano',   flag: '🇮🇹' },
  { code: 'pt', name: 'Português',  flag: '🇵🇹' },
  { code: 'nl', name: 'Nederlands', flag: '🇳🇱' },
  { code: 'pl', name: 'Polski',     flag: '🇵🇱' },
  { code: 'sv', name: 'Svenska',    flag: '🇸🇪' },
]

export function LanguageSelector() {
  const [selected, setSelected] = useState('en')
  const [open, setOpen] = useState(false)
  const current = languages.find((l) => l.code === selected) ?? languages[0]

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
      >
        <Globe className="w-5 h-5" />
        <span className="text-xl">{current.flag}</span>
        <span className="font-medium">{current.name}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-64 bg-white border border-slate-200 rounded-lg shadow-lg z-20 py-2">
            {languages.map((lang) => (
              <button
                key={lang.code}
                onClick={() => { setSelected(lang.code); setOpen(false) }}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors ${
                  selected === lang.code ? 'bg-blue-50 text-blue-700' : 'text-slate-700'
                }`}
              >
                <span className="text-xl">{lang.flag}</span>
                <span className="font-medium">{lang.name}</span>
                {selected === lang.code && <span className="ml-auto text-blue-600">✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
