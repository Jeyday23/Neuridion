'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Search, Package, Archive, CreditCard, Settings, LogOut, Shield } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from './language-context'
import { QuotaBar } from '@/app/components/ui/QuotaBar'

export function SidebarNav({ userRole, quota }: { userRole: string | null; quota: { searchesUsed: number; searchesMax: number; profilesUsed: number; profilesMax: number } }) {
  const pathname = usePathname()
  const router = useRouter()
  const { t } = useLanguage()

  const links = [
    { label: t.nav.search,   href: '/dashboard/search',   icon: Search      },
    { label: t.nav.profiles, href: '/dashboard/profiles',  icon: Package     },
    { label: t.nav.archive,  href: '/dashboard/archive',   icon: Archive     },
    { label: t.nav.billing,  href: '/dashboard/billing',   icon: CreditCard  },
    { label: t.nav.settings, href: '/dashboard/settings',  icon: Settings    },
  ]

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
                    : 'text-[#134E4A] hover:bg-[#F0FDFA]'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{label}</span>
              </Link>
            </li>
          )
        })}
      </ul>

      <div className="mt-auto">
        <QuotaBar
          searchesUsed={quota.searchesUsed}
          searchesMax={quota.searchesMax}
          profilesUsed={quota.profilesUsed}
          profilesMax={quota.profilesMax}
        />

        <div className="border-t border-[#E2E8F0] pt-4 space-y-1">
        {userRole === 'admin' && (
          <>
            <Link
              href="/admin"
              className="flex items-center gap-3 px-4 py-3 rounded-lg text-[#134E4A] hover:bg-[#F0FDFA] transition-colors"
            >
              <Shield className="w-5 h-5" />
              <span>Administration</span>
            </Link>
            <div className="border-t border-[#E2E8F0] my-1" />
          </>
        )}
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-4 py-3 text-[#134E4A] hover:bg-[#F0FDFA] rounded-lg transition-colors w-full"
        >
          <LogOut className="w-5 h-5" />
          <span>{t.nav.logout}</span>
        </button>
        </div>
      </div>
    </nav>
  )
}
