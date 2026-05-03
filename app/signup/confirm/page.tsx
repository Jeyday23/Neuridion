import Link from 'next/link'

export const metadata = {
  title: 'Check your email — Neuridion',
}

export default function ConfirmPage() {
  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <div className="mb-8">
          <h1 className="text-xl font-bold tracking-tight text-[#0F1F3D]">
            Neuridion
          </h1>
        </div>

        <div className="rounded-md border border-[#E2E8F0] bg-white px-8 py-8">
          <div className="mb-4 flex items-center justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-md bg-[rgba(13,148,136,0.08)] border border-[rgba(13,148,136,0.2)]">
              <svg className="h-6 w-6 text-[#0D9488]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
            </div>
          </div>
          <h2 className="text-lg font-semibold text-zinc-900 mb-2">Check your email</h2>
          <p className="text-sm text-zinc-500 leading-relaxed">
            We sent a confirmation link to your email address. Click the link to activate your account and sign in.
          </p>
        </div>

        <p className="mt-6 text-center text-sm text-zinc-500">
          Already confirmed?{' '}
          <Link href="/login" className="font-medium text-[#0D9488] hover:text-[#0F766E]">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
