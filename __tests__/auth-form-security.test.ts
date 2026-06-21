import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

function source(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8')
}

describe('authentication form transport', () => {
  it('keeps password credentials out of URL query strings before hydration', () => {
    expect(source('app/login/login-form.tsx')).toContain(
      '<form method="post" onSubmit={handleSubmit}',
    )
  })

  it('uses the same safe fallback for the email-code login form', () => {
    expect(source('app/login/sign-in-page.tsx')).toContain(
      '<form method="post" onSubmit={handleEmailSubmit}',
    )
  })
})
