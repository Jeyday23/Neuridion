import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { getRootDirs } = require('@next/eslint-plugin-next/dist/utils/get-root-dirs')
const root = mkdtempSync(join(tmpdir(), 'neuridion-eslint-'))
mkdirSync(join(root, 'apps', 'web'), { recursive: true })
mkdirSync(join(root, 'apps', 'admin'), { recursive: true })
writeFileSync(join(root, 'apps', 'README.md'), 'fixture')
afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('Next ESLint root discovery with the tinyglobby replacement', () => {
  it('preserves the default working directory', () => {
    expect(getRootDirs({ cwd: root, settings: {} })).toEqual([root])
  })

  it('resolves directory globs without including files', () => {
    expect(getRootDirs({ cwd: root, settings: { next: { rootDir: `${root}/apps/*` } } }).map((dir: string) => resolve(dir)).sort())
      .toEqual([join(root, 'apps', 'admin'), join(root, 'apps', 'web')])
  })

  it('supports arrays, brace patterns, and unmatched directories', () => {
    expect(getRootDirs({ cwd: root, settings: { next: { rootDir: [
      `${root}/apps/{web,admin}`, `${root}/missing/*`, null,
    ] } } }).map((dir: string) => resolve(dir)).sort()).toEqual([join(root, 'apps', 'admin'), join(root, 'apps', 'web')])
  })
})
