export interface DateChunk {
  from: string  // YYYY-MM-DD
  to: string    // YYYY-MM-DD
}

/**
 * Splits a date range into smaller chunks.
 * Default: 60-day chunks (BfArM returns ~80-150 items per 60-day window,
 * safely under the 200-item pagination cap).
 *
 * 2-year search → 12 chunks of 60 days each.
 */
export function chunkDateRange(
  fromDate: string,
  toDate: string,
  chunkDays = 60,
): DateChunk[] {
  const chunks: DateChunk[] = []
  const end = new Date(toDate + 'T23:59:59.999Z')
  let currentStart = new Date(fromDate + 'T00:00:00.000Z')

  while (currentStart <= end) {
    const currentEnd = new Date(currentStart)
    currentEnd.setUTCDate(currentEnd.getUTCDate() + chunkDays - 1)

    if (currentEnd > end) currentEnd.setTime(end.getTime())

    chunks.push({
      from: currentStart.toISOString().slice(0, 10),
      to:   currentEnd.toISOString().slice(0, 10),
    })

    currentStart = new Date(currentEnd)
    currentStart.setUTCDate(currentStart.getUTCDate() + 1)
  }

  return chunks
}

/**
 * Calculates total days in a range (inclusive).
 */
export function daysBetween(fromDate: string, toDate: string): number {
  const start = new Date(fromDate + 'T00:00:00.000Z')
  const end   = new Date(toDate   + 'T00:00:00.000Z')
  return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
}
