'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { DownloadButton, GenerateReportButton, CancelRunButton, DeleteRunButton } from './archive-actions'

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
  total_scraped: number | null
  pre_filter_count: number | null
  error_message: string | null
  report_html_path: string | null
  report_pdf_path: string | null
  report_excel_path: string | null
  review_status: string | null
  report_docx_path: string | null
  report_generated_at: string | null
  product_profiles:
    | { device_name: string; manufacturer: string }
    | { device_name: string; manufacturer: string }[]
    | null
}

const STATUS_STYLES: Record<string, string> = {
  complete:   'bg-green-50 text-green-700 border-green-200',
  running:    'bg-blue-50 text-blue-700 border-blue-200',
  filtering:  'bg-blue-50 text-blue-700 border-blue-200',
  queued:     'bg-zinc-100 text-zinc-600 border-zinc-200',
  pending:    'bg-zinc-100 text-zinc-600 border-zinc-200',
  error:      'bg-red-50 text-red-700 border-red-200',
  degraded:   'bg-amber-50 text-amber-700 border-amber-200',
  cancelled:  'bg-zinc-100 text-zinc-600 border-zinc-200',
}

const STATUS_LABELS: Record<string, string> = {
  complete:   'Complete',
  running:    'Running',
  filtering:  'Running',
  pending:    'Queued',
  queued:     'Queued',
  error:      'Failed',
  degraded:   'Partial results',
  cancelled:  'Cancelled',
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
  return `${fmtDate(from)} – ${fmtDate(to)}`
}

const DB_LABELS: Record<string, string> = {
  bfarm:      'BfArM',
  maude:      'FDA MAUDE',
  fda:        'FDA MAUDE',
  mhra:       'MHRA',
  swissmedic: 'Swissmedic',
}

function getDbsLabel(dbs: unknown): string {
  if (!dbs) return '—'
  const arr = Array.isArray(dbs) ? dbs : typeof dbs === 'string' ? [dbs] : []
  if (arr.length === 0) return '—'
  return arr.map((d) => DB_LABELS[String(d).toLowerCase()] ?? String(d)).join(', ')
}

export function ArchiveTable({ runs }: { runs: RunRow[] }) {
  const [rows, setRows]                   = useState(runs)
  const [profileFilter, setProfileFilter] = useState('all')
  const [statusFilter, setStatusFilter]   = useState('all')
  const [toast, setToast]                 = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type })
    window.setTimeout(() => setToast(null), 3500)
  }

  const profileNames = [...new Set(
    rows.map((r) => getProfile(r)?.device_name).filter(Boolean) as string[]
  )]

  const filtered = rows.filter((r) => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false
    if (profileFilter !== 'all') {
      const p = getProfile(r)
      if (!p || p.device_name !== profileFilter) return false
    }
    return true
  })

  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-[#E2E8F0] bg-white px-8 py-16 text-center">
        <p className="text-sm font-medium text-zinc-900">No searches yet</p>
        <p className="mt-1 text-sm text-zinc-500">
          Start your first search from the{' '}
          <a href="/dashboard/search" className="text-[#0D9488] hover:underline">Search</a>
          {' '}page to see results here.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        {toast && (
          <div
            className={`w-full rounded border px-3 py-2 text-sm ${
              toast.type === 'success'
                ? 'border-[rgba(5,150,105,0.2)] bg-[rgba(5,150,105,0.08)] text-[#059669]'
                : 'border-[rgba(220,38,38,0.2)] bg-[rgba(220,38,38,0.06)] text-[#DC2626]'
            }`}
            role="status"
          >
            {toast.message}
          </div>
        )}
        <select
          value={profileFilter}
          onChange={(e) => setProfileFilter(e.target.value)}
          className="text-sm border border-[#E2E8F0] rounded px-3 py-1.5 bg-white text-[#134E4A] focus:outline-none focus:ring-2 focus:ring-[#0D9488] focus:border-transparent"
        >
          <option value="all">All profiles</option>
          {profileNames.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="text-sm border border-[#E2E8F0] rounded px-3 py-1.5 bg-white text-[#134E4A] focus:outline-none focus:ring-2 focus:ring-[#0D9488] focus:border-transparent"
        >
          <option value="all">All statuses</option>
          <option value="complete">Completed</option>
          <option value="degraded">Partial results</option>
          <option value="running">Running</option>
          <option value="error">Failed</option>
          <option value="cancelled">Cancelled</option>
        </select>

        {filtered.length !== rows.length && (
          <span className="text-xs text-zinc-400 self-center">
            {filtered.length} of {rows.length} runs
          </span>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-zinc-400 py-6 text-center">No runs match the current filters.</p>
      ) : (
        <div className="rounded-md border border-[#E2E8F0] bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50">
                <th className="px-4 py-3 text-left font-medium text-zinc-600 whitespace-nowrap">Date</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Profile</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600 whitespace-nowrap">Period</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">DBs</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Status</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Results</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Review</th>
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
                const hasDocx    = !!run.report_docx_path

                const rel  = run.relevant_count  ?? 0
                const unc  = run.uncertain_count  ?? 0
                const exc  = run.excluded_count   ?? 0
                const sum  = rel + unc + exc
                const tot  = sum > 0 ? sum : (run.total_results || null)

                return (
                  <motion.tr
                    key={run.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: Math.min(i * 0.04, 0.4), ease: 'easeOut' }}
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
                      >
                        {STATUS_LABELS[run.status] ?? run.status}
                      </span>
                      {run.status === 'error' && (
                        <p className="mt-1 text-xs text-red-500 max-w-[180px] truncate">
                          Search failed. Try again or contact support.
                        </p>
                      )}
                    </td>

                    {/* Results */}
                    <td className="px-4 py-3 text-xs text-zinc-600">
                      {(run.status === 'complete' || run.status === 'degraded') && tot != null ? (
                        <div className="space-y-0.5">
                          <span>
                            {tot}{' '}
                            <span className="text-zinc-400">
                              ({rel} rel · {unc} unc · {exc} exc)
                            </span>
                          </span>
                          {run.total_scraped != null && (
                            <p className="text-[10px] text-zinc-400">
                              {run.total_scraped} scraped
                              {run.pre_filter_count != null && ` → ${run.pre_filter_count} filtered`}
                              {` → ${tot} assessed`}
                            </p>
                          )}
                        </div>
                      ) : '—'}
                    </td>

                    {/* Review */}
                    <td className="px-4 py-3 text-xs">
                      {(run.status === 'complete' || run.status === 'degraded') ? (
                        run.review_status === 'approved' ? (
                          <span className="inline-flex items-center rounded border bg-green-50 text-green-700 border-green-200 px-2 py-0.5 font-medium">Approved</span>
                        ) : run.review_status === 'reviewed' ? (
                          <span className="inline-flex items-center rounded border bg-blue-50 text-blue-700 border-blue-200 px-2 py-0.5 font-medium">Reviewed</span>
                        ) : (
                          <a
                            href={`/dashboard/archive/${run.id}`}
                            className="inline-flex items-center rounded border bg-amber-50 text-amber-700 border-amber-200 px-2 py-0.5 font-medium hover:bg-amber-100 transition-colors"
                          >
                            Review needed
                          </a>
                        )
                      ) : (
                        <span className="text-zinc-300">—</span>
                      )}
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
                        {hasDocx && (
                          <DownloadButton runId={run.id} format="docx" label="↓ Word" />
                        )}
                        {!hasReport && (run.status === 'complete' || run.status === 'degraded') && run.review_status && run.review_status !== 'draft' && (
                          <GenerateReportButton runId={run.id} />
                        )}
                        {['running', 'filtering', 'queued'].includes(run.status) && (
                          <CancelRunButton
                            runId={run.id}
                            onCancelled={(runId) => setRows((current) => current.map((row) => (
                              row.id === runId
                                ? { ...row, status: 'cancelled', completed_at: new Date().toISOString() }
                                : row
                            )))}
                            onToast={showToast}
                          />
                        )}
                        <DeleteRunButton
                          runId={run.id}
                          onDeleted={(runId) => setRows((current) => current.filter((row) => row.id !== runId))}
                          onToast={showToast}
                        />
                      </div>
                    </td>
                  </motion.tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
