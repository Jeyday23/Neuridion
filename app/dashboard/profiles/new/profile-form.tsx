'use client'

import { useActionState, useRef } from 'react'
import { useFormStatus } from 'react-dom'
import { createProfile, type ProfileState } from './actions'

const DEVICE_CLASSES = ['Class I', 'Class IIa', 'Class IIb', 'Class III']

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <div className="flex items-center gap-3 pt-2">
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {pending ? 'Saving…' : 'Create profile'}
      </button>
    </div>
  )
}

export function ProfileForm() {
  const [state, action] = useActionState<ProfileState, FormData>(createProfile, null)
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <form action={action} className="space-y-5" encType="multipart/form-data">
      <div className="grid grid-cols-2 gap-5">
        <div>
          <label htmlFor="device_name" className="block text-sm font-medium text-zinc-700 mb-1.5">
            Device name <span className="text-red-500">*</span>
          </label>
          <input
            id="device_name"
            name="device_name"
            type="text"
            required
            placeholder="e.g. CardioSense Pro"
            className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        <div>
          <label htmlFor="manufacturer" className="block text-sm font-medium text-zinc-700 mb-1.5">
            Manufacturer <span className="text-red-500">*</span>
          </label>
          <input
            id="manufacturer"
            name="manufacturer"
            type="text"
            required
            placeholder="e.g. Acme Medical GmbH"
            className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5">
        <div>
          <label htmlFor="emdn_code" className="block text-sm font-medium text-zinc-700 mb-1.5">
            EMDN code
          </label>
          <input
            id="emdn_code"
            name="emdn_code"
            type="text"
            placeholder="e.g. Z12"
            className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        <div>
          <label htmlFor="device_class" className="block text-sm font-medium text-zinc-700 mb-1.5">
            Device class
          </label>
          <select
            id="device_class"
            name="device_class"
            defaultValue=""
            className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="" disabled>Select class…</option>
            {DEVICE_CLASSES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="intended_use" className="block text-sm font-medium text-zinc-700 mb-1.5">
          Intended use
        </label>
        <textarea
          id="intended_use"
          name="intended_use"
          rows={4}
          placeholder="Describe the device's intended purpose, target patient population, and clinical setting…"
          className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-700 mb-1.5">
          IFU document
        </label>
        <div
          className="flex items-center gap-3 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-4 py-4 cursor-pointer hover:bg-zinc-100 transition-colors"
          onClick={() => fileRef.current?.click()}
        >
          <svg className="h-5 w-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 002.112 2.13" />
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-zinc-700">Upload IFU</p>
            <p className="text-xs text-zinc-400 mt-0.5">PDF or Word document</p>
          </div>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); fileRef.current?.click() }}
            className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
          >
            Browse
          </button>
        </div>
        <input
          ref={fileRef}
          id="ifu_file"
          name="ifu_file"
          type="file"
          accept=".pdf,.doc,.docx"
          className="hidden"
          onChange={(e) => {
            const name = e.target.files?.[0]?.name
            const label = e.currentTarget.closest('div')?.querySelector('p.text-sm')
            if (label && name) label.textContent = name
          }}
        />
      </div>

      {state?.error && (
        <p className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <SubmitButton />
    </form>
  )
}
