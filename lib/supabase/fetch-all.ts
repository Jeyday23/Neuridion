/**
 * PostgREST caps each response (1,000 rows by default on Supabase). An
 * unpaged select silently truncates large runs: reports, review pages and
 * readiness views would show part of the evidence as if it were all of it.
 *
 * fetchAllRows pages until a short page arrives and fails closed above a hard
 * ceiling instead of returning a partial set. Callers must give a total
 * order (append an id tie-breaker) so pages cannot overlap or skip rows.
 */
export const FETCH_ALL_PAGE_SIZE = 1_000
export const FETCH_ALL_MAX_ROWS = 100_000

export interface FetchAllError {
  message: string
  code?: string | null
}

type Page<T> = PromiseLike<{ data: T[] | null; error: FetchAllError | null }>

export async function fetchAllRows<T>(
  page: (from: number, to: number) => Page<T>,
  options: { pageSize?: number; maxRows?: number } = {},
): Promise<{ data: T[]; error: FetchAllError | null }> {
  const pageSize = options.pageSize ?? FETCH_ALL_PAGE_SIZE
  const maxRows = options.maxRows ?? FETCH_ALL_MAX_ROWS
  const rows: T[] = []
  for (let from = 0; ; from += pageSize) {
    if (from >= maxRows) {
      return { data: [], error: { message: `row limit ${maxRows} exceeded`, code: 'FETCH_ALL_LIMIT' } }
    }
    const { data, error } = await page(from, from + pageSize - 1)
    if (error) return { data: [], error }
    const batch = data ?? []
    rows.push(...batch)
    if (batch.length < pageSize) return { data: rows, error: null }
  }
}
