import Link from 'next/link'
import { SignupForm } from './signup-form'
import { Footer } from '@/app/components/Footer'

export const metadata = {
  title: 'Sign up — Neuridion',
}

export default function SignupPage() {
  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-bold tracking-tight text-[#0F1F3D]">
            Neuridion
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            Create your account
          </p>
        </div>

        <div className="rounded-md border border-[#E2E8F0] bg-white px-8 py-8">
          <SignupForm />
        </div>

        <p className="mt-6 text-center text-sm text-zinc-500">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-[#0D9488] hover:text-[#0F766E]">
            Sign in
          </Link>
        </p>
      </div>
      <Footer className="mt-8 border-0" />
    </div>
  )
}
