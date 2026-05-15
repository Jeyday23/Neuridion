'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { InfoTooltip } from '@/app/components/ui/InfoTooltip'

const DEVICE_CLASSES = ['Class I', 'Class IIa', 'Class IIb', 'Class III']

interface CompetitorEntry {
  name: string
  manufacturer: string
}

export function ProfileForm() {
  const router = useRouter()
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [competitors, setCompetitors] = useState<CompetitorEntry[]>([])

  function addCompetitor() {
    if (competitors.length >= 20) return
    setCompetitors(prev => [...prev, { name: '', manufacturer: '' }])
  }

  function removeCompetitor(idx: number) {
    setCompetitors(prev => prev.filter((_, i) => i !== idx))
  }

  function updateCompetitor(idx: number, field: 'name' | 'manufacturer', value: string) {
    setCompetitors(prev => prev.map((e, i) => i === idx ? { ...e, [field]: value } : e))
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const fd = new FormData(e.currentTarget)

    try {
      const res = await fetch('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_name:      (fd.get('device_name') as string)?.trim(),
          manufacturer:     (fd.get('manufacturer') as string)?.trim(),
          emdn_code:        (fd.get('emdn_code') as string)?.trim() || undefined,
          device_class:     (fd.get('device_class') as string) || undefined,
          intended_use:     (fd.get('intended_use') as string)?.trim() || undefined,
          competitor_terms: competitors.filter(e => e.name.trim()),
        }),
      })
      const data = await res.json() as { error?: string | Record<string, string[]> }
      if (!res.ok) {
        const msg = typeof data.error === 'string' ? data.error : 'Validation failed. Check your inputs.'
        setError(msg)
        return
      }
      router.push('/dashboard/profiles')
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const inputClass = 'w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20'

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-2 gap-5">
        <div>
          <label htmlFor="device_name" className="block text-sm font-medium text-zinc-700 mb-1.5">
            Device name <span className="text-red-500">*</span>
          </label>
          <input id="device_name" name="device_name" type="text" required
            placeholder="e.g. CardioSense Pro" className={inputClass} />
        </div>
        <div>
          <label htmlFor="manufacturer" className="block text-sm font-medium text-zinc-700 mb-1.5">
            Manufacturer <span className="text-red-500">*</span>
          </label>
          <input id="manufacturer" name="manufacturer" type="text" required
            placeholder="e.g. Acme Medical GmbH" className={inputClass} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5">
        <div>
          <label htmlFor="emdn_code" className="block text-sm font-medium text-zinc-700 mb-1.5">
            EMDN code
            <InfoTooltip text="European Medical Device Nomenclature — a standardised code classifying your device type (e.g. Z12030101). Find yours in the EUDAMED database." />
          </label>
          <input id="emdn_code" name="emdn_code" type="text"
            placeholder="e.g. Z12" className={inputClass} />
        </div>
        <div>
          <label htmlFor="device_class" className="block text-sm font-medium text-zinc-700 mb-1.5">
            Device class
          </label>
          <select id="device_class" name="device_class" defaultValue=""
            className={inputClass}>
            <option value="" disabled>Select class…</option>
            {DEVICE_CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="intended_use" className="block text-sm font-medium text-zinc-700 mb-1.5">
          Intended use
          <InfoTooltip text="Describe your device's intended purpose as stated in your technical documentation. Used by the AI to assess FSN relevance to your device." />
        </label>
        <textarea id="intended_use" name="intended_use" rows={4}
          placeholder="Describe the device's intended purpose, target patient population, and clinical setting…"
          className={`${inputClass} resize-none`} />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-sm font-medium text-zinc-700">
            Competitor products
            <InfoTooltip text="Add competitor devices to monitor. Their FSNs will be included in your search results, helping you track the competitive landscape and similar device incidents." />
          </label>
          {competitors.length > 0 && (
            <span className="text-xs text-zinc-400">{competitors.length}/20</span>
          )}
        </div>

        {competitors.length === 0 ? (
          <button type="button" onClick={addCompetitor}
            className="w-full rounded border border-dashed border-zinc-300 px-4 py-3 text-sm text-zinc-500 hover:border-zinc-400 hover:text-zinc-600 transition-colors">
            + Add a competitor product
          </button>
        ) : (
          <div className="space-y-2">
            {competitors.map((entry, idx) => (
              <div key={idx} className="flex items-start gap-2">
                <input type="text" value={entry.name}
                  onChange={(e) => updateCompetitor(idx, 'name', e.target.value)}
                  placeholder="Product name"
                  className={`${inputClass} flex-1`} />
                <input type="text" value={entry.manufacturer}
                  onChange={(e) => updateCompetitor(idx, 'manufacturer', e.target.value)}
                  placeholder="Manufacturer (optional)"
                  className={`${inputClass} flex-1`} />
                <button type="button" onClick={() => removeCompetitor(idx)}
                  className="mt-2 text-zinc-400 hover:text-red-500 transition-colors shrink-0"
                  aria-label="Remove competitor">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </button>
              </div>
            ))}
            {competitors.length < 20 && (
              <button type="button" onClick={addCompetitor}
                className="text-sm text-zinc-500 hover:text-zinc-700 transition-colors">
                + Add another
              </button>
            )}
          </div>
        )}
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</p>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button type="submit" disabled={saving}
          className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed">
          {saving ? 'Saving…' : 'Create profile'}
        </button>
      </div>
    </form>
  )
}
