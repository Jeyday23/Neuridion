import { describe, expect, it } from 'vitest'
import { parsePage } from '@/lib/scrapers/bfarm'

describe('BfArM title normalization', () => {
  it('decodes literal unicode-space artifacts before extracting product fields', () => {
    const html = `
      <li class="l-teaser-list__item">
        <a class="c-icon-teaser__link--download" href="/SharedDocs/Kundeninfos/DE/2026/16788-26_kundeninfo_de.html">
          <span class="c-icon-teaser__headline">Dringende Sicherheitsinformation z.u0020B. ONE FLARE n25 9% L17 Classics sterile von Micro-Mega</span>
          <span class="c-icon-teaser__reference">16788/26</span>
          <span>Datum: 24. April 2026</span>
        </a>
      </li>
    `

    const [item] = parsePage(html)

    expect(item.title).toBe('Dringende Sicherheitsinformation zu B. ONE FLARE n25 9% L17 Classics sterile von Micro-Mega')
    expect(item.productName).toBe('B. ONE FLARE n25 9% L17 Classics sterile')
    expect(item.manufacturer).toBe('Micro-Mega')
  })
})
