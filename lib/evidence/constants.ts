import { SOURCE_AUTHORITY } from './source-authority'

export const EVIDENCE_ADAPTER_VERSIONS = {
  bfarm: SOURCE_AUTHORITY.bfarm.parserVersion,
  mhra: SOURCE_AUTHORITY.mhra.parserVersion,
  fda: SOURCE_AUTHORITY.fda.parserVersion,
  swissmedic: SOURCE_AUTHORITY.swissmedic.parserVersion,
  eudamed: SOURCE_AUTHORITY.eudamed.parserVersion,
} as const

export const EVIDENCE_BUCKET = 'regulatory-evidence'

export const PERSONAL_DATA_SOURCES = new Set(
  Object.entries(SOURCE_AUTHORITY)
    .filter(([, contract]) => contract.containsPersonalData === 'potential_third_party_data')
    .map(([source]) => source),
)
