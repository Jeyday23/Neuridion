import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

describe('report PDF fonts', () => {
  it('does not depend on remote font downloads during report generation', () => {
    const source = readFileSync(join(process.cwd(), 'lib/pdf/report-document.tsx'), 'utf-8')

    expect(source).not.toContain('fonts.gstatic.com')
    expect(source).not.toContain('Font.register')
  })
})
