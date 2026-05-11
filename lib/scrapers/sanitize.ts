// Characters that are invisible in text but visible in LLM context — potential prompt injection vectors.
// Combining marks (U+00AD, U+034F, U+115F) don't break words; remove completely.
// Formatting controls (U+200B–U+200D, U+2060, U+202A–U+202E, U+FEFF) break words; replace with space.
const COMBINING_MARKS = /[­͏ᅟ]/g
const FORMATTING_CONTROLS = /[​‌‍⁠‪‫‬‭‮﻿]/g
const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}
const HTML_CHARS = /[&<>"']/g

export function escapeHtml(text: string): string {
  return text.replace(HTML_CHARS, (ch) => HTML_ESCAPE_MAP[ch])
}

export function sanitizeContent(text: string, maxLen = 3000): string {
  if (!text) return ''
  return escapeHtml(
    text
      .replace(COMBINING_MARKS, '')
      .replace(FORMATTING_CONTROLS, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  ).slice(0, maxLen)
}
