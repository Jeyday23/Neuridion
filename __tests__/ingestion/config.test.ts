import { describe, expect, it } from 'vitest'
import { scheduledSources } from '@/lib/ingestion/config'
import { ingestionMode } from '@/lib/flags'

describe('scheduled ingestion configuration', () => {
  it('is dark by default and excludes FDA/EUDAMED even when requested', () => {
    expect(scheduledSources('')).toEqual([])
    expect(scheduledSources('fda,eudamed,swissmedic')).toEqual(['swissmedic'])
  })

  it('deduplicates and validates enabled EU sources', () => {
    expect(scheduledSources('mhra,bfarm,mhra,unknown')).toEqual(['mhra', 'bfarm'])
  })

  it('defaults serving to live and accepts only explicit safe modes', () => {
    expect(ingestionMode('bfarm', {})).toBe('live')
    expect(ingestionMode('bfarm', { INGEST_MODE_BFARM: 'shadow' })).toBe('shadow')
    expect(ingestionMode('bfarm', { INGEST_MODE_BFARM: 'mirror' })).toBe('mirror')
    expect(ingestionMode('bfarm', { INGEST_MODE_BFARM: 'invalid' })).toBe('live')
  })
})

