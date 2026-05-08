import Link from 'next/link'
import { Mail } from 'lucide-react'

export const metadata = {
  title: 'Check your email — Neuridion',
}

export default function ConfirmPage() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
      <div className="px-6 py-5">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 bg-[#0F1F3D] rounded flex items-center justify-center">
            <span className="text-white font-bold text-xs">N</span>
          </div>
          <span className="text-[#0F1F3D] font-semibold text-sm">Neuridion</span>
        </Link>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 pb-20">
        <div className="w-full max-w-sm text-center">
          <div className="w-12 h-12 bg-[#F1F5F9] border border-[#E2E8F0] rounded mx-auto mb-4 flex items-center justify-center">
            <Mail className="w-5 h-5 text-[#64748B]" />
          </div>

          <h1 className="text-2xl font-bold text-[#0F1F3D] mb-2">Check your email</h1>

          <div className="bg-white border border-[#E2E8F0] rounded p-6 mb-6">
            <p className="text-sm text-[#64748B] leading-relaxed">
              We sent a confirmation link to your email address. Click the link
              to activate your account and sign in.
            </p>
          </div>

          <p className="text-sm text-[#64748B]">
            Already confirmed?{' '}
            <Link href="/login" className="text-[#0F1F3D] font-medium hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
