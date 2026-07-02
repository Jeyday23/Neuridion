import { describe, expect, it, vi } from 'vitest'
import { extractDocument } from '@/lib/extraction/run'

const doc = {
  id: 'evidence-1',
  storage_bucket: 'regulatory-evidence',
  storage_path: 'bfarm/doc.pdf',
  media_type: 'application/pdf',
  byte_size: 1024,
  authority_record_id: 'authority-1',
}

describe('extractDocument', () => {
  it('extracts deterministic PDF text without AI when required fields are present', async () => {
    const ai = vi.fn()
    const result = await extractDocument(doc, {
      db: {} as never,
      downloadBytes: vi.fn(async () => new Uint8Array([1, 2, 3])),
      extractText: vi.fn(async () => ({
        text: `Referenznummer: FSCA-2026-0142
Betroffene Produkte: Infusomat Space
REF 8713060
LOT 24C09B77
Maßnahmen: Betroffene Chargen sperren.`,
        pageCount: 2,
        hasTextLayer: true,
      })),
      extractAi: ai,
    })

    expect(result.status).toBe('extracted')
    expect(result.fields.fscaReference).toBe('FSCA-2026-0142')
    expect(result.fields.refNumbers).toContain('8713060')
    expect(result.fields.lotNumbers).toContain('24C09B77')
    expect(result.language).toBe('de')
    expect(ai).not.toHaveBeenCalled()
  })

  it('marks scanned PDFs as needs_ocr and never guesses fields', async () => {
    const result = await extractDocument(doc, {
      db: {} as never,
      downloadBytes: vi.fn(async () => new Uint8Array([1, 2, 3])),
      extractText: vi.fn(async () => ({
        text: '',
        pageCount: 3,
        hasTextLayer: false,
      })),
    })

    expect(result.status).toBe('needs_ocr')
    expect(result.fields.fscaReference).toBeNull()
    expect(result.fields.lotNumbers).toEqual([])
  })

  it('skips PDFs over the configured byte limit before download', async () => {
    const downloadBytes = vi.fn()
    const result = await extractDocument({ ...doc, byte_size: 25 * 1024 * 1024 }, {
      db: {} as never,
      downloadBytes,
    })

    expect(result.status).toBe('skipped_size')
    expect(downloadBytes).not.toHaveBeenCalled()
  })

  it('keeps deterministic extraction when AI detail extraction is unavailable', async () => {
    const previousKey = process.env.ANTHROPIC_API_KEY
    process.env.ANTHROPIC_API_KEY = 'test-key'

    try {
      const result = await extractDocument(doc, {
        db: {} as never,
        downloadBytes: vi.fn(async () => new Uint8Array([1, 2, 3])),
        extractText: vi.fn(async () => ({
          text: `Referenznummer: FSCA-2026-0142
Betroffene Produkte: Infusomat Space`,
          pageCount: 1,
          hasTextLayer: true,
        })),
        extractAi: vi.fn(async () => {
          throw new Error('credit balance is too low')
        }),
      })

      expect(result.status).toBe('extracted')
      expect(result.fields.fscaReference).toBe('FSCA-2026-0142')
      expect(result.warnings.join(' ')).toContain('AI extraction unavailable')
      expect(result.warnings.join(' ')).toContain('credit balance is too low')
    } finally {
      if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY
      else process.env.ANTHROPIC_API_KEY = previousKey
    }
  })
})
