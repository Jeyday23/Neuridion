import { emptyFields, type FsnDetailFields } from './types'

const PATTERNS = {
  fscaReference: [
    /\b(FSCA[-\s/]?\d{2,4}[-/][A-Z0-9-]{1,16})\b/i,
    /\b(?:Referenz(?:nummer)?|Reference(?:\s+number)?|Ref(?:erence)?\.?)[:\s#]*([A-Z0-9][A-Z0-9\-/]{4,28})\b/i,
  ],
  refNumbers: [
    /\b(?:REF|Art\.?\s?-?Nr\.?|Artikelnummer|Katalog(?:nummer)?|Catalog(?:ue)?\s+(?:No\.?|Number))[:\s#]*([A-Z0-9][A-Z0-9\-/.]{2,25})\b/gi,
  ],
  lotNumbers: [
    /\b(?:LOT|Charge(?:n-?Nr\.?|nbezeichnung)?|Batch(?:\s+No\.?)?)[:\s#]*([A-Z0-9][A-Z0-9\-/]{2,24})\b/gi,
  ],
  serialNumbers: [
    /\b(?:SN|S\/N|Serial\s+(?:No\.?|Number)|Serien-?(?:Nr\.?|nummer))[:\s#]*([A-Z0-9][A-Z0-9-]{2,28})\b/gi,
  ],
  udiDis: [
    /\(01\)\s?(\d{14})\b/g,
    /\b(?:UDI-?DI|Basic\s+UDI-?DI|Basis-UDI-?DI)[:\s]*([A-Z0-9+/.-]{10,40})\b/gi,
  ],
  productSections: [
    /\b(?:Betroffene\s+Produkte?|Betroffene\s+Medizinprodukte?|Affected\s+(?:products?|devices?))[:\s]*([\s\S]{0,700}?)(?:\n\s*\n|(?:\n[A-ZÄÖÜ][^\n]{0,80}:)|$)/i,
  ],
  actions: [
    /\b(?:Maßnahmen|Vom Kunden zu treffende Maßnahmen|Erforderliche Maßnahmen|Actions?\s+(?:to\s+be\s+taken|required)|Required actions?)[:\s]*([\s\S]{0,1200}?)(?:\n\s*\n|(?:\n[A-ZÄÖÜ][^\n]{0,80}:)|$)/i,
  ],
} as const

const uniq = (values: string[]) => [...new Set(values.map(cleanValue).filter(Boolean))]

function cleanValue(value: string): string {
  return value
    .replace(/[;,.)\]]+$/g, '')
    .replace(/^[([:;\s]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function collect(text: string, regexes: readonly RegExp[]): string[] {
  return uniq(regexes.flatMap((regex) => {
    const re = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : `${regex.flags}g`)
    return [...text.matchAll(re)].map((match) => match[1] ?? '')
  }))
}

function sectionLines(section: string): string[] {
  return uniq(section
    .split(/\n|•|- {1,}/)
    .map(line => line.replace(/\b(?:REF|LOT|Charge|Batch|UDI|SN)\b[\s\S]*$/i, '').trim())
    .filter(line => line.length >= 3 && line.length <= 140))
}

export function extractFieldsDeterministic(text: string): FsnDetailFields {
  const out = emptyFields()
  for (const regex of PATTERNS.fscaReference) {
    const match = regex.exec(text)
    if (match?.[1]) {
      out.fscaReference = cleanValue(match[1])
      break
    }
  }

  out.refNumbers = collect(text, PATTERNS.refNumbers)
  out.lotNumbers = collect(text, PATTERNS.lotNumbers)
  out.serialNumbers = collect(text, PATTERNS.serialNumbers)
  out.udiDis = collect(text, PATTERNS.udiDis)

  for (const regex of PATTERNS.productSections) {
    const match = regex.exec(text)
    if (match?.[1]) {
      out.productNames = sectionLines(match[1])
      break
    }
  }

  for (const regex of PATTERNS.actions) {
    const match = regex.exec(text)
    if (match?.[1]) {
      out.actionRequired = match[1].replace(/\s+/g, ' ').trim().slice(0, 900)
      break
    }
  }

  return out
}

export function needsAiExtraction(fields: FsnDetailFields): boolean {
  return !fields.fscaReference || fields.lotNumbers.length === 0 || fields.refNumbers.length === 0
}
