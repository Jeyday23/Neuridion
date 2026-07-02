import {
  BFARM_ORIGIN,
  parseNextPageHref,
  parsePage,
  scrapeBfArM,
  type ParsedItem,
  type ScrapedFsn,
  type ScraperResult,
} from '@/lib/scrapers/bfarm'
import { scrapeFdaMaude } from '@/lib/scrapers/fda-maude'
import { scrapeMhra } from '@/lib/scrapers/mhra'
import { scrapeMhraExcel } from '@/lib/scrapers/mhra-excel'
import { scrapeSwissmedic } from '@/lib/scrapers/swissmedic'
import { mergeMhraEvidence, scrapeMhraProduction, type ProductionSourceId } from '@/lib/scrapers/registry'

const BFARM_RESULTS_PER_PAGE = 30
const BFARM_MAX_PAGES = 50
const BFARM_SEARCH_BASE = `${BFARM_ORIGIN}/SiteGlobals/Forms/Suche/Expertensuche_Formular.html`
const FDA_BASE_URL = 'https://api.fda.gov/device/event.json'
const SWISSMEDIC_API_BASE = 'https://fsca.swissmedic.ch/mep/api/publications'
const SWISSMEDIC_PUBLIC_BASE = 'https://fsca.swissmedic.ch/mep'

const SOURCE_IDS = ['bfarm', 'fda', 'mhra', 'swissmedic'] as const
type SourceId = ProductionSourceId | 'all'

const BROWSER_HEADERS: HeadersInit = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
  Referer: `${BFARM_ORIGIN}/`,
}

type Args = {
  source: SourceId
  from: string
  to: string
  query?: string
}

type SourceRow = {
  external_id: string
  title: string
  fsn_date: string | null
  href: string
}

type ParityResult = {
  source: ProductionSourceId
  sourceRows: SourceRow[]
  neuridion: ScraperResult
  comparison: ReturnType<typeof compareRows>
  notes: string[]
}

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  if (index === -1) return undefined
  return process.argv[index + 1]
}

function parseArgs(): Args {
  const source = argValue('--source') ?? 'bfarm'
  const from = argValue('--from')
  const to = argValue('--to')
  const query = argValue('--query')

  if (![...SOURCE_IDS, 'all'].includes(source as SourceId)) {
    throw new Error(`Unsupported source "${source}". Use one of: ${[...SOURCE_IDS, 'all'].join(', ')}`)
  }
  if (!from || !to) {
    throw new Error('Usage: npm run verify:source-parity -- --source <bfarm|fda|mhra|swissmedic|all> --from YYYY-MM-DD --to YYYY-MM-DD [--query term]')
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    throw new Error('--from and --to must use YYYY-MM-DD')
  }
  if (source !== 'bfarm' && query) {
    throw new Error('--query is currently supported only for BfArM parity')
  }

  return { source: source as SourceId, from, to, ...(query ? { query } : {}) }
}

function toBfarmDate(value: string): string {
  const [year, month, day] = value.split('-')
  return `${day}.${month}.${year}`
}

function buildBfarmUrl(args: Args, page: number): string {
  const params = new URLSearchParams({
    cl2Categories_Format: 'kundeninfo',
    cl2Categories_Rubrik: 'medizinprodukte',
    resultsPerPage: String(BFARM_RESULTS_PER_PAGE),
    input_Datum_VON: toBfarmDate(args.from),
    input_Datum_BIS: toBfarmDate(args.to),
    submit: 'Senden',
  })
  if (args.query) params.set('templateQueryString', args.query)
  if (page > 1) params.set('gtp', `469344_list=${page}`)
  return `${BFARM_SEARCH_BASE}?${params.toString()}`
}

function inVisibleRequestedWindow(
  pageItems: ParsedItem[],
  fromDate: Date,
  toDate: Date,
): { rows: ParsedItem[]; crossedBelowFromDate: boolean } {
  const rows: ParsedItem[] = []
  let reachedLowerBoundary = false
  let crossedBelowFromDate = false
  let previousDate: Date | null = null

  for (const item of pageItems) {
    const date = item.date
    if (!date) {
      rows.push(item)
      continue
    }
    if (date > toDate) {
      previousDate = date
      continue
    }
    if (date < fromDate) {
      crossedBelowFromDate = true
      break
    }
    if (reachedLowerBoundary && previousDate && date > previousDate) {
      continue
    }

    rows.push(item)
    if (date.getTime() === fromDate.getTime()) reachedLowerBoundary = true
    previousDate = date
  }

  return { rows, crossedBelowFromDate }
}

function toBfarmSourceRow(item: ParsedItem): SourceRow {
  return {
    external_id: item.externalId,
    title: item.title,
    fsn_date: item.date ? item.date.toISOString().slice(0, 10) : null,
    href: new URL(item.href, BFARM_ORIGIN).toString(),
  }
}

async function fetchBfarmVisibleRows(args: Args): Promise<SourceRow[]> {
  const fromDate = new Date(`${args.from}T00:00:00.000Z`)
  const toDate = new Date(`${args.to}T23:59:59.999Z`)
  const rows: SourceRow[] = []
  const seen = new Set<string>()
  let url: string | null = buildBfarmUrl(args, 1)

  for (let page = 1; page <= BFARM_MAX_PAGES && url; page++) {
    const response = await fetch(url, { headers: BROWSER_HEADERS })
    if (!response.ok) throw new Error(`BfArM source fetch failed on page ${page}: HTTP ${response.status}`)
    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.includes('text/html')) {
      throw new Error(`BfArM source fetch returned non-HTML on page ${page}: ${contentType}`)
    }

    const html = await response.text()
    const pageItems = parsePage(html)
    if (pageItems.length === 0) break

    const visible = inVisibleRequestedWindow(pageItems, fromDate, toDate)
    for (const item of visible.rows) {
      const row = toBfarmSourceRow(item)
      if (seen.has(row.external_id)) continue
      seen.add(row.external_id)
      rows.push(row)
    }

    const nextHref = parseNextPageHref(html)
    if (visible.crossedBelowFromDate || !nextHref) break
    url = new URL(nextHref, BFARM_ORIGIN).toString()
  }

  return rows
}

function formatFdaDate(raw: string | null | undefined): string | null {
  if (!raw || raw.length !== 8) return null
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
}

type FdaRecord = {
  report_number?: string
  mdr_report_key?: string
  event_type?: string
  date_received?: string
  date_of_event?: string
  device?: Array<{ brand_name?: string; generic_name?: string }>
}

async function fetchFdaAuthorityRows(args: Args): Promise<SourceRow[]> {
  const from = args.from.replace(/-/g, '')
  const to = args.to.replace(/-/g, '')
  const apiKey = process.env.OPENFDA_API_KEY
  const rows: SourceRow[] = []
  const seen = new Set<string>()
  let skip = 0

  while (true) {
    const params = new URLSearchParams({
      search: `date_received:[${from} TO ${to}]`,
      limit: '1000',
      skip: String(skip),
    })
    if (apiKey) params.set('api_key', apiKey)
    let response = await fetch(`${FDA_BASE_URL}?${params.toString()}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Neuridion/1.0; +https://neuridion.eu)' },
    })
    if ((response.status === 401 || response.status === 403) && apiKey) {
      params.delete('api_key')
      response = await fetch(`${FDA_BASE_URL}?${params.toString()}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Neuridion/1.0; +https://neuridion.eu)' },
      })
    }
    if (response.status === 404) break
    if (!response.ok) throw new Error(`openFDA source fetch failed at skip=${skip}: HTTP ${response.status}`)
    const data = await response.json() as { meta?: { results?: { total?: number } }; results?: FdaRecord[] }
    const results = data.results ?? []
    for (const record of results) {
      const externalId = record.report_number ?? `maude-${record.mdr_report_key ?? ''}`
      if (!externalId || seen.has(externalId)) continue
      seen.add(externalId)
      const device = record.device?.[0]
      const deviceLabel = device?.brand_name?.trim() || device?.generic_name?.trim() || 'Medical Device'
      const eventType = record.event_type ?? 'MDR'
      rows.push({
        external_id: externalId,
        title: `${deviceLabel} — ${eventType}`,
        fsn_date: formatFdaDate(record.date_received ?? record.date_of_event),
        href: record.report_number
          ? `https://api.fda.gov/device/event.json?search=report_number.exact:%22${encodeURIComponent(record.report_number)}%22&limit=1`
          : FDA_BASE_URL,
      })
    }

    const total = data.meta?.results?.total ?? rows.length
    skip += results.length
    if (results.length === 0 || skip >= total) break
    if (skip > 25000) {
      throw new Error(`openFDA parity range too broad for direct exact comparison (${total} records). Use a smaller date window.`)
    }
  }

  return rows
}

type SwissmedicPublication = {
  publikationsDatum?: string | null
  swissmedicRef?: string | null
  hersteller?: string | null
  status?: string | null
  statusDatum?: string | null
  devices?: Array<{ handelsname?: string | null }>
}

async function fetchSwissmedicAuthorityRows(args: Args): Promise<SourceRow[]> {
  const rows: SourceRow[] = []
  const seen = new Set<string>()

  for (let pageNumber = 0; pageNumber < 25; pageNumber++) {
    const url = new URL(`${SWISSMEDIC_API_BASE}/search`)
    url.searchParams.set('pageNumber', String(pageNumber))
    url.searchParams.set('sortingProperty', 'PUBLICATION_DATE')
    url.searchParams.set('direction', 'DESC')
    url.searchParams.set('size', '100')
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Neuridion/1.0; +https://neuridion.eu)',
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fromDate: args.from, toDate: args.to }),
    })
    if (!response.ok) throw new Error(`Swissmedic source fetch failed on page ${pageNumber}: HTTP ${response.status}`)
    const page = await response.json() as { content?: SwissmedicPublication[]; totalPages?: number; last?: boolean }
    const publications = page.content ?? []
    for (const publication of publications) {
      const ref = publication.swissmedicRef?.trim()
      if (!ref || seen.has(ref)) continue
      seen.add(ref)
      const productName = [...new Set((publication.devices ?? []).map(device => device.handelsname?.trim()).filter(Boolean) as string[])].join('; ')
      const fsnDate = publication.publikationsDatum ?? publication.statusDatum ?? null
      if (!fsnDate || fsnDate < args.from || fsnDate > args.to) continue
      const titleParts = [
        productName,
        publication.hersteller?.trim(),
        publication.status ? `Swissmedic ${publication.status}` : 'Swissmedic FSCA',
      ].filter(Boolean)
      rows.push({
        external_id: ref,
        title: titleParts.join(' — ') || `Swissmedic FSCA ${ref}`,
        fsn_date: fsnDate,
        href: `${SWISSMEDIC_PUBLIC_BASE}/?search=${encodeURIComponent(ref)}`,
      })
    }
    if (page.last || pageNumber + 1 >= (page.totalPages ?? 1) || publications.length === 0) break
  }

  return rows
}

function toRows(items: ScrapedFsn[]): SourceRow[] {
  return items.map(item => ({
    external_id: item.external_id,
    title: item.title,
    fsn_date: item.fsn_date,
    href: item.source_url,
  }))
}

async function fetchMhraAuthorityRows(args: Args): Promise<SourceRow[]> {
  const settled = await Promise.allSettled([
    scrapeMhraExcel({ fromDate: args.from, toDate: args.to }),
    scrapeMhra({ fromDate: args.from, toDate: args.to }),
  ])
  const warnings: string[] = []
  const groups: ScrapedFsn[][] = []
  for (const result of settled) {
    if (result.status === 'fulfilled') {
      warnings.push(...result.value.warnings)
      if (result.value.outcome !== 'failed') groups.push(result.value.items)
    } else {
      warnings.push(String(result.reason))
    }
  }
  if (groups.length === 0) throw new Error(`MHRA authority fetch failed: ${warnings.join('; ')}`)
  if (warnings.length > 0) throw new Error(`MHRA authority fetch was partial: ${warnings.join('; ')}`)
  return toRows(mergeMhraEvidence(groups))
}

function normalizeTitle(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function compareRows(sourceRows: SourceRow[], neuridionRows: ScrapedFsn[]) {
  const sourceById = new Map(sourceRows.map(row => [row.external_id, row]))
  const neuridionById = new Map(neuridionRows.map(row => [row.external_id, row]))

  const missing = sourceRows.filter(row => !neuridionById.has(row.external_id))
  const extra = neuridionRows.filter(row => !sourceById.has(row.external_id))
  const dateMismatches = sourceRows
    .map(source => {
      const actual = neuridionById.get(source.external_id)
      if (!actual || actual.fsn_date === source.fsn_date) return null
      return { id: source.external_id, source: source.fsn_date, neuridion: actual.fsn_date }
    })
    .filter((row): row is { id: string; source: string | null; neuridion: string | null } => row !== null)
  const titleMismatches = sourceRows
    .map(source => {
      const actual = neuridionById.get(source.external_id)
      if (!actual || normalizeTitle(actual.title) === normalizeTitle(source.title)) return null
      return { id: source.external_id, source: source.title, neuridion: actual.title }
    })
    .filter((row): row is { id: string; source: string; neuridion: string } => row !== null)
  const brokenLinks = neuridionRows.filter(row => {
    try {
      const parsed = new URL(row.source_url)
      if (parsed.protocol !== 'https:') return true
      if (row.source_url.includes(`${parsed.origin}https`) || row.source_url.includes('https//')) return true
      return false
    } catch {
      return true
    }
  })

  return { missing, extra, dateMismatches, titleMismatches, brokenLinks }
}

function printRows<T>(label: string, rows: T[], format: (row: T) => string): void {
  console.error(`${label}: ${rows.length}`)
  for (const row of rows.slice(0, 20)) console.error(`  - ${format(row)}`)
  if (rows.length > 20) console.error(`  ... ${rows.length - 20} more`)
}

async function runSource(source: ProductionSourceId, args: Args): Promise<ParityResult> {
  const sourceRows = source === 'bfarm'
    ? await fetchBfarmVisibleRows(args)
    : source === 'fda'
      ? await fetchFdaAuthorityRows(args)
      : source === 'mhra'
        ? await fetchMhraAuthorityRows(args)
        : await fetchSwissmedicAuthorityRows(args)

  const neuridion = source === 'bfarm'
    ? await scrapeBfArM({
      fromDate: new Date(`${args.from}T00:00:00.000Z`),
      toDate: new Date(`${args.to}T23:59:59.999Z`),
      ...(args.query ? { query: args.query } : {}),
    })
    : source === 'fda'
      ? await scrapeFdaMaude({ fromDate: args.from, toDate: args.to })
      : source === 'mhra'
        ? await scrapeMhraProduction({ fromDate: args.from, toDate: args.to })
        : await scrapeSwissmedic({ fromDate: args.from, toDate: args.to })

  return {
    source,
    sourceRows,
    neuridion,
    comparison: compareRows(sourceRows, neuridion.items),
    notes: source === 'mhra'
      ? ['MHRA parity compares the official Excel workbook plus GOV.UK API union, matching production behavior.']
      : source === 'fda'
        ? ['FDA parity compares openFDA device/event API records by report number. Large date windows may exceed direct API skip limits.']
        : source === 'swissmedic'
          ? ['Swissmedic parity compares the official public publication API.']
          : ['BfArM parity compares visible portal rows, matching manual PRRC review.'],
  }
}

function printResult(result: ParityResult): boolean {
  console.error(`\n${result.source.toUpperCase()} Source Parity`)
  result.notes.forEach(note => console.error(`Note: ${note}`))
  console.error(`Source authority rows: ${result.sourceRows.length}`)
  console.error(`Neuridion raw rows:    ${result.neuridion.items.length}`)
  console.error(`Neuridion outcome:     ${result.neuridion.outcome}`)
  console.error(`Neuridion warnings:    ${result.neuridion.warnings.length}`)
  printRows('Missing from Neuridion', result.comparison.missing, row => `${row.fsn_date} ${row.external_id} ${row.title}`)
  printRows('Extra in Neuridion', result.comparison.extra, row => `${row.fsn_date} ${row.external_id} ${row.title}`)
  printRows('Date mismatches', result.comparison.dateMismatches, row => `${row.id}: source=${row.source} neuridion=${row.neuridion}`)
  printRows('Title mismatches', result.comparison.titleMismatches, row => `${row.id}`)
  printRows('Broken links', result.comparison.brokenLinks, row => `${row.external_id}: ${row.source_url}`)

  const sourceMatchedOutcome = result.neuridion.outcome === 'complete'
    || (result.sourceRows.length === 0 && result.neuridion.items.length === 0 && result.neuridion.outcome === 'empty')
  const pass = sourceMatchedOutcome
    && result.neuridion.warnings.length === 0
    && result.comparison.missing.length === 0
    && result.comparison.extra.length === 0
    && result.comparison.dateMismatches.length === 0
    && result.comparison.titleMismatches.length === 0
    && result.comparison.brokenLinks.length === 0

  console.error(`RESULT: ${pass ? 'PASS' : 'FAIL'}`)
  return pass
}

async function main(): Promise<void> {
  const args = parseArgs()
  const sources = args.source === 'all' ? SOURCE_IDS : [args.source as ProductionSourceId]

  console.error(`Source parity range: ${args.from} → ${args.to}`)
  if (args.query) console.error(`Query: ${args.query}`)

  const results: ParityResult[] = []
  for (const source of sources) {
    results.push(await runSource(source, args))
  }

  const passes = results.map(printResult)
  const allPass = passes.every(Boolean)
  console.error(`\nOVERALL RESULT: ${allPass ? 'PASS' : 'FAIL'}`)
  if (!allPass) process.exit(1)
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
