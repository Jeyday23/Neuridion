import { extractText, getDocumentProxy } from 'unpdf'

export interface PdfText {
  text: string
  pageCount: number
  hasTextLayer: boolean
}

export async function extractPdfText(bytes: Uint8Array): Promise<PdfText> {
  const pdf = await getDocumentProxy(bytes)
  const result = await extractText(pdf, { mergePages: true })
  const pageCount = Number(result.totalPages ?? 0)
  const rawText = Array.isArray(result.text) ? result.text.join('\n') : String(result.text ?? '')
  const text = rawText
    .replace(/\u0000/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  const hasTextLayer = text.length > Math.max(80, pageCount * 20)
  return { text, pageCount, hasTextLayer }
}

export function detectLanguage(text: string): 'de' | 'en' | 'mixed' {
  const de = (text.match(/\b(und|der|die|das|für|nicht|Maßnahmen|Charge|Betroffene|Produkte)\b/gi) ?? []).length
  const en = (text.match(/\b(and|the|for|not|actions|batch|device|affected|products)\b/gi) ?? []).length
  if (de > en * 2) return 'de'
  if (en > de * 2) return 'en'
  return 'mixed'
}
