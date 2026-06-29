import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildTermClause, scrapeFdaMaude } from '@/lib/scrapers/fda-maude'

describe('FDA profile query grouping', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('requires every independent device token instead of OR-expanding generic terms', () => {
    const clause = buildTermClause(
      ['roche', 'diabetes', 'accu-chek'],
      {
        manufacturer: 'Roche Diabetes Care',
        device_name: 'Accu-Chek Blood Glucose Monitoring System',
      },
    )

    expect(clause).toContain('(device.manufacturer_d_name:roche+OR+device.manufacturer_d_name:diabetes)')
    expect(clause).toContain('(device.brand_name:accu-chek+OR+device.generic_name:accu-chek)')
  })

  it('keeps model and family aliases in one OR group', () => {
    const clause = buildTermClause(
      ['acme', 'copra6', 'copra'],
      { manufacturer: 'Acme GmbH', device_name: 'COPRA6' },
    )

    expect(clause).toContain(
      '(device.brand_name:copra6+OR+device.generic_name:copra6+' +
      'OR+device.brand_name:copra+OR+device.generic_name:copra)',
    )
  })

  it('maps the device entry that matched the requested profile', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      meta: { results: { total: 1 } },
      results: [{
        report_number: 'MDR-ACCU-1',
        date_received: '20260110',
        event_type: 'Malfunction',
        device: [
          {
            brand_name: 'COAGUCHEK',
            generic_name: 'Coagulation monitor',
            manufacturer_d_name: 'Roche Diagnostics',
          },
          {
            brand_name: 'ACCU-CHEK GUIDE',
            generic_name: 'Blood glucose monitoring system',
            manufacturer_d_name: 'Roche Diabetes Care',
          },
        ],
      }],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })))

    const result = await scrapeFdaMaude({
      fromDate: '2026-01-10',
      toDate: '2026-01-10',
      searchTerms: ['roche', 'diabetes', 'accu-chek'],
      profile: {
        manufacturer: 'Roche Diabetes Care',
        device_name: 'Accu-Chek Blood Glucose Monitoring System',
      },
    })

    expect(result.items).toHaveLength(1)
    expect(result.items[0].title).toBe('ACCU-CHEK GUIDE — Malfunction')
    expect(result.items[0].manufacturer).toBe('Roche Diabetes Care')
  })
})
