/**
 * Provider-agnostic safety controls for PMS screening.
 *
 * This module deliberately does not call an LLM and does not delete, filter,
 * or otherwise discard a source record. A deterministic exclusion is an
 * auditable disposition signal only; `retention` is always `retain`.
 */

export const DETERMINISTIC_SAFETY_RULESET_VERSION = 'deterministic-safety@2026-09-01'

export type DeterministicExclusionReasonCode =
  | 'DET_EXCLUDE_MANUFACTURER_ID_MISMATCH'
  | 'DET_EXCLUDE_DEVICE_ID_MISMATCH'
  | 'DET_EXCLUDE_NOMENCLATURE_SCOPE_MISMATCH'
  | 'DET_EXCLUDE_DATE_OUTSIDE_SCOPE'
  | 'DET_EXCLUDE_JURISDICTION_OUTSIDE_SCOPE'

export type VigilanceReasonCode =
  | 'VIGILANCE_DEATH'
  | 'VIGILANCE_SERIOUS_DETERIORATION'
  | 'VIGILANCE_SERIOUS_INCIDENT'
  | 'VIGILANCE_FSCA'
  | 'VIGILANCE_RECALL'
  | 'VIGILANCE_FIELD_SAFETY_ACTION'

export interface AuditableIdentifier {
  /** Identifier system, for example `srn`, `udi-di`, `basic-udi-di`, or `duns`. */
  system: string
  value: string
  /** Where the value came from. Required so a mismatch can be reproduced. */
  source: string
}

export interface NomenclatureCode {
  /** Coding system and version, for example `EMDN@2025` or `GMDN@2026`. */
  system: string
  code: string
  source: string
}

export interface DeterministicRecordFacts {
  legalManufacturerIds?: readonly AuditableIdentifier[]
  deviceIds?: readonly AuditableIdentifier[]
  nomenclatureCodes?: readonly NomenclatureCode[]
  recordDate?: string | null
  /** ISO 3166-1 alpha-2 market jurisdiction. */
  jurisdiction?: string | null
}

export interface DeterministicProfileScope {
  legalManufacturerIds?: readonly AuditableIdentifier[]
  deviceIds?: readonly AuditableIdentifier[]
  nomenclatureCodes?: readonly NomenclatureCode[]
  dateWindow?: { from: string; to: string }
  allowedJurisdictions?: readonly string[]
  /**
   * Mismatch is exclusionary only when the PMS plan says this list is an
   * exhaustive scope. Otherwise a different code remains reviewable.
   */
  nomenclatureScopeIsExclusive?: boolean
  /** Same principle as nomenclature: worldwide evidence remains in scope by default. */
  jurisdictionScopeIsExclusive?: boolean
}

export interface DeterministicEvidence {
  reasonCode: DeterministicExclusionReasonCode
  ground: 'manufacturer_id' | 'device_id' | 'nomenclature' | 'date' | 'jurisdiction'
  recordField: string
  profileField: string
  recordValues: readonly string[]
  profileValues: readonly string[]
  explanation: string
}

export interface DeterministicDisposition {
  rulesetVersion: string
  /** Records are never discarded, even when a structured exclusion is established. */
  retention: 'retain'
  disposition: 'excluded' | 'not_excluded'
  reasonCodes: DeterministicExclusionReasonCode[]
  evidence: DeterministicEvidence[]
}

function clean(value: string): string {
  return value.trim().toLocaleLowerCase('en-US')
}

function comparableValues<T extends { source: string }>(
  values: readonly T[] | undefined,
  systemOf: (value: T) => string,
  valueOf: (value: T) => string,
): Map<string, Array<{ value: string; source: string }>> {
  const grouped = new Map<string, Array<{ value: string; source: string }>>()
  for (const item of values ?? []) {
    const system = clean(systemOf(item))
    const value = clean(valueOf(item))
    if (!system || !value || !item.source.trim()) continue
    const group = grouped.get(system) ?? []
    group.push({ value, source: item.source })
    grouped.set(system, group)
  }
  return grouped
}

function mismatchEvidence(input: {
  record: Map<string, Array<{ value: string; source: string }>>
  profile: Map<string, Array<{ value: string; source: string }>>
  reasonCode: DeterministicExclusionReasonCode
  ground: DeterministicEvidence['ground']
  recordField: string
  profileField: string
  explanation: (system: string) => string
}): DeterministicEvidence | null {
  for (const [system, recordItems] of input.record) {
    const profileItems = input.profile.get(system)
    if (!profileItems) continue

    const recordValues = [...new Set(recordItems.map((item) => item.value))]
    const profileValues = [...new Set(profileItems.map((item) => item.value))]
    if (recordValues.some((value) => profileValues.includes(value))) return null

    return {
      reasonCode: input.reasonCode,
      ground: input.ground,
      recordField: input.recordField,
      profileField: input.profileField,
      recordValues: recordValues.map((value) => `${system}:${value}`),
      profileValues: profileValues.map((value) => `${system}:${value}`),
      explanation: input.explanation(system),
    }
  }
  return null
}

function validIsoDate(value: string | null | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value
    ? null
    : value
}

/**
 * Establishes deterministic exclusion only from structured, mutually
 * comparable facts. Manufacturer names and unstructured descriptions are
 * intentionally absent from this API because they are not safe exclusion grounds.
 */
export function assessDeterministicDisposition(input: {
  record: DeterministicRecordFacts
  profile: DeterministicProfileScope
}): DeterministicDisposition {
  const evidence: DeterministicEvidence[] = []

  const manufacturerMismatch = mismatchEvidence({
    record: comparableValues(input.record.legalManufacturerIds, (item) => item.system, (item) => item.value),
    profile: comparableValues(input.profile.legalManufacturerIds, (item) => item.system, (item) => item.value),
    reasonCode: 'DET_EXCLUDE_MANUFACTURER_ID_MISMATCH',
    ground: 'manufacturer_id',
    recordField: 'record.legalManufacturerIds',
    profileField: 'profile.legalManufacturerIds',
    explanation: (system) => `Verified legal-manufacturer identifiers differ in the shared ${system} system.`,
  })
  if (manufacturerMismatch) evidence.push(manufacturerMismatch)

  const deviceMismatch = mismatchEvidence({
    record: comparableValues(input.record.deviceIds, (item) => item.system, (item) => item.value),
    profile: comparableValues(input.profile.deviceIds, (item) => item.system, (item) => item.value),
    reasonCode: 'DET_EXCLUDE_DEVICE_ID_MISMATCH',
    ground: 'device_id',
    recordField: 'record.deviceIds',
    profileField: 'profile.deviceIds',
    explanation: (system) => `Verified device identifiers differ in the shared ${system} system.`,
  })
  if (deviceMismatch) evidence.push(deviceMismatch)

  if (input.profile.nomenclatureScopeIsExclusive) {
    const nomenclatureMismatch = mismatchEvidence({
      record: comparableValues(input.record.nomenclatureCodes, (item) => item.system, (item) => item.code),
      profile: comparableValues(input.profile.nomenclatureCodes, (item) => item.system, (item) => item.code),
      reasonCode: 'DET_EXCLUDE_NOMENCLATURE_SCOPE_MISMATCH',
      ground: 'nomenclature',
      recordField: 'record.nomenclatureCodes',
      profileField: 'profile.nomenclatureCodes',
      explanation: (system) => `Record is outside the explicitly exhaustive ${system} nomenclature scope.`,
    })
    if (nomenclatureMismatch) evidence.push(nomenclatureMismatch)
  }

  const recordDate = validIsoDate(input.record.recordDate)
  const from = validIsoDate(input.profile.dateWindow?.from)
  const to = validIsoDate(input.profile.dateWindow?.to)
  if (recordDate && from && to && from <= to && (recordDate < from || recordDate > to)) {
    evidence.push({
      reasonCode: 'DET_EXCLUDE_DATE_OUTSIDE_SCOPE',
      ground: 'date',
      recordField: 'record.recordDate',
      profileField: 'profile.dateWindow',
      recordValues: [recordDate],
      profileValues: [from, to],
      explanation: 'Record date is outside the valid, explicitly configured surveillance window.',
    })
  }

  const jurisdiction = input.record.jurisdiction?.trim().toUpperCase()
  const allowed = [...new Set((input.profile.allowedJurisdictions ?? [])
    .map((value) => value.trim().toUpperCase())
    .filter((value) => /^[A-Z]{2}$/.test(value)))]
  if (
    input.profile.jurisdictionScopeIsExclusive
    && jurisdiction
    && /^[A-Z]{2}$/.test(jurisdiction)
    && allowed.length > 0
    && !allowed.includes(jurisdiction)
  ) {
    evidence.push({
      reasonCode: 'DET_EXCLUDE_JURISDICTION_OUTSIDE_SCOPE',
      ground: 'jurisdiction',
      recordField: 'record.jurisdiction',
      profileField: 'profile.allowedJurisdictions',
      recordValues: [jurisdiction],
      profileValues: allowed,
      explanation: 'Record jurisdiction is outside the explicitly exhaustive market scope.',
    })
  }

  return {
    rulesetVersion: DETERMINISTIC_SAFETY_RULESET_VERSION,
    retention: 'retain',
    disposition: evidence.length > 0 ? 'excluded' : 'not_excluded',
    reasonCodes: [...new Set(evidence.map((item) => item.reasonCode))],
    evidence,
  }
}

export interface VigilanceStructuredFields {
  /** Source-native values such as `Death`, `Tod`, or `Décès`. */
  patientOutcome?: string | readonly string[] | null
  seriousness?: string | readonly string[] | boolean | null
  incidentType?: string | readonly string[] | null
  regulatoryAction?: string | readonly string[] | null
  actionType?: string | readonly string[] | null
}

export interface VigilanceInput {
  title?: string | null
  description?: string | null
  rawContent?: string | null
  structured?: VigilanceStructuredFields
}

export interface VigilanceEvidence {
  reasonCode: VigilanceReasonCode
  source: 'structured' | 'text'
  field: string
  matchedValue: string
  language: 'en' | 'de' | 'fr' | 'source_code'
  start: number | null
  end: number | null
}

export interface VigilanceAssessment {
  rulesetVersion: string
  requiresHumanReview: boolean
  bypassModelDisposition: boolean
  reasonCodes: VigilanceReasonCode[]
  evidence: VigilanceEvidence[]
}

interface TextPattern {
  reasonCode: VigilanceReasonCode
  language: VigilanceEvidence['language']
  expression: RegExp
}

const TEXT_PATTERNS: readonly TextPattern[] = [
  { reasonCode: 'VIGILANCE_DEATH', language: 'en', expression: /\b(?:death|died|deceased|fatality|fatal)\b/giu },
  { reasonCode: 'VIGILANCE_DEATH', language: 'de', expression: /(?:^|[^\p{L}\p{N}])(?:tod|todesfall|todesfälle|verstorben|tödlich)(?=$|[^\p{L}\p{N}])/giu },
  { reasonCode: 'VIGILANCE_DEATH', language: 'fr', expression: /(?:^|[^\p{L}\p{N}])(?:décès|décédé|décédée|mortel|mortelle)(?=$|[^\p{L}\p{N}])/giu },

  { reasonCode: 'VIGILANCE_SERIOUS_DETERIORATION', language: 'en', expression: /\b(?:serious deterioration|serious deterioration in (?:a |the )?state of health|life[- ]threatening|hospitali[sz](?:ation|ed))\b/giu },
  { reasonCode: 'VIGILANCE_SERIOUS_DETERIORATION', language: 'de', expression: /(?:^|[^\p{L}\p{N}])(?:schwerwiegende verschlechterung|lebensbedrohlich|krankenhausaufenthalt|hospitalisierung)(?=$|[^\p{L}\p{N}])/giu },
  { reasonCode: 'VIGILANCE_SERIOUS_DETERIORATION', language: 'fr', expression: /(?:^|[^\p{L}\p{N}])(?:détérioration grave|pronostic vital|hospitalisation)(?=$|[^\p{L}\p{N}])/giu },

  { reasonCode: 'VIGILANCE_SERIOUS_INCIDENT', language: 'en', expression: /\b(?:serious incident|serious injury|seriously injured)\b/giu },
  { reasonCode: 'VIGILANCE_SERIOUS_INCIDENT', language: 'de', expression: /(?:^|[^\p{L}\p{N}])(?:schwerwiegendes vorkommnis|schwere verletzung|schwer verletzt)(?=$|[^\p{L}\p{N}])/giu },
  { reasonCode: 'VIGILANCE_SERIOUS_INCIDENT', language: 'fr', expression: /(?:^|[^\p{L}\p{N}])(?:incident grave|blessure grave|grièvement blessé|grièvement blessée)(?=$|[^\p{L}\p{N}])/giu },

  { reasonCode: 'VIGILANCE_FSCA', language: 'en', expression: /\b(?:fsca|field safety corrective action)\b/giu },
  { reasonCode: 'VIGILANCE_FSCA', language: 'de', expression: /(?:^|[^\p{L}\p{N}])(?:sicherheitskorrekturmaßnahme im feld|korrektive maßnahme im feld)(?=$|[^\p{L}\p{N}])/giu },
  { reasonCode: 'VIGILANCE_FSCA', language: 'fr', expression: /(?:^|[^\p{L}\p{N}])(?:mesure corrective de sécurité sur le terrain|action corrective de sécurité sur le terrain)(?=$|[^\p{L}\p{N}])/giu },

  { reasonCode: 'VIGILANCE_RECALL', language: 'en', expression: /\b(?:recall|product recall|safety recall)\b/giu },
  { reasonCode: 'VIGILANCE_RECALL', language: 'de', expression: /(?:^|[^\p{L}\p{N}])(?:rückruf|produktrückruf)(?=$|[^\p{L}\p{N}])/giu },
  { reasonCode: 'VIGILANCE_RECALL', language: 'fr', expression: /(?:^|[^\p{L}\p{N}])(?:rappel|rappel de produit)(?=$|[^\p{L}\p{N}])/giu },

  { reasonCode: 'VIGILANCE_FIELD_SAFETY_ACTION', language: 'en', expression: /\b(?:field safety action|field safety notice|urgent safety action)\b/giu },
  { reasonCode: 'VIGILANCE_FIELD_SAFETY_ACTION', language: 'de', expression: /(?:^|[^\p{L}\p{N}])(?:sicherheitsmaßnahme im feld|dringende sicherheitsinformation)(?=$|[^\p{L}\p{N}])/giu },
  { reasonCode: 'VIGILANCE_FIELD_SAFETY_ACTION', language: 'fr', expression: /(?:^|[^\p{L}\p{N}])(?:action de sécurité sur le terrain|avis de sécurité urgent)(?=$|[^\p{L}\p{N}])/giu },
] as const

const STRUCTURED_CODES: ReadonlyArray<{
  reasonCode: VigilanceReasonCode
  expression: RegExp
}> = [
  { reasonCode: 'VIGILANCE_DEATH', expression: /^(?:death|dead|fatal|died|deceased|tod|todesfall|verstorben|décès|decede|decedee)$/iu },
  { reasonCode: 'VIGILANCE_SERIOUS_DETERIORATION', expression: /^(?:serious[_ -]?deterioration|life[_ -]?threatening|hospitali[sz](?:ation|ed)|schwerwiegende[_ -]?verschlechterung|lebensbedrohlich|hospitalisierung|détérioration[_ -]?grave|deterioration[_ -]?grave|hospitalisation)$/iu },
  { reasonCode: 'VIGILANCE_SERIOUS_INCIDENT', expression: /^(?:serious[_ -]?(?:incident|injury)|schwerwiegendes[_ -]?vorkommnis|schwere[_ -]?verletzung|incident[_ -]?grave|blessure[_ -]?grave)$/iu },
  { reasonCode: 'VIGILANCE_FSCA', expression: /^(?:fsca|field[_ -]?safety[_ -]?corrective[_ -]?action)$/iu },
  { reasonCode: 'VIGILANCE_RECALL', expression: /^(?:recall|product[_ -]?recall|rückruf|produktrückruf|rappel|rappel[_ -]?de[_ -]?produit)$/iu },
  { reasonCode: 'VIGILANCE_FIELD_SAFETY_ACTION', expression: /^(?:field[_ -]?safety[_ -]?(?:action|notice)|sicherheitsmaßnahme[_ -]?im[_ -]?feld|action[_ -]?de[_ -]?sécurité[_ -]?sur[_ -]?le[_ -]?terrain)$/iu },
]

function arrayValues(value: string | readonly string[] | boolean | null | undefined): string[] {
  if (typeof value === 'boolean') return value ? ['true'] : []
  if (typeof value === 'string') return value.trim() ? [value.trim()] : []
  return (value ?? []).map((item) => item.trim()).filter(Boolean)
}

/**
 * Detects vigilance signals before model ranking. Text is intentionally treated
 * conservatively: even a negated trigger requires human review rather than a
 * silent false negative. Human review resolves context and reportability.
 */
export function assessVigilanceBypass(input: VigilanceInput): VigilanceAssessment {
  const evidence: VigilanceEvidence[] = []
  const structuredEntries: Array<[keyof VigilanceStructuredFields, string | readonly string[] | boolean | null | undefined]> = [
    ['patientOutcome', input.structured?.patientOutcome],
    ['seriousness', input.structured?.seriousness],
    ['incidentType', input.structured?.incidentType],
    ['regulatoryAction', input.structured?.regulatoryAction],
    ['actionType', input.structured?.actionType],
  ]

  for (const [field, rawValue] of structuredEntries) {
    if (field === 'seriousness' && rawValue === true) {
      evidence.push({
        reasonCode: 'VIGILANCE_SERIOUS_INCIDENT',
        source: 'structured',
        field: `structured.${field}`,
        matchedValue: 'true',
        language: 'source_code',
        start: null,
        end: null,
      })
      continue
    }
    for (const value of arrayValues(rawValue)) {
      for (const candidate of STRUCTURED_CODES) {
        if (!candidate.expression.test(value.trim())) continue
        evidence.push({
          reasonCode: candidate.reasonCode,
          source: 'structured',
          field: `structured.${field}`,
          matchedValue: value,
          language: 'source_code',
          start: null,
          end: null,
        })
      }
    }
  }

  const textEntries: Array<[string, string | null | undefined]> = [
    ['title', input.title],
    ['description', input.description],
    ['rawContent', input.rawContent],
  ]
  for (const [field, text] of textEntries) {
    if (!text) continue
    for (const pattern of TEXT_PATTERNS) {
      pattern.expression.lastIndex = 0
      for (const match of text.matchAll(pattern.expression)) {
        evidence.push({
          reasonCode: pattern.reasonCode,
          source: 'text',
          field,
          matchedValue: match[0].trim(),
          language: pattern.language,
          start: match.index,
          end: match.index + match[0].length,
        })
      }
    }
  }

  const reasonCodes = [...new Set(evidence.map((item) => item.reasonCode))]
  return {
    rulesetVersion: DETERMINISTIC_SAFETY_RULESET_VERSION,
    requiresHumanReview: evidence.length > 0,
    bypassModelDisposition: evidence.length > 0,
    reasonCodes,
    evidence,
  }
}

export interface DeterministicSafetyAssessment {
  deterministicDisposition: DeterministicDisposition
  vigilance: VigilanceAssessment
}

/** Convenience API for callers that want both independent safety decisions. */
export function assessDeterministicSafety(input: {
  record: DeterministicRecordFacts
  profile: DeterministicProfileScope
  vigilance: VigilanceInput
}): DeterministicSafetyAssessment {
  return {
    deterministicDisposition: assessDeterministicDisposition(input),
    vigilance: assessVigilanceBypass(input.vigilance),
  }
}
