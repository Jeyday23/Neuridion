import type { ScheduledSource } from './ingestion/config'

export type IngestionMode = 'live' | 'shadow' | 'mirror'

export function ingestionMode(
  source: ScheduledSource,
  env: Record<string, string | undefined> = process.env,
): IngestionMode {
  const value = env[`INGEST_MODE_${source.toUpperCase()}`]
  return value === 'shadow' || value === 'mirror' ? value : 'live'
}
