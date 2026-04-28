import type { ScrapedFsn, ScraperResult } from './bfarm'

// Canonical English FSCA listing page — verify this URL against the live site
// before deploying. Swissmedic's AEM CMS may restructure paths without notice.
// EN listing confirmed at: https://www.swissmedic.ch/swissmedic/en/home/medical-devices/
//   market-surveillance/field-safety-corrective-actions-fsca.html
const LISTING_BASE  = 'https://www.swissmedic.ch'
const LISTING_PATH  = '/swissmedic/en/home/medical-devices/market-surveillance/field-safety-corrective-actions-fsca.html'
const DETAIL_CONCURRENCY = 2
const MAX_PAGES     = 30   // safety cap
const UA = 'Mozilla/5.0 (compatible; KodexMedical/1.0; +https://kodex.medical)'

export async function scrapeSwissmedic(params: { fromDate: string; toDate: string }): Promise<ScraperResult> {
  const fromDate = new Date(params.fromDate + 'T00:00:00.000Z')
  const toDate   = new Date(params.toDate   + 'T23:59:59.999Z')

  const listings: ScrapedFsn[] = []
  const warnings: string[]     = []
  let pageNum = 0
  let hitBoundary = false

  while (pageNum < MAX_PAGES && !hitBoundary) {
    // Swissmedic AEM pagination: ?page=N (0-indexed) or no param for first page
    const url = pageNum === 0
      ? `${LISTING_BASE}${LISTING_PATH}`
      : `${LISTING_BASE}${LISTING_PATH}?page=${pageNum}`

    console.log(`[swissmedic] Fetching listing page ${pageNum}: ${url}`)
    const html = await fetchHtml(url)

    if (!html) break

    const rows = parseListingRows(html, pageNum)

    if (rows.length === 0) {
      if (pageNum === 0) {
        const snippet = html.slice(0, 800).replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ')
        console.warn(`[swissmedic] No rows parsed from page 0. HTML snippet: ${snippet}`)
        const msg =
          `Swissmedic: zero rows parsed from listing page — HTML structure may have changed. ` +
          `Results for Swissmedic are incomplete. Verify the listing URL and table structure: ${LISTING_BASE}${LISTING_PATH}`
        console.warn(`[swissmedic] ${msg}`)
        warnings.push(msg)
      }
      console.log(`[swissmedic] Empty page ${pageNum}, stopping`)
      break
    }

    console.log(`[swissmedic] Page ${pageNum}: ${rows.length} rows`)

    for (const row of rows) {
      if (!row.date) continue

      if (row.date < fromDate) {
        console.log(`[swissmedic] Hit fromDate boundary at ${row.date.toISOString().slice(0, 10)}, stopping`)
        hitBoundary = true
        break
      }
      if (row.date > toDate) continue

      listings.push({
        external_id:  row.href || row.title,
        title:        row.title,
        manufacturer: row.manufacturer ?? null,
        product_name: row.productName  ?? null,
        fsn_date:     row.date.toISOString().slice(0, 10),
        source_url:   row.href.startsWith('http') ? row.href : `${LISTING_BASE}${row.href}`,
        raw_content:  [row.title, row.manufacturer, row.productName].filter(Boolean).join(' — '),
        source_db:    'swissmedic',
      })
    }

    // Stop if there's no "next page" signal and we got a partial page
    const hasNextPage = detectNextPage(html, pageNum)
    if (!hasNextPage) {
      console.log(`[swissmedic] No next page indicator found after page ${pageNum}`)
      break
    }

    pageNum++
    await jitter(400, 800)
  }

  console.log(`[swissmedic] Listing complete: ${listings.length} items — enriching detail pages`)

  const enriched = await enrichWithDetails(listings)
  const deduped  = dedup(enriched)
  console.log(`[swissmedic] Final: ${deduped.length} deduplicated items${warnings.length ? ` (${warnings.length} warning(s))` : ''}`)
  return { items: deduped, warnings }
}

// ─── Listing page parser ──────────────────────────────────────────────────────

interface ListingRow {
  date:         Date | null
  title:        string
  manufacturer: string | null
  productName:  string | null
  href:         string
}

function parseListingRows(html: string, pageNum: number): ListingRow[] {
  const rows: ListingRow[] = []

  // Swissmedic AEM renders content in a <table> inside the main content area.
  // Try multiple common AEM table patterns.
  const tbodyMatch =
    html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i) ??
    html.match(/<table[^>]*contenttable[^>]*>([\s\S]*?)<\/table>/i)

  if (!tbodyMatch) {
    // Fall back: look for any <tr> blocks that contain a DD.MM.YYYY date
    return parseFallbackRows(html)
  }

  const tbody = tbodyMatch[1]
  const trBlocks = tbody.split(/<tr[^>]*>/i).slice(1)

  for (const block of trBlocks) {
    const cells = extractCells(block)
    if (cells.length < 2) continue

    const row = parseRowCells(cells, block)
    if (row) rows.push(row)
  }

  if (rows.length === 0 && pageNum === 0) {
    return parseFallbackRows(html)
  }

  return rows
}

function parseFallbackRows(html: string): ListingRow[] {
  // Generic fallback: find any <tr> containing a DD.MM.YYYY date
  const rows: ListingRow[] = []
  const trBlocks = html.split(/<tr[^>]*>/i).slice(1)

  for (const block of trBlocks) {
    const cells = extractCells(block)
    const row   = parseRowCells(cells, block)
    if (row?.date) rows.push(row)
  }

  return rows
}

function extractCells(trHtml: string): string[] {
  return [...trHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
    .map(m => m[1])
}

function parseRowCells(cells: string[], rawBlock: string): ListingRow | null {
  // Find the date cell (DD.MM.YYYY)
  let date: Date | null = null
  for (const cell of cells) {
    const text = stripTags(cell).trim()
    const d    = parseSwissDate(text)
    if (d) { date = d; break }
  }

  // Find a link — look in the row block directly
  const hrefMatch = rawBlock.match(/href="([^"]+)"/i)
  const href      = hrefMatch ? hrefMatch[1] : ''

  // Extract link text as title, falling back to longest plain-text cell
  const linkTextMatch = rawBlock.match(/<a[^>]+href="[^"]+"[^>]*>([\s\S]*?)<\/a>/i)
  const linkText      = linkTextMatch ? stripTags(linkTextMatch[1]).trim() : ''

  // Non-date cells become manufacturer and product name candidates
  const textCells = cells
    .map(c => stripTags(c).trim())
    .filter(t => t && !/^\d{2}\.\d{2}\.\d{4}$/.test(t) && t.length > 2)

  const title        = linkText || textCells[0] || ''
  const manufacturer = textCells.find(t => t !== title) ?? null
  const productName  = textCells.find(t => t !== title && t !== manufacturer) ?? null

  if (!title && !href) return null

  return { date, title, manufacturer, productName, href }
}

function detectNextPage(html: string, currentPage: number): boolean {
  // Look for explicit next-page signals in the HTML
  const nextPagePatterns = [
    /rel="next"/i,
    /class="[^"]*next[^"]*"/i,
    new RegExp(`page=${currentPage + 1}`, 'i'),
    /&#x203A;|&rsaquo;|›/,   // › chevron typically used for "next"
  ]
  return nextPagePatterns.some(p => p.test(html))
}

// ─── Detail enrichment ────────────────────────────────────────────────────────

async function enrichWithDetails(items: ScrapedFsn[]): Promise<ScrapedFsn[]> {
  const result: ScrapedFsn[] = []

  for (let i = 0; i < items.length; i += DETAIL_CONCURRENCY) {
    const batch    = items.slice(i, i + DETAIL_CONCURRENCY)
    const enriched = await Promise.all(batch.map(enrichItem))
    result.push(...enriched)

    if (i + DETAIL_CONCURRENCY < items.length) {
      await jitter(400, 900)
    }
  }

  return result
}

async function enrichItem(item: ScrapedFsn): Promise<ScrapedFsn> {
  if (!item.source_url || item.source_url === LISTING_BASE) return item

  try {
    const html = await fetchHtml(item.source_url)
    if (!html) return item

    // Extract main content text — look for common AEM content containers
    const contentMatch =
      html.match(/<div[^>]+class="[^"]*parsys[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ??
      html.match(/<main[^>]*>([\s\S]*?)<\/main>/i) ??
      html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)

    if (!contentMatch) return item

    const text = stripTags(contentMatch[1]).replace(/\s+/g, ' ').trim().slice(0, 4000)
    if (!text) return item

    // Look for PDF links
    const pdfLinks = [...html.matchAll(/href="([^"]+\.pdf[^"]*)"/gi)]
      .map(m => m[1].startsWith('http') ? m[1] : `${LISTING_BASE}${m[1]}`)
      .slice(0, 3)

    const rawParts = [
      item.raw_content,
      text,
      pdfLinks.length ? `Documents: ${pdfLinks.join(', ')}` : '',
    ].filter(Boolean)

    return { ...item, raw_content: rawParts.join('\n\n') }
  } catch (err) {
    console.warn(`[swissmedic] Detail fetch failed for ${item.source_url}: ${String(err)}`)
    return item
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────────

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':      UA,
        'Accept':          'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })
    if (!res.ok) {
      console.warn(`[swissmedic] HTTP ${res.status} ${url}`)
      return null
    }
    return res.text()
  } catch (err) {
    console.error(`[swissmedic] Fetch error ${url}:`, err)
    return null
  }
}

function parseSwissDate(text: string): Date | null {
  const m = text.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  if (!m) return null
  return new Date(Date.UTC(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1])))
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, ' ').trim()
}

function dedup(items: ScrapedFsn[]): ScrapedFsn[] {
  const seen = new Set<string>()
  return items.filter(item => {
    if (seen.has(item.external_id)) return false
    seen.add(item.external_id)
    return true
  })
}

const jitter = (minMs: number, maxMs: number) =>
  new Promise(r => setTimeout(r, minMs + Math.random() * (maxMs - minMs)))
