export const EVIDENCE_SCHEMA_WARNING =
  'Regulatory evidence migration 068 is not applied; results were saved without revision links.'

const EVIDENCE_LINK_COLUMNS = /authority_revision_id|evidence_parser_version/i

export function isMissingEvidenceLinkColumn(error: {
  code?: string | null
  message?: string | null
} | null): boolean {
  return error?.code === 'PGRST204' && EVIDENCE_LINK_COLUMNS.test(error.message ?? '')
}

export function addEvidenceSchemaWarning(warnings: string[]): void {
  if (!warnings.includes(EVIDENCE_SCHEMA_WARNING)) warnings.push(EVIDENCE_SCHEMA_WARNING)
}
