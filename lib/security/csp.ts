export function buildCspHeader(nonce: string): string {
  if (!/^[A-Za-z0-9+/]{16,64}={0,2}$/.test(nonce)) {
    throw new Error('Invalid CSP nonce format')
  }
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://js.stripe.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    [
      "connect-src 'self'",
      'https://*.supabase.co',
      'https://api.stripe.com',
    ].join(' '),
    "frame-src https://js.stripe.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "worker-src 'none'",
    "manifest-src 'self'",
    "upgrade-insecure-requests",
  ]
  return directives.join('; ')
}
