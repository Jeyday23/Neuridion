import { createHash } from 'crypto'
import ExcelJS from 'exceljs'
import type { ScrapedFsn, ScraperParams, ScraperResult } from './bfarm'
import { sanitizeContent } from './sanitize'
import { fetchWithRetry } from './fetch-with-retry'

const FILECAMP_URL = 'https://mhra-gov.filecamp.com/s/d/9g5cLjjFatXruS5U'
const DOWNLOAD_TIMEOUT_MS = 20_000
const MAX_ITEMS = 500
const UA = 'Mozilla/5.0 (compatible; Neuridion/1.0; +https://neuridion.eu)'

interface ColumnMap {
  manufacturer: number
  brand: number
  dateOrRefOnFsn: number
  deviceDescription: number
  model: number
  haloReference: number
  dateAddedToGovUk: number
  mhraReference: number
  comment: number
}

function getCellString(row: ExcelJS.Row, col: number): string {
  if (col <= 0) return ''
  const v = row.getCell(col).value
  if (v === null || v === undefined) return ''
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (typeof v === 'object') {
    if ('richText' in v) {
      return (v.richText as Array<{ text: string }>).map(r => r.text).join('').trim()
    }
    if ('text' in v) return String((v as { text: unknown }).text).trim()
    if ('result' in v) return String((v as { result: unknown }).result ?? '').trim()
  }
  return String(v).trim()
}

function getCellDate(row: ExcelJS.Row, col: number): string | null {
  if (col <= 0) return null
  const v = row.getCell(col).value
  if (v instanceof Date) {
    return isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10)
  }
  if (typeof v === 'number') {
    const d = excelSerialToDate(v)
    return d ? d.toISOString().slice(0, 10) : null
  }
  if (typeof v === 'string') {
    const trimmed = v.trim()
    if (!trimmed) return null
    const parsed = new Date(trimmed)
    if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10)
    const ddmmyyyy = trimmed.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/)
    if (ddmmyyyy) {
      const d = new Date(`${ddmmyyyy[3]}-${ddmmyyyy[2].padStart(2, '0')}-${ddmmyyyy[1].padStart(2, '0')}T00:00:00Z`)
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
    }
  }
  return null
}

function excelSerialToDate(serial: number): Date | null {
  if (serial < 1) return null
  const msPerDay = 86_400_000
  const base = Date.UTC(1900, 0, 1)
  const adjustment = serial >= 60 ? -1 : 0
  const ms = base + (serial - 1 + adjustment) * msPerDay
  const d = new Date(ms)
  return isNaN(d.getTime()) ? null : d
}

function shortHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 12)
}

export function buildMhraExternalId(
  mhraRef: string,
  haloRef: string,
  sheetYear: string,
  manufacturer: string,
  brand: string,
  deviceDescription: string,
  model: string,
  dateAdded: string,
  dateOrRefOnFsn: string,
  comment: string,
): string {
  const prefix = mhraRef || haloRef || sheetYear
  const fingerprint = shortHash([
    manufacturer, brand, deviceDescription, model,
    dateAdded, mhraRef, haloRef, comment, dateOrRefOnFsn,
  ].join('|'))
  return `mhra-excel:${prefix}:${fingerprint}`
}

export function buildMhraTitle(
  brand: string,
  device: string,
  model: string,
  manufacturer: string,
): string {
  const parts = [brand, device, model].filter(Boolean)
  if (parts.length === 0 && manufacturer) parts.push(manufacturer)
  return parts.join(' — ').slice(0, 120) || 'Unknown MHRA FSN'
}

function sheetOverlapsDateRange(sheetName: string, fromYear: number, toYear: number): boolean {
  const year = parseInt(sheetName, 10)
  if (isNaN(year)) return true
  return year >= fromYear && year <= toYear
}

export function detectColumns(sheet: ExcelJS.Worksheet): { headerRow: number; columns: ColumnMap } | null {
  const maxScan = Math.min(5, sheet.rowCount)

  for (let r = 1; r <= maxScan; r++) {
    const row = sheet.getRow(r)
    const cells = new Map<number, string>()

    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      cells.set(colNumber, String(cell.value ?? '').toLowerCase().trim())
    })

    let mfrCol = 0
    let brandCol = 0
    let dateOrRefCol = 0
    let deviceCol = 0
    let modelCol = 0
    let haloCol = 0
    let dateAddedCol = 0
    let mhraRefCol = 0
    let commentCol = 0

    for (const [col, text] of cells) {
      if (text === 'manufacturer') mfrCol = col
      else if (text === 'brand') brandCol = col
      else if (text.includes('date or reference on fsn') || text.includes('date or ref on fsn')) dateOrRefCol = col
      else if (text === 'device description') deviceCol = col
      else if (text === 'model') modelCol = col
      else if (text.includes('halo ref')) haloCol = col
      else if (text.includes('date added to gov') || text === 'date added') dateAddedCol = col
      else if (text === 'mhra reference' || text.includes('mhra ref')) mhraRefCol = col
      else if (text === 'comment' || text === 'comments') commentCol = col
    }

    if (mfrCol > 0 && brandCol > 0 && dateAddedCol > 0) {
      return {
        headerRow: r,
        columns: {
          manufacturer: mfrCol,
          brand: brandCol,
          dateOrRefOnFsn: dateOrRefCol,
          deviceDescription: deviceCol,
          model: modelCol,
          haloReference: haloCol,
          dateAddedToGovUk: dateAddedCol,
          mhraReference: mhraRefCol,
          comment: commentCol,
        },
      }
    }
  }

  return null
}

export async function parseMhraExcelBuffer(
  buffer: Uint8Array,
  fromDate: string,
  toDate: string,
): Promise<{ items: ScrapedFsn[]; warnings: string[] }> {
  const workbook = new ExcelJS.Workbook()
  // @ts-expect-error ExcelJS 4.4.0 types predate TypeScript 5.7 generic Buffer
  await workbook.xlsx.load(buffer)

  const items: ScrapedFsn[] = []
  const warnings: string[] = []
  const fromYear = parseInt(fromDate.slice(0, 4), 10)
  const toYear = parseInt(toDate.slice(0, 4), 10)
  let sheetsWithHeaders = 0

  workbook.eachSheet((sheet) => {
    if (!sheetOverlapsDateRange(sheet.name, fromYear, toYear)) return

    const detected = detectColumns(sheet)
    if (!detected) {
      warnings.push(`MHRA Excel: sheet "${sheet.name}" — could not detect header row, skipped`)
      return
    }

    sheetsWithHeaders++
    const { headerRow, columns } = detected
    let skippedNoDate = 0
    let capHit = false

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber <= headerRow) return
      if (items.length >= MAX_ITEMS) { capHit = true; return }

      const manufacturer = getCellString(row, columns.manufacturer)
      const brand = getCellString(row, columns.brand)
      if (!manufacturer && !brand) return

      const dateOrRefOnFsn = getCellString(row, columns.dateOrRefOnFsn)
      const deviceDescription = getCellString(row, columns.deviceDescription)
      const model = getCellString(row, columns.model)
      const haloReference = getCellString(row, columns.haloReference)
      const mhraReference = getCellString(row, columns.mhraReference)
      const comment = getCellString(row, columns.comment)

      const dateAdded = getCellDate(row, columns.dateAddedToGovUk)

      if (!dateAdded) {
        skippedNoDate++
        return
      }
      if (dateAdded < fromDate || dateAdded > toDate) {
        return
      }

      const title = buildMhraTitle(brand, deviceDescription, model, manufacturer)
      const externalId = buildMhraExternalId(
        mhraReference, haloReference, sheet.name,
        manufacturer, brand, deviceDescription, model,
        dateAdded, dateOrRefOnFsn, comment,
      )

      const rawParts = [
        brand && `Brand: ${brand}`,
        manufacturer && `Manufacturer: ${manufacturer}`,
        deviceDescription && `Device: ${deviceDescription}`,
        model && `Model: ${model}`,
        dateOrRefOnFsn && `FSN date/reference: ${dateOrRefOnFsn}`,
        mhraReference && `MHRA reference: ${mhraReference}`,
        haloReference && `Halo: ${haloReference}`,
        comment && `Comment: ${comment}`,
      ].filter(Boolean) as string[]

      items.push({
        external_id: externalId,
        title,
        manufacturer: manufacturer || null,
        product_name: deviceDescription || null,
        fsn_date: dateAdded,
        source_url: 'https://www.gov.uk/drug-device-alerts',
        raw_content: sanitizeContent(rawParts.join('\n')),
        source_db: 'mhra',
      })
    })

    if (skippedNoDate > 0) {
      warnings.push(`MHRA Excel: sheet "${sheet.name}" — ${skippedNoDate} row(s) skipped, missing "Date added to gov.uk"`)
    }
    if (capHit) {
      warnings.push(`MHRA Excel: result cap hit at ${MAX_ITEMS} items`)
    }
  })

  if (sheetsWithHeaders === 0) {
    throw new Error('MHRA Excel: no sheets with recognized headers — schema may have changed')
  }

  return { items, warnings }
}

export async function downloadMhraExcel(): Promise<Uint8Array> {
  const url = process.env.MHRA_EXCEL_URL || FILECAMP_URL

  const res = await fetchWithRetry(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/octet-stream, */*',
    },
  }, { timeoutMs: DOWNLOAD_TIMEOUT_MS, maxAttempts: 1 })

  if (!res.ok) {
    throw new Error(`MHRA Excel download failed: HTTP ${res.status}`)
  }

  const contentType = res.headers.get('content-type') ?? ''
  if (contentType.includes('text/html')) {
    throw new Error('MHRA Excel URL returned HTML instead of spreadsheet — check MHRA_EXCEL_URL')
  }

  const arrayBuf = await res.arrayBuffer()
  if (arrayBuf.byteLength < 100) {
    throw new Error(`MHRA Excel download too small (${arrayBuf.byteLength} bytes) — likely not a valid spreadsheet`)
  }

  return new Uint8Array(arrayBuf)
}

export async function scrapeMhraExcel(params: ScraperParams): Promise<ScraperResult> {
  const buffer = await downloadMhraExcel()
  return await parseMhraExcelBuffer(buffer, params.fromDate, params.toDate)
}
