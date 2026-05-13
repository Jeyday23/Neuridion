'use client'

import { type ReactNode } from 'react'
import { FadeIn, StaggerContainer, StaggerItem, HoverCard, CountUp } from './ui/motion'

export function AnimatedHero({ children }: { children: ReactNode }) {
  return <FadeIn y={32} duration={0.7}>{children}</FadeIn>
}

export function AnimatedTrustStat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <CountUp value={value} className="text-xl font-bold text-[#0D9488]" />
      <div className="text-xs text-[#134E4A] font-medium mt-1">{label}</div>
    </div>
  )
}

export function AnimatedSection({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode
  className?: string
  delay?: number
}) {
  return <FadeIn className={className} delay={delay}>{children}</FadeIn>
}

export function AnimatedStaggerGrid({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return <StaggerContainer className={className}>{children}</StaggerContainer>
}

export function AnimatedStaggerChild({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return <StaggerItem className={className}>{children}</StaggerItem>
}

export function AnimatedCard({ children, className }: { children: ReactNode; className?: string }) {
  return <HoverCard className={className}>{children}</HoverCard>
}
