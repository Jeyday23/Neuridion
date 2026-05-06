import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Structural test: verifies the POST /api/search-runs route uses the async
// QStash architecture — not an inline synchronous pipeline call. This guards
// against accidental reversion to synchronous mode (which times out at 100s
// under Cloudflare).
describe('POST /api/search-runs — async QStash architecture', () => {
  const source = readFileSync(
    join(process.cwd(), 'app/api/search-runs/route.ts'),
    'utf-8',
  )

  it('does not call runSearchPipeline inline', () => {
    expect(source).not.toContain('await runSearchPipeline(')
  })

  it('publishes to QStash', () => {
    expect(source).toContain('qstash.publishJSON')
  })

  it('returns pending status immediately', () => {
    expect(source).toContain("status: 'pending'")
  })

  it('inserts a search_job_queue row for worker payload recovery', () => {
    expect(source).toContain('search_job_queue')
  })
})
