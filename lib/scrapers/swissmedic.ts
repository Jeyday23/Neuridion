import type { ScrapedFsn, ScraperResult, ScraperParams } from './bfarm'
import { buildManufacturerSearchTerms } from '@/lib/search/manufacturer-terms'
import { sanitizeContent } from './sanitize'

const API_BASE   = 'https://fsca.swissmedic.ch/mep/api/publications'
const PUBLIC_BASE = 'https://fsca.swissmedic.ch/mep'
const MAX_PAGES  = 25
const MAX_ITEMS  = 2000
const UA = 'Mozilla/5.0 (compatible; Neuridion/1.0; +https://neuridion.eu)'

type MaybeString = string | null | undefined

interface SwissmedicDevice {
  handelsname?: MaybeString
  sn?: MaybeString
  lot?: MaybeString
  swVersion?: MaybeString
  model?: MaybeString
  beschreibungKlasse?: MaybeString
}

interface SwissmedicDocument {
  title?: MaybeString
  language?: MaybeString
  version?: MaybeString
}

interface SwissmedicPublication {
  publikationsDatum?: MaybeString
  swissmedicRef?: MaybeString
  hersteller?: MaybeString
  status?: MaybeString
  statusDatum?: MaybeString
  begruendung?: MaybeString
  devices?: SwissmedicDevice[]
  documents?: SwissmedicDocument[]
}

interface SwissmedicPage {
  content?: SwissmedicPublication[]
  totalPages?: number
  last?: boolean
}

export async function scrapeSwissmedic(params: ScraperParams): Promise<ScraperResult> {
  const warnings: string[] = []
  const items: ScrapedFsn[] = []

  const mfrTerms = params.profile
    ? buildManufacturerSearchTerms(params.profile.manufacturer, params.profile.device_name)
    : []

  let hitItemsCap = false

  for (let pageNumber = 0; pageNumber < MAX_PAGES; pageNumber++) {
    const page = await fetchPublicationPage(params, pageNumber)

    if (!page) {
      warnings.push(`Swissmedic: publication API request failed on page ${pageNumber}. Results may be incomplete.`)
      break
    }

    const publications = page.content ?? []
    const passed = publications.filter(p => isRelevantToProfile(p, mfrTerms))

    for (const publication of passed) {
      const item = toScrapedFsn(publication)
      if (item) items.push(item)
    }

    if (items.length >= MAX_ITEMS) {
      hitItemsCap = true
      break
    }

    if (page.last || pageNumber + 1 >= (page.totalPages ?? 1) || publications.length === 0) break
    if (pageNumber + 1 >= MAX_PAGES) {
      warnings.push(
        `Swissmedic: stopped after ${MAX_PAGES} API pages before reaching the final page. ` +
        `Results for ${params.fromDate} to ${params.toDate} may be incomplete.`,
      )
      break
    }
    await jitter(250, 600)
  }

  if (hitItemsCap) {
    warnings.push(
      `Swissmedic: result cap of ${MAX_ITEMS} items reached for ${params.fromDate} to ${params.toDate}. ` +
      (mfrTerms.length > 0
        ? `Manufacturer filter ${JSON.stringify(mfrTerms)} may be too broad. Try a more specific manufacturer name.`
        : `Use a narrower date range for complete results.`),
    )
  }

  // Validate dates client-side (API may return out-of-range items)
  const filtered = items.filter(item => {
    if (!item.fsn_date) return true  // keep items without dates
    return item.fsn_date >= params.fromDate && item.fsn_date <= params.toDate
  })

  const deduped = dedup(filtered)

  return { items: deduped, warnings }
}

function isRelevantToProfile(publication: SwissmedicPublication, terms: string[]): boolean {
  if (terms.length === 0) return true
  const haystack = [
    publication.hersteller,
    ...(publication.devices?.map(d => d.handelsname) ?? []),
    ...(publication.devices?.map(d => d.beschreibungKlasse) ?? []),
  ].filter(Boolean).join(' ').toLowerCase()
  return terms.some(term => haystack.includes(term))
}

async function fetchPublicationPage(
  params: { fromDate: string; toDate: string },
  pageNumber: number,
): Promise<SwissmedicPage | null> {
  const url = new URL(`${API_BASE}/search`)
  url.searchParams.set('pageNumber', String(pageNumber))
  url.searchParams.set('sortingProperty', 'PUBLICATION_DATE')
  url.searchParams.set('direction', 'DESC')
  url.searchParams.set('size', '100')

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fromDate: params.fromDate,
        toDate: params.toDate,
      }),
    })

    if (!res.ok) {
      console.error('[swissmedic]', `HTTP ${res.status} ${url}`)
      return null
    }

    return await res.json() as SwissmedicPage
  } catch (err) {
    console.error(`[swissmedic] Fetch error ${url}:`, err)
    return null
  }
}

function toScrapedFsn(publication: SwissmedicPublication): ScrapedFsn | null {
  const ref = publication.swissmedicRef?.trim()
  if (!ref) return null

  const devices = publication.devices ?? []
  const productName = joinUnique(devices.map(device => device.handelsname))
  const deviceDetails = devices.map(formatDevice).filter(Boolean)
  const documents = publication.documents ?? []
  const documentUrls = documents.map((_, index) => `${API_BASE}/${encodeURIComponent(ref)}/documents/${index}`)

  const titleParts = [
    productName,
    publication.hersteller?.trim(),
    publication.status ? `Swissmedic ${publication.status}` : 'Swissmedic FSCA',
  ].filter(Boolean)

  const rawParts = [
    `Swissmedic reference: ${ref}`,
    publication.status ? `Status: ${publication.status}` : '',
    publication.statusDatum ? `Status date: ${publication.statusDatum}` : '',
    publication.begruendung ? `Reason: ${publication.begruendung}` : '',
    deviceDetails.length ? `Devices:\n${deviceDetails.join('\n')}` : '',
    documentUrls.length ? `Documents:\n${documentUrls.join('\n')}` : '',
  ].filter(Boolean)

  return {
    external_id: ref,
    title: titleParts.join(' — ') || `Swissmedic FSCA ${ref}`,
    manufacturer: publication.hersteller?.trim() || null,
    product_name: productName || null,
    fsn_date: publication.publikationsDatum ?? publication.statusDatum ?? null,
    source_url: `${PUBLIC_BASE}/?search=${encodeURIComponent(ref)}`,
    raw_content: sanitizeContent(rawParts.join('\n\n')),
    source_db: 'swissmedic',
  }
}

function formatDevice(device: SwissmedicDevice): string {
  return [
    device.handelsname,
    device.beschreibungKlasse,
    device.model ? `model: ${device.model}` : '',
    device.lot ? `lot: ${device.lot}` : '',
    device.sn ? `serial: ${device.sn}` : '',
    device.swVersion ? `software: ${device.swVersion}` : '',
  ].filter(Boolean).join(' | ')
}

function joinUnique(values: MaybeString[]): string {
  const unique = [...new Set(values.map(value => value?.trim()).filter(Boolean) as string[])]
  return unique.join('; ')
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
  new Promise(resolve => setTimeout(resolve, minMs + Math.random() * (maxMs - minMs)))
