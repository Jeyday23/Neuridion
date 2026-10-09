import { describe, expect, it, vi } from 'vitest'
import { verifyReleaseSchema } from '../../lib/verify/release-schema.mjs'

describe('release schema startup gate', () => {
  it('blocks a legacy cache schema even if a version RPC claims compatibility', async () => {
    const result = await verifyReleaseSchema({
      queryColumns: async (table: string) => table !== 'filter_decision_cache',
      schemaVersion: async () => 75,
    })
    expect(result.ok).toBe(false)
    expect(result.failures).toContain('filter_decision_cache: required columns unavailable')
  })

  it('requires the database approval safeguards as well as provenance columns', async () => {
    const result = await verifyReleaseSchema({ queryColumns: async () => true, schemaVersion: async () => 73 })
    expect(result.ok).toBe(false)
  })

  it('does not reveal database errors or credentials', async () => {
    const secret = 'credential-must-not-be-logged'
    const result = await verifyReleaseSchema({
      queryColumns: async () => { throw new Error(secret) },
      schemaVersion: async () => { throw new Error(secret) },
    })
    expect(result.ok).toBe(false)
    expect(JSON.stringify(result)).not.toContain(secret)
  })

  it('passes when both the schema and approval migration are ready', async () => {
    const queryColumns = vi.fn(async () => true)
    const result = await verifyReleaseSchema({ queryColumns, schemaVersion: async () => 75 })
    expect(result).toEqual({ ok: true, failures: [] })
    expect(queryColumns).toHaveBeenCalledWith('review_requirements', expect.stringContaining('filter_decision_id'))
  })
})
