'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

const COOKIE_NAME = 'neuridion_cookie_consent'

function getConsent(): string | undefined {
  if (typeof document === 'undefined') return undefined
  return document.cookie
    .split('; ')
    .find((r) => r.startsWith(`${COOKIE_NAME}=`))
    ?.split('=')[1]
}

function setConsentCookie(value: 'accepted' | 'rejected') {
  const expires = new Date()
  expires.setFullYear(expires.getFullYear() + 1)
  document.cookie = `${COOKIE_NAME}=${value}; expires=${expires.toUTCString()}; path=/; SameSite=Lax; Secure`
}

export function CookieBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!getConsent()) setVisible(true)
  }, [])

  const accept = async () => {
    setConsentCookie('accepted')
    setVisible(false)
    try {
      await fetch('/api/consent/cookies', { method: 'POST' })
    } catch {
      // best-effort — consent is recorded locally regardless
    }
  }

  const reject = () => {
    setConsentCookie('rejected')
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-zinc-200 shadow-lg">
      <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <p className="text-sm text-zinc-600 flex-1">
          We use essential cookies to operate this service. Optional analytics cookies help us
          improve. No data is sold.{' '}
          <Link href="/privacy" className="text-blue-600 hover:underline">
            Privacy Policy
          </Link>
        </p>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={reject}
            className="px-4 py-2 text-sm border border-zinc-300 rounded-lg text-zinc-700 hover:bg-zinc-50 transition-colors"
          >
            Reject optional
          </button>
          <button
            onClick={accept}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Accept all
          </button>
        </div>
      </div>
    </div>
  )
}
