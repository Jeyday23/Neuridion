import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { EditProfileForm } from './edit-form'

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

/**
 * Formats a changed_fields / previous_values value for display.
 * Handles arrays of competitor-term objects that would otherwise
 * render as "[object Object]".
 */
function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (Array.isArray(value)) {
    if (value.length === 0) return '—'
    // Each element may be a competitor term object {name/device_name, manufacturer}
    return value
      .map((item) => {
        if (typeof item === 'object' && item !== null) {
          const obj = item as Record<string, unknown>
          const name = (obj.name ?? obj.device_name ?? '') as string
          const mfr = (obj.manufacturer ?? '') as string
          return mfr ? `${name} (${mfr})` : String(name)
        }
        return String(item)
      })
      .join(', ')
  }
  if (typeof value === 'object') {
    // Single object that isn't an array — show as JSON as a safe fallback
    try { return JSON.stringify(value) } catch { return String(value) }
  }
  return String(value)
}

export default async function EditProfilePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return notFound()

  const db = createAdminClient()

  const { data: profile, error: profileError } = await db
    .from('product_profiles')
    .select('id, user_id, device_name, manufacturer, emdn_code, device_class, intended_use, search_strategy')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (profileError) console.error('[profiles/edit]', 'query error:', profileError.message, profileError.code)
  if (!profile) return notFound()

  // Load edit history (gracefully ignore if table doesn't exist yet)
  let history: {
    id: string
    edited_by: string | null
    edited_at: string
    changed_fields: Record<string, unknown>
    previous_values: Record<string, unknown>
  }[] = []

  try {
    const { data } = await db
      .from('profile_edit_history')
      .select('id, edited_by, edited_at, changed_fields, previous_values')
      .eq('profile_id', id)
      .order('edited_at', { ascending: false })
      .limit(20)
    history = (data ?? []) as typeof history
  } catch {
    // Table may not exist if migration 017 hasn't run yet
  }

  // Resolve edited_by UUIDs to user names
  let editorMap: Record<string, string> = {}
  if (history.length > 0) {
    const uniqueEditorIds = [...new Set(
      history.map((h) => h.edited_by).filter((id): id is string => !!id)
    )]
    if (uniqueEditorIds.length > 0) {
      const { data: editors } = await db
        .from('users')
        .select('id, full_name, email')
        .in('id', uniqueEditorIds)
      if (editors) {
        editorMap = Object.fromEntries(
          editors.map((u) => [u.id, u.full_name || u.email || 'Unknown user'])
        )
      }
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <Link href="/dashboard/profiles"
          className="text-sm text-zinc-500 hover:text-zinc-700 transition-colors">
          ← Profiles
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-zinc-900">Edit product profile</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Changes are saved immediately and logged in the audit trail below.
        </p>
      </div>

      <div className="rounded-md border border-[#E2E8F0] bg-white px-8 py-8 mb-8">
        <EditProfileForm profile={{
          ...profile,
          search_strategy: profile.search_strategy as { competitor_terms?: { name?: string; device_name?: string; manufacturer?: string }[] } | null,
        }} />
      </div>

      {history.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-zinc-700 mb-3">Edit history</h2>
          <div className="rounded-md border border-[#E2E8F0] bg-white overflow-hidden">
            {history.map((entry, i) => {
              const fields = Object.keys(entry.changed_fields)
              return (
                <div key={entry.id}
                  className={`px-4 py-3 text-xs ${i < history.length - 1 ? 'border-b border-zinc-100' : ''}`}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-medium text-zinc-700">
                      {fields.length === 1
                        ? `Changed ${fields[0]}`
                        : `Changed ${fields.slice(0, -1).join(', ')} and ${fields[fields.length - 1]}`}
                    </span>
                    <span className="text-zinc-400 shrink-0">
                      {entry.edited_by && editorMap[entry.edited_by]
                        ? `by ${editorMap[entry.edited_by]} · `
                        : ''}
                      {fmtDateTime(entry.edited_at)}
                    </span>
                  </div>
                  {fields.map((field) => (
                    <div key={field} className="text-zinc-500 leading-relaxed">
                      <span className="font-mono">{field}</span>
                      {': '}
                      <span className="line-through text-red-600/70">{formatFieldValue(entry.previous_values[field])}</span>
                      {' → '}
                      <span className="text-green-700">{formatFieldValue(entry.changed_fields[field])}</span>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
