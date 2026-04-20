import Link from 'next/link'
import { LoginForm } from './login-form'
import { Footer } from '@/app/components/Footer'

export const metadata = {
  title: 'Sign in — Kodex',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string }>
}) {
  const params = await searchParams

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
            Kodex
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            Sign in to your account
          </p>
        </div>

        {params.deleted === '1' && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
            <p className="text-sm text-red-700">
              Your account has been permanently deleted. Thank you for using Kodex Medical.
            </p>
          </div>
        )}

        <div className="rounded-xl border border-zinc-200 bg-white px-8 py-8 shadow-sm">
          <LoginForm />
        </div>

        <p className="mt-6 text-center text-sm text-zinc-500">
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="font-medium text-blue-600 hover:text-blue-700">
            Sign up
          </Link>
        </p>
      </div>
      <Footer className="mt-8 border-0" />
    </div>
  )
}
