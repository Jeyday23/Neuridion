import { createHash } from 'crypto'
import { describe, expect, it, vi } from 'vitest'
import type { ScrapedFsn } from '@/lib/scrapers/bfarm'
import {
  computeAttachmentDigest,
  createHttpDocumentFetcher,
  documentKey,
  verifySourceDocuments,
  type DocumentVersionStore,
  type KnownDocumentVersion,
  type NewDocumentVersion,
} from '@/lib/sources/document-monitor'

const PDF_A = 'https://assets.publishing.service.gov.uk/media/abc/fsn.pdf'
const PDF_B = 'https://assets.publishing.service.gov.uk/media/def/lots.pdf'
const sha = (text: string) => createHash('sha256').update(text).digest('hex')

function notice(id: string, urls: string[]): ScrapedFsn {
  return {
    external_id: id,
    title: 'Pump recall',
    manufacturer: 'Acme',
    product_name: null,
    fsn_date: '2026-09-01',
    source_url: `https://www.gov.uk${id}`,
    raw_content: 'text',
    source_db: 'mhra',
    attachments: urls.map(url => ({ url, status: 'listed' as const })),
  }
}

function memoryStore(initial: Array<[string, string, KnownDocumentVersion]> = []) {
  const latest = new Map(initial.map(([record, url, version]) => [documentKey(record, url), version]))
  const appended: NewDocumentVersion[] = []
  const store: DocumentVersionStore = {
    latest: vi.fn(async () => new Map(latest)),
    append: vi.fn(async (rows: NewDocumentVersion[]) => { appended.push(...rows) }),
  }
  return { store, appended }
}

function response(body: string | null, init: { status?: number; headers?: Record<string, string> } = {}) {
  return new Response(body, { status: init.status ?? 200, headers: init.headers })
}

describe('computeAttachmentDigest', () => {
  it('is order independent and null unless every attachment is verified', () => {
    const a = { url: PDF_A, sha256: sha('a') }
    const b = { url: PDF_B, sha256: sha('b') }
    expect(computeAttachmentDigest([a, b])).toBe(computeAttachmentDigest([b, a]))
    expect(computeAttachmentDigest([a, { url: PDF_B, sha256: null }])).toBeNull()
    expect(computeAttachmentDigest([])).toBeNull()
    expect(computeAttachmentDigest([{ url: PDF_A, sha256: 'not-a-hash' }])).toBeNull()
  })

  it('changes when the body at an unchanged URL changes', () => {
    expect(computeAttachmentDigest([{ url: PDF_A, sha256: sha('v1') }]))
      .not.toBe(computeAttachmentDigest([{ url: PDF_A, sha256: sha('v2') }]))
  })
})

describe('createHttpDocumentFetcher', () => {
  it('hashes the body and returns validators', async () => {
    const fetchImpl = vi.fn(async () => response('pdf-bytes', { headers: { etag: '"e1"', 'last-modified': 'Tue, 01 Sep 2026 10:00:00 GMT', 'content-type': 'application/pdf' } }))
    const fetcher = createHttpDocumentFetcher('mhra', { fetchImpl })
    const result = await fetcher(PDF_A, undefined, { keepBytes: false })
    expect(result).toMatchObject({ status: 'retrieved', sha256: sha('pdf-bytes'), byteSize: 9, etag: '"e1"' })
  })

  it('sends validators only when a stored hash exists and maps 304 to not_modified', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>)['If-None-Match']).toBe('"e1"')
      return response(null, { status: 304 })
    })
    const fetcher = createHttpDocumentFetcher('mhra', { fetchImpl })
    const known = { id: 'v1', sha256: sha('x'), etag: '"e1"', last_modified: null, byte_size: 1 }
    await expect(fetcher(PDF_A, known, { keepBytes: false })).resolves.toEqual({ status: 'not_modified' })
  })

  it('treats 304 without a stored version as a failure, not as unchanged', async () => {
    const fetcher = createHttpDocumentFetcher('mhra', { fetchImpl: vi.fn(async () => response(null, { status: 304 })) })
    await expect(fetcher(PDF_A, undefined, { keepBytes: false })).resolves.toMatchObject({ status: 'failed' })
  })

  it('reports missing documents and oversized bodies', async () => {
    const missing = createHttpDocumentFetcher('mhra', { fetchImpl: vi.fn(async () => response('gone', { status: 404 })) })
    await expect(missing(PDF_A, undefined, { keepBytes: false })).resolves.toMatchObject({ status: 'missing' })

    const large = createHttpDocumentFetcher('mhra', { maxBytes: 4, fetchImpl: vi.fn(async () => response('0123456789')) })
    await expect(large(PDF_A, undefined, { keepBytes: false })).resolves.toMatchObject({ status: 'too_large' })
  })

  it('refuses non-authority hosts, including via redirect', async () => {
    const fetchImpl = vi.fn(async () => response(null, { status: 302, headers: { location: 'https://evil.example/pdf' } }))
    const fetcher = createHttpDocumentFetcher('mhra', { fetchImpl })
    await expect(fetcher('https://evil.example/x.pdf', undefined, { keepBytes: false })).resolves.toMatchObject({ status: 'blocked' })
    expect(fetchImpl).not.toHaveBeenCalled()
    await expect(fetcher(PDF_A, undefined, { keepBytes: false })).resolves.toMatchObject({ status: 'blocked' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('maps network errors to failed', async () => {
    const fetcher = createHttpDocumentFetcher('mhra', { fetchImpl: vi.fn(async () => { throw new TypeError('reset') }) })
    await expect(fetcher(PDF_A, undefined, { keepBytes: false })).resolves.toMatchObject({ status: 'failed' })
  })
})

describe('verifySourceDocuments', () => {
  const now = () => new Date('2026-10-10T12:00:00Z')

  it('records a new version when the body at the same URL changes', async () => {
    const { store, appended } = memoryStore([['/n1', PDF_A, { id: 'old', sha256: sha('v1'), etag: null, last_modified: null, byte_size: 2 }]])
    const fetcher = vi.fn(async () => ({ status: 'retrieved' as const, sha256: sha('v2'), byteSize: 2, contentType: 'application/pdf', etag: null, lastModified: null }))
    const result = await verifySourceDocuments('mhra', [notice('/n1', [PDF_A])], { store, fetcher, now })

    expect(appended).toHaveLength(1)
    expect(appended[0]).toMatchObject({ source_record_id: '/n1', document_url: PDF_A, sha256: sha('v2'), previous_version_id: 'old' })
    const record = result.records.get('/n1')!
    expect(record.complete).toBe(true)
    expect(record.digest).toBe(computeAttachmentDigest([{ url: PDF_A, sha256: sha('v2') }]))
    expect(result.warnings).toEqual([])
  })

  it('does not append a duplicate version for an unchanged body', async () => {
    const { store, appended } = memoryStore([['/n1', PDF_A, { id: 'old', sha256: sha('v1'), etag: '"e"', last_modified: null, byte_size: 2 }]])
    const fetcher = vi.fn(async () => ({ status: 'retrieved' as const, sha256: sha('v1'), byteSize: 2, contentType: null, etag: '"e"', lastModified: null }))
    const result = await verifySourceDocuments('mhra', [notice('/n1', [PDF_A])], { store, fetcher, now })
    expect(appended).toHaveLength(0)
    expect(result.records.get('/n1')!.digest).toBe(computeAttachmentDigest([{ url: PDF_A, sha256: sha('v1') }]))
  })

  it('uses the stored hash for not_modified responses', async () => {
    const { store } = memoryStore([['/n1', PDF_A, { id: 'old', sha256: sha('v1'), etag: '"e"', last_modified: null, byte_size: 2 }]])
    const fetcher = vi.fn(async () => ({ status: 'not_modified' as const }))
    const result = await verifySourceDocuments('mhra', [notice('/n1', [PDF_A])], { store, fetcher, now })
    expect(result.records.get('/n1')).toMatchObject({ complete: true })
    expect(result.counts.not_modified).toBe(1)
  })

  it('yields no digest and a warning when any attachment fails', async () => {
    const { store } = memoryStore()
    const fetcher = vi.fn(async (url: string) => url === PDF_A
      ? { status: 'retrieved' as const, sha256: sha('a'), byteSize: 1, contentType: null, etag: null, lastModified: null }
      : { status: 'missing' as const, detail: 'HTTP 404' })
    const result = await verifySourceDocuments('mhra', [notice('/n1', [PDF_A, PDF_B])], { store, fetcher, now })
    const record = result.records.get('/n1')!
    expect(record.digest).toBeNull()
    expect(record.complete).toBe(false)
    expect(record.attachments.find(a => a.url === PDF_B)?.status).toBe('missing')
    expect(result.warnings.join(' ')).toMatch(/1 attachment\(s\) could not be verified \(1 no longer available upstream\)/)
  })

  it('withholds the digest when a new version cannot be recorded', async () => {
    const { store } = memoryStore()
    store.append = vi.fn(async () => { throw new Error('db down') })
    const fetcher = vi.fn(async () => ({ status: 'retrieved' as const, sha256: sha('a'), byteSize: 1, contentType: null, etag: null, lastModified: null }))
    const result = await verifySourceDocuments('mhra', [notice('/n1', [PDF_A])], { store, fetcher, now })
    expect(result.records.get('/n1')!.digest).toBeNull()
    expect(result.warnings.join(' ')).toMatch(/history could not be stored/)
  })

  it('caps the documents checked per pass and reports the remainder', async () => {
    const { store } = memoryStore()
    const fetcher = vi.fn(async () => ({ status: 'retrieved' as const, sha256: sha('a'), byteSize: 1, contentType: null, etag: null, lastModified: null }))
    const result = await verifySourceDocuments('mhra', [notice('/n1', [PDF_A]), notice('/n2', [PDF_B])], { store, fetcher, now, maxDocuments: 1 })
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(result.records.get('/n2')!.digest).toBeNull()
    expect(result.warnings.join(' ')).toMatch(/not checked/)
  })

  it('ignores records without attachments', async () => {
    const { store } = memoryStore()
    const plain = { ...notice('/n1', []), attachments: undefined }
    const result = await verifySourceDocuments('mhra', [plain], { store, fetcher: vi.fn(), now })
    expect(result.records.size).toBe(0)
    expect(store.latest).not.toHaveBeenCalled()
  })
})
