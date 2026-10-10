import type { InputCurrencySummary } from '@/lib/sources/input-currency'

/**
 * Read-time notice that source records changed after this search screened
 * them. Server component: no client state, no data beyond counts.
 */
export function InputCurrencyPanel({
  summary,
  warnings,
  loadFailed,
}: {
  summary: InputCurrencySummary | null
  warnings: string[]
  loadFailed: boolean
}) {
  if (loadFailed) {
    return (
      <div role="status" className="mb-4 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <strong>Input currency not verified.</strong> Whether the screened source records are still current could not be checked. Try again later.
      </div>
    )
  }
  if (!summary || warnings.length === 0) return null
  const changed = summary.changed > 0
  return (
    <section
      role={changed ? 'alert' : 'status'}
      aria-labelledby="input-currency-heading"
      className={`mb-4 rounded border px-4 py-3 text-sm ${changed ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-zinc-200 bg-zinc-50 text-zinc-700'}`}
    >
      <h2 id="input-currency-heading" className="font-semibold">
        {changed ? 'Some screened sources have changed since this search' : 'Source currency partly unverified'}
      </h2>
      <ul className="mt-1 list-disc pl-5">
        {warnings.map((warning) => <li key={warning}>{warning}</li>)}
      </ul>
      {changed && (
        <p className="mt-1">
          This search and any approval stay as recorded. To assess the current versions, run a new search for this period.
        </p>
      )}
    </section>
  )
}
