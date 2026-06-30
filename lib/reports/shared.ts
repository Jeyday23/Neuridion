export const DECISION_LABEL: Record<string, string> = {
  relevant:      'Potentially Relevant',
  uncertain:     'Requires Further Review',
  excluded:      'Not Relevant',
  filter_failed: 'Unprocessed — Manual Review Required',
}

export function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

export function safeCell(val: string | null | undefined): string {
  if (!val) return ''
  const stripped = val.replace(/^[﻿​ ]+/, '')
  if (/^[=+\-@\t\r|]/.test(stripped)) return "'" + stripped
  return stripped
}

export function safeHref(url: string | null | undefined): string {
  if (!url) return '#'
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return url
  } catch { /* malformed URL */ }
  return '#'
}
