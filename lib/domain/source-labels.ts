export const SOURCE_LABELS: Record<string, string> = {
  bfarm:      'BfArM',
  maude:      'FDA MAUDE',
  fda:        'FDA MAUDE',
  mhra:       'MHRA',
  swissmedic: 'Swissmedic',
}

export function fmtSourceDb(src: string | null | undefined): string {
  if (!src) return 'BfArM'
  return SOURCE_LABELS[src.toLowerCase()] ?? src.toUpperCase()
}
