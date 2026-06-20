import { SOURCE_AUTHORITY } from '@/lib/evidence/source-authority'
import type { SourceName } from '@/lib/evidence/types'

export type ScheduledSource = 'swissmedic' | 'mhra' | 'bfarm'

export interface SourceSchedule {
  source: ScheduledSource
  overlapDays: number
  lookbackDays: number
  maxItemsPerRun: number
}

export const INGESTION_SCHEDULES: Record<ScheduledSource, SourceSchedule> = {
  swissmedic: { source: 'swissmedic', overlapDays: 14, lookbackDays: 1095, maxItemsPerRun: 1500 },
  mhra: { source: 'mhra', overlapDays: 14, lookbackDays: 1095, maxItemsPerRun: 1500 },
  bfarm: { source: 'bfarm', overlapDays: 14, lookbackDays: 1095, maxItemsPerRun: 1500 },
}

export function isScheduledSource(source: string): source is ScheduledSource {
  return source in INGESTION_SCHEDULES
}

export function scheduledSources(
  raw = process.env.SCHEDULED_INGESTION_SOURCES ?? '',
): ScheduledSource[] {
  return [...new Set(raw.split(',').map((source) => source.trim()).filter(isScheduledSource))]
    .filter((source) => {
      const contract = SOURCE_AUTHORITY[source as SourceName]
      return contract.operational && contract.evidenceClass !== 'adverse_event_signal'
    })
}

