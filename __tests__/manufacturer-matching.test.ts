import { describe, it, expect } from 'vitest'
import { extractManufacturerTerms, buildManufacturerSearchTerms } from '../lib/search/manufacturer-terms'

// Helper: replicates the exact matching logic used in scrapeBfarm() and run-search.ts
function matchesItem(
  manufacturer: string,
  deviceName: string,
  title: string,
): boolean {
  const terms = buildManufacturerSearchTerms(manufacturer, deviceName)
  if (terms.length === 0) return true
  const hay = title.toLowerCase()
  return terms.some(t => hay.includes(t))
}

// ── User-specified tests (document desired matching behaviour) ────────────────

describe('B. Braun variants as BfArM title content', () => {
  it('"B. Braun" profile matches BfArM title with "B·Braun" (middle dot)', () => {
    expect(matchesItem('B. Braun', '', 'Dringende Sicherheitsinformation von B·Braun Melsungen AG')).toBe(true)
  })

  it('"B. Braun" profile matches BfArM title with "BBraun" (no separator)', () => {
    expect(matchesItem('B. Braun', '', 'Dringende Sicherheitsinformation von BBraun Medical AG')).toBe(true)
  })

  it('"B. Braun" profile matches BfArM title with "B. Braun Melsungen"', () => {
    expect(matchesItem('B. Braun', '', 'Dringende Sicherheitsinformation von B. Braun Melsungen AG')).toBe(true)
  })

  it('"Infusomat Space" device name matches BfArM title containing only "Infusomat"', () => {
    expect(matchesItem('B. Braun', 'Infusomat Space', 'Dringende Sicherheitsinformation von B·Braun – Infusomat® Volumenpumpe')).toBe(true)
  })
})

// ── Failing tests that prove the actual normalization bugs ────────────────────
// These fail TODAY because extractManufacturerTerms does not normalise Unicode
// punctuation (middle dot ·, en-dash –, em-dash —, etc.).

describe('Unicode punctuation normalisation in extractManufacturerTerms', () => {
  it('middle dot (·) is normalised to a separator — "B·Braun" produces same terms as "B. Braun"', () => {
    // Currently returns ["b·braun"] instead of ["braun"] → FAILS
    expect(extractManufacturerTerms('B·Braun')).toEqual(['braun'])
  })

  it('en-dash (–) is normalised — "B–Braun" produces same terms as "B. Braun"', () => {
    expect(extractManufacturerTerms('B–Braun')).toEqual(['braun'])
  })

  it('em-dash (—) is normalised — "Braun—Medical" filters generic "medical"', () => {
    expect(extractManufacturerTerms('Braun—Medical')).toEqual(['braun'])
  })

  it('slash (/) is normalised — "B/Braun" splits correctly', () => {
    expect(extractManufacturerTerms('B/Braun')).toEqual(['braun'])
  })
})

describe('CamelCase / compound manufacturer names cross-match BfArM variants', () => {
  it('"BBraun" profile matches BfArM title "B·Braun" (middle dot) — currently fails', () => {
    // extractManufacturerTerms("BBraun") = ["bbraun"]
    // "b·braun melsungen".includes("bbraun") = false  ← BUG
    expect(matchesItem('BBraun', '', 'Dringende Sicherheitsinformation von B·Braun Melsungen AG')).toBe(true)
  })

  it('"B·Braun" profile matches BfArM title "B. Braun" — currently fails', () => {
    // extractManufacturerTerms("B·Braun") = ["b·braun"]
    // "b. braun melsungen".includes("b·braun") = false  ← BUG
    expect(matchesItem('B·Braun', '', 'Dringende Sicherheitsinformation von B. Braun Melsungen AG')).toBe(true)
  })

  it('"B·Braun" profile matches BfArM title "BBraun" — currently fails', () => {
    expect(matchesItem('B·Braun', '', 'Dringende Sicherheitsinformation von BBraun Medical AG')).toBe(true)
  })
})

describe('buildManufacturerSearchTerms with Unicode separators', () => {
  it('"B·Braun" with device "Infusomat Space" produces ["braun", "infusomat", "space"]', () => {
    expect(buildManufacturerSearchTerms('B·Braun', 'Infusomat Space')).toEqual(['braun', 'infusomat', 'space'])
  })

  it('"Dräger Medical GmbH" produces ["dräger"] — generic "medical" filtered from manufacturer terms', () => {
    expect(buildManufacturerSearchTerms('Dräger Medical GmbH', '')).toEqual(['dräger'])
  })
})
