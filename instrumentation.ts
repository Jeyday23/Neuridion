const REQUIRED_SECRETS = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'ANTHROPIC_API_KEY',
  'AUDIT_HMAC_KEY',
] as const

const RECOMMENDED_SECRETS = [
  'RESEND_API_KEY',
  'WORKER_API_SECRET',
] as const

export async function register() {
  // AUDIT_HMAC_KEY is required in all non-development environments (staging, preview, production)
  // to ensure audit trail PII hashing is always active outside local dev.
  if (process.env.NODE_ENV !== 'development' && !process.env.AUDIT_HMAC_KEY?.trim()) {
    console.error(
      '[SECURITY] AUDIT_HMAC_KEY is required in non-development environments for audit trail PII hashing',
    )
    throw new Error(
      'Missing AUDIT_HMAC_KEY — required in non-development environments for audit trail PII hashing',
    )
  }

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

  if (process.env.ENABLE_DEV_WORKER_BYPASS) {
    console.error(
      '[SECURITY] ENABLE_DEV_WORKER_BYPASS is set in production — this env var must be removed. Bypass is disabled but its presence indicates a misconfiguration.',
    )
  }
}
