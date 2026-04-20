import Link from 'next/link'
import { SignupForm } from './signup-form'
import { Footer } from '@/app/components/Footer'

export const metadata = {
  title: 'Sign up — Kodex',
}

export default function SignupPage() {
  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
            Kodex
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            Create your account
          </p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white px-8 py-8 shadow-sm">
          <SignupForm />
        </div>

        <p className="mt-6 text-center text-sm text-zinc-500">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-blue-600 hover:text-blue-700">
            Sign in
          </Link>
        </p>
      </div>
      <Footer className="mt-8 border-0" />
    </div>
  )
}
