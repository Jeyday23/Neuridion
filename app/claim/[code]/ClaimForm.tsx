'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/fetch'

interface Props { code: string }

type Step = 'form' | 'loading' | 'otp' | 'verifying' | 'error'

export function ClaimForm({ code }: Props) {
  const router  = useRouter()
  const [email,   setEmail]   = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [step,    setStep]    = useState<Step>('form')
  const [message, setMessage] = useState('')

  const claim = async (e: React.FormEvent) => {
    e.preventDefault()
    setStep('loading')
    setMessage('')

    const res  = await apiFetch(`/api/claim/${code}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email: email.trim().toLowerCase() }),
    })
    const json = await res.json()

    if (!res.ok) {
      setMessage(json.error ?? 'Something went wrong. Please try again.')
      setStep('error')
    } else {
      setStep('otp')
    }
  }

  const verify = async (e: React.FormEvent) => {
    e.preventDefault()
    setStep('verifying')
    setMessage('')

    const res = await apiFetch('/api/auth/otp', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action: 'verify', email: email.trim().toLowerCase(), code: otpCode.trim() }),
    })
    const json = await res.json()

    if (!res.ok) {
      setMessage(json.error ?? 'Verification failed. Please try again.')
      setStep('otp')
      return
    }

    router.push('/dashboard/search?welcome=trial')
  }

  const resendOtp = async () => {
    setMessage('')
    const res = await apiFetch('/api/auth/otp', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action: 'send', email: email.trim().toLowerCase() }),
    })
    if (res.ok) {
      setMessage('A new code has been sent to your email.')
    } else {
      const json = await res.json()
      setMessage(json.error ?? 'Could not resend code. Please wait a moment.')
    }
  }

  if (step === 'otp' || step === 'verifying') {
    return (
      <div className="space-y-5">
        <div className="rounded-lg bg-blue-50 border border-blue-200 px-5 py-4">
          <p className="text-sm font-semibold text-blue-800 mb-1">Check your email</p>
          <p className="text-sm text-blue-700">
            We sent a verification code to <strong>{email}</strong>. Enter it below to sign in.
          </p>
        </div>

        <form onSubmit={verify} className="space-y-4">
          <div>
            <label htmlFor="otp" className="block text-sm font-medium text-zinc-700 mb-1.5">
              Verification code
            </label>
            <input
              id="otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value)}
              required
              autoFocus
              placeholder="Enter code from email"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 text-center tracking-widest font-mono placeholder:text-zinc-400 placeholder:tracking-normal placeholder:font-sans focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          {message && (
            <div className={`rounded-lg border px-3.5 py-2.5 ${message.includes('sent') ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <p className={`text-sm ${message.includes('sent') ? 'text-green-700' : 'text-red-700'}`}>{message}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={step === 'verifying'}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {step === 'verifying' ? 'Verifying…' : 'Verify & Sign In →'}
          </button>
        </form>

        <p className="text-center text-xs text-zinc-500">
          Didn&apos;t get the code?{' '}
          <button onClick={resendOtp} className="text-blue-600 underline hover:text-blue-700">
            Resend
          </button>
        </p>
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
