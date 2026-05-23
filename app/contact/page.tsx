'use client'

import { useState, useRef } from 'react'
import { apiFetch } from '@/lib/fetch'
import Link from 'next/link'
import { ArrowLeft, Send, CheckCircle } from 'lucide-react'
import { NeuridionWordmark } from '@/components/ui/neuridion-wordmark'

export default function ContactPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const loadedAt = useRef(Date.now())

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setStatus('sending')
    setErrorMsg('')

    const form = e.currentTarget
    const honeypot = (form.elements.namedItem('_hp_field') as HTMLInputElement)?.value ?? ''

    try {
      const res = await apiFetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          subject: subject.trim(),
          message: message.trim(),
          _hp_field: honeypot,
          _t: loadedAt.current,
        }),
      })

      if (res.ok) {
        setStatus('sent')
      } else {
        const data = await res.json().catch(() => null)
        setErrorMsg(data?.error ?? 'Something went wrong. Please try again.')
        setStatus('error')
      }
    } catch {
      setErrorMsg('Network error. Please check your connection.')
      setStatus('error')
    }
  }

  return (
    <div className="min-h-screen bg-white text-[#1E293B]">
      <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-[#E2E8F0]">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center">
            <NeuridionWordmark markSize={36} />
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm text-[#134E4A] hover:text-[#0F1F3D] transition-colors"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="text-sm px-4 py-2 bg-[#0F1F3D] text-white rounded hover:bg-[#1a2d52] transition-colors font-medium"
            >
              Start free trial
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-xl mx-auto px-6 py-16">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-800 mb-6"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back
        </Link>

        <h1 className="text-3xl font-bold text-[#0F1F3D] mb-2">Contact us</h1>
        <p className="text-[#134E4A] mb-8">
          Questions about Neuridion, enterprise pricing, or partnerships? We'll get back to you within 1 business day.
        </p>

        {status === 'sent' ? (
          <div className="rounded-lg border border-green-200 bg-green-50 p-6 text-center">
            <CheckCircle className="w-10 h-10 text-green-600 mx-auto mb-3" />
            <h2 className="text-lg font-semibold text-green-900 mb-1">Message sent</h2>
            <p className="text-sm text-green-700">
              Thank you for reaching out. We'll reply to <strong>{email}</strong> shortly.
            </p>
            <Link
              href="/"
              className="inline-block mt-4 text-sm text-green-700 hover:text-green-900 underline"
            >
              Back to home
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Honeypot — hidden from humans, filled by bots */}
            <div className="absolute -left-[9999px]" aria-hidden="true">
              <label htmlFor="_hp_field">Do not fill this</label>
              <input type="text" id="_hp_field" name="_hp_field" tabIndex={-1} autoComplete="off" />
            </div>

            <div>
              <label htmlFor="name" className="block text-sm font-medium text-[#0F1F3D] mb-1">
                Name
              </label>
              <input
                id="name"
                type="text"
                required
                maxLength={200}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded border border-[#E2E8F0] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0D9488] focus:border-transparent"
                placeholder="Your full name"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-[#0F1F3D] mb-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                maxLength={320}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded border border-[#E2E8F0] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0D9488] focus:border-transparent"
                placeholder="you@company.com"
              />
            </div>

            <div>
              <label htmlFor="subject" className="block text-sm font-medium text-[#0F1F3D] mb-1">
                Subject
              </label>
              <select
                id="subject"
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full rounded border border-[#E2E8F0] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0D9488] focus:border-transparent bg-white"
              >
                <option value="">Select a topic</option>
                <option value="Enterprise pricing">Enterprise pricing</option>
                <option value="Product question">Product question</option>
                <option value="Partnership / integration">Partnership / integration</option>
                <option value="Bug report">Bug report</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div>
              <label htmlFor="message" className="block text-sm font-medium text-[#0F1F3D] mb-1">
                Message
              </label>
              <textarea
                id="message"
                required
                minLength={10}
                maxLength={5000}
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full rounded border border-[#E2E8F0] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0D9488] focus:border-transparent resize-y"
                placeholder="How can we help?"
              />
            </div>

            {status === 'error' && (
              <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={status === 'sending'}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0F1F3D] text-white rounded text-sm font-medium hover:bg-[#1a2d52] transition-colors disabled:opacity-50"
            >
              {status === 'sending' ? (
                'Sending...'
              ) : (
                <>
                  Send message
                  <Send className="w-4 h-4" />
                </>
              )}
            </button>

            <p className="text-xs text-zinc-400">
              By submitting, you agree to our{' '}
              <Link href="/privacy" className="underline hover:text-zinc-600">Privacy Policy</Link>.
            </p>
          </form>
        )}
      </div>

      <footer className="bg-white border-t border-[#E2E8F0] py-12 mt-auto">
        <div className="max-w-xl mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-[#0D9488]">
            <span>&copy; 2026 Neuridion. All rights reserved.</span>
            <div className="flex gap-4">
              <Link href="/privacy" className="hover:text-[#0F1F3D]">Privacy</Link>
              <Link href="/terms" className="hover:text-[#0F1F3D]">Terms</Link>
              <Link href="/imprint" className="hover:text-[#0F1F3D]">Imprint</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
