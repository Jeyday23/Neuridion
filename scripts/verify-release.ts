import { spawnSync } from 'child_process'

const steps = [
  ['npm', ['run', 'verify:env', '--', '--mode', 'production']],
  ['npm', ['run', 'verify:integrations', '--', '--mode', 'production']],
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
