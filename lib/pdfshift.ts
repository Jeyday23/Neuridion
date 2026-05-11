import type { SupabaseClient } from '@supabase/supabase-js'
import { renderToBuffer } from '@react-pdf/renderer'
import React from 'react'
import { ReportDocument, type ReportData } from '@/lib/pdf/report-document'

const MONTHLY_LIMIT = 500
const PER_USER_LIMIT = 50

export type { ReportData }

export async function generateReportPdf(data: ReportData): Promise<Buffer> {
  const element = React.createElement(ReportDocument, { data })
  // renderToBuffer expects ReactElement<DocumentProps> but our wrapper component
  // returns a <Document> internally — the cast is safe and standard for @react-pdf.
  const buffer = await renderToBuffer(
    element as unknown as React.ReactElement<import('@react-pdf/renderer').DocumentProps>
  )
  return Buffer.from(buffer)
}

export async function canGeneratePdf(
  adminClient: SupabaseClient,
  userId: string
): Promise<{ allowed: boolean; reason?: string }> {
  const month = new Date().toISOString().slice(0, 7)

  const { data: allUsage } = await adminClient
    .from('pdf_usage')
    .select('count')
    .eq('month', month)

  const totalThisMonth = (allUsage ?? []).reduce((sum: number, r: { count: number }) => sum + r.count, 0)
  if (totalThisMonth >= MONTHLY_LIMIT) {
    return { allowed: false, reason: 'monthly_limit_reached' }
  }

  const { data: userUsage } = await adminClient
    .from('pdf_usage')
    .select('count')
    .eq('user_id', userId)
    .eq('month', month)
    .maybeSingle()

  if (userUsage && (userUsage as { count: number }).count >= PER_USER_LIMIT) {
    return { allowed: false, reason: 'user_limit_reached' }
  }

  return { allowed: true }
}

export async function incrementPdfUsage(
  adminClient: SupabaseClient,
  userId: string
): Promise<void> {
  const month = new Date().toISOString().slice(0, 7)
  await adminClient.rpc('increment_pdf_usage', { p_user_id: userId, p_month: month })
}
