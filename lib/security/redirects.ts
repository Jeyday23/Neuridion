const DEFAULT_REDIRECT_PATH = '/dashboard/search'

export function safeInternalRedirectPath(
  value: string | null | undefined,
  fallback = DEFAULT_REDIRECT_PATH,
): string {
  if (!value) return fallback
  if (!value.startsWith('/') || value.startsWith('//')) return fallback
  if (value.includes('\\') || /[\u0000-\u001f\u007f]/.test(value)) return fallback

  return value
}

