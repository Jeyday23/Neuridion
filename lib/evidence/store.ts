import type { SupabaseClient } from '@supabase/supabase-js'
import pLimit from 'p-limit'
import { createAdminClient } from '@/lib/supabase/admin'
import type { RawSourceArtifact, ScrapedFsn, ScraperOutcome } from '@/lib/scrapers/bfarm'
import { EVIDENCE_ADAPTER_VERSIONS, EVIDENCE_BUCKET, PERSONAL_DATA_SOURCES } from './constants'
import type { EvidenceDatabase } from './db-types'
import { canonicalJson, normalizedObservationHash, sha256Hex } from './hash'
import { identityConfidence, normalizeManufacturerKey } from './identity'
import { diffFields, revisionHash, shouldCreateAuthorityRevision } from './revision'
import {
  normalizedObservationSchema,
  type NormalizedObservation,
  type SourceName,
} from './types'
import { identityMethodForSourceRecord } from './source-authority'

type EvidenceClient = SupabaseClient<EvidenceDatabase>

function evidenceClient(): EvidenceClient {
  return createAdminClient() as unknown as EvidenceClient
}

export interface FetchCapture {
  source: SourceName
  requestLocator: string
  startedAt: string
  completedAt: string
  outcome: ScraperOutcome
  warnings: string[]
  items: ScrapedFsn[]
  rawArtifacts?: RawSourceArtifact[]
}

export interface CaptureResult {
  fetchId: string
  observations: number
  revisions: number
  rawArtifacts: number
  authorityRevisionIds: Map<string, string>
}

const MAX_RAW_ARTIFACT_BYTES = 50 * 1024 * 1024
const MAX_RAW_CAPTURE_BYTES = 100 * 1024 * 1024

export function evidenceSafeLocator(rawUrl: string): string {
  try {
    const url = new URL(rawUrl)
    if (!url.search) return url.toString()
    const fingerprint = sha256Hex(url.searchParams.toString())
    url.search = `query_sha256=${fingerprint}`
    return url.toString()
  } catch {
    return 'redacted://invalid-locator'
  }
}

export function adapterOutputBytes(item: ScrapedFsn): Uint8Array {
  return new TextEncoder().encode(canonicalJson({
    external_id: item.external_id,
    title: item.title,
    manufacturer: item.manufacturer,
    product_name: item.product_name,
    fsn_date: item.fsn_date,
    source_url: item.source_url,
    raw_content: item.raw_content,
    source_db: item.source_db,
  }))
}

async function recordFetch(capture: FetchCapture): Promise<string> {
  const db = evidenceClient()
  const { data, error } = await db.from('source_fetches').insert({
    source: capture.source,
    request_locator: capture.requestLocator,
    adapter_name: capture.source,
    adapter_version: EVIDENCE_ADAPTER_VERSIONS[capture.source],
    fetch_started_at: capture.startedAt,
    fetch_completed_at: capture.completedAt,
    http_status: capture.rawArtifacts?.[0]?.httpStatus ?? null,
    outcome: capture.outcome,
    warnings: capture.warnings,
  }).select('id').single()
  if (error) throw new Error(`Evidence fetch insert failed: ${error.message}`)
  return data.id
}

async function storeRawEvidence(
  db: EvidenceClient,
  source: SourceName,
  artifact: RawSourceArtifact,
): Promise<string> {
  if (artifact.bytes.byteLength > MAX_RAW_ARTIFACT_BYTES) {
    throw new Error(`Raw evidence artifact exceeds ${MAX_RAW_ARTIFACT_BYTES} byte limit`)
  }
  const contentHash = sha256Hex(artifact.bytes)
  const existingId = await findEvidenceByHash(db, contentHash)
  if (existingId) return existingId

  const storagePath = `${source}/raw-response/${contentHash}.bin`
  const { error: uploadError } = await db.storage.from(EVIDENCE_BUCKET).upload(storagePath, artifact.bytes, {
    // The private evidence bucket already permits octet-stream. The exact
    // authority media type remains on evidence_objects.media_type.
    contentType: 'application/octet-stream',
    upsert: false,
  })
  if (uploadError && !/already exists|duplicate/i.test(uploadError.message)) {
    throw new Error(`Raw evidence upload failed: ${uploadError.message}`)
  }

  const { data, error } = await db.from('evidence_objects').insert({
    content_hash: contentHash,
    storage_bucket: EVIDENCE_BUCKET,
    storage_path: storagePath,
    media_type: artifact.mediaType,
    byte_size: artifact.bytes.byteLength,
    artifact_kind: 'raw_response',
    contains_personal_data: PERSONAL_DATA_SOURCES.has(source),
  }).select('id').single()
  if (!error) return data.id
  if (error.code === '23505') {
    const racedId = await findEvidenceByHash(db, contentHash)
    if (racedId) return racedId
  }
  throw new Error(`Raw evidence object insert failed: ${error.message}`)
}

async function recordRawArtifacts(
  db: EvidenceClient,
  fetchId: string,
  capture: FetchCapture,
): Promise<number> {
  const artifacts = capture.rawArtifacts ?? []
  const totalBytes = artifacts.reduce((total, artifact) => total + artifact.bytes.byteLength, 0)
  if (totalBytes > MAX_RAW_CAPTURE_BYTES) {
    throw new Error(`Raw evidence capture exceeds ${MAX_RAW_CAPTURE_BYTES} byte limit`)
  }
  let recorded = 0
  for (const artifact of artifacts) {
    const evidenceId = await storeRawEvidence(db, capture.source, artifact)
    const { error } = await db.from('fetch_artifacts').insert({
      fetch_id: fetchId,
      evidence_id: evidenceId,
      source_url: evidenceSafeLocator(artifact.sourceUrl),
      artifact_role: 'response',
    })
    if (error && error.code !== '23505') throw new Error(`Raw evidence link failed: ${error.message}`)
    if (!error) recorded++
  }
  return recorded
}

async function findEvidenceByHash(db: EvidenceClient, contentHash: string): Promise<string | null> {
  const { data, error } = await db.from('evidence_objects')
    .select('id').eq('content_hash', contentHash).maybeSingle()
  if (error) throw new Error(`Evidence lookup failed: ${error.message}`)
  return data?.id ?? null
}

async function storeAdapterEvidence(
  db: EvidenceClient,
  source: SourceName,
  item: ScrapedFsn,
): Promise<{ id: string; contentHash: string }> {
  const bytes = adapterOutputBytes(item)
  const contentHash = sha256Hex(bytes)
  const existingId = await findEvidenceByHash(db, contentHash)
  if (existingId) return { id: existingId, contentHash }

  const storagePath = `${source}/adapter-output/${contentHash}.json`
  const { error: uploadError } = await db.storage.from(EVIDENCE_BUCKET).upload(storagePath, bytes, {
    contentType: 'application/vnd.neuridion.adapter-output+json',
    upsert: false,
  })
  if (uploadError && !/already exists|duplicate/i.test(uploadError.message)) {
    throw new Error(`Evidence upload failed: ${uploadError.message}`)
  }

  const { data, error } = await db.from('evidence_objects').insert({
    content_hash: contentHash,
    storage_bucket: EVIDENCE_BUCKET,
    storage_path: storagePath,
    media_type: 'application/vnd.neuridion.adapter-output+json',
    byte_size: bytes.byteLength,
    artifact_kind: 'adapter_output',
    contains_personal_data: PERSONAL_DATA_SOURCES.has(source),
  }).select('id').single()

  if (!error) return { id: data.id, contentHash }
  if (error.code === '23505') {
    const racedId = await findEvidenceByHash(db, contentHash)
    if (racedId) return { id: racedId, contentHash }
  }
  throw new Error(`Evidence object insert failed: ${error.message}`)
}

async function appendRevision(
  db: EvidenceClient,
  observationId: string,
  observation: NormalizedObservation,
): Promise<{ id: string; created: boolean }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: latest, error: latestError } = await db.from('authority_record_revisions')
      .select('id,revision_number,source_payload_hash,revision_hash')
      .eq('authority_record_id', observation.authorityRecordId)
      .order('revision_number', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (latestError) throw new Error(`Revision lookup failed: ${latestError.message}`)
    if (!shouldCreateAuthorityRevision(latest?.source_payload_hash ?? null, observation.sourcePayloadHash)) {
      return { id: latest!.id, created: false }
    }

    const revisionNumber = (latest?.revision_number ?? 0) + 1
    const previousRevisionHash = latest?.revision_hash ?? null
    const { data, error } = await db.from('authority_record_revisions').insert({
      authority_record_id: observation.authorityRecordId,
      observation_id: observationId,
      revision_number: revisionNumber,
      source_payload_hash: observation.sourcePayloadHash,
      previous_revision_hash: previousRevisionHash,
      revision_hash: revisionHash({
        previousRevisionHash,
        authorityRecordId: observation.authorityRecordId,
        revisionNumber,
        sourcePayloadHash: observation.sourcePayloadHash,
        observationId,
      }),
      changed_fields: JSON.parse(canonicalJson(diffFields(
        latest ? { sourcePayloadHash: latest.source_payload_hash } : null,
        { sourcePayloadHash: observation.sourcePayloadHash },
      ))),
    }).select('id').single()
    if (!error) return { id: data.id, created: true }
    if (error.code !== '23505') throw new Error(`Revision insert failed: ${error.message}`)
  }
  throw new Error('Revision insert could not be serialized after 3 attempts')
}

async function recordItem(
  db: EvidenceClient,
  fetchId: string,
  item: ScrapedFsn,
  authorityRecordId: string,
): Promise<{ revisionId: string; revisionCreated: boolean }> {
  const source = item.source_db as SourceName
  const evidence = await storeAdapterEvidence(db, source, item)
  const { error: linkError } = await db.from('fetch_artifacts').insert({
    fetch_id: fetchId,
    evidence_id: evidence.id,
    source_url: item.source_url,
    artifact_role: 'record',
  })
  if (linkError && linkError.code !== '23505') {
    throw new Error(`Fetch artifact link failed: ${linkError.message}`)
  }

  const observation = normalizedObservationSchema.parse({
    source,
    sourceRecordId: item.external_id,
    authorityRecordId,
    identityMethod: identityMethodForSourceRecord(source, item.external_id),
    fscaReference: null,
    basicUdiDi: null,
    title: item.title,
    manufacturer: item.manufacturer,
    productName: item.product_name,
    fsnDate: item.fsn_date,
    sourceUrl: item.source_url,
    sourcePayloadHash: evidence.contentHash,
    parserVersion: EVIDENCE_ADAPTER_VERSIONS[source],
  })
  const { data: inserted, error: observationError } = await db.from('fsn_observations').insert({
    fetch_id: fetchId,
    authority_record_id: observation.authorityRecordId,
    evidence_id: evidence.id,
    source: observation.source,
    source_record_id: observation.sourceRecordId,
    identity_method: observation.identityMethod,
    identity_confidence: identityConfidence(observation.identityMethod),
    fsca_reference: observation.fscaReference,
    basic_udi_di: observation.basicUdiDi,
    manufacturer_key: normalizeManufacturerKey(observation.manufacturer),
    title: observation.title,
    manufacturer: observation.manufacturer,
    product_name: observation.productName,
    fsn_date: observation.fsnDate,
    source_url: observation.sourceUrl,
    source_payload_hash: observation.sourcePayloadHash,
    normalized_hash: normalizedObservationHash(observation),
    parser_version: observation.parserVersion,
  }).select('id').single()
  if (observationError) throw new Error(`Observation insert failed: ${observationError.message}`)

  const revision = await appendRevision(db, inserted.id, observation)
  return { revisionId: revision.id, revisionCreated: revision.created }
}

export async function captureAdapterOutput(
  capture: FetchCapture,
  authorityIds: ReadonlyMap<string, string>,
): Promise<CaptureResult> {
  const db = evidenceClient()
  const fetchId = await recordFetch(capture)
  const rawArtifacts = await recordRawArtifacts(db, fetchId, capture)
  let observations = 0
  let revisions = 0
  const authorityRevisionIds = new Map<string, string>()
  const limit = pLimit(6)
  const tasks = capture.items.map((item) => limit(async () => {
    const authorityRecordId = authorityIds.get(item.external_id)
    if (!authorityRecordId) return null
    const recorded = await recordItem(db, fetchId, item, authorityRecordId)
    return { externalId: item.external_id, ...recorded }
  }))
  const settled = await Promise.allSettled(tasks)
  const failures: string[] = []
  for (const result of settled) {
    if (result.status === 'rejected') {
      failures.push(result.reason instanceof Error ? result.reason.message : String(result.reason))
      continue
    }
    if (!result.value) continue
    authorityRevisionIds.set(result.value.externalId, result.value.revisionId)
    if (result.value.revisionCreated) revisions++
    observations++
  }
  if (failures.length > 0) {
    throw new Error(`Evidence capture failed for ${failures.length}/${capture.items.length} records: ${failures[0]}`)
  }
  return { fetchId, observations, revisions, rawArtifacts, authorityRevisionIds }
}

export async function getLatestAuthorityRevisionIds(
  authorityIds: ReadonlyMap<string, string>,
): Promise<Map<string, string>> {
  const db = evidenceClient()
  const externalIdByAuthority = new Map(
    [...authorityIds].map(([externalId, authorityId]) => [authorityId, externalId]),
  )
  const authorityIdList = [...externalIdByAuthority.keys()]
  const revisionIds = new Map<string, string>()
  const chunkSize = 200
  for (let index = 0; index < authorityIdList.length; index += chunkSize) {
    const { data, error } = await db.from('authority_record_revisions')
      .select('id,authority_record_id,revision_number')
      .in('authority_record_id', authorityIdList.slice(index, index + chunkSize))
      .order('revision_number', { ascending: false })
    if (error) throw new Error(`Latest revision lookup failed: ${error.message}`)
    for (const row of data ?? []) {
      const externalId = externalIdByAuthority.get(row.authority_record_id)
      if (externalId && !revisionIds.has(externalId)) revisionIds.set(externalId, row.id)
    }
  }
  return revisionIds
}

export async function redactEvidenceObject(input: {
  evidenceId: string
  basis: string
  operatorUserId: string | null
}): Promise<void> {
  const db = evidenceClient()
  const admin = createAdminClient()
  const { data: evidence, error: lookupError } = await db.from('evidence_objects')
    .select('storage_bucket,storage_path').eq('id', input.evidenceId).single()
  if (lookupError) throw new Error(`Redaction lookup failed: ${lookupError.message}`)

  const { error: requestError } = await db.from('evidence_governance_events').insert({
    evidence_id: input.evidenceId,
    event_type: 'redaction_requested',
    basis: input.basis,
  })
  if (requestError) throw new Error(`Redaction request audit failed: ${requestError.message}`)

  const { error: removeError } = await db.storage.from(evidence.storage_bucket).remove([evidence.storage_path])
  const eventType = removeError ? 'redaction_failed' : 'redaction_completed'
  const { error: eventError } = await db.from('evidence_governance_events').insert({
    evidence_id: input.evidenceId,
    event_type: eventType,
    basis: input.basis,
    event_metadata: removeError ? { storage_error: removeError.message } : {},
  })
  const { error: auditError } = await admin.from('audit_log').insert({
    user_id: input.operatorUserId,
    event_type: `evidence_${eventType}`,
    event_data: { evidence_id: input.evidenceId, basis: input.basis },
  })
  if (eventError) throw new Error(`Redaction completion audit failed: ${eventError.message}`)
  if (auditError) throw new Error(`Redaction operator audit failed: ${auditError.message}`)
  if (removeError) throw new Error(`Evidence redaction failed: ${removeError.message}`)
}
