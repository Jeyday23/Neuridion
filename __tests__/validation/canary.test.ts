import { describe, expect, it } from 'vitest'
import {
  buildSyntheticCanaryProfile,
  customerVisibleRun,
} from '@/lib/validation/canary'

describe('production-parity canary scope', () => {
  it('builds an explicitly marked Neuridion canary profile', () => {
    expect(buildSyntheticCanaryProfile({
      user_id: 'internal-user',
      canary_key: 'neuridion-canary-infusion-pump',
      device_name: 'Synthetic infusion pump',
      manufacturer: 'Neuridion validation fixture',
    })).toMatchObject({
      canary_key: 'neuridion-canary-infusion-pump',
      is_synthetic_canary: true,
    })
  })

  it('rejects ambiguous identifiers and keeps canary runs out of customer scope', () => {
    expect(() => buildSyntheticCanaryProfile({
      user_id: 'internal-user',
      canary_key: 'customer-looking-profile',
      device_name: 'Pump',
      manufacturer: 'Acme',
    })).toThrow(/must start/)
    expect(customerVisibleRun({ is_synthetic_canary: true })).toBe(false)
    expect(customerVisibleRun({ is_synthetic_canary: false })).toBe(true)
  })
})
