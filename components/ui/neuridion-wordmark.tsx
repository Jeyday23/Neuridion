'use client'

import { NeuridionLogo } from './neuridion-logo'

export function NeuridionWordmark({
  markSize = 36,
  textClass = 'text-lg',
}: {
  markSize?: number
  textClass?: string
}) {
  return (
    <span className="flex items-center gap-2.5">
      <NeuridionLogo size={markSize} variant="mark" />
      <span className={`${textClass} font-semibold tracking-tight text-[#0F1F3D] relative`}>
        Neur
        <span className="relative inline-block">
          i
          <span
            className="absolute -top-[1px] left-1/2 -translate-x-1/2 w-[5px] h-[5px] rounded-full bg-[#0D9488]"
            style={{ top: '-0.5px' }}
          />
        </span>
        dion
        <svg
          className="absolute top-[7px] -right-[18px]"
          width="16"
          height="6"
          viewBox="0 0 16 6"
          fill="none"
        >
          <line x1="0" y1="3" x2="12" y2="3" stroke="#0D9488" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="14" cy="3" r="2" fill="#0D9488" />
        </svg>
      </span>
    </span>
  )
}
