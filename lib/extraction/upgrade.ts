import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import type { EvidenceDatabase } from '@/lib/evidence/db-types'

type ExtractionDb = SupabaseClient<EvidenceDatabase>

export function normalizeExtractedIdentity(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toUpperCase()
}

export async function appendIdentityObservation(args: {
  authorityRecordId: string | null
  extractionId: string
  fscaReference: string | null
  db?: ExtractionDb
}): Promise<{ action: 'none' | 'observed'; value?: string }> {
  if (!args.authorityRecordId || !args.fscaReference) return { action: 'none' }
  const db = args.db ?? (createAdminClient() as unknown as ExtractionDb)
  const normalized = normalizeExtractedIdentity(args.fscaReference)
  const { error } = await db.from('fsn_identity_observations').insert({
    authority_record_id: args.authorityRecordId,
    extraction_id: args.extractionId,
    observation_type: 'fsca_reference',
    observed_value: args.fscaReference,
    normalized_value: normalized,
    confidence: 0.95,
    provenance: {
      source: 'pdf_detail_extraction',
      merge_policy: 'append_only_observation',
    },
  })
  if (error && error.code !== '23505') throw new Error(`Identity observation insert failed: ${error.message}`)
  return { action: 'observed', value: normalized }
}
