import { spawnSync } from 'child_process'
import { loadEnvConfig } from '@next/env'

const separatorIndex = process.argv.indexOf('--')
if (separatorIndex < 0 || separatorIndex === process.argv.length - 1) {
  process.stderr.write('Usage: tsx scripts/with-env.ts -- <command> [args...]\n')
  process.exit(1)
}

loadEnvConfig(process.cwd(), false)

const [command, ...args] = process.argv.slice(separatorIndex + 1)
const result = spawnSync(command, args, {
  stdio: 'inherit',
  env: process.env,
  shell: process.platform === 'win32',
})

process.exit(result.status ?? 1)
