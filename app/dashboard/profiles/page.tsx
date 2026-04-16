import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export const metadata = { title: 'Profiles — Kodex' }

export default async function ProfilesPage() {
  const supabase = await createClient()
  const { data: profiles, error } = await supabase
    .from('product_profiles')
    .select('id, device_name, manufacturer, emdn_code, device_class, created_at')
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
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
        >
          New profile
        </Link>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          {error.message}
        </p>
      )}

      {!error && profiles?.length === 0 && (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-8 py-16 text-center">
          <p className="text-sm font-medium text-zinc-900">No profiles yet</p>
          <p className="mt-1 text-sm text-zinc-500">
            Create your first product profile to start running recall searches.
          </p>
          <Link
            href="/dashboard/profiles/new"
            className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            New profile
          </Link>
        </div>
      )}

      {profiles && profiles.length > 0 && (
        <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50">
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Device name</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Manufacturer</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">EMDN code</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Class</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Created</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p, i) => (
                <tr
                  key={p.id}
                  className={i < profiles.length - 1 ? 'border-b border-zinc-100' : ''}
                >
                  <td className="px-4 py-3 font-medium text-zinc-900">{p.device_name}</td>
                  <td className="px-4 py-3 text-zinc-600">{p.manufacturer}</td>
                  <td className="px-4 py-3 text-zinc-600">{p.emdn_code ?? '—'}</td>
                  <td className="px-4 py-3 text-zinc-600">{p.device_class ?? '—'}</td>
                  <td className="px-4 py-3 text-zinc-400">
                    {new Date(p.created_at).toLocaleDateString('en-GB', {
                      day: '2-digit', month: 'short', year: 'numeric',
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
