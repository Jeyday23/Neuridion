export const EVIDENCE_ADAPTER_VERSIONS = {
  bfarm: 'bfarm@1',
  mhra: 'mhra@1',
  fda: 'fda@1',
  swissmedic: 'swissmedic@1',
  eudamed: 'eudamed@0',
} as const

export const EVIDENCE_BUCKET = 'regulatory-evidence'

export const PERSONAL_DATA_SOURCES = new Set(['fda'] as const)

