import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { z } from 'zod'
import ExcelJS from 'exceljs'
import { generateReportPdf, canGeneratePdf, incrementPdfUsage } from '@/lib/pdfshift'
import { logAuditEvent } from '@/lib/audit'
import { rateLimit, getClientIp } from '@/lib/rate-limit'

// ─── Types ────────────────────────────────────────────────────────────────────

interface FsnRow {
  id: string
  title: string
  manufacturer: string
  fsn_date: string | null
  source_url: string
  source_db: string
  raw_content: string
  filter_decision: {
    decision: 'relevant' | 'uncertain' | 'excluded' | 'filter_failed'
    rationale: string
    confidence: number | null
  } | null
}

// ─── Decision label helpers (no AI language) ─────────────────────────────────

const DECISION_LABEL: Record<string, string> = {
  relevant:      'Potentially Relevant',
  uncertain:     'Requires Further Review',
  excluded:      'Not Relevant',
  filter_failed: 'AI Filter Unavailable',
}

const SOURCE_LABELS: Record<string, string> = {
  bfarm: 'BfArM',
  maude: 'FDA MAUDE',
  mhra:  'MHRA',
}
function fmtSourceDb(src: string): string {
  return SOURCE_LABELS[src?.toLowerCase()] ?? src?.toUpperCase() ?? 'BfArM'
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

function safeCell(val: string | null | undefined): string {
  if (!val) return ''
  if (/^[=+\-@\t\r|]/.test(val)) return "'" + val
  return val
}

// ─── Excel builder ────────────────────────────────────────────────────────────

async function buildExcel(
  rows: FsnRow[],
  meta: { device: string; manufacturer: string; period_from: string; period_to: string },
  termsUsed: { manufacturer_terms: string[]; device_terms: string[]; raw_manufacturer: string; raw_device_name: string; term_algorithm_version: string } | null,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Neuridion'
  wb.created = new Date()

  // Group by source database — currently only BfArM; extend when more sources added
  const sources = [...new Set(rows.map((r) => r.source_db))]
  if (sources.length === 0) sources.push('bfarm')

  for (const src of sources) {
    const sheetName = src === 'bfarm' ? 'BfArM' : src === 'maude' ? 'FDA MAUDE' : src === 'mhra' ? 'MHRA' : src.toUpperCase()
    const ws = wb.addWorksheet(sheetName)

    // Columns
    ws.columns = [
      { header: 'Title',       key: 'title',       width: 55 },
      { header: 'Manufacturer', key: 'manufacturer', width: 30 },
      { header: 'Date',        key: 'fsn_date',     width: 14 },
      { header: 'Source URL',  key: 'source_url',   width: 45 },
      { header: 'Assessment',  key: 'assessment',   width: 26 },
      { header: 'Notes',       key: 'notes',        width: 55 },
      { header: 'Confidence',  key: 'confidence',   width: 14 },
    ]

    // Bold, shaded header row
    const headerRow = ws.getRow(1)
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1A2E' } }
    headerRow.alignment = { vertical: 'middle' }
    headerRow.height = 18

    // Data rows — relevant/uncertain first, filter_failed next, excluded last
    const sorted = [
      ...rows.filter((r) => r.source_db === src && r.filter_decision?.decision === 'relevant'),
      ...rows.filter((r) => r.source_db === src && r.filter_decision?.decision === 'uncertain'),
      ...rows.filter((r) => r.source_db === src && r.filter_decision?.decision === 'filter_failed'),
      ...rows.filter((r) => r.source_db === src && r.filter_decision?.decision === 'excluded'),
      ...rows.filter((r) => r.source_db === src && !r.filter_decision),
    ]

    for (const row of sorted) {
      const d = row.filter_decision
      const dataRow = ws.addRow({
        title:        safeCell(row.title),
        manufacturer: safeCell(row.manufacturer) || '—',
        fsn_date:     row.fsn_date ? fmtDate(row.fsn_date) : '—',
        source_url:   safeCell(row.source_url),
        assessment:   d ? DECISION_LABEL[d.decision] : '—',
        notes:        safeCell(d?.rationale),
        confidence:   (d && d.confidence != null) ? `${Math.round(d.confidence * 100)}%` : '—',
      })

      // Row colour by assessment
      const bg = !d ? undefined
        : d.decision === 'relevant'      ? 'FF92D050'  // green
        : d.decision === 'uncertain'     ? 'FFFFCC00'  // yellow
        : d.decision === 'filter_failed' ? 'FFFF9999'  // light red
        : 'FFD3D3D3'                                    // grey

      if (bg) {
        dataRow.eachCell((cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
        })
      }

      // Wrap long cells
      dataRow.getCell('title').alignment = { wrapText: true, vertical: 'top' }
      dataRow.getCell('notes').alignment = { wrapText: true, vertical: 'top' }
    }

    // Freeze header
    ws.views = [{ state: 'frozen', ySplit: 1 }]
  }

  // Summary sheet — created once after all source sheets
  const sumWs = wb.addWorksheet('Summary')
  sumWs.columns = [{ width: 30 }, { width: 40 }]
  const addMeta = (label: string, value: string) => {
    const r = sumWs.addRow([label, value])
    r.getCell(1).font = { bold: true }
  }
  sumWs.addRow(['POST-MARKET SURVEILLANCE', 'Field Safety Notice Review']).font = { bold: true, size: 13 }
  sumWs.addRow([])
  addMeta('Device', meta.device)
  addMeta('Manufacturer', meta.manufacturer)
  addMeta('Review period', `${meta.period_from} to ${meta.period_to}`)
  addMeta('Report generated', fmtDate(new Date().toISOString()))
  sumWs.addRow([])
  addMeta('Total notices reviewed', String(rows.length))
  addMeta('Potentially relevant', String(rows.filter((r) => r.filter_decision?.decision === 'relevant').length))
  addMeta('Requires further review', String(rows.filter((r) => r.filter_decision?.decision === 'uncertain').length))
  addMeta('Not relevant', String(rows.filter((r) => r.filter_decision?.decision === 'excluded').length))
  const failedCount = rows.filter((r) => r.filter_decision?.decision === 'filter_failed').length
  if (failedCount > 0) {
    addMeta('AI filter unavailable (manual review required)', String(failedCount))
  }

  if (termsUsed) {
    sumWs.addRow([])
    addMeta('Manufacturer Search Terms', termsUsed.manufacturer_terms.join(', ') || '(none)')
    addMeta('Device Search Terms', termsUsed.device_terms.join(', ') || '(none)')
    addMeta('Source Manufacturer Name', termsUsed.raw_manufacturer || '—')
    addMeta('Source Device Name', termsUsed.raw_device_name || '—')
    addMeta('Term Algorithm Version', termsUsed.term_algorithm_version)
  }

  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf)
}

// ─── PDF HTML template ────────────────────────────────────────────────────────

function buildReportHtml(
  profile: { device_name: string; manufacturer: string; device_class: string | null; emdn_code: string | null },
  run: { period_from: string; period_to: string },
  rows: FsnRow[],
  runId: string,
  termsUsed: { manufacturer_terms: string[]; device_terms: string[]; raw_manufacturer: string; raw_device_name: string; term_algorithm_version: string } | null,
): string {
  const today = fmtDate(new Date().toISOString())

  const relevant     = rows.filter((r) => r.filter_decision?.decision === 'relevant')
  const uncertain    = rows.filter((r) => r.filter_decision?.decision === 'uncertain')
  const excluded     = rows.filter((r) => r.filter_decision?.decision === 'excluded')
  const filterFailed = rows.filter((r) => r.filter_decision?.decision === 'filter_failed')

  // Build table rows for a section. isAppendix uses compact 4-col layout + truncated rationale.
  function sectionRows(items: FsnRow[], rowBg: string, isAppendix = false): string {
    const colspan = isAppendix ? '4' : '5'
    if (items.length === 0) {
      return `<tr><td colspan="${colspan}" style="padding:8px 7px;color:#888;font-style:italic;">No items in this section.</td></tr>`
    }
    return items.map((r) => {
      const d = r.filter_decision!
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
    ? `This review identified no Field Safety Notices that are potentially relevant to the device under review within the specified period. No further action is required at this time.`
    : `This review identified ${conclusionRelevant + filterFailed.length} Field Safety Notice${(conclusionRelevant + filterFailed.length) !== 1 ? 's' : ''} requiring attention (${relevant.length} potentially relevant, ${uncertain.length} requiring further review${filterFailed.length > 0 ? `, ${filterFailed.length} AI filter unavailable` : ''}). ${excluded.length > 0 ? `${excluded.length} notice${excluded.length !== 1 ? 's were' : ' was'} assessed as not relevant and excluded from further review. ` : ''}Appropriate follow-up actions should be taken in accordance with the applicable post-market surveillance plan.${failedNote}`

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
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous"/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', system-ui, -apple-system, sans-serif; font-size: 10.5pt; color: #1a1a1a; background: #fff; padding: 0; }
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
    <tr><td>Databases Searched</td><td>${[...new Set(rows.map(r => fmtSourceDb(r.source_db)))].map(s => escHtml(s)).join(', ')}</td></tr>
    <tr><td>Search Date Range</td><td>${escHtml(run.period_from)} to ${escHtml(run.period_to)}</td></tr>
    ${termsUsed ? `
    <tr><td>Manufacturer Terms</td><td>${termsUsed.manufacturer_terms.map(t => `<code style="background:#dcfce7;padding:1px 5px;border-radius:3px;font-size:9pt;">${escHtml(t)}</code>`).join(' ') || '<em>none</em>'} <span style="color:#888;font-size:8.5pt;">(derived from &ldquo;${escHtml(termsUsed.raw_manufacturer)}&rdquo;)</span></td></tr>
    <tr><td>Device Terms</td><td>${termsUsed.device_terms.map(t => `<code style="background:#dcfce7;padding:1px 5px;border-radius:3px;font-size:9pt;">${escHtml(t)}</code>`).join(' ') || '<em>none</em>'} <span style="color:#888;font-size:8.5pt;">(derived from &ldquo;${escHtml(termsUsed.raw_device_name)}&rdquo;)</span></td></tr>
    <tr><td>Term Derivation</td><td>Legal suffixes, generic words, and tokens &le;4 characters removed. Algorithm v${escHtml(termsUsed.term_algorithm_version)}.</td></tr>
    ` : `<tr><td>Search Parameters</td><td>All published FSNs within the specified period were retrieved and assessed for relevance to the device profile above.</td></tr>`}
    <tr><td>Assessment Criteria</td><td>Each notice was evaluated for device type, manufacturer, intended use, and applicable risk.</td></tr>
  </table>

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
      Name: ___________________________<br/>
      Date: ___________________________
    </div>
  </div>

  <p style="margin-top:14mm;font-size:7.5pt;color:#666;border-top:1px solid #ddd;padding-top:6px;line-height:1.5;">
  <strong>AI Disclaimer:</strong> Relevance assessments in this report were produced by an AI language model (Anthropic Claude) and must be reviewed and approved by a qualified PRRC before inclusion in any Technical File, PMSR, or PSUR. AI outputs do not constitute a regulatory decision.
  </p>

</div>
</body>
</html>`
}

function escHtml(str: string | null | undefined): string {
  return (str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function safeHref(url: string | null | undefined): string {
  if (!url) return '#'
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return url
  } catch { /* malformed URL */ }
  return '#'
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const ip = getClientIp(request)
  const rl = await rateLimit(`reports:${ip}`, 5, 60_000)
  if (!rl.allowed) {
    return Response.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } })
  }

  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // GDPR Art 18: block data-processing operations when restricted
  const { data: userFlags } = await supabase.from('users').select('processing_restricted').eq('id', user.id).single()
  if (userFlags?.processing_restricted) {
    return Response.json({ error: 'Data processing is currently restricted on your account. You can change this in Settings > Privacy.' }, { status: 403 })
  }

  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = z.object({ run_id: z.uuid() }).safeParse(rawBody)
  if (!parsed.success) {
    return Response.json({ error: 'run_id must be a valid UUID' }, { status: 422 })
  }
  const { run_id } = parsed.data

  // Fetch run + profile (validates ownership)
  const { data: run, error: runError } = await supabase
    .from('search_runs')
    .select('*, product_profiles(device_name, manufacturer, device_class, emdn_code, intended_use)')
    .eq('id', run_id)
    .eq('user_id', user.id)
    .single()

  if (runError || !run) {
    return Response.json({ error: 'Run not found' }, { status: 404 })
  }

  const profileRaw = run.product_profiles
  const profile = (Array.isArray(profileRaw) ? profileRaw[0] : profileRaw) as {
    device_name: string; manufacturer: string; device_class: string | null; emdn_code: string | null
  } | null

  if (!profile) {
    return Response.json({ error: 'Profile not found' }, { status: 404 })
  }

  // Fetch FSN results
  const { data: rawResults, error: resultsError } = await supabase
    .from('fsn_results')
    .select('*')
    .eq('run_id', run_id)
    .order('fsn_date', { ascending: false })

  if (resultsError) {
    console.error('[reports]', resultsError.message)
    return Response.json({ error: 'Something went wrong' }, { status: 500 })
  }

  // Fetch filter decisions
  const decisionsMap: Record<string, { decision: string; rationale: string; confidence: number }> = {}

  const { data: decisions } = await supabase
    .from('filter_decisions')
    .select('fsn_result_id, decision, rationale, confidence')
    .eq('search_run_id', run_id)

  for (const d of decisions ?? []) {
    decisionsMap[d.fsn_result_id] = {
      decision:   d.decision,
      rationale:  d.rationale,
      confidence: Number(d.confidence),
    }
  }

  const rows: FsnRow[] = (rawResults ?? []).map((r) => ({
    id:              r.id,
    title:           r.title,
    manufacturer:    r.manufacturer,
    fsn_date:        r.fsn_date,
    source_url:      r.source_url,
    source_db:       r.source_db,
    raw_content:     r.raw_content,
    filter_decision: (decisionsMap[r.id] as FsnRow['filter_decision']) ?? null,
  }))

  // ── Generate Excel ──────────────────────────────────────────────────────────
  const termsUsed = (run as { terms_used?: { manufacturer_terms: string[]; device_terms: string[]; raw_manufacturer: string; raw_device_name: string; term_algorithm_version: string } | null }).terms_used ?? null

  const excelBuf = await buildExcel(rows, {
    device:       profile.device_name,
    manufacturer: profile.manufacturer,
    period_from:  run.period_from,
    period_to:    run.period_to,
  }, termsUsed)

  // ── Generate HTML report (open in browser and print to PDF natively) ─────────
  const html = buildReportHtml(profile, { period_from: run.period_from, period_to: run.period_to }, rows, run_id, termsUsed)
  const htmlBuf = Buffer.from(html, 'utf-8')

  // ── Upload to Supabase Storage ──────────────────────────────────────────────
  const adminStorage = createAdminClient()
  const ts = Date.now()
  const htmlPath  = `${user.id}/${run_id}/${ts}_report.html`
  const excelPath = `${user.id}/${run_id}/${ts}_report.xlsx`

  const [htmlUpload, excelUpload] = await Promise.all([
    adminStorage.storage.from('reports').upload(htmlPath, htmlBuf, { contentType: 'text/html', upsert: true }),
    adminStorage.storage.from('reports').upload(excelPath, excelBuf, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upsert: true,
    }),
  ])

  if (htmlUpload.error) {
    console.error('[reports:html-upload]', htmlUpload.error.message)
    return Response.json({ error: 'Report generation failed' }, { status: 500 })
  }
  if (excelUpload.error) {
    console.error('[reports:excel-upload]', excelUpload.error.message)
    return Response.json({ error: 'Report generation failed' }, { status: 500 })
  }

  // ── Create signed URLs (7 days) ─────────────────────────────────────────────
  const [htmlSigned, excelSigned] = await Promise.all([
    adminStorage.storage.from('reports').createSignedUrl(htmlPath, 60 * 5),
    adminStorage.storage.from('reports').createSignedUrl(excelPath, 60 * 5),
  ])

  // ── Generate PDF via @react-pdf/renderer (quota-guarded) ────────────────────
  let pdfUrl: string | null = null
  let pdfStatus: 'generated' | 'quota_exceeded' | 'failed' = 'failed'
  let pdfPath: string | null = null

  const quotaCheck = await canGeneratePdf(adminStorage, user.id)

  if (quotaCheck.allowed) {
    try {
      const pdfBuffer = await generateReportPdf({
        profile,
        run: { period_from: run.period_from, period_to: run.period_to },
        rows,
        runId: run_id,
      })

      pdfPath = `${user.id}/${run_id}/${ts}_report.pdf`
      const { error: pdfUploadErr } = await adminStorage.storage
        .from('reports')
        .upload(pdfPath, pdfBuffer, { contentType: 'application/pdf', upsert: true })

      if (!pdfUploadErr) {
        const { data: pdfSigned } = await adminStorage.storage
          .from('reports')
          .createSignedUrl(pdfPath, 60 * 5)

        pdfUrl = pdfSigned?.signedUrl ?? null
        pdfStatus = 'generated'
        await incrementPdfUsage(adminStorage, user.id)
      } else {
        console.error('[PDF] Upload failed:', pdfUploadErr.message)
      }
    } catch (err) {
      console.error('[PDF] Generation failed:', err instanceof Error ? err.message : String(err))
      pdfStatus = 'failed'
    }
  } else {
    pdfStatus = 'quota_exceeded'
    console.error('[PDF]', `Quota exceeded for user ${user.id}: ${quotaCheck.reason}`)
  }

  // Ownership verified via session-scoped query above — admin client needed for report_* columns not in RLS
  await adminStorage
    .from('search_runs')
    .update({
      report_html_path:     htmlPath,
      report_pdf_path:      pdfPath,
      report_excel_path:    excelPath,
      report_generated_at:  new Date().toISOString(),
    })
    .eq('id', run_id)

  await logAuditEvent(user.id, 'report_generated', { run_id, pdf_status: pdfStatus }, request)

  return Response.json({
    html_url:   htmlSigned.data?.signedUrl ?? null,
    excel_url:  excelSigned.data?.signedUrl ?? null,
    pdf_url:    pdfUrl,
    pdf_status: pdfStatus,
  }, { status: 201 })
}
