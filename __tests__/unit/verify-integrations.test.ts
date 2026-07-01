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
      queryTable: vi.fn(() => Promise.resolve({ ok: true } as const)),
    },
    redis: {
      probe: vi.fn(() => Promise.resolve({ ok: true } as const)),
    },
    stripe: {
      retrievePrice: vi.fn(() => Promise.resolve({ id: 'price_starter', active: true, recurring: { interval: 'month' } })),
    },
    anthropic: {
      probe: vi.fn(() => Promise.resolve({ ok: true } as const)),
    },
  }
}

describe('verifyIntegrations', () => {
  it('passes when all integration probes pass', async () => {
    const clients = passingClients()
    const result = await verifyIntegrations(env, clients)

    expect(result.ok).toBe(true)
    expect(result.checks.every((check) => check.status === 'passed')).toBe(true)
    expect(clients.supabase.queryTable).toHaveBeenCalledWith(
      'fsn_results', 'id,source_db,title,authority_revision_id',
    )
    expect(clients.supabase.queryTable).toHaveBeenCalledWith(
      'filter_decisions', 'id,decision,model_used,authority_revision_id,evidence_parser_version',
    )
  })

  it('reports database schema failures without leaking credentials', async () => {
    const clients = passingClients()
    clients.supabase.queryTable = vi.fn((table: string) =>
      table === 'search_runs'
        ? Promise.resolve({ ok: false, reason: 'relation does not exist' } as const)
        : Promise.resolve({ ok: true } as const),
    )

    const result = await verifyIntegrations(env, clients)
    const output = formatIntegrationVerification(result)

    expect(result.ok).toBe(false)
    expect(output).toContain('search_runs sentinel query failed')
    expect(output).not.toContain('service-key')
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

  it('skips Stripe checks for the PRRC/search profile', async () => {
    const clients = passingClients()
    const result = await verifyIntegrations(
      { ...env, NEXT_PUBLIC_STRIPE_PRICE_STARTER: 'price_wrong' },
      clients,
      { profile: 'prrc' },
    )

    expect(result.ok).toBe(true)
    expect(clients.stripe.retrievePrice).not.toHaveBeenCalled()
    expect(formatIntegrationVerification(result)).toContain('skipped for PRRC/search profile')
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
