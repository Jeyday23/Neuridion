import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadEvidenceChainData } from '@/lib/exports/evidence-chain-data'
import type { Database } from '@/types/supabase'

interface QueryTrace {
  table: string
  columns: string
  filters: Array<{ method: string; column: string; value: unknown }>
  orders: string[]
}

function database(trace: QueryTrace[]): SupabaseClient<Database> {
  return {
    from(table: string) {
      return {
        select(columns: string) {
          const entry: QueryTrace = { table, columns, filters: [], orders: [] }
          trace.push(entry)
          const query = {
            eq(column: string, value: unknown) {
              entry.filters.push({ method: 'eq', column, value })
              return query
            },
            in(column: string, value: string[]) {
              entry.filters.push({ method: 'in', column, value })
              return query
            },
            contains(column: string, value: unknown) {
              entry.filters.push({ method: 'contains', column, value })
              return query
            },
            order(column: string) {
              entry.orders.push(column)
              return query
            },
            async range() {
              if (table === 'human_adjudication_events') {
                return { data: null, error: { code: 'PGRST205', message: 'Could not find the table' } }
              }
              if (table === 'product_profiles') {
                return { data: [{ id: 'profile-1', user_id: 'user-1' }], error: null }
              }
              if (table === 'fsn_results') {
                return { data: [{ id: 'result-1', run_id: 'run-1', canonical_id: 'canonical-1' }], error: null }
              }
              if (table === 'filter_decisions') {
                return { data: [{ id: 'decision-1', fsn_result_id: 'result-1', search_run_id: 'run-1' }], error: null }
              }
              return { data: [], error: null }
            },
          }
          return query
        },
      }
    },
  } as unknown as SupabaseClient<Database>
}

describe('evidence-chain data loader', () => {
  it('uses the exact 071/072 contracts, stable composite ordering, and explicit audit columns', async () => {
    const trace: QueryTrace[] = []
    const data = await loadEvidenceChainData(database(trace), {
      id: 'run-1',
      profile_id: 'profile-1',
      user_id: 'user-1',
      is_synthetic_canary: false,
      profile_snapshot: { controlled_evidence_status: 'not_configured', controlled_evidence: [] },
    }, 'user-1')

    const tables = trace.map((entry) => entry.table)
    expect(tables).toEqual(expect.arrayContaining([
      'run_reviewer_assignments',
      'review_requirements',
      'human_adjudication_events',
      'exclusion_review_samples',
    ]))
    expect(tables).not.toEqual(expect.arrayContaining([
      'record_adjudications',
      'validation_samples',
      'controlled_documents',
    ]))
    expect(data.decisions).toHaveLength(1)
    expect(data.availability.human_adjudications).toEqual({
      status: 'unavailable', source_table: null, row_count: 0, reason: 'schema_capability_not_available',
    })
    expect(data.availability.sampling_metadata.source_table).toBe('exclusion_review_samples')

    const artifactQuery = trace.find((entry) => entry.table === 'fetch_artifacts')
    expect(artifactQuery?.orders).toEqual(['fetch_id', 'evidence_id', 'artifact_role'])
    const supersessionQuery = trace.find((entry) => entry.table === 'authority_record_supersessions')
    expect(supersessionQuery?.orders).toEqual(['predecessor_id', 'successor_id'])
    const auditQuery = trace.find((entry) => entry.table === 'audit_log')
    expect(auditQuery?.columns).toBe('id,user_id,event_type,event_data,created_at')
  })

  it('rejects ownership or synthetic-scope violations before querying', async () => {
    const trace: QueryTrace[] = []
    const db = database(trace)
    await expect(loadEvidenceChainData(db, {
      id: 'run-1', profile_id: 'profile-1', user_id: 'other-user', is_synthetic_canary: false,
    }, 'user-1')).rejects.toThrow(/ownership/)
    await expect(loadEvidenceChainData(db, {
      id: 'run-1', profile_id: 'profile-1', user_id: 'user-1', is_synthetic_canary: true,
    }, 'user-1')).rejects.toThrow(/canary/)
    expect(trace).toHaveLength(0)
  })
})
