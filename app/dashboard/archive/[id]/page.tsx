import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { RunResults, type FsnResult } from './run-results'
import type { SourceResultBreakdown } from '@/app/dashboard/search-context'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import { capabilitiesFor, resolveRunViewerAccess } from '@/lib/review/run-access'
import { describeActiveAssignments, userDisplayNames, type PublicAssignment } from '@/lib/review/assignments'
import { ReviewersPanel } from './reviewers-panel'

interface SearchRunData {
  id: string
  user_id: string
  status: string
  created_at: string | null
  started_at: string | null
  completed_at: string | null
  search_period_from: string | null
  search_period_to: string | null
  period_from: string | null
  period_to: string | null
  total_results: number | null
  dbs_searched: string[] | string | null
  error_message: string | null
  review_status: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  approved_by: string | null
  approved_at: string | null
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
  timing: {
    source_breakdown?: unknown
  } | null
  product_profiles: { device_name: string; manufacturer: string } | { device_name: string; manufacturer: string }[] | null
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
    id, user_id, status, created_at, started_at, completed_at,
    search_period_from, search_period_to, period_from, period_to,
    total_results,
    dbs_searched, error_message, review_status,
    reviewed_by, reviewed_at, approved_by, approved_at,
    terms_used, profile_snapshot,
    report_html_path, report_pdf_path, report_excel_path, report_generated_at, timing,
    product_profiles ( device_name, manufacturer )
  `.trim()

  const { data: runData, error: runError } = await admin
    .from('search_runs')
    .select(RUN_COLS)
    .eq('id', id)
    .eq('is_synthetic_canary', false)
    .is('deleted_at', null)
    .maybeSingle()

  if (runError) console.error('[archive/[id]]', 'query error:', runError.message, runError.code)
  if (!runData) return notFound()

  const run = runData as unknown as SearchRunData

  // Owner sees everything. An active assigned reviewer sees results and the
  // adjudication UI only. Anyone else gets notFound so existence is not leaked.
  const access = await resolveRunViewerAccess(admin, run, user.id)
  if (access.error) throw new Error('Review access could not be verified.')
  if (access.data.mode === 'none') return notFound()
  const viewer = access.data
  const can = capabilitiesFor(viewer)

  const [attributionUsers, reviewerAssignments] = await Promise.all([
    userDisplayNames(admin, [run.reviewed_by, run.approved_by]),
    can.manageReviewers
      ? describeActiveAssignments(admin, run.id)
      : Promise.resolve({ data: [] as PublicAssignment[], error: null }),
  ])
  if (attributionUsers.error) console.error('[archive/[id]]', 'attribution lookup failed:', attributionUsers.error.message)
  if (reviewerAssignments.error) console.error('[archive/[id]]', 'assignment lookup failed:', reviewerAssignments.error.message)
  const nameFor = (userId: string | null) => {
    if (!userId) return null
    if (userId === user.id) return 'you'
    return attributionUsers.data.get(userId)?.name ?? 'an account that is no longer available'
  }
  const attribution = {
    reviewedByName: nameFor(run.reviewed_by),
    reviewedAt: run.reviewed_at,
    approvedByName: nameFor(run.approved_by),
    approvedAt: run.approved_at,
  }

  const snapshot = run.profile_snapshot
  const profileRaw = run.product_profiles
  const liveProfile = Array.isArray(profileRaw) ? profileRaw[0] ?? null : profileRaw
  const profile = snapshot ?? liveProfile

  // Fetch FSN results
  const { data: rawResults, error: resultsError } = await fetchAllRows((from, to) => admin
    .from('fsn_results')
    .select('id, title, manufacturer, product_name, raw_content, fsn_date, source_url, source_db')
    .eq('run_id', id)
    .order('fsn_date', { ascending: false })
    .order('id', { ascending: true })
    .range(from, to))
  // A partial list would look complete to the reviewer. Fail to the error page.
  if (resultsError) throw new Error('Search results could not be loaded completely.')

  const results: FsnResult[] = (rawResults ?? []).map((r) => ({
    id:              r.id,
    title:           r.title,
    manufacturer:    r.manufacturer ?? null,
    product_name:    r.product_name ?? null,
    raw_content:     r.raw_content ?? null,
    fsn_date:        r.fsn_date ?? null,
    source_url:      r.source_url,
    source_db:       r.source_db,
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
  const showMhraNoMatches = mhraSearched && run.status === 'complete' &&
    !results.some(r => r.source_db === 'mhra')

  const tot  = run.total_results       ?? results.length

  const termsUsed = run.terms_used
  const sourceBreakdown = Array.isArray(run.timing?.source_breakdown)
    ? run.timing.source_breakdown as SourceResultBreakdown[]
    : null

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Back */}
      <Link
        href={viewer.mode === 'owner' ? '/dashboard/archive' : '/dashboard/review'}
        className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-800 mb-6"
      >
        &larr; {viewer.mode === 'owner' ? 'Back to Archive' : 'Back to Review inbox'}
      </Link>

      {viewer.mode === 'reviewer' && (
        <div className="mb-6 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900" role="note">
          <p className="font-medium">You are viewing this run as an assigned reviewer</p>
          <p className="mt-0.5 text-xs leading-relaxed text-blue-800">
            Your assignment: {viewer.assignment_role === 'both' ? 'primary and second review' : viewer.assignment_role === 'primary' ? 'primary review' : 'second review'}.
            You can record dispositions below. Approval, reports and reviewer management stay with the run owner.
          </p>
        </div>
      )}

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
            {STATUS_LABELS[run.status] ?? run.status}
          </span>
        </div>
        {can.generateReports && <div>
          <p className="text-xs text-zinc-400 uppercase tracking-wide mb-0.5">Report</p>
          {run.report_generated_at ? (
            <p className="text-green-700 text-xs">✓ {fmtDate(run.report_generated_at)}</p>
          ) : (
            <p className="text-zinc-300 text-xs">Not generated</p>
          )}
        </div>}
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

      {/* The server boundary intentionally renders no AI decision counts. Protected
          decision state is loaded per viewer by the adjudication API below. */}
      <div className="rounded-md border border-[#E2E8F0] bg-white p-5 mb-6">
        <div className="flex gap-6 flex-wrap text-sm">
          <div className="text-center">
            <p className="text-2xl font-semibold text-zinc-900">{tot}</p>
            <p className="text-xs text-zinc-400 mt-0.5">Source records</p>
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-800">Controlled review below</p>
            <p className="mt-0.5 max-w-xl text-xs leading-relaxed text-zinc-500">
              AI classifications and human dispositions are loaded through the protected review channel. Blind-validation records do not expose an AI result until the reviewer locks an independent provisional decision.
            </p>
          </div>
        </div>
      </div>

      {showMhraNoMatches && (
        <div className="mb-4 rounded border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <strong>No MHRA source records</strong> — the MHRA (UK) source was searched, but it returned no raw records for this source query and period. Results from other databases are unaffected.
        </div>
      )}

      {run.status === 'error' && (
        <div className="mb-6 rounded border border-[rgba(220,38,38,0.2)] bg-[rgba(220,38,38,0.06)] px-4 py-3 text-sm text-[#DC2626]">
          <strong>Error:</strong> This search encountered an error. Please try again or contact support.
        </div>
      )}

      {can.manageReviewers && (
        <ReviewersPanel
          runId={run.id}
          reviewStatus={run.review_status ?? 'draft'}
          initialAssignments={reviewerAssignments.data}
          loadError={reviewerAssignments.error ? 'Reviewer assignments could not be loaded. Refresh to try again.' : null}
        />
      )}

      {/* Results list */}
      {results.length > 0 ? (
        <RunResults
          results={results}
          runId={run.id}
          runStatus={run.status}
          reviewStatus={run.review_status ?? 'draft'}
          hasReport={!!run.report_generated_at}
          sourceBreakdown={sourceBreakdown}
          viewerMode={viewer.mode}
          attribution={attribution}
        />
      ) : (
        <p className="text-sm text-zinc-400 py-8 text-center">
          {run.status === 'complete' ? 'No FSN results were found for this search.' : 'Results will appear here once the search completes.'}
        </p>
      )}
    </div>
  )
}
