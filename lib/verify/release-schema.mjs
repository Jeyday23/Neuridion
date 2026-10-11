/** Read-only startup guard. No customer rows are fetched and no secrets are logged. */
export const REQUIRED_RELEASE_SCHEMA_VERSION = 76

export const RELEASE_SCHEMA_PROBES = [
  ['filter_decisions', 'id,search_run_id,decided_at,provider,model_id,prompt_version,ruleset_version,input_sha256,output_sha256,original_decision_at,presentation_rank,cache_hit,decision_method,deterministic_reason_codes,deterministic_evidence'],
  ['filter_decision_cache', 'fsn_external_id,profile_fingerprint,provider,model_id,prompt_version,ruleset_version,input_sha256,output_sha256,original_decision_at,presentation_rank'],
  ['exclusion_review_samples', 'id,sample_source'],
  ['search_runs', 'id,status,completed_at,review_status,reviewed_at,reviewed_by'],
  ['review_requirements', 'search_run_id,fsn_result_id,filter_decision_id'],
  ['human_adjudication_events', 'id,search_run_id,fsn_result_id,phase,disposition,supersedes_event_id,review_of_event_id'],
  ['fsn_canonical', 'id,content_hash,attachments,attachment_digest,attachments_verified_at,last_observation_degraded'],
  ['fsn_results', 'id,content_hash,attachments,attachment_digest'],
  ['source_document_versions', 'id,source,source_record_id,document_url,sha256,first_retrieved_at'],
  ['run_reviewer_assignment_revocations', 'id,assignment_id,revoked_by,revoked_at'],
  ['search_runs', 'id,approved_by,approved_at'],
]

/**
 * @param {{queryColumns: (table: string, columns: string) => Promise<boolean>, schemaVersion: () => Promise<number | null>}} client
 */
export async function verifyReleaseSchema(client) {
  const failures = []
  for (const [table, columns] of RELEASE_SCHEMA_PROBES) {
    try {
      if (!await client.queryColumns(table, columns)) failures.push(`${table}: required columns unavailable`)
    } catch {
      failures.push(`${table}: schema probe failed`)
    }
  }
  try {
    const version = await client.schemaVersion()
    if (!Number.isInteger(version) || version < REQUIRED_RELEASE_SCHEMA_VERSION) {
      failures.push(`release schema ${REQUIRED_RELEASE_SCHEMA_VERSION} is required`)
    }
  } catch {
    failures.push('release schema version could not be verified')
  }
  return { ok: failures.length === 0, failures }
}
