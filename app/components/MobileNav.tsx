'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Menu, X } from 'lucide-react'

export function MobileNav() {
  const [open, setOpen] = useState(false)

  return (
    <div className="md:hidden">
      <button
        onClick={() => setOpen(!open)}
        aria-label={open ? 'Close menu' : 'Open menu'}
        className="p-1.5 text-[#7a8599] hover:text-[#0F1F3D] transition-colors"
      >
        {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {open && (
        <div className="absolute top-14 left-0 right-0 bg-white border-b border-[#dfe3ea] shadow-sm z-50">
          <div className="max-w-[1080px] mx-auto px-10 py-4 flex flex-col gap-3">
            <a
              href="#how-it-works"
              onClick={() => setOpen(false)}
              className="text-[13px] text-[#7a8599] font-medium hover:text-[#0F1F3D] transition-colors py-1"
            >
              How It Works
            </a>
            <Link
              href="/pricing"
              onClick={() => setOpen(false)}
              className="text-[13px] text-[#7a8599] font-medium hover:text-[#0F1F3D] transition-colors py-1"
            >
              Pricing
            </Link>
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="text-[13px] text-[#7a8599] font-medium hover:text-[#0F1F3D] transition-colors py-1"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              onClick={() => setOpen(false)}
              className="inline-block text-center text-[13px] px-[18px] py-[7px] bg-[#0F1F3D] text-white rounded font-medium hover:bg-[#162a4d] transition-colors mt-1"
            >
              Start free trial
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
