import { randomUUID } from 'crypto'
import { scraperResult, type ScrapedFsn, type ScraperResult } from './bfarm'
import { sanitizeContent } from './sanitize'
import { extractDeviceTerms, extractManufacturerTerms } from '@/lib/search/manufacturer-terms'

// openFDA device/event endpoint — no auth required, API key raises daily quota
// Docs: https://open.fda.gov/apis/device/event/
const BASE_URL         = 'https://api.fda.gov/device/event.json'

/** Strip api_key query param from URLs before they appear in logs or error messages. */
function redactUrl(url: string): string {
  return url.replace(/([?&])api_key=[^&]*/g, '$1api_key=REDACTED')
}

function safeFetchError(err: unknown, timedOut: boolean): string {
  if (timedOut) return 'request timed out after 30000ms'
  const raw = err instanceof Error ? `${err.name}: ${err.message}` : 'Network error'
  return redactUrl(raw).replace(/\s+/g, ' ').slice(0, 240)
}
const RESULTS_PER_PAGE = 1000           // API max per request
const MAX_SKIP         = 25000          // API hard limit: skip + limit ≤ 26000
const CERTIFIABLE_RANGE_LIMIT = MAX_SKIP + RESULTS_PER_PAGE
const PAGE_DELAY_MS    = 400            // ~150 req/min — well under 240 RPM limit
const UA = 'Mozilla/5.0 (compatible; Neuridion/1.0; +https://neuridion.eu)'

export async function scrapeFdaMaude(params: {
  fromDate:     string
  toDate:       string
  searchTerms?: string[]
  profile?:     { manufacturer: string; device_name: string }
  signal?:      AbortSignal
}): Promise<ScraperResult> {
  const apiKey    = process.env.OPENFDA_API_KEY
  const quarters  = splitIntoQuarters(params.fromDate, params.toDate)
  const termClause = buildTermClause(params.searchTerms, params.profile)
  const preferredDeviceTerms = extractDeviceTerms(params.profile?.device_name ?? '')

  // Fetch all quarters simultaneously — one bad quarter does not abort others
  const settled = await Promise.allSettled(
    quarters.map(q => fetchQuarter(
      q.from,
      q.to,
      termClause,
      apiKey,
      preferredDeviceTerms,
      0,
      params.signal,
    ))
  )

  const allItems:    ScrapedFsn[] = []
  const allWarnings: string[]     = []

  for (let i = 0; i < settled.length; i++) {
    const q = quarters[i]
    const r = settled[i]
    if (r.status === 'fulfilled') {
      allItems.push(...r.value.items)
      allWarnings.push(...r.value.warnings)
    } else {
      const reason = redactUrl(String(r.reason))
      const msg = `FDA MAUDE: quarter ${q.from}–${q.to} failed — ${reason}. Results for this period may be incomplete.`
      console.error('[fda]', msg)
      allWarnings.push(msg)
    }
  }

  const deduped = dedup(allItems)

  return scraperResult(deduped, allWarnings, {
    failed: settled.length > 0 && settled.every(result => result.status === 'rejected'),
  })
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

const MAX_SPLIT_DEPTH = 10

// Paginates through one date range. If the range is too broad to certify via
// the interactive API, it recursively splits by date until each subrange can be
// fetched completely. This avoids the old "first N rows" cap for high-volume
// products such as MiniMed while still refusing to certify genuinely incomplete
// coverage.
async function fetchQuarter(
  fromDate:    string,
  toDate:      string,
  termClause:  string,
  apiKey:      string | undefined,
  preferredDeviceTerms: string[],
  depth:       number = 0,
  signal?:      AbortSignal,
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

    const url = `${BASE_URL}?${qs}`
    let result = await fetchPageWithRetry(url, 3, signal)

    // A stale/revoked optional key must not take the public openFDA endpoint
    // down with it. Retry once without credentials before declaring data loss.
    const authCode = !result.ok && !result.retriable ? result.data?.error?.code : undefined
    if (apiKey && (authCode === '401' || authCode === '403')) {
      const publicQs = [
        `search=${searchClause}`,
        `limit=${RESULTS_PER_PAGE}`,
        `skip=${skip}`,
      ].join('&')
      console.error(`[fda] configured API key was rejected (${authCode}); retrying public endpoint`)
      result = await fetchPageWithRetry(`${BASE_URL}?${publicQs}`, 3, signal)
    }

    if (!result.ok && result.retriable) {
      warnings.push(
        `FDA MAUDE: page at skip=${skip} failed after 3 retries for ${fromDate}–${toDate}. Some results may be missing.`
      )
      break
    }

    const data = result.data

    if (data.error) {
      if (data.error.code === 'NOT_FOUND') {
        // no results for this date range
      } else {
        const code = data.error.code ?? 'unknown'
        const msg = `FDA MAUDE: API error ${code} for ${fromDate}–${toDate}. Results for this period are unavailable.`
        console.error('[fda]', msg)
        warnings.push(msg)
      }
      break
    }

    const pageResults = data.results ?? []
    const total       = data.meta?.results?.total ?? 0

    if (pageResults.length === 0) break

    if (skip === 0 && total > CERTIFIABLE_RANGE_LIMIT) {
      const midDate = midpoint(fromDate, toDate)
      if (midDate && depth < MAX_SPLIT_DEPTH) {
        console.error(
          `[fda] Adaptive split: ${fromDate}–${toDate} ` +
          `(${total.toLocaleString()} total) → splitting at ${midDate} ` +
          `(depth=${depth + 1})`,
        )
        const [firstHalf, secondHalf] = await Promise.all([
          fetchQuarter(fromDate, midDate, termClause, apiKey, preferredDeviceTerms, depth + 1, signal),
          fetchQuarter(nextDay(midDate), toDate, termClause, apiKey, preferredDeviceTerms, depth + 1, signal),
        ])
        return scraperResult(
          dedup([...firstHalf.items, ...secondHalf.items]),
          [...warnings, ...firstHalf.warnings, ...secondHalf.warnings],
        )
      }

      const gap = Math.max(total - pageResults.length, 0)
      const msg =
        `FDA MAUDE: interactive-search date range remains too broad ` +
        `(${pageResults.length.toLocaleString()} of ${total.toLocaleString()} ` +
        `records retrieved for ${fromDate}–${toDate}). ` +
        `${gap.toLocaleString()} records not fetched. ` +
        `Use the openFDA bulk download for full coverage: ` +
        `https://open.fda.gov/apis/device/event/download/`
      console.error('[fda]', msg)
      warnings.push(msg)
      break
    }

    for (const r of pageResults) items.push(mapMaudeRecord(r, preferredDeviceTerms))
    if (items.length >= total) break

    skip += RESULTS_PER_PAGE
    if (pageResults.length < RESULTS_PER_PAGE) break

    if (skip > MAX_SKIP) {
      if (total > CERTIFIABLE_RANGE_LIMIT && depth < MAX_SPLIT_DEPTH) {
        const midDate = midpoint(fromDate, toDate)
        if (midDate) {
          console.error(`[fda] Adaptive split: ${fromDate}–${toDate} (${total.toLocaleString()} total) → splitting at ${midDate} (depth=${depth + 1})`)
          const [firstHalf, secondHalf] = await Promise.all([
            fetchQuarter(fromDate, midDate, termClause, apiKey, preferredDeviceTerms, depth + 1, signal),
            fetchQuarter(nextDay(midDate), toDate, termClause, apiKey, preferredDeviceTerms, depth + 1, signal),
          ])
          const combined = dedup([...items, ...firstHalf.items, ...secondHalf.items])
          return scraperResult(
            combined,
            [...warnings, ...firstHalf.warnings, ...secondHalf.warnings],
          )
        }
      }
      const gap = total - items.length
      const msg =
        `FDA MAUDE: pagination cap reached (${items.length.toLocaleString()} of ` +
        `${total.toLocaleString()} records retrieved for ${fromDate}–${toDate}). ` +
        `${gap.toLocaleString()} records not retrieved. ` +
        `Use the openFDA bulk download for full coverage: https://open.fda.gov/apis/device/event/download/`
      console.error('[fda]', msg)
      warnings.push(msg)
      break
    }

    await new Promise(r => setTimeout(r, PAGE_DELAY_MS))
  }

  return scraperResult(items, warnings)
}

// ─── Field mapping ────────────────────────────────────────────────────────────

function normalizeDeviceText(value: string | undefined): string {
  return (value ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
}

function selectProfileDevice(
  devices: MaudeRecord['device'],
  preferredTerms: string[],
): NonNullable<MaudeRecord['device']>[number] | undefined {
  if (!devices?.length || preferredTerms.length === 0) return devices?.[0]
  const normalizedTerms = preferredTerms.map(normalizeDeviceText).filter(Boolean)

  return devices.reduce((best, candidate) => {
    const score = normalizedTerms.filter(term => {
      const hay = normalizeDeviceText(
        `${candidate.brand_name ?? ''} ${candidate.generic_name ?? ''} ${candidate.manufacturer_d_name ?? ''}`,
      )
      return hay.includes(term)
    }).length
    if (score > best.score) return { device: candidate, score }
    return best
  }, { device: devices[0], score: -1 }).device
}

function mapMaudeRecord(r: MaudeRecord, preferredDeviceTerms: string[] = []): ScrapedFsn {
  const device      = selectProfileDevice(r.device, preferredDeviceTerms)
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
    external_id:  reportNumber || `maude-${r.mdr_report_key ?? randomUUID()}`,
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

type FetchResult =
  | { ok: true; data: OpenFdaResponse }
  | { ok: false; retriable: false; data: OpenFdaResponse }
  | { ok: false; retriable: true; error: string }

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer)
      reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'))
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

async function fetchPageWithRetry(url: string, maxAttempts = 3, signal?: AbortSignal): Promise<FetchResult> {
  const backoffs = [1000, 3000, 9000]
  let lastError = ''

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const controller = new AbortController()
    const abortFromParent = () => controller.abort(signal?.reason)
    if (signal?.aborted) controller.abort(signal.reason)
    else signal?.addEventListener('abort', abortFromParent, { once: true })
    const timeout = setTimeout(() => controller.abort(), 30_000)
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: controller.signal })

      if (res.ok) {
        if (attempt > 0) {
          console.error(`[fda] request recovered on attempt ${attempt + 1}/${maxAttempts} after ${lastError}`)
        }
        const data = await res.json() as OpenFdaResponse
        return { ok: true, data }
      }

      if (res.status === 404) {
        if (attempt > 0) {
          console.error(`[fda] request recovered on attempt ${attempt + 1}/${maxAttempts} after ${lastError}; no matching records`)
        }
        const data = await res.json().catch(() => ({ error: { code: 'NOT_FOUND', message: 'No results' } })) as OpenFdaResponse
        return { ok: false, retriable: false, data }
      }

      if (res.status === 429) {
        const retryAfter = Math.min(
          parseInt(res.headers.get('Retry-After') ?? '0', 10) * 1000 || backoffs[attempt],
          60_000,
        )
        lastError = `HTTP 429 (rate limited)`
        if (attempt < maxAttempts - 1) {
          console.error(`[fda] 429 on attempt ${attempt + 1}/${maxAttempts} for ${redactUrl(url)}, waiting ${retryAfter}ms`)
          await wait(retryAfter, signal)
          continue
        }
      } else if (res.status >= 500) {
        lastError = `HTTP ${res.status}`
        if (attempt < maxAttempts - 1) {
          console.error(`[fda] ${res.status} on attempt ${attempt + 1}/${maxAttempts} for ${redactUrl(url)}, retrying in ${backoffs[attempt]}ms`)
          await wait(backoffs[attempt], signal)
          continue
        }
      } else {
        lastError = `HTTP ${res.status}`
        const data = await res.json().catch(() => ({
          error: { code: String(res.status), message: lastError },
        })) as OpenFdaResponse
        return { ok: false, retriable: false, data }
      }
    } catch (err) {
      if (signal?.aborted) throw (signal.reason ?? err)
      lastError = safeFetchError(err, controller.signal.aborted)
      if (attempt < maxAttempts - 1) {
        console.error(`[fda] transient fetch error on attempt ${attempt + 1}/${maxAttempts}: ${lastError}; retrying in ${backoffs[attempt]}ms for ${redactUrl(url)}`)
        await wait(backoffs[attempt], signal)
        continue
      }
    } finally {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', abortFromParent)
    }
  }

  return { ok: false, retriable: true, error: lastError }
}

// ─── Date helpers for adaptive splitting ─────────────────────────────────────

function midpoint(from: string, to: string): string | null {
  const a = new Date(from + 'T00:00:00.000Z')
  const b = new Date(to   + 'T00:00:00.000Z')
  const mid = new Date(a.getTime() + (b.getTime() - a.getTime()) / 2)
  const result = mid.toISOString().slice(0, 10)
  if (result === from || result === to) return null
  return result
}

function nextDay(date: string): string {
  const d = new Date(date + 'T00:00:00.000Z')
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

// ─── Lucene term clause ───────────────────────────────────────────────────────

const LUCENE_KEYWORDS = new Set(['AND', 'OR', 'NOT', 'TO'])

function sanitizeLucene(t: string): string {
  const s = t
    .replace(/[+&|!(){}[\]^"~*?:\\/]/g, '')
    .replace(/^-+|-+$/g, '')
    .replace(/[[\]{}]/g, '')
  if (LUCENE_KEYWORDS.has(s.toUpperCase())) return ''
  return s
}

// Builds an openFDA Lucene clause. Uses device.manufacturer_d_name (the actual
// device manufacturer) rather than manufacturer_name (which is the MDR reporter).
// When profile is provided and manufacturer/device terms can be distinguished,
// uses AND grouping to dramatically reduce result volume for large manufacturers.
function groupDeviceTokens(tokens: string[]): string[][] {
  const groups: string[][] = []
  for (const token of tokens) {
    const group = groups.find(candidate => candidate.some(existing =>
      existing.startsWith(token) || token.startsWith(existing),
    ))
    if (group) group.push(token)
    else groups.push([token])
  }
  return groups
}

export function buildTermClause(
  terms?: string[],
  profile?: { manufacturer: string; device_name: string },
): string {
  if (!terms || terms.length === 0) return ''

  const clean = terms
    .map(sanitizeLucene)
    .filter(t => t.length >= 3 && /[a-zA-Z0-9]/.test(t))
  if (clean.length === 0) return ''

  if (profile?.manufacturer) {
    const mfrTokens = extractManufacturerTerms(profile.manufacturer)
      .map(sanitizeLucene)
      .filter(t => t.length >= 3)
    const devTokens = clean.filter(t => !mfrTokens.includes(t))

    if (mfrTokens.length > 0 && devTokens.length > 0) {
      const mfrClauses = mfrTokens.map(t => `device.manufacturer_d_name:${t}`)
      const deviceGroups = groupDeviceTokens(devTokens).map(group => {
        const clauses = group.flatMap(t => [
          `device.brand_name:${t}`,
          `device.generic_name:${t}`,
        ])
        return `(${clauses.join('+OR+')})`
      })
      return `(${mfrClauses.join('+OR+')})+AND+${deviceGroups.join('+AND+')}`
    }
  }

  const clauses = clean.flatMap(t => [
    `device.brand_name:${t}`,
    `device.generic_name:${t}`,
    `device.manufacturer_d_name:${t}`,
  ])
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
