'use client'

import React, { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, Mail, CheckCircle } from 'lucide-react'

export function NeuridionSignIn() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [step, setStep] = useState<'email' | 'code' | 'success'>('email')
  const [code, setCode] = useState(['', '', '', '', '', ''])
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
      const res = await fetch('/api/auth/otp', {
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
      setError('Network error. Please try again.')
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
      const res = await fetch('/api/auth/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', email, code: fullCode }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Verification failed.')
        setLoading(false)
        return
      }

      if (data.redirect) setRedirectPath(data.redirect)
      setStep('success')
      setTimeout(() => router.push(data.redirect ?? redirectPath), 1500)
    } catch {
      setError('Network error. Please try again.')
      setLoading(false)
    }
  }

  const handleCodeChange = (index: number, value: string) => {
    if (value.length > 1) return
    const newCode = [...code]
    newCode[index] = value
    setCode(newCode)

    if (value && index < 5) {
      codeInputRefs.current[index + 1]?.focus()
    }

    if (index === 5 && value) {
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
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pasted.length === 6) {
      e.preventDefault()
      const newCode = pasted.split('')
      setCode(newCode)
      codeInputRefs.current[5]?.focus()
      verifyCode(pasted)
    }
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
      {/* Minimal header */}
      <div className="px-6 py-5">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 bg-[#0F1F3D] rounded flex items-center justify-center">
            <span className="text-white font-bold text-xs">N</span>
          </div>
          <span className="text-[#0F1F3D] font-semibold text-sm">Neuridion</span>
        </Link>
      </div>

      {/* Main */}
      <div className="flex-1 flex items-center justify-center px-4 pb-20">
        <div className="w-full max-w-sm">
          {step === 'email' && (
            <>
              <div className="text-center mb-8">
                <div className="w-12 h-12 bg-[#F1F5F9] border border-[#E2E8F0] rounded mx-auto mb-4 flex items-center justify-center">
                  <Mail className="w-5 h-5 text-[#64748B]" />
                </div>
                <h1 className="text-2xl font-bold text-[#0F1F3D] mb-1">Sign in</h1>
                <p className="text-sm text-[#64748B]">
                  We&apos;ll send a verification code to your email
                </p>
              </div>

              <div className="bg-white border border-[#E2E8F0] rounded p-6">
                <form onSubmit={handleEmailSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-[#374151] mb-1.5">
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
                      className="w-full border border-[#E2E8F0] rounded px-3.5 py-2.5 text-sm text-[#1E293B] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#0F1F3D]/20 focus:border-[#0F1F3D] disabled:opacity-50"
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
                <p className="text-sm text-[#64748B]">
                  <Link
                    href="/login/password"
                    className="text-[#0F1F3D] font-medium hover:underline"
                  >
                    Sign in with password
                  </Link>
                </p>
                <p className="text-sm text-[#64748B]">
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
                  <Mail className="w-5 h-5 text-[#64748B]" />
                </div>
                <h1 className="text-2xl font-bold text-[#0F1F3D] mb-1">Check your email</h1>
                <p className="text-sm text-[#64748B]">
                  We sent a 6-digit code to{' '}
                  <span className="text-[#374151] font-medium">{email}</span>
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
                      if (full.length === 6) verifyCode(full)
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
                        setCode(['', '', '', '', '', ''])
                        setError('')
                      }}
                      className="text-[#64748B] hover:text-[#0F1F3D] transition-colors"
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
                      className="text-[#64748B] hover:text-[#0F1F3D] transition-colors"
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
              <p className="text-sm text-[#64748B]">Redirecting to your dashboard...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
