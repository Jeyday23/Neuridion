import { describe, expect, it } from 'vitest'
import { attachmentsFromJson, classifyCanonicalTransition } from '@/lib/sync/canonical'

const D1 = 'a'.repeat(64)
const D2 = 'b'.repeat(64)
const complete = { content_hash: 'h1', attachment_digest: D1, last_observation_degraded: false }

describe('classifyCanonicalTransition', () => {
  it('treats a new record as a baseline', () => {
    expect(classifyCanonicalTransition(undefined, { hash: 'h1', degraded: false, attachmentDigest: D1 }))
      .toEqual({ changed: false, attachmentChanged: false, keepStoredText: false, keepStoredAttachments: false })
  })

  it('flags a text change between complete observations', () => {
    expect(classifyCanonicalTransition(complete, { hash: 'h2', degraded: false, attachmentDigest: D1 }))
      .toMatchObject({ changed: true, attachmentChanged: false })
  })

  it('flags a document change when text is identical (same URL, new PDF body)', () => {
    expect(classifyCanonicalTransition(complete, { hash: 'h1', degraded: false, attachmentDigest: D2 }))
      .toMatchObject({ changed: true, attachmentChanged: true })
  })

  it('never lets a degraded observation replace or change a complete record', () => {
    expect(classifyCanonicalTransition(complete, { hash: 'listing-only', degraded: true, attachmentDigest: null }))
      .toEqual({ changed: false, attachmentChanged: false, keepStoredText: true, keepStoredAttachments: true })
  })

  it('treats completing a previously degraded record as an upgrade, not an upstream change', () => {
    const degraded = { content_hash: 'listing-only', attachment_digest: null, last_observation_degraded: true }
    expect(classifyCanonicalTransition(degraded, { hash: 'h1', degraded: false, attachmentDigest: D1 }))
      .toMatchObject({ changed: false, keepStoredText: false })
  })

  it('keeps stored attachment state when this pass could not verify documents', () => {
    expect(classifyCanonicalTransition(complete, { hash: 'h1', degraded: false, attachmentDigest: null }))
      .toMatchObject({ changed: false, keepStoredAttachments: true })
  })

  it('treats the first verified digest as a baseline', () => {
    const unverified = { ...complete, attachment_digest: null }
    expect(classifyCanonicalTransition(unverified, { hash: 'h1', degraded: false, attachmentDigest: D1 }))
      .toMatchObject({ changed: false, attachmentChanged: false })
  })
})

describe('attachmentsFromJson', () => {
  it('restores listed attachments and drops stored hashes as verification', () => {
    const restored = attachmentsFromJson([{ url: 'https://assets.publishing.service.gov.uk/x.pdf', sha256: D1, status: 'retrieved' }, { bad: true }])
    expect(restored).toEqual([expect.objectContaining({ url: 'https://assets.publishing.service.gov.uk/x.pdf', status: 'listed' })])
    expect(restored?.[0]).not.toHaveProperty('sha256')
    expect(attachmentsFromJson(null)).toBeUndefined()
  })
})
