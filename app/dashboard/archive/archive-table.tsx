'use client'

import { useState } from 'react'
import { DownloadButton, GenerateReportButton } from './archive-actions'

interface RunRow {
  id: string
  status: string
  started_at: string | null
  completed_at: string | null
  created_at: string
  search_period_from: string | null
  search_period_to: string | null
  period_from: string | null
  period_to: string | null
  total_results: number | null
  relevant_count: number | null
  uncertain_count: number | null
  excluded_count: number | null
  dbs_searched: unknown
  error_message: string | null
  report_html_path: string | null
  report_pdf_path: string | null
  report_excel_path: string | null
  report_generated_at: string | null
  product_profiles:
    | { device_name: string; manufacturer: string }
    | { device_name: string; manufacturer: string }[]
    | null
}

const STATUS_STYLES: Record<string, string> = {
  completed: 'bg-green-50 text-green-700 border-green-200',
  running:   'bg-blue-50 text-blue-700 border-blue-200',
  failed:    'bg-red-50 text-red-700 border-red-200',
  pending:   'bg-zinc-100 text-zinc-600 border-zinc-200',
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

function getProfile(run: RunRow): { device_name: string; manufacturer: string } | null {
  if (!run.product_profiles) return null
  return Array.isArray(run.product_profiles)
    ? (run.product_profiles[0] ?? null)
    : run.product_profiles
}

function getPeriod(run: RunRow): string {
  const from = run.search_period_from ?? run.period_from
  const to   = run.search_period_to   ?? run.period_to
  if (!from && !to) return '—'
  return `${from ?? '?'} → ${to ?? '?'}`
}

function getDbsLabel(dbs: unknown): string {
  if (!dbs) return '—'
  if (Array.isArray(dbs)) return dbs.join(', ')
  if (typeof dbs === 'string') return dbs
  return '—'
}

export function ArchiveTable({ runs }: { runs: RunRow[] }) {
  const [profileFilter, setProfileFilter] = useState('all')
  const [statusFilter, setStatusFilter]   = useState('all')

  const profileNames = [...new Set(
    runs.map((r) => getProfile(r)?.device_name).filter(Boolean) as string[]
  )]

  const filtered = runs.filter((r) => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false
    if (profileFilter !== 'all') {
      const p = getProfile(r)
      if (!p || p.device_name !== profileFilter) return false
    }
    return true
  })

  if (runs.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-8 py-16 text-center">
        <p className="text-sm font-medium text-zinc-900">No searches yet</p>
        <p className="mt-1 text-sm text-zinc-500">
          Start your first search from the{' '}
          <a href="/dashboard/search" className="text-blue-600 hover:underline">Search</a>
          {' '}page to see results here.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <select
          value={profileFilter}
          onChange={(e) => setProfileFilter(e.target.value)}
          className="text-sm border border-zinc-200 rounded-lg px-3 py-1.5 bg-white text-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All profiles</option>
          {profileNames.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="text-sm border border-zinc-200 rounded-lg px-3 py-1.5 bg-white text-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All statuses</option>
          <option value="completed">Completed</option>
          <option value="running">Running</option>
          <option value="failed">Failed</option>
        </select>

        {filtered.length !== runs.length && (
          <span className="text-xs text-zinc-400 self-center">
            {filtered.length} of {runs.length} runs
          </span>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-zinc-400 py-6 text-center">No runs match the current filters.</p>
      ) : (
        <div className="rounded-xl border border-zinc-200 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50">
                <th className="px-4 py-3 text-left font-medium text-zinc-600 whitespace-nowrap">Date</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Profile</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600 whitespace-nowrap">Period</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">DBs</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Status</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Results</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Report</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((run, i) => {
                const profile    = getProfile(run)
                const statusStyle = STATUS_STYLES[run.status] ?? STATUS_STYLES.pending
                const hasReport  = !!run.report_generated_at
                const hasPdf     = !!run.report_pdf_path
                const hasHtml    = !!run.report_html_path
                const hasExcel   = !!run.report_excel_path

                const rel  = run.relevant_count  ?? 0
                const unc  = run.uncertain_count  ?? 0
                const exc  = run.excluded_count   ?? 0
                const tot  = run.total_results    ?? ((rel + unc + exc) || null)

                return (
                  <tr
                    key={run.id}
                    className={i < filtered.length - 1 ? 'border-b border-zinc-100' : ''}
                  >
                    {/* Date */}
                    <td className="px-4 py-3 text-zinc-400 whitespace-nowrap text-xs">
                      {fmtDate(run.created_at)}
                    </td>

                    {/* Profile */}
                    <td className="px-4 py-3">
                      {profile ? (
                        <div>
                          <span className="font-medium text-zinc-900">{profile.device_name}</span>
                          <span className="block text-xs text-zinc-400">{profile.manufacturer}</span>
                        </div>
                      ) : (
                        <span className="text-zinc-300 italic text-xs">Deleted profile</span>
                      )}
                    </td>

                    {/* Period */}
                    <td className="px-4 py-3 text-zinc-600 whitespace-nowrap text-xs">
                      {getPeriod(run)}
                    </td>

                    {/* DBs */}
                    <td className="px-4 py-3 text-zinc-500 text-xs whitespace-nowrap">
                      {getDbsLabel(run.dbs_searched)}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusStyle}`}
                        title={run.error_message ?? undefined}
                      >
                        {run.status}
                      </span>
                      {run.status === 'failed' && run.error_message && (
                        <p className="mt-1 text-xs text-red-500 max-w-[180px] truncate" title={run.error_message}>
                          {run.error_message}
                        </p>
                      )}
                    </td>

                    {/* Results */}
                    <td className="px-4 py-3 text-xs text-zinc-600">
                      {run.status === 'completed' && tot != null ? (
                        <span>
                          {tot}{' '}
                          <span className="text-zinc-400">
                            ({rel} rel · {unc} unc · {exc} exc)
                          </span>
                        </span>
                      ) : '—'}
                    </td>

                    {/* Report */}
                    <td className="px-4 py-3 text-xs">
                      {hasReport ? (
                        <span className="text-green-700">
                          ✓ {fmtDate(run.report_generated_at)}
                        </span>
                      ) : (
                        <span className="text-zinc-300">—</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <a
                          href={`/dashboard/archive/${run.id}`}
                          className="text-xs text-zinc-500 hover:underline whitespace-nowrap"
                        >
                          View Results
                        </a>
                        {hasPdf && (
                          <DownloadButton runId={run.id} format="pdf" label="↓ PDF" />
                        )}
                        {!hasPdf && hasHtml && (
                          <DownloadButton runId={run.id} format="html" label="↓ HTML" />
                        )}
                        {hasExcel && (
                          <DownloadButton runId={run.id} format="excel" label="↓ Excel" />
                        )}
                        {!hasReport && run.status === 'completed' && (
                          <GenerateReportButton runId={run.id} />
                        )}
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
