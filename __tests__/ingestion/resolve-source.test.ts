import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  ingestionMode: vi.fn(),
  queryMirror: vi.fn(),
  recordShadowComparison: vi.fn(),
}))

vi.mock('@/lib/flags', () => ({ ingestionMode: mocks.ingestionMode }))
vi.mock('@/lib/search/query-mirror', () => ({ queryMirror: mocks.queryMirror }))
vi.mock('@/lib/ingestion/shadow', () => ({ recordShadowComparison: mocks.recordShadowComparison }))

import { resolveSource } from '@/lib/search/resolve-source'

const query = {
  fromDate: '2026-06-01', toDate: '2026-06-20',
  manufacturer: 'Acme', deviceName: 'Pump',
}
const liveItem = { external_id: 'live' } as never
const mirrorItem = { external_id: 'mirror' } as never

describe('source resolver safety', () => {
  beforeEach(() => vi.clearAllMocks())

  it('serves live by default', async () => {
    mocks.ingestionMode.mockReturnValue('live')
    const live = vi.fn().mockResolvedValue([liveItem])
    expect(await resolveSource('bfarm', query, live)).toEqual([liveItem])
    expect(mocks.queryMirror).not.toHaveBeenCalled()
  })

  it('shadow mode compares but still serves live', async () => {
    mocks.ingestionMode.mockReturnValue('shadow')
    mocks.queryMirror.mockResolvedValue([mirrorItem])
    mocks.recordShadowComparison.mockResolvedValue({ agreement: 0 })
    const live = vi.fn().mockResolvedValue([liveItem])
    expect(await resolveSource('mhra', query, live)).toEqual([liveItem])
    await vi.waitFor(() => expect(mocks.recordShadowComparison).toHaveBeenCalledOnce())
  })

  it('falls back to live when mirror coverage or querying fails', async () => {
    mocks.ingestionMode.mockReturnValue('mirror')
    mocks.queryMirror.mockRejectedValue(new Error('coverage incomplete'))
    const live = vi.fn().mockResolvedValue([liveItem])
    expect(await resolveSource('swissmedic', query, live)).toEqual([liveItem])
  })
})

