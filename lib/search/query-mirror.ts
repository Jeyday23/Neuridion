import { createAdminClient } from '@/lib/supabase/admin'
import { getCoveredRanges, computeUncoveredRanges } from '@/lib/sync/coverage'
import { filterByKeywordRelevance } from '@/lib/pipeline/stages/scrape'
import type { ScrapedFsn } from '@/lib/scrapers/bfarm'
import type { ScheduledSource } from '@/lib/ingestion/config'

export interface MirrorQuery {
  sources: ScheduledSource[]
  fromDate: string
  toDate: string
  manufacturer: string
  deviceName: string
  requireCoverage?: boolean
}

export class MirrorCoverageError extends Error {
  constructor(public readonly source: ScheduledSource) {
    super(`Mirror coverage is incomplete for ${source}`)
    this.name = 'MirrorCoverageError'
  }
}

async function assertCoverage(source: ScheduledSource, fromDate: string, toDate: string): Promise<void> {
  const covered = await getCoveredRanges(source)
  if (computeUncoveredRanges(covered, fromDate, toDate).length > 0) {
    throw new MirrorCoverageError(source)
  }
}

export async function queryMirror(query: MirrorQuery): Promise<ScrapedFsn[]> {
  const db = createAdminClient()
  const requireCoverage = query.requireCoverage !== false
  if (requireCoverage) {
    await Promise.all(query.sources.map((source) => assertCoverage(source, query.fromDate, query.toDate)))
  }

  const batches = await Promise.all(query.sources.map(async (source) => {
    const rows: ScrapedFsn[] = []
    const pageSize = 1000
    const safetyCap = 50_000
    for (let offset = 0; offset < safetyCap; offset += pageSize) {
      const { data, error } = await db.from('fsn_canonical')
        .select('source_record_id,title,manufacturer,product_name,fsn_date,source_url,raw_content')
        .eq('source', source)
        .gte('fsn_date', query.fromDate)
        .lte('fsn_date', query.toDate)
        .order('fsn_date', { ascending: false })
        .range(offset, offset + pageSize - 1)
      if (error) throw new Error(`Mirror query failed for ${source}: ${error.message}`)
      const page = (data ?? []).map((row): ScrapedFsn => ({
        external_id: row.source_record_id,
        title: row.title,
        manufacturer: row.manufacturer,
        product_name: row.product_name,
        fsn_date: row.fsn_date,
        source_url: row.source_url ?? '',
        raw_content: row.raw_content,
        source_db: source,
      }))
      rows.push(...page)
      if (page.length < pageSize) return rows
    }
    throw new Error(`Mirror query safety cap exceeded for ${source}`)
  }))

  return filterByKeywordRelevance(
    batches.flat(),
    { manufacturer: query.manufacturer, device_name: query.deviceName },
    [],
  )
}
