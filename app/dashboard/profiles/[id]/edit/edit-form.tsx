'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, X, CheckCircle, Loader2 } from 'lucide-react'
import { InfoTooltip } from '@/app/components/ui/InfoTooltip'
import { createClient } from '@/lib/supabase/client'
import { apiFetch } from '@/lib/fetch'

const DEVICE_CLASSES = ['Class I', 'Class IIa', 'Class IIb', 'Class III'] as const

interface CompetitorEntry {
  name: string
  manufacturer: string
}

/** Raw shape from DB — may use `name` or legacy `device_name` key */
interface RawCompetitorEntry {
  name?: string
  device_name?: string
  manufacturer?: string
}

interface Profile {
  id: string
  device_name: string
  manufacturer: string
  emdn_code: string | null
  device_class: string | null
  intended_use: string | null
  search_strategy: { competitor_terms?: RawCompetitorEntry[]; strategy_doc_paths?: string[] } | null
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
      name: (e.name || e.device_name || ''),
      manufacturer: e.manufacturer ?? '',
    }))
  )
  const [strategyFiles, setStrategyFiles] = useState<Array<{ key: string; name: string; path: string; status: 'uploading' | 'done' | 'error' }>>(
    () => (profile.search_strategy?.strategy_doc_paths ?? []).map((p, i) => ({
      key: `existing_${i}`,
      name: p.split('/').pop() ?? p,
      path: p,
      status: 'done' as const,
    }))
  )
  const strategyInputRef = useRef<HTMLInputElement>(null)

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

  async function handleStrategyUpload(files: FileList | File[]) {
    const sb = createClient()
    const { data: { user: authUser } } = await sb.auth.getUser()
    if (!authUser) return

    for (const file of Array.from(files)) {
      if (file.size > 10 * 1024 * 1024) continue
      if (strategyFiles.length >= 5) break
      const key = `${Date.now()}_${Math.random().toString(36).slice(2)}`
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${authUser.id}/profiles/${profile.id}/${key}_${safe}`
      setStrategyFiles(prev => [...prev, { key, name: file.name, path, status: 'uploading' }])
      try {
        const { error } = await sb.storage.from('search-attachments').upload(path, file)
        setStrategyFiles(prev => prev.map(f => f.key === key ? { ...f, status: error ? 'error' : 'done' } : f))
      } catch {
        setStrategyFiles(prev => prev.map(f => f.key === key ? { ...f, status: 'error' } : f))
      }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const res = await apiFetch(`/api/profiles/${profile.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_name:      deviceName.trim(),
          manufacturer:     manufacturer.trim(),
          emdn_code:        emnCode.trim()     || null,
          device_class:     deviceClass        || null,
          intended_use:     intendedUse.trim() || null,
          competitor_terms: competitors.filter(e => e.name.trim()),
          strategy_doc_paths: strategyFiles.filter(f => f.status === 'done').map(f => f.path),
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

  const inputClass = 'w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-[#0D9488] focus:outline-none focus:ring-2 focus:ring-[#0D9488]/20'

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
          <p className="mt-1 text-[11px] text-zinc-400">Adding an EMDN code improves AI classification accuracy for your device.</p>
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

      <div>
        <label className="block text-sm font-medium text-zinc-700 mb-1.5">
          Search strategy documents
          <InfoTooltip text="Upload your search strategy or PMS plan documents for reference. These files are stored with your profile for traceability but are not read by the AI during classification." />
        </label>
        <input ref={strategyInputRef} type="file" multiple accept=".pdf,.docx,.xlsx,.txt" className="hidden"
          onChange={(e) => e.target.files && handleStrategyUpload(e.target.files)} />
        <button type="button" onClick={() => strategyInputRef.current?.click()}
          disabled={strategyFiles.length >= 5}
          className="w-full rounded border border-dashed border-zinc-300 px-4 py-3 text-sm text-zinc-500 hover:border-zinc-400 hover:text-zinc-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
          <Upload className="w-4 h-4" />
          Upload strategy document ({strategyFiles.length}/5)
        </button>
        {strategyFiles.length > 0 && (
          <ul className="mt-2 space-y-1">
            {strategyFiles.map(f => (
              <li key={f.key} className="flex items-center gap-2 text-sm">
                {f.status === 'uploading' && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500 shrink-0" />}
                {f.status === 'done' && <CheckCircle className="w-3.5 h-3.5 text-green-600 shrink-0" />}
                {f.status === 'error' && <X className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                <span className="flex-1 truncate text-zinc-600">{f.name}</span>
                {f.status !== 'uploading' && (
                  <button type="button" onClick={() => setStrategyFiles(prev => prev.filter(u => u.key !== f.key))}
                    className="text-zinc-400 hover:text-red-500 transition-colors" aria-label="Remove file">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-[11px] text-zinc-400">
          If your uploaded strategy document already contains competitor information, you don&apos;t need to re-enter it in the competitor list above.
        </p>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</p>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button type="submit" disabled={saving}
          className="rounded-lg bg-[#0D9488] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0F766E] disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2">
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
