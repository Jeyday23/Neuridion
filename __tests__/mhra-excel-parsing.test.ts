import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ExcelJS from 'exceljs'
import {
  parseMhraExcelBuffer,
  detectColumns,
  buildMhraExternalId,
  buildMhraTitle,
  downloadMhraExcel,
} from '@/lib/scrapers/mhra-excel'

const HEADERS = [
  'Manufacturer',
  'Brand',
  'Date or reference on FSN',
  'Device description',
  'Model',
  'Halo reference',
  'Date added to gov.uk',
  'MHRA reference',
  'Comment',
]

async function buildBuffer(
  sheets: Array<{ name: string; rows: unknown[][] }>,
): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook()
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name)
    for (const row of s.rows) {
      ws.addRow(row)
    }
  }
  const arrayBuf = await wb.xlsx.writeBuffer()
  return new Uint8Array(arrayBuf)
}

function makeRow(overrides: Partial<Record<string, unknown>> = {}): unknown[] {
  const defaults: Record<string, unknown> = {
    manufacturer: 'Medtronic',
    brand: 'Micra AV',
    dateOrRef: 'FSN-2026-001',
    device: 'Leadless Pacemaker',
    model: 'MC1AVR1',
    halo: '38140305',
    dateAdded: new Date('2026-04-15T00:00:00Z'),
    mhraRef: '2026/004/003/291/001',
    comment: 'Urgent field safety corrective action',
  }
  const merged = { ...defaults, ...overrides }
  return [
    merged.manufacturer,
    merged.brand,
    merged.dateOrRef,
    merged.device,
    merged.model,
    merged.halo,
    merged.dateAdded,
    merged.mhraRef,
    merged.comment,
  ]
}

describe('MHRA Excel parsing', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('parses normal sheet with correct field mapping', async () => {
    const buf = await buildBuffer([{
      name: '2026',
      rows: [HEADERS, makeRow()],
    }])

    const { items, warnings } = await parseMhraExcelBuffer(buf, '2026-01-01', '2026-12-31')

    expect(items).toHaveLength(1)
    const item = items[0]
    expect(item.manufacturer).toBe('Medtronic')
    expect(item.product_name).toBe('Leadless Pacemaker')
    expect(item.source_db).toBe('mhra')
    expect(item.source_url).toBe('https://www.gov.uk/drug-device-alerts')
    expect(warnings).toHaveLength(0)
  })

  it('filters items by date range using "Date added to gov.uk"', async () => {
    const buf = await buildBuffer([{
      name: '2026',
      rows: [
        HEADERS,
        makeRow({ dateAdded: new Date('2026-03-15T00:00:00Z') }),
        makeRow({ brand: 'In Range', dateAdded: new Date('2026-04-15T00:00:00Z') }),
        makeRow({ dateAdded: new Date('2026-06-15T00:00:00Z') }),
      ],
    }])

    const { items } = await parseMhraExcelBuffer(buf, '2026-04-01', '2026-05-31')

    expect(items).toHaveLength(1)
    expect(items[0].title).toContain('In Range')
  })

  it('uses "Date added to gov.uk" for fsn_date, NOT "Date or reference on FSN"', async () => {
    const buf = await buildBuffer([{
      name: '2026',
      rows: [
        HEADERS,
        makeRow({
          dateOrRef: '2026-01-01',
          dateAdded: new Date('2026-05-20T00:00:00Z'),
        }),
      ],
    }])

    const { items } = await parseMhraExcelBuffer(buf, '2026-01-01', '2026-12-31')

    expect(items[0].fsn_date).toBe('2026-05-20')
    expect(items[0].fsn_date).not.toBe('2026-01-01')
  })

  it('preserves "Date or reference on FSN" in raw_content verbatim', async () => {
    const buf = await buildBuffer([{
      name: '2026',
      rows: [
        HEADERS,
        makeRow({ dateOrRef: 'FSN-2026-URGENT-001' }),
      ],
    }])

    const { items } = await parseMhraExcelBuffer(buf, '2026-01-01', '2026-12-31')

    expect(items[0].raw_content).toContain('FSN date/reference: FSN-2026-URGENT-001')
  })

  it('uses an HTTPS FSN hyperlink as record-level provenance', async () => {
    const evidenceUrl = 'https://assets.publishing.service.gov.uk/media/fsn.pdf'
    const buf = await buildBuffer([{
      name: '2026',
      rows: [
        HEADERS,
        makeRow({ dateOrRef: { text: 'FSN-2026-001', hyperlink: evidenceUrl } }),
      ],
    }])

    const { items } = await parseMhraExcelBuffer(buf, '2026-01-01', '2026-12-31')

    expect(items[0].source_url).toBe(evidenceUrl)
    expect(items[0].raw_content).toContain(`FSN document: ${evidenceUrl}`)
  })

  it('rejects non-HTTPS spreadsheet hyperlinks as provenance', async () => {
    const buf = await buildBuffer([{
      name: '2026',
      rows: [
        HEADERS,
        makeRow({ dateOrRef: { text: 'FSN-2026-001', hyperlink: 'http://example.test/fsn.pdf' } }),
      ],
    }])

    const { items } = await parseMhraExcelBuffer(buf, '2026-01-01', '2026-12-31')

    expect(items[0].source_url).toBe('https://www.gov.uk/drug-device-alerts')
    expect(items[0].raw_content).not.toContain('http://example.test')
  })

  it('keeps all rows with same Halo reference (no aggressive dedup)', async () => {
    const buf = await buildBuffer([{
      name: '2026',
      rows: [
        HEADERS,
        makeRow({
          halo: '38140305',
          brand: 'Micra AV — Customer Letter',
          mhraRef: '2026/004/003/291/001',
        }),
        makeRow({
          halo: '38140305',
          brand: 'Micra AV — Distributor Letter',
          mhraRef: '2026/004/003/291/002',
        }),
      ],
    }])

    const { items } = await parseMhraExcelBuffer(buf, '2026-01-01', '2026-12-31')

    expect(items).toHaveLength(2)
    expect(items[0].title).toContain('Customer Letter')
    expect(items[1].title).toContain('Distributor Letter')
  })

  it('generates external_id using MHRA reference when present', async () => {
    const buf = await buildBuffer([{
      name: '2026',
      rows: [HEADERS, makeRow({ mhraRef: '2026/004/003/291/001' })],
    }])

    const { items } = await parseMhraExcelBuffer(buf, '2026-01-01', '2026-12-31')

    expect(items[0].external_id).toMatch(/^mhra-excel:2026\/004\/003\/291\/001:/)
  })

  it('uses content-hash fallback when no MHRA reference', async () => {
    const buf = await buildBuffer([{
      name: '2026',
      rows: [
        HEADERS,
        makeRow({ mhraRef: '', halo: '12345' }),
      ],
    }])

    const { items } = await parseMhraExcelBuffer(buf, '2026-01-01', '2026-12-31')

    expect(items[0].external_id).toMatch(/^mhra-excel:12345:/)
    expect(items[0].external_id).not.toContain('-r')
  })

  it('falls back to sheet year in external_id when no MHRA ref and no Halo', async () => {
    const buf = await buildBuffer([{
      name: '2026',
      rows: [
        HEADERS,
        makeRow({ mhraRef: '', halo: '' }),
      ],
    }])

    const { items } = await parseMhraExcelBuffer(buf, '2026-01-01', '2026-12-31')

    expect(items[0].external_id).toMatch(/^mhra-excel:2026:/)
  })

  it('skips blank rows (no manufacturer + no brand)', async () => {
    const buf = await buildBuffer([{
      name: '2026',
      rows: [
        HEADERS,
        makeRow(),
        ['', '', '', '', '', '', new Date('2026-04-15T00:00:00Z'), '', ''],
        makeRow({ brand: 'Second Valid' }),
      ],
    }])

    const { items } = await parseMhraExcelBuffer(buf, '2026-01-01', '2026-12-31')

    expect(items).toHaveLength(2)
  })

  it('skips rows missing "Date added to gov.uk" with warning', async () => {
    const buf = await buildBuffer([{
      name: '2026',
      rows: [
        HEADERS,
        makeRow({ dateAdded: null }),
        makeRow({ brand: 'Has Date', dateAdded: new Date('2026-04-15T00:00:00Z') }),
      ],
    }])

    const { items, warnings } = await parseMhraExcelBuffer(buf, '2026-01-01', '2026-12-31')

    expect(items).toHaveLength(1)
    expect(items[0].title).toContain('Has Date')
    expect(warnings.some(w => w.includes('skipped, missing "Date added to gov.uk"'))).toBe(true)
  })

  it('parses "Date added to gov.uk" as both Date object and string', async () => {
    const buf = await buildBuffer([{
      name: '2026',
      rows: [
        HEADERS,
        makeRow({ dateAdded: new Date('2026-03-10T00:00:00Z'), brand: 'Date Object' }),
        makeRow({ dateAdded: '2026-03-11', brand: 'Date String' }),
      ],
    }])

    const { items } = await parseMhraExcelBuffer(buf, '2026-01-01', '2026-12-31')

    expect(items).toHaveLength(2)
    expect(items[0].fsn_date).toBe('2026-03-10')
    expect(items[1].fsn_date).toBe('2026-03-11')
  })

  it('source_db is always mhra', async () => {
    const buf = await buildBuffer([{
      name: '2026',
      rows: [HEADERS, makeRow(), makeRow({ brand: 'Second' })],
    }])

    const { items } = await parseMhraExcelBuffer(buf, '2026-01-01', '2026-12-31')

    expect(items.every(i => i.source_db === 'mhra')).toBe(true)
  })

  it('reads multiple sheets spanning the search date range', async () => {
    const buf = await buildBuffer([
      {
        name: '2025',
        rows: [
          HEADERS,
          makeRow({ brand: 'From 2025', dateAdded: new Date('2025-12-01T00:00:00Z') }),
        ],
      },
      {
        name: '2026',
        rows: [
          HEADERS,
          makeRow({ brand: 'From 2026', dateAdded: new Date('2026-01-15T00:00:00Z') }),
        ],
      },
    ])

    const { items } = await parseMhraExcelBuffer(buf, '2025-11-01', '2026-02-28')

    expect(items).toHaveLength(2)
    expect(items.some(i => i.title.includes('From 2025'))).toBe(true)
    expect(items.some(i => i.title.includes('From 2026'))).toBe(true)
  })

  it('skips sheets outside the search date range', async () => {
    const buf = await buildBuffer([
      {
        name: '2024',
        rows: [HEADERS, makeRow({ brand: 'Old', dateAdded: new Date('2024-06-01T00:00:00Z') })],
      },
      {
        name: '2026',
        rows: [HEADERS, makeRow({ brand: 'Current', dateAdded: new Date('2026-04-01T00:00:00Z') })],
      },
    ])

    const { items } = await parseMhraExcelBuffer(buf, '2026-01-01', '2026-12-31')

    expect(items).toHaveLength(1)
    expect(items[0].title).toContain('Current')
  })

  it('detects header row even when not in row 1', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('2026')
    ws.addRow(['MHRA Field Safety Notices — 2026'])
    ws.addRow([])
    ws.addRow(HEADERS)
    ws.addRow(makeRow())
    const buf = new Uint8Array(await wb.xlsx.writeBuffer())

    const { items } = await parseMhraExcelBuffer(buf, '2026-01-01', '2026-12-31')

    expect(items).toHaveLength(1)
    expect(items[0].manufacturer).toBe('Medtronic')
  })

  it('throws when no sheets have recognized headers', async () => {
    const buf = await buildBuffer([{
      name: '2026',
      rows: [['Col A', 'Col B', 'Col C']],
    }])

    await expect(
      parseMhraExcelBuffer(buf, '2026-01-01', '2026-12-31'),
    ).rejects.toThrow('no sheets with recognized headers')
  })

  it('two rows with same MHRA reference but different content get different external_ids', async () => {
    const buf = await buildBuffer([{
      name: '2026',
      rows: [
        HEADERS,
        makeRow({
          mhraRef: '2026/004/003/291/001',
          brand: 'Micra AV',
          device: 'Leadless Pacemaker',
        }),
        makeRow({
          mhraRef: '2026/004/003/291/001',
          brand: 'Micra AV',
          device: 'Leadless Pacemaker System',
        }),
      ],
    }])

    const { items } = await parseMhraExcelBuffer(buf, '2026-01-01', '2026-12-31')

    expect(items).toHaveLength(2)
    expect(items[0].external_id).not.toBe(items[1].external_id)
  })
})

describe('buildMhraExternalId', () => {
  it('uses MHRA ref as prefix when available', () => {
    const id = buildMhraExternalId('2026/004', '38140', '2026', 'Mfr', 'Brand', 'Dev', 'Mod', '2026-04-15', 'FSN-001', 'Comment')
    expect(id).toMatch(/^mhra-excel:2026\/004:/)
  })

  it('falls back to Halo ref when no MHRA ref', () => {
    const id = buildMhraExternalId('', '38140', '2026', 'Mfr', 'Brand', 'Dev', 'Mod', '2026-04-15', 'FSN-001', 'Comment')
    expect(id).toMatch(/^mhra-excel:38140:/)
  })

  it('falls back to sheet year when no MHRA ref and no Halo', () => {
    const id = buildMhraExternalId('', '', '2026', 'Mfr', 'Brand', 'Dev', 'Mod', '2026-04-15', 'FSN-001', 'Comment')
    expect(id).toMatch(/^mhra-excel:2026:/)
  })

  it('produces stable hash from content fields', () => {
    const id1 = buildMhraExternalId('ref', '', '2026', 'Mfr', 'Brand', 'Dev', 'Mod', '2026-04-15', 'FSN-001', 'Comment')
    const id2 = buildMhraExternalId('ref', '', '2026', 'Mfr', 'Brand', 'Dev', 'Mod', '2026-04-15', 'FSN-001', 'Comment')
    expect(id1).toBe(id2)
  })

  it('different content produces different hash', () => {
    const id1 = buildMhraExternalId('ref', '', '2026', 'Mfr', 'Brand A', 'Dev', 'Mod', '2026-04-15', 'FSN-001', 'Comment')
    const id2 = buildMhraExternalId('ref', '', '2026', 'Mfr', 'Brand B', 'Dev', 'Mod', '2026-04-15', 'FSN-001', 'Comment')
    expect(id1).not.toBe(id2)
  })

  it('different comment produces different hash', () => {
    const id1 = buildMhraExternalId('ref', '', '2026', 'Mfr', 'Brand', 'Dev', 'Mod', '2026-04-15', 'FSN-001', 'Urgent recall')
    const id2 = buildMhraExternalId('ref', '', '2026', 'Mfr', 'Brand', 'Dev', 'Mod', '2026-04-15', 'FSN-001', 'Routine update')
    expect(id1).not.toBe(id2)
  })

  it('different dateAdded produces different hash', () => {
    const id1 = buildMhraExternalId('ref', '', '2026', 'Mfr', 'Brand', 'Dev', 'Mod', '2026-04-15', 'FSN-001', 'Comment')
    const id2 = buildMhraExternalId('ref', '', '2026', 'Mfr', 'Brand', 'Dev', 'Mod', '2026-05-20', 'FSN-001', 'Comment')
    expect(id1).not.toBe(id2)
  })
})

describe('buildMhraTitle', () => {
  it('joins brand, device, and model', () => {
    expect(buildMhraTitle('Micra AV', 'Leadless Pacemaker', 'MC1AVR1', 'Medtronic'))
      .toBe('Micra AV — Leadless Pacemaker — MC1AVR1')
  })

  it('omits empty parts', () => {
    expect(buildMhraTitle('Micra AV', '', '', 'Medtronic')).toBe('Micra AV')
  })

  it('falls back to manufacturer when all others empty', () => {
    expect(buildMhraTitle('', '', '', 'Medtronic')).toBe('Medtronic')
  })

  it('returns fallback when everything is empty', () => {
    expect(buildMhraTitle('', '', '', '')).toBe('Unknown MHRA FSN')
  })

  it('truncates at 120 characters', () => {
    const long = 'A'.repeat(60)
    const title = buildMhraTitle(long, long, long, '')
    expect(title.length).toBeLessThanOrEqual(120)
  })
})

describe('detectColumns', () => {
  it('maps columns dynamically regardless of order', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Test')
    ws.addRow(['Brand', 'Manufacturer', 'Date added to gov.uk', 'Model', 'Comment'])

    const result = detectColumns(ws)

    expect(result).not.toBeNull()
    expect(result!.columns.brand).toBe(1)
    expect(result!.columns.manufacturer).toBe(2)
    expect(result!.columns.dateAddedToGovUk).toBe(3)
    expect(result!.columns.model).toBe(4)
    expect(result!.columns.comment).toBe(5)
  })

  it('returns null when required columns are missing', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Test')
    ws.addRow(['Column A', 'Column B'])

    expect(detectColumns(ws)).toBeNull()
  })

  it('returns null when "Date added to gov.uk" column is missing', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Test')
    ws.addRow(['Brand', 'Manufacturer', 'Model', 'Comment'])

    expect(detectColumns(ws)).toBeNull()
  })
})

describe('downloadMhraExcel hardening', () => {
  const originalFetch = globalThis.fetch
  const originalEnv = process.env.MHRA_EXCEL_URL

  beforeEach(() => {
    delete process.env.MHRA_EXCEL_URL
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    if (originalEnv !== undefined) {
      process.env.MHRA_EXCEL_URL = originalEnv
    } else {
      delete process.env.MHRA_EXCEL_URL
    }
    vi.restoreAllMocks()
  })

  it('rejects oversized Content-Length before reading body', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      url: 'https://mhra-gov.filecamp.com/file.xlsx',
      headers: new Headers({
        'content-type': 'application/octet-stream',
        'content-length': String(100 * 1024 * 1024),
      }),
      body: null,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    })

    await expect(downloadMhraExcel()).rejects.toThrow('too large')
  })

  it('rejects oversized streamed body even without Content-Length', async () => {
    const bigChunk = new Uint8Array(51 * 1024 * 1024)
    let readCalled = false
    const mockReader = {
      read: vi.fn().mockImplementation(() => {
        if (!readCalled) {
          readCalled = true
          return Promise.resolve({ done: false, value: bigChunk })
        }
        return Promise.resolve({ done: true, value: undefined })
      }),
      releaseLock: vi.fn(),
    }

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      url: 'https://mhra-gov.filecamp.com/file.xlsx',
      headers: new Headers({ 'content-type': 'application/octet-stream' }),
      body: { getReader: () => mockReader },
    })

    await expect(downloadMhraExcel()).rejects.toThrow('too large')
    expect(mockReader.releaseLock).toHaveBeenCalled()
  })

  it('rejects non-HTTPS URL', async () => {
    process.env.MHRA_EXCEL_URL = 'http://mhra-gov.filecamp.com/s/d/test'

    await expect(downloadMhraExcel()).rejects.toThrow('must use HTTPS')
  })

  it('rejects non-allowlisted hostname', async () => {
    process.env.MHRA_EXCEL_URL = 'https://evil.example.com/payload.xlsx'

    await expect(downloadMhraExcel()).rejects.toThrow('host is not allowed')
  })

  it('rejects redirect to non-allowlisted host', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      url: 'https://evil.example.com/redirected.xlsx',
      headers: new Headers({ 'content-type': 'application/octet-stream' }),
      body: null,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(500)),
    })

    await expect(downloadMhraExcel()).rejects.toThrow('host is not allowed')
  })

  it('HTML response error does not mention env var name', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      url: 'https://mhra-gov.filecamp.com/sharing-page',
      headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
      body: null,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    })

    await expect(downloadMhraExcel()).rejects.toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining('MHRA_EXCEL_URL'),
      }),
    )
  })

  it('downloads successfully from allowed host', async () => {
    const wb = new ExcelJS.Workbook()
    wb.addWorksheet('2026')
    const buf = await wb.xlsx.writeBuffer()

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      url: 'https://mhra-gov.filecamp.com/s/d/test',
      headers: new Headers({
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-length': String(buf.byteLength),
      }),
      body: null,
      arrayBuffer: () => Promise.resolve(buf),
    })

    const result = await downloadMhraExcel()
    expect(result).toBeInstanceOf(Uint8Array)
    expect(result.byteLength).toBeGreaterThan(100)
  })
})
