import { describe, expect, it } from 'vitest'
import { defaultSearchPeriod } from '@/app/dashboard/search/search-panel'

describe('search default period', () => {
  it('defaults to exactly one month through today', () => {
    expect(defaultSearchPeriod(new Date('2026-07-02T12:00:00.000Z'))).toEqual({
      from: '2026-06-02',
      to: '2026-07-02',
    })
  })
})
