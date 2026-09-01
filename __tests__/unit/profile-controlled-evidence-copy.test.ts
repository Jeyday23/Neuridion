import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const formSources = [
  'app/dashboard/profiles/new/profile-form.tsx',
  'app/dashboard/profiles/[id]/edit/edit-form.tsx',
].map((path) => readFileSync(join(process.cwd(), path), 'utf8'))

describe('profile controlled-evidence copy', () => {
  it.each(formSources)('states that controlled evidence is used and can fail closed', (source) => {
    expect(source).toContain('Controlled product and PMS evidence')
    expect(source).toContain('bounded, sanitized text extract is used by the AI')
    expect(source).toContain('AI classification is blocked')
    expect(source).toContain('PDF, DOCX, XLSX, or TXT')
    expect(source).not.toContain('not read by the AI during classification')
  })
})
