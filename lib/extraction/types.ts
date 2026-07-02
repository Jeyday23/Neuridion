import { z } from 'zod'

export const fsnDetailFieldsSchema = z.object({
  fscaReference: z.string().nullable(),
  productNames: z.array(z.string()),
  refNumbers: z.array(z.string()),
  lotNumbers: z.array(z.string()),
  serialNumbers: z.array(z.string()),
  udiDis: z.array(z.string()),
  actionRequired: z.string().nullable(),
})

export type FsnDetailFields = z.infer<typeof fsnDetailFieldsSchema>
export type ExtractionStatus = 'extracted' | 'needs_ocr' | 'failed' | 'skipped_size'
export type FieldMethod = 'regex' | 'ai'

export interface FieldProvenance {
  method: FieldMethod
  confidence: number
  model?: string
  promptVersion?: string
  snippet?: string
}

export interface ExtractionResult {
  status: ExtractionStatus
  text: string | null
  pageCount: number | null
  hasTextLayer: boolean | null
  language: 'de' | 'en' | 'mixed' | null
  fields: FsnDetailFields
  provenance: Partial<Record<keyof FsnDetailFields, FieldProvenance>>
  ungroundedDropped: string[]
  warnings: string[]
}

export const emptyFields = (): FsnDetailFields => ({
  fscaReference: null,
  productNames: [],
  refNumbers: [],
  lotNumbers: [],
  serialNumbers: [],
  udiDis: [],
  actionRequired: null,
})
