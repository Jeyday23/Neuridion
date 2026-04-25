'use client'

import { useState } from 'react'
import { X, Star } from 'lucide-react'

interface FeedbackPopupProps {
  triggeredBy: 'first_search' | 'third_report'
  onClose: () => void
}

const USEFUL_OPTIONS = [
  'AI filtering',
  'Search speed',
  'Reports',
  'Audit trail',
  'Multi-database (BfArM)',
  'Profile management',
]

export function FeedbackPopup({ triggeredBy, onClose }: FeedbackPopupProps) {
  const [rating,     setRating]     = useState(0)
  const [usefulTags, setUsefulTags] = useState<string[]>([])
  const [missing,    setMissing]    = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted,  setSubmitted]  = useState(false)

  function toggleTag(tag: string) {
    setUsefulTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag],
    )
  }

  async function handleSubmit() {
    if (rating === 0) return
    setSubmitting(true)
    try {
      await fetch('/api/feedback', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating,
          most_useful:      usefulTags,
          missing_features: missing.trim() || null,
          triggered_by:     triggeredBy,
        }),
      })
      setSubmitted(true)
      localStorage.setItem(
        'kodex-feedback-dismissed-until',
        String(Date.now() + 30 * 24 * 60 * 60 * 1000),
      )
      setTimeout(onClose, 2000)
    } catch (err) {
      console.error('Failed to submit feedback:', err)
      setSubmitting(false)
    }
  }

  function handleSkip() {
    localStorage.setItem(
      'kodex-feedback-dismissed-until',
      String(Date.now() + 30 * 24 * 60 * 60 * 1000),
    )
    onClose()
  }

  if (submitted) {
    return (
      <div className="fixed bottom-4 right-4 z-50 w-96 rounded-lg bg-green-50 border border-green-200 p-6 shadow-xl">
        <p className="text-green-900 font-semibold">Thank you!</p>
        <p className="text-sm text-green-700 mt-1">Your feedback helps us improve Kodex.</p>
      </div>
    )
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-96 rounded-lg bg-white border border-slate-200 p-6 shadow-xl animate-slide-up">
      <button
        onClick={handleSkip}
        className="absolute top-3 right-3 text-slate-400 hover:text-slate-600"
        aria-label="Skip feedback"
      >
        <X className="w-4 h-4" />
      </button>

      <h3 className="text-lg font-semibold text-slate-900 mb-1">Quick feedback?</h3>
      <p className="text-sm text-slate-600 mb-4">Help us improve Kodex — takes 30 seconds.</p>

      {/* Rating */}
      <div className="mb-4">
        <label className="text-sm font-medium text-slate-900 block mb-2">
          How would you rate Kodex so far?
        </label>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map(n => (
            <button key={n} onClick={() => setRating(n)} className="p-1" aria-label={`Rate ${n} stars`}>
              <Star
                className={`w-6 h-6 ${n <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`}
              />
            </button>
          ))}
        </div>
      </div>

      {/* Most useful */}
      <div className="mb-4">
        <label className="text-sm font-medium text-slate-900 block mb-2">
          What&apos;s most useful? (Optional)
        </label>
        <div className="flex flex-wrap gap-2">
          {USEFUL_OPTIONS.map(opt => (
            <button
              key={opt}
              onClick={() => toggleTag(opt)}
              className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                usefulTags.includes(opt)
                  ? 'bg-blue-100 border-blue-400 text-blue-900'
                  : 'bg-white border-slate-300 text-slate-600 hover:border-slate-400'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>

      {/* Missing features */}
      <div className="mb-4">
        <label className="text-sm font-medium text-slate-900 block mb-2">
          What&apos;s missing? (Optional)
        </label>
        <textarea
          value={missing}
          onChange={(e) => setMissing(e.target.value.slice(0, 500))}
          className="w-full rounded border border-slate-300 p-2 text-sm h-20 resize-none"
          placeholder="Tell us what would make Kodex more useful..."
        />
        <p className="text-xs text-slate-400 mt-1">{missing.length}/500</p>
      </div>

      <div className="flex gap-2 justify-end">
        <button
          onClick={handleSkip}
          className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900"
        >
          Skip
        </button>
        <button
          onClick={handleSubmit}
          disabled={rating === 0 || submitting}
          className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
        >
          {submitting ? 'Sending…' : 'Send'}
        </button>
      </div>
    </div>
  )
}
