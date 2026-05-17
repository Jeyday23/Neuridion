import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ArchiveTable } from './archive-table'

export const metadata = { title: 'Archive — Neuridion' }

const PAGE_SIZE = 25

export default async function ArchivePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const { page: pageStr } = await searchParams
  const page = Math.max(1, parseInt(pageStr ?? '1', 10) || 1)
  const offset = (page - 1) * PAGE_SIZE

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const adminClient = createAdminClient()

  const { data: runs, count: totalCount, error } = await adminClient
    .from('search_runs')
    .select(`
      id, status, started_at, completed_at, created_at,
      search_period_from, search_period_to,
      period_from, period_to,
      total_results, relevant_count, uncertain_count, excluded_count,
      dbs_searched, error_message, total_scraped, pre_filter_count,
      report_html_path, report_pdf_path, report_excel_path, report_docx_path, report_generated_at,
      product_profiles ( device_name, manufacturer )
    `, { count: 'exact' })
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1)

  const total = totalCount ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

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

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-zinc-400">
            Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total} runs
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`/dashboard/archive?page=${page - 1}`}
                className="px-3 py-1 rounded border border-zinc-200 text-zinc-600 hover:bg-zinc-50 transition-colors"
              >
                Previous
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={`/dashboard/archive?page=${page + 1}`}
                className="px-3 py-1 rounded border border-zinc-200 text-zinc-600 hover:bg-zinc-50 transition-colors"
              >
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
