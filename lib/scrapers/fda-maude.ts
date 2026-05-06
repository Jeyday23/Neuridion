import type { ScrapedFsn, ScraperResult } from './bfarm'
import { sanitizeContent } from './sanitize'

// openFDA device/event endpoint — no auth required, API key raises daily quota
// Docs: https://open.fda.gov/apis/device/event/
const BASE_URL         = 'https://api.fda.gov/device/event.json'
const RESULTS_PER_PAGE = 1000           // API max per request
const MAX_SKIP         = 25000          // API hard limit: skip + limit ≤ 26000
const MAX_ITEMS        = 500            // Per-quarter cap. Quarterly chunking means a 1-year search
                                        // can return up to 4 × 500 = 2,000 records instead of 500.
                                        // Callers should pass searchTerms to narrow the Lucene query.
const PAGE_DELAY_MS    = 400            // ~150 req/min — well under 240 RPM limit
const UA = 'Mozilla/5.0 (compatible; Neuridion/1.0; +https://neuridion.eu)'

export async function scrapeFdaMaude(params: {
  fromDate:     string
  toDate:       string
  searchTerms?: string[]   // optional tokens (device name / manufacturer words) to narrow
                           // the openFDA Lucene query — dramatically reduces result volume
                           // e.g. ['CardioSense', 'Acme'] for "CardioSense Pro by Acme Medical"
}): Promise<ScraperResult> {
  const apiKey    = process.env.OPENFDA_API_KEY
  const quarters  = splitIntoQuarters(params.fromDate, params.toDate)
  const termClause = buildTermClause(params.searchTerms)

  console.log(
    `[fda] ${quarters.length} quarter(s) to fetch in parallel` +
    ` | ${params.fromDate} → ${params.toDate}` +
    `${apiKey ? ' (authenticated)' : ' (anonymous — 1k/day cap)'}` +
    `${termClause ? ` | terms: ${termClause}` : ''}`
  )

  // Fetch all quarters simultaneously — one bad quarter does not abort others
  const settled = await Promise.allSettled(
    quarters.map(q => fetchQuarter(q.from, q.to, termClause, apiKey))
  )

  const allItems:    ScrapedFsn[] = []
  const allWarnings: string[]     = []

  for (let i = 0; i < settled.length; i++) {
    const q = quarters[i]
    const r = settled[i]
    if (r.status === 'fulfilled') {
      console.log(`[fda] Quarter ${q.from}→${q.to}: ${r.value.items.length} records${r.value.warnings.length ? ` (${r.value.warnings.length} warning(s))` : ''}`)
      allItems.push(...r.value.items)
      allWarnings.push(...r.value.warnings)
    } else {
      const msg = `FDA MAUDE: quarter ${q.from}–${q.to} failed — ${String(r.reason)}. Results for this period may be incomplete.`
      console.warn(`[fda] ${msg}`)
      allWarnings.push(msg)
    }
  }

  console.log(`[fda] Total before dedup: ${allItems.length} records across ${quarters.length} quarter(s)`)
  const deduped = dedup(allItems)
  console.log(`[fda] Total after dedup: ${deduped.length} records${allWarnings.length ? ` (${allWarnings.length} warning(s))` : ''}`)

  return { items: deduped, warnings: allWarnings }
}

// ─── Quarter splitter ─────────────────────────────────────────────────────────

// Splits [fromDate, toDate] into 3-month chunks fetched in parallel.
// A range shorter than 3 months returns a single chunk.
function splitIntoQuarters(fromDate: string, toDate: string): Array<{ from: string; to: string }> {
  const quarters: Array<{ from: string; to: string }> = []
  let cursor = new Date(fromDate + 'T00:00:00.000Z')
  const end  = new Date(toDate   + 'T00:00:00.000Z')

  while (cursor <= end) {
    const chunkEnd = new Date(cursor)
    chunkEnd.setUTCMonth(chunkEnd.getUTCMonth() + 3)
    chunkEnd.setUTCDate(chunkEnd.getUTCDate() - 1)

    const actualTo = chunkEnd > end ? end : chunkEnd
    quarters.push({
      from: cursor.toISOString().slice(0, 10),
      to:   actualTo.toISOString().slice(0, 10),
    })

    cursor = new Date(actualTo)
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return quarters
}

// ─── Single-quarter fetch ─────────────────────────────────────────────────────

// Paginates through one date range up to MAX_ITEMS. Called once per quarter.
async function fetchQuarter(
  fromDate:    string,
  toDate:      string,
  termClause:  string,
  apiKey:      string | undefined,
): Promise<ScraperResult> {
  const from = fromDate.replace(/-/g, '')
  const to   = toDate.replace(/-/g, '')

  const dateClause   = `date_received:[${from}+TO+${to}]`
  const searchClause = termClause ? `${dateClause}+AND+${termClause}` : dateClause

  const items: ScrapedFsn[] = []
  const warnings: string[]  = []
  let skip = 0

  while (true) {
    const qs = [
      `search=${searchClause}`,
      `limit=${RESULTS_PER_PAGE}`,
      `skip=${skip}`,
      apiKey ? `api_key=${apiKey}` : '',
    ].filter(Boolean).join('&')

    const url  = `${BASE_URL}?${qs}`
    console.log(`[fda] ${fromDate}→${toDate} skip=${skip}: fetching`)
    const data = await fetchPage(url)

    if (!data) break

    if (data.error) {
      if (data.error.code === 'NOT_FOUND') {
        console.log(`[fda] ${fromDate}→${toDate}: no results (openFDA NOT_FOUND)`)
      } else {
        console.error(`[fda] ${fromDate}→${toDate}: API error ${data.error.code} — ${data.error.message}`)
      }
      break
    }

    const pageResults = data.results ?? []
    const total       = data.meta?.results?.total ?? 0

    if (pageResults.length === 0) break

    console.log(`[fda] ${fromDate}→${toDate} skip=${skip}: ${pageResults.length} records (${total} total in quarter)`)

    for (const r of pageResults) {
      if (items.length >= MAX_ITEMS) break
      items.push(mapMaudeRecord(r))
    }

    if (items.length >= MAX_ITEMS) {
      const gap = total - items.length
      const msg =
        `FDA MAUDE: item cap reached (${MAX_ITEMS.toLocaleString()} of ` +
        `${total.toLocaleString()} records retrieved for ${fromDate}–${toDate}). ` +
        `${gap.toLocaleString()} records not fetched. ` +
        `Pass searchTerms to narrow the query, or use the openFDA bulk download for full coverage: ` +
        `https://open.fda.gov/apis/device/event/download/`
      console.warn(`[fda] ${msg}`)
      warnings.push(msg)
      break
    }

    skip += RESULTS_PER_PAGE
    if (pageResults.length < RESULTS_PER_PAGE) break

    if (skip > MAX_SKIP) {
      const gap = total - items.length
      const msg =
        `FDA MAUDE: pagination cap reached (${items.length.toLocaleString()} of ` +
        `${total.toLocaleString()} records retrieved for ${fromDate}–${toDate}). ` +
        `${gap.toLocaleString()} records not retrieved. ` +
        `Use the openFDA bulk download for full coverage: https://open.fda.gov/apis/device/event/download/`
      console.warn(`[fda] ${msg}`)
      warnings.push(msg)
      break
    }

    await new Promise(r => setTimeout(r, PAGE_DELAY_MS))
  }

  return { items, warnings }
}

// ─── Field mapping ────────────────────────────────────────────────────────────

function mapMaudeRecord(r: MaudeRecord): ScrapedFsn {
  const device      = r.device?.[0]
  const brandName   = device?.brand_name?.trim()
  const genericName = device?.generic_name?.trim()
  const deviceLabel = brandName || genericName || 'Medical Device'
  const eventType   = r.event_type ?? 'MDR'

  const manufacturer =
    r.manufacturer_name?.trim() ||
    device?.manufacturer_d_name?.trim() ||
    null

  const narrativeTexts = (r.mdr_text ?? [])
    .map(t => t.text?.trim())
    .filter(Boolean)
    .join('\n\n')

  const problems = (r.product_problems ?? []).join(', ')

  const rawParts = [
    `Event type: ${eventType}`,
    problems  ? `Product problems: ${problems}` : '',
    narrativeTexts,
  ].filter(Boolean)

  // openFDA does not expose the internal mdrfoi__id needed for the MAUDE detail URL.
  // Link to the openFDA API record instead — directly queryable.
  const reportNumber = r.report_number ?? ''
  const sourceUrl = reportNumber
    ? `https://api.fda.gov/device/event.json?search=report_number.exact:%22${encodeURIComponent(reportNumber)}%22&limit=1`
    : BASE_URL

  const fsn_date = formatFdaDate(r.date_received ?? r.date_of_event ?? null)

  return {
    external_id:  reportNumber || `maude-${r.mdr_report_key ?? Math.random()}`,
    title:        `${deviceLabel} — ${eventType}`,
    manufacturer,
    product_name: brandName || genericName || null,
    fsn_date,
    source_url:   sourceUrl,
    raw_content:  sanitizeContent(rawParts.join('\n\n')),
    source_db:    'fda',
  }
}

// openFDA dates are YYYYMMDD — convert to YYYY-MM-DD
function formatFdaDate(raw: string | null): string | null {
  if (!raw || raw.length !== 8) return null
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
}

// ─── HTTP ─────────────────────────────────────────────────────────────────────

async function fetchPage(url: string): Promise<OpenFdaResponse | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } })
    if (!res.ok) {
      console.error(`[fda] HTTP ${res.status}`)
      return null
    }
    return res.json() as Promise<OpenFdaResponse>
  } catch (err) {
    console.error('[fda] Fetch error:', err)
    return null
  }
}

// ─── Lucene term clause ───────────────────────────────────────────────────────

// Builds an openFDA Lucene OR clause from the provided tokens, searching across
// the three most discriminating device identity fields.
// Tokens must be plain alphanumeric — special characters are stripped before use.
// Returns an empty string when tokens is empty/undefined (no narrowing applied).
//
// Example input:  ['CardioSense', 'Acme']
// Example output: (device.brand_name:CardioSense+OR+device.generic_name:CardioSense+OR+manufacturer_name:CardioSense+OR+device.brand_name:Acme+OR+device.generic_name:Acme+OR+manufacturer_name:Acme)
function buildTermClause(terms?: string[]): string {
  if (!terms || terms.length === 0) return ''
  const clauses = terms
    .map(t => t.replace(/[^a-zA-Z0-9]/g, ''))   // strip Lucene special chars
    .filter(t => t.length >= 3)                   // skip tokens too short to discriminate
    .flatMap(t => [
      `device.brand_name:${t}`,
      `device.generic_name:${t}`,
      `manufacturer_name:${t}`,
    ])
  if (clauses.length === 0) return ''
  return `(${clauses.join('+OR+')})`
}

// ─── Deduplication ────────────────────────────────────────────────────────────

function dedup(items: ScrapedFsn[]): ScrapedFsn[] {
  const seen = new Set<string>()
  return items.filter(item => {
    if (seen.has(item.external_id)) return false
    seen.add(item.external_id)
    return true
  })
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface MaudeRecord {
  report_number?:    string
  mdr_report_key?:   string
  event_type?:       string
  date_received?:    string   // YYYYMMDD
  date_of_event?:    string   // YYYYMMDD
  manufacturer_name?: string
  device?: Array<{
    brand_name?:          string
    generic_name?:        string
    manufacturer_d_name?: string
  }>
  mdr_text?: Array<{
    text_type_code?: string
    text?:           string
  }>
  product_problems?: string[]
}

interface OpenFdaResponse {
  meta?: {
    results?: { total?: number; limit?: number; skip?: number }
  }
  results?: MaudeRecord[]
  error?: { code?: string; message?: string }
}