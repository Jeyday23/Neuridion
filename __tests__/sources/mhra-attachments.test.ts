import { describe, expect, it } from 'vitest'
import type { ScrapedFsn } from '@/lib/scrapers/bfarm'
import { buildDetailItems, degradedListingItem, extractGovUkAttachments, type GovUkContentItem } from '@/lib/scrapers/mhra'
import { mergeMhraEvidence } from '@/lib/scrapers/registry'
import { computeContentHash } from '@/lib/sync/canonical'

const listing: ScrapedFsn = {
  external_id: '/drug-device-alerts/fsn-acme-pump',
  title: 'Acme pump',
  manufacturer: 'Acme Ltd',
  product_name: 'Pump',
  fsn_date: '2026-09-01',
  source_url: 'https://www.gov.uk/drug-device-alerts/fsn-acme-pump',
  raw_content: 'Acme pump\n\nsummary',
  source_db: 'mhra',
}

const detail: GovUkContentItem = {
  title: 'Acme pump',
  public_updated_at: '2026-09-15T10:00:00Z',
  details: {
    body: '<p>Recall of lots 1-5.</p>',
    ref_number: '2026/009/001/123/001',
    attachments: [
      { url: 'https://assets.publishing.service.gov.uk/media/b/lots.pdf', title: 'Lots', content_type: 'application/pdf', file_size: 1200, content_id: 'cid-2' },
      { url: 'https://assets.publishing.service.gov.uk/media/a/fsn.pdf', title: 'FSN', content_type: 'application/pdf', file_size: 900, content_id: 'cid-1' },
      { url: 'https://assets.publishing.service.gov.uk/media/a/fsn.pdf#page=2' },
      { url: 'http://assets.publishing.service.gov.uk/media/x/insecure.pdf' },
      { url: 'https://evil.example/fsn.pdf' },
    ],
  },
}

describe('MHRA attachment listing', () => {
  it('keeps authority metadata, https authority hosts only, stable order, no duplicates', () => {
    const attachments = extractGovUkAttachments(detail)
    expect(attachments.map(a => a.url)).toEqual([
      'https://assets.publishing.service.gov.uk/media/a/fsn.pdf',
      'https://assets.publishing.service.gov.uk/media/b/lots.pdf',
    ])
    expect(attachments[0]).toMatchObject({ upstream_id: 'cid-1', declared_size: 900, upstream_updated_at: '2026-09-15T10:00:00Z', status: 'listed' })
  })

  it('attaches the structured list without changing the text hash inputs', () => {
    const [item] = buildDetailItems(listing, detail, '/drug-device-alerts/fsn-acme-pump')
    expect(item.attachments).toHaveLength(2)
    expect(item.observation_degraded).toBeUndefined()
    const withoutList = { ...item, attachments: undefined }
    expect(computeContentHash(item)).toBe(computeContentHash(withoutList))
  })

  it('marks a failed detail fetch as a degraded listing observation', () => {
    const result = degradedListingItem(listing)
    expect(result.detailFailed).toBe(true)
    expect(result.items).toEqual([{ ...listing, observation_degraded: true }])
  })
})

describe('MHRA channel merge', () => {
  it('carries attachments and degradation across merged duplicates', () => {
    const excel: ScrapedFsn = { ...listing, external_id: 'mhra-excel:1', raw_content: 'MHRA reference: 2026/009/001/123/001' }
    const govuk: ScrapedFsn = {
      ...listing,
      raw_content: 'Reference: 2026/009/001/123/001',
      attachments: [{ url: 'https://assets.publishing.service.gov.uk/media/a/fsn.pdf', status: 'listed' }],
      observation_degraded: true,
    }
    const [merged] = mergeMhraEvidence([[excel], [govuk]])
    expect(merged.attachments).toHaveLength(1)
    expect(merged.observation_degraded).toBe(true)
  })
})
