'use client'

import { useEffect, useId, useState } from 'react'
import Link from 'next/link'
import { clsx } from 'clsx'
import { apiFetch } from '@/lib/fetch'
import type {
  CycleComparison as CycleComparisonData,
  DecisionChangedRecord,
  ModifiedRecord,
  NewRecord,
  RecordRef,
  RemovedRecord,
  SourceCoverageStatus,
  UnverifiedAbsence,
} from '@/lib/cycles/compare'
import type { EffectiveDecision } from '@/lib/cycles/effective'

export interface CycleComparisonProps {
  /** The run whose page this renders on. */
  runId: string
  /** Compare against a specific earlier run instead of the latest one. */
  previousRunId?: string
  /** When choosing automatically, prefer the latest approved earlier run. */
  preferApproved?: boolean
  /** Route prefix for run links. Defaults to /dashboard/archive. */
  runHrefBase?: string
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; data: CycleComparisonData }

const PAGE = 100

const STATUS_LABEL: Record<SourceCoverageStatus, string> = {
  complete: 'Complete',
  complete_with_fallback: 'Complete via fallback',
  empty: 'Empty',
  partial: 'Partial',
  failed: 'Failed',
  not_recorded: 'Not recorded',
  not_searched: 'Not searched',
}

const NEW_CONTEXT_LABEL: Record<NewRecord['context'], string> = {
  previous_window_searched: 'Inside previous window, not returned then',
  outside_previous_window: 'Outside previous window',
  source_not_previously_searched: 'Source not searched previously',
  previous_coverage_degraded: 'Previous coverage not intact',
  date_unknown: 'Date unknown',
}

const ABSENCE_REASON_LABEL: Record<UnverifiedAbsence['reason'], string> = {
  coverage_degraded: 'Coverage not intact',
  source_not_searched: 'Source not searched in this run',
  date_unverifiable: 'Date or window not checkable',
}

function fmtDay(value: string | null | undefined): string {
  if (!value) return 'not recorded'
  const day = value.slice(0, 10)
  const date = new Date(`${day}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

function fmtValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '(empty)'
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

function fmtDecision(decision: EffectiveDecision): string {
  const label = decision.decision ?? 'no decision'
  const origin = decision.origin === 'human' ? 'human' : decision.origin === 'ai' ? 'automated' : 'none'
  const pending = decision.human_state === 'pending_second_review' ? ', second review pending' : ''
  const stale = decision.human_state === 'stale' ? ', earlier human disposition not current' : ''
  return `${label} (${origin}${pending}${stale})`
}

function RecordLine({ record, children }: { record: RecordRef; children?: React.ReactNode }) {
  return (
    <li className="border-b border-zinc-100 py-2 last:border-b-0">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] text-zinc-700">{record.source_db}</span>
        <span className="font-mono text-[11px] text-zinc-500">{record.external_id}</span>
        <span className="text-xs text-zinc-500">{fmtDay(record.fsn_date)}</span>
      </div>
      <p className="mt-1 text-sm text-zinc-900">
        {record.source_url && /^https?:\/\//.test(record.source_url) ? (
          <a href={record.source_url} target="_blank" rel="noopener noreferrer" className="underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-600">
            {record.title}
          </a>
        ) : record.title}
      </p>
      {children ? <div className="mt-1 text-xs text-zinc-600">{children}</div> : null}
    </li>
  )
}

function ExpandableList<T extends RecordRef>(props: {
  title: string
  description: string
  items: T[]
  tone?: 'neutral' | 'warning'
  render: (item: T) => React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [shown, setShown] = useState(PAGE)
  const panelId = useId()
  const headingId = useId()
  const count = props.items.length
  return (
    <section aria-labelledby={headingId} className={clsx(
      'rounded-md border',
      props.tone === 'warning' ? 'border-amber-200 bg-amber-50/40' : 'border-zinc-200 bg-white',
    )}>
      <h4 id={headingId} className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          disabled={count === 0}
          onClick={() => setOpen((value) => !value)}
          className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm font-medium text-zinc-900 hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0D9488] disabled:cursor-default disabled:text-zinc-500 disabled:hover:bg-transparent"
        >
          <span>{props.title}</span>
          <span className="flex items-center gap-2">
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs tabular-nums text-zinc-700">{count}</span>
            {count > 0 ? <span aria-hidden="true" className="text-xs text-zinc-500">{open ? 'Hide' : 'Show'}</span> : null}
          </span>
        </button>
      </h4>
      <div id={panelId} hidden={!open} className="border-t border-zinc-100 px-3 pb-3">
        <p className="mt-2 text-xs text-zinc-600">{props.description}</p>
        <ul className="mt-1">
          {props.items.slice(0, shown).map((item) => (
            <RecordLine key={item.key} record={item}>{props.render(item)}</RecordLine>
          ))}
        </ul>
        {count > shown ? (
          <button
            type="button"
            onClick={() => setShown((value) => value + PAGE)}
            className="mt-2 text-xs font-medium text-[#0D9488] underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0D9488]"
          >
            Show {Math.min(PAGE, count - shown)} more of {count - shown} remaining
          </button>
        ) : null}
      </div>
    </section>
  )
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-white px-3 py-2">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="m-0 text-lg font-semibold tabular-nums text-zinc-900">{value}</dd>
    </div>
  )
}

export function CycleComparison({ runId, previousRunId, preferApproved, runHrefBase = '/dashboard/archive' }: CycleComparisonProps) {
  const params = new URLSearchParams()
  if (previousRunId) params.set('previous', previousRunId)
  if (preferApproved) params.set('prefer_approved', 'true')
  const qs = params.toString()
  const url = `/api/search-runs/${encodeURIComponent(runId)}/comparison${qs ? `?${qs}` : ''}`

  // Settled state is tagged with the URL it answers; anything else is loading.
  const [settled, setSettled] = useState<{ url: string; state: LoadState } | null>(null)
  const state: LoadState = settled && settled.url === url ? settled.state : { kind: 'loading' }
  const headingId = useId()

  useEffect(() => {
    const controller = new AbortController()
    apiFetch(url, { signal: controller.signal })
      .then(async (res) => {
        const body = await res.json().catch(() => null) as (CycleComparisonData & { error?: string }) | null
        if (!res.ok || !body) {
          setSettled({ url, state: { kind: 'error', message: body?.error ?? 'The comparison could not be loaded.' } })
          return
        }
        setSettled({ url, state: { kind: 'ready', data: body } })
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setSettled({ url, state: { kind: 'error', message: 'The comparison could not be loaded.' } })
      })
    return () => controller.abort()
  }, [url])

  return (
    <section aria-labelledby={headingId} className="space-y-4">
      <h2 id={headingId} className="text-base font-semibold text-zinc-900">Comparison with previous cycle</h2>
      {state.kind === 'loading' ? (
        <p role="status" aria-live="polite" className="text-sm text-zinc-500">Loading comparison…</p>
      ) : state.kind === 'error' ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{state.message}</p>
      ) : (
        <ComparisonBody data={state.data} runHrefBase={runHrefBase} />
      )}
    </section>
  )
}

function ComparisonBody({ data, runHrefBase }: { data: CycleComparisonData; runHrefBase: string }) {
  const scopeHeadingId = useId()
  const coverageHeadingId = useId()
  const recordsHeadingId = useId()
  const explanationsHeadingId = useId()
  const { records, scope_changes: scope, completeness } = data

  if (!data.previous_run) {
    return (
      <p role="status" className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
        {completeness.reasons[0] ?? 'No previous run is available for comparison.'}
      </p>
    )
  }

  const prev = data.previous_run
  const hasScopeChange = scope.profile_fields_changed.length > 0 || scope.terms_changed === true
    || scope.sources_added.length > 0 || scope.sources_removed.length > 0

  return (
    <div className="space-y-5">
      <p className="text-sm text-zinc-700">
        Previous run:{' '}
        <Link href={`${runHrefBase}/${prev.id}`} className="font-medium text-[#0D9488] underline underline-offset-2">
          {fmtDay(prev.created_at)}
        </Link>
        {' '}· period {fmtDay(prev.period_from)} to {fmtDay(prev.period_to)} · status {prev.status} · review {prev.review_status ?? 'not recorded'}
      </p>

      {completeness.comparable ? (
        <div role="status" className="rounded-md border border-teal-200 bg-teal-50/60 px-3 py-2 text-sm text-teal-900">
          Both runs completed with intact coverage for every compared source.
          This comparison covers the records the two searches returned; it does not establish that every published notice was retrieved.
        </div>
      ) : (
        <div role="alert" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <p className="font-semibold">Not a like-for-like comparison</p>
          <ul className="mt-1 list-disc pl-5">
            {completeness.reasons.map((reason) => <li key={reason}>{reason}</li>)}
          </ul>
          <p className="mt-1">Differences below may reflect retrieval gaps rather than changes at the source. Absences from sources without intact coverage are listed as unverified.</p>
        </div>
      )}

      <section aria-labelledby={scopeHeadingId} className="space-y-2">
        <h3 id={scopeHeadingId} className="text-sm font-semibold text-zinc-900">Scope changes</h3>
        <p className="text-xs text-zinc-600">Changes to what was searched for. These are not new regulatory evidence.</p>
        <ul className="space-y-1 text-sm text-zinc-800">
          <li>
            Period: {scope.period_gap_days === null
              ? 'relation not computable (a period is missing).'
              : scope.period_overlap_days
                ? `overlaps the previous period by ${scope.period_overlap_days} day(s).`
                : scope.period_gap_days > 0
                  ? `${scope.period_gap_days} day(s) between the periods were searched by neither run.`
                  : 'contiguous with the previous period.'}
          </li>
          {scope.sources_added.length > 0 ? <li>Sources added: {scope.sources_added.join(', ')}</li> : null}
          {scope.sources_removed.length > 0 ? <li>Sources removed: {scope.sources_removed.join(', ')}</li> : null}
          {scope.terms_changed === null ? <li>Search terms: not recorded for both runs.</li>
            : scope.terms_changed ? <li>Search terms changed: {scope.terms_fields_changed.map((change) => change.field).join(', ')}</li> : null}
          {!scope.profile_snapshot_available ? <li>Profile fields: no snapshot for both runs.</li> : null}
          {!hasScopeChange && scope.profile_snapshot_available && scope.terms_changed === false
            ? <li>Profile fields, search terms and sources are unchanged.</li> : null}
        </ul>
        {scope.profile_fields_changed.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[28rem] text-left text-xs">
              <caption className="sr-only">Profile fields changed since the previous run</caption>
              <thead>
                <tr className="border-b border-zinc-200 text-zinc-500">
                  <th scope="col" className="py-1 pr-3 font-medium">Field</th>
                  <th scope="col" className="py-1 pr-3 font-medium">Previous</th>
                  <th scope="col" className="py-1 font-medium">Current</th>
                </tr>
              </thead>
              <tbody>
                {scope.profile_fields_changed.map((change) => (
                  <tr key={change.field} className="border-b border-zinc-100 align-top">
                    <th scope="row" className="py-1 pr-3 font-mono font-normal text-zinc-700">{change.field}</th>
                    <td className="max-w-xs break-words py-1 pr-3 text-zinc-600">{fmtValue(change.from)}</td>
                    <td className="max-w-xs break-words py-1 text-zinc-900">{fmtValue(change.to)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section aria-labelledby={coverageHeadingId} className="space-y-2">
        <h3 id={coverageHeadingId} className="text-sm font-semibold text-zinc-900">Source coverage</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[24rem] text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-200 text-zinc-500">
                <th scope="col" className="py-1 pr-3 font-medium">Source</th>
                <th scope="col" className="py-1 pr-3 font-medium">Previous</th>
                <th scope="col" className="py-1 pr-3 font-medium">Current</th>
                <th scope="col" className="py-1 font-medium">Compared</th>
              </tr>
            </thead>
            <tbody>
              {data.source_coverage.map((item) => (
                <tr key={item.source} className="border-b border-zinc-100">
                  <th scope="row" className="py-1 pr-3 font-mono font-normal text-zinc-700">{item.source}</th>
                  <td className="py-1 pr-3">{STATUS_LABEL[item.previous_status] ?? item.previous_status}</td>
                  <td className="py-1 pr-3">{STATUS_LABEL[item.current_status] ?? item.current_status}</td>
                  <td className={clsx('py-1', item.compared ? 'text-zinc-700' : 'font-medium text-amber-800')}>
                    {item.compared ? 'Yes' : 'No'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby={recordsHeadingId} className="space-y-3">
        <h3 id={recordsHeadingId} className="text-sm font-semibold text-zinc-900">Record differences</h3>
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Count label="New" value={records.new.length} />
          <Count label="Modified" value={records.modified.length} />
          <Count label="Decision changed" value={records.decision_changed.length} />
          <Count label="Removed" value={records.removed.length} />
          <Count label="Unverified absence" value={records.unverified_absence.length} />
          <Count label="Unchanged" value={records.unchanged_count} />
        </dl>
        <div className="space-y-2">
          <ExpandableList<NewRecord>
            title="New records"
            description="Returned by this run and not by the previous run. The context says whether the previous run could have returned them."
            items={records.new}
            render={(item) => <>{NEW_CONTEXT_LABEL[item.context]} · {fmtDecision(item.decision)}</>}
          />
          <ExpandableList<ModifiedRecord>
            title="Modified records"
            description="Present in both runs with a different stored content hash or attachment digest."
            items={records.modified}
            render={(item) => (
              <>Changed: {item.changes.map((change) => change === 'attachments' ? 'attached documents' : 'record content').join(', ')}</>
            )}
          />
          <ExpandableList<DecisionChangedRecord>
            title="Decision changed"
            description="Present in both runs with a different effective decision. Human dispositions take precedence over automated assessments."
            items={records.decision_changed}
            render={(item) => <>{fmtDecision(item.from)} → {fmtDecision(item.to)}</>}
          />
          <ExpandableList<RemovedRecord>
            title="Removed records"
            description="Returned by the previous run and not by this one, although both runs searched the source with intact coverage and the record date lies in this run's window."
            items={records.removed}
            render={(item) => <>Previous decision: {fmtDecision(item.previous_decision)}</>}
          />
          <ExpandableList<UnverifiedAbsence>
            title="Unverified absence"
            description="Returned by the previous run and not by this one, but the absence cannot be confirmed."
            items={records.unverified_absence}
            tone={records.unverified_absence.length > 0 ? 'warning' : 'neutral'}
            render={(item) => (
              <>{ABSENCE_REASON_LABEL[item.reason]} (previous: {STATUS_LABEL[item.previous_status]}, current: {STATUS_LABEL[item.current_status]}) · previous decision: {fmtDecision(item.previous_decision)}</>
            )}
          />
          {records.outside_current_period.length > 0 ? (
            <ExpandableList<RemovedRecord>
              title="Outside this run's period"
              description="Previous records dated outside this run's search window; they were not expected here."
              items={records.outside_current_period}
              render={(item) => <>Previous decision: {fmtDecision(item.previous_decision)}</>}
            />
          ) : null}
        </div>
      </section>

      <section aria-labelledby={explanationsHeadingId} className="space-y-1">
        <h3 id={explanationsHeadingId} className="text-sm font-semibold text-zinc-900">Summary</h3>
        <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed text-zinc-700">
          {data.explanations.map((line, index) => <li key={index}>{line}</li>)}
        </ul>
      </section>
    </div>
  )
}
