const REQUIRED_SECRETS = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'ANTHROPIC_API_KEY',
] as const

const RECOMMENDED_SECRETS = [
  'AUDIT_HMAC_KEY',
  'RESEND_API_KEY',
] as const

export async function register() {
  if (process.env.NODE_ENV !== 'production') return

  const missing = REQUIRED_SECRETS.filter((k) => !process.env[k]?.trim())
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables in production: ${missing.join(', ')}`,
    )
  }

  const warned = RECOMMENDED_SECRETS.filter((k) => !process.env[k]?.trim())
  if (warned.length > 0) {
    console.warn(
      `[instrumentation] Missing recommended env vars (features degraded): ${warned.join(', ')}`,
    )
  }
}
