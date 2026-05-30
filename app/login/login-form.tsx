'use client'

import { useState, useEffect, useRef, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { apiFetch } from '@/lib/fetch'

export function LoginForm() {
  const router = useRouter()
  const emailRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    emailRef.current?.focus()
  }, [])

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const email = (formData.get('email') as string)?.trim()
    const password = formData.get('password') as string

    if (!email || !password) {
      setError('Email and password are required.')
      setLoading(false)
      return
    }

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

      const supabase = createClient()
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (authError) {
        const failRes = await apiFetch('/api/auth/post-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, success: false, method: 'password' }),
        }).catch(() => null)
        const failData: { blocked?: boolean; error?: string } =
          await failRes?.json().catch(() => ({})) ?? {}

        setError(failData.blocked
          ? (failData.error ?? 'Too many attempts. Try again in 15 minutes.')
          : 'Invalid email or password.')
        setLoading(false)
        return
      }

      const callPostLogin = async (): Promise<{ redirect?: string }> => {
        const res = await apiFetch('/api/auth/post-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, success: true, method: 'password' }),
        })
        if (res.status === 401) {
          await new Promise((r) => setTimeout(r, 250))
          const retry = await apiFetch('/api/auth/post-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, success: true, method: 'password' }),
          })
          return retry.json().catch(() => ({}))
        }
        return res.json().catch(() => ({}))
      }
      const postData = await callPostLogin()

      const redirectPath =
        typeof postData.redirect === 'string' &&
        postData.redirect.startsWith('/') &&
        !postData.redirect.startsWith('//')
          ? postData.redirect
          : '/dashboard/search'

      router.push(redirectPath)
      router.refresh()
    } catch {
      setError('Unable to connect. Please check your internet and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="email"
          className="block text-sm font-medium text-zinc-700 mb-1.5"
        >
          Email
        </label>
        <input
          ref={emailRef}
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          placeholder="you@company.com"
        />
      </div>

      <div>
        <label
          htmlFor="password"
          className="block text-sm font-medium text-zinc-700 mb-1.5"
        >
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          placeholder="••••••••"
        />
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 border border-red-200 px-3.5 py-2.5 text-sm text-red-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {loading ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}
