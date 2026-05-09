'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { signup, type SignupState } from './actions'

function getPasswordStrength(pw: string): { score: number; label: string; color: string } {
  if (!pw) return { score: 0, label: '', color: '' }
  let score = 0
  if (pw.length >= 10)           score++
  if (/[A-Z]/.test(pw))         score++
  if (/[a-z]/.test(pw))         score++
  if (/[0-9]/.test(pw))         score++
  if (/[^A-Za-z0-9]/.test(pw))  score++
  if (score <= 2) return { score, label: 'Weak',   color: 'bg-red-500' }
  if (score <= 3) return { score, label: 'Fair',   color: 'bg-yellow-500' }
  return             { score, label: 'Strong', color: 'bg-green-500' }
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded bg-[#0D9488] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[#0F766E] disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {pending ? 'Creating account…' : 'Create account'}
    </button>
  )
}

export function SignupForm() {
  const [state, action] = useActionState<SignupState, FormData>(signup, null)
  const emailRef = useRef<HTMLInputElement>(null)
  const [password, setPassword] = useState('')

  const strength = getPasswordStrength(password)

  useEffect(() => {
    emailRef.current?.focus()
  }, [])

  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="full_name" className="block text-sm font-medium text-zinc-700 mb-1.5">
          Full name
        </label>
        <input
          id="full_name"
          name="full_name"
          type="text"
          autoComplete="name"
          required
          className="w-full rounded border border-[#E2E8F0] bg-white px-3.5 py-2.5 text-sm text-[#134E4A] placeholder:text-[#0F766E] focus:outline-none focus:ring-2 focus:ring-[#0D9488] focus:border-transparent"
          placeholder="Jane Smith"
        />
      </div>

      <div>
        <label htmlFor="company_name" className="block text-sm font-medium text-zinc-700 mb-1.5">
          Company name
        </label>
        <input
          id="company_name"
          name="company_name"
          type="text"
          autoComplete="organization"
          required
          className="w-full rounded border border-[#E2E8F0] bg-white px-3.5 py-2.5 text-sm text-[#134E4A] placeholder:text-[#0F766E] focus:outline-none focus:ring-2 focus:ring-[#0D9488] focus:border-transparent"
          placeholder="Acme Medical GmbH"
        />
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-zinc-700 mb-1.5">
          Email
        </label>
        <input
          ref={emailRef}
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="w-full rounded border border-[#E2E8F0] bg-white px-3.5 py-2.5 text-sm text-[#134E4A] placeholder:text-[#0F766E] focus:outline-none focus:ring-2 focus:ring-[#0D9488] focus:border-transparent"
          placeholder="you@company.com"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-zinc-700 mb-1.5">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded border border-[#E2E8F0] bg-white px-3.5 py-2.5 text-sm text-[#134E4A] placeholder:text-[#0F766E] focus:outline-none focus:ring-2 focus:ring-[#0D9488] focus:border-transparent"
          placeholder="••••••••••"
        />
        {password && (
          <div className="mt-2 space-y-1">
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className={`h-1 flex-1 rounded-full transition-colors ${
                    i <= strength.score ? strength.color : 'bg-zinc-200'
                  }`}
                />
              ))}
            </div>
            <p className={`text-xs ${
              strength.score <= 2 ? 'text-red-600'
              : strength.score <= 3 ? 'text-yellow-600'
              : 'text-green-600'
            }`}>
              {strength.label}
            </p>
          </div>
        )}
        <p className="mt-1 text-xs text-zinc-400">
          Min 10 chars · uppercase · lowercase · number · special character
        </p>
      </div>

      <div className="flex items-start gap-2">
        <input
          id="consent"
          name="consent"
          type="checkbox"
          required
          className="mt-1 h-4 w-4 rounded border-[#E2E8F0] text-[#0D9488] focus:ring-[#0D9488]"
        />
        <label htmlFor="consent" className="text-xs text-[#134E4A] leading-relaxed">
          I agree to the{' '}
          <a href="/terms" target="_blank" className="underline hover:text-[#0F1F3D]">Terms of Service</a>
          {' '}and{' '}
          <a href="/privacy" target="_blank" className="underline hover:text-[#0F1F3D]">Privacy Policy</a>.
        </label>
      </div>

      {state?.error && (
        <p className="rounded bg-[rgba(220,38,38,0.06)] border border-[rgba(220,38,38,0.2)] px-3.5 py-2.5 text-sm text-[#DC2626]">
          {state.error}
        </p>
      )}

      <SubmitButton />
    </form>
  )
}
