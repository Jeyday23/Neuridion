import { describe, expect, it, vi } from 'vitest'
import { insertResultsStage } from '@/lib/pipeline/stages/insert-results'
import { persistDecisionsStage } from '@/lib/pipeline/stages/persist-decisions'
import { EVIDENCE_SCHEMA_WARNING, isMissingEvidenceLinkColumn } from '@/lib/pipeline/schema-compat'
import type { PipelineContext } from '@/lib/pipeline/types'

function context(db: PipelineContext['db']): PipelineContext {
  return {
    runId: 'run-1',
    payload: {
      profile_id: 'profile-1', period_from: '2026-06-01', period_to: '2026-06-20',
      selected_dbs: ['bfarm'], user_id: 'user-1', force_refresh: false,
    },
    db,
    profile: {
      device_name: 'Pump', manufacturer: 'Acme', intended_use: null,
      emdn_code: null, device_class: null, search_strategy: null,
    },
    aiOptOut: false,
    searchTerms: [],
    competitorTerms: [],
    activeSources: ['bfarm'],
    items: [{
      external_id: 'notice-1', title: 'Notice', manufacturer: 'Acme', product_name: 'Pump',
      fsn_date: '2026-06-19', source_url: 'https://example.test/notice-1',
      raw_content: 'Evidence', source_db: 'bfarm',
    }],
    contentChanged: new Set(),
    canonicalIds: new Map([['notice-1', 'canonical-1']]),
    authorityRevisionIds: new Map([['notice-1', 'revision-1']]),
    insertedRows: [],
    decisions: [],
    warnings: [],
    timing: {},
    isCancelled: async () => false,
  }
}

describe('pipeline evidence schema compatibility', () => {
  it('recognizes only missing evidence-link schema errors', () => {
    expect(isMissingEvidenceLinkColumn({
      code: 'PGRST204', message: "Could not find the 'authority_revision_id' column",
    })).toBe(true)
    expect(isMissingEvidenceLinkColumn({ code: 'PGRST204', message: "Could not find the 'title' column" })).toBe(false)
    expect(isMissingEvidenceLinkColumn({ code: '23505', message: 'authority_revision_id duplicate' })).toBe(false)
  })

  it('retries fsn_results without the optional revision link', async () => {
    const insertedPayloads: unknown[][] = []
    const selectedColumns: string[] = []
    const db = {
      from: vi.fn(() => ({
        insert: vi.fn((rows: unknown[]) => {
          insertedPayloads.push(rows)
          return {
            select: vi.fn(async (columns: string) => {
              selectedColumns.push(columns)
              if (insertedPayloads.length === 1) return {
                data: null,
                error: { code: 'PGRST204', message: "Could not find the 'authority_revision_id' column" },
              }
              return {
                data: [{
                  id: 'result-1', external_id: 'notice-1', title: 'Notice', manufacturer: 'Acme',
                  raw_content: 'Evidence', fsn_date: '2026-06-19', source_db: 'bfarm',
                  source_url: 'https://example.test/notice-1',
                }],
                error: null,
              }
            }),
          }
        }),
      })),
    } as unknown as PipelineContext['db']
    const ctx = context(db)

    await insertResultsStage(ctx)

    expect(insertedPayloads).toHaveLength(2)
    expect(insertedPayloads[0][0]).toMatchObject({ authority_revision_id: 'revision-1' })
    expect(insertedPayloads[1][0]).not.toHaveProperty('authority_revision_id')
    expect(selectedColumns[1]).not.toContain('authority_revision_id')
    expect(ctx.insertedRows[0]).toMatchObject({ id: 'result-1', authority_revision_id: null })
    expect(ctx.warnings).toEqual([EVIDENCE_SCHEMA_WARNING])
  })

  it('retries filter decisions without migration 068 evidence fields', async () => {
    const insertedPayloads: Array<Array<Record<string, unknown>>> = []
    const db = {
      from: vi.fn(() => ({
        insert: vi.fn(async (rows: Array<Record<string, unknown>>) => {
          insertedPayloads.push(rows)
          return insertedPayloads.length === 1
            ? { error: { code: 'PGRST204', message: "Could not find the 'evidence_parser_version' column" } }
            : { error: null }
        }),
      })),
    } as unknown as PipelineContext['db']
    const ctx = context(db)
    ctx.insertedRows = [{
      id: 'result-1', authority_revision_id: 'revision-1', external_id: 'notice-1', title: 'Notice',
      manufacturer: 'Acme', raw_content: 'Evidence', fsn_date: '2026-06-19', source_db: 'bfarm',
      source_url: 'https://example.test/notice-1',
    }]
    ctx.decisions = [{
      fsn_result_id: 'result-1', decision: 'relevant', rationale: 'Match', confidence: 0.9, model: 'test',
    }]

    await persistDecisionsStage(ctx)

    expect(insertedPayloads).toHaveLength(2)
    expect(insertedPayloads[0][0]).toMatchObject({
      authority_revision_id: 'revision-1', evidence_parser_version: 'bfarm@1',
    })
    expect(insertedPayloads[1][0]).not.toHaveProperty('authority_revision_id')
    expect(insertedPayloads[1][0]).not.toHaveProperty('evidence_parser_version')
    expect(ctx.warnings).toEqual([EVIDENCE_SCHEMA_WARNING])
  })
})
