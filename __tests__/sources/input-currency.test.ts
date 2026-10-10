import { describe, expect, it } from 'vitest'
import { assessInputCurrency, type CurrentInput } from '@/lib/sources/input-currency'

const D1 = 'a'.repeat(64)
const D2 = 'b'.repeat(64)

function current(rows: CurrentInput[]) {
  return new Map(rows.map(row => [row.id, row]))
}

describe('assessInputCurrency', () => {
  const canon = current([
    { id: 'c1', content_hash: 'h1', attachment_digest: D1, revision_count: 1, last_seen_at: null },
    { id: 'c2', content_hash: 'h2-new', attachment_digest: null, revision_count: 2, last_seen_at: null },
    { id: 'c3', content_hash: 'h3', attachment_digest: D2, revision_count: 3, last_seen_at: null },
  ])

  it('classifies current, text-changed, document-changed and unknown inputs', () => {
    const result = assessInputCurrency([
      { id: 'r1', canonical_id: 'c1', content_hash: 'h1', attachment_digest: D1 },
      { id: 'r2', canonical_id: 'c2', content_hash: 'h2', attachment_digest: null },
      { id: 'r3', canonical_id: 'c3', content_hash: 'h3', attachment_digest: D1 },
      { id: 'r4', canonical_id: null, content_hash: 'h4', attachment_digest: null },
    ], canon)

    expect(result.byResult.get('r1')?.status).toBe('current')
    expect(result.byResult.get('r2')?.status).toBe('record_changed')
    expect(result.byResult.get('r3')?.status).toBe('documents_changed')
    expect(result.byResult.get('r4')?.status).toBe('unknown')
    expect(result.summary).toEqual({ total: 4, current: 1, changed: 2, record_changed: 1, documents_changed: 1, unknown: 1 })
    expect(result.warnings[0]).toMatch(/2 of 4 screened source record\(s\) have a newer stored version.*1 with changed attached documents/)
    expect(result.warnings[1]).toMatch(/1 of 4 .*currency is not verified/)
  })

  it('does not report a change when either side lacks a verified digest', () => {
    const result = assessInputCurrency([
      { id: 'r1', canonical_id: 'c1', content_hash: 'h1', attachment_digest: null },
    ], canon)
    expect(result.byResult.get('r1')?.status).toBe('current')
    expect(result.warnings).toEqual([])
  })
})
