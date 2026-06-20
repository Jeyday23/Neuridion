import { createAdminClient } from '@/lib/supabase/admin'
import { canonicalJson, sha256Hex } from '@/lib/evidence/hash'
import type { ScrapedFsn } from '@/lib/scrapers/bfarm'
import type { MirrorQuery } from '@/lib/search/query-mirror'
import type { ScheduledSource } from './config'

export interface ShadowDiff {
  onlyLive: number
  onlyMirror: number
  common: number
  agreement: number
}

export function compareSets(
  live: Pick<ScrapedFsn, 'external_id'>[],
  mirror: Pick<ScrapedFsn, 'external_id'>[],
): ShadowDiff {
  const liveKeys = new Set(live.map((item) => item.external_id))
  const mirrorKeys = new Set(mirror.map((item) => item.external_id))
  let common = 0
  for (const key of liveKeys) if (mirrorKeys.has(key)) common++
  const onlyLive = liveKeys.size - common
  const onlyMirror = mirrorKeys.size - common
  const union = common + onlyLive + onlyMirror
  return { onlyLive, onlyMirror, common, agreement: union === 0 ? 1 : common / union }
}

export async function recordShadowComparison(input: {
  source: ScheduledSource
  query: MirrorQuery
  live: Pick<ScrapedFsn, 'external_id'>[]
  mirror: Pick<ScrapedFsn, 'external_id'>[]
}): Promise<ShadowDiff> {
  const diff = compareSets(input.live, input.mirror)
  const queryFingerprint = sha256Hex(canonicalJson({
    source: input.source,
    fromDate: input.query.fromDate,
    toDate: input.query.toDate,
    manufacturer: input.query.manufacturer,
    deviceName: input.query.deviceName,
  }))
  const { error } = await createAdminClient().from('shadow_comparisons').insert({
    source: input.source,
    window_from: input.query.fromDate,
    window_to: input.query.toDate,
    query_fingerprint: queryFingerprint,
    live_count: new Set(input.live.map((item) => item.external_id)).size,
    mirror_count: new Set(input.mirror.map((item) => item.external_id)).size,
    only_live: diff.onlyLive,
    only_mirror: diff.onlyMirror,
    common_count: diff.common,
    agreement: diff.agreement,
  })
  if (error) throw new Error(`Shadow comparison write failed: ${error.message}`)
  return diff
}

