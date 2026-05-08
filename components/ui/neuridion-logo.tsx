'use client'

const NAVY = '#0F1F3D'
const TEAL = '#0D9488'
const TEAL_LIGHT = '#5EEAD4'

function NeuralDiamondMark({
  stroke,
  nodeColor,
  accent,
}: {
  stroke: string
  nodeColor: string
  accent: string
}) {
  return (
    <>
      {/* Diamond frame */}
      <path
        d="M20 3.5L36.5 20L20 36.5L3.5 20Z"
        stroke={stroke}
        strokeWidth="2.5"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Main branches from center to quadrant nodes */}
      <line x1="20" y1="20" x2="12" y2="12" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
      <line x1="20" y1="20" x2="28" y2="12" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
      <line x1="20" y1="20" x2="28" y2="28" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
      <line x1="20" y1="20" x2="12" y2="28" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />

      {/* Sub-branches — top-left quadrant */}
      <line x1="12" y1="12" x2="7" y2="13.5" stroke={stroke} strokeWidth="1.3" strokeLinecap="round" />
      <line x1="12" y1="12" x2="13.5" y2="7" stroke={stroke} strokeWidth="1.3" strokeLinecap="round" />

      {/* Sub-branches — top-right quadrant */}
      <line x1="28" y1="12" x2="33" y2="13.5" stroke={accent} strokeWidth="1.3" strokeLinecap="round" />
      <line x1="28" y1="12" x2="26.5" y2="7" stroke={stroke} strokeWidth="1.3" strokeLinecap="round" />

      {/* Sub-branches — bottom-right quadrant */}
      <line x1="28" y1="28" x2="33" y2="26.5" stroke={stroke} strokeWidth="1.3" strokeLinecap="round" />
      <line x1="28" y1="28" x2="26.5" y2="33" stroke={stroke} strokeWidth="1.3" strokeLinecap="round" />

      {/* Sub-branches — bottom-left quadrant */}
      <line x1="12" y1="28" x2="7" y2="26.5" stroke={stroke} strokeWidth="1.3" strokeLinecap="round" />
      <line x1="12" y1="28" x2="13.5" y2="33" stroke={stroke} strokeWidth="1.3" strokeLinecap="round" />

      {/* Branch point nodes */}
      <circle cx="12" cy="12" r="2" fill={nodeColor} />
      <circle cx="28" cy="12" r="2" fill={nodeColor} />
      <circle cx="28" cy="28" r="2" fill={nodeColor} />
      <circle cx="12" cy="28" r="2" fill={nodeColor} />

      {/* Endpoint nodes — navy */}
      <circle cx="7" cy="13.5" r="1.3" fill={nodeColor} />
      <circle cx="13.5" cy="7" r="1.3" fill={nodeColor} />
      <circle cx="26.5" cy="7" r="1.3" fill={nodeColor} />
      <circle cx="33" cy="26.5" r="1.3" fill={nodeColor} />
      <circle cx="26.5" cy="33" r="1.3" fill={nodeColor} />
      <circle cx="7" cy="26.5" r="1.3" fill={nodeColor} />
      <circle cx="13.5" cy="33" r="1.3" fill={nodeColor} />

      {/* Teal accent endpoint — top-right connector */}
      <circle cx="33" cy="13.5" r="1.5" fill={accent} />

      {/* Center node — teal */}
      <circle cx="20" cy="20" r="3" fill={accent} />
      <circle cx="20" cy="20" r="1.2" fill={stroke === 'white' ? NAVY : 'white'} />
    </>
  )
}

export function NeuridionLogo({
  size = 32,
  variant = 'icon',
}: {
  size?: number
  variant?: 'mark' | 'icon'
}) {
  if (variant === 'mark') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        fill="none"
        aria-label="Neuridion"
      >
        <NeuralDiamondMark stroke={NAVY} nodeColor={NAVY} accent={TEAL} />
      </svg>
    )
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-label="Neuridion"
    >
      <rect width="40" height="40" rx="8" fill={NAVY} />
      <NeuralDiamondMark stroke="white" nodeColor="white" accent={TEAL_LIGHT} />
    </svg>
  )
}
