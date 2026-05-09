import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { DeleteProfileButton } from './profile-actions'

export const metadata = { title: 'Profiles — Neuridion' }

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'today'
  if (diffDays === 1) return 'yesterday'
  if (diffDays < 30) return `${diffDays} days ago`
  const diffMonths = Math.floor(diffDays / 30)
  return diffMonths === 1 ? '1 month ago' : `${diffMonths} months ago`
}

export default async function ProfilesPage() {
  const supabase = await createClient()
  const { data: profiles, error } = await supabase
    .from('product_profiles')
    .select('id, device_name, manufacturer, emdn_code, device_class, created_at, last_modified_at, last_modified_by')
    .order('created_at', { ascending: false })

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Product profiles</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Each profile represents one medical device you monitor.
          </p>
        </div>
        <Link
          href="/dashboard/profiles/new"
          className="rounded bg-[#0D9488] px-4 py-2 text-sm font-medium text-white hover:bg-[#0F766E] transition-colors"
        >
          New profile
        </Link>
      </div>

      {error && (
        <p className="text-sm text-[#DC2626] bg-[rgba(220,38,38,0.06)] border border-[rgba(220,38,38,0.2)] rounded px-4 py-3">
          Unable to load profiles. Please try again later.
        </p>
      )}

      {!error && profiles?.length === 0 && (
        <div className="rounded-md border border-dashed border-[#E2E8F0] bg-white px-8 py-16 text-center">
          <p className="text-sm font-medium text-zinc-900">No profiles yet</p>
          <p className="mt-1 text-sm text-zinc-500">
            Create your first product profile to start your first PMS search.
          </p>
          <Link
            href="/dashboard/profiles/new"
            className="mt-4 inline-block rounded bg-[#0D9488] px-4 py-2 text-sm font-medium text-white hover:bg-[#0F766E] transition-colors"
          >
            New profile
          </Link>
        </div>
      )}

      {profiles && profiles.length > 0 && (
        <div className="rounded-md border border-[#E2E8F0] bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50">
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Device name</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Manufacturer</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">EMDN code</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Class</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Created</th>
                <th className="px-4 py-3 text-right font-medium text-zinc-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p, i) => {
                const wasEdited = (p as { last_modified_by?: string | null }).last_modified_by != null
                return (
                  <tr
                    key={p.id}
                    className={`${i < profiles.length - 1 ? 'border-b border-zinc-100' : ''} hover:bg-zinc-50 transition-colors`}
                  >
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/profiles/${p.id}/edit`}
                        className="font-medium text-zinc-900 hover:text-[#0D9488] transition-colors">
                        {p.device_name}
                      </Link>
                      {wasEdited && (
                        <p className="text-xs text-zinc-400 mt-0.5">
                          Last edited {timeAgo((p as { last_modified_at?: string }).last_modified_at ?? p.created_at)}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-600">{p.manufacturer}</td>
                    <td className="px-4 py-3 text-zinc-600">{p.emdn_code ?? '—'}</td>
                    <td className="px-4 py-3 text-zinc-600">{p.device_class ?? '—'}</td>
                    <td className="px-4 py-3 text-zinc-400">
                      {new Date(p.created_at).toLocaleDateString('en-GB', {
                        day: '2-digit', month: 'short', year: 'numeric',
                      })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/dashboard/profiles/${p.id}/edit`}
                          className="text-xs font-medium text-zinc-500 hover:text-[#0D9488] transition-colors border border-[#E2E8F0] rounded px-2.5 py-1 hover:border-[#0D9488]"
                        >
                          Edit
                        </Link>
                        <DeleteProfileButton profileId={p.id} profileName={p.device_name} />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
