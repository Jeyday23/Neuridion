import { describe, expect, it } from 'vitest'
import { isReportApproved } from '@/lib/reports/review-gate'

describe('PRRC report approval gate', () => {
  it.each([
    ['missing', undefined],
    ['null', null],
    ['draft', 'draft'],
    ['reviewed', 'reviewed'],
    ['unknown', 'unknown'],
  ])('blocks %s review status', (_label, status) => {
    expect(isReportApproved(status)).toBe(false)
  })

  it('allows only approved review status', () => {
    expect(isReportApproved('approved')).toBe(true)
  })
})
