'use client'

import VaporizeTextCycle, { Tag } from '@/components/ui/vapour-text-effect'

export function HeroVapourText() {
  return (
    <VaporizeTextCycle
      texts={[
        "PMS in minutes, not days",
        "AI finds. PRRC decides.",
        "Audit-ready. Instantly.",
      ]}
      font={{
        fontFamily: "var(--font-geist-sans), sans-serif",
        fontSize: "64px",
        fontWeight: 700,
      }}
      color="rgb(255, 255, 255)"
      spread={4}
      density={6}
      animation={{
        vaporizeDuration: 2.5,
        fadeInDuration: 0.8,
        waitDuration: 2,
      }}
      direction="left-to-right"
      alignment="center"
      tag={Tag.H1}
    />
  )
}
