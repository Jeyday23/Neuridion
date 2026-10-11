import { describe, expect, it, vi } from 'vitest'
import { fetchAllRows } from '@/lib/supabase/fetch-all'

describe('fetchAllRows', () => {
  it('pages past the PostgREST row cap until a short page arrives', async () => {
    const total = 2_345
    const page = vi.fn(async (from: number, to: number) => ({
      data: Array.from({ length: Math.max(0, Math.min(to, total - 1) - from + 1) }, (_, i) => from + i),
      error: null,
    }))
    const { data, error } = await fetchAllRows(page)
    expect(error).toBeNull()
    expect(data).toHaveLength(total)
    expect(data[total - 1]).toBe(total - 1)
    expect(page).toHaveBeenCalledTimes(3)
  })

  it('fails closed on a page error instead of returning a partial set', async () => {
    let call = 0
    const { data, error } = await fetchAllRows(async () => (++call === 1
      ? { data: Array.from({ length: 1_000 }, (_, i) => i), error: null }
      : { data: null, error: { message: 'timeout' } }))
    expect(data).toEqual([])
    expect(error?.message).toBe('timeout')
  })

  it('fails closed above the row ceiling', async () => {
    const { data, error } = await fetchAllRows(async (from: number, to: number) => ({
      data: Array.from({ length: to - from + 1 }, () => 1),
      error: null,
    }), { pageSize: 10, maxRows: 30 })
    expect(data).toEqual([])
    expect(error?.code).toBe('FETCH_ALL_LIMIT')
  })
})
