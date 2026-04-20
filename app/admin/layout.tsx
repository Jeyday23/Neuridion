import { redirect } from 'next/navigation'
import Link from 'next/link'
import { checkIsAdmin } from '@/lib/admin-guard'

const NAV_LINKS = [
  { label: 'Overview',     href: '/admin' },
  { label: 'Users',        href: '/admin/users' },
  { label: 'Search Runs',  href: '/admin/search-runs' },
  { label: 'QR Codes',     href: '/admin/qr-codes' },
]

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const admin = await checkIsAdmin()
  if (!admin) redirect('/dashboard/search')

  return (
    <div className="flex min-h-screen bg-zinc-50">
      <aside className="flex w-56 shrink-0 flex-col border-r border-zinc-200 bg-white px-3 py-6">
        <div className="mb-2 px-3">
          <span className="text-base font-bold tracking-tight text-zinc-900">Kodex</span>
        </div>
        <div className="mb-6 px-3">
          <span className="text-xs font-semibold uppercase tracking-widest text-red-500">Admin</span>
        </div>
        <nav className="flex flex-1 flex-col justify-between gap-0.5">
          <div className="flex flex-col gap-0.5">
            {NAV_LINKS.map(({ label, href }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
              >
                {label}
              </Link>
            ))}
          </div>
          <div className="px-3">
            <Link
              href="/dashboard/search"
              className="flex items-center gap-2 text-xs text-zinc-400 hover:text-zinc-700 transition-colors"
            >
              ← Back to app
            </Link>
          </div>
        </nav>
      </aside>

      <main className="flex flex-1 flex-col overflow-auto">
        {children}
      </main>
    </div>
  )
}
