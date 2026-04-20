'use client'

import { Globe } from 'lucide-react'

export function LanguageSelector() {
  return (
    <div className="flex items-center gap-2 px-4 py-2 text-slate-500 cursor-default select-none" title="Additional languages coming soon">
      <Globe className="w-5 h-5" />
      <span className="text-xl">🇬🇧</span>
      <span className="font-medium">English</span>
    </div>
  )
}
