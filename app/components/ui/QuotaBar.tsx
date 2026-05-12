'use client'

import Link from 'next/link'
import { clsx } from 'clsx'
import { InfoTooltip } from './InfoTooltip'

interface QuotaBarProps {
  searchesUsed: number
  searchesMax: number
  profilesUsed: number
  profilesMax: number
}

function Bar({ used, max, label }: { used: number; max: number; label: string }) {
  const unlimited = max === -1
  const pct = unlimited ? 0 : max === 0 ? 100 : Math.min(100, Math.round((used / max) * 100))
  const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-teal-500'

  return (
    <div>
      <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
        <span>{label}</span>
        <span className="tabular-nums">{unlimited ? `${used} / ∞` : `${used} / ${max}`}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-zinc-200 overflow-hidden">
        <div className={clsx('h-full rounded-full transition-all', color)} style={{ width: unlimited ? '0%' : `${pct}%` }} />
      </div>
    </div>
  )
}

export function QuotaBar({ searchesUsed, searchesMax, profilesUsed, profilesMax }: QuotaBarProps) {
  const atLimit = (searchesMax !== -1 && searchesUsed >= searchesMax) || (profilesMax !== -1 && profilesUsed >= profilesMax)

  return (
    <div className="px-4 py-3 border-t border-zinc-200 space-y-2.5">
      <div className="flex items-center gap-1">
        <span className="text-xs font-medium text-zinc-600">Plan usage</span>
        <InfoTooltip text="Your current plan limits. Searches reset monthly. Upgrade for higher limits." />
      </div>
      <Bar used={searchesUsed} max={searchesMax} label="Searches" />
      <Bar used={profilesUsed} max={profilesMax} label="Profiles" />
      {atLimit && (
        <Link href="/dashboard/billing" className="block text-xs text-teal-600 hover:underline font-medium">
          Upgrade plan →
        </Link>
      )}
    </div>
  )
}
