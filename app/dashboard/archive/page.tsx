import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ArchiveTable } from './archive-table'

export const metadata = { title: 'Archive — Neuridion' }

export default async function ArchivePage() {
  // Auth: use server client (cookie-based session) to get the user identity
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null // middleware handles redirect

  // Data: use admin client to bypass RLS — reads are scoped to the user's id below
  const adminClient = createAdminClient()

  const { data: runs, error } = await adminClient
    .from('search_runs')
    .select(`
      id, status, started_at, completed_at, created_at,
      search_period_from, search_period_to,
      period_from, period_to,
      total_results, relevant_count, uncertain_count, excluded_count,
      dbs_searched, error_message, total_scraped, pre_filter_count,
      report_html_path, report_pdf_path, report_excel_path, report_docx_path, report_generated_at,
      product_profiles ( device_name, manufacturer )
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100)

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-900">Archive</h1>
        <p className="mt-1 text-sm text-zinc-500">Audit trail of all search runs and generated reports.</p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Unable to load your search history. Please try refreshing or contact support.
        </div>
      )}

      <ArchiveTable runs={runs ?? []} />
    </div>
  )
}
