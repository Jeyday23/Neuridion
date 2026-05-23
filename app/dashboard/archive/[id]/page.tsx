import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { RunResults, type FsnResult } from './run-results'

interface SearchRunData {
  id: string
  status: string
  created_at: string | null
  started_at: string | null
  completed_at: string | null
  search_period_from: string | null
  search_period_to: string | null
  period_from: string | null
  period_to: string | null
  total_results: number | null
  relevant_count: number | null
  uncertain_count: number | null
  excluded_count: number | null
  filter_failed_count: number | null
  dbs_searched: string[] | string | null
  error_message: string | null
  review_status: string | null
  terms_used: {
    manufacturer_terms: string[]
    device_terms: string[]
    raw_manufacturer: string
    raw_device_name: string
    term_algorithm_version: string
  } | null
  profile_snapshot: { device_name: string; manufacturer: string } | null
  report_html_path: string | null
  report_pdf_path: string | null
  report_excel_path: string | null
  report_generated_at: string | null
  product_profiles: { device_name: string; manufacturer: string } | { device_name: string; manufacturer: string }[] | null
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return notFound()

  const admin = createAdminClient()

  const RUN_COLS = `
    id, status, created_at, started_at, completed_at,
    search_period_from, search_period_to, period_from, period_to,
    total_results, relevant_count, uncertain_count, excluded_count, filter_failed_count,
    dbs_searched, error_message, review_status, terms_used, profile_snapshot,
    report_html_path, report_pdf_path, report_excel_path, report_generated_at,
    product_profiles ( device_name, manufacturer )
  `.trim()

  const { data: runData, error: runError } = await admin
    .from('search_runs')
    .select(RUN_COLS)
    .eq('id', id)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single()

  if (runError) console.error('[archive/[id]]', 'query error:', runError.message, runError.code)
  if (!runData) return notFound()

  const run = runData as unknown as SearchRunData

  const snapshot = run.profile_snapshot
  const profileRaw = run.product_profiles
  const liveProfile = Array.isArray(profileRaw) ? profileRaw[0] ?? null : profileRaw
  const profile = snapshot ?? liveProfile

  // Fetch FSN results
  const { data: rawResults } = await admin
    .from('fsn_results')
    .select('id, title, manufacturer, fsn_date, source_url, source_db')
    .eq('run_id', id)
    .order('fsn_date', { ascending: false })

  const decisionsMap: Record<string, FsnResult['filter_decision']> = {}

  const { data: decisions } = await admin
    .from('filter_decisions')
    .select('fsn_result_id, decision, rationale, confidence')
    .eq('search_run_id', id)

  for (const d of decisions ?? []) {
    decisionsMap[d.fsn_result_id] = {
      decision:   d.decision as 'relevant' | 'uncertain' | 'excluded' | 'filter_failed',
      rationale:  d.rationale,
      confidence: d.confidence != null ? Number(d.confidence) : null,
    }
  }

  const results: FsnResult[] = (rawResults ?? []).map((r) => ({
    id:              r.id,
    title:           r.title,
    manufacturer:    r.manufacturer ?? null,
    fsn_date:        r.fsn_date ?? null,
    source_url:      r.source_url,
    source_db:       r.source_db,
    filter_decision: decisionsMap[r.id] ?? null,
  }))

  const period =
    (run.search_period_from ?? run.period_from) && (run.search_period_to ?? run.period_to)
      ? `${run.search_period_from ?? run.period_from} → ${run.search_period_to ?? run.period_to}`
      : '—'

  const dbsFromColumn = Array.isArray(run.dbs_searched)
    ? (run.dbs_searched as string[]).join(', ')
    : (run.dbs_searched as string | null) ?? ''
  const dbs = dbsFromColumn
    || [...new Set(results.map((r) => r.source_db).filter(Boolean))].join(', ')
    || '—'

  const dbsArray = Array.isArray(run.dbs_searched) ? run.dbs_searched : []
  const mhraSearched = dbsArray.some((db) => db.toLowerCase() === 'mhra')
  const showMhraWarning = mhraSearched && run.status === 'complete' &&
    !results.some(r => r.source_db === 'mhra')

  const rel  = run.relevant_count      ?? 0
  const unc  = run.uncertain_count     ?? 0
  const exc  = run.excluded_count      ?? 0
  const fail = run.filter_failed_count ?? 0
  const tot  = run.total_results       ?? results.length

  const termsUsed = run.terms_used

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Back */}
      <Link
        href="/dashboard/archive"
        className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-800 mb-6"
      >
        &larr; Back to Archive
      </Link>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-900">
          Search from {fmtDate(run.created_at)}
          {profile && (
            <span className="font-normal text-zinc-500"> · {profile.device_name}</span>
          )}
        </h1>
        {profile && (
          <p className="mt-0.5 text-sm text-zinc-400">{profile.manufacturer}</p>
        )}
      </div>

      {/* Meta card */}
      <div className="rounded-md border border-[#E2E8F0] bg-white p-5 mb-6 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
        <div>
          <p className="text-xs text-zinc-400 uppercase tracking-wide mb-0.5">Period</p>
          <p className="text-zinc-800">{period}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-400 uppercase tracking-wide mb-0.5">Databases</p>
          <p className="text-zinc-800 uppercase text-xs">{dbs}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-400 uppercase tracking-wide mb-0.5">Status</p>
          <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${
            run.status === 'complete'   ? 'bg-[rgba(5,150,105,0.08)] text-[#059669] border-[rgba(5,150,105,0.2)]' :
            (run.status === 'running' || run.status === 'filtering') ? 'bg-blue-50 text-blue-700 border-blue-200' :
            run.status === 'error'     ? 'bg-[rgba(220,38,38,0.06)] text-[#DC2626] border-[rgba(220,38,38,0.2)]' :
                                         'bg-[#F8FAFC] text-[#0F766E] border-[#E2E8F0]'
          }`}>
            {run.status}
          </span>
        </div>
        <div>
          <p className="text-xs text-zinc-400 uppercase tracking-wide mb-0.5">Report</p>
          {run.report_generated_at ? (
            <p className="text-green-700 text-xs">✓ {fmtDate(run.report_generated_at)}</p>
          ) : (
            <p className="text-zinc-300 text-xs">Not generated</p>
          )}
        </div>
        {termsUsed && (termsUsed.manufacturer_terms.length > 0 || termsUsed.device_terms.length > 0) && (
          <div className="col-span-2 sm:col-span-4">
            <p className="text-xs text-zinc-400 uppercase tracking-wide mb-0.5">Search Terms</p>
            <div className="flex flex-wrap gap-1.5">
              {termsUsed.manufacturer_terms.map((t: string) => (
                <code key={`m-${t}`} className="bg-green-50 text-green-700 border border-green-200 px-1.5 py-0.5 rounded text-xs">{t}</code>
              ))}
              {termsUsed.device_terms.map((t: string) => (
                <code key={`d-${t}`} className="bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded text-xs">{t}</code>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Summary counts */}
      <div className="rounded-md border border-[#E2E8F0] bg-white p-5 mb-6">
        <div className="flex gap-6 flex-wrap text-sm">
          <div className="text-center">
            <p className="text-2xl font-semibold text-zinc-900">{tot}</p>
            <p className="text-xs text-zinc-400 mt-0.5">Total reviewed</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-semibold text-green-700">{rel}</p>
            <p className="text-xs text-zinc-400 mt-0.5">Relevant</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-semibold text-amber-600">{unc}</p>
            <p className="text-xs text-zinc-400 mt-0.5">Uncertain</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-semibold text-zinc-400">{exc}</p>
            <p className="text-xs text-zinc-400 mt-0.5">Excluded</p>
          </div>
          {fail > 0 && (
            <div className="text-center">
              <p className="text-2xl font-semibold text-red-600">{fail}</p>
              <p className="text-xs text-zinc-400 mt-0.5">Not Reviewed</p>
            </div>
          )}
        </div>
      </div>

      {showMhraWarning && (
        <div className="mb-4 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>MHRA data unavailable</strong> — the MHRA (UK) source returned no results for this search. The source may be temporarily offline. Results from other databases are unaffected.
        </div>
      )}

      {run.status === 'error' && (
        <div className="mb-6 rounded border border-[rgba(220,38,38,0.2)] bg-[rgba(220,38,38,0.06)] px-4 py-3 text-sm text-[#DC2626]">
          <strong>Error:</strong> This search encountered an error. Please try again or contact support.
        </div>
      )}

      {/* Results list */}
      {results.length > 0 ? (
        <RunResults results={results} runId={run.id} runStatus={run.status} reviewStatus={run.review_status ?? 'draft'} />
      ) : (
        <p className="text-sm text-zinc-400 py-8 text-center">
          {run.status === 'complete' ? 'No FSN results were found for this search.' : 'Results will appear here once the search completes.'}
        </p>
      )}
    </div>
  )
}
