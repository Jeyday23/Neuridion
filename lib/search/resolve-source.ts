import { ingestionMode } from '@/lib/flags'
import { recordShadowComparison } from '@/lib/ingestion/shadow'
import type { ScheduledSource } from '@/lib/ingestion/config'
import type { ScrapedFsn } from '@/lib/scrapers/bfarm'
import { queryMirror, type MirrorQuery } from './query-mirror'

export async function resolveSource(
  source: ScheduledSource,
  query: Omit<MirrorQuery, 'sources'>,
  liveScrape: () => Promise<ScrapedFsn[]>,
): Promise<ScrapedFsn[]> {
  const mode = ingestionMode(source)
  if (mode === 'live') return liveScrape()

  if (mode === 'shadow') {
    const [live, mirror] = await Promise.all([
      liveScrape(),
      queryMirror({ ...query, sources: [source], requireCoverage: false }),
    ])
    recordShadowComparison({ source, query: { ...query, sources: [source] }, live, mirror })
      .catch((error) => console.error('[shadow]', error instanceof Error ? error.message : String(error)))
    return live
  }

  try {
    return await queryMirror({ ...query, sources: [source], requireCoverage: true })
  } catch (error) {
    console.error(`[mirror] ${source} unavailable, falling back to live:`, error instanceof Error ? error.message : String(error))
    return liveScrape()
  }
}

