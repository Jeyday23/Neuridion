import { checkIsAdmin } from '@/lib/admin-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'

export default async function AdminFeedbackPage() {
  const admin_user = await checkIsAdmin()
  if (!admin_user) redirect('/dashboard/search')

  const admin = createAdminClient()
  const { data: feedback } = await admin
    .from('user_feedback')
    .select('*')
    .order('submitted_at', { ascending: false })
    .limit(100)

  const avgRating = feedback?.length
    ? feedback.reduce((sum, f) => sum + (f.rating as number), 0) / feedback.length
    : 0

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold mb-2">User Feedback</h1>
      <p className="text-slate-600 mb-6">
        Average rating: <strong>{avgRating.toFixed(2)} / 5</strong>{' '}
        ({feedback?.length ?? 0} responses)
      </p>

      {!feedback?.length && (
        <p className="text-slate-500 italic">No feedback submitted yet.</p>
      )}

      <div className="space-y-4">
        {feedback?.map((f) => (
          <div key={f.id as string} className="border rounded-lg p-4 bg-white">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-3">
                <span className="text-amber-500 text-lg">
                  {'★'.repeat(f.rating as number)}{'☆'.repeat(5 - (f.rating as number))}
                </span>
                <span className="text-xs text-slate-500 font-mono">{f.user_id as string}</span>
                <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                  {f.triggered_by as string}
                </span>
              </div>
              <span className="text-xs text-slate-400">
                {new Date(f.submitted_at as string).toLocaleDateString('en-GB', {
                  day: '2-digit', month: 'short', year: 'numeric',
                })}
              </span>
            </div>

            {Array.isArray(f.most_useful) && (f.most_useful as string[]).length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {(f.most_useful as string[]).map((tag) => (
                  <span key={tag} className="text-xs bg-blue-50 text-blue-800 px-2 py-0.5 rounded">
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {f.missing_features && (
              <p className="text-sm text-slate-700 italic border-t border-slate-100 pt-2 mt-2">
                &ldquo;{f.missing_features as string}&rdquo;
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
