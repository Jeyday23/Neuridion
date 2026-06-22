import { describe, expect, it } from 'vitest'
import golden from './fixtures/bfarm-pms-2026.json'
import { auditKeywordRelevance } from '@/lib/pipeline/stages/scrape'
import type { ScrapedFsn } from '@/lib/scrapers/bfarm'

const reviewedItems: ScrapedFsn[] = golden.map(record => ({
  external_id: record.reference.replace('/', '-'),
  title: `Dringende Sicherheitsinformation zu ${record.product} von ${record.manufacturer}`,
  manufacturer: record.manufacturer,
  product_name: record.product,
  fsn_date: record.date,
  source_url: `https://www.bfarm.de/reviewed/${record.reference.replace('/', '-')}`,
  raw_content: '',
  source_db: 'bfarm',
}))

const profiles = [...new Map(golden.map(record => [
  `${record.manufacturer}|${record.product}`,
  { manufacturer: record.manufacturer, device_name: record.product },
])).values()]

describe('PRRC multi-product title accuracy', () => {
  it.each(profiles)('retains only reviewed $device_name records for $manufacturer', profile => {
    const expectedIds = golden
      .filter(record => record.manufacturer === profile.manufacturer && record.product === profile.device_name)
      .map(record => record.reference.replace('/', '-'))
      .sort()

    const audit = auditKeywordRelevance(reviewedItems, profile, [])
    const actualIds = audit.items.map(item => item.external_id).sort()

    expect(actualIds).toEqual(expectedIds)
  })

  it('rejects shared generic product words from another manufacturer', () => {
    const audit = auditKeywordRelevance(
      reviewedItems,
      { manufacturer: 'DH Healthcare GmbH', device_name: 'ORBIS Medication' },
      [],
    )

    expect(audit.items.every(item => item.product_name === 'ORBIS Medication')).toBe(true)
    expect(audit.items.every(item => item.manufacturer === 'DH Healthcare GmbH')).toBe(true)
  })

  it('rejects a same-manufacturer title for the wrong module', () => {
    const audit = auditKeywordRelevance(
      reviewedItems,
      { manufacturer: 'CompuGroup Medical Deutschland AG', device_name: 'CGM CLINICAL Assessments' },
      [],
    )

    expect(audit.items.map(item => item.external_id)).toEqual(['00269-26'])
  })

  const crossDomainItems: ScrapedFsn[] = [
    ['magnetom', 'MAGNETOM Avanto MRI safety notice', 'Siemens Healthineers', 'MAGNETOM Avanto'],
    ['somatom', 'SOMATOM CT scanner corrective action', 'Siemens Healthineers', 'SOMATOM go.Top'],
    ['infusomat', 'Infusomat Space infusion pump safety notice', 'B. Braun Melsungen AG', 'Infusomat Space'],
    ['dialog', 'Dialog+ dialysis machine field correction', 'B. Braun Melsungen AG', 'Dialog+'],
    ['minimed', 'MiniMed 780G insulin pump urgent correction', 'Medtronic', 'MiniMed 780G'],
    ['micra', 'Micra AV leadless pacemaker safety notice', 'Medtronic', 'Micra AV'],
    ['heartstart', 'HeartStart FRx defibrillator field notice', 'Philips', 'HeartStart FRx'],
    ['ingenia', 'Ingenia Elition MRI software correction', 'Philips', 'Ingenia Elition'],
  ].map(([external_id, title, manufacturer, product_name]) => ({
    external_id, title, manufacturer, product_name,
    fsn_date: '2026-06-01', source_url: `https://authority.example/${external_id}`,
    raw_content: '', source_db: 'test-authority',
  }))

  it.each([
    { profile: { manufacturer: 'Siemens Healthineers', device_name: 'MAGNETOM Avanto' }, expectedIds: ['magnetom'] },
    { profile: { manufacturer: 'B. Braun Melsungen AG', device_name: 'Infusomat Space' }, expectedIds: ['infusomat'] },
    { profile: { manufacturer: 'Medtronic', device_name: 'MiniMed 780G' }, expectedIds: ['minimed'] },
    { profile: { manufacturer: 'Medtronic', device_name: 'Micra AV' }, expectedIds: ['micra'] },
    { profile: { manufacturer: 'Philips', device_name: 'HeartStart FRx' }, expectedIds: ['heartstart'] },
  ])('separates cross-domain title profile $profile.device_name', ({ profile, expectedIds }) => {
    const actualIds = auditKeywordRelevance(crossDomainItems, profile, [])
      .items.map(item => item.external_id)

    expect(actualIds).toEqual(expectedIds)
  })
})
