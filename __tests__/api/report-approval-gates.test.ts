import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  reviewStatus: 'reviewed' as string | null,
  reviewedBy: 'reviewer-1' as string | null,
  reviewedAt: '2026-06-22T10:00:00.000Z' as string | null,
  createAdminClient: vi.fn(),
  createSignedUrl: vi.fn(),
  adjudicationReady: true,
  adjudicationError: null as { message: string } | null,
}))

function queryResult(table: string) {
  if (table === 'users') {
    return { data: { processing_restricted: false, plan: 'pro' }, error: null }
  }
  if (table === 'reports') {
    return {
      data: {
        run_id: '22222222-2222-4222-8222-222222222222',
        pdf_storage_path: 'reports/report.pdf',
        excel_storage_path: 'reports/report.xlsx',
      },
      error: null,
    }
  }
  if (table === 'search_runs') {
    return {
      data: {
        id: '22222222-2222-4222-8222-222222222222',
        user_id: 'user-1',
        review_status: state.reviewStatus,
        reviewed_by: state.reviewedBy,
        reviewed_at: state.reviewedAt,
        report_pdf_path: 'reports/report.pdf',
        report_html_path: 'reports/report.html',
        report_excel_path: 'reports/report.xlsx',
        report_docx_path: 'reports/report.docx',
        period_from: '2026-01-01',
        period_to: '2026-01-31',
        product_profiles: { device_name: 'Test device' },
      },
      error: null,
    }
  }
  return { data: null, error: null }
}

function createDb() {
  const storage = {
    from: vi.fn(() => ({ createSignedUrl: state.createSignedUrl })),
  }
  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })),
    },
    from: vi.fn((table: string) => {
      const chain: Record<string, unknown> = {}
      for (const method of ['select', 'eq', 'is']) {
        chain[method] = vi.fn(() => chain)
      }
      chain.single = vi.fn(async () => queryResult(table))
      return chain
    }),
    rpc: vi.fn(async () => ({ data: state.adjudicationReady, error: state.adjudicationError })),
    storage,
  }
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => createDb()),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: state.createAdminClient,
}))
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn(async () => ({ allowed: true, retryAfterMs: 0 })),
  getClientIp: vi.fn(() => '127.0.0.1'),
}))
vi.mock('@/lib/pdfshift', () => ({
  generateReportPdf: vi.fn(), canGeneratePdf: vi.fn(), incrementPdfUsage: vi.fn(),
}))
vi.mock('@/lib/docx-report', () => ({ buildDocx: vi.fn() }))
vi.mock('@/lib/audit', () => ({ logAuditEvent: vi.fn() }))
vi.mock('@/lib/reports/html-builder', () => ({ buildReportHtml: vi.fn() }))
vi.mock('@/lib/reports/excel-builder', () => ({ buildExcel: vi.fn() }))

import { POST as generateReport } from '@/app/api/reports/route'
import { GET as downloadReport } from '@/app/api/reports/[id]/download/route'
import { GET as getReportUrls } from '@/app/api/reports/[id]/route'

const RUN_ID = '22222222-2222-4222-8222-222222222222'

describe('report API approval gates', () => {
  beforeEach(() => {
    state.reviewStatus = 'reviewed'
    state.reviewedBy = 'reviewer-1'
    state.reviewedAt = '2026-06-22T10:00:00.000Z'
    state.createSignedUrl.mockReset()
    state.adjudicationReady = true
    state.adjudicationError = null
    state.createAdminClient.mockReset()
    state.createAdminClient.mockImplementation(() => createDb())
  })

  it('blocks report generation when a run is reviewed but not approved', async () => {
    const response = await generateReport(new Request('https://example.test/api/reports', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ run_id: RUN_ID }),
    }))

    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({
      error: 'This search must be reviewed and approved before generating a report.',
    })
  })

  it('blocks the primary download endpoint when a run is reviewed but not approved', async () => {
    const response = await downloadReport(
      new Request(`https://example.test/api/reports/${RUN_ID}/download?format=pdf`),
      { params: Promise.resolve({ id: RUN_ID }) },
    )

    expect(response.status).toBe(422)
    expect(state.createSignedUrl).not.toHaveBeenCalled()
  })

  it('blocks the legacy signed-URL endpoint when a run is reviewed but not approved', async () => {
    const response = await getReportUrls(
      new Request(`https://example.test/api/reports/${RUN_ID}`),
      { params: Promise.resolve({ id: RUN_ID }) },
    )

    expect(response.status).toBe(422)
    expect(state.createSignedUrl).not.toHaveBeenCalled()
  })

  it('blocks approved report release when record-level adjudication is incomplete', async () => {
    state.reviewStatus = 'approved'
    state.adjudicationReady = false

    const generation = await generateReport(new Request('https://example.test/api/reports', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ run_id: RUN_ID }),
    }))
    const download = await downloadReport(
      new Request(`https://example.test/api/reports/${RUN_ID}/download?format=pdf`),
      { params: Promise.resolve({ id: RUN_ID }) },
    )
    const legacy = await getReportUrls(
      new Request(`https://example.test/api/reports/${RUN_ID}`),
      { params: Promise.resolve({ id: RUN_ID }) },
    )

    expect(generation.status).toBe(422)
    expect(download.status).toBe(422)
    expect(legacy.status).toBe(422)
    expect(state.createSignedUrl).not.toHaveBeenCalled()
  })

  it('preserves primary downloads for approved runs', async () => {
    state.reviewStatus = 'approved'
    state.createSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://storage.example.test/report.pdf' },
      error: null,
    })

    const response = await downloadReport(
      new Request(`https://example.test/api/reports/${RUN_ID}/download?format=pdf`),
      { params: Promise.resolve({ id: RUN_ID }) },
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(expect.objectContaining({
      url: 'https://storage.example.test/report.pdf',
    }))
  })

  it('preserves legacy signed URLs for approved runs', async () => {
    state.reviewStatus = 'approved'
    state.createSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://storage.example.test/report' },
      error: null,
    })

    const response = await getReportUrls(
      new Request(`https://example.test/api/reports/${RUN_ID}`),
      { params: Promise.resolve({ id: RUN_ID }) },
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      pdf_url: 'https://storage.example.test/report',
      excel_url: 'https://storage.example.test/report',
    })
  })

  it.each([
    ['missing reviewer', null, '2026-06-22T10:00:00.000Z'],
    ['missing timestamp', 'reviewer-1', null],
    ['invalid timestamp', 'reviewer-1', 'not-a-date'],
  ])('blocks approved runs with %s', async (_label, reviewedBy, reviewedAt) => {
    state.reviewStatus = 'approved'
    state.reviewedBy = reviewedBy
    state.reviewedAt = reviewedAt

    const generation = await generateReport(new Request('https://example.test/api/reports', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ run_id: RUN_ID }),
    }))
    const download = await downloadReport(
      new Request(`https://example.test/api/reports/${RUN_ID}/download?format=pdf`),
      { params: Promise.resolve({ id: RUN_ID }) },
    )
    const legacy = await getReportUrls(
      new Request(`https://example.test/api/reports/${RUN_ID}`),
      { params: Promise.resolve({ id: RUN_ID }) },
    )

    expect(generation.status).toBe(422)
    expect(download.status).toBe(422)
    expect(legacy.status).toBe(422)
    expect(state.createSignedUrl).not.toHaveBeenCalled()
  })
})
