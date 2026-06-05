import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — must be set up before importing the route module
// ---------------------------------------------------------------------------

const WEBHOOK_SECRET = 'whsec_test_secret'

vi.stubEnv('STRIPE_WEBHOOK_SECRET', WEBHOOK_SECRET)
vi.stubEnv('STRIPE_PRICE_STARTER', 'price_starter_123')
vi.stubEnv('STRIPE_PRICE_PRO', 'price_pro_456')

// Chainable Supabase query builder matching project convention
function chainable(terminal: Record<string, unknown> = {}) {
  const builder: Record<string, unknown> = {}
  const methods = ['from', 'select', 'insert', 'update', 'delete', 'eq', 'in', 'order', 'is']
  for (const m of methods) {
    builder[m] = vi.fn().mockReturnValue(builder)
  }
  builder['single'] = vi.fn().mockResolvedValue({ data: null, error: null, ...terminal })
  builder['maybeSingle'] = vi.fn().mockResolvedValue({ data: null, error: null, ...terminal })
  Object.assign(builder, terminal)
  return builder
}

type CallableMock = ReturnType<typeof vi.fn<(...args: unknown[]) => unknown>>

let mockAdminChain: ReturnType<typeof chainable>
let mockConstructEvent: CallableMock
let mockSubscriptionsRetrieve: CallableMock
let mockRedisExists: CallableMock
let mockRedisSet: CallableMock
let mockRedisDel: CallableMock
let mockLogAuditEvent: CallableMock

// --- next/headers ---
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => ({
    get: vi.fn((name: string) => {
      if (name === 'stripe-signature') return 'sig_test_valid'
      return null
    }),
  })),
}))

// --- Stripe ---
vi.mock('@/lib/stripe', () => ({
  stripe: {
    webhooks: {
      constructEvent: (...args: unknown[]) => mockConstructEvent(...args),
    },
    subscriptions: {
      retrieve: (...args: unknown[]) => mockSubscriptionsRetrieve(...args),
    },
  },
}))

// --- Supabase admin ---
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn().mockReturnValue(mockAdminChain),
  })),
}))

// --- Redis ---
vi.mock('@/lib/upstash', () => ({
  redis: {
    exists: (...args: unknown[]) => mockRedisExists(...args),
    set: (...args: unknown[]) => mockRedisSet(...args),
    del: (...args: unknown[]) => mockRedisDel(...args),
  },
}))

// --- Plans ---
vi.mock('@/lib/plans', () => ({
  planFromPriceId: vi.fn((priceId: string | null) => {
    if (priceId === 'price_starter_123') return 'starter'
    if (priceId === 'price_pro_456') return 'pro'
    return 'free'
  }),
}))

// --- Audit ---
vi.mock('@/lib/audit', () => ({
  logAuditEvent: (...args: unknown[]) => mockLogAuditEvent(...args),
}))

// ---------------------------------------------------------------------------
// Import route handler (after mocks)
// ---------------------------------------------------------------------------
import { POST } from '@/app/api/webhooks/stripe/route'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function webhookRequest(body: string): Request {
  return new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'stripe-signature': 'sig_test_valid',
    },
    body,
  })
}

function makeStripeEvent(type: string, data: Record<string, unknown>, id = 'evt_test_123') {
  return { id, type, data: { object: data } }
}

function makeSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub_test_abc',
    status: 'active',
    items: {
      data: [{ price: { id: 'price_starter_123' }, current_period_end: 1750000000 }],
    },
    ...overrides,
  }
}

function makeCheckoutSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cs_test_session',
    mode: 'subscription',
    customer: 'cus_test_customer',
    subscription: 'sub_test_abc',
    metadata: { user_id: 'user-uuid-1234' },
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks()

  // Default: Redis operational, no prior processing
  mockRedisExists = vi.fn().mockResolvedValue(0)
  mockRedisSet = vi.fn().mockResolvedValue('OK')
  mockRedisDel = vi.fn().mockResolvedValue(1)

  // Default: Stripe constructEvent succeeds
  mockConstructEvent = vi.fn().mockReturnValue(
    makeStripeEvent('checkout.session.completed', makeCheckoutSession()),
  )

  // Default: subscriptions.retrieve returns a valid subscription
  mockSubscriptionsRetrieve = vi.fn().mockResolvedValue(makeSubscription())

  // Default: DB update succeeds and returns a user
  mockAdminChain = chainable({
    maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'user-uuid-1234' }, error: null }),
  })

  // Default: audit logging succeeds
  mockLogAuditEvent = vi.fn().mockResolvedValue(undefined)
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/webhooks/stripe', () => {
  // ── Signature verification ──────────────────────────────────────────────

  describe('signature verification', () => {
    it('returns 400 when stripe-signature header is missing', async () => {
      const { headers: headersMock } = await import('next/headers')
      ;(headersMock as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        get: vi.fn().mockReturnValue(null),
      })

      const res = await POST(webhookRequest('{}'))
      expect(res.status).toBe(400)
      const json = await res.json()
      expect(json.error).toBe('Missing stripe-signature header')
    })

    it('returns 400 when signature is invalid', async () => {
      mockConstructEvent.mockImplementation(() => {
        throw new Error('Invalid signature')
      })

      const res = await POST(webhookRequest('{}'))
      expect(res.status).toBe(400)
      const json = await res.json()
      expect(json.error).toBe('Invalid webhook signature')
    })
  })

  // ── Redis idempotency ──────────────────────────────────────────────────

  describe('idempotency', () => {
    it('returns 200 immediately for already-processed events', async () => {
      mockRedisExists.mockResolvedValue(1)

      const res = await POST(webhookRequest('{}'))
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.received).toBe(true)

      // Should NOT have attempted any DB writes
      expect(mockSubscriptionsRetrieve).not.toHaveBeenCalled()
    })

    it('returns 409 when another instance holds the processing lock', async () => {
      mockRedisExists.mockResolvedValue(0)
      mockRedisSet.mockResolvedValue(null) // NX failed — someone else claimed it

      const res = await POST(webhookRequest('{}'))
      expect(res.status).toBe(409)
      const json = await res.json()
      expect(json.error).toBe('Event already processing')
    })

    it('marks event as processed after successful handling', async () => {
      const res = await POST(webhookRequest('{}'))
      expect(res.status).toBe(200)

      // Verify processed key was set and lock was deleted
      expect(mockRedisSet).toHaveBeenCalledWith(
        'stripe-event:evt_test_123',
        1,
        expect.objectContaining({ ex: 259200 }),
      )
      expect(mockRedisDel).toHaveBeenCalledWith('stripe-event-lock:evt_test_123')
    })

    it('releases lock on processing failure without marking as processed', async () => {
      // Make the DB update fail
      mockAdminChain = chainable({
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB down' } }),
      })

      const res = await POST(webhookRequest('{}'))
      expect(res.status).toBe(500)

      // Lock should be released but event NOT marked as processed
      expect(mockRedisDel).toHaveBeenCalledWith('stripe-event-lock:evt_test_123')
      // The processed key SET should only be called for the lock claim, not the processed marker
      const processedSetCalls = mockRedisSet.mock.calls.filter(
        (call: unknown[]) => call[0] === 'stripe-event:evt_test_123',
      )
      expect(processedSetCalls).toHaveLength(0)
    })

    it('processes event when Redis is completely unavailable (fail-open)', async () => {
      mockRedisExists.mockRejectedValue(new Error('Connection refused'))

      const res = await POST(webhookRequest('{}'))
      // Should still process successfully — fail-open behavior
      expect(res.status).toBe(200)
      expect(mockSubscriptionsRetrieve).toHaveBeenCalled()
    })
  })

  // ── checkout.session.completed ─────────────────────────────────────────

  describe('checkout.session.completed', () => {
    it('updates user billing state on successful checkout', async () => {
      const res = await POST(webhookRequest('{}'))
      expect(res.status).toBe(200)

      // Should have retrieved the subscription from Stripe
      expect(mockSubscriptionsRetrieve).toHaveBeenCalledWith('sub_test_abc')

      // Should have updated the user in DB
      const updateFn = mockAdminChain['update'] as ReturnType<typeof vi.fn>
      expect(updateFn).toHaveBeenCalledWith(
        expect.objectContaining({
          stripe_customer_id: 'cus_test_customer',
          stripe_subscription_id: 'sub_test_abc',
          plan: 'starter',
        }),
      )
    })

    it('returns 500 when user_id is missing from checkout metadata', async () => {
      mockConstructEvent.mockReturnValue(
        makeStripeEvent('checkout.session.completed', makeCheckoutSession({ metadata: {} })),
      )

      const res = await POST(webhookRequest('{}'))
      expect(res.status).toBe(500)
    })

    it('returns 500 when DB update finds no matching user', async () => {
      mockAdminChain = chainable({
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      })

      const res = await POST(webhookRequest('{}'))
      expect(res.status).toBe(500)
    })

    it('skips non-subscription checkout sessions', async () => {
      mockConstructEvent.mockReturnValue(
        makeStripeEvent('checkout.session.completed', makeCheckoutSession({ mode: 'payment' })),
      )

      const res = await POST(webhookRequest('{}'))
      expect(res.status).toBe(200)

      // Should NOT have tried to retrieve or update
      expect(mockSubscriptionsRetrieve).not.toHaveBeenCalled()
    })

    it('handles expanded Stripe objects (customer as object with id)', async () => {
      mockConstructEvent.mockReturnValue(
        makeStripeEvent('checkout.session.completed', makeCheckoutSession({
          customer: { id: 'cus_expanded', object: 'customer' },
          subscription: { id: 'sub_expanded', object: 'subscription' },
        })),
      )
      mockSubscriptionsRetrieve.mockResolvedValue(makeSubscription({ id: 'sub_expanded' }))

      const res = await POST(webhookRequest('{}'))
      expect(res.status).toBe(200)

      expect(mockSubscriptionsRetrieve).toHaveBeenCalledWith('sub_expanded')
    })

    it('logs audit event after successful checkout', async () => {
      await POST(webhookRequest('{}'))

      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        'user-uuid-1234',
        'billing_event',
        expect.objectContaining({
          stripe_event: 'checkout.session.completed',
          plan: 'starter',
        }),
        expect.any(Request),
      )
    })

    it('succeeds even when audit logging fails', async () => {
      mockLogAuditEvent.mockRejectedValue(new Error('Audit DB down'))

      const res = await POST(webhookRequest('{}'))
      expect(res.status).toBe(200)
    })
  })

  // ── customer.subscription.updated ──────────────────────────────────────

  describe('customer.subscription.updated', () => {
    beforeEach(() => {
      mockConstructEvent.mockReturnValue(
        makeStripeEvent('customer.subscription.updated', makeSubscription()),
      )
    })

    it('updates user plan and subscription status', async () => {
      const res = await POST(webhookRequest('{}'))
      expect(res.status).toBe(200)

      const updateFn = mockAdminChain['update'] as ReturnType<typeof vi.fn>
      expect(updateFn).toHaveBeenCalledWith(
        expect.objectContaining({
          stripe_price_id: 'price_starter_123',
          subscription_status: 'active',
          plan: 'starter',
        }),
      )
    })

    it('downgrades to free when subscription is not active or trialing', async () => {
      mockConstructEvent.mockReturnValue(
        makeStripeEvent('customer.subscription.updated', makeSubscription({ status: 'past_due' })),
      )

      const res = await POST(webhookRequest('{}'))
      expect(res.status).toBe(200)

      const updateFn = mockAdminChain['update'] as ReturnType<typeof vi.fn>
      expect(updateFn).toHaveBeenCalledWith(
        expect.objectContaining({
          plan: 'free',
          subscription_status: 'past_due',
        }),
      )
    })

    it('keeps plan for trialing subscriptions', async () => {
      mockConstructEvent.mockReturnValue(
        makeStripeEvent('customer.subscription.updated', makeSubscription({ status: 'trialing' })),
      )

      const res = await POST(webhookRequest('{}'))
      expect(res.status).toBe(200)

      const updateFn = mockAdminChain['update'] as ReturnType<typeof vi.fn>
      expect(updateFn).toHaveBeenCalledWith(
        expect.objectContaining({ plan: 'starter' }),
      )
    })

    it('returns 500 when no user matches the subscription ID', async () => {
      mockAdminChain = chainable({
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      })

      const res = await POST(webhookRequest('{}'))
      expect(res.status).toBe(500)
    })
  })

  // ── customer.subscription.deleted ──────────────────────────────────────

  describe('customer.subscription.deleted', () => {
    beforeEach(() => {
      mockConstructEvent.mockReturnValue(
        makeStripeEvent('customer.subscription.deleted', makeSubscription()),
      )
    })

    it('resets user to free plan', async () => {
      const res = await POST(webhookRequest('{}'))
      expect(res.status).toBe(200)

      const updateFn = mockAdminChain['update'] as ReturnType<typeof vi.fn>
      expect(updateFn).toHaveBeenCalledWith(
        expect.objectContaining({
          plan: 'free',
          subscription_status: 'canceled',
          stripe_price_id: null,
          current_period_end: null,
        }),
      )
    })

    it('logs audit event with subscription_id', async () => {
      await POST(webhookRequest('{}'))

      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        'user-uuid-1234',
        'billing_event',
        expect.objectContaining({
          stripe_event: 'customer.subscription.deleted',
          subscription_id: 'sub_test_abc',
        }),
        expect.any(Request),
      )
    })
  })

  // ── invoice.payment_failed ─────────────────────────────────────────────

  describe('invoice.payment_failed', () => {
    beforeEach(() => {
      mockConstructEvent.mockReturnValue(
        makeStripeEvent('invoice.payment_failed', {
          id: 'in_test_invoice',
          subscription: 'sub_test_abc',
        }),
      )
    })

    it('sets subscription status to past_due', async () => {
      const res = await POST(webhookRequest('{}'))
      expect(res.status).toBe(200)

      const updateFn = mockAdminChain['update'] as ReturnType<typeof vi.fn>
      expect(updateFn).toHaveBeenCalledWith(
        expect.objectContaining({ subscription_status: 'past_due' }),
      )
    })

    it('skips invoices without a subscription', async () => {
      mockConstructEvent.mockReturnValue(
        makeStripeEvent('invoice.payment_failed', {
          id: 'in_test_invoice',
          subscription: null,
        }),
      )

      const res = await POST(webhookRequest('{}'))
      expect(res.status).toBe(200)

      // Should not have tried to update any user
      const updateFn = mockAdminChain['update'] as ReturnType<typeof vi.fn>
      expect(updateFn).not.toHaveBeenCalled()
    })

    it('handles expanded subscription object on invoice', async () => {
      mockConstructEvent.mockReturnValue(
        makeStripeEvent('invoice.payment_failed', {
          id: 'in_test_invoice',
          subscription: { id: 'sub_expanded_inv', object: 'subscription' },
        }),
      )

      const res = await POST(webhookRequest('{}'))
      expect(res.status).toBe(200)

      const eqFn = mockAdminChain['eq'] as ReturnType<typeof vi.fn>
      expect(eqFn).toHaveBeenCalledWith('stripe_subscription_id', 'sub_expanded_inv')
    })
  })

  // ── Unhandled event types ──────────────────────────────────────────────

  describe('unhandled event types', () => {
    it('returns 200 for unrecognized event types', async () => {
      mockConstructEvent.mockReturnValue(
        makeStripeEvent('customer.created', { id: 'cus_whatever' }),
      )

      const res = await POST(webhookRequest('{}'))
      expect(res.status).toBe(200)
      expect(mockLogAuditEvent).not.toHaveBeenCalled()
    })
  })

  // ── Error propagation ──────────────────────────────────────────────────

  describe('error handling', () => {
    it('returns 500 and releases lock when processing throws', async () => {
      // Force an error during subscription retrieval
      mockSubscriptionsRetrieve.mockRejectedValue(new Error('Stripe API down'))

      const res = await POST(webhookRequest('{}'))
      expect(res.status).toBe(500)
      const json = await res.json()
      expect(json.error).toBe('processing_failed')

      // Lock should be released
      expect(mockRedisDel).toHaveBeenCalledWith('stripe-event-lock:evt_test_123')
    })

    it('returns 500 when DB update returns an error object', async () => {
      mockAdminChain = chainable({
        maybeSingle: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'constraint violation', code: '23505' },
        }),
      })

      const res = await POST(webhookRequest('{}'))
      expect(res.status).toBe(500)
    })
  })
})
