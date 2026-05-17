import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const getRun  = readFileSync(join(process.cwd(), 'app/api/search-runs/[id]/route.ts'), 'utf-8')
const panel   = readFileSync(join(process.cwd(), 'app/dashboard/search/search-panel.tsx'), 'utf-8')
const worker  = readFileSync(join(process.cwd(), 'app/api/worker/process-job/route.ts'), 'utf-8')
const postRun = readFileSync(join(process.cwd(), 'app/api/search-runs/route.ts'), 'utf-8')

describe('Bug 1 — GET /api/search-runs/[id] uses admin client for data queries', () => {
  it('queries fsn_results with admin client', () => {
    expect(getRun).toContain("db.from('fsn_results')")
  })
  it('queries filter_decisions with admin client', () => {
    expect(getRun).toContain("db.from('filter_decisions')")
  })
})

describe('Bug 2 — MODEL_LABEL reflects two-stage pipeline', () => {
  it('does not show sonnet-only label', () => {
    expect(panel).not.toContain("MODEL_LABEL = 'claude-sonnet-4-6'")
  })
  it('shows AI-assisted in the label', () => {
    expect(panel).toContain('AI-assisted')
  })
})

describe('Bug 3 — QStash double delivery prevention', () => {
  it('process-job has idempotency check for non-pending status', () => {
    expect(worker).toContain("status !== 'pending'")
  })
  it('QStash publishJSON uses retries: 0', () => {
    expect(postRun).toContain('retries: 0')
  })
})
