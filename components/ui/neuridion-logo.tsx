'use client'

const NAVY = '#0F1F3D'
const TEAL = '#0D9488'
const TEAL_LIGHT = '#5EEAD4'

function ShieldSynapseMark({
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
      <path
        d="M20 2 L37 9 L37 22 Q37 32 20 38 Q3 32 3 22 L3 9 Z"
        stroke={stroke}
        strokeWidth="2"
        strokeLinejoin="round"
        fill="none"
      />

      <line x1="20" y1="20" x2="13" y2="12.5" stroke={accent} strokeWidth="0.5" strokeLinecap="round" opacity="0.7" />
      <line x1="20" y1="20" x2="27" y2="12.5" stroke={accent} strokeWidth="0.5" strokeLinecap="round" opacity="0.7" />
      <line x1="20" y1="20" x2="12" y2="24" stroke={accent} strokeWidth="0.5" strokeLinecap="round" opacity="0.7" />
      <line x1="20" y1="20" x2="28" y2="24" stroke={accent} strokeWidth="0.5" strokeLinecap="round" opacity="0.7" />
      <line x1="20" y1="20" x2="20" y2="30" stroke={accent} strokeWidth="0.5" strokeLinecap="round" opacity="0.7" />

      <line x1="13" y1="12.5" x2="27" y2="12.5" stroke={accent} strokeWidth="0.3" strokeLinecap="round" opacity="0.4" />
      <line x1="13" y1="12.5" x2="12" y2="24" stroke={accent} strokeWidth="0.3" strokeLinecap="round" opacity="0.4" />
      <line x1="27" y1="12.5" x2="28" y2="24" stroke={accent} strokeWidth="0.3" strokeLinecap="round" opacity="0.4" />
      <line x1="12" y1="24" x2="20" y2="30" stroke={accent} strokeWidth="0.3" strokeLinecap="round" opacity="0.4" />
      <line x1="28" y1="24" x2="20" y2="30" stroke={accent} strokeWidth="0.3" strokeLinecap="round" opacity="0.4" />
      <line x1="12" y1="24" x2="28" y2="24" stroke={accent} strokeWidth="0.3" strokeLinecap="round" opacity="0.4" />

      <line x1="13" y1="12.5" x2="9.5" y2="8.5" stroke={stroke} strokeWidth="0.25" strokeLinecap="round" opacity="0.5" />
      <line x1="13" y1="12.5" x2="10" y2="16" stroke={stroke} strokeWidth="0.25" strokeLinecap="round" opacity="0.5" />
      <line x1="27" y1="12.5" x2="30.5" y2="8.5" stroke={stroke} strokeWidth="0.25" strokeLinecap="round" opacity="0.5" />
      <line x1="27" y1="12.5" x2="30" y2="16" stroke={stroke} strokeWidth="0.25" strokeLinecap="round" opacity="0.5" />
      <line x1="12" y1="24" x2="8.5" y2="21.5" stroke={stroke} strokeWidth="0.25" strokeLinecap="round" opacity="0.5" />
      <line x1="28" y1="24" x2="31.5" y2="21.5" stroke={stroke} strokeWidth="0.25" strokeLinecap="round" opacity="0.5" />

      <circle cx="9.5" cy="8.5" r="0.7" fill={nodeColor} />
      <circle cx="10" cy="16" r="0.7" fill={nodeColor} />
      <circle cx="30.5" cy="8.5" r="0.7" fill={nodeColor} />
      <circle cx="30" cy="16" r="0.7" fill={nodeColor} />
      <circle cx="8.5" cy="21.5" r="0.7" fill={nodeColor} />
      <circle cx="31.5" cy="21.5" r="0.7" fill={nodeColor} />

      <circle cx="13" cy="12.5" r="1.2" fill={accent} />
      <circle cx="27" cy="12.5" r="1.2" fill={accent} />
      <circle cx="12" cy="24" r="1.2" fill={accent} />
      <circle cx="28" cy="24" r="1.2" fill={accent} />
      <circle cx="20" cy="30" r="1.2" fill={accent} />

      <circle cx="20" cy="20" r="1.8" fill={accent} />
      <circle cx="20" cy="20" r="0.8" fill={stroke === 'white' ? NAVY : 'white'} />
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
        <ShieldSynapseMark stroke={NAVY} nodeColor={NAVY} accent={TEAL} />
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
      <ShieldSynapseMark stroke="white" nodeColor="white" accent={TEAL_LIGHT} />
    </svg>
  )
}
