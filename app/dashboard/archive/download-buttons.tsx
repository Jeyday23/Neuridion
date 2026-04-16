'use client'

import { useState } from 'react'

interface Props {
  reportId: string
}

export function DownloadButtons({ reportId }: Props) {
  const [state, setState] = useState<
    | { phase: 'idle' }
    | { phase: 'loading' }
    | { phase: 'ready'; pdfUrl: string | null; excelUrl: string | null }
    | { phase: 'error' }
  >({ phase: 'idle' })

  async function fetchUrls() {
    setState({ phase: 'loading' })
    try {
      const res = await fetch(`/api/reports/${reportId}`)
      const data = await res.json() as { pdf_url?: string | null; excel_url?: string | null }
      if (!res.ok) throw new Error()
      setState({ phase: 'ready', pdfUrl: data.pdf_url ?? null, excelUrl: data.excel_url ?? null })
    } catch {
      setState({ phase: 'error' })
    }
  }

  if (state.phase === 'idle') {
    return (
      <button
        onClick={fetchUrls}
        className="text-xs text-blue-600 hover:underline whitespace-nowrap"
      >
        Get links
      </button>
    )
  }

  if (state.phase === 'loading') {
    return <span className="text-xs text-zinc-400">Loading…</span>
  }

  if (state.phase === 'error') {
    return <span className="text-xs text-red-500">Error</span>
  }

  return (
    <div className="flex flex-col gap-1">
      {state.pdfUrl && (
        <a
          href={state.pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-zinc-600 hover:text-zinc-900 hover:underline whitespace-nowrap"
        >
          ↓ PDF
        </a>
      )}
      {state.excelUrl && (
        <a
          href={state.excelUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-zinc-600 hover:text-zinc-900 hover:underline whitespace-nowrap"
        >
          ↓ Excel
        </a>
      )}
    </div>
  )
}
