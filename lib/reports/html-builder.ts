import { escHtml } from '@/lib/utils/html'
import { fmtSourceDb } from '@/lib/domain/source-labels'
import { DECISION_LABEL, fmtDate, safeHref } from './shared'
import type { FsnReportRow } from '@/lib/domain/types'

export function buildReportHtml(
  profile: { device_name: string; manufacturer: string; device_class: string | null; emdn_code: string | null },
  run: { period_from: string; period_to: string; status?: string; dbs_searched?: string[] | null },
  rows: FsnReportRow[],
  runId: string,
  termsUsed: { manufacturer_terms: string[]; device_terms: string[]; raw_manufacturer: string; raw_device_name: string; term_algorithm_version: string } | null,
  extra?: { aiModels?: string[]; reviewerName?: string | null; reviewedAt?: string | null },
): string {
  const today = fmtDate(new Date().toISOString())

  const relevant     = rows.filter((r) => r.filter_decision?.decision === 'relevant')
  const uncertain    = rows.filter((r) => r.filter_decision?.decision === 'uncertain')
  const excluded     = rows.filter((r) => r.filter_decision?.decision === 'excluded')
  const filterFailed = rows.filter((r) => r.filter_decision?.decision === 'filter_failed')

  // Build table rows for a section. isAppendix uses compact 4-col layout + truncated rationale.
  function sectionRows(items: FsnReportRow[], rowBg: string, isAppendix = false): string {
    const colspan = isAppendix ? '4' : '5'
    if (items.length === 0) {
      return `<tr><td colspan="${colspan}" style="padding:8px 7px;color:#888;font-style:italic;">No items in this section.</td></tr>`
    }
    return items.map((r) => {
      const d = r.filter_decision
      if (!d) return ''  // skip rows without a filter decision
      const raw = d.decision === 'filter_failed'
        ? 'AI filter could not be applied — manual review required.'
        : d.rationale
      const rationale = isAppendix && raw.length > 120 ? raw.slice(0, 120) + '…' : raw
      if (isAppendix) {
        return `<tr style="background-color:${rowBg};">
          <td><a href="${safeHref(r.source_url)}" style="color:#1a1a2e;text-decoration:none;">${escHtml(r.title)}</a></td>
          <td>${escHtml(r.manufacturer || '—')}</td>
          <td style="white-space:nowrap;">${fmtDate(r.fsn_date)}</td>
          <td style="font-size:7.5pt;color:#555;">${escHtml(rationale)}</td>
        </tr>`
      }
      return `<tr style="background-color:${rowBg};">
        <td><a href="${safeHref(r.source_url)}" style="color:#1a1a2e;text-decoration:none;">${escHtml(r.title)}</a></td>
        <td>${escHtml(r.manufacturer || '—')}</td>
        <td style="white-space:nowrap;">${fmtDate(r.fsn_date)}</td>
        <td>${escHtml(fmtSourceDb(r.source_db))}</td>
        <td style="font-size:8pt;color:#555;">${escHtml(rationale)}${d.decision === 'filter_failed' ? ' <strong style="color:#991b1b;">&#9888; Manual review required.</strong>' : ''}</td>
      </tr>`
    }).join('')
  }

  const conclusionRelevant = relevant.length + uncertain.length
  const failedNote = filterFailed.length > 0
    ? ` Note: The AI filter could not be applied to ${filterFailed.length} item${filterFailed.length !== 1 ? 's' : ''} due to API unavailability — these require manual review.`
    : ''
  const conclusion = conclusionRelevant === 0 && filterFailed.length === 0
    ? `Based on the automated screening, no Field Safety Notices were classified as relevant to this device profile during the search period. This automated assessment should be reviewed and confirmed by the Person Responsible for Regulatory Compliance (PRRC) before being included in post-market surveillance documentation.`
    : `This review identified ${conclusionRelevant + filterFailed.length} Field Safety Notice${(conclusionRelevant + filterFailed.length) !== 1 ? 's' : ''} requiring attention (${relevant.length} potentially relevant, ${uncertain.length} requiring further review${filterFailed.length > 0 ? `, ${filterFailed.length} AI filter unavailable` : ''}). ${excluded.length > 0 ? `${excluded.length} notice${excluded.length !== 1 ? 's were' : ' was'} assessed as not relevant and excluded from further review. ` : ''}Appropriate follow-up actions should be taken in accordance with the applicable post-market surveillance plan. This automated assessment should be reviewed and confirmed by the Person Responsible for Regulatory Compliance (PRRC) before being included in post-market surveillance documentation.${failedNote}`

  const stdThead = `<thead><tr>
    <th style="width:30%;">Title</th>
    <th style="width:16%;">Manufacturer</th>
    <th style="width:9%;">Date</th>
    <th style="width:7%;">Source</th>
    <th>Rationale</th>
  </tr></thead>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:;"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 10.5pt; color: #1a1a1a; background: #fff; padding: 0; }
  .page { padding: 2.2cm 2cm 2.5cm 2cm; max-width: 210mm; }
  .doc-header { border-bottom: 2.5px solid #1a1a2e; padding-bottom: 10px; margin-bottom: 18px; }
  .org-line { font-size: 8pt; color: #666; letter-spacing: 0.3px; text-transform: uppercase; margin-bottom: 4px; }
  .doc-title { font-size: 15pt; font-weight: bold; text-transform: uppercase; letter-spacing: 0.4px; color: #1a1a2e; }
  .doc-subtitle { font-size: 10pt; color: #444; margin-top: 3px; }
  .meta-table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 9.5pt; }
  .meta-table td { padding: 3px 0; vertical-align: top; }
  .meta-table td:first-child { font-weight: bold; color: #333; width: 180px; }
  h2 { font-size: 10pt; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;
       border-bottom: 1px solid #bbb; padding-bottom: 3px; margin: 20px 0 8px; color: #1a1a2e; }
  .section-bar { display: block; padding: 5px 10px; color: #fff; font-weight: bold; font-size: 9pt;
                 letter-spacing: 0.3px; margin-top: 8mm; margin-bottom: 6px; line-height: 1.4; }
  .results-table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
  .results-table th { background: #1a1a2e; color: #fff; padding: 5px 7px; text-align: left;
                      font-weight: bold; font-size: 8pt; letter-spacing: 0.2px; }
  .results-table td { padding: 5px 7px; border-bottom: 1px solid #e4e4e4; vertical-align: top; line-height: 1.35; }
  .results-table tr:last-child td { border-bottom: none; }
  .appendix-table { width: 100%; border-collapse: collapse; font-size: 8pt; }
  .appendix-table th { background: #6b7280; color: #fff; padding: 4px 7px; text-align: left; font-weight: bold; font-size: 7.5pt; }
  .appendix-table td { padding: 4px 7px; border-bottom: 1px solid #e4e4e4; vertical-align: top; line-height: 1.3; }
  .appendix-table tr:last-child td { border-bottom: none; }
  .stats-grid { display: flex; gap: 16px; margin: 10px 0; }
  .stat-box { border: 1px solid #ddd; border-radius: 4px; padding: 8px 14px; text-align: center; flex: 1; }
  .stat-num { font-size: 20pt; font-weight: bold; color: #1a1a2e; }
  .stat-label { font-size: 7.5pt; color: #666; text-transform: uppercase; letter-spacing: 0.3px; margin-top: 1px; }
  .warning-banner { background: #fef2f2; border: 1px solid #fecaca; padding: 6px 10px;
                    font-size: 8.5pt; color: #991b1b; margin: 4px 0 6px; }
  .appendix-note { font-size: 8pt; color: #666; font-style: italic; margin: 4px 0 6px; }
  .conclusion { font-style: italic; color: #333; line-height: 1.6; font-size: 9.5pt; }
  .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 10px; }
  .sig-box { border: 1px solid #ccc; padding: 10px 12px; min-height: 52px; font-size: 8.5pt; color: #666; }
  .sig-box .label { font-weight: bold; color: #333; display: block; margin-bottom: 3px; }
</style>
</head>
<body>
<div class="page">

  <div class="doc-header">
    <div class="org-line">Post-Market Surveillance</div>
    <div class="doc-title">Field Safety Notice Review Report</div>
    <div class="doc-subtitle">Database Search &amp; Assessment</div>
  </div>

  <h2>1. Document Information</h2>
  <table class="meta-table">
    <tr><td>Device Name</td><td>${escHtml(profile.device_name)}</td></tr>
    <tr><td>Manufacturer</td><td>${escHtml(profile.manufacturer)}</td></tr>
    ${profile.device_class ? `<tr><td>Device Classification</td><td>${escHtml(profile.device_class)}</td></tr>` : ''}
    ${profile.emdn_code ? `<tr><td>EMDN Code</td><td>${escHtml(profile.emdn_code)}</td></tr>` : ''}
    <tr><td>Review Period</td><td>${escHtml(run.period_from)} to ${escHtml(run.period_to)}</td></tr>
    <tr><td>Report Date</td><td>${today}</td></tr>
    <tr><td>Document Reference</td><td>PMS-FSN-${new Date().getFullYear()}-${runId.slice(0, 8).toUpperCase()}</td></tr>
  </table>

  <h2>2. Search Methodology</h2>
  <table class="meta-table">
    <tr><td>Databases Searched</td><td>${run.dbs_searched && run.dbs_searched.length > 0 ? run.dbs_searched.map(db => escHtml(fmtSourceDb(db))).join(', ') : [...new Set(rows.map(r => fmtSourceDb(r.source_db)))].map(s => escHtml(s)).join(', ')}</td></tr>
    <tr><td>Search Date Range</td><td>${escHtml(run.period_from)} to ${escHtml(run.period_to)}</td></tr>
    ${termsUsed ? `
    <tr><td>Manufacturer Terms</td><td>${termsUsed.manufacturer_terms.map(t => `<code style="background:#dcfce7;padding:1px 5px;border-radius:3px;font-size:9pt;">${escHtml(t)}</code>`).join(' ') || '<em>none</em>'} <span style="color:#888;font-size:8.5pt;">(derived from &ldquo;${escHtml(termsUsed.raw_manufacturer)}&rdquo;)</span></td></tr>
    <tr><td>Device Terms</td><td>${termsUsed.device_terms.map(t => `<code style="background:#dcfce7;padding:1px 5px;border-radius:3px;font-size:9pt;">${escHtml(t)}</code>`).join(' ') || '<em>none</em>'} <span style="color:#888;font-size:8.5pt;">(derived from &ldquo;${escHtml(termsUsed.raw_device_name)}&rdquo;)</span></td></tr>
    <tr><td>Term Derivation</td><td>Legal suffixes, generic words, and tokens &le;4 characters removed. Algorithm v${escHtml(termsUsed.term_algorithm_version)}.</td></tr>
    ` : `<tr><td>Search Parameters</td><td>All published FSNs within the specified period were retrieved and assessed for relevance to the device profile above.</td></tr>`}
    <tr><td>Assessment Criteria</td><td>Each notice was evaluated for device type, manufacturer, intended use, and applicable risk.</td></tr>
    ${extra?.aiModels && extra.aiModels.length > 0 ? `<tr><td>AI Model</td><td>${extra.aiModels.map(m => escHtml(m)).join(', ')}</td></tr>` : ''}
  </table>
  ${run.status === 'degraded' ? `
  <div style="border:1px solid #d97706;background:#fffbeb;padding:8px 12px;border-radius:4px;margin-top:4mm;font-size:9pt;color:#92400e;">
    <strong>&#9888; Partial Results:</strong> One or more databases returned incomplete data during this search. Results may not reflect full coverage. Manual verification of affected sources is recommended.
  </div>` : ''}

  <h2>3. Search Results Summary</h2>
  <div class="stats-grid">
    <div class="stat-box">
      <div class="stat-num">${rows.length}</div>
      <div class="stat-label">Total Reviewed</div>
    </div>
    <div class="stat-box" style="border-color:#16a34a;">
      <div class="stat-num" style="color:#16a34a;">${relevant.length}</div>
      <div class="stat-label">Potentially Relevant</div>
    </div>
    <div class="stat-box" style="border-color:#d97706;">
      <div class="stat-num" style="color:#d97706;">${uncertain.length}</div>
      <div class="stat-label">Requires Review</div>
    </div>
    <div class="stat-box" style="border-color:#9ca3af;">
      <div class="stat-num" style="color:#9ca3af;">${excluded.length}</div>
      <div class="stat-label">Not Relevant</div>
    </div>
    ${filterFailed.length > 0 ? `<div class="stat-box" style="border-color:#dc2626;">
      <div class="stat-num" style="color:#dc2626;">${filterFailed.length}</div>
      <div class="stat-label">AI Filter Unavailable</div>
    </div>` : ''}
  </div>

  <!-- 4. POTENTIALLY RELEVANT -->
  <div class="section-bar" style="background-color:#16a34a;">POTENTIALLY RELEVANT &mdash; ${relevant.length} item${relevant.length !== 1 ? 's' : ''}</div>
  <table class="results-table">${stdThead}<tbody>${sectionRows(relevant, '#f0fdf4')}</tbody></table>

  <!-- 5. REQUIRES FURTHER REVIEW -->
  <div class="section-bar" style="background-color:#d97706;">REQUIRES FURTHER REVIEW &mdash; ${uncertain.length} item${uncertain.length !== 1 ? 's' : ''}</div>
  <table class="results-table">${stdThead}<tbody>${sectionRows(uncertain, '#fffbeb')}</tbody></table>

  ${filterFailed.length > 0 ? `
  <!-- 6. AI FILTER UNAVAILABLE -->
  <div class="section-bar" style="background-color:#dc2626;">AI FILTER UNAVAILABLE &mdash; ${filterFailed.length} item${filterFailed.length !== 1 ? 's' : ''}</div>
  <div class="warning-banner">&#9888; These items could not be AI-filtered. Manual review required.</div>
  <table class="results-table">${stdThead}<tbody>${sectionRows(filterFailed, '#fef2f2')}</tbody></table>
  ` : ''}

  <!-- Appendix A: EXCLUDED FSNs -->
  ${excluded.length > 50 ? `<p class="appendix-note" style="margin-top:8mm;">This appendix lists ${excluded.length} excluded FSNs for audit completeness.</p>` : ''}
  <div class="section-bar" style="background-color:#6b7280;${excluded.length <= 50 ? '' : 'margin-top:4px;'}">APPENDIX A &mdash; EXCLUDED FSNs &mdash; ${excluded.length} item${excluded.length !== 1 ? 's' : ''}</div>
  <p class="appendix-note">These items were reviewed and determined not relevant to the device profile. Listed for audit completeness.</p>
  <table class="appendix-table">
    <thead><tr>
      <th style="width:35%;">Title</th>
      <th style="width:18%;">Manufacturer</th>
      <th style="width:10%;">Date</th>
      <th>Notes</th>
    </tr></thead>
    <tbody>${sectionRows(excluded, '#f9fafb', true)}</tbody>
  </table>

  <h2 style="margin-top:12mm;">Conclusion</h2>
  <p class="conclusion">${conclusion}</p>

  <h2>Review &amp; Approval</h2>
  <div class="sig-grid">
    <div class="sig-box">
      <span class="label">Prepared by</span>
      Name: ___________________________<br/>
      Date: ___________________________
    </div>
    <div class="sig-box">
      <span class="label">Reviewed by</span>
      Name: ${extra?.reviewerName ? escHtml(extra.reviewerName) : '___________________________'}<br/>
      Date: ${extra?.reviewedAt ? escHtml(fmtDate(extra.reviewedAt)) : '___________________________'}
    </div>
  </div>

  <p style="margin-top:14mm;font-size:7.5pt;color:#666;border-top:1px solid #ddd;padding-top:6px;line-height:1.5;">
  <strong>AI Disclaimer:</strong> Relevance assessments in this report were produced by an AI language model (Anthropic Claude) and must be reviewed and approved by a qualified PRRC before inclusion in any Technical File, PMSR, or PSUR. AI outputs do not constitute a regulatory decision.
  </p>

</div>
</body>
</html>`
}
