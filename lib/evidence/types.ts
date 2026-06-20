import { z } from 'zod'

export const sourceNameSchema = z.enum(['bfarm', 'mhra', 'fda', 'swissmedic', 'eudamed'])
export type SourceName = z.infer<typeof sourceNameSchema>

export const identityMethodSchema = z.enum([
  'authority_reference',
  'national_reference',
  'udi_device_key',
  'url_hash_low_stability',
  'generated_low_stability',
])
export type IdentityMethod = z.infer<typeof identityMethodSchema>

export const normalizedObservationSchema = z.object({
  source: sourceNameSchema,
  sourceRecordId: z.string().trim().min(1),
  authorityRecordId: z.string().uuid(),
  identityMethod: identityMethodSchema,
  fscaReference: z.string().trim().min(1).nullable(),
  basicUdiDi: z.string().trim().min(1).nullable(),
  title: z.string().nullable(),
  manufacturer: z.string().nullable(),
  productName: z.string().nullable(),
  fsnDate: z.iso.date().nullable(),
  sourceUrl: z.url().nullable(),
  sourcePayloadHash: z.string().regex(/^[0-9a-f]{64}$/),
  parserVersion: z.string().trim().min(1),
})
export type NormalizedObservation = z.infer<typeof normalizedObservationSchema>

export const fetchOutcomeSchema = z.enum(['complete', 'empty', 'partial', 'failed'])
export type FetchOutcome = z.infer<typeof fetchOutcomeSchema>

export interface ReconciliationCandidate {
  safetyActionId: string
  method: 'issuer_reference' | 'authority_record' | 'fuzzy_candidate'
  matchedOn: string
  confidence: number
  autoConfirm: boolean
}
