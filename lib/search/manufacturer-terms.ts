const LEGAL_SUFFIXES = new Set([
  'gmbh', 'ag', 'ltd', 'inc', 'corp', 'corporation', 'co', 'sa', 'bv', 'nv',
  'sas', 'kg', 'ohg', 'se', 'plc', 'llc', 'lp', 'ab', 'oy', 'as', 'spa',
  'srl', 'sarl', 'bvba', 'aps',
])

// Generic words that appear in device names but are too broad to use as search tokens
const GENERIC_DEVICE_WORDS = new Set([
  'swiss', 'medical', 'systems', 'system', 'device', 'devices', 'care', 'health',
  'healthcare', 'plus', 'pro', 'type', 'class', 'series', 'model',
  'protect', 'surgical', 'sterile', 'disposable', 'reusable',
  'ultra', 'guide', 'advanced', 'digital', 'smart', 'connect',
  'scanner', 'scanners', 'new', 'one', 'two', 'three',
])

export function extractManufacturerTerms(manufacturer: string): string[] {
  if (!manufacturer.trim()) return []

  const cleaned = manufacturer.replace(/[.,()&]/g, ' ')
  const tokens  = cleaned.split(/\s+/).filter(Boolean)

  const meaningful = tokens
    .map(t => t.toLowerCase())
    .filter(t => t.length >= 2 && !LEGAL_SUFFIXES.has(t))

  return meaningful.slice(0, 2)
}

export function buildManufacturerSearchTerms(
  manufacturer: string,
  deviceName?: string,
): string[] {
  const mfrTerms = extractManufacturerTerms(manufacturer)

  if (!deviceName?.trim()) return mfrTerms

  const deviceTokens = deviceName
    .replace(/[.,()&]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(t => t.toLowerCase())
    .filter(t => t.length > 4 && !LEGAL_SUFFIXES.has(t) && !GENERIC_DEVICE_WORDS.has(t))

  const extra = deviceTokens.find(t => !mfrTerms.includes(t))

  if (extra) return [...new Set([...mfrTerms, extra])]
  return mfrTerms
}
