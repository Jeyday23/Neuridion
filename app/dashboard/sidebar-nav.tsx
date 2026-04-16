'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { clsx } from 'clsx'
import { createClient } from '@/lib/supabase/client'

const links = [
  { label: 'Search',   href: '/dashboard/search'   },
  { label: 'Profiles', href: '/dashboard/profiles'  },
  { label: 'Archive',  href: '/dashboard/archive'   },
  { label: 'Billing',  href: '/dashboard/billing'   },
]

export function SidebarNav() {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
  }

  return (
    <nav className="flex flex-1 flex-col justify-between gap-0.5">
      <div className="flex flex-col gap-0.5">
        {links.map(({ label, href }) => {
          const active = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
              )}
            >
              {label}
            </Link>
          )
        })}
      </div>

      <div className="flex justify-end pr-3 mb-2">
        <button
          onClick={handleLogout}
          className="flex items-center gap-1 rounded-md py-2 px-2 text-sm font-medium text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900 transition-colors"
        >
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
          </svg>
          Log out
        </button>
      </div>
    </nav>
  )
}
