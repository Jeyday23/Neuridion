import { verifyEnvironment } from '@/lib/verify/env'
import type { VerifyProfile } from '@/lib/verify/env'
import { formatIntegrationVerification, verifyIntegrations } from '@/lib/verify/integrations'

function parseArgs(argv: string[]): { mode?: 'development' | 'production'; profile?: VerifyProfile } {
  const modeIndex = argv.indexOf('--mode')
  const mode = modeIndex >= 0 ? argv[modeIndex + 1] : undefined
  if (mode !== undefined && mode !== 'development' && mode !== 'production') {
    throw new Error('--mode must be development or production')
  }
  const profileIndex = argv.indexOf('--profile')
  const profile = profileIndex >= 0 ? argv[profileIndex + 1] : undefined
  if (profile !== undefined && profile !== 'full' && profile !== 'prrc') {
    throw new Error('--profile must be full or prrc')
  }
  return { mode, profile }
}

async function main() {
  const { mode, profile } = parseArgs(process.argv.slice(2))
  const envResult = verifyEnvironment(process.env, { mode, profile })
  if (envResult.mode !== 'production') {
    process.stderr.write('Integration verification requires --mode production or production-like environment.\n')
    process.exit(1)
  }
  if (!envResult.ok) {
    process.stderr.write('Static environment verification must pass before integration verification.\n')
    process.exit(1)
  }
  const result = await verifyIntegrations(process.env, undefined, { profile })
  process.stdout.write(formatIntegrationVerification(result))
  process.exit(result.ok ? 0 : 1)
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
