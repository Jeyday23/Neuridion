import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAuditEvent } from '@/lib/audit'
import { rateLimit } from '@/lib/rate-limit'
import {
  buildEvidenceChainExport,
  EVIDENCE_EXPORT_MEDIA_TYPE,
  type ExportRow,
} from '@/lib/exports/evidence-chain'
import { loadEvidenceChainData } from '@/lib/exports/evidence-chain-data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const EVIDENCE_EXPORT_MAX_BYTES = 50 * 1024 * 1024

const SAFE_RESPONSE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  'Pragma': 'no-cache',
  'X-Content-Type-Options': 'nosniff',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Referrer-Policy': 'no-referrer',
  'Vary': 'Cookie',
} as const

function jsonError(error: string, status: number, headers: Record<string, string> = {}) {
  return Response.json({ error }, {
    status,
    headers: { ...SAFE_RESPONSE_HEADERS, ...headers },
  })
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return jsonError('Unauthorized', 401)
  }

  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) {
    return jsonError('Invalid ID', 400)
  }

  const rl = await rateLimit(`evidence-export:${user.id}`, 3, 300_000)
  if (!rl.allowed) {
    return jsonError('Too many export requests', 429, {
      'Retry-After': String(Math.ceil(rl.retryAfterMs / 1_000)),
    })
  }

  const admin = createAdminClient()
  const { data: run, error: runError } = await admin
    .from('search_runs')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('is_synthetic_canary', false)
    .single()

  const exportRun = run as ExportRow | null
  if (runError || !exportRun || exportRun.is_synthetic_canary !== false) {
    // Deliberately return the same response for an absent run, another user's
    // run, and a synthetic validation run.
    return jsonError('Not found', 404)
  }

  try {
    const data = await loadEvidenceChainData(admin, exportRun, user.id)
    const exported = buildEvidenceChainExport(data, {
      signingKey: process.env.EVIDENCE_EXPORT_HMAC_KEY ?? null,
      signingKeyId: process.env.EVIDENCE_EXPORT_HMAC_KEY_ID ?? null,
    })

    const serialized = JSON.stringify(exported, null, 2)
    const byteLength = Buffer.byteLength(serialized, 'utf8')
    if (byteLength > EVIDENCE_EXPORT_MAX_BYTES) {
      console.error('[evidence-export] output exceeded byte safety limit', {
        run_id: id,
        byte_length: byteLength,
      })
      return jsonError('The evidence export is too large for a single download.', 413)
    }

    await logAuditEvent(user.id, 'evidence_chain_exported', {
      run_id: id,
      schema_version: exported.manifest.schema_version,
      payload_sha256: exported.manifest.integrity.payload_sha256,
      byte_length: byteLength,
    }, request)

    return new Response(serialized, {
      status: 200,
      headers: {
        ...SAFE_RESPONSE_HEADERS,
        'Content-Type': `${EVIDENCE_EXPORT_MEDIA_TYPE}; charset=utf-8`,
        'Content-Disposition': `attachment; filename="neuridion-evidence-${id}.json"`,
        'Content-Length': String(byteLength),
      },
    })
  } catch (error) {
    console.error('[evidence-export] failed:', error instanceof Error ? error.message : 'unknown error')
    return jsonError('The evidence export could not be generated.', 500)
  }
}
