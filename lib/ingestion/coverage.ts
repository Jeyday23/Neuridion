export interface Interval {
  from: string
  to: string
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function parseDate(value: string): Date {
  if (!DATE_PATTERN.test(value)) throw new TypeError(`Invalid ISO date: ${value}`)
  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new TypeError(`Invalid ISO date: ${value}`)
  }
  return date
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function addDays(value: string, days: number): string {
  const date = parseDate(value)
  date.setUTCDate(date.getUTCDate() + days)
  return formatDate(date)
}

function assertInterval(interval: Interval): void {
  parseDate(interval.from)
  parseDate(interval.to)
  if (interval.from > interval.to) throw new RangeError(`Invalid interval: ${interval.from}..${interval.to}`)
}

export function unionIntervals(intervals: Interval[]): Interval[] {
  intervals.forEach(assertInterval)
  const sorted = intervals.map((interval) => ({ ...interval }))
    .sort((left, right) => left.from.localeCompare(right.from))
  const merged: Interval[] = []
  for (const interval of sorted) {
    const previous = merged.at(-1)
    if (previous && interval.from <= addDays(previous.to, 1)) {
      if (interval.to > previous.to) previous.to = interval.to
    } else {
      merged.push(interval)
    }
  }
  return merged
}

export function computeFetchWindow(input: {
  asOfDate: string
  covered: Interval[]
  overlapDays: number
  lookbackDays: number
}): Interval {
  parseDate(input.asOfDate)
  if (input.overlapDays < 0 || input.lookbackDays < 0) throw new RangeError('Lookback values must be non-negative')
  const covered = unionIntervals(input.covered)
  const latestCoveredTo = covered.at(-1)?.to ?? null
  const anchor = latestCoveredTo && latestCoveredTo < input.asOfDate
    ? latestCoveredTo
    : input.asOfDate
  const days = latestCoveredTo ? input.overlapDays : input.lookbackDays
  return { from: addDays(anchor, -days), to: input.asOfDate }
}

export function detectGaps(covered: Interval[], earliest: string, latest: string): Interval[] {
  assertInterval({ from: earliest, to: latest })
  const merged = unionIntervals(covered)
  const gaps: Interval[] = []
  let cursor = earliest
  for (const interval of merged) {
    if (interval.to < earliest) continue
    if (interval.from > latest) break
    if (interval.from > cursor) {
      gaps.push({ from: cursor, to: addDays(interval.from, -1) })
    }
    if (interval.to >= cursor) cursor = addDays(interval.to, 1)
    if (cursor > latest) break
  }
  if (cursor <= latest) gaps.push({ from: cursor, to: latest })
  return gaps
}

