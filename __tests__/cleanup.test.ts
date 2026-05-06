import { describe, it, expect } from 'vitest'
import { isStuckRun } from '@/app/api/worker/cleanup/route'

const CUTOFF = new Date('2026-05-06T08:00:00.000Z')

describe('isStuckRun', () => {
  it('returns false when status is not running', () => {
    expect(isStuckRun({ status: 'complete',  started_at: '2026-05-06T07:00:00.000Z', created_at: '2026-05-06T07:00:00.000Z' }, CUTOFF)).toBe(false)
    expect(isStuckRun({ status: 'error',     started_at: null,                        created_at: '2026-05-06T07:00:00.000Z' }, CUTOFF)).toBe(false)
    expect(isStuckRun({ status: 'cancelled', started_at: null,                        created_at: '2026-05-06T07:00:00.000Z' }, CUTOFF)).toBe(false)
  })

  it('returns true when started_at is before cutoff', () => {
    expect(isStuckRun({ status: 'running', started_at: '2026-05-06T07:00:00.000Z', created_at: '2026-05-06T07:00:00.000Z' }, CUTOFF)).toBe(true)
  })

  it('returns false when started_at is at or after cutoff', () => {
    expect(isStuckRun({ status: 'running', started_at: '2026-05-06T08:00:00.000Z', created_at: '2026-05-06T07:00:00.000Z' }, CUTOFF)).toBe(false)
    expect(isStuckRun({ status: 'running', started_at: '2026-05-06T09:00:00.000Z', created_at: '2026-05-06T07:00:00.000Z' }, CUTOFF)).toBe(false)
  })

  it('returns true when started_at is null and created_at is before cutoff', () => {
    expect(isStuckRun({ status: 'running', started_at: null, created_at: '2026-05-06T07:00:00.000Z' }, CUTOFF)).toBe(true)
  })

  it('returns false when started_at is null and created_at is at or after cutoff', () => {
    expect(isStuckRun({ status: 'running', started_at: null, created_at: '2026-05-06T08:00:00.000Z' }, CUTOFF)).toBe(false)
    expect(isStuckRun({ status: 'running', started_at: null, created_at: '2026-05-06T09:00:00.000Z' }, CUTOFF)).toBe(false)
  })
})
