import { redirect } from 'next/navigation'
import Link from 'next/link'
import { checkIsAdmin } from '@/lib/admin-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { GenerateBatch } from './generate-batch'

interface TrialCode {
  code:        string
  batch_name:  string | null
  redeemed_at: string | null
  created_at:  string
  expires_at:  string | null
}

interface BatchSummary {
  name:       string
  total:      number
  redeemed:   number
  created_at: string
  expires_at: string | null
}

function groupBatches(codes: TrialCode[]): BatchSummary[] {
  const map = new Map<string, BatchSummary>()
  for (const c of codes) {
    const name = c.batch_name ?? 'Unnamed'
    const existing = map.get(name)
    if (existing) {
      existing.total++
      if (c.redeemed_at) existing.redeemed++
    } else {
      map.set(name, {
        name,
        total:      1,
        redeemed:   c.redeemed_at ? 1 : 0,
        created_at: c.created_at,
        expires_at: c.expires_at,
      })
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
}

export const metadata = { title: 'Trial QR Codes — Admin' }

export default async function QrCodesPage() {
  const adminUser = await checkIsAdmin()
  if (!adminUser) redirect('/dashboard/search')

  const admin = createAdminClient()
  const { data: codes } = await admin
    .from('trial_codes')
    .select('code, batch_name, redeemed_at, created_at, expires_at')
    .order('created_at', { ascending: false })

  const batches = groupBatches((codes ?? []) as TrialCode[])

  const totalIssued   = codes?.length ?? 0
  const totalRedeemed = codes?.filter((c) => c.redeemed_at).length ?? 0

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-zinc-900">Trial QR Codes</h1>
        <div className="flex gap-4 text-sm text-zinc-500">
          <span><strong className="text-zinc-900">{totalIssued}</strong> issued</span>
          <span><strong className="text-zinc-900">{totalRedeemed}</strong> redeemed</span>
          <span><strong className="text-zinc-900">{totalIssued - totalRedeemed}</strong> available</span>
        </div>
      </div>

      <div className="mb-8">
        <GenerateBatch />
      </div>

      {batches.length === 0 ? (
        <p className="text-sm text-zinc-400">No batches yet. Generate one above.</p>
      ) : (
        <div className="rounded-md border border-[#E2E8F0] bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 border-b border-zinc-200">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-zinc-600">Batch</th>
                <th className="text-left px-5 py-3 font-medium text-zinc-600">Created</th>
                <th className="text-right px-5 py-3 font-medium text-zinc-600">Total</th>
                <th className="text-right px-5 py-3 font-medium text-zinc-600">Redeemed</th>
                <th className="text-right px-5 py-3 font-medium text-zinc-600">Available</th>
                <th className="px-5 py-3 font-medium text-zinc-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {batches.map((b) => (
                <tr key={b.name} className="hover:bg-zinc-50">
                  <td className="px-5 py-3 font-medium text-zinc-900">{b.name}</td>
                  <td className="px-5 py-3 text-zinc-500">
                    {new Date(b.created_at).toLocaleDateString('en-GB')}
                    {b.expires_at && (
                      <span className="ml-2 text-xs text-amber-600">
                        exp {new Date(b.expires_at).toLocaleDateString('en-GB')}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right text-zinc-900">{b.total}</td>
                  <td className="px-5 py-3 text-right text-zinc-900">{b.redeemed}</td>
                  <td className="px-5 py-3 text-right">
                    <span className={b.total - b.redeemed === 0 ? 'text-zinc-400' : 'text-green-700 font-medium'}>
                      {b.total - b.redeemed}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <Link
                      href={`/api/admin/trial-codes/${encodeURIComponent(b.name)}/pdf`}
                      target="_blank"
                      className="text-blue-600 hover:underline text-xs font-medium"
                    >
                      Print PDF
                    </Link>
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
