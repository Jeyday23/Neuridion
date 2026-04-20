import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { ClaimForm } from './ClaimForm'

export const metadata = { title: 'Claim Your Free Search — Kodex Medical' }

export default async function ClaimPage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code } = await params
  const admin = createAdminClient()

  const { data: trialCode } = await admin
    .from('trial_codes')
    .select('id, redeemed_at, expires_at, batch_name')
    .eq('code', code)
    .maybeSingle()

  // ── Invalid ──────────────────────────────────────────────────────────────────
  if (!trialCode) {
    return (
      <ClaimShell>
        <StatusCard
          title="Invalid code"
          body="This QR code doesn't exist or the URL was mistyped."
          link={{ href: '/signup', label: 'Sign up for free instead' }}
          color="red"
        />
      </ClaimShell>
    )
  }

  // ── Already used ─────────────────────────────────────────────────────────────
  if (trialCode.redeemed_at) {
    return (
      <ClaimShell>
        <StatusCard
          title="Code already used"
          body="This QR code has already been redeemed. Each code can only be used once."
          link={{ href: '/signup', label: 'Create a free account instead' }}
          color="amber"
        />
      </ClaimShell>
    )
  }

  // ── Expired ───────────────────────────────────────────────────────────────────
  if (trialCode.expires_at && new Date(trialCode.expires_at) < new Date()) {
    return (
      <ClaimShell>
        <StatusCard
          title="Code expired"
          body={`This code expired on ${new Date(trialCode.expires_at).toLocaleDateString('en-GB')}.`}
          link={{ href: '/signup', label: 'Sign up for a paid plan' }}
          color="amber"
        />
      </ClaimShell>
    )
  }

  // ── Valid — show claim form ───────────────────────────────────────────────────
  return (
    <ClaimShell>
      <div className="mb-6 text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-green-100 border border-green-200 px-4 py-1.5 mb-4">
          <span className="text-green-700 text-sm font-semibold">1 Free PMS Search</span>
        </div>
        <h1 className="text-2xl font-bold text-zinc-900 mb-2">Claim your free Kodex search</h1>
        <p className="text-sm text-zinc-500">
          Enter your work email to create your account instantly — no credit card needed.
        </p>
      </div>

      <ClaimForm code={code} />

      <ul className="mt-6 space-y-1.5 text-xs text-zinc-500">
        <li>✓ BfArM database covered</li>
        <li>✓ AI-filtered results — only relevant FSNs</li>
        <li>✓ Downloadable PDF + Excel report</li>
        <li>✓ No credit card required</li>
      </ul>

      <p className="mt-6 text-center text-xs text-zinc-400">
        By claiming, you agree to our{' '}
        <Link href="/terms"   className="underline hover:text-zinc-600">Terms</Link> and{' '}
        <Link href="/privacy" className="underline hover:text-zinc-600">Privacy Policy</Link>.
        One trial per email address.
      </p>
    </ClaimShell>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function ClaimShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex flex-col items-center justify-center px-4 py-12">
      <div className="mb-8 text-center">
        <span className="text-2xl font-bold text-zinc-900">Kodex Medical</span>
      </div>
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white px-8 py-8 shadow-sm">
        {children}
      </div>
    </div>
  )
}

function StatusCard({
  title, body, link, color,
}: {
  title: string
  body:  string
  link:  { href: string; label: string }
  color: 'red' | 'amber'
}) {
  const styles = {
    red:   'bg-red-50   border-red-200   text-red-800',
    amber: 'bg-amber-50 border-amber-200 text-amber-800',
  }
  return (
    <div className={`rounded-lg border px-5 py-5 ${styles[color]}`}>
      <p className="font-semibold mb-1">{title}</p>
      <p className="text-sm mb-4">{body}</p>
      <Link href={link.href} className="text-sm font-medium underline">
        {link.label}
      </Link>
    </div>
  )
}
