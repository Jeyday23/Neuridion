import { describe, it, expect } from 'vitest'
import { buildManufacturerSearchTerms, extractManufacturerTerms } from '../manufacturer-terms'

// Mirrors the pre-filter logic in app/api/search-runs/route.ts Step 3 FIX 2.
// Keep in sync if the route logic changes.
function applyPreFilter(
  profile: { manufacturer: string; device_name: string },
  rows: Array<{ title: string; manufacturer: string; raw_content: string }>,
): { passed: typeof rows; excluded: typeof rows } {
  const filterSearchTerms = buildManufacturerSearchTerms(profile.manufacturer, profile.device_name)
  const manufacturerTerms = extractManufacturerTerms(profile.manufacturer)
  const deviceTerms       = filterSearchTerms.filter(t => !manufacturerTerms.includes(t))

  if (filterSearchTerms.length === 0) {
    return { passed: rows, excluded: [] }
  }

  const passed:   typeof rows = []
  const excluded: typeof rows = []

  for (const row of rows) {
    const hay = `${row.title} ${row.manufacturer} ${row.raw_content}`.toLowerCase()

    let matches: boolean
    if (deviceTerms.length === 0) {
      matches = manufacturerTerms.some(t => hay.includes(t.toLowerCase()))
    } else {
      const mfrMatch = manufacturerTerms.length === 0 || manufacturerTerms.some(t => hay.includes(t.toLowerCase()))
      const devMatch = deviceTerms.some(t => hay.includes(t.toLowerCase()))
      matches = mfrMatch && devMatch
    }

    if (matches) {
      passed.push(row)
    } else {
      excluded.push(row)
    }
  }

  return { passed, excluded }
}

const MICRA_PROFILE = { manufacturer: 'Medtronic', device_name: 'Micra AV' }

describe('pre-filter: Micra AV / Medtronic profile', () => {
  it('buildManufacturerSearchTerms produces expected terms', () => {
    expect(buildManufacturerSearchTerms('Medtronic', 'Micra AV')).toEqual(['medtronic', 'micra'])
  })

  it('manufacturerTerms = ["medtronic"], deviceTerms = ["micra"]', () => {
    const mfrTerms = extractManufacturerTerms('Medtronic')
    const allTerms = buildManufacturerSearchTerms('Medtronic', 'Micra AV')
    const devTerms = allTerms.filter(t => !mfrTerms.includes(t))
    expect(mfrTerms).toEqual(['medtronic'])
    expect(devTerms).toEqual(['micra'])
  })

  it('scenario 1: manufacturer=Medtronic title="Micra AV recall" → PASS (both match)', () => {
    const { passed, excluded } = applyPreFilter(MICRA_PROFILE, [
      { title: 'Micra AV recall', manufacturer: 'Medtronic', raw_content: '' },
    ])
    expect(passed).toHaveLength(1)
    expect(excluded).toHaveLength(0)
  })

  it('scenario 2: manufacturer=Medtronic title="Insulin pump recall" → FAIL (mfr matches, device does not)', () => {
    const { passed, excluded } = applyPreFilter(MICRA_PROFILE, [
      { title: 'Insulin pump recall', manufacturer: 'Medtronic', raw_content: '' },
    ])
    expect(passed).toHaveLength(0)
    expect(excluded).toHaveLength(1)
  })

  it('scenario 3: manufacturer=Roche title="Micra AV something" → FAIL (device matches, mfr does not)', () => {
    const { passed, excluded } = applyPreFilter(MICRA_PROFILE, [
      { title: 'Micra AV something', manufacturer: 'Roche', raw_content: '' },
    ])
    expect(passed).toHaveLength(0)
    expect(excluded).toHaveLength(1)
  })

  it('scenario 4: manufacturer=Roche title="Blood glucose monitor" → FAIL (neither matches)', () => {
    const { passed, excluded } = applyPreFilter(MICRA_PROFILE, [
      { title: 'Blood glucose monitor', manufacturer: 'Roche', raw_content: '' },
    ])
    expect(passed).toHaveLength(0)
    expect(excluded).toHaveLength(1)
  })

  it('device term in raw_content (not title) still passes', () => {
    const { passed } = applyPreFilter(MICRA_PROFILE, [
      { title: 'Cardiac device issue', manufacturer: 'Medtronic', raw_content: 'This concerns the Micra AV leadless pacemaker.' },
    ])
    expect(passed).toHaveLength(1)
  })
})

describe('pre-filter: fallback when no device terms extractable', () => {
  // "Pump" is 4 chars — fails the length > 4 filter — so deviceTerms = []
  const PUMP_PROFILE = { manufacturer: 'Medtronic', device_name: 'Pump' }

  it('buildManufacturerSearchTerms with short device name returns only mfr terms', () => {
    expect(buildManufacturerSearchTerms('Medtronic', 'Pump')).toEqual(['medtronic'])
  })

  it('scenario 5: falls back to manufacturer-only match — Medtronic row PASSES', () => {
    const { passed, excluded } = applyPreFilter(PUMP_PROFILE, [
      { title: 'Pump malfunction report', manufacturer: 'Medtronic', raw_content: '' },
    ])
    expect(passed).toHaveLength(1)
    expect(excluded).toHaveLength(0)
  })

  it('scenario 5: Roche row FAILS even in fallback mode', () => {
    const { passed, excluded } = applyPreFilter(PUMP_PROFILE, [
      { title: 'Pump malfunction report', manufacturer: 'Roche', raw_content: '' },
    ])
    expect(passed).toHaveLength(0)
    expect(excluded).toHaveLength(1)
  })
})

describe('pre-filter: mixed batch', () => {
  it('correctly splits a batch of 4 rows into 1 passed and 3 excluded', () => {
    const rows = [
      { title: 'Micra AV recall',        manufacturer: 'Medtronic', raw_content: '' }, // PASS
      { title: 'Insulin pump recall',     manufacturer: 'Medtronic', raw_content: '' }, // FAIL
      { title: 'Micra AV something',      manufacturer: 'Roche',     raw_content: '' }, // FAIL
      { title: 'Blood glucose monitor',   manufacturer: 'Roche',     raw_content: '' }, // FAIL
    ]
    const { passed, excluded } = applyPreFilter(MICRA_PROFILE, rows)
    expect(passed).toHaveLength(1)
    expect(excluded).toHaveLength(3)
    expect(passed[0].title).toBe('Micra AV recall')
  })
})
