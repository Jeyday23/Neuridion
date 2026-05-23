// Characters that are invisible in text but visible in LLM context — potential prompt injection vectors.
// Combining marks (U+00AD, U+034F, U+115F) don't break words; remove completely.
// Formatting controls (U+200B–U+200D, U+2060, U+202A–U+202E, U+FEFF) break words; replace with space.
const COMBINING_MARKS = /[­͏ᅟ]/g
const FORMATTING_CONTROLS = /[​‌‍⁠‪‫‬‭‮﻿]/g
const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}
const HTML_CHARS = /[&<>"']/g
const FSN_BOUNDARY = /<\/?F[​‌‍﻿]*S[​‌‍﻿]*N[​‌‍﻿]*[_.\s]?[​‌‍﻿]*D[​‌‍﻿]*A[​‌‍﻿]*T[​‌‍﻿]*A[​‌‍﻿]*>/gi
const ROLE_MARKERS = /<\|(?:system|user|assistant|im_start|im_end)\|>/gi
const XML_INSTRUCTIONS = /<\/?(?:instructions|system|tool_use|function_call|tool_result|thinking|answer)[^>]*>/gi

export function escapeHtml(text: string): string {
  return text.replace(HTML_CHARS, (ch) => HTML_ESCAPE_MAP[ch])
}

function neutralizeFsnBoundary(text: string): string {
  return text.replace(FSN_BOUNDARY, '[FSN_BOUNDARY_REMOVED]')
}

export function sanitizeContent(text: string, maxLen = 3000): string {
  if (!text) return ''
  return escapeHtml(
    neutralizeFsnBoundary(
      text
        .replace(COMBINING_MARKS, '')
        .replace(FORMATTING_CONTROLS, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    )
  ).slice(0, maxLen)
}

export function sanitizeForLlm(text: string, maxLen = 3000): string {
  if (!text) return ''
  let s = text
    .replace(COMBINING_MARKS, '')
    .replace(FORMATTING_CONTROLS, ' ')
  // Strip boundary/role/XML tags on the RAW text (before any entity decoding)
  // so that encoded variants like &lt;FSN_DATA&gt; are caught by the regexes
  // operating on literal characters, not on decoded HTML entities.
  s = neutralizeFsnBoundary(s)
  s = s
    .replace(ROLE_MARKERS, '[MARKER_REMOVED]')
    .replace(XML_INSTRUCTIONS, '[TAG_REMOVED]')
    .replace(/<[^>]+>/g, '')
  // Decode HTML entities AFTER stripping dangerous tags — this prevents
  // entity-encoded injection (e.g. &lt;|system|&gt;) from surviving.
  s = s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#0*60;/g, '<').replace(/&#0*62;/g, '>').replace(/&#x0*3c;/gi, '<').replace(/&#x0*3e;/gi, '>')
    .replace(/&#x0*26;/gi, '&').replace(/&#x0*22;/gi, '"').replace(/&#x0*27;/gi, "'")
  // Second pass: strip any tags that were hidden behind entity encoding
  s = neutralizeFsnBoundary(s)
  s = s
    .replace(ROLE_MARKERS, '[MARKER_REMOVED]')
    .replace(XML_INSTRUCTIONS, '[TAG_REMOVED]')
    .replace(/<[^>]+>/g, '')
  return s
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen)
}

export function sanitizeProfileField(text: string, maxLen = 200): string {
  if (!text) return ''
  return sanitizeForLlm(text, maxLen)
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}
