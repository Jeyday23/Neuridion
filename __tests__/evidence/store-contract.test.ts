import { describe, expect, it } from 'vitest'
import { adapterOutputBytes, evidenceSafeLocator } from '@/lib/evidence/store'
import { sha256Hex } from '@/lib/evidence/hash'
import type { ScrapedFsn } from '@/lib/scrapers/bfarm'

const item: ScrapedFsn = {
  external_id: '123-26',
  title: 'Safety notice',
  manufacturer: 'Example GmbH',
  product_name: 'Device',
  fsn_date: '2026-06-20',
  source_url: 'https://example.test/notice',
  raw_content: 'Corrective action details',
  source_db: 'bfarm',
}

describe('adapter evidence contract', () => {
  it('captures every adapter field deterministically', () => {
    const first = adapterOutputBytes(item)
    const second = adapterOutputBytes({ ...item })
    expect(new TextDecoder().decode(first)).toContain('Corrective action details')
    expect(sha256Hex(first)).toBe(sha256Hex(second))
  })

  it('changes the source payload hash when an attachment-bearing narrative changes', () => {
    const before = sha256Hex(adapterOutputBytes(item))
    const after = sha256Hex(adapterOutputBytes({
      ...item,
      raw_content: `${item.raw_content}\nDocument: https://example.test/fsn-v2.pdf`,
    }))
    expect(after).not.toBe(before)
  })

  it('replaces request query values with a deterministic fingerprint', () => {
    const safe = evidenceSafeLocator('https://authority.example/search?api_key=secret&query=Device+Name')

    expect(safe).toMatch(/^https:\/\/authority\.example\/search\?query_sha256=[0-9a-f]{64}$/)
    expect(safe).not.toContain('secret')
    expect(safe).not.toContain('Device')
    expect(evidenceSafeLocator('https://authority.example/search?api_key=secret&query=Device+Name'))
      .toBe(safe)
  })

  it('does not pass malformed locators into evidence storage', () => {
    expect(evidenceSafeLocator('not a URL')).toBe('redacted://invalid-locator')
  })
})
