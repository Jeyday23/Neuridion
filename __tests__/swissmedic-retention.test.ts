import { afterEach, describe, expect, it, vi } from 'vitest'
import { scrapeSwissmedic } from '@/lib/scrapers/swissmedic'

function swissmedicPage(content: unknown[]) {
  return new Response(JSON.stringify({ content, totalPages: 1, last: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

describe('Swissmedic source retention', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('retains every valid in-range publication even when none match the device profile', async () => {
    const fetchMock = vi.fn(async () => swissmedicPage([
      {
        swissmedicRef: 'SM-COPRA-1',
        publikationsDatum: '2026-08-10',
        hersteller: 'Copra Medical AG',
        begruendung: 'Software correction for Copra6',
        devices: [{ handelsname: 'Copra6' }],
      },
      {
        swissmedicRef: 'SM-OTHER-1',
        publikationsDatum: '2026-08-11',
        hersteller: 'Unrelated Devices SA',
        begruendung: 'Field safety corrective action for an infusion pump',
        devices: [{ handelsname: 'Infusion Pump X' }],
      },
    ]))
    vi.stubGlobal('fetch', fetchMock)

    const result = await scrapeSwissmedic({
      fromDate: '2026-08-01',
      toDate: '2026-09-01',
      profile: { manufacturer: 'Copra', device_name: 'Copra6' },
    })

    expect(result.outcome).toBe('complete')
    expect(result.items.map(item => item.external_id)).toEqual(['SM-COPRA-1', 'SM-OTHER-1'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('still enforces source validity, date-window, and identity deduplication', async () => {
    const fetchMock = vi.fn(async () => swissmedicPage([
      { swissmedicRef: 'SM-IN-RANGE', publikationsDatum: '2026-08-15', hersteller: 'Vendor A' },
      { swissmedicRef: 'SM-IN-RANGE', publikationsDatum: '2026-08-15', hersteller: 'Vendor A' },
      { swissmedicRef: 'SM-TOO-EARLY', publikationsDatum: '2026-07-31', hersteller: 'Vendor B' },
      { publikationsDatum: '2026-08-20', hersteller: 'Missing Reference Vendor' },
      { swissmedicRef: 'SM-NO-DATE', hersteller: 'Missing Date Vendor' },
    ]))
    vi.stubGlobal('fetch', fetchMock)

    const result = await scrapeSwissmedic({
      fromDate: '2026-08-01',
      toDate: '2026-09-01',
      profile: { manufacturer: 'No Match', device_name: 'No Match Device' },
    })

    expect(result.items.map(item => item.external_id)).toEqual(['SM-IN-RANGE'])
  })
})
