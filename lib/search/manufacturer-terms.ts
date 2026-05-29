const LEGAL_SUFFIXES = new Set([
  'gmbh', 'ag', 'ltd', 'inc', 'corp', 'corporation', 'co', 'sa', 'bv', 'nv',
  'sas', 'kg', 'ohg', 'se', 'plc', 'llc', 'lp', 'ab', 'oy', 'as', 'spa',
  'srl', 'sarl', 'bvba', 'aps',
])

// Generic words that appear in manufacturer names but are too broad to use as search tokens
const SHORT_BUT_DISTINCTIVE = new Set(['3m', 'ge', 'bd', 'hp', 'lg'])

const GENERIC_MFR_WORDS = new Set([
  'medical', 'healthcare', 'health', 'care', 'systems', 'technologies', 'technology',
  'solutions', 'international', 'global', 'corporation', 'industries',
  'instruments', 'devices', 'products', 'services', 'group', 'company',
])

// Generic words that appear in device names but are too broad to use as search tokens
const GENERIC_DEVICE_WORDS = new Set([
  'swiss', 'medical', 'systems', 'system', 'device', 'devices', 'care', 'health',
  'healthcare', 'plus', 'pro', 'type', 'class', 'series', 'model',
  'protect', 'surgical', 'sterile', 'disposable', 'reusable',
  'ultra', 'guide', 'advanced', 'digital', 'smart', 'connect',
  'scanner', 'scanners', 'new', 'one', 'two', 'three',
])

// Normalise a manufacturer name for tokenisation:
// - Splits CamelCase runs (BBraun → B Braun, MedTech → Med Tech)
// - Replaces all non-letter/non-digit characters with spaces
//   (handles middle dot · U+00B7, en-dash –, em-dash —, slash, etc.)
function normalizeMfr(str: string): string {
  return str
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')        // "BBraun" → "B Braun"
    .replace(/([a-z])([A-Z])(?=[a-z])/g, '$1 $2')  // "MedTech" → "Med Tech"; skips terminal uppercase (GmbH stays intact)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')           // Unicode/ASCII punct → space
    .replace(/\s+/g, ' ')
    .trim()
}

export function extractManufacturerTerms(manufacturer: string): string[] {
  if (!manufacturer.trim()) return []

  const cleaned = normalizeMfr(manufacturer)
  const tokens  = cleaned.split(/\s+/).filter(Boolean)

  const meaningful = tokens
    .map(t => t.toLowerCase())
    .filter(t =>
      (t.length >= 3 || SHORT_BUT_DISTINCTIVE.has(t)) &&
      !LEGAL_SUFFIXES.has(t) &&
      !GENERIC_MFR_WORDS.has(t),
    )

  return meaningful.slice(0, 3)
}

export function buildManufacturerSearchTerms(
  manufacturer: string,
  deviceName?: string,
): string[] {
  const mfrTerms = extractManufacturerTerms(manufacturer)

  if (!deviceName?.trim()) return mfrTerms

  const deviceTokens = deviceName
    // Keep ASCII hyphen so "Accu-Chek" stays as one token; normalise everything else
    .replace(/[^\p{L}\p{N}\s\-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(t => t.toLowerCase())
    .filter(t =>
      (t.length > 4 || (t.length >= 3 && /\d/.test(t) && /[a-zA-Z]/.test(t))) &&
      !LEGAL_SUFFIXES.has(t) &&
      !GENERIC_DEVICE_WORDS.has(t),
    )

  const extras = deviceTokens
    .filter(t => !mfrTerms.includes(t))
    .slice(0, 2)
  if (extras.length > 0) return [...new Set([...mfrTerms, ...extras])]
  return mfrTerms
}

const MAX_TOKENS_PER_ENTRY = 3
const MAX_TOTAL_COMPETITOR_TOKENS = 20

export function extractCompetitorTokens(
  entries: Array<{ name: string; manufacturer?: string }>,
): string[] {
  const tokens = new Set<string>()

  for (const entry of entries) {
    if (entry.name?.trim()) {
      const nameTokens = entry.name
        .replace(/[^\p{L}\p{N}\s.\-]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map(t => t.toLowerCase())
        .filter(t =>
          (t.length >= 3 || SHORT_BUT_DISTINCTIVE.has(t)) &&
          !LEGAL_SUFFIXES.has(t) &&
          !GENERIC_MFR_WORDS.has(t) &&
          !GENERIC_DEVICE_WORDS.has(t),
        )

      let added = 0
      for (const t of nameTokens) {
        if (added >= MAX_TOKENS_PER_ENTRY) break
        if (!tokens.has(t)) { tokens.add(t); added++ }
      }
    }

    if (entry.manufacturer?.trim()) {
      const mfrTokens = entry.manufacturer
        .replace(/[^\p{L}\p{N}\s.\-]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map(t => t.toLowerCase())
        .filter(t =>
          (t.length >= 3 || SHORT_BUT_DISTINCTIVE.has(t)) &&
          !LEGAL_SUFFIXES.has(t) &&
          !GENERIC_MFR_WORDS.has(t),
        )

      let added = 0
      for (const t of mfrTokens) {
        if (added >= MAX_TOKENS_PER_ENTRY) break
        if (!tokens.has(t)) { tokens.add(t); added++ }
      }
    }
  }

  const result = [...tokens]
  return result.slice(0, MAX_TOTAL_COMPETITOR_TOKENS)
}
