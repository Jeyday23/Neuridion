import { formatEnvVerification, verifyEnvironment } from '@/lib/verify/env'

function parseArgs(argv: string[]): { mode?: 'development' | 'production'; strictRecommended: boolean } {
  const modeIndex = argv.indexOf('--mode')
  const mode = modeIndex >= 0 ? argv[modeIndex + 1] : undefined
  if (mode !== undefined && mode !== 'development' && mode !== 'production') {
    throw new Error('--mode must be development or production')
  }
  return { mode, strictRecommended: argv.includes('--strict-recommended') }
}

try {
  const options = parseArgs(process.argv.slice(2))
  const result = verifyEnvironment(process.env, options)
  process.stdout.write(formatEnvVerification(result))
  process.exit(result.ok ? 0 : 1)
} catch (err) {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
}
