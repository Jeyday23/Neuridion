function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function matchesKeywordTerm(hay: string, rawTerm: string): boolean {
  const normalizeKnownVariants = (value: string) =>
    value.replace(/accu[\s._/-]*check/g, 'accuchek')
  const compact = normalizeKnownVariants(rawTerm
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, ''))
  if (!compact) return false

  const flexible = [...compact].map(escapeRegex).join('[\\s._/\\-]*')
  const hasDigit = /\p{N}/u.test(compact)
  const suffix = hasDigit
    ? '(?=$|[^\\p{L}\\p{N}])'
    : '(?=$|[^\\p{L}\\p{N}]|\\p{N})'
  const normalizedHay = normalizeKnownVariants(hay.normalize('NFKC').toLowerCase())
  return new RegExp(`(^|[^\\p{L}\\p{N}])${flexible}${suffix}`, 'iu').test(normalizedHay)
}

export function matchesKeywordSignature(hay: string, terms: string[]): boolean {
  if (terms.length === 0) return false

  // extractDeviceTerms may emit a model token and its family alias, e.g.
  // COPRA6 + COPRA. Those are alternatives within one signature component;
  // independent components such as ORBIS + Medication must all be present.
  const groups: string[][] = []
  for (const rawTerm of terms) {
    const term = rawTerm.toLowerCase()
    const group = groups.find(candidate => candidate.some(existing =>
      existing.startsWith(term) || term.startsWith(existing),
    ))
    if (group) group.push(term)
    else groups.push([term])
  }

  return groups.every(group => group.some(term => matchesKeywordTerm(hay, term)))
}
