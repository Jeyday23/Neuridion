'use client'

import React, { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/fetch'
import { createClient as createBrowserClient } from '@/lib/supabase/client'
import { ArrowRight, Mail, CheckCircle } from 'lucide-react'
import { NeuridionWordmark } from '@/components/ui/neuridion-wordmark'

export function NeuridionSignIn() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [step, setStep] = useState<'email' | 'code' | 'success'>('email')
  const [code, setCode] = useState(['', '', '', '', '', '', '', ''])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const codeInputRefs = useRef<(HTMLInputElement | null)[]>([])
  const [redirectPath, setRedirectPath] = useState('/dashboard/search')

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return
    setError('')
    setLoading(true)

    try {
      const res = await apiFetch('/api/auth/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send', email }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Something went wrong.')
        return
      }
      setStep('code')
    } catch {
      setError('Unable to connect. Please check your internet and try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (step === 'code') {
      setTimeout(() => codeInputRefs.current[0]?.focus(), 300)
    }
  }, [step])

  const verifyCode = async (fullCode: string) => {
    setError('')
    setLoading(true)

    try {
      const rlRes = await apiFetch('/api/auth/post-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, success: false, checkOnly: true }),
      }).catch(() => null)
      const rlData: { blocked?: boolean; error?: string } =
        await rlRes?.json().catch(() => ({})) ?? {}
      if (rlData.blocked) {
        setError(rlData.error ?? 'Too many attempts. Try again in 15 minutes.')
        setLoading(false)
        return
      }

      const supabase = createBrowserClient()
      const { error: otpError } = await supabase.auth.verifyOtp({
        email,
        token: fullCode,
        type: 'email',
      })

      if (otpError) {
        const failRes = await apiFetch('/api/auth/post-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, success: false, method: 'otp' }),
        }).catch(() => null)
        const failData: { blocked?: boolean; error?: string } =
          await failRes?.json().catch(() => ({})) ?? {}

        setError(failData?.blocked
          ? (failData.error ?? 'Too many attempts. Try again in 15 minutes.')
          : otpError.message?.includes('Invalid')
            ? 'Incorrect code. Please check and try again.'
            : otpError.message ?? 'Verification failed. Please try again.',
        )
        setLoading(false)
        return
      }

      const callPostLogin = async (): Promise<{ redirect?: string }> => {
        const res = await apiFetch('/api/auth/post-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, success: true, method: 'otp' }),
        })
        if (res.status === 401) {
          await new Promise((r) => setTimeout(r, 250))
          const retry = await apiFetch('/api/auth/post-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, success: true, method: 'otp' }),
          })
          return retry.json().catch(() => ({}))
        }
        return res.json().catch(() => ({}))
      }
      const postData = await callPostLogin()

      const safeRedirect =
        typeof postData.redirect === 'string' &&
        postData.redirect.startsWith('/') &&
        !postData.redirect.startsWith('//')
          ? postData.redirect
          : undefined
      if (safeRedirect) setRedirectPath(safeRedirect)
      setLoading(false)
      setStep('success')
      setTimeout(() => router.push(safeRedirect ?? redirectPath), 1500)
    } catch {
      setError('Unable to connect. Please check your internet and try again.')
      setLoading(false)
    }
  }

  const handleCodeChange = (index: number, value: string) => {
    if (value.length > 1) return
    const newCode = [...code]
    newCode[index] = value
    setCode(newCode)

    if (value && index < 7) {
      codeInputRefs.current[index + 1]?.focus()
    }

    if (index === 7 && value) {
      const isComplete = newCode.every((d) => d.length === 1)
      if (isComplete) verifyCode(newCode.join(''))
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      codeInputRefs.current[index - 1]?.focus()
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 8)
    if (pasted.length === 8) {
      e.preventDefault()
      const newCode = pasted.split('')
      setCode(newCode)
      codeInputRefs.current[7]?.focus()
      verifyCode(pasted)
    }
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
      {/* Minimal header */}
      <div className="px-6 py-5">
        <Link href="/" className="flex items-center">
          <NeuridionWordmark markSize={28} textClass="text-sm" />
        </Link>
      </div>

      {/* Main */}
      <div className="flex-1 flex items-center justify-center px-4 pb-20">
        <div className="w-full max-w-sm">
          {step === 'email' && (
            <>
              <div className="text-center mb-8">
                <div className="w-12 h-12 bg-[#F1F5F9] border border-[#E2E8F0] rounded mx-auto mb-4 flex items-center justify-center">
                  <Mail className="w-5 h-5 text-[#0F766E]" />
                </div>
                <h1 className="text-2xl font-bold text-[#0F1F3D] mb-1">Sign in</h1>
                <p className="text-sm text-[#0F766E]">
                  We&apos;ll send a verification code to your email
                </p>
              </div>

              <div className="bg-white border border-[#E2E8F0] rounded p-6">
                <form onSubmit={handleEmailSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-[#134E4A] mb-1.5">
                      Email address
                    </label>
                    <input
                      id="email"
                      type="email"
                      placeholder="you@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={loading}
                      required
                      autoFocus
                      className="w-full border border-[#E2E8F0] rounded px-3.5 py-2.5 text-sm text-[#1E293B] placeholder:text-[#0D9488] focus:outline-none focus:ring-2 focus:ring-[#0F1F3D]/20 focus:border-[#0F1F3D] disabled:opacity-50"
                    />
                  </div>

                  {error && (
                    <p className="text-sm text-[#DC2626] bg-[#FEF2F2] border border-[#FECACA] rounded px-3 py-2">
                      {error}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 bg-[#0F1F3D] text-white rounded py-2.5 text-sm font-medium hover:bg-[#1a2d52] transition-colors disabled:opacity-50"
                  >
                    {loading ? 'Sending code...' : 'Continue'}
                    {!loading && <ArrowRight className="w-4 h-4" />}
                  </button>
                </form>
              </div>

              <div className="mt-6 text-center space-y-2">
                <p className="text-sm text-[#0F766E]">
                  <Link
                    href="/login/password"
                    className="text-[#0F1F3D] font-medium hover:underline"
                  >
                    Sign in with password
                  </Link>
                </p>
                <p className="text-sm text-[#0F766E]">
                  Don&apos;t have an account?{' '}
                  <Link href="/signup" className="text-[#0F1F3D] font-medium hover:underline">
                    Sign up
                  </Link>
                </p>
              </div>
            </>
          )}

          {step === 'code' && (
            <>
              <div className="text-center mb-8">
                <div className="w-12 h-12 bg-[#F1F5F9] border border-[#E2E8F0] rounded mx-auto mb-4 flex items-center justify-center">
                  <Mail className="w-5 h-5 text-[#0F766E]" />
                </div>
                <h1 className="text-2xl font-bold text-[#0F1F3D] mb-1">Check your email</h1>
                <p className="text-sm text-[#0F766E]">
                  We sent an 8-digit code to{' '}
                  <span className="text-[#134E4A] font-medium">{email}</span>
                </p>
              </div>

              <div className="bg-white border border-[#E2E8F0] rounded p-6">
                <div className="space-y-4">
                  <div
                    className="flex items-center justify-center gap-2"
                    onPaste={handlePaste}
                  >
                    {code.map((digit, i) => (
                      <input
                        key={i}
                        ref={(el) => {
                          codeInputRefs.current[i] = el
                        }}
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleCodeChange(i, e.target.value)}
                        onKeyDown={(e) => handleKeyDown(i, e)}
                        disabled={loading}
                        aria-label={`Verification code digit ${i + 1} of 8`}
                        className="w-10 h-12 text-center text-lg font-semibold border border-[#E2E8F0] rounded text-[#0F1F3D] focus:outline-none focus:ring-2 focus:ring-[#0F1F3D]/20 focus:border-[#0F1F3D] disabled:opacity-50"
                      />
                    ))}
                  </div>

                  {error && (
                    <p className="text-sm text-[#DC2626] bg-[#FEF2F2] border border-[#FECACA] rounded px-3 py-2">
                      {error}
                    </p>
                  )}

                  <button
                    onClick={() => {
                      const full = code.join('')
                      if (full.length === 8) verifyCode(full)
                    }}
                    disabled={!code.every((d) => d !== '') || loading}
                    className="w-full bg-[#0F1F3D] text-white rounded py-2.5 text-sm font-medium hover:bg-[#1a2d52] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Verifying...' : 'Verify'}
                  </button>

                  <div className="flex items-center justify-between text-sm">
                    <button
                      onClick={() => {
                        setStep('email')
                        setCode(['', '', '', '', '', '', '', ''])
                        setError('')
                      }}
                      className="text-[#0F766E] hover:text-[#0F1F3D] transition-colors"
                    >
                      Back
                    </button>
                    <button
                      onClick={() => {
                        setError('')
                        handleEmailSubmit({
                          preventDefault: () => {},
                        } as React.FormEvent)
                      }}
                      className="text-[#0F766E] hover:text-[#0F1F3D] transition-colors"
                    >
                      Resend code
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {step === 'success' && (
            <div className="text-center">
              <div className="w-12 h-12 bg-[#F0FDF4] border border-[#BBF7D0] rounded mx-auto mb-4 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-[#166534]" />
              </div>
              <h1 className="text-2xl font-bold text-[#0F1F3D] mb-1">Signed in</h1>
              <p className="text-sm text-[#0F766E]">Redirecting to your dashboard...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
