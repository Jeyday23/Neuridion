import { spawnSync } from 'child_process'
import type { VerifyProfile } from '@/lib/verify/env'

function parseArgs(argv: string[]): { profile: VerifyProfile } {
  const profileIndex = argv.indexOf('--profile')
  const profile = profileIndex >= 0 ? argv[profileIndex + 1] : 'full'
  if (profile !== 'full' && profile !== 'prrc') {
    throw new Error('--profile must be full or prrc')
  }
  return { profile }
}

const { profile } = parseArgs(process.argv.slice(2))
const profileArgs = profile === 'full' ? [] : ['--profile', profile]

const steps = [
  ['npm', ['run', 'verify:env', '--', '--mode', 'production', ...profileArgs]],
  ['npm', ['run', 'verify:integrations', '--', '--mode', 'production', ...profileArgs]],
  ['npm', ['run', 'lint']],
  ['npx', ['vitest', 'run']],
  ['npm', ['run', 'build']],
] as const

for (const [cmd, args] of steps) {
  process.stdout.write(`\n==> ${cmd} ${args.join(' ')}\n`)
  const result = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' })
  if (result.status !== 0) {
    process.stderr.write(`Release verification failed at: ${cmd} ${args.join(' ')}\n`)
    process.exit(result.status ?? 1)
  }
}

process.stdout.write('\nRelease verification passed.\n')
