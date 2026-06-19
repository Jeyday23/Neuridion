import { describe, it, expect } from 'vitest'
import {
  isMhraRoundupPage,
  cleanMhraRoundupTitle,
  splitRoundupSections,
  isValidRoundupSection,
  cleanTitle,
  extractGovUkAttachmentUrls,
} from '@/lib/scrapers/mhra'

describe('MHRA roundup parsing', () => {
  describe('GOV.UK attachment provenance', () => {
    it('keeps only unique HTTPS GOV.UK evidence URLs', () => {
      const urls = extractGovUkAttachmentUrls({
        details: {
          attachments: [
            { url: 'https://assets.publishing.service.gov.uk/media/fsn.pdf' },
            { web_url: '/government/uploads/fsn-supporting-note.pdf' },
            { url: 'https://assets.publishing.service.gov.uk/media/fsn.pdf' },
            { url: 'https://evil.example/pretend-fsn.pdf' },
            { url: 'http://www.gov.uk/insecure.pdf' },
          ],
        },
      })

      expect(urls).toEqual([
        'https://assets.publishing.service.gov.uk/media/fsn.pdf',
        'https://www.gov.uk/government/uploads/fsn-supporting-note.pdf',
      ])
    })
  })

  describe('isMhraRoundupPage', () => {
    it('detects roundup from plural Notices title + date range', () => {
      expect(isMhraRoundupPage(
        'Field Safety Notices: 3 to 7 November 2025',
        '/drug-device-alerts/field-safety-notices-3-to-7-november-2025',
        '<h3>Mfr: Device</h3><p>text</p>',
        '',
      )).toBe(true)
    })

    it('detects cross-month roundup title', () => {
      expect(isMhraRoundupPage(
        'Field Safety Notices: 27 April to 1 May 2026',
        '/some/path',
        '<p>content</p>',
        '',
      )).toBe(true)
    })

    it('does not flag individual FSN page with MHRA ref', () => {
      expect(isMhraRoundupPage(
        'Medtronic: Micra AV Leadless Pacemaker',
        '/drug-device-alerts/medtronic-micra-av',
        '<p>Details about this specific device recall</p>',
        '2025-001-1234',
      )).toBe(false)
    })

    it('returns false when refNumber present even with roundup-style title', () => {
      expect(isMhraRoundupPage(
        'Field Safety Notices: 3 to 7 November 2025',
        '/drug-device-alerts/field-safety-notices-3-to-7-november-2025',
        '<h3>Mfr: Device</h3><p>text</p>',
        '2025-001',
      )).toBe(false)
    })

    it('does not misclassify individual page with Problem/Action headings', () => {
      const body = [
        '<h2>Problem</h2>',
        '<p>This field safety corrective action affects a pacemaker device.</p>',
        '<h2>Action</h2>',
        '<p>Users should follow the manufacturer instructions.</p>',
      ].join('\n')
      expect(isMhraRoundupPage(
        'Medtronic: Micra AV Pacemaker Safety Notice',
        '/drug-device-alerts/medtronic-micra-av',
        body,
        '',
      )).toBe(false)
    })
  })

  describe('cleanTitle', () => {
    it('strips singular "Field Safety Notice:" but preserves plural "Notices"', () => {
      expect(cleanTitle('Field Safety Notice: Medtronic Micra AV'))
        .toBe('Medtronic Micra AV')

      const roundup = cleanTitle('Field Safety Notices: 3 to 7 November 2025')
      expect(roundup).toBe('Field Safety Notices: 3 to 7 November 2025')
      expect(roundup).not.toMatch(/^s:/i)
    })

    it('strips "FSN:" prefix', () => {
      expect(cleanTitle('FSN: Abbott Device Recall')).toBe('Abbott Device Recall')
    })
  })

  describe('splitRoundupSections', () => {
    const MULTI_FSN_HTML = [
      '<h3>Medtronic: Micra AV Leadless Pacemaker</h3>',
      '<p>MHRA reference: 2025001234</p>',
      '<p>A corrective action has been issued for this device.</p>',
      '<h3>Siemens Healthineers: MAGNETOM Avanto MRI Scanner</h3>',
      '<p><a href="/drug-device-alerts/siemens-magnetom-avanto">View notice</a></p>',
      '<p>Field safety corrective action regarding software update.</p>',
      '<h3>Navigation heading</h3>',
      '<p>Some general informational text with no FSN signals at all.</p>',
    ].join('\n')

    it('extracts multiple FSNs from roundup page', () => {
      const results = splitRoundupSections(MULTI_FSN_HTML, '/roundup', '2025-11-07')
      expect(results.length).toBeGreaterThanOrEqual(2)
      expect(results.some(r => r.title.includes('Micra'))).toBe(true)
      expect(results.some(r => r.title.includes('MAGNETOM'))).toBe(true)
    })

    it('drops unrelated sections without FSN signals', () => {
      const results = splitRoundupSections(MULTI_FSN_HTML, '/roundup', '2025-11-07')
      expect(results.every(r => !r.title.includes('Navigation'))).toBe(true)
    })

    it('extracts single FSN from roundup with one valid section', () => {
      const html = [
        '<h3>Abbott: FreeStyle Libre 2 Sensor</h3>',
        '<p>MHRA reference: 2025005678</p>',
        '<p>Recall due to adhesive issue on device.</p>',
      ].join('\n')
      const results = splitRoundupSections(html, '/roundup', '2025-11-07')
      expect(results).toHaveLength(1)
      expect(results[0].manufacturer).toBe('Abbott')
      expect(results[0].product_name).toBe('FreeStyle Libre 2 Sensor')
    })

    it('handles h2, h3, and h4 heading variants', () => {
      const html = [
        '<h2>Abbott: Device Alpha</h2>',
        '<p>MHRA reference: 2025001111</p><p>Details about recall.</p>',
        '<h4>Philips: Device Beta</h4>',
        '<p><a href="/drug-device-alerts/philips-device-beta">View notice</a></p>',
        '<p>Field safety corrective action for defibrillator battery.</p>',
      ].join('\n')
      const results = splitRoundupSections(html, '/roundup', '2025-11-07')
      expect(results).toHaveLength(2)
      expect(results[0].title).toContain('Abbott')
      expect(results[1].title).toContain('Philips')
    })

    it('returns empty array for HTML with no headings', () => {
      expect(splitRoundupSections('<p>Just text</p>', '/path', null)).toHaveLength(0)
    })

    it('does not emit sections with structural headings', () => {
      const html = [
        '<h2>Problem</h2>',
        '<p>MHRA reference: 2025009999</p><p>Details about the issue.</p>',
        '<h2>Action</h2>',
        '<p>What users should do about this recall.</p>',
        '<h3>Medtronic: Micra AV Pacemaker</h3>',
        '<p>MHRA reference: 2025001234</p><p>Corrective action for device.</p>',
      ].join('\n')
      const results = splitRoundupSections(html, '/roundup', '2025-11-07')
      const titles = results.map(r => r.title)
      expect(titles).not.toContain('Problem')
      expect(titles).not.toContain('Action')
      expect(titles).not.toContain('Advice')
      expect(titles).not.toContain('Background')
      expect(titles).not.toContain('Summary')
      expect(results.some(r => r.title.includes('Micra'))).toBe(true)
    })
  })

  describe('isValidRoundupSection', () => {
    it('accepts section with MHRA ref or FSN link (strong signals)', () => {
      expect(isValidRoundupSection('Heading', '<p>text</p>', '2025001', null)).toBe(true)
      expect(isValidRoundupSection('Heading', '<p>text</p>', null, '/drug-device-alerts/x')).toBe(true)
    })

    it('requires 2+ weak signals when no strong signal present', () => {
      expect(isValidRoundupSection(
        'Generic Heading', '<p>recall issued</p>', null, null,
      )).toBe(false)

      expect(isValidRoundupSection(
        'Medtronic: Infusion Pump',
        '<p>recall issued for device on 5 January 2025</p>',
        null, null,
      )).toBe(true)
    })
  })

  describe('cleanMhraRoundupTitle', () => {
    it('constructs clean title preserving date range', () => {
      expect(cleanMhraRoundupTitle('Field Safety Notices: 3 to 7 November 2025'))
        .toBe('Field Safety Notices: 3 to 7 November 2025')
      expect(cleanMhraRoundupTitle('Field Safety Notices: 27 April to 1 May 2026'))
        .toBe('Field Safety Notices: 27 April to 1 May 2026')
    })
  })
})
