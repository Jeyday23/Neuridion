import { describe, expect, it } from 'vitest'
import { extractFieldsDeterministic } from '@/lib/extraction/fields'

const GERMAN_FSN = `Dringende Sicherheitsinformation
Referenznummer: FSCA-2026-0142

Betroffene Produkte:
Infusomat Space
SpaceStation

Art.-Nr.: 8713060 REF 8713061
Chargen-Nr.: 24C09B77, LOT 24D11A02
Seriennummer: SN-99120
UDI-DI: (01)04046963312345

Maßnahmen:
Betroffene Chargen aussondern und Rücksendung veranlassen.
Weitere Verwendung ist nicht zulässig.`

describe('extractFieldsDeterministic', () => {
  it('extracts German PRRC-critical FSN fields', () => {
    const fields = extractFieldsDeterministic(GERMAN_FSN)

    expect(fields.fscaReference).toBe('FSCA-2026-0142')
    expect(fields.productNames).toEqual(expect.arrayContaining(['Infusomat Space', 'SpaceStation']))
    expect(fields.refNumbers).toEqual(expect.arrayContaining(['8713060', '8713061']))
    expect(fields.lotNumbers).toEqual(expect.arrayContaining(['24C09B77', '24D11A02']))
    expect(fields.serialNumbers).toContain('SN-99120')
    expect(fields.udiDis).toContain('04046963312345')
    expect(fields.actionRequired).toMatch(/aussondern/i)
  })

  it('is pure for the same input', () => {
    expect(extractFieldsDeterministic(GERMAN_FSN)).toEqual(extractFieldsDeterministic(GERMAN_FSN))
  })

  it('returns empty fields for unrelated text', () => {
    const fields = extractFieldsDeterministic('Quarterly marketing newsletter without safety notice identifiers.')
    expect(fields.fscaReference).toBeNull()
    expect(fields.refNumbers).toEqual([])
    expect(fields.lotNumbers).toEqual([])
    expect(fields.actionRequired).toBeNull()
  })
})
