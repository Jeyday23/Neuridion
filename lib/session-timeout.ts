'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'

export const IDLE_TIMEOUT_MINUTES = 30
export const ABSOLUTE_TIMEOUT_HOURS = 8

const IDLE_MS      = IDLE_TIMEOUT_MINUTES * 60 * 1000
const ABSOLUTE_MS  = ABSOLUTE_TIMEOUT_HOURS * 60 * 60 * 1000
const WARNING_MS   = 60 * 1000  // warn 60 s before logout
const CHECK_MS     = 10_000     // poll every 10 s

export function useSessionTimeout(
  onWarning: () => void,
  onTimeout: () => void,
) {
  const router           = useRouter()
  const lastActivityRef  = useRef<number>(0)
  const sessionStartRef  = useRef<number>(0)
  // Initialise timestamps after mount so Date.now() is not called during render
  useEffect(() => {
    if (!lastActivityRef.current) lastActivityRef.current = Date.now()
    if (!sessionStartRef.current) sessionStartRef.current = Date.now()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const warningShownRef  = useRef(false)
  const timerRef         = useRef<ReturnType<typeof setInterval> | null>(null)

  const resetActivity = useCallback(() => {
    lastActivityRef.current  = Date.now()
    warningShownRef.current  = false
  }, [])

  const doLogout = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch {
      // best-effort; proceed to redirect regardless
    }
    onTimeout()
    router.push('/login')
  }, [router, onTimeout])

  useEffect(() => {
    const events = ['mousemove', 'keydown', 'click', 'scroll'] as const
    events.forEach((e) => window.addEventListener(e, resetActivity, { passive: true }))

    timerRef.current = setInterval(() => {
      const now          = Date.now()
      const idleMs       = now - lastActivityRef.current
      const sessionMs    = now - sessionStartRef.current
      const untilLogout  = IDLE_MS - idleMs

      if (sessionMs >= ABSOLUTE_MS) {
        doLogout()
        return
      }

      if (untilLogout <= 0) {
        doLogout()
      } else if (untilLogout <= WARNING_MS && !warningShownRef.current) {
        warningShownRef.current = true
        onWarning()
      }
    }, CHECK_MS)

    return () => {
      events.forEach((e) => window.removeEventListener(e, resetActivity))
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [resetActivity, doLogout, onWarning])

  return { resetActivity }
}
