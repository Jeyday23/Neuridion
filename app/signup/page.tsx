import Link from 'next/link'
import { SignupForm } from './signup-form'
import { Footer } from '@/app/components/Footer'
import { NeuridionLogo } from '@/components/ui/neuridion-logo'

export const metadata = {
  title: 'Sign up — Neuridion',
}

export default function SignupPage() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
      <div className="px-6 py-5">
        <Link href="/" className="flex items-center gap-2">
          <NeuridionLogo size={28} />
          <span className="text-[#0F1F3D] font-semibold text-sm">Neuridion</span>
        </Link>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 pb-20">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-[#0F1F3D] mb-1">Create your account</h1>
            <p className="text-sm text-[#0F766E]">Start your 14-day free trial</p>
          </div>

          <div className="bg-white border border-[#E2E8F0] rounded p-6">
            <SignupForm />
          </div>

          <p className="mt-6 text-center text-sm text-[#64748B]">
            Already have an account?{' '}
            <Link href="/login" className="text-[#0F1F3D] font-medium hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
      <Footer className="mt-auto border-0" />
    </div>
  )
}
