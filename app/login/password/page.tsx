import Link from 'next/link'
import { LoginForm } from '../login-form'
import { Footer } from '@/app/components/Footer'
import { NeuridionWordmark } from '@/components/ui/neuridion-wordmark'

export const metadata = {
  title: 'Sign in with password — Neuridion',
}

export default async function PasswordLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string }>
}) {
  const params = await searchParams

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
      <div className="px-6 py-5">
        <Link href="/" className="flex items-center">
          <NeuridionWordmark markSize={28} textClass="text-sm" />
        </Link>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 pb-20">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-[#0F1F3D] mb-1">Sign in</h1>
            <p className="text-sm text-[#0F766E]">Enter your email and password</p>
          </div>

          {params.deleted === '1' && (
            <div className="mb-4 rounded bg-[#FEF2F2] border border-[#FECACA] px-4 py-3">
              <p className="text-sm text-[#DC2626]">
                Your account has been permanently deleted. Thank you for using Neuridion.
              </p>
            </div>
          )}

          <div className="bg-white border border-[#E2E8F0] rounded p-6">
            <LoginForm />
          </div>

          <div className="mt-6 text-center space-y-2">
            <p className="text-sm text-[#0F766E]">
              <Link href="/login" className="text-[#0F1F3D] font-medium hover:underline">
                Sign in with email code instead
              </Link>
            </p>
            <p className="text-sm text-[#0F766E]">
              Don&apos;t have an account?{' '}
              <Link href="/signup" className="text-[#0F1F3D] font-medium hover:underline">
                Sign up
              </Link>
            </p>
          </div>
        </div>
      </div>
      <Footer className="mt-auto border-0" />
    </div>
  )
}
