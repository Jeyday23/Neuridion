import type { ScrapedFsn, ScraperResult, ScraperParams } from './bfarm'
import { buildManufacturerSearchTerms } from '@/lib/search/manufacturer-terms'

// openFDA device/event endpoint — no auth required, API key raises daily quota
// Docs: https://open.fda.gov/apis/device/event/
const BASE_URL        = 'https://api.fda.gov/device/event.json'
const RESULTS_PER_PAGE = 1000           // API max per request
const MAX_SKIP        = 25000           // API hard limit: skip + limit ≤ 26000
const PAGE_DELAY_MS   = 400            // ~150 req/min — well under 240 RPM limit
const BROAD_FILTER_THRESHOLD = 10_000  // warn if manufacturer filter still returns this many
const UA = 'Mozilla/5.0 (compatible; KodexMedical/1.0; +https://kodex.medical)'

function buildMfrFilter(terms: string[]): string {
  if (terms.length === 0) return ''
  const fieldSets = [
    'device.manufacturer_d_name',
    'manufacturer_g1_name',
    'device.brand_name',
  ]
  const perField = (field: string) =>
    terms.map(t => `${field}:"${t}"`).join('+OR+')

  return '+AND+(' + fieldSets.map(f => `(${perField(f)})`).join('+OR+') + ')'
}

export async function scrapeFdaMaude(params: ScraperParams): Promise<ScraperResult> {
  const apiKey = process.env.OPENFDA_API_KEY

  // openFDA uses YYYYMMDD (no hyphens) in Lucene range queries
  const from = params.fromDate.replace(/-/g, '')
  const to   = params.toDate.replace(/-/g, '')

  const mfrTerms = params.profile
    ? buildManufacturerSearchTerms(params.profile.manufacturer, params.profile.device_name)
    : []

  const mfrFilter = buildMfrFilter(mfrTerms)

  if (mfrTerms.length > 0) {
    console.log(`[fda] Scraping with manufacturer filter: ${JSON.stringify(mfrTerms)} | date_received:[${from}+TO+${to}]${apiKey ? ' (authenticated)' : ' (anonymous — 1k/day cap)'}`)
  } else {
    console.log(`[fda] Scraping date_received:[${from}+TO+${to}]${apiKey ? ' (authenticated)' : ' (anonymous — 1k/day cap)'}`)
  }

  const items: ScrapedFsn[] = []
  const warnings: string[]  = []
  let skip = 0
  let warnedBroadFilter = false

  while (true) {
    // Build URL manually to preserve Lucene `+` syntax without double-encoding
    const qs = [
      `search=date_received:[${from}+TO+${to}]${mfrFilter}`,
      `limit=${RESULTS_PER_PAGE}`,
      `skip=${skip}`,
      apiKey ? `api_key=${apiKey}` : '',
    ].filter(Boolean).join('&')

    const url = `${BASE_URL}?${qs}`
    console.log(`[fda] Page skip=${skip}: fetching`)

    const data = await fetchPage(url)

    if (!data) break   // network error already logged

    // openFDA returns { error: { code, message } } for no-results or API errors
    if (data.error) {
      if (data.error.code === 'NOT_FOUND') {
        console.log(`[fda] No results in this date range (openFDA NOT_FOUND)`)
      } else {
        console.error(`[fda] API error: ${data.error.code} — ${data.error.message}`)
      }
      break
    }

    const pageResults = data.results ?? []
    const total       = data.meta?.results?.total ?? 0

    if (pageResults.length === 0) break

    console.log(`[fda] Page skip=${skip}: ${pageResults.length} records (${total} total in range)`)

    if (!warnedBroadFilter && skip === 0 && mfrTerms.length > 0 && total > BROAD_FILTER_THRESHOLD) {
      warnedBroadFilter = true
      console.warn(`[fda] WARNING: filtered query still returns ${total.toLocaleString()} records — manufacturer terms may be too broad: ${JSON.stringify(mfrTerms)}`)
    }

    for (const r of pageResults) {
      items.push(mapMaudeRecord(r))
    }

    // Advance pagination
    skip += RESULTS_PER_PAGE

    if (pageResults.length < RESULTS_PER_PAGE) break  // last page

    if (skip > MAX_SKIP) {
      const gap = total - items.length
      const msg =
        `FDA MAUDE: pagination cap reached (${items.length.toLocaleString()} of ` +
        `${total.toLocaleString()} records retrieved for ${params.fromDate}–${params.toDate}). ` +
        `${gap.toLocaleString()} records not retrieved. ` +
        `Use the openFDA bulk download for full coverage: https://open.fda.gov/apis/device/event/download/`
      console.warn(`[fda] ${msg}`)
      warnings.push(msg)
      break
    }

    await new Promise(r => setTimeout(r, PAGE_DELAY_MS))
  }

  const deduped = dedup(items)
  console.log(`[fda] Done: ${deduped.length} deduplicated records${warnings.length ? ` (${warnings.length} warning(s))` : ''}`)
  return { items: deduped, warnings }
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
    raw_content:  rawParts.join('\n\n'),
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
