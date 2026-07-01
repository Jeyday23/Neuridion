import { describe, expect, it } from 'vitest'
import { verifyEnvironment, formatEnvVerification, type EnvSource } from '@/lib/verify/env'

const validProductionEnv: EnvSource = {
  NODE_ENV: 'production',
  NEXT_PUBLIC_SUPABASE_URL: 'https://neuridion.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-real',
  SUPABASE_SERVICE_ROLE_KEY: 'service-real',
  ANTHROPIC_API_KEY: 'sk-ant-real',
  OPENFDA_API_KEY: 'openfda-real',
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
    const env = { ...validProductionEnv, AUDIT_HMAC_KEY: undefined }
    const result = verifyEnvironment(env, { mode: 'production' })

    expect(result.ok).toBe(false)
    expect(result.missingRequired).toContainEqual(expect.objectContaining({ name: 'AUDIT_HMAC_KEY' }))
  })

  it('requires an openFDA API key for production completeness', () => {
    const result = verifyEnvironment(
      { ...validProductionEnv, OPENFDA_API_KEY: undefined },
      { mode: 'production' },
    )

    expect(result.ok).toBe(false)
    expect(result.missingRequired).toContainEqual(expect.objectContaining({ name: 'OPENFDA_API_KEY' }))
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

  it('keeps billing keys required for the full production profile', () => {
    const result = verifyEnvironment(
      {
        ...validProductionEnv,
        STRIPE_SECRET_KEY: undefined,
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: undefined,
      },
      { mode: 'production', profile: 'full' },
    )

    expect(result.ok).toBe(false)
    expect(result.missingRequired).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'STRIPE_SECRET_KEY' }),
      expect.objectContaining({ name: 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY' }),
    ]))
  })

  it('does not require billing keys for the PRRC/search profile', () => {
    const result = verifyEnvironment(
      {
        ...validProductionEnv,
        STRIPE_SECRET_KEY: undefined,
        STRIPE_WEBHOOK_SECRET: undefined,
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: undefined,
        STRIPE_PRICE_STARTER: undefined,
        STRIPE_PRICE_PRO: undefined,
        STRIPE_PRICE_ENTERPRISE: undefined,
        NEXT_PUBLIC_STRIPE_PRICE_STARTER: undefined,
        NEXT_PUBLIC_STRIPE_PRICE_PRO: undefined,
      },
      { mode: 'production', profile: 'prrc' },
    )

    expect(result.ok).toBe(true)
    expect(result.checkedRequired).toBe(13)
    expect(result.missingRequired).toEqual([])
  })

  it('warns but does not fail when recommended variables are missing', () => {
    const result = verifyEnvironment(validProductionEnv, { mode: 'production' })

    expect(result.ok).toBe(true)
    expect(result.missingRecommended.map((item) => item.name)).toEqual(expect.arrayContaining(['RESEND_API_KEY']))
  })
})
