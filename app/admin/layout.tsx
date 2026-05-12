import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { checkIsAdmin } from '@/lib/admin-guard'

const NAV_LINKS = [
  { label: 'Overview',     href: '/admin' },
  { label: 'Users',        href: '/admin/users' },
  { label: 'Search Runs',  href: '/admin/search-runs' },
  { label: 'QR Codes',     href: '/admin/qr-codes' },
  { label: 'Bug Reports',  href: '/admin/bugs' },
  { label: 'Feedback',     href: '/admin/feedback' },
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
          <span className="text-base font-bold tracking-tight text-[#0F1F3D]">Neuridion</span>
        </div>
        <div className="mb-6 px-3">
          <span className="text-xs font-semibold uppercase tracking-widest text-red-500">Admin</span>
        </div>

        {/* Prominent Back-to-App button */}
        <Link
          href="/dashboard/search"
          className="mx-3 mb-4 flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 hover:border-zinc-300 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to dashboard
        </Link>

        <nav className="flex flex-1 flex-col gap-0.5">
          {NAV_LINKS.map(({ label, href }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
            >
              {label}
            </Link>
          ))}
        </nav>
      </aside>

      <main className="flex flex-1 flex-col overflow-auto">
        {/* Top bar with secondary back link for emphasis */}
        <div className="flex items-center justify-between border-b border-zinc-200 bg-white px-8 py-3">
          <span className="text-sm font-medium text-zinc-500">Admin Console</span>
          <Link
            href="/dashboard/search"
            className="text-sm font-medium text-[#0D9488] hover:text-[#0F766E] hover:underline"
          >
            Exit admin →
          </Link>
        </div>
        {children}
      </main>
    </div>
  )
}
