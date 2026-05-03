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

  const { data: profile } = await db
    .from('product_profiles')
    .select('id, user_id, device_name, manufacturer, emdn_code, device_class, intended_use')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

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
        <EditProfileForm profile={profile} />
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
                    <span className="text-zinc-400 shrink-0">{fmtDateTime(entry.edited_at)}</span>
                  </div>
                  {fields.map((field) => (
                    <div key={field} className="text-zinc-500 leading-relaxed">
                      <span className="font-mono">{field}</span>
                      {': '}
                      <span className="line-through text-red-600/70">{String(entry.previous_values[field] ?? '—')}</span>
                      {' → '}
                      <span className="text-green-700">{String(entry.changed_fields[field] ?? '—')}</span>
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
