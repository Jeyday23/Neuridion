import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { evaluateAccuracyGate } from './accuracy-gate'
import { accuracyDatasetSchema, accuracyPolicySchema } from './accuracy-gate.schema'

export function runAccuracyGateCli(argv: string[], output: (text: string) => void, error: (text: string) => void): number {
  try {
    if (argv.length !== 4 || new Set([argv[0], argv[2]]).size !== 2
      || ![argv[0], argv[2]].every((flag) => flag === '--dataset' || flag === '--policy')
      || !argv[1] || !argv[3] || argv[1].startsWith('--') || argv[3].startsWith('--')) {
      throw new Error('Usage: npm run verify:accuracy -- --dataset <frozen-dataset.json> --policy <approved-policy.json>')
    }
    const paths = Object.fromEntries([[argv[0], argv[1]], [argv[2], argv[3]]])
    const dataset = accuracyDatasetSchema.parse(JSON.parse(readFileSync(paths['--dataset'], 'utf8')))
    const policy = accuracyPolicySchema.parse(JSON.parse(readFileSync(paths['--policy'], 'utf8')))
    const report = evaluateAccuracyGate(dataset, policy)
    output(`${JSON.stringify(report, null, 2)}\n`)
    return report.release_allowed ? 0 : 1
  } catch (cause) {
    error(`Accuracy gate failed: ${cause instanceof Error ? cause.message : String(cause)}\n`)
    return 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runAccuracyGateCli(process.argv.slice(2), (text) => process.stdout.write(text), (text) => process.stderr.write(text))
}
