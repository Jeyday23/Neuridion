import golden from '@/__tests__/fixtures/bfarm-pms-2026.json'
import { auditKeywordRelevance } from '@/lib/pipeline/stages/scrape'
import { scrapeBfarm } from '@/lib/scrapers/bfarm'

const PROFILE = {
  manufacturer: 'COPRA System GmbH',
  device_name: 'COPRA6',
}
const PERIOD = { from: '2026-01-05', to: '2026-04-30' }
const COPRA_REFERENCE = '14727/26'

async function main(): Promise<void> {
  console.error('\nReviewed PMS accuracy gate')
  console.error(`Authority: BfArM | Period: ${PERIOD.from}..${PERIOD.to}`)

  const result = await scrapeBfarm({
    fromDate: PERIOD.from,
    toDate: PERIOD.to,
    profile: PROFILE,
    searchTerms: ['copra', 'copra6'],
  })

  const expectedIds = golden.map(record => record.reference.replace('/', '-'))
  const actualIds = new Set(result.items.map(item => item.external_id))
  const missing = golden.filter(record => !actualIds.has(record.reference.replace('/', '-')))
  const duplicateCount = result.items.length - actualIds.size
  const filterAudit = auditKeywordRelevance(result.items, PROFILE, [])
  const copraId = COPRA_REFERENCE.replace('/', '-')
  const targetMatches = filterAudit.items.filter(item => item.external_id === copraId)
  const recall = expectedIds.length === 0 ? 0 : (expectedIds.length - missing.length) / expectedIds.length
  const precision = filterAudit.items.length === 1 && targetMatches.length === 1 ? 1 : 0
  const currentCopra = result.items.find(item => item.external_id === copraId)
  const reviewedCopra = golden.find(record => record.reference === COPRA_REFERENCE)

  console.error(`Source outcome:       ${result.outcome}`)
  console.error(`Source warnings:      ${result.warnings.length}`)
  console.error(`Reviewed recall:      ${expectedIds.length - missing.length}/${expectedIds.length} (${(recall * 100).toFixed(1)}%)`)
  console.error(`Profile precision:    ${targetMatches.length}/${filterAudit.items.length} (${(precision * 100).toFixed(1)}%)`)
  console.error(`Duplicate records:    ${duplicateCount}`)
  console.error(`COPRA snapshot date:  ${reviewedCopra?.date ?? 'unknown'}`)
  console.error(`COPRA authority date: ${currentCopra?.fsn_date ?? 'missing'}`)

  const failures: string[] = []
  if (result.outcome !== 'complete') failures.push(`source outcome was ${result.outcome}`)
  if (result.warnings.length > 0) failures.push(`${result.warnings.length} source warning(s)`)
  if (missing.length > 0) failures.push(`missing reviewed IDs: ${missing.map(record => record.reference).join(', ')}`)
  if (precision !== 1) failures.push(`profile filter retained IDs: ${filterAudit.items.map(item => item.external_id).join(', ') || 'none'}`)
  if (duplicateCount > 0) failures.push(`${duplicateCount} duplicate record(s)`)

  if (failures.length > 0) {
    throw new Error(`Reviewed PMS accuracy gate failed: ${failures.join('; ')}`)
  }

  console.error('RESULT: PASS — audited recall and precision are 100%')
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
