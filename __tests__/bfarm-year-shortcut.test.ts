import { describe, it, expect } from 'vitest'
import { parsePage, yearToShortcut } from '@/lib/scrapers/bfarm'

describe('yearToShortcut', () => {
  const Y = 2026  // simulate currentYear

  it('returns current_year for currentYear', () => {
    expect(yearToShortcut(2026, Y)).toBe('current_year')
  })

  it('returns lastyear for currentYear - 1', () => {
    expect(yearToShortcut(2025, Y)).toBe('lastyear')
  })

  it('returns penultimateyear for currentYear - 2', () => {
    expect(yearToShortcut(2024, Y)).toBe('penultimateyear')
  })

  it('returns null for years older than currentYear - 2', () => {
    expect(yearToShortcut(2023, Y)).toBeNull()
    expect(yearToShortcut(2020, Y)).toBeNull()
    expect(yearToShortcut(2000, Y)).toBeNull()
  })

  it('returns null for future years', () => {
    expect(yearToShortcut(2027, Y)).toBeNull()
  })
})

describe('parsePage German dates', () => {
  function teaser(dateText: string): string {
    return `
      <ul>
        <li class="l-teaser-list__item">
          <a href="/SharedDocs/Kundeninfos/DE/10/2026/26008-26_kundeninfo_de.html">
            <span class="c-icon-teaser__headline">Dringende Sicherheitsinformation zu Test Device von Acme GmbH</span>
          </a>
          <span class="c-icon-teaser__date">${dateText}</span>
        </li>
      </ul>
    `
  }

  it('parses literal German umlaut month names', () => {
    const items = parsePage(teaser('6. März 2026'))

    expect(items[0]?.date?.toISOString().slice(0, 10)).toBe('2026-03-06')
  })

  it('parses HTML-entity German umlaut month names', () => {
    const items = parsePage(teaser('6. M&auml;rz 2026'))

    expect(items[0]?.date?.toISOString().slice(0, 10)).toBe('2026-03-06')
  })
})
