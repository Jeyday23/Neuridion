'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { InfoTooltip } from '@/app/components/ui/InfoTooltip'

const DEVICE_CLASSES = ['Class I', 'Class IIa', 'Class IIb', 'Class III'] as const

interface CompetitorEntry {
  name: string
  manufacturer: string
}

interface Profile {
  id: string
  device_name: string
  manufacturer: string
  emdn_code: string | null
  device_class: string | null
  intended_use: string | null
  search_strategy: { competitor_terms?: CompetitorEntry[] } | null
}

export function EditProfileForm({ profile }: { profile: Profile }) {
  const router = useRouter()

  const [deviceName,   setDeviceName]   = useState(profile.device_name)
  const [manufacturer, setManufacturer] = useState(profile.manufacturer)
  const [emnCode,      setEmnCode]      = useState(profile.emdn_code   ?? '')
  const [deviceClass,  setDeviceClass]  = useState(profile.device_class ?? '')
  const [intendedUse,  setIntendedUse]  = useState(profile.intended_use ?? '')
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState<string | null>(null)
  const [competitors, setCompetitors] = useState<CompetitorEntry[]>(
    () => (profile.search_strategy?.competitor_terms ?? []).map(e => ({
      name: e.name ?? '',
      manufacturer: e.manufacturer ?? '',
    }))
  )

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const res = await fetch(`/api/profiles/${profile.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_name:      deviceName.trim(),
          manufacturer:     manufacturer.trim(),
          emdn_code:        emnCode.trim()     || null,
          device_class:     deviceClass        || null,
          intended_use:     intendedUse.trim() || null,
          competitor_terms: competitors.filter(e => e.name.trim()),
        }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) {
        setError(data.error ?? 'Save failed.')
        return
      }
      router.push('/dashboard/profiles')
    } catch (err) {
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
          <input id="device_name" type="text" required value={deviceName}
            onChange={(e) => setDeviceName(e.target.value)}
            placeholder="e.g. CardioSense Pro" className={inputClass} />
        </div>
        <div>
          <label htmlFor="manufacturer" className="block text-sm font-medium text-zinc-700 mb-1.5">
            Manufacturer <span className="text-red-500">*</span>
          </label>
          <input id="manufacturer" type="text" required value={manufacturer}
            onChange={(e) => setManufacturer(e.target.value)}
            placeholder="e.g. Acme Medical GmbH" className={inputClass} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5">
        <div>
          <label htmlFor="emdn_code" className="block text-sm font-medium text-zinc-700 mb-1.5">
            EMDN code
            <InfoTooltip text="European Medical Device Nomenclature — a standardised code classifying your device type (e.g. Z12030101). Find yours in the EUDAMED database." />
          </label>
          <input id="emdn_code" type="text" value={emnCode}
            onChange={(e) => setEmnCode(e.target.value)}
            placeholder="e.g. Z12" className={inputClass} />
        </div>
        <div>
          <label htmlFor="device_class" className="block text-sm font-medium text-zinc-700 mb-1.5">
            Device class
          </label>
          <select id="device_class" value={deviceClass}
            onChange={(e) => setDeviceClass(e.target.value)}
            className={inputClass}>
            <option value="">Select class…</option>
            {DEVICE_CLASSES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="intended_use" className="block text-sm font-medium text-zinc-700 mb-1.5">
          Intended use
          <InfoTooltip text="Describe your device's intended purpose as stated in your technical documentation. Used by the AI to assess FSN relevance to your device." />
        </label>
        <textarea id="intended_use" rows={4} value={intendedUse}
          onChange={(e) => setIntendedUse(e.target.value)}
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
                <input
                  type="text"
                  value={entry.name}
                  onChange={(e) => updateCompetitor(idx, 'name', e.target.value)}
                  placeholder="Product name"
                  className={`${inputClass} flex-1`}
                />
                <input
                  type="text"
                  value={entry.manufacturer}
                  onChange={(e) => updateCompetitor(idx, 'manufacturer', e.target.value)}
                  placeholder="Manufacturer (optional)"
                  className={`${inputClass} flex-1`}
                />
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
          className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2">
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        <button type="button" onClick={() => router.push('/dashboard/profiles')}
          className="rounded-lg border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors">
          Cancel
        </button>
      </div>
    </form>
  )
}
