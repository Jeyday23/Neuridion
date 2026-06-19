export interface FdaSignalRecord {
  source_db: string
  title: string
  manufacturer: string | null
  product_name?: string | null
  raw_content?: string | null
  fsn_date: string | null
  source_url: string | null
}

export interface FdaSignalGroup {
  key: string
  product: string
  manufacturer: string
  failureMode: string
  reportCount: number
  firstReported: string | null
  lastReported: string | null
  evidenceUrls: string[]
}

function normalize(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function extractProduct(record: FdaSignalRecord): string {
  if (record.product_name?.trim()) return record.product_name.trim()
  const fromTitle = record.title.split(/\s+[—–-]\s+/)[0]?.trim()
  return fromTitle || 'Unspecified medical device'
}

export function extractFdaFailureMode(rawContent: string | null | undefined): string {
  const problems = rawContent?.match(/(?:^|\n)Product problems:\s*([^\n]+)/i)?.[1]
  if (problems) {
    const unique = [...new Map(
      problems
        .split(',')
        .map(value => value.trim())
        .filter(Boolean)
        .map(value => [normalize(value), value] as const),
    ).values()]
    if (unique.length > 0) return unique.sort((a, b) => a.localeCompare(b)).join(', ')
  }

  const eventType = rawContent?.match(/(?:^|\n)Event type:\s*([^\n]+)/i)?.[1]?.trim()
  return eventType ? `Event type: ${eventType}` : 'Unspecified reported problem'
}

export function groupFdaSignals(records: FdaSignalRecord[]): FdaSignalGroup[] {
  const groups = new Map<string, FdaSignalGroup>()

  for (const record of records) {
    if (record.source_db !== 'fda') continue

    const product = extractProduct(record)
    const manufacturer = record.manufacturer?.trim() || 'Unknown manufacturer'
    const failureMode = extractFdaFailureMode(record.raw_content)
    const key = `${normalize(manufacturer)}|${normalize(product)}|${normalize(failureMode)}`
    const existing = groups.get(key)

    if (!existing) {
      groups.set(key, {
        key,
        product,
        manufacturer,
        failureMode,
        reportCount: 1,
        firstReported: record.fsn_date,
        lastReported: record.fsn_date,
        evidenceUrls: record.source_url ? [record.source_url] : [],
      })
      continue
    }

    existing.reportCount++
    if (record.fsn_date && (!existing.firstReported || record.fsn_date < existing.firstReported)) {
      existing.firstReported = record.fsn_date
    }
    if (record.fsn_date && (!existing.lastReported || record.fsn_date > existing.lastReported)) {
      existing.lastReported = record.fsn_date
    }
    if (record.source_url && !existing.evidenceUrls.includes(record.source_url) && existing.evidenceUrls.length < 5) {
      existing.evidenceUrls.push(record.source_url)
    }
  }

  return [...groups.values()].sort((a, b) =>
    b.reportCount - a.reportCount
    || a.product.localeCompare(b.product)
    || a.failureMode.localeCompare(b.failureMode)
  )
}
