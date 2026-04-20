'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface Props { code: string }

type Step = 'form' | 'loading' | 'success' | 'error'

export function ClaimForm({ code }: Props) {
  const router  = useRouter()
  const [email,    setEmail]    = useState('')
  const [step,     setStep]     = useState<Step>('form')
  const [message,  setMessage]  = useState('')
  const [password, setPassword] = useState('')
  const [signing,  setSigning]  = useState(false)

  const claim = async (e: React.FormEvent) => {
    e.preventDefault()
    setStep('loading')
    setMessage('')

    const res  = await fetch(`/api/claim/${code}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email: email.trim().toLowerCase() }),
    })
    const json = await res.json()

    if (!res.ok) {
      setMessage(json.error ?? 'Something went wrong. Please try again.')
      setStep('error')
    } else {
      setPassword(json.password)
      setStep('success')
    }
  }

  const goToDashboard = async () => {
    setSigning(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setMessage(`Sign-in failed: ${error.message}. Use the password above to sign in manually.`)
      setSigning(false)
      return
    }
    router.push('/dashboard/search?welcome=trial')
  }

  if (step === 'success') {
    return (
      <div className="space-y-5">
        <div className="rounded-lg bg-green-50 border border-green-200 px-5 py-4">
          <p className="text-sm font-semibold text-green-800 mb-1">Account created!</p>
          <p className="text-sm text-green-700">
            Your temporary password is shown below. Save it, then change it in Settings.
          </p>
        </div>
        <div className="rounded-lg bg-zinc-100 border border-zinc-200 px-4 py-3">
          <p className="text-xs font-medium text-zinc-500 mb-1">Email</p>
          <p className="text-sm font-mono text-zinc-900">{email}</p>
          <p className="text-xs font-medium text-zinc-500 mt-2 mb-1">Temporary password</p>
          <p className="text-sm font-mono font-bold text-zinc-900 tracking-wide">{password}</p>
          <p className="mt-2 text-xs text-zinc-500">⚠️ Save this — you won&apos;t see it again.</p>
        </div>
        {message && <p className="text-sm text-red-600">{message}</p>}
        <button
          onClick={goToDashboard}
          disabled={signing}
          className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {signing ? 'Signing in…' : 'Go to Dashboard →'}
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={claim} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-zinc-700 mb-1.5">
          Work email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
          placeholder="you@company.com"
          className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
      </div>

      {step === 'error' && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3.5 py-2.5">
          <p className="text-sm text-red-700">{message}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={step === 'loading'}
        className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {step === 'loading' ? 'Creating account…' : 'Claim my free search →'}
      </button>
    </form>
  )
}
