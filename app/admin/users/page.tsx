import { createAdminClient } from '@/lib/supabase/admin'
import { checkIsAdmin } from '@/lib/admin-guard'
import { redirect } from 'next/navigation'
import { UserActions } from './user-actions'

type UserRow = {
  id: string
  email: string
  full_name: string | null
  company_name: string | null
  plan: string | null
  role: string
  created_at: string
}

async function getUsers(): Promise<UserRow[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('users')
    .select('id, email, full_name, company_name, plan, role, created_at')
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as UserRow[]
}

export default async function AdminUsersPage() {
  const caller = await checkIsAdmin()
  if (!caller) redirect('/dashboard/search')

  const users = await getUsers()

  return (
    <div className="p-8">
      <h1 className="text-xl font-bold text-zinc-900 mb-6">Users</h1>
      <div className="rounded-md border border-[#E2E8F0] bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-left">
              <th className="px-4 py-3 font-medium text-zinc-500">Name</th>
              <th className="px-4 py-3 font-medium text-zinc-500">Email</th>
              <th className="px-4 py-3 font-medium text-zinc-500">Company</th>
              <th className="px-4 py-3 font-medium text-zinc-500">Plan</th>
              <th className="px-4 py-3 font-medium text-zinc-500">Role</th>
              <th className="px-4 py-3 font-medium text-zinc-500">Joined</th>
              <th className="px-4 py-3 font-medium text-zinc-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-zinc-50">
                <td className="px-4 py-3 text-zinc-900">{u.full_name ?? '—'}</td>
                <td className="px-4 py-3 text-zinc-600">{u.email}</td>
                <td className="px-4 py-3 text-zinc-600">{u.company_name ?? '—'}</td>
                <td className="px-4 py-3 text-zinc-600">{u.plan ?? '—'}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                      u.role === 'admin'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-zinc-100 text-zinc-600'
                    }`}
                  >
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-zinc-500">
                  {new Date(u.created_at).toLocaleDateString('en-GB')}
                </td>
                <td className="px-4 py-3">
                  <UserActions userId={u.id} isAdmin={u.role === 'admin'} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-zinc-400">No users found.</p>
        )}
      </div>
    </div>
  )
}
