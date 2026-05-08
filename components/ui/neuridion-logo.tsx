'use client'

export function NeuridionLogo({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Neuridion"
    >
      <rect width="32" height="32" rx="6" fill="#0F1F3D" />
      <path
        d="M9 24V8"
        stroke="white"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <path
        d="M23 24V8"
        stroke="white"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <path
        d="M9 8L23 24"
        stroke="#0D9488"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="16" cy="16" r="2.5" fill="#5EEAD4" />
      <circle cx="16" cy="16" r="1" fill="#0F1F3D" />
    </svg>
  )
}
