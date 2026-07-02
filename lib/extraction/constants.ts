export const EXTRACTOR_VERSION = 'pdf-detail-extract@1'
export const PROMPT_VERSION = 'fsn-pdf-detail-prompt@1'
export const EXTRACTION_MODEL = process.env.EXTRACTION_MODEL ?? 'claude-haiku-4-5'

export const MAX_PDF_BYTES = 20 * 1024 * 1024
export const MAX_PAGES = 60
export const MAX_TEXT_CHARS = 200_000

export const AI_TRIGGER_FIELDS = ['fscaReference', 'lotNumbers', 'refNumbers'] as const
