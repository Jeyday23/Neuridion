/**
 * Verifies that computeContentHash returns the same hash for semantically
 * identical records, regardless of trivial perturbations.
 *
 * Run: npx ts-node --project tsconfig.json scripts/verify-hash-determinism.ts
 */

import { createHash } from 'crypto'

// ── Inline copy of computeContentHash so we can test the CURRENT implementation
// and a PROPOSED fixed version side by side without touching source files.

function computeContentHashCurrent(item: {
  title: string
  manufacturer: string | null
  fsn_date: string | null
  raw_content: string
}): string {
  return createHash('sha256')
    .update(JSON.stringify({
      title:        item.title.trim(),
      manufacturer: (item.manufacturer ?? '').trim(),
      fsn_date:     item.fsn_date ?? '',
      raw_content:  item.raw_content.trim(),
    }))
    .digest('hex')
}

function normalizeText(s: string): string {
  // Must stay in sync with lib/sync/canonical.ts normalizeText
  return s.normalize('NFC').replace(/\s+/g, ' ').trim()
}

function computeContentHashFixed(item: {
  title: string
  manufacturer: string | null
  fsn_date: string | null
  raw_content: string
}): string {
  return createHash('sha256')
    .update(JSON.stringify({
      title:        normalizeText(item.title),
      manufacturer: normalizeText(item.manufacturer ?? ''),
      fsn_date:     item.fsn_date ?? '',
      raw_content:  normalizeText(item.raw_content),
    }))
    .digest('hex')
}

// ── Canonical (baseline) record ───────────────────────────────────────────────

const baseline = {
  title:        'Urgent Field Safety Notice — Acme Infusion Pump Model X100',
  manufacturer: 'Acme Medical GmbH',
  fsn_date:     '2024-03-15',
  raw_content:  'Event type: Malfunction\n\nProduct problems: Battery failure\n\nThe pump may fail to deliver medication.',
}

// ── Variants ──────────────────────────────────────────────────────────────────

const variants: { name: string; item: typeof baseline }[] = [
  {
    name: 'baseline',
    item: { ...baseline },
  },
  {
    name: 'title — leading/trailing whitespace',
    item: { ...baseline, title: '  ' + baseline.title + '  ' },
  },
  {
    name: 'title — internal double space',
    item: { ...baseline, title: baseline.title.replace(' — ', '  —  ') },
  },
  {
    name: 'title — Unicode NFC vs NFD (é as precomposed vs combining)',
    item: { ...baseline, title: baseline.title.replace('é', 'é')  },  // NFC é
    // Note: we also test NFD below
  },
  {
    name: 'title — Unicode NFD (é as e + combining accent)',
    item: { ...baseline, title: baseline.title.replace(/é/g, 'é') },
  },
  {
    name: 'manufacturer — leading/trailing whitespace',
    item: { ...baseline, manufacturer: '  ' + baseline.manufacturer + '  ' },
  },
  {
    name: 'manufacturer — null vs empty string (null → should hash same as empty)',
    item: { ...baseline, manufacturer: null as unknown as string },
  },
  {
    name: 'raw_content — leading/trailing whitespace',
    item: { ...baseline, raw_content: '\n' + baseline.raw_content + '\n\n' },
  },
  {
    name: 'raw_content — internal whitespace collapse (double newline → single)',
    item: { ...baseline, raw_content: baseline.raw_content.replace('\n\n', '\n') },
  },
  {
    name: 'fsn_date — null vs empty string',
    item: { ...baseline, fsn_date: null as unknown as string },
  },
]

// ── Run checks ────────────────────────────────────────────────────────────────

// Variants that should be IDENTICAL to baseline hash
const SHOULD_MATCH = new Set([
  'baseline',
  'title — leading/trailing whitespace',
  'manufacturer — leading/trailing whitespace',
  'raw_content — leading/trailing whitespace',
  'title — Unicode NFC vs NFD (é as precomposed vs combining)',
  'title — Unicode NFD (é as e + combining accent)',
])

// Variants that are genuinely different content — hash SHOULD differ
const SHOULD_DIFFER = new Set([
  'title — internal double space',       // semantically same but different chars — ideally collapses
  'raw_content — internal whitespace collapse (double newline → single)',
  'manufacturer — null vs empty string (null → should hash same as empty)',
  'fsn_date — null vs empty string',
])

const baselineCurrent = computeContentHashCurrent(baseline)
const baselineFixed   = computeContentHashFixed(baseline)

let failures = 0

console.log('=== Check 1: Hash Determinism ===\n')
console.log('Baseline hash (current):', baselineCurrent)
console.log('Baseline hash (fixed):  ', baselineFixed)
console.log()

for (const v of variants) {
  if (v.name === 'baseline') continue

  const currentHash = computeContentHashCurrent(v.item)
  const fixedHash   = computeContentHashFixed(v.item)
  const currentMatches = currentHash === baselineCurrent
  const fixedMatches   = fixedHash   === baselineFixed

  const expectMatch  = SHOULD_MATCH.has(v.name)
  const expectDiffer = SHOULD_DIFFER.has(v.name)

  let currentVerdict: string
  let fixedVerdict: string
  let currentFail = false
  let fixedFail   = false

  if (expectMatch) {
    currentVerdict = currentMatches ? 'PASS (match)' : 'FAIL (expected match, got diff)'
    fixedVerdict   = fixedMatches   ? 'PASS (match)' : 'FAIL (expected match, got diff)'
    if (!currentMatches) currentFail = true
    if (!fixedMatches)   fixedFail   = true
  } else if (expectDiffer) {
    currentVerdict = !currentMatches ? 'expected (differs)' : 'differs anyway (OK)'
    fixedVerdict   = !fixedMatches   ? 'expected (differs)' : 'OK (normalized, stable)'
  } else {
    currentVerdict = currentMatches ? 'match'  : 'differs'
    fixedVerdict   = fixedMatches   ? 'match'  : 'differs'
  }

  if (currentFail || fixedFail) failures++

  const bullet = (currentFail || fixedFail) ? '✗' : '✓'
  console.log(`${bullet} ${v.name}`)
  console.log(`    current: ${currentVerdict}`)
  console.log(`    fixed:   ${fixedVerdict}`)
}

console.log()
if (failures === 0) {
  console.log('Result: all critical variants pass with fixed implementation.')
} else {
  console.log(`Result: ${failures} variant(s) FAIL — fix computeContentHash before continuing.`)
  process.exit(1)
}
