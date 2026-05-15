import { describe, it, expect } from 'vitest'
import { extractCompetitorTokens } from '../lib/search/manufacturer-terms'

describe('extractCompetitorTokens', () => {
  it('extracts tokens from name and manufacturer', () => {
    const tokens = extractCompetitorTokens([
      { name: 'ORBIS Medication', manufacturer: 'Dedalus' },
    ])
    expect(tokens).toContain('orbis')
    expect(tokens).toContain('medication')
    expect(tokens).toContain('dedalus')
  })

  it('keeps short tokens like ICM and ICCA (>= 2 chars)', () => {
    const tokens = extractCompetitorTokens([
      { name: 'ICM', manufacturer: 'Dräger Medical' },
      { name: 'ICCA', manufacturer: 'Philips' },
    ])
    expect(tokens).toContain('icm')
    expect(tokens).toContain('icca')
    expect(tokens).toContain('dräger')
    expect(tokens).toContain('philips')
  })

  it('filters legal suffixes from manufacturer', () => {
    const tokens = extractCompetitorTokens([
      { name: 'MetaVision', manufacturer: 'iMDsoft Ltd' },
    ])
    expect(tokens).toContain('metavision')
    expect(tokens).toContain('imdsoft')
    expect(tokens).not.toContain('ltd')
  })

  it('deduplicates tokens', () => {
    const tokens = extractCompetitorTokens([
      { name: 'COPRA6', manufacturer: 'COPRA System GmbH' },
      { name: 'COPRA6 RM', manufacturer: 'COPRA System GmbH' },
    ])
    const copraCount = tokens.filter(t => t === 'copra6').length
    expect(copraCount).toBe(1)
  })

  it('returns empty array for empty input', () => {
    expect(extractCompetitorTokens([])).toEqual([])
  })

  it('handles entries with no manufacturer', () => {
    const tokens = extractCompetitorTokens([
      { name: 'Sandman.MD' },
    ])
    expect(tokens).toContain('sandman.md')
  })

  it('keeps hyphenated product names intact', () => {
    const tokens = extractCompetitorTokens([
      { name: 'M-PDMS', manufacturer: 'Meierhofer' },
    ])
    expect(tokens).toContain('m-pdms')
    expect(tokens).toContain('meierhofer')
  })

  it('filters single-char tokens', () => {
    const tokens = extractCompetitorTokens([
      { name: 'A B Test', manufacturer: '' },
    ])
    expect(tokens).not.toContain('a')
    expect(tokens).not.toContain('b')
    expect(tokens).toContain('test')
  })
})
