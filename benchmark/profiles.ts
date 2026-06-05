import type { GoldenProfile } from './types'

export const GOLDEN_PROFILES: GoldenProfile[] = [
  {
    slug: 'magnetom-mri',
    device_name: 'MAGNETOM',
    manufacturer: 'Siemens Healthineers',
    intended_use: 'Magnetic resonance imaging system for clinical diagnostics',
    emdn_code: 'Z12030201',
    device_class: 'IIa',
    period: { from: '2025-06-05', to: '2026-06-05' },
    sources: ['bfarm', 'fda', 'mhra'],
    competitor_terms: [
      { name: 'SIGNA MRI', manufacturer: 'GE HealthCare' },
      { name: 'Ingenia MRI', manufacturer: 'Philips' },
      { name: 'Vantage MRI', manufacturer: 'Canon Medical' },
    ],
    expected: {
      must_find: [
        // Populate from Robert's manual BfArM audit — these are placeholders
        // showing the structure. Real IDs/URLs to be added after first live run.
        { source: 'bfarm', title_pattern: 'MAGNETOM', description: 'Any Siemens MRI FSN' },
        { source: 'bfarm', title_pattern: 'Siemens.*MR', description: 'Siemens MR system notice' },
        { source: 'fda', title_pattern: 'MAGNETOM', description: 'FDA MAUDE event for MAGNETOM' },
      ],
      known_noise: ['pacemaker', 'defibrillator', 'toothbrush', 'infusion pump', 'insulin pump', 'hearing aid'],
    },
  },

  {
    slug: 'infusomat-space',
    device_name: 'Infusomat Space',
    manufacturer: 'B. Braun',
    intended_use: 'Volumetric infusion pump for intravenous fluid delivery',
    device_class: 'IIb',
    period: { from: '2025-06-05', to: '2026-06-05' },
    sources: ['bfarm', 'fda', 'mhra'],
    competitor_terms: [
      { name: 'Alaris infusion pump', manufacturer: 'BD' },
      { name: 'Plum 360 infusion', manufacturer: 'ICU Medical' },
    ],
    expected: {
      must_find: [
        { source: 'bfarm', title_pattern: 'Infusomat', description: 'B. Braun infusion pump FSN' },
        { source: 'bfarm', title_pattern: 'B. Braun.*Space', description: 'B. Braun Space platform FSN' },
      ],
      known_noise: ['MRI', 'surgical robot', 'defibrillator', 'ventilator'],
    },
  },

  {
    slug: 'minimed-pump',
    device_name: 'MiniMed 780G',
    manufacturer: 'Medtronic',
    intended_use: 'Insulin pump system with automated insulin delivery',
    device_class: 'IIb',
    period: { from: '2025-06-05', to: '2026-06-05' },
    sources: ['fda', 'bfarm', 'mhra', 'swissmedic'],
    competitor_terms: [
      { name: 't:slim X2', manufacturer: 'Tandem Diabetes Care' },
      { name: 'Omnipod', manufacturer: 'Insulet' },
    ],
    expected: {
      must_find: [
        { source: 'fda', title_pattern: 'MiniMed', description: 'FDA MAUDE report for MiniMed' },
        { source: 'fda', title_pattern: 'Medtronic.*insulin', description: 'Medtronic insulin pump event' },
      ],
      known_noise: ['pacemaker', 'defibrillator', 'spinal cord stimulator', 'CRT-D'],
    },
  },

  {
    slug: 'heartstart-defibrillator',
    device_name: 'HeartStart',
    manufacturer: 'Philips',
    intended_use: 'Automated external defibrillator for cardiac emergency response',
    device_class: 'IIb',
    period: { from: '2025-06-05', to: '2026-06-05' },
    sources: ['fda', 'bfarm', 'mhra'],
    competitor_terms: [
      { name: 'LIFEPAK defibrillator', manufacturer: 'Stryker' },
      { name: 'Zoll AED', manufacturer: 'Zoll Medical' },
    ],
    expected: {
      must_find: [
        { source: 'fda', title_pattern: 'HeartStart', description: 'Philips HeartStart MAUDE report' },
        { source: 'bfarm', title_pattern: 'Philips.*defibrillat', description: 'Philips defibrillator FSN' },
      ],
      known_noise: ['MRI', 'insulin pump', 'ultrasound', 'patient monitor', 'Sonicare'],
    },
  },

  {
    slug: 'accu-chek-glucose',
    device_name: 'Accu-Chek',
    manufacturer: 'Roche Diabetes Care',
    intended_use: 'Blood glucose monitoring system for diabetes management',
    device_class: 'IIb',
    period: { from: '2025-06-05', to: '2026-06-05' },
    sources: ['fda', 'bfarm', 'swissmedic'],
    competitor_terms: [
      { name: 'FreeStyle Libre', manufacturer: 'Abbott' },
      { name: 'Contour', manufacturer: 'Ascensia' },
    ],
    expected: {
      must_find: [
        { source: 'fda', title_pattern: 'Accu-Chek', description: 'Accu-Chek MAUDE report' },
        { source: 'bfarm', title_pattern: 'Accu-Chek|Roche.*Blutzucker', description: 'BfArM glucose meter FSN' },
      ],
      known_noise: ['MRI', 'ventilator', 'surgical', 'diagnostic imaging'],
    },
  },

  {
    slug: 'da-vinci-surgical',
    device_name: 'da Vinci',
    manufacturer: 'Intuitive Surgical',
    intended_use: 'Robotic-assisted surgical system for minimally invasive procedures',
    device_class: 'IIb',
    period: { from: '2025-06-05', to: '2026-06-05' },
    sources: ['fda', 'mhra'],
    competitor_terms: [
      { name: 'Hugo surgical robot', manufacturer: 'Medtronic' },
      { name: 'Versius', manufacturer: 'CMR Surgical' },
    ],
    expected: {
      must_find: [
        { source: 'fda', title_pattern: 'da Vinci|Intuitive', description: 'da Vinci MAUDE report' },
      ],
      known_noise: ['insulin pump', 'glucose meter', 'hearing aid', 'contact lens'],
    },
  },

  {
    slug: 'cobalt-crt-d',
    device_name: 'Cobalt',
    manufacturer: 'Medtronic',
    intended_use: 'Cardiac resynchronization therapy defibrillator',
    device_class: 'III',
    period: { from: '2025-06-05', to: '2026-06-05' },
    sources: ['fda', 'bfarm', 'mhra'],
    competitor_terms: [
      { name: 'Gallant CRT-D', manufacturer: 'Boston Scientific' },
      { name: 'Platinium CRT-D', manufacturer: 'MicroPort' },
    ],
    expected: {
      must_find: [
        { source: 'fda', title_pattern: 'Cobalt|Medtronic.*CRT', description: 'Medtronic CRT-D MAUDE report' },
      ],
      known_noise: ['insulin pump', 'MiniMed', 'spinal', 'glucose'],
    },
  },

  {
    slug: 'vantage-mri',
    device_name: 'Vantage Galan',
    manufacturer: 'Canon Medical Systems',
    intended_use: 'Magnetic resonance imaging system',
    device_class: 'IIa',
    period: { from: '2025-06-05', to: '2026-06-05' },
    sources: ['fda', 'bfarm'],
    competitor_terms: [
      { name: 'MAGNETOM', manufacturer: 'Siemens Healthineers' },
      { name: 'SIGNA', manufacturer: 'GE HealthCare' },
    ],
    expected: {
      must_find: [
        { source: 'fda', title_pattern: 'Vantage|Canon.*MR', description: 'Canon MRI MAUDE report' },
      ],
      known_noise: ['CT scanner', 'X-ray', 'ultrasound', 'insulin pump'],
    },
  },

  {
    slug: 'signa-mri',
    device_name: 'SIGNA',
    manufacturer: 'GE HealthCare',
    intended_use: 'Magnetic resonance imaging system',
    device_class: 'IIa',
    period: { from: '2025-06-05', to: '2026-06-05' },
    sources: ['fda', 'bfarm', 'mhra'],
    competitor_terms: [
      { name: 'MAGNETOM', manufacturer: 'Siemens Healthineers' },
      { name: 'Ingenia', manufacturer: 'Philips' },
    ],
    expected: {
      must_find: [
        { source: 'fda', title_pattern: 'SIGNA|GE.*MR', description: 'GE MRI MAUDE report' },
      ],
      known_noise: ['CT scanner', 'ultrasound', 'insulin pump', 'ventilator'],
    },
  },

  {
    slug: 'surgical-mask-generic',
    device_name: 'Surgical Face Mask',
    manufacturer: 'Generic Masks GmbH',
    intended_use: 'Single-use surgical face mask for infection control',
    device_class: 'I',
    period: { from: '2025-06-05', to: '2026-06-05' },
    sources: ['bfarm'],
    competitor_terms: [],
    expected: {
      must_find: [],
      known_noise: ['MRI', 'defibrillator', 'insulin pump', 'surgical robot'],
    },
  },
]
