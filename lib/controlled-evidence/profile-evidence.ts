import { createHash } from 'crypto'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { extractPdfText } from '@/lib/extraction/text'
import { sanitizeForLlm } from '@/lib/scrapers/sanitize'

export const CONTROLLED_EVIDENCE_EXTRACTOR_VERSION = 'profile-evidence@1'
export const MAX_CONTROLLED_DOCUMENT_BYTES = 10 * 1024 * 1024
export const MAX_CONTROLLED_DOCUMENT_CHARS = 6_000
export const MAX_CONTROLLED_EVIDENCE_CHARS = 12_000
const MAX_OFFICE_ARCHIVE_UNCOMPRESSED_BYTES = 25 * 1024 * 1024
const MAX_OFFICE_ARCHIVE_ENTRIES = 2_000
const MAX_EXTRACTED_TEXT_CHARS = 100_000

export type ControlledEvidenceKind = 'ifu' | 'pms_plan' | 'profile_document'

export interface ControlledEvidenceDocument {
  kind: ControlledEvidenceKind
  label: string
  storage_bucket: 'ifu-documents' | 'search-attachments'
  storage_path: string
  content_sha256: string
  extractor_version: string
  text: string
  original_char_count: number
  included_char_count: number
  truncated: boolean
}

export interface ControlledEvidenceMetadata {
  kind: ControlledEvidenceKind
  label: string
  content_sha256: string
  extractor_version: string
  original_char_count: number
  included_char_count: number
  truncated: boolean
}

export interface ProfileWithEvidenceReferences {
  ifu_storage_path?: string | null
  search_strategy?: {
    strategy_doc_paths?: string[]
    [key: string]: unknown
  } | null
}

export interface ControlledEvidenceOwnership {
  profileId: string
  userId: string
}

export interface ControlledEvidenceLoadResult {
  status: 'not_configured' | 'loaded' | 'unavailable'
  documents: ControlledEvidenceDocument[]
  errors: string[]
}

export type EvidenceDownload = (
  bucket: ControlledEvidenceDocument['storage_bucket'],
  path: string,
) => Promise<Uint8Array>

function safeDocumentLabel(path: string): string {
  const raw = path.split('/').pop() || 'document'
  try {
    return decodeURIComponent(raw).replace(/[^a-zA-Z0-9._() -]/g, '_').slice(0, 160)
  } catch {
    return raw.replace(/[^a-zA-Z0-9._() -]/g, '_').slice(0, 160)
  }
}

function inferDocumentKind(path: string): ControlledEvidenceKind {
  const label = safeDocumentLabel(path).toLowerCase()
  if (/\bifu\b|instructions?[_ -]for[_ -]use/.test(label)) return 'ifu'
  if (/\bpms\b|post[_ -]market|surveillance[_ -]plan/.test(label)) return 'pms_plan'
  return 'profile_document'
}

function validateOwnedStoragePath(
  bucket: ControlledEvidenceDocument['storage_bucket'],
  path: string,
  ownership: ControlledEvidenceOwnership,
): string | null {
  if (!path || path.length > 500 || path.includes('\\') || path.includes('\0') || /[\r\n]/.test(path)) {
    return 'invalid storage path'
  }

  let decoded: string
  try {
    decoded = decodeURIComponent(path)
  } catch {
    return 'invalid storage path encoding'
  }

  // The uploaders create literal, unescaped object paths. Refusing ambiguous
  // encoded separators prevents an admin-client download from bypassing the
  // folder ownership convention that normal storage RLS relies on.
  if (decoded !== path || decoded.startsWith('/') || decoded.endsWith('/')) {
    return 'ambiguous storage path'
  }
  const parts = decoded.split('/')
  if (parts.some((part) => !part || part === '.' || part === '..')) {
    return 'invalid storage path segments'
  }

  if (bucket === 'search-attachments') {
    if (parts[0] !== ownership.userId || parts[1] !== 'profiles') {
      return 'search attachment is outside the profile owner folder'
    }
    return null
  }

  // Legacy IFU objects use {profile_id}/{filename}; the cleanup worker codifies
  // the same convention. The profile query is separately scoped to user_id.
  if (parts[0] !== ownership.profileId || parts.length < 2) {
    return 'IFU is outside the owned profile folder'
  }
  return null
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

async function extractDocxText(bytes: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(bytes)
  assertBoundedOfficeArchive(zip)
  const documentXml = zip.file('word/document.xml')
  if (!documentXml) throw new Error('DOCX has no word/document.xml content')
  const xml = await documentXml.async('string')
  return decodeXmlEntities(
    xml
      .replace(/<w:tab\b[^>]*\/>/gi, '\t')
      .replace(/<w:br\b[^>]*\/>/gi, '\n')
      .replace(/<\/w:p>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
}

function assertBoundedOfficeArchive(zip: JSZip): void {
  const entries = Object.values(zip.files)
  if (entries.length > MAX_OFFICE_ARCHIVE_ENTRIES) {
    throw new Error('Office document contains too many archive entries')
  }

  let totalUncompressedBytes = 0
  for (const entry of entries) {
    const data = (entry as JSZip.JSZipObject & {
      _data?: { uncompressedSize?: number }
    })._data
    const size = data?.uncompressedSize
    if (typeof size !== 'number' || !Number.isFinite(size) || size < 0) {
      // Directories and synthetic entries can omit compressed data.
      if (!entry.dir) throw new Error('Office document archive size is unavailable')
      continue
    }
    totalUncompressedBytes += size
    if (totalUncompressedBytes > MAX_OFFICE_ARCHIVE_UNCOMPRESSED_BYTES) {
      throw new Error('Office document exceeds the uncompressed extraction limit')
    }
  }
}

function excelCellText(value: ExcelJS.CellValue): string {
  if (value == null) return ''
  if (typeof value === 'object') {
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join('')
    }
    if ('result' in value && value.result != null) return String(value.result)
    if ('text' in value && typeof value.text === 'string') return value.text
    return ''
  }
  return String(value)
}

async function extractXlsxText(bytes: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(bytes)
  assertBoundedOfficeArchive(zip)

  const workbook = new ExcelJS.Workbook()
  // ExcelJS declares its input as an ArrayBuffer-compatible `Buffer`. Create a
  // standalone ArrayBuffer so the value is exact and does not depend on the
  // offset or generic backing-buffer type of the incoming Uint8Array.
  const arrayBuffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(arrayBuffer).set(bytes)
  await workbook.xlsx.load(arrayBuffer)
  const lines: string[] = []
  let extractedChars = 0
  workbook.eachSheet((sheet) => {
    if (extractedChars >= MAX_EXTRACTED_TEXT_CHARS) return
    lines.push(`[Sheet: ${sheet.name}]`)
    extractedChars += sheet.name.length + 10
    sheet.eachRow((row) => {
      if (extractedChars >= MAX_EXTRACTED_TEXT_CHARS) return
      const values: string[] = []
      row.eachCell({ includeEmpty: false }, (cell) => {
        if (extractedChars >= MAX_EXTRACTED_TEXT_CHARS) return
        const value = excelCellText(cell.value).trim()
        if (value) {
          const remaining = MAX_EXTRACTED_TEXT_CHARS - extractedChars
          const bounded = value.slice(0, remaining)
          values.push(bounded)
          extractedChars += bounded.length
        }
      })
      if (values.length > 0) {
        const line = values.join(' | ')
        lines.push(line)
        extractedChars += Math.max(0, line.length - values.reduce((sum, value) => sum + value.length, 0)) + 1
      }
    })
  })
  return lines.join('\n').slice(0, MAX_EXTRACTED_TEXT_CHARS)
}

export async function extractControlledDocumentText(path: string, bytes: Uint8Array): Promise<string> {
  if (bytes.byteLength === 0) throw new Error('document is empty')
  if (bytes.byteLength > MAX_CONTROLLED_DOCUMENT_BYTES) {
    throw new Error(`document exceeds the ${MAX_CONTROLLED_DOCUMENT_BYTES / 1024 / 1024} MB extraction limit`)
  }

  const extension = path.split('.').pop()?.toLowerCase()
  let extracted: string
  if (extension === 'pdf') {
    const pdf = await extractPdfText(bytes)
    if (!pdf.hasTextLayer) throw new Error('PDF has no usable text layer; OCR is required')
    extracted = pdf.text
  } else if (extension === 'docx') {
    extracted = await extractDocxText(bytes)
  } else if (extension === 'xlsx') {
    extracted = await extractXlsxText(bytes)
  } else if (extension === 'txt' || extension === 'csv') {
    extracted = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  } else {
    throw new Error(`unsupported controlled-document format: ${extension || 'unknown'}`)
  }

  const sanitized = sanitizeForLlm(extracted, MAX_EXTRACTED_TEXT_CHARS)
  if (sanitized.length < 20) throw new Error('document did not yield enough usable text')
  return sanitized
}

export function controlledEvidenceMetadata(
  documents: ControlledEvidenceDocument[],
): ControlledEvidenceMetadata[] {
  return documents.map(({ storage_bucket: _bucket, storage_path: _path, text: _text, ...metadata }) => metadata)
}

export async function loadProfileControlledEvidence(
  profile: ProfileWithEvidenceReferences,
  ownership: ControlledEvidenceOwnership,
  download: EvidenceDownload,
): Promise<ControlledEvidenceLoadResult> {
  const references: Array<{
    kind: ControlledEvidenceKind
    bucket: ControlledEvidenceDocument['storage_bucket']
    path: string
  }> = []

  if (profile.ifu_storage_path) {
    references.push({ kind: 'ifu', bucket: 'ifu-documents', path: profile.ifu_storage_path })
  }
  const rawStrategyPaths = profile.search_strategy?.strategy_doc_paths
  if (rawStrategyPaths !== undefined && (
    !Array.isArray(rawStrategyPaths) ||
    rawStrategyPaths.length > 5 ||
    rawStrategyPaths.some((path) => typeof path !== 'string')
  )) {
    return {
      status: 'unavailable',
      documents: [],
      errors: ['Controlled search-strategy document references are invalid.'],
    }
  }
  for (const path of rawStrategyPaths ?? []) {
    references.push({ kind: inferDocumentKind(path), bucket: 'search-attachments', path })
  }

  const deduped = references.filter((reference, index) =>
    references.findIndex((candidate) =>
      candidate.bucket === reference.bucket && candidate.path === reference.path,
    ) === index,
  )
  if (deduped.length === 0) return { status: 'not_configured', documents: [], errors: [] }

  const documents: ControlledEvidenceDocument[] = []
  const errors: string[] = []
  const perDocumentBudget = Math.min(
    MAX_CONTROLLED_DOCUMENT_CHARS,
    Math.floor(MAX_CONTROLLED_EVIDENCE_CHARS / deduped.length),
  )

  for (const reference of deduped) {
    const label = safeDocumentLabel(reference.path)
    const ownershipError = validateOwnedStoragePath(
      reference.bucket,
      reference.path,
      ownership,
    )
    if (ownershipError) {
      errors.push(`${label}: ${ownershipError}`)
      continue
    }
    try {
      const bytes = await download(reference.bucket, reference.path)
      const extracted = await extractControlledDocumentText(reference.path, bytes)
      const text = extracted.slice(0, perDocumentBudget)
      documents.push({
        kind: reference.kind,
        label,
        storage_bucket: reference.bucket,
        storage_path: reference.path,
        content_sha256: createHash('sha256').update(bytes).digest('hex'),
        extractor_version: CONTROLLED_EVIDENCE_EXTRACTOR_VERSION,
        text,
        original_char_count: extracted.length,
        included_char_count: text.length,
        truncated: text.length < extracted.length,
      })
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      errors.push(`${label}: ${reason}`)
    }
  }

  // Partial controlled evidence is not safe classification context: a missing
  // referenced IFU/PMS document could contain the fact that changes relevance.
  if (errors.length > 0 || documents.length !== deduped.length) {
    return { status: 'unavailable', documents, errors }
  }
  return { status: 'loaded', documents, errors: [] }
}
