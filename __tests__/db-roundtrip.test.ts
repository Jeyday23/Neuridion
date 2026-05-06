import { describe, it, expect, afterEach } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/supabase'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

const SKIP = !url || !key

const db = SKIP
  ? null
  : createClient<Database>(url!, key!)

// Synthetic IDs — cleaned up in afterEach
const TEST_RUN_ID    = '00000000-0000-0000-0000-000000000001'
const TEST_RESULT_ID = '00000000-0000-0000-0000-000000000002'

afterEach(async () => {
  if (!db) return
  await db.from('filter_decisions').delete().eq('search_run_id', TEST_RUN_ID)
  await db.from('fsn_results').delete().eq('id', TEST_RESULT_ID)
})

describe('fsn_results DB round-trip', () => {
  it.skipIf(SKIP)('inserts a row with source_db populated and reads it back', async () => {
    const { data, error } = await db!
      .from('fsn_results')
      .insert({
        id:          TEST_RESULT_ID,
        run_id:      TEST_RUN_ID,
        external_id: 'test-ext-001',
        title:       'Test FSN Entry',
        manufacturer: 'Test Manufacturer GmbH',
        source_db:   'bfarm',
        source_url:  'https://example.com/fsn/001',
        fsn_date:    '2024-03-15',
        raw_content: 'test raw content',
      })
      .select('id, source_db, run_id')
      .single()

    expect(error).toBeNull()
    expect(data).not.toBeNull()
    expect(data!.source_db).toBe('bfarm')
    expect(data!.run_id).toBe(TEST_RUN_ID)
  })
})

describe('filter_decisions DB round-trip', () => {
  it.skipIf(SKIP)('inserts a row with stage populated and reads it back', async () => {
    // Ensure fsn_result exists for FK
    await db!.from('fsn_results').insert({
      id:          TEST_RESULT_ID,
      run_id:      TEST_RUN_ID,
      external_id: 'test-ext-002',
      title:       'Test FSN for filter',
      source_db:   'bfarm',
    })

    const { data, error } = await db!
      .from('filter_decisions')
      .insert({
        fsn_result_id: TEST_RESULT_ID,
        search_run_id: TEST_RUN_ID,
        decision:      'relevant',
        rationale:     'Device matches intended use',
        confidence:    0.92,
        model_used:    'claude-sonnet-4-5',
        stage:         'stage1',
      })
      .select('id, stage, decision')
      .single()

    expect(error).toBeNull()
    expect(data).not.toBeNull()
    expect(data!.stage).toBe('stage1')
    expect(data!.decision).toBe('relevant')
  })
})
