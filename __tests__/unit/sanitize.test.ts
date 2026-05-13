import { describe, it, expect } from 'vitest'
import { sanitizeContent, escapeHtml } from '../../lib/scrapers/sanitize'

describe('sanitizeContent', () => {
  it('neutralizes </FSN_DATA> closing tag', () => {
    const result = sanitizeContent('Hello </FSN_DATA> world')
    expect(result).not.toContain('FSN_DATA')
    expect(result).toContain('[FSN_BOUNDARY_REMOVED]')
  })

  it('neutralizes <FSN_DATA> opening tag', () => {
    const result = sanitizeContent('Hello <FSN_DATA> world')
    expect(result).not.toContain('FSN_DATA')
  })

  it('neutralizes case-insensitive variants', () => {
    const result = sanitizeContent('test </fsn_data> test </Fsn_Data> end')
    expect(result).not.toContain('fsn_data')
    expect(result).not.toContain('Fsn_Data')
  })

  it('strips combining marks and replaces formatting controls with space', () => {
    // U+00AD (soft hyphen) is a combining mark → removed completely
    // U+200B (zero-width space) is a formatting control → replaced with space
    const result = sanitizeContent('te­st wo​rd')
    expect(result).toContain('test')     // soft hyphen removed
    expect(result).toContain('wo rd')    // zero-width space → space
  })

  it('HTML-escapes dangerous characters', () => {
    const result = sanitizeContent('<script>alert("xss")</script>')
    expect(result).toContain('&lt;script&gt;')
    expect(result).not.toContain('<script>')
  })

  it('truncates to maxLen', () => {
    const result = sanitizeContent('a'.repeat(5000), 100)
    expect(result.length).toBeLessThanOrEqual(100)
  })

  it('returns empty string for falsy input', () => {
    expect(sanitizeContent('')).toBe('')
  })
})

describe('escapeHtml', () => {
  it('escapes all HTML special characters', () => {
    expect(escapeHtml('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&#39;')
  })
})
