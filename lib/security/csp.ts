export function buildCspHeader(nonce: string): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' https://js.stripe.com`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' data:",
    "font-src 'self' data:",
    [
      "connect-src 'self'",
      'https://*.supabase.co',
      'https://api.stripe.com',
      'https://api.anthropic.com',
      'https://api.pdfshift.io',
      'https://api.resend.com',
      'https://api.firecrawl.dev',
      'https://fsca.swissmedic.ch',
      'https://api.fda.gov',
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
