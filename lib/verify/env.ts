export type VerifyMode = 'development' | 'production'
export type EnvSource = Record<string, string | undefined>

export type EnvIssue = {
  name: string
  message: string
}

export type VerifyEnvOptions = {
  mode?: VerifyMode
  strictRecommended?: boolean
}

export type EnvVerificationResult = {
  mode: VerifyMode
  ok: boolean
  checkedRequired: number
  checkedRecommended: number
  checkedForbidden: number
  missingRequired: EnvIssue[]
  placeholderRequired: EnvIssue[]
  forbiddenPresent: EnvIssue[]
  missingRecommended: EnvIssue[]
}

const REQUIRED_PRODUCTION = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ANTHROPIC_API_KEY',
  'AUDIT_HMAC_KEY',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'QSTASH_TOKEN',
  'QSTASH_CURRENT_SIGNING_KEY',
  'QSTASH_NEXT_SIGNING_KEY',
  'WORKER_API_SECRET',
  'NEXT_PUBLIC_SITE_URL',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
] as const

const BILLING_REQUIRED = [
  'STRIPE_PRICE_STARTER',
  'STRIPE_PRICE_PRO',
  'STRIPE_PRICE_ENTERPRISE',
  'NEXT_PUBLIC_STRIPE_PRICE_STARTER',
  'NEXT_PUBLIC_STRIPE_PRICE_PRO',
] as const

const RECOMMENDED_PRODUCTION = [
  'RESEND_API_KEY',
  'RESEND_FROM_ADDRESS',
  'SECURITY_ALERT_EMAIL',
  'OPENFDA_API_KEY',
  'FIRECRAWL_API_KEY',
  'PDFSHIFT_API_KEY',
] as const

const FORBIDDEN_PRODUCTION = [
  'ENABLE_DEV_WORKER_BYPASS',
  'SKIP_AI_FILTER',
] as const

function inferMode(env: EnvSource, explicit?: VerifyMode): VerifyMode {
  if (explicit) return explicit
  if (env.NODE_ENV === 'production' || env.RENDER === 'true' || env.RENDER_SERVICE_ID) return 'production'
  return 'development'
}

function isBlank(value: string | undefined): boolean {
  return !value || value.trim().length === 0
}

function isPlaceholder(name: string, value: string | undefined, mode: VerifyMode): boolean {
  if (isBlank(value)) return false
  const v = value!.trim()
  if (v.includes('REPLACE_ME')) return true
  if (v.startsWith('your-')) return true
  if (name === 'NEXT_PUBLIC_SITE_URL') {
    if (mode === 'production' && v.includes('localhost')) return true
    if (mode === 'production' && !v.startsWith('https://')) return true
  }
  if (mode === 'production' && name === 'STRIPE_SECRET_KEY' && v.startsWith('sk_test_')) return true
  if (mode === 'production' && name === 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY' && v.startsWith('pk_test_')) return true
  return false
}

function issue(name: string, message: string): EnvIssue {
  return { name, message }
}

export function verifyEnvironment(env: EnvSource, options: VerifyEnvOptions = {}): EnvVerificationResult {
  const mode = inferMode(env, options.mode)
  const required = mode === 'production'
    ? [...REQUIRED_PRODUCTION, ...BILLING_REQUIRED]
    : []
  const recommended = mode === 'production' ? [...RECOMMENDED_PRODUCTION] : []
  const forbidden = mode === 'production' ? [...FORBIDDEN_PRODUCTION] : []

  const missingRequired = required
    .filter((name) => isBlank(env[name]))
    .map((name) => issue(name, remediationFor(name)))

  const placeholderRequired = required
    .filter((name) => !isBlank(env[name]) && isPlaceholder(name, env[name], mode))
    .map((name) => issue(name, remediationFor(name)))

  const forbiddenPresent = forbidden
    .filter((name) => !isBlank(env[name]))
    .map((name) => issue(name, 'remove this from production'))

  const missingRecommended = recommended
    .filter((name) => isBlank(env[name]))
    .map((name) => issue(name, 'recommended for production feature completeness'))

  const ok = missingRequired.length === 0
    && placeholderRequired.length === 0
    && forbiddenPresent.length === 0
    && (!options.strictRecommended || missingRecommended.length === 0)

  return {
    mode,
    ok,
    checkedRequired: required.length,
    checkedRecommended: recommended.length,
    checkedForbidden: forbidden.length,
    missingRequired,
    placeholderRequired,
    forbiddenPresent,
    missingRecommended,
  }
}

function remediationFor(name: string): string {
  if (name === 'AUDIT_HMAC_KEY' || name === 'WORKER_API_SECRET') return 'generate with `openssl rand -hex 32`'
  if (name === 'NEXT_PUBLIC_SITE_URL') return 'must be the deployed HTTPS origin'
  return 'set a production value'
}

function renderIssues(title: string, issues: EnvIssue[]): string[] {
  if (issues.length === 0) return []
  return [title, ...issues.map((item) => `- ${item.name}: ${item.message}`)]
}

export function formatEnvVerification(result: EnvVerificationResult): string {
  const lines: string[] = []
  if (result.ok) {
    lines.push(`Environment verification passed for ${result.mode}.`)
  } else {
    lines.push(`Environment verification failed for ${result.mode}.`)
  }
  lines.push(`Required: ${result.checkedRequired} checked`)
  lines.push(`Recommended: ${result.checkedRecommended} checked, ${result.missingRecommended.length} missing`)
  lines.push(`Forbidden: ${result.checkedForbidden} checked`)
  lines.push(...renderIssues('Missing required:', result.missingRequired))
  lines.push(...renderIssues('Placeholder required:', result.placeholderRequired))
  lines.push(...renderIssues('Forbidden:', result.forbiddenPresent))
  if (result.missingRecommended.length > 0) {
    lines.push(...renderIssues('Recommended missing:', result.missingRecommended))
  }
  return `${lines.join('\n')}\n`
}
