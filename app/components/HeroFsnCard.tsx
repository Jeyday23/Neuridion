'use client'

import { FadeIn } from './ui/motion'

export function HeroFsnCard() {
  return (
    <FadeIn delay={0.2} y={16} className="hidden lg:block">
      <div className="bg-white border border-[#dfe3ea] rounded-md overflow-hidden shadow-sm">
        {/* Header */}
        <div className="bg-[#f6f7f9] border-b border-[#dfe3ea] px-5 py-3 flex items-center justify-between">
          <span className="text-[11px] font-semibold text-[#7a8599] uppercase tracking-wider">
            BfArM &mdash; Field Safety Notice
          </span>
          <span className="text-[11px] text-[#c4cad4] font-mono">
            BfArM/FSN-2026-0847
          </span>
        </div>
        {/* Body */}
        <div className="px-5 py-4">
          <div className="text-sm font-semibold text-[#0F1F3D] leading-snug mb-3">
            FSCA: Potential battery overheating in patient monitoring system during extended use
          </div>
          <div className="grid grid-cols-2 gap-x-5 gap-y-2">
            <div>
              <div className="text-[10px] font-semibold text-[#7a8599] uppercase tracking-wider mb-0.5">Device class</div>
              <div className="text-[13px] text-[#1a2236] font-medium">Patient monitor (IIb)</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-[#7a8599] uppercase tracking-wider mb-0.5">Date issued</div>
              <div className="text-[13px] text-[#1a2236] font-medium">12 Mar 2026</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-[#7a8599] uppercase tracking-wider mb-0.5">FSCA type</div>
              <div className="text-[13px] text-[#1a2236] font-medium">Safety alert + IFU update</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-[#7a8599] uppercase tracking-wider mb-0.5">Risk</div>
              <div className="text-[13px] text-[#1a2236] font-medium">Device shutdown during critical monitoring</div>
            </div>
          </div>
        </div>
        {/* Classification */}
        <div className="border-t border-[#dfe3ea] px-5 py-3 flex items-center justify-between bg-[#f0fdf9]">
          <div className="flex items-center gap-3">
            <span className="inline-block px-2.5 py-0.5 rounded text-[11px] font-semibold bg-[#dcfce7] text-[#166534]">
              Relevant
            </span>
            <span className="text-xs text-[#0B7C72] font-medium">
              Matches your device profile
            </span>
          </div>
          <span className="text-[11px] text-[#7a8599] font-mono">94% confidence</span>
        </div>
      </div>
    </FadeIn>
  )
}
