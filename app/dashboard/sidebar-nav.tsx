'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Search, UserCircle, Archive, CreditCard, Settings, LogOut, Shield } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const links = [
  { label: 'Search',   href: '/dashboard/search',   icon: Search      },
  { label: 'Profiles', href: '/dashboard/profiles',  icon: UserCircle  },
  { label: 'Archive',  href: '/dashboard/archive',   icon: Archive     },
  { label: 'Billing',  href: '/dashboard/billing',   icon: CreditCard  },
  { label: 'Settings', href: '/dashboard/settings',  icon: Settings    },
]

export function SidebarNav({ userRole }: { userRole: string | null }) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
  }

  return (
    <nav className="flex flex-1 flex-col justify-between p-4">
      <ul className="space-y-1">
        {links.map(({ label, href, icon: Icon }) => {
          const active = pathname.startsWith(href)
          return (
            <li key={href}>
              <Link
                href={href}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  active
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{label}</span>
              </Link>
            </li>
          )
        })}
      </ul>

      <div className="border-t border-slate-200 pt-4 space-y-1">
        {userRole === 'admin' && (
          <>
            <Link
              href="/admin"
              className="flex items-center gap-3 px-4 py-3 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <Shield className="w-5 h-5" />
              <span>Admin</span>
            </Link>
            <div className="border-t border-slate-200 my-1" />
          </>
        )}
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-4 py-3 text-slate-600 hover:bg-slate-50 rounded-lg transition-colors w-full"
        >
          <LogOut className="w-5 h-5" />
          <span>Log out</span>
        </button>
      </div>
    </nav>
  )
}
