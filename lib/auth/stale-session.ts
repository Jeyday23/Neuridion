export function isStaleSessionAuthError(error: unknown): boolean {
  if (!error) return false

  const maybe = error as { code?: unknown; message?: unknown }
  const code = typeof maybe.code === 'string' ? maybe.code.toLowerCase() : ''
  const message = error instanceof Error
    ? error.message.toLowerCase()
    : typeof maybe.message === 'string'
      ? maybe.message.toLowerCase()
      : ''

  return code === 'refresh_token_not_found'
    || message.includes('invalid refresh token')
    || message.includes('refresh token not found')
}
