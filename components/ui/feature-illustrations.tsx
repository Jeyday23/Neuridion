const NAVY = '#0F1F3D'
const TEAL = '#0D9488'
const LIGHT = '#E2E8F0'
const MUTED = '#94A3B8'
const BG = '#F1F5F9'

export function DatabaseSearchIllustration() {
  return (
    <svg viewBox="0 0 280 180" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto">
      {/* 4 database cylinders */}
      {[40, 100, 160, 220].map((x, i) => (
        <g key={i}>
          <ellipse cx={x} cy="50" rx="22" ry="8" fill={BG} stroke={LIGHT} strokeWidth="1.5" />
          <rect x={x - 22} y="50" width="44" height="40" fill={BG} stroke="none" />
          <line x1={x - 22} y1="50" x2={x - 22} y2="90" stroke={LIGHT} strokeWidth="1.5" />
          <line x1={x + 22} y1="50" x2={x + 22} y2="90" stroke={LIGHT} strokeWidth="1.5" />
          <ellipse cx={x} cy="90" rx="22" ry="8" fill={BG} stroke={LIGHT} strokeWidth="1.5" />
          <ellipse cx={x} cy="65" rx="22" ry="8" fill="none" stroke={LIGHT} strokeWidth="1" strokeDasharray="3 3" />
        </g>
      ))}
      {/* Labels */}
      <text x="40" y="115" textAnchor="middle" fill={MUTED} fontSize="9" fontFamily="sans-serif">BfArM</text>
      <text x="100" y="115" textAnchor="middle" fill={MUTED} fontSize="9" fontFamily="sans-serif">FDA</text>
      <text x="160" y="115" textAnchor="middle" fill={MUTED} fontSize="9" fontFamily="sans-serif">MHRA</text>
      <text x="220" y="115" textAnchor="middle" fill={MUTED} fontSize="9" fontFamily="sans-serif">Swiss</text>
      {/* Connection lines to center funnel */}
      {[40, 100, 160, 220].map((x, i) => (
        <line key={`l-${i}`} x1={x} y1="98" x2="140" y2="145" stroke={TEAL} strokeWidth="1.5" strokeDasharray="4 3" opacity="0.5" />
      ))}
      {/* Central result dot */}
      <circle cx="140" cy="150" r="10" fill={TEAL} opacity="0.15" />
      <circle cx="140" cy="150" r="4" fill={TEAL} />
      <text x="140" y="172" textAnchor="middle" fill={NAVY} fontSize="10" fontWeight="600" fontFamily="sans-serif">Parallel search</text>
    </svg>
  )
}

export function FilteringIllustration() {
  return (
    <svg viewBox="0 0 280 180" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto">
      {/* Incoming items */}
      {[60, 100, 140, 180, 220].map((x, i) => (
        <rect key={i} x={x - 12} y="20" width="24" height="18" rx="3" fill={BG} stroke={LIGHT} strokeWidth="1.5" />
      ))}
      {/* Funnel */}
      <path d="M50 55 L230 55 L175 100 L105 100 Z" fill={BG} stroke={LIGHT} strokeWidth="1.5" />
      <line x1="105" y1="100" x2="120" y2="130" stroke={LIGHT} strokeWidth="1.5" />
      <line x1="175" y1="100" x2="160" y2="130" stroke={LIGHT} strokeWidth="1.5" />
      {/* Three output buckets */}
      <rect x="30" y="140" width="60" height="28" rx="4" fill="#F0FDF4" stroke="#BBF7D0" strokeWidth="1.5" />
      <text x="60" y="158" textAnchor="middle" fill="#166534" fontSize="9" fontWeight="500" fontFamily="sans-serif">Relevant</text>
      <rect x="110" y="140" width="60" height="28" rx="4" fill="#FFFBEB" stroke="#FDE68A" strokeWidth="1.5" />
      <text x="140" y="158" textAnchor="middle" fill="#92400E" fontSize="9" fontWeight="500" fontFamily="sans-serif">Uncertain</text>
      <rect x="190" y="140" width="60" height="28" rx="4" fill={BG} stroke={LIGHT} strokeWidth="1.5" />
      <text x="220" y="158" textAnchor="middle" fill={MUTED} fontSize="9" fontWeight="500" fontFamily="sans-serif">Excluded</text>
      {/* Arrow lines from funnel to buckets */}
      <line x1="125" y1="130" x2="60" y2="140" stroke={TEAL} strokeWidth="1" strokeDasharray="3 3" />
      <line x1="140" y1="130" x2="140" y2="140" stroke="#D97706" strokeWidth="1" strokeDasharray="3 3" />
      <line x1="155" y1="130" x2="220" y2="140" stroke={MUTED} strokeWidth="1" strokeDasharray="3 3" />
    </svg>
  )
}

export function ReportsIllustration() {
  return (
    <svg viewBox="0 0 280 180" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto">
      {/* PDF document */}
      <rect x="60" y="20" width="70" height="90" rx="4" fill="white" stroke={LIGHT} strokeWidth="1.5" />
      <rect x="68" y="30" width="30" height="4" rx="1" fill={NAVY} />
      <rect x="68" y="40" width="50" height="3" rx="1" fill={LIGHT} />
      <rect x="68" y="48" width="45" height="3" rx="1" fill={LIGHT} />
      <rect x="68" y="56" width="50" height="3" rx="1" fill={LIGHT} />
      <rect x="68" y="68" width="50" height="20" rx="2" fill={BG} stroke={LIGHT} strokeWidth="1" />
      <rect x="68" y="94" width="20" height="8" rx="2" fill={TEAL} opacity="0.2" />
      <text x="78" y="101" textAnchor="middle" fill={TEAL} fontSize="6" fontWeight="600" fontFamily="sans-serif">PDF</text>
      {/* Excel document */}
      <rect x="150" y="20" width="70" height="90" rx="4" fill="white" stroke={LIGHT} strokeWidth="1.5" />
      {/* Table grid */}
      <rect x="158" y="30" width="54" height="4" rx="1" fill={NAVY} />
      {[42, 52, 62, 72, 82].map((y, i) => (
        <g key={i}>
          <rect x="158" y={y} width="16" height="6" rx="1" fill={i === 0 ? TEAL : BG} opacity={i === 0 ? 0.2 : 1} />
          <rect x="178" y={y} width="16" height="6" rx="1" fill={BG} />
          <rect x="198" y={y} width="14" height="6" rx="1" fill={BG} />
        </g>
      ))}
      <rect x="158" y="94" width="20" height="8" rx="2" fill="#166534" opacity="0.15" />
      <text x="168" y="101" textAnchor="middle" fill="#166534" fontSize="6" fontWeight="600" fontFamily="sans-serif">XLSX</text>
      {/* Checkmark seal */}
      <circle cx="140" cy="135" r="16" fill="#F0FDF4" stroke="#BBF7D0" strokeWidth="1.5" />
      <path d="M132 135 L138 141 L149 130" stroke="#166534" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <text x="140" y="165" textAnchor="middle" fill={NAVY} fontSize="9" fontWeight="500" fontFamily="sans-serif">Audit-ready</text>
    </svg>
  )
}

export function PRRCGateIllustration() {
  return (
    <svg viewBox="0 0 280 180" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto">
      {/* AI results box (left) */}
      <rect x="30" y="40" width="70" height="50" rx="4" fill={BG} stroke={LIGHT} strokeWidth="1.5" />
      <text x="65" y="58" textAnchor="middle" fill={MUTED} fontSize="9" fontFamily="sans-serif">AI results</text>
      <rect x="40" y="65" width="50" height="4" rx="1" fill={LIGHT} />
      <rect x="40" y="73" width="40" height="4" rx="1" fill={LIGHT} />
      {/* Arrow */}
      <line x1="100" y1="65" x2="125" y2="65" stroke={TEAL} strokeWidth="1.5" />
      <polygon points="125,60 135,65 125,70" fill={TEAL} />
      {/* Gate / Review checkpoint */}
      <rect x="135" y="30" width="50" height="70" rx="4" fill="white" stroke={TEAL} strokeWidth="2" />
      <circle cx="160" cy="52" r="10" fill={BG} stroke={LIGHT} strokeWidth="1.5" />
      {/* Person icon */}
      <circle cx="160" cy="49" r="3.5" fill={NAVY} />
      <path d="M153 59 C153 55 156 53 160 53 C164 53 167 55 167 59" fill={NAVY} />
      <text x="160" y="75" textAnchor="middle" fill={NAVY} fontSize="8" fontWeight="600" fontFamily="sans-serif">PRRC</text>
      <text x="160" y="85" textAnchor="middle" fill={MUTED} fontSize="7" fontFamily="sans-serif">reviews</text>
      {/* Arrow out */}
      <line x1="185" y1="65" x2="210" y2="65" stroke={TEAL} strokeWidth="1.5" />
      <polygon points="210,60 220,65 210,70" fill={TEAL} />
      {/* Approved report (right) */}
      <rect x="220" y="40" width="40" height="50" rx="4" fill="#F0FDF4" stroke="#BBF7D0" strokeWidth="1.5" />
      <path d="M232 65 L238 71 L249 60" stroke="#166534" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <text x="140" y="120" textAnchor="middle" fill={NAVY} fontSize="9" fontWeight="500" fontFamily="sans-serif">Human decides, tool assists</text>
      <text x="140" y="135" textAnchor="middle" fill={MUTED} fontSize="8" fontFamily="sans-serif">Every decision reviewed before export</text>
    </svg>
  )
}

export function SpeedIllustration() {
  return (
    <svg viewBox="0 0 280 180" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto">
      {/* Before - manual (left) */}
      <text x="80" y="25" textAnchor="middle" fill={MUTED} fontSize="9" fontWeight="500" fontFamily="sans-serif">Manual</text>
      <rect x="30" y="35" width="100" height="10" rx="3" fill={BG} stroke={LIGHT} strokeWidth="1" />
      <rect x="30" y="35" width="100" height="10" rx="3" fill="#FECACA" opacity="0.5" />
      <text x="80" y="43" textAnchor="middle" fill="#991B1B" fontSize="7" fontFamily="sans-serif">2-5 days</text>
      {/* Calendar blocks */}
      {[30, 50, 70, 90, 110].map((x, i) => (
        <rect key={i} x={x} y="52" width="16" height="16" rx="2" fill={i < 3 ? '#FECACA' : BG} stroke={i < 3 ? '#FCA5A5' : LIGHT} strokeWidth="1" opacity={i < 3 ? 0.7 : 0.4} />
      ))}
      {/* Arrow */}
      <path d="M140 55 L155 55" stroke={NAVY} strokeWidth="1.5" />
      <polygon points="155,51 162,55 155,59" fill={NAVY} />
      {/* After - Neuridion (right) */}
      <text x="210" y="25" textAnchor="middle" fill={TEAL} fontSize="9" fontWeight="600" fontFamily="sans-serif">Neuridion</text>
      <rect x="170" y="35" width="80" height="10" rx="3" fill={BG} stroke={LIGHT} strokeWidth="1" />
      <rect x="170" y="35" width="20" height="10" rx="3" fill={TEAL} opacity="0.2" />
      <text x="180" y="43" textAnchor="middle" fill={TEAL} fontSize="7" fontWeight="500" fontFamily="sans-serif">Min</text>
      {/* Clock */}
      <circle cx="210" cy="80" r="22" fill="white" stroke={LIGHT} strokeWidth="1.5" />
      <circle cx="210" cy="80" r="18" fill="none" stroke={TEAL} strokeWidth="2" strokeDasharray="80 33" strokeDashoffset="28" />
      <line x1="210" y1="80" x2="210" y2="66" stroke={NAVY} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="210" y1="80" x2="220" y2="80" stroke={TEAL} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="210" cy="80" r="2" fill={NAVY} />
      {/* Stats */}
      <text x="140" y="125" textAnchor="middle" fill={NAVY} fontSize="18" fontWeight="700" fontFamily="sans-serif">97%</text>
      <text x="140" y="140" textAnchor="middle" fill={MUTED} fontSize="9" fontFamily="sans-serif">less time on data collection</text>
      <text x="140" y="165" textAnchor="middle" fill={MUTED} fontSize="8" fontFamily="sans-serif">Same thoroughness. Fraction of the time.</text>
    </svg>
  )
}

export function SecurityIllustration() {
  return (
    <svg viewBox="0 0 280 180" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto">
      {/* Shield */}
      <path d="M140 20 L185 38 L185 85 C185 110 165 130 140 140 C115 130 95 110 95 85 L95 38 Z" fill={BG} stroke={LIGHT} strokeWidth="1.5" />
      <path d="M140 30 L178 45 L178 83 C178 104 162 120 140 128 C118 120 102 104 102 83 L102 45 Z" fill="white" stroke="none" />
      {/* Lock icon inside */}
      <rect x="130" y="70" width="20" height="16" rx="3" fill={NAVY} />
      <path d="M134 70 L134 63 C134 59.5 136.5 57 140 57 C143.5 57 146 59.5 146 63 L146 70" fill="none" stroke={NAVY} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="140" cy="78" r="2" fill="white" />
      {/* Labels around shield */}
      <g>
        <rect x="15" y="50" width="60" height="22" rx="4" fill="white" stroke={LIGHT} strokeWidth="1" />
        <text x="45" y="64" textAnchor="middle" fill={NAVY} fontSize="8" fontWeight="500" fontFamily="sans-serif">GDPR</text>
        <line x1="75" y1="61" x2="95" y2="65" stroke={LIGHT} strokeWidth="1" strokeDasharray="3 2" />
      </g>
      <g>
        <rect x="205" y="50" width="60" height="22" rx="4" fill="white" stroke={LIGHT} strokeWidth="1" />
        <text x="235" y="64" textAnchor="middle" fill={NAVY} fontSize="8" fontWeight="500" fontFamily="sans-serif">Encrypted</text>
        <line x1="205" y1="61" x2="185" y2="65" stroke={LIGHT} strokeWidth="1" strokeDasharray="3 2" />
      </g>
      <g>
        <rect x="15" y="90" width="60" height="22" rx="4" fill="white" stroke={LIGHT} strokeWidth="1" />
        <text x="45" y="104" textAnchor="middle" fill={NAVY} fontSize="7" fontWeight="500" fontFamily="sans-serif">Append-only</text>
        <line x1="75" y1="101" x2="95" y2="90" stroke={LIGHT} strokeWidth="1" strokeDasharray="3 2" />
      </g>
      <g>
        <rect x="205" y="90" width="60" height="22" rx="4" fill="white" stroke={LIGHT} strokeWidth="1" />
        <text x="235" y="104" textAnchor="middle" fill={NAVY} fontSize="8" fontWeight="500" fontFamily="sans-serif">RLS</text>
        <line x1="205" y1="101" x2="185" y2="90" stroke={LIGHT} strokeWidth="1" strokeDasharray="3 2" />
      </g>
      <text x="140" y="165" textAnchor="middle" fill={MUTED} fontSize="8" fontFamily="sans-serif">No patient data leaves the EU</text>
    </svg>
  )
}
