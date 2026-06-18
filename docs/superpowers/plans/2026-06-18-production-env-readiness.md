# Production Environment Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add static and integration production readiness gates so Neuridion catches missing, placeholder, wrong-account, and unavailable-service configuration before deployment.

**Architecture:** Put pure verification logic under `lib/verify/` so it can be unit tested without CLI side effects. Put thin executable wrappers under `scripts/` for npm commands. Keep static env verification process-only and side-effect free; keep integration verification explicit and SDK-backed with low-impact probes.

**Tech Stack:** Next.js 16.2.6, TypeScript, `tsx`, Vitest 4, Supabase JS 2.103.0, Upstash Redis 1.38.0, Stripe 22.0.1, Anthropic SDK 0.95.1.

## Global Constraints

- Render is the production deployment source of truth; `render.yaml` and env group `neuridion-env` are operationally authoritative.
- Static env verification must not initialize SDK clients or import app route handlers.
- Integration verification must not enqueue real QStash jobs or run real searches.
- Verification output must never print secret values.
- Local development should run `npm run verify:env`; integration checks require explicit production mode or production-like env detection.
- Render build should run `npm run verify:env -- --mode production && npm run build`.
- The runtime guard in `instrumentation.ts` remains as the final safety net.

---

## File Structure

- Create `lib/verify/env.ts`: env manifest, mode parsing, placeholder detection, static verification, output formatting.
- Create `lib/verify/integrations.ts`: integration check orchestration and injectable SDK-client probes.
- Create `scripts/verify-env.ts`: CLI wrapper for `verifyEnvironment`.
- Create `scripts/verify-integrations.ts`: CLI wrapper for `verifyIntegrations`.
- Create `scripts/verify-release.ts`: ordered command runner for env, integrations, lint, tests, build.
- Create `__tests__/unit/verify-env.test.ts`: static env unit tests.
- Create `__tests__/unit/verify-integrations.test.ts`: integration orchestration tests with mocked clients.
- Create `docs/DEPLOYMENT_CHECKLIST.md`: Render env and release checklist.
- Modify `package.json`: add `verify:env`, `verify:integrations`, `verify:release`.
- Modify `render.yaml`: update `buildCommand` to run static env verification before build.

---

### Task 1: Static Environment Verifier

**Files:**
- Create: `lib/verify/env.ts`
- Create: `__tests__/unit/verify-env.test.ts`

**Interfaces:**
- Produces: `verifyEnvironment(env: EnvSource, options: VerifyEnvOptions): EnvVerificationResult`
- Produces: `formatEnvVerification(result: EnvVerificationResult): string`
- Consumes: no app modules, no SDK clients.

- [ ] **Step 1: Write failing tests for static env success and failures**

Create `__tests__/unit/verify-env.test.ts` with:

```ts
import { describe, expect, it } from 'vitest'
import { verifyEnvironment, formatEnvVerification, type EnvSource } from '@/lib/verify/env'

const validProductionEnv: EnvSource = {
  NODE_ENV: 'production',
  NEXT_PUBLIC_SUPABASE_URL: 'https://neuridion.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-real',
  SUPABASE_SERVICE_ROLE_KEY: 'service-real',
  ANTHROPIC_API_KEY: 'sk-ant-real',
  AUDIT_HMAC_KEY: 'a'.repeat(64),
  UPSTASH_REDIS_REST_URL: 'https://redis.upstash.io',
  UPSTASH_REDIS_REST_TOKEN: 'redis-token',
  QSTASH_TOKEN: 'qstash-token',
  QSTASH_CURRENT_SIGNING_KEY: 'current-signing-key',
  QSTASH_NEXT_SIGNING_KEY: 'next-signing-key',
  WORKER_API_SECRET: 'b'.repeat(64),
  NEXT_PUBLIC_SITE_URL: 'https://neuridion.eu',
  STRIPE_SECRET_KEY: 'sk_live_real',
  STRIPE_WEBHOOK_SECRET: 'whsec_real',
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_live_real',
  STRIPE_PRICE_STARTER: 'price_starter',
  STRIPE_PRICE_PRO: 'price_pro',
  STRIPE_PRICE_ENTERPRISE: 'price_enterprise',
  NEXT_PUBLIC_STRIPE_PRICE_STARTER: 'price_starter',
  NEXT_PUBLIC_STRIPE_PRICE_PRO: 'price_pro',
}

describe('verifyEnvironment', () => {
  it('passes with all required production variables', () => {
    const result = verifyEnvironment(validProductionEnv, { mode: 'production' })
    expect(result.ok).toBe(true)
    expect(result.missingRequired).toEqual([])
    expect(result.placeholderRequired).toEqual([])
    expect(result.forbiddenPresent).toEqual([])
  })

  it('fails when a required variable is missing', () => {
    const { AUDIT_HMAC_KEY, ...env } = validProductionEnv
    const result = verifyEnvironment(env, { mode: 'production' })
    expect(result.ok).toBe(false)
    expect(result.missingRequired).toContainEqual(expect.objectContaining({ name: 'AUDIT_HMAC_KEY' }))
  })

  it('fails on placeholders without leaking the value', () => {
    const result = verifyEnvironment(
      { ...validProductionEnv, ANTHROPIC_API_KEY: 'sk-ant-REPLACE_ME' },
      { mode: 'production' },
    )
    expect(result.ok).toBe(false)
    expect(result.placeholderRequired).toContainEqual(expect.objectContaining({ name: 'ANTHROPIC_API_KEY' }))
    expect(formatEnvVerification(result)).not.toContain('sk-ant-REPLACE_ME')
  })

  it('does not reject a legitimate hostname containing example', () => {
    const result = verifyEnvironment(
      { ...validProductionEnv, NEXT_PUBLIC_SITE_URL: 'https://example-healthcare.com' },
      { mode: 'production' },
    )
    expect(result.ok).toBe(true)
  })

  it('fails when forbidden production flags are set', () => {
    const result = verifyEnvironment(
      { ...validProductionEnv, ENABLE_DEV_WORKER_BYPASS: 'true' },
      { mode: 'production' },
    )
    expect(result.ok).toBe(false)
    expect(result.forbiddenPresent).toContainEqual(expect.objectContaining({ name: 'ENABLE_DEV_WORKER_BYPASS' }))
  })

  it('warns but does not fail when recommended variables are missing', () => {
    const result = verifyEnvironment(validProductionEnv, { mode: 'production' })
    expect(result.ok).toBe(true)
    expect(result.missingRecommended.map((item) => item.name)).toEqual(expect.arrayContaining(['RESEND_API_KEY']))
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npx vitest run __tests__/unit/verify-env.test.ts
```

Expected: fails because `@/lib/verify/env` does not exist.

- [ ] **Step 3: Implement `lib/verify/env.ts`**

Create `lib/verify/env.ts` with:

```ts
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
```

- [ ] **Step 4: Run static env tests**

Run:

```bash
npx vitest run __tests__/unit/verify-env.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit Task 1**

```bash
git add lib/verify/env.ts __tests__/unit/verify-env.test.ts
git commit -m "feat: add static production env verifier"
```

---

### Task 2: Integration Verification Core

**Files:**
- Create: `lib/verify/integrations.ts`
- Create: `__tests__/unit/verify-integrations.test.ts`

**Interfaces:**
- Consumes: `EnvSource` from `lib/verify/env.ts`
- Produces: `verifyIntegrations(env: EnvSource, clients?: IntegrationClients): Promise<IntegrationVerificationResult>`
- Produces: `formatIntegrationVerification(result: IntegrationVerificationResult): string`

- [ ] **Step 1: Write failing integration orchestration tests**

Create `__tests__/unit/verify-integrations.test.ts` with dependency injection to avoid real network calls:

```ts
import { describe, expect, it, vi } from 'vitest'
import {
  verifyIntegrations,
  formatIntegrationVerification,
  type IntegrationClients,
} from '@/lib/verify/integrations'

const env = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://neuridion.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  UPSTASH_REDIS_REST_URL: 'https://redis.upstash.io',
  UPSTASH_REDIS_REST_TOKEN: 'redis-token',
  STRIPE_SECRET_KEY: 'sk_live_real',
  STRIPE_PRICE_STARTER: 'price_starter',
  STRIPE_PRICE_PRO: 'price_pro',
  STRIPE_PRICE_ENTERPRISE: 'price_enterprise',
  NEXT_PUBLIC_STRIPE_PRICE_STARTER: 'price_starter',
  NEXT_PUBLIC_STRIPE_PRICE_PRO: 'price_pro',
  ANTHROPIC_API_KEY: 'sk-ant-real',
  QSTASH_TOKEN: 'qstash-token',
  QSTASH_CURRENT_SIGNING_KEY: 'current',
  QSTASH_NEXT_SIGNING_KEY: 'next',
  WORKER_API_SECRET: 'x'.repeat(64),
}

function passingClients(): IntegrationClients {
  return {
    supabase: {
      queryTable: vi.fn(() => Promise.resolve({ ok: true })),
    },
    redis: {
      probe: vi.fn(() => Promise.resolve({ ok: true })),
    },
    stripe: {
      retrievePrice: vi.fn(() => Promise.resolve({ id: 'price_starter', active: true, recurring: { interval: 'month' } })),
    },
    anthropic: {
      probe: vi.fn(() => Promise.resolve({ ok: true })),
    },
  }
}

describe('verifyIntegrations', () => {
  it('passes when all integration probes pass', async () => {
    const result = await verifyIntegrations(env, passingClients())
    expect(result.ok).toBe(true)
    expect(result.checks.every((check) => check.status === 'passed')).toBe(true)
  })

  it('reports database schema failures without leaking credentials', async () => {
    const clients = passingClients()
    clients.supabase.queryTable = vi.fn((table: string) =>
      table === 'search_runs'
        ? Promise.resolve({ ok: false, reason: 'relation does not exist' })
        : Promise.resolve({ ok: true }),
    )
    const result = await verifyIntegrations(env, clients)
    expect(result.ok).toBe(false)
    expect(formatIntegrationVerification(result)).toContain('search_runs sentinel query failed')
    expect(formatIntegrationVerification(result)).not.toContain('service-key')
  })

  it('reports Redis probe failures', async () => {
    const clients = passingClients()
    clients.redis.probe = vi.fn(() => Promise.resolve({ ok: false, reason: 'unauthorized' }))
    const result = await verifyIntegrations(env, clients)
    expect(result.ok).toBe(false)
    expect(formatIntegrationVerification(result)).toContain('Redis')
  })

  it('reports Stripe public/server price mismatch', async () => {
    const result = await verifyIntegrations(
      { ...env, NEXT_PUBLIC_STRIPE_PRICE_STARTER: 'price_wrong' },
      passingClients(),
    )
    expect(result.ok).toBe(false)
    expect(formatIntegrationVerification(result)).toContain('NEXT_PUBLIC_STRIPE_PRICE_STARTER')
  })

  it('reports inactive Stripe prices', async () => {
    const clients = passingClients()
    clients.stripe.retrievePrice = vi.fn(() => Promise.resolve({ id: 'price_starter', active: false, recurring: { interval: 'month' } }))
    const result = await verifyIntegrations(env, clients)
    expect(result.ok).toBe(false)
    expect(formatIntegrationVerification(result)).toContain('not an active recurring price')
  })

  it('reports Anthropic authentication failure and aggregates multiple failures', async () => {
    const clients = passingClients()
    clients.anthropic.probe = vi.fn(() => Promise.resolve({ ok: false, reason: 'invalid API key' }))
    clients.redis.probe = vi.fn(() => Promise.resolve({ ok: false, reason: 'unauthorized' }))
    const result = await verifyIntegrations(env, clients)
    expect(result.ok).toBe(false)
    expect(result.checks.filter((check) => check.status === 'failed')).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npx vitest run __tests__/unit/verify-integrations.test.ts
```

Expected: fails because `@/lib/verify/integrations` does not exist.

- [ ] **Step 3: Implement `lib/verify/integrations.ts`**

Create `lib/verify/integrations.ts` with these exported types and functions:

```ts
import Anthropic from '@anthropic-ai/sdk'
import Stripe from 'stripe'
import { Redis } from '@upstash/redis'
import { createClient } from '@supabase/supabase-js'
import type { EnvSource } from './env'

type ProbeResult = { ok: true } | { ok: false; reason: string }

export type IntegrationCheck = {
  name: 'Supabase' | 'Database schema' | 'Redis' | 'Stripe' | 'Anthropic' | 'Worker/QStash config'
  status: 'passed' | 'failed'
  message: string
}

export type IntegrationVerificationResult = {
  ok: boolean
  checks: IntegrationCheck[]
}

export type IntegrationClients = {
  supabase: { queryTable(table: string, columns: string): Promise<ProbeResult> }
  redis: { probe(): Promise<ProbeResult> }
  stripe: { retrievePrice(priceId: string): Promise<{ id: string; active?: boolean; recurring?: unknown }> }
  anthropic: { probe(): Promise<ProbeResult> }
}

const TABLE_SENTINELS: Array<{ table: string; columns: string }> = [
  { table: 'users', columns: 'id,email,plan' },
  { table: 'profiles', columns: 'id,user_id,manufacturer,device_name' },
  { table: 'search_runs', columns: 'id,user_id,status,created_at' },
  { table: 'fsn_results', columns: 'id,source_db,title' },
  { table: 'filter_decisions', columns: 'id,decision,model_used' },
  { table: 'filter_decision_cache', columns: 'fsn_external_id,profile_fingerprint,decision' },
  { table: 'reports', columns: 'id,user_id,search_run_id' },
  { table: 'search_drafts', columns: 'id,user_id' },
]

function pass(name: IntegrationCheck['name'], message = 'passed'): IntegrationCheck {
  return { name, status: 'passed', message }
}

function fail(name: IntegrationCheck['name'], message: string): IntegrationCheck {
  return { name, status: 'failed', message }
}

export async function createDefaultIntegrationClients(env: EnvSource): Promise<IntegrationClients> {
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const redis = new Redis({ url: env.UPSTASH_REDIS_REST_URL!, token: env.UPSTASH_REDIS_REST_TOKEN! })
  const stripe = new Stripe(env.STRIPE_SECRET_KEY!, { apiVersion: '2026-03-25.dahlia', typescript: true })
  const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY! })

  return {
    supabase: {
      async queryTable(table, columns) {
        const { error } = await supabase.from(table).select(columns).limit(1)
        return error ? { ok: false, reason: error.message } : { ok: true }
      },
    },
    redis: {
      async probe() {
        const key = `verify:integrations:${Date.now()}`
        try {
          await redis.set(key, '1', { ex: 60 })
          const value = await redis.get(key)
          await redis.del(key)
          return value === '1' || value === 1 ? { ok: true } : { ok: false, reason: 'probe value mismatch' }
        } catch (err) {
          return { ok: false, reason: err instanceof Error ? err.message : 'Redis probe failed' }
        }
      },
    },
    stripe: {
      retrievePrice(priceId) {
        return stripe.prices.retrieve(priceId)
      },
    },
    anthropic: {
      async probe() {
        try {
          if (typeof anthropic.messages.countTokens === 'function') {
            await anthropic.messages.countTokens({ model: 'claude-3-5-sonnet-20241022', messages: [] })
          } else {
            await anthropic.models.list()
          }
          return { ok: true }
        } catch (err) {
          return { ok: false, reason: err instanceof Error ? err.message : 'Anthropic probe failed' }
        }
      },
    },
  }
}

export async function verifyIntegrations(
  env: EnvSource,
  clients?: IntegrationClients,
): Promise<IntegrationVerificationResult> {
  const activeClients = clients ?? await createDefaultIntegrationClients(env)
  const checks: IntegrationCheck[] = []

  const schemaFailures: string[] = []
  for (const sentinel of TABLE_SENTINELS) {
    const result = await activeClients.supabase.queryTable(sentinel.table, sentinel.columns)
    if (!result.ok) schemaFailures.push(`${sentinel.table} sentinel query failed`)
  }
  checks.push(schemaFailures.length === 0
    ? pass('Database schema')
    : fail('Database schema', schemaFailures.join('; ')))
  checks.push(schemaFailures.length === 0 ? pass('Supabase') : fail('Supabase', 'service-role query failed'))

  const redisResult = await activeClients.redis.probe()
  checks.push(redisResult.ok ? pass('Redis') : fail('Redis', sanitizeReason(redisResult.reason)))

  checks.push(await verifyStripe(env, activeClients))

  const anthropicResult = await activeClients.anthropic.probe()
  checks.push(anthropicResult.ok ? pass('Anthropic') : fail('Anthropic', sanitizeReason(anthropicResult.reason)))

  checks.push(verifyWorkerConfig(env))

  return { ok: checks.every((check) => check.status === 'passed'), checks }
}

async function verifyStripe(env: EnvSource, clients: IntegrationClients): Promise<IntegrationCheck> {
  if (env.NEXT_PUBLIC_STRIPE_PRICE_STARTER !== env.STRIPE_PRICE_STARTER) {
    return fail('Stripe', 'NEXT_PUBLIC_STRIPE_PRICE_STARTER does not match STRIPE_PRICE_STARTER')
  }
  if (env.NEXT_PUBLIC_STRIPE_PRICE_PRO !== env.STRIPE_PRICE_PRO) {
    return fail('Stripe', 'NEXT_PUBLIC_STRIPE_PRICE_PRO does not match STRIPE_PRICE_PRO')
  }
  const ids = [env.STRIPE_PRICE_STARTER, env.STRIPE_PRICE_PRO, env.STRIPE_PRICE_ENTERPRISE].filter((id): id is string => Boolean(id))
  for (const id of ids) {
    try {
      const price = await clients.stripe.retrievePrice(id)
      if (!price.active || !price.recurring) return fail('Stripe', `${idName(env, id)} is not an active recurring price`)
    } catch (err) {
      return fail('Stripe', `${idName(env, id)} is not retrievable`)
    }
  }
  return pass('Stripe')
}

function verifyWorkerConfig(env: EnvSource): IntegrationCheck {
  const missing = ['QSTASH_TOKEN', 'QSTASH_CURRENT_SIGNING_KEY', 'QSTASH_NEXT_SIGNING_KEY', 'WORKER_API_SECRET']
    .filter((name) => !env[name])
  if (missing.length > 0) return fail('Worker/QStash config', `${missing.join(', ')} missing`)
  if ((env.WORKER_API_SECRET?.length ?? 0) < 32) return fail('Worker/QStash config', 'WORKER_API_SECRET must be at least 32 characters')
  return pass('Worker/QStash config')
}

function idName(env: EnvSource, id: string): string {
  return Object.entries(env).find(([, value]) => value === id)?.[0] ?? 'Stripe price'
}

function sanitizeReason(reason: string): string {
  return reason.replace(/sk_[a-z]+_[A-Za-z0-9]+/g, '[redacted]').replace(/eyJ[A-Za-z0-9._-]+/g, '[redacted]')
}

export function formatIntegrationVerification(result: IntegrationVerificationResult): string {
  const lines = [result.ok ? 'Integration verification passed for production.' : 'Integration verification failed for production.']
  for (const check of result.checks) {
    lines.push(`${check.name}: ${check.status === 'passed' ? 'passed' : `failed - ${check.message}`}`)
  }
  return `${lines.join('\n')}\n`
}
```

- [ ] **Step 4: Run integration unit tests**

Run:

```bash
npx vitest run __tests__/unit/verify-integrations.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit Task 2**

```bash
git add lib/verify/integrations.ts __tests__/unit/verify-integrations.test.ts
git commit -m "feat: add production integration verifier"
```

---

### Task 3: CLI Commands And Release Runner

**Files:**
- Create: `scripts/verify-env.ts`
- Create: `scripts/verify-integrations.ts`
- Create: `scripts/verify-release.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `verifyEnvironment`, `verifyIntegrations`
- Produces npm scripts: `verify:env`, `verify:integrations`, `verify:release`

- [ ] **Step 1: Add CLI argument parsing pattern**

Implement the same small parser in both verifier scripts:

```ts
function parseArgs(argv: string[]): { mode?: 'development' | 'production'; strictRecommended: boolean } {
  const modeIndex = argv.indexOf('--mode')
  const mode = modeIndex >= 0 ? argv[modeIndex + 1] : undefined
  if (mode !== undefined && mode !== 'development' && mode !== 'production') {
    throw new Error('--mode must be development or production')
  }
  return { mode, strictRecommended: argv.includes('--strict-recommended') }
}
```

- [ ] **Step 2: Create `scripts/verify-env.ts`**

```ts
import { formatEnvVerification, verifyEnvironment } from '@/lib/verify/env'

function parseArgs(argv: string[]): { mode?: 'development' | 'production'; strictRecommended: boolean } {
  const modeIndex = argv.indexOf('--mode')
  const mode = modeIndex >= 0 ? argv[modeIndex + 1] : undefined
  if (mode !== undefined && mode !== 'development' && mode !== 'production') {
    throw new Error('--mode must be development or production')
  }
  return { mode, strictRecommended: argv.includes('--strict-recommended') }
}

try {
  const options = parseArgs(process.argv.slice(2))
  const result = verifyEnvironment(process.env, options)
  process.stdout.write(formatEnvVerification(result))
  process.exit(result.ok ? 0 : 1)
} catch (err) {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
}
```

- [ ] **Step 3: Create `scripts/verify-integrations.ts`**

```ts
import { verifyEnvironment } from '@/lib/verify/env'
import { formatIntegrationVerification, verifyIntegrations } from '@/lib/verify/integrations'

function parseArgs(argv: string[]): { mode?: 'development' | 'production' } {
  const modeIndex = argv.indexOf('--mode')
  const mode = modeIndex >= 0 ? argv[modeIndex + 1] : undefined
  if (mode !== undefined && mode !== 'development' && mode !== 'production') {
    throw new Error('--mode must be development or production')
  }
  return { mode }
}

try {
  const { mode } = parseArgs(process.argv.slice(2))
  const envResult = verifyEnvironment(process.env, { mode })
  if (envResult.mode !== 'production') {
    process.stderr.write('Integration verification requires --mode production or production-like environment.\n')
    process.exit(1)
  }
  if (!envResult.ok) {
    process.stderr.write('Static environment verification must pass before integration verification.\n')
    process.exit(1)
  }
  const result = await verifyIntegrations(process.env)
  process.stdout.write(formatIntegrationVerification(result))
  process.exit(result.ok ? 0 : 1)
} catch (err) {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
}
```

- [ ] **Step 4: Create `scripts/verify-release.ts`**

```ts
import { spawnSync } from 'child_process'

const steps = [
  ['npm', ['run', 'verify:env', '--', '--mode', 'production']],
  ['npm', ['run', 'verify:integrations', '--', '--mode', 'production']],
  ['npm', ['run', 'lint']],
  ['npx', ['vitest', 'run']],
  ['npm', ['run', 'build']],
] as const

for (const [cmd, args] of steps) {
  process.stdout.write(`\n==> ${cmd} ${args.join(' ')}\n`)
  const result = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' })
  if (result.status !== 0) {
    process.stderr.write(`Release verification failed at: ${cmd} ${args.join(' ')}\n`)
    process.exit(result.status ?? 1)
  }
}

process.stdout.write('\nRelease verification passed.\n')
```

- [ ] **Step 5: Update `package.json` scripts**

Add:

```json
"verify:env": "tsx scripts/verify-env.ts",
"verify:integrations": "tsx scripts/verify-integrations.ts",
"verify:release": "tsx scripts/verify-release.ts"
```

- [ ] **Step 6: Run CLI smoke checks**

Run:

```bash
npm run verify:env
npm run verify:env -- --mode production
npm run verify:integrations
```

Expected:

- `npm run verify:env` exits 0 in development mode.
- `npm run verify:env -- --mode production` exits 1 locally if production secrets are missing.
- `npm run verify:integrations` exits 1 locally with the explicit production-mode requirement.

- [ ] **Step 7: Commit Task 3**

```bash
git add scripts/verify-env.ts scripts/verify-integrations.ts scripts/verify-release.ts package.json
git commit -m "feat: add production verification commands"
```

---

### Task 4: Render Checklist And Build Gate

**Files:**
- Create: `docs/DEPLOYMENT_CHECKLIST.md`
- Modify: `render.yaml`

**Interfaces:**
- Consumes npm scripts from Task 3.
- Produces documented Render deployment process.

- [ ] **Step 1: Create `docs/DEPLOYMENT_CHECKLIST.md`**

Write:

````md
# Neuridion Deployment Checklist

## Render Service

- Service: `neuridion-web`
- Runtime: Node
- Build command: `npm install && npm run verify:env -- --mode production && npm run build`
- Start command: `npm start`
- Env group: `neuridion-env`

## Required Production Env

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY`
- `AUDIT_HMAC_KEY`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `QSTASH_TOKEN`
- `QSTASH_CURRENT_SIGNING_KEY`
- `QSTASH_NEXT_SIGNING_KEY`
- `WORKER_API_SECRET`
- `NEXT_PUBLIC_SITE_URL`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_PRICE_STARTER`
- `STRIPE_PRICE_PRO`
- `STRIPE_PRICE_ENTERPRISE`
- `NEXT_PUBLIC_STRIPE_PRICE_STARTER`
- `NEXT_PUBLIC_STRIPE_PRICE_PRO`

## Secret Generation

Generate these with:

```bash
openssl rand -hex 32
```

- `AUDIT_HMAC_KEY`
- `WORKER_API_SECRET`

## Pre-Deploy Verification

Run with production env loaded:

```bash
npm run verify:env -- --mode production
npm run verify:integrations -- --mode production
npm run verify:release
```

## Post-Deploy Smoke Checks

Call these endpoints after deployment:

- `/`
- `/api/worker/health` with `x-worker-secret`
- `/api/worker/scraper-health` with `x-worker-secret`

## Notes

Integration verification checks connectivity and sentinel schema access. It does not replace applying Supabase migrations before deploy.
````

- [ ] **Step 2: Update `render.yaml`**

Change:

```yaml
buildCommand: npm install && npm run build
```

To:

```yaml
buildCommand: npm install && npm run verify:env -- --mode production && npm run build
```

- [ ] **Step 3: Commit Task 4**

```bash
git add docs/DEPLOYMENT_CHECKLIST.md render.yaml
git commit -m "docs: add Render deployment readiness checklist"
```

---

### Task 5: Final Verification

**Files:**
- Verify all files from Tasks 1-4.

**Interfaces:**
- Consumes all new commands and tests.
- Produces final release-readiness evidence for this slice.

- [ ] **Step 1: Run focused tests**

```bash
npx vitest run __tests__/unit/verify-env.test.ts __tests__/unit/verify-integrations.test.ts
```

Expected: both files pass.

- [ ] **Step 2: Run all tests**

```bash
npx vitest run
```

Expected: existing suite passes.

- [ ] **Step 3: Run lint**

```bash
npm run lint
```

Expected: 0 errors. Existing warnings may remain.

- [ ] **Step 4: Run production build**

```bash
npm run build
```

Expected: build exits 0. If local production secrets are absent, build may still show existing audit warnings; `npm run verify:env -- --mode production` is the explicit secret gate.

- [ ] **Step 5: Run command behavior checks**

```bash
npm run verify:env
npm run verify:env -- --mode production
npm run verify:integrations
```

Expected:

- Development static check exits 0.
- Production static check exits 1 locally when production secrets are not loaded.
- Integration check exits 1 locally unless production mode and valid production env are present.

- [ ] **Step 6: Commit any final fixes**

If final verification required fixes:

```bash
git add lib/verify/env.ts lib/verify/integrations.ts scripts/verify-env.ts scripts/verify-integrations.ts scripts/verify-release.ts __tests__/unit/verify-env.test.ts __tests__/unit/verify-integrations.test.ts docs/DEPLOYMENT_CHECKLIST.md package.json render.yaml
git commit -m "fix: stabilize production readiness verification"
```

If no fixes were required, do not create an empty commit.
