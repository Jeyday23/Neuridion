import { beforeEach, describe, expect, it, vi } from 'vitest'

const range = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          gte: () => ({
            lte: () => ({
              order: () => ({
                range,
              }),
            }),
          }),
        }),
      }),
    }),
  }),
}))

vi.mock('@/lib/sync/coverage', () => ({
  getCoveredRanges: vi.fn(async () => []),
  computeUncoveredRanges: vi.fn(() => []),
}))

describe('authority mirror query', () => {
  beforeEach(() => {
    range.mockReset()
  })

  it('returns raw authority rows by default and keeps keyword filtering opt-in', async () => {
    range.mockResolvedValue({
      data: [
        {
          source_record_id: 'match',
          title: 'Medtronic Micra notice',
          manufacturer: 'Medtronic',
          product_name: 'Micra',
          fsn_date: '2026-06-01',
          source_url: 'https://example.test/match',
          raw_content: 'Micra FSN',
        },
        {
          source_record_id: 'non-match',
          title: 'Unrelated source notice',
          manufacturer: 'Other',
          product_name: 'Other',
          fsn_date: '2026-06-02',
          source_url: 'https://example.test/non-match',
          raw_content: 'Different device',
        },
      ],
      error: null,
    })
    const { queryMirror } = await import('@/lib/search/query-mirror')

    const raw = await queryMirror({
      sources: ['bfarm'],
      fromDate: '2026-06-01',
      toDate: '2026-06-30',
      manufacturer: 'Medtronic',
      deviceName: 'Micra',
      requireCoverage: false,
    })
    const filtered = await queryMirror({
      sources: ['bfarm'],
      fromDate: '2026-06-01',
      toDate: '2026-06-30',
      manufacturer: 'Medtronic',
      deviceName: 'Micra',
      requireCoverage: false,
      keywordFilter: true,
    })

    expect(raw.map(item => item.external_id)).toEqual(['match', 'non-match'])
    expect(filtered.map(item => item.external_id)).toEqual(['match'])
  })
})
