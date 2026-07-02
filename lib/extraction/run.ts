import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { EVIDENCE_BUCKET } from '@/lib/evidence/constants'
import type { EvidenceDatabase } from '@/lib/evidence/db-types'
import type { Json } from '@/types/supabase'
import { EXTRACTOR_VERSION, MAX_PDF_BYTES, MAX_PAGES, MAX_TEXT_CHARS } from './constants'
import { extractFieldsAi } from './ai'
import { extractFieldsDeterministic, needsAiExtraction } from './fields'
import { extractPdfText, detectLanguage } from './text'
import { appendIdentityObservation } from './upgrade'
import { emptyFields, type ExtractionResult, type ExtractionStatus, type FieldProvenance, type FsnDetailFields } from './types'

type ExtractionDb = SupabaseClient<EvidenceDatabase>

type EvidenceDocument = {
  id: string
  storage_bucket: string
  storage_path: string
  media_type: string
  byte_size: number
  authority_record_id?: string | null
}

type ExtractorDeps = {
  db?: ExtractionDb
  extractText?: typeof extractPdfText
  extractAi?: typeof extractFieldsAi
  downloadBytes?: (doc: EvidenceDocument, db: ExtractionDb) => Promise<Uint8Array | null>
}

function asJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json
}

function extractionDb(): ExtractionDb {
  return createAdminClient() as unknown as ExtractionDb
}

function isPdfEvidence(row: { media_type: string; artifact_kind?: string | null }): boolean {
  return row.media_type === 'application/pdf' || row.media_type === 'application/octet-stream'
}

async function findPendingDocuments(db: ExtractionDb, limit: number): Promise<EvidenceDocument[]> {
  const { data: existing, error: existingError } = await db.from('document_extractions')
    .select('evidence_id')
    .eq('extractor_version', EXTRACTOR_VERSION)
  if (existingError) throw new Error(`Extraction cache lookup failed: ${existingError.message}`)
  const done = new Set((existing ?? []).map(row => row.evidence_id))

  const { data, error } = await db.from('evidence_objects')
    .select('id,storage_bucket,storage_path,media_type,byte_size,artifact_kind')
    .in('media_type', ['application/pdf', 'application/octet-stream'])
    .order('first_seen_at', { ascending: false })
    .limit(Math.max(limit * 5, limit))
  if (error) throw new Error(`Pending evidence lookup failed: ${error.message}`)

  const candidates = (data ?? [])
    .filter(isPdfEvidence)
    .filter(row => !done.has(row.id))
    .slice(0, limit)

  if (candidates.length === 0) return []

  const { data: links } = await db.from('fsn_observations')
    .select('authority_record_id,evidence_id')
    .in('evidence_id', candidates.map(row => row.id))
  const authorityByEvidence = new Map((links ?? []).map(row => [row.evidence_id, row.authority_record_id]))

  return candidates.map(row => ({
    id: row.id,
    storage_bucket: row.storage_bucket,
    storage_path: row.storage_path,
    media_type: row.media_type,
    byte_size: row.byte_size,
    authority_record_id: authorityByEvidence.get(row.id) ?? null,
  }))
}

async function defaultDownloadBytes(doc: EvidenceDocument, db: ExtractionDb): Promise<Uint8Array | null> {
  const bucket = doc.storage_bucket || EVIDENCE_BUCKET
  const { data, error } = await db.storage.from(bucket).download(doc.storage_path)
  if (error || !data) return null
  return new Uint8Array(await data.arrayBuffer())
}

function provenanceForRegex(fields: FsnDetailFields): Partial<Record<keyof FsnDetailFields, FieldProvenance>> {
  const provenance: Partial<Record<keyof FsnDetailFields, FieldProvenance>> = {}
  for (const key of Object.keys(fields) as Array<keyof FsnDetailFields>) {
    const value = fields[key]
    const hasValue = value !== null && (!Array.isArray(value) || value.length > 0)
    if (hasValue) provenance[key] = { method: 'regex', confidence: 0.95 }
  }
  return provenance
}

function mergeAiGaps(
  fields: FsnDetailFields,
  provenance: Partial<Record<keyof FsnDetailFields, FieldProvenance>>,
  aiFields: FsnDetailFields,
  aiMeta: { model: string; promptVersion: string },
): FsnDetailFields {
  const merged = { ...fields }
  for (const key of Object.keys(merged) as Array<keyof FsnDetailFields>) {
    const current = merged[key]
    const isEmpty = current === null || (Array.isArray(current) && current.length === 0)
    const next = aiFields[key]
    const hasNext = next !== null && (!Array.isArray(next) || next.length > 0)
    if (isEmpty && hasNext) {
      ;(merged as Record<string, unknown>)[key] = next
      provenance[key] = {
        method: 'ai',
        confidence: 0.8,
        model: aiMeta.model,
        promptVersion: aiMeta.promptVersion,
      }
    }
  }
  return merged
}

export async function extractDocument(
  doc: EvidenceDocument,
  deps: ExtractorDeps = {},
): Promise<ExtractionResult> {
  const db = deps.db ?? extractionDb()
  const warnings: string[] = []

  if (doc.byte_size > MAX_PDF_BYTES) {
    return {
      status: 'skipped_size',
      text: null,
      pageCount: null,
      hasTextLayer: null,
      language: null,
      fields: emptyFields(),
      provenance: {},
      ungroundedDropped: [],
      warnings: [`PDF exceeds ${MAX_PDF_BYTES} byte limit`],
    }
  }

  const bytes = await (deps.downloadBytes ?? defaultDownloadBytes)(doc, db)
  if (!bytes) {
    return {
      status: 'failed',
      text: null,
      pageCount: null,
      hasTextLayer: null,
      language: null,
      fields: emptyFields(),
      provenance: {},
      ungroundedDropped: [],
      warnings: ['PDF download failed'],
    }
  }

  let pdf
  try {
    pdf = await (deps.extractText ?? extractPdfText)(bytes)
  } catch (err) {
    return {
      status: 'failed',
      text: null,
      pageCount: null,
      hasTextLayer: null,
      language: null,
      fields: emptyFields(),
      provenance: {},
      ungroundedDropped: [],
      warnings: [`PDF parse failed: ${err instanceof Error ? err.message : String(err)}`],
    }
  }

  if (pdf.pageCount > MAX_PAGES) {
    return {
      status: 'skipped_size',
      text: null,
      pageCount: pdf.pageCount,
      hasTextLayer: pdf.hasTextLayer,
      language: null,
      fields: emptyFields(),
      provenance: {},
      ungroundedDropped: [],
      warnings: [`PDF exceeds ${MAX_PAGES} page limit`],
    }
  }

  if (!pdf.hasTextLayer) {
    return {
      status: 'needs_ocr',
      text: pdf.text,
      pageCount: pdf.pageCount,
      hasTextLayer: false,
      language: null,
      fields: emptyFields(),
      provenance: {},
      ungroundedDropped: [],
      warnings,
    }
  }

  const text = pdf.text.length > MAX_TEXT_CHARS ? pdf.text.slice(0, MAX_TEXT_CHARS) : pdf.text
  if (pdf.text.length > MAX_TEXT_CHARS) warnings.push(`PDF text truncated to ${MAX_TEXT_CHARS} characters`)

  let fields = extractFieldsDeterministic(text)
  const provenance = provenanceForRegex(fields)
  let ungroundedDropped: string[] = []
  if (needsAiExtraction(fields) && process.env.ANTHROPIC_API_KEY) {
    try {
      const ai = await (deps.extractAi ?? extractFieldsAi)(text)
      ungroundedDropped = ai.ungroundedDropped
      fields = mergeAiGaps(fields, provenance, ai.fields, ai)
    } catch (err) {
      warnings.push(`AI extraction unavailable: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return {
    status: 'extracted',
    text,
    pageCount: pdf.pageCount,
    hasTextLayer: true,
    language: detectLanguage(text),
    fields,
    provenance,
    ungroundedDropped,
    warnings,
  }
}

async function insertAttempt(db: ExtractionDb, doc: EvidenceDocument, result: ExtractionResult | { status: ExtractionStatus | 'duplicate'; warnings: string[]; metadata?: Record<string, unknown> }): Promise<void> {
  const { error } = await db.from('document_extraction_attempts').insert({
    evidence_id: doc.id,
    extractor_version: EXTRACTOR_VERSION,
    status: result.status,
    warnings: asJson(result.warnings),
    metadata: asJson('metadata' in result ? result.metadata ?? {} : {}),
  })
  if (error) throw new Error(`Extraction attempt insert failed: ${error.message}`)
}

async function recordExtraction(db: ExtractionDb, doc: EvidenceDocument, result: ExtractionResult): Promise<string | null> {
  const { data, error } = await db.from('document_extractions').insert({
    evidence_id: doc.id,
    extractor_version: EXTRACTOR_VERSION,
    status: result.status,
    has_text_layer: result.hasTextLayer,
    page_count: result.pageCount,
    text_chars: result.text?.length ?? null,
    language: result.language,
    warnings: asJson(result.warnings),
  }).select('id').single()

  if (error?.code === '23505') {
    await insertAttempt(db, doc, { status: 'duplicate', warnings: ['Extraction already exists for this version'] })
    return null
  }
  if (error) throw new Error(`Document extraction insert failed: ${error.message}`)
  return data.id
}

async function recordDetail(db: ExtractionDb, extractionId: string, doc: EvidenceDocument, result: ExtractionResult): Promise<void> {
  if (result.status !== 'extracted') return
  const { error } = await db.from('fsn_detail').insert({
    extraction_id: extractionId,
    authority_record_id: doc.authority_record_id ?? null,
    fsca_reference: result.fields.fscaReference,
    udi_dis: result.fields.udiDis,
    ref_numbers: result.fields.refNumbers,
    lot_numbers: result.fields.lotNumbers,
    serial_numbers: result.fields.serialNumbers,
    product_names: result.fields.productNames,
    action_required: result.fields.actionRequired,
    field_provenance: asJson(result.provenance),
    ungrounded_dropped: asJson(result.ungroundedDropped),
  })
  if (error) throw new Error(`FSN detail insert failed: ${error.message}`)
  await appendIdentityObservation({
    db,
    authorityRecordId: doc.authority_record_id ?? null,
    extractionId,
    fscaReference: result.fields.fscaReference,
  })
}

export async function extractPendingDocuments(limit = 20, deps: ExtractorDeps = {}): Promise<{ processed: number; extracted: number; aiCalls: number; skipped: number }> {
  const db = deps.db ?? extractionDb()
  const docs = await findPendingDocuments(db, limit)
  let extracted = 0
  let skipped = 0
  let aiCalls = 0

  for (const doc of docs) {
    const result = await extractDocument(doc, deps)
    if (result.provenance && Object.values(result.provenance).some(prov => prov?.method === 'ai')) aiCalls++
    await insertAttempt(db, doc, result)
    const extractionId = await recordExtraction(db, doc, result)
    if (!extractionId) {
      skipped++
      continue
    }
    await recordDetail(db, extractionId, doc, result)
    if (result.status === 'extracted') extracted++
    else skipped++
  }

  return { processed: docs.length, extracted, aiCalls, skipped }
}
