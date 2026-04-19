import { createClient } from '@/lib/supabase/server'
import { ArchiveTable } from './archive-table'

export const metadata = { title: 'Archive — Kodex' }

export default async function ArchivePage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  const { data: runs } = await supabase
    .from('search_runs')
    .select(`
      id, status, started_at, completed_at, created_at,
      search_period_from, search_period_to,
      period_from, period_to,
      total_results, relevant_count, uncertain_count, excluded_count,
      dbs_searched, error_message,
      report_html_path, report_pdf_path, report_excel_path, report_generated_at,
      product_profiles ( device_name, manufacturer )
    `)
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false })
    .limit(100)

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-900">Archive</h1>
        <p className="mt-1 text-sm text-zinc-500">Audit trail of all search runs and generated reports.</p>
      </div>

      <ArchiveTable runs={runs ?? []} />
    </div>
  )
}
