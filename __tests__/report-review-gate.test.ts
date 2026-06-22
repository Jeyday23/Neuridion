import { describe, expect, it } from 'vitest'
import { isReportApproved, isReportReleaseAuthorized } from '@/lib/reports/review-gate'

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

  it('requires reviewer identity and a valid review timestamp for report release', () => {
    expect(isReportReleaseAuthorized('approved', 'user-1', '2026-06-22T10:00:00.000Z')).toBe(true)
    expect(isReportReleaseAuthorized('approved', null, '2026-06-22T10:00:00.000Z')).toBe(false)
    expect(isReportReleaseAuthorized('approved', 'user-1', null)).toBe(false)
    expect(isReportReleaseAuthorized('approved', 'user-1', 'not-a-date')).toBe(false)
    expect(isReportReleaseAuthorized('reviewed', 'user-1', '2026-06-22T10:00:00.000Z')).toBe(false)
  })
})
