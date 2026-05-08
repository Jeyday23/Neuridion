const NAVY = '#0F1F3D'
const TEAL = '#0D9488'
const TEAL_LIGHT = '#CCFBF1'
const TEAL_MID = '#5EEAD4'
const SLATE = '#475569'
const BORDER = '#CBD5E1'
const WARM_RED = '#EF4444'
const AMBER = '#F59E0B'
const GREEN = '#22C55E'

export function DatabaseSearchIllustration() {
  return (
    <svg viewBox="0 0 280 160" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto">
      {/* 4 database cylinders with real color */}
      {[
        { x: 40, label: 'BfArM', color: TEAL },
        { x: 100, label: 'FDA', color: NAVY },
        { x: 160, label: 'MHRA', color: '#6366F1' },
        { x: 220, label: 'Swiss', color: '#DC2626' },
      ].map(({ x, label, color }) => (
        <g key={label}>
          <ellipse cx={x} cy="35" rx="24" ry="9" fill={color} opacity="0.15" />
          <rect x={x - 24} y="35" width="48" height="35" fill={color} opacity="0.1" />
          <ellipse cx={x} cy="70" rx="24" ry="9" fill={color} opacity="0.15" />
          <ellipse cx={x} cy="35" rx="24" ry="9" fill="none" stroke={color} strokeWidth="2" />
          <line x1={x - 24} y1="35" x2={x - 24} y2="70" stroke={color} strokeWidth="2" />
          <line x1={x + 24} y1="35" x2={x + 24} y2="70" stroke={color} strokeWidth="2" />
          <ellipse cx={x} cy="70" rx="24" ry="9" fill="none" stroke={color} strokeWidth="2" />
          <ellipse cx={x} cy="50" rx="24" ry="9" fill="none" stroke={color} strokeWidth="1" strokeDasharray="4 3" opacity="0.4" />
          <text x={x} y="95" textAnchor="middle" fill={SLATE} fontSize="10" fontWeight="600" fontFamily="system-ui, sans-serif">{label}</text>
        </g>
      ))}
      {/* Bold connection lines */}
      {[40, 100, 160, 220].map((x, i) => (
        <line key={`l-${i}`} x1={x} y1="79" x2="140" y2="125" stroke={TEAL} strokeWidth="2" opacity="0.6" />
      ))}
      {/* Central result */}
      <circle cx="140" cy="130" r="14" fill={TEAL} opacity="0.2" />
      <circle cx="140" cy="130" r="7" fill={TEAL} />
      <text x="140" y="155" textAnchor="middle" fill={NAVY} fontSize="11" fontWeight="700" fontFamily="system-ui, sans-serif">Parallel search</text>
    </svg>
  )
}

export function FilteringIllustration() {
  return (
    <svg viewBox="0 0 280 160" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto">
      {/* Incoming items — colorful */}
      {[50, 90, 130, 170, 210].map((x, i) => (
        <rect key={i} x={x - 14} y="10" width="28" height="20" rx="4" fill={NAVY} opacity={0.12 + i * 0.04} stroke={NAVY} strokeWidth="1.5" strokeOpacity="0.3" />
      ))}
      {/* Funnel — bold teal */}
      <path d="M40 45 L240 45 L180 90 L100 90 Z" fill={TEAL} opacity="0.12" stroke={TEAL} strokeWidth="2" />
      <line x1="100" y1="90" x2="115" y2="110" stroke={TEAL} strokeWidth="2" />
      <line x1="180" y1="90" x2="165" y2="110" stroke={TEAL} strokeWidth="2" />
      {/* Three output buckets — strong colors */}
      <rect x="20" y="115" width="72" height="32" rx="6" fill="#DCFCE7" stroke={GREEN} strokeWidth="2" />
      <text x="56" y="135" textAnchor="middle" fill="#166534" fontSize="11" fontWeight="700" fontFamily="system-ui, sans-serif">Relevant</text>
      <rect x="104" y="115" width="72" height="32" rx="6" fill="#FEF3C7" stroke={AMBER} strokeWidth="2" />
      <text x="140" y="135" textAnchor="middle" fill="#92400E" fontSize="11" fontWeight="700" fontFamily="system-ui, sans-serif">Uncertain</text>
      <rect x="188" y="115" width="72" height="32" rx="6" fill="#F1F5F9" stroke={BORDER} strokeWidth="2" />
      <text x="224" y="135" textAnchor="middle" fill={SLATE} fontSize="11" fontWeight="700" fontFamily="system-ui, sans-serif">Excluded</text>
      {/* Flow arrows */}
      <line x1="120" y1="110" x2="56" y2="115" stroke={GREEN} strokeWidth="2" />
      <line x1="140" y1="110" x2="140" y2="115" stroke={AMBER} strokeWidth="2" />
      <line x1="160" y1="110" x2="224" y2="115" stroke={BORDER} strokeWidth="2" />
    </svg>
  )
}

export function ReportsIllustration() {
  return (
    <svg viewBox="0 0 280 160" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto">
      {/* PDF document */}
      <rect x="45" y="10" width="80" height="100" rx="6" fill="white" stroke={NAVY} strokeWidth="2" />
      <rect x="55" y="22" width="40" height="5" rx="2" fill={NAVY} />
      <rect x="55" y="33" width="58" height="3" rx="1" fill={BORDER} />
      <rect x="55" y="42" width="50" height="3" rx="1" fill={BORDER} />
      <rect x="55" y="51" width="58" height="3" rx="1" fill={BORDER} />
      <rect x="55" y="62" width="58" height="24" rx="3" fill={TEAL} opacity="0.08" stroke={TEAL} strokeWidth="1" />
      {/* PDF badge */}
      <rect x="55" y="94" width="28" height="12" rx="3" fill={WARM_RED} opacity="0.15" stroke={WARM_RED} strokeWidth="1.5" />
      <text x="69" y="103" textAnchor="middle" fill={WARM_RED} fontSize="8" fontWeight="700" fontFamily="system-ui, sans-serif">PDF</text>
      {/* Excel document */}
      <rect x="155" y="10" width="80" height="100" rx="6" fill="white" stroke={NAVY} strokeWidth="2" />
      <rect x="165" y="22" width="58" height="5" rx="2" fill={NAVY} />
      {/* Table grid */}
      {[35, 47, 59, 71, 83].map((y, i) => (
        <g key={i}>
          <rect x="165" y={y} width="18" height="8" rx="2" fill={i === 0 ? TEAL : TEAL} opacity={i === 0 ? 0.25 : 0.08} stroke={TEAL} strokeWidth="0.5" strokeOpacity="0.3" />
          <rect x="187" y={y} width="18" height="8" rx="2" fill={TEAL} opacity="0.05" stroke={TEAL} strokeWidth="0.5" strokeOpacity="0.2" />
          <rect x="209" y={y} width="16" height="8" rx="2" fill={TEAL} opacity="0.05" stroke={TEAL} strokeWidth="0.5" strokeOpacity="0.2" />
        </g>
      ))}
      {/* XLSX badge */}
      <rect x="165" y="94" width="28" height="12" rx="3" fill={GREEN} opacity="0.2" stroke={GREEN} strokeWidth="1.5" />
      <text x="179" y="103" textAnchor="middle" fill="#166534" fontSize="8" fontWeight="700" fontFamily="system-ui, sans-serif">XLSX</text>
      {/* Checkmark seal */}
      <circle cx="140" cy="130" r="16" fill="#DCFCE7" stroke={GREEN} strokeWidth="2" />
      <path d="M132 130 L138 136 L149 125" stroke="#166534" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <text x="140" y="158" textAnchor="middle" fill={NAVY} fontSize="10" fontWeight="600" fontFamily="system-ui, sans-serif">Audit-ready</text>
    </svg>
  )
}

export function PRRCGateIllustration() {
  return (
    <svg viewBox="0 0 280 160" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto">
      {/* AI results box (left) */}
      <rect x="15" y="25" width="70" height="55" rx="6" fill={NAVY} opacity="0.06" stroke={NAVY} strokeWidth="1.5" />
      <text x="50" y="45" textAnchor="middle" fill={SLATE} fontSize="10" fontWeight="600" fontFamily="system-ui, sans-serif">AI results</text>
      <rect x="25" y="53" width="50" height="4" rx="2" fill={NAVY} opacity="0.15" />
      <rect x="25" y="62" width="40" height="4" rx="2" fill={NAVY} opacity="0.1" />
      {/* Arrow */}
      <line x1="85" y1="52" x2="115" y2="52" stroke={TEAL} strokeWidth="2.5" />
      <polygon points="115,46 127,52 115,58" fill={TEAL} />
      {/* Gate — bold teal border */}
      <rect x="127" y="15" width="60" height="75" rx="8" fill="white" stroke={TEAL} strokeWidth="2.5" />
      {/* Person icon — bigger */}
      <circle cx="157" cy="38" r="12" fill={TEAL} opacity="0.12" />
      <circle cx="157" cy="35" r="5" fill={NAVY} />
      <path d="M148 47 C148 42 152 39 157 39 C162 39 166 42 166 47" fill={NAVY} />
      <text x="157" y="65" textAnchor="middle" fill={NAVY} fontSize="11" fontWeight="700" fontFamily="system-ui, sans-serif">PRRC</text>
      <text x="157" y="78" textAnchor="middle" fill={TEAL} fontSize="9" fontWeight="500" fontFamily="system-ui, sans-serif">reviews</text>
      {/* Arrow out */}
      <line x1="187" y1="52" x2="217" y2="52" stroke={TEAL} strokeWidth="2.5" />
      <polygon points="217,46 229,52 217,58" fill={TEAL} />
      {/* Approved report — green */}
      <rect x="229" y="25" width="40" height="55" rx="6" fill="#DCFCE7" stroke={GREEN} strokeWidth="2" />
      <path d="M241 52 L247 58 L258 47" stroke="#166534" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Bottom labels */}
      <text x="140" y="115" textAnchor="middle" fill={NAVY} fontSize="11" fontWeight="700" fontFamily="system-ui, sans-serif">Human decides, tool assists</text>
      <text x="140" y="132" textAnchor="middle" fill={SLATE} fontSize="9" fontFamily="system-ui, sans-serif">Every decision reviewed before export</text>
    </svg>
  )
}

export function SpeedIllustration() {
  return (
    <svg viewBox="0 0 280 160" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto">
      {/* Before — red bar */}
      <text x="75" y="18" textAnchor="middle" fill={SLATE} fontSize="10" fontWeight="600" fontFamily="system-ui, sans-serif">Manual</text>
      <rect x="25" y="24" width="100" height="14" rx="5" fill={WARM_RED} opacity="0.15" stroke={WARM_RED} strokeWidth="1.5" />
      <text x="75" y="34" textAnchor="middle" fill={WARM_RED} fontSize="9" fontWeight="600" fontFamily="system-ui, sans-serif">2–5 days</text>
      {/* Calendar blocks — red */}
      {[25, 47, 69, 91, 113].map((x, i) => (
        <rect key={i} x={x} y="44" width="18" height="18" rx="3" fill={i < 3 ? WARM_RED : '#F1F5F9'} opacity={i < 3 ? 0.25 : 0.5} stroke={i < 3 ? WARM_RED : BORDER} strokeWidth="1.5" />
      ))}
      {/* Arrow */}
      <path d="M140 52 L158 52" stroke={NAVY} strokeWidth="2.5" />
      <polygon points="158,47 168,52 158,57" fill={NAVY} />
      {/* After — teal bar */}
      <text x="215" y="18" textAnchor="middle" fill={TEAL} fontSize="10" fontWeight="700" fontFamily="system-ui, sans-serif">Neuridion</text>
      <rect x="175" y="24" width="80" height="14" rx="5" fill={TEAL_LIGHT} stroke={TEAL} strokeWidth="1.5" />
      <rect x="175" y="24" width="24" height="14" rx="5" fill={TEAL} opacity="0.35" />
      <text x="187" y="34" textAnchor="middle" fill={TEAL} fontSize="9" fontWeight="700" fontFamily="system-ui, sans-serif">Min</text>
      {/* Clock — bold */}
      <circle cx="215" cy="72" r="22" fill="white" stroke={NAVY} strokeWidth="2" />
      <circle cx="215" cy="72" r="18" fill="none" stroke={TEAL} strokeWidth="3" strokeDasharray="80 33" strokeDashoffset="28" />
      <line x1="215" y1="72" x2="215" y2="58" stroke={NAVY} strokeWidth="2" strokeLinecap="round" />
      <line x1="215" y1="72" x2="226" y2="72" stroke={TEAL} strokeWidth="2" strokeLinecap="round" />
      <circle cx="215" cy="72" r="3" fill={NAVY} />
      {/* Big stat */}
      <text x="140" y="120" textAnchor="middle" fill={NAVY} fontSize="28" fontWeight="800" fontFamily="system-ui, sans-serif">97%</text>
      <text x="140" y="138" textAnchor="middle" fill={TEAL} fontSize="10" fontWeight="600" fontFamily="system-ui, sans-serif">less time on data collection</text>
    </svg>
  )
}

export function SecurityIllustration() {
  return (
    <svg viewBox="0 0 280 160" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto">
      {/* Shield — bold */}
      <path d="M140 10 L190 30 L190 80 C190 108 168 126 140 135 C112 126 90 108 90 80 L90 30 Z" fill={NAVY} opacity="0.06" stroke={NAVY} strokeWidth="2" />
      <path d="M140 20 L182 37 L182 78 C182 102 164 117 140 125 C116 117 98 102 98 78 L98 37 Z" fill="white" stroke={TEAL} strokeWidth="1.5" />
      {/* Lock icon — bold */}
      <rect x="128" y="62" width="24" height="20" rx="4" fill={NAVY} />
      <path d="M133 62 L133 54 C133 49 136 46 140 46 C144 46 147 49 147 54 L147 62" fill="none" stroke={NAVY} strokeWidth="3" strokeLinecap="round" />
      <circle cx="140" cy="72" r="3" fill="white" />
      {/* Labels — strong color badges */}
      <rect x="5" y="38" width="65" height="26" rx="6" fill={TEAL_LIGHT} stroke={TEAL} strokeWidth="1.5" />
      <text x="37" y="55" textAnchor="middle" fill={TEAL} fontSize="10" fontWeight="700" fontFamily="system-ui, sans-serif">GDPR</text>
      <line x1="70" y1="51" x2="90" y2="55" stroke={TEAL} strokeWidth="1.5" />
      <rect x="210" y="38" width="65" height="26" rx="6" fill={TEAL_LIGHT} stroke={TEAL} strokeWidth="1.5" />
      <text x="242" y="55" textAnchor="middle" fill={TEAL} fontSize="10" fontWeight="700" fontFamily="system-ui, sans-serif">Encrypted</text>
      <line x1="210" y1="51" x2="190" y2="55" stroke={TEAL} strokeWidth="1.5" />
      <rect x="5" y="78" width="65" height="26" rx="6" fill={TEAL_LIGHT} stroke={TEAL} strokeWidth="1.5" />
      <text x="37" y="95" textAnchor="middle" fill={TEAL} fontSize="9" fontWeight="700" fontFamily="system-ui, sans-serif">Append-only</text>
      <line x1="70" y1="91" x2="90" y2="85" stroke={TEAL} strokeWidth="1.5" />
      <rect x="210" y="78" width="65" height="26" rx="6" fill={TEAL_LIGHT} stroke={TEAL} strokeWidth="1.5" />
      <text x="242" y="95" textAnchor="middle" fill={TEAL} fontSize="10" fontWeight="700" fontFamily="system-ui, sans-serif">RLS</text>
      <line x1="210" y1="91" x2="190" y2="85" stroke={TEAL} strokeWidth="1.5" />
      <text x="140" y="155" textAnchor="middle" fill={NAVY} fontSize="10" fontWeight="600" fontFamily="system-ui, sans-serif">No patient data leaves the EU</text>
    </svg>
  )
}
