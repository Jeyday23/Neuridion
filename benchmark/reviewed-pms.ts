import golden from '@/__tests__/fixtures/bfarm-pms-2026.json'
import { auditKeywordRelevance } from '@/lib/pipeline/stages/scrape'
import { scrapeBfarm } from '@/lib/scrapers/bfarm'

const PROFILE = {
  manufacturer: 'COPRA System GmbH',
  device_name: 'COPRA6',
}
const COPRA_REFERENCE = '14727/26'

const AUTHORITY_REVISIONS: Record<string, { date?: string; manufacturer?: string; reason: string }> = {
  '14727/26': { date: '2026-04-29', reason: 'BfArM currently publishes a revised COPRA6 notice date' },
  '61735/25': { manufacturer: 'Meierhofer Medizintechnik', reason: 'BfArM currently omits the GmbH legal suffix' },
  '01737/26': { date: '2026-07-14', reason: 'BfArM currently publishes a revised ORBIS Medication notice date (verified live 2026-08-30)' },
}

interface AcknowledgedAddition {
  reference: string
  manufacturer: string
  product: string
  date: string
  reason: string
}

// Authority-side records confirmed correct during a live audit but discovered
// after the reviewed golden snapshot was signed off. They are intentionally
// excluded from reviewed recall and field-agreement denominators, and remain
// pending human PRRC review until explicitly folded into the golden fixture.
const ACKNOWLEDGED_ADDITIONS: AcknowledgedAddition[] = [
  {
    reference: '27552/26',
    manufacturer: 'COPRA System GmbH',
    product: 'COPRA6',
    date: '2026-06-30',
    reason: 'BfArM published a new COPRA6 FSN after the reviewed snapshot, discovered in the 2026-08-30 live audit; pending human PRRC review',
  },
]

function latestDate(dates: string[]): string {
  return dates.reduce((latest, date) => (date > latest ? date : latest))
}

// The window end is derived, never hand-edited: it always covers every date
// the gate currently knows about (golden snapshot, acknowledged authority
// revisions, and acknowledged post-review additions).
const PERIOD = {
  from: '2026-01-05',
  to: latestDate([
    ...golden.map(record => record.date),
    ...Object.values(AUTHORITY_REVISIONS)
      .map(revision => revision.date)
      .filter((date): date is string => Boolean(date)),
    ...ACKNOWLEDGED_ADDITIONS.map(addition => addition.date),
  ]),
}

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

  // Exact-set profile precision: the COPRA filter must retain the reviewed
  // target plus any acknowledged additions matching this profile — nothing
  // unacknowledged, nothing missing.
  const acknowledgedCopraIds = ACKNOWLEDGED_ADDITIONS
    .filter(addition => addition.manufacturer === PROFILE.manufacturer && addition.product === PROFILE.device_name)
    .map(addition => addition.reference.replace('/', '-'))
  const expectedProfileIds = [...new Set([copraId, ...acknowledgedCopraIds])].sort()
  const actualProfileIds = filterAudit.items.map(item => item.external_id).sort()
  const unacknowledgedProfileIds = actualProfileIds.filter(id => !expectedProfileIds.includes(id))
  const absentProfileIds = expectedProfileIds.filter(id => !actualProfileIds.includes(id))
  const precisionExact = unacknowledgedProfileIds.length === 0 && absentProfileIds.length === 0

  const recall = expectedIds.length === 0 ? 0 : (expectedIds.length - missing.length) / expectedIds.length
  const currentCopra = result.items.find(item => item.external_id === copraId)
  const reviewedCopra = golden.find(record => record.reference === COPRA_REFERENCE)
  const fieldAudit = golden.map(record => {
    const item = result.items.find(candidate => candidate.external_id === record.reference.replace('/', '-'))
    const revision = AUTHORITY_REVISIONS[record.reference]
    return {
      record,
      item,
      expectedDate: revision?.date ?? record.date,
      expectedManufacturer: revision?.manufacturer ?? record.manufacturer,
      revision,
    }
  })
  const productMatches = fieldAudit.filter(({ record, item }) => item?.product_name === record.product).length
  const currentDateMatches = fieldAudit.filter(({ item, expectedDate }) => item?.fsn_date === expectedDate).length
  const currentManufacturerMatches = fieldAudit.filter(({ item, expectedManufacturer }) => item?.manufacturer === expectedManufacturer).length
  const snapshotDateMatches = fieldAudit.filter(({ record, item }) => item?.fsn_date === record.date).length
  const snapshotManufacturerMatches = fieldAudit.filter(({ record, item }) => item?.manufacturer === record.manufacturer).length
  const metadataPollution = result.items.filter(item => /(?:\bPDF,|\bDatum:)/i.test(item.manufacturer ?? ''))
  // Restricted to expected (golden) IDs — acknowledged additions and any
  // other new authority records must never leak into the profile audits.
  const reviewedItems = result.items.filter(item => actualIds.has(item.external_id) && expectedIds.includes(item.external_id))
  const reviewedProfiles = [...new Map(golden.map(record => [
    `${record.manufacturer}|${record.product}`,
    { manufacturer: record.manufacturer, device_name: record.product },
  ])).values()]
  const profileAudits = reviewedProfiles.map(profile => {
    const expected = golden
      .filter(record => record.manufacturer === profile.manufacturer && record.product === profile.device_name)
      .map(record => record.reference.replace('/', '-'))
      .sort()
    const actual = auditKeywordRelevance(reviewedItems, profile, []).items
      .map(item => item.external_id)
      .sort()
    return { profile, expected, actual, exact: JSON.stringify(expected) === JSON.stringify(actual) }
  })
  const exactProfileMatches = profileAudits.filter(audit => audit.exact).length

  console.error(`Source outcome:       ${result.outcome}`)
  console.error(`Source warnings:      ${result.warnings.length}`)
  console.error(`Reviewed recall:      ${expectedIds.length - missing.length}/${expectedIds.length} (${(recall * 100).toFixed(1)}%)`)
  console.error(`Profile precision:    exact-set ${precisionExact ? 'PASS' : 'FAIL'} (expected: ${expectedProfileIds.join(', ') || 'none'}; actual: ${actualProfileIds.join(', ') || 'none'})`)
  console.error(`Duplicate records:    ${duplicateCount}`)
  console.error(`Product fields:       ${productMatches}/${golden.length} current-authority agreement`)
  console.error(`Date fields:          ${currentDateMatches}/${golden.length} current; ${snapshotDateMatches}/${golden.length} original snapshot`)
  console.error(`Manufacturer fields:  ${currentManufacturerMatches}/${golden.length} current; ${snapshotManufacturerMatches}/${golden.length} original snapshot`)
  console.error(`Metadata pollution:   ${metadataPollution.length}`)
  console.error(`Product-title profiles:${exactProfileMatches}/${profileAudits.length} exact reviewed-ID sets`)
  console.error(`COPRA snapshot date:  ${reviewedCopra?.date ?? 'unknown'}`)
  console.error(`COPRA authority date: ${currentCopra?.fsn_date ?? 'missing'}`)
  for (const [reference, revision] of Object.entries(AUTHORITY_REVISIONS)) {
    console.error(`Authority revision:   ${reference} — ${revision.reason}`)
  }
  for (const addition of ACKNOWLEDGED_ADDITIONS) {
    console.error(`Acknowledged addition: ${addition.reference} — ${addition.manufacturer} / ${addition.product} @ ${addition.date} — ${addition.reason} [PENDING PRRC REVIEW]`)
  }

  const failures: string[] = []
  if (result.outcome !== 'complete') failures.push(`source outcome was ${result.outcome}`)
  if (result.warnings.length > 0) failures.push(`${result.warnings.length} source warning(s)`)
  if (missing.length > 0) failures.push(`missing reviewed IDs: ${missing.map(record => record.reference).join(', ')}`)
  if (!precisionExact) {
    const details: string[] = []
    if (unacknowledgedProfileIds.length > 0) details.push(`unacknowledged ID(s) retained: ${unacknowledgedProfileIds.join(', ')}`)
    if (absentProfileIds.length > 0) details.push(`expected ID(s) absent: ${absentProfileIds.join(', ')}`)
    failures.push(`profile filter exact-set mismatch — ${details.join('; ')}`)
  }
  if (duplicateCount > 0) failures.push(`${duplicateCount} duplicate record(s)`)
  if (productMatches !== golden.length) failures.push(`product agreement was ${productMatches}/${golden.length}`)
  if (currentDateMatches !== golden.length) failures.push(`current-authority date agreement was ${currentDateMatches}/${golden.length}`)
  if (currentManufacturerMatches !== golden.length) failures.push(`current-authority manufacturer agreement was ${currentManufacturerMatches}/${golden.length}`)
  if (metadataPollution.length > 0) failures.push(`${metadataPollution.length} manufacturer field(s) contained teaser metadata`)
  if (exactProfileMatches !== profileAudits.length) {
    failures.push(`multi-product title accuracy was ${exactProfileMatches}/${profileAudits.length}: ${profileAudits.filter(audit => !audit.exact).map(audit => audit.profile.device_name).join(', ')}`)
  }

  if (failures.length > 0) {
    throw new Error(`Reviewed PMS accuracy gate failed: ${failures.join('; ')}`)
  }

  console.error('RESULT: PASS — reviewed identities, current fields, and profile selection agree with current authority data')
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
