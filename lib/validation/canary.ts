export const CANARY_PROFILE_KEY_PREFIX = 'neuridion-canary-'

export interface SyntheticCanaryProfileInput {
  user_id: string
  canary_key: string
  device_name: string
  manufacturer: string
  intended_use?: string | null
  emdn_code?: string | null
  device_class?: string | null
  default_dbs?: string[]
  search_strategy?: Record<string, unknown>
  is_synthetic_canary: true
}

export function assertCanaryKey(canaryKey: string): string {
  if (!new RegExp(`^${CANARY_PROFILE_KEY_PREFIX}[a-z0-9][a-z0-9-]{2,63}$`).test(canaryKey)) {
    throw new TypeError(`Canary key must start with ${CANARY_PROFILE_KEY_PREFIX} and use lowercase letters, numbers or hyphens`)
  }
  return canaryKey
}

/**
 * Builds the profile payload used by the normal search runtime. Database RLS
 * only permits the service role to persist this marker; customers cannot turn
 * their own profiles into canaries or query the resulting runs.
 */
export function buildSyntheticCanaryProfile(
  input: Omit<SyntheticCanaryProfileInput, 'is_synthetic_canary'>,
): SyntheticCanaryProfileInput {
  return {
    ...input,
    canary_key: assertCanaryKey(input.canary_key),
    is_synthetic_canary: true,
  }
}

export function customerVisibleRun<T extends { is_synthetic_canary?: boolean | null }>(run: T): boolean {
  return run.is_synthetic_canary !== true
}
