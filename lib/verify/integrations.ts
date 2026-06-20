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
  { table: 'source_fetches', columns: 'id,source,outcome,adapter_version' },
  { table: 'authority_record_revisions', columns: 'id,authority_record_id,revision_number' },
  { table: 'ingestion_runs', columns: 'id,source,status,window_from,window_to' },
  { table: 'shadow_comparisons', columns: 'id,source,agreement,created_at' },
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
    } catch {
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
