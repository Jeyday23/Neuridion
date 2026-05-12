'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { clsx } from 'clsx'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface ToastItem {
  id: string
  message: string
  type: ToastType
}

const STYLES: Record<ToastType, string> = {
  success: 'bg-green-700 text-white',
  error:   'bg-red-700 text-white',
  warning: 'bg-amber-600 text-white',
  info:    'bg-zinc-800 text-white',
}

const AUTO_DISMISS_MS: Record<ToastType, number | null> = {
  success: 4000,
  error:   null,
  warning: 6000,
  info:    4000,
}

export function ToastContainer({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: string) => void }) {
  return (
    <div className="fixed bottom-6 right-6 z-[60] flex flex-col gap-2 pointer-events-none">
      {toasts.slice(0, 3).map((t) => (
        <ToastNotification key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

function ToastNotification({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
    const ms = AUTO_DISMISS_MS[toast.type]
    if (ms) {
      const id = setTimeout(() => onDismiss(toast.id), ms)
      return () => clearTimeout(id)
    }
  }, [toast.id, toast.type, onDismiss])

  return (
    <div
      role={toast.type === 'error' ? 'alert' : 'status'}
      className={clsx(
        'rounded-md px-4 py-3 text-sm font-medium shadow-lg flex items-center gap-3 max-w-sm pointer-events-auto transition-all duration-200',
        STYLES[toast.type],
        visible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0',
      )}
    >
      <span className="flex-1">{toast.message}</span>
      <button onClick={() => onDismiss(toast.id)} className="shrink-0 opacity-70 hover:opacity-100" aria-label="Dismiss">
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
