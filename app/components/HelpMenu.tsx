'use client'

import { useState, useRef, useEffect } from 'react'
import { CircleHelp, Bug, MessageSquare, X } from 'lucide-react'
import { FeedbackPopup as FeedbackPopupInline } from '@/app/components/FeedbackPopup'

export function HelpMenu() {
  const [open, setOpen]         = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [showFeedback, setShowFeedback] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <>
      <div ref={menuRef} className="relative">
        <button
          onClick={() => setOpen(!open)}
          className="p-2 rounded-lg text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
          aria-label="Help menu"
        >
          <CircleHelp className="w-5 h-5" />
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-zinc-200 rounded-lg shadow-lg py-1 z-50">
            <button
              onClick={() => { setOpen(false); setShowReport(true) }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
            >
              <Bug className="w-4 h-4 text-zinc-400" />
              Report an Issue
            </button>
            <button
              onClick={() => { setOpen(false); setShowFeedback(true) }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
            >
              <MessageSquare className="w-4 h-4 text-zinc-400" />
              Give Feedback
            </button>
          </div>
        )}
      </div>

      {showReport && <ReportModal onClose={() => setShowReport(false)} />}
      {showFeedback && (
        <FeedbackWrapper onClose={() => setShowFeedback(false)} />
      )}
    </>
  )
}

function FeedbackWrapper({ onClose }: { onClose: () => void }) {
  return <FeedbackPopupInline triggeredBy="first_search" onClose={onClose} />
}

function ReportModal({ onClose }: { onClose: () => void }) {
  const [category, setCategory]       = useState<'bug' | 'suggestion' | 'question'>('bug')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting]   = useState(false)
  const [submitted, setSubmitted]     = useState(false)
  const [error, setError]             = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (description.trim().length < 10) {
      setError('Please describe the issue in at least 10 characters.')
      return
    }
    setSubmitting(true)
    setError('')

    const res = await fetch('/api/bugs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category,
        description: description.trim(),
        page_url: window.location.pathname,
      }),
    })

    if (!res.ok) {
      const json = await res.json().catch(() => ({ error: 'Something went wrong' }))
      setError(json.error)
      setSubmitting(false)
      return
    }

    setSubmitted(true)
    setTimeout(onClose, 2000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-lg border border-zinc-200 shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100">
          <h2 className="text-base font-semibold text-zinc-900">Report an Issue</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        {submitted ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm font-semibold text-green-700">Thank you!</p>
            <p className="text-sm text-green-600 mt-1">Your report has been submitted. We&apos;ll look into it.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">Category</label>
              <div className="flex gap-2">
                {(['bug', 'suggestion', 'question'] as const).map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      category === c
                        ? 'bg-blue-50 border-blue-200 text-blue-700'
                        : 'bg-white border-zinc-200 text-zinc-600 hover:border-zinc-300'
                    }`}
                  >
                    {c === 'bug' ? 'Bug' : c === 'suggestion' ? 'Suggestion' : 'Question'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="bug-desc" className="block text-sm font-medium text-zinc-700 mb-1.5">
                {category === 'bug' ? 'What went wrong?' : category === 'suggestion' ? 'What would you improve?' : 'What do you need help with?'}
              </label>
              <textarea
                id="bug-desc"
                value={description}
                onChange={e => setDescription(e.target.value.slice(0, 2000))}
                rows={4}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm resize-none focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder={category === 'bug' ? 'Describe what happened and what you expected...' : 'Tell us more...'}
              />
              <p className="text-xs text-zinc-400 mt-1">{description.length}/2000</p>
            </div>

            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-zinc-600 hover:text-zinc-800">
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? 'Sending...' : 'Submit Report'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
