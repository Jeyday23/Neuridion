'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { InfoTooltip } from '@/app/components/ui/InfoTooltip'

const DEVICE_CLASSES = ['Class I', 'Class IIa', 'Class IIb', 'Class III'] as const

interface Profile {
  id: string
  device_name: string
  manufacturer: string
  emdn_code: string | null
  device_class: string | null
  intended_use: string | null
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const res = await fetch(`/api/profiles/${profile.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_name:   deviceName.trim(),
          manufacturer:  manufacturer.trim(),
          emdn_code:     emnCode.trim()     || null,
          device_class:  deviceClass        || null,
          intended_use:  intendedUse.trim() || null,
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
