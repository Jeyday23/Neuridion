import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScrapedFsn, ScraperResult } from '@/lib/scrapers/bfarm'

const mocks = vi.hoisted(() => ({
  excel: vi.fn(),
  govUk: vi.fn(),
}))

vi.mock('@/lib/scrapers/mhra-excel', () => ({ scrapeMhraExcel: mocks.excel }))
vi.mock('@/lib/scrapers/mhra', () => ({ scrapeMhra: mocks.govUk }))

import { mergeMhraEvidence, scrapeMhraProduction } from '@/lib/scrapers/registry'

function item(overrides: Partial<ScrapedFsn> = {}): ScrapedFsn {
  return {
    external_id: 'mhra-excel:2026001234:abc',
    title: 'Acme Pump X1',
    manufacturer: 'Acme Medical Ltd',
    product_name: 'Pump X1',
    fsn_date: '2026-05-10',
    source_url: 'https://assets.publishing.service.gov.uk/fsn-x1.pdf',
    raw_content: 'MHRA reference: 2026001234',
    source_db: 'mhra',
    ...overrides,
  }
}

function result(items: ScrapedFsn[], warnings: string[] = []): ScraperResult {
  return {
    items,
    warnings,
    outcome: warnings.length > 0 ? 'partial' : items.length > 0 ? 'complete' : 'empty',
  }
}

const params = { fromDate: '2026-01-01', toDate: '2026-06-19' }

describe('MHRA production source registry', () => {
  beforeEach(() => vi.clearAllMocks())

  it('runs Excel and GOV.UK together and merges the same reference conservatively', async () => {
    mocks.excel.mockResolvedValue(result([item()]))
    mocks.govUk.mockResolvedValue(result([
      item({
        external_id: '/drug-device-alerts/acme-pump-x1',
        title: 'Acme Pump X1 field safety notice',
        source_url: 'https://www.gov.uk/drug-device-alerts/acme-pump-x1',
        raw_content: 'Reference: 2026001234\nCorrective action details',
      }),
      item({
        external_id: '/drug-device-alerts/other',
        title: 'Other device notice',
        source_url: 'https://www.gov.uk/drug-device-alerts/other',
        raw_content: 'MHRA reference: 2026009999',
      }),
    ]))

    const merged = await scrapeMhraProduction(params)

    expect(mocks.excel).toHaveBeenCalledOnce()
    expect(mocks.govUk).toHaveBeenCalledOnce()
    expect(merged.items).toHaveLength(2)
    expect(merged.items[0].raw_content).toContain('Corrective action details')
    expect(merged.items[0].raw_content).toContain('MHRA evidence sources:')
    expect(merged.outcome).toBe('complete')
  })

  it('returns partial evidence with a warning when one official source fails', async () => {
    mocks.excel.mockRejectedValue(new Error('download unavailable'))
    mocks.govUk.mockResolvedValue(result([item()]))

    const merged = await scrapeMhraProduction(params)

    expect(merged.items).toHaveLength(1)
    expect(merged.outcome).toBe('partial')
    expect(merged.warnings).toContain('MHRA Excel source failed: download unavailable')
  })

  it('returns failed only when both official sources fail', async () => {
    mocks.excel.mockRejectedValue(new Error('Excel unavailable'))
    mocks.govUk.mockRejectedValue(new Error('API unavailable'))

    const merged = await scrapeMhraProduction(params)

    expect(merged.items).toEqual([])
    expect(merged.outcome).toBe('failed')
    expect(merged.warnings).toHaveLength(2)
  })
})

describe('mergeMhraEvidence', () => {
  it('does not collapse similar same-day notices without matching evidence identity', () => {
    const merged = mergeMhraEvidence([
      [item({ external_id: 'one', source_url: 'https://www.gov.uk/notice-one', raw_content: 'Pump notice one' })],
      [item({ external_id: 'two', source_url: 'https://www.gov.uk/notice-two', raw_content: 'Pump notice two' })],
    ])

    expect(merged).toHaveLength(2)
  })
})
