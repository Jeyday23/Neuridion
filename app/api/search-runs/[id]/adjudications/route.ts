import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAuditEvent } from '@/lib/audit'
import { rateLimit } from '@/lib/rate-limit'
import {
  assessFinalDecision,
  buildAdjudicationRecords,
  currentFinalEvent,
  isSeriousEventText,
  publicEvent,
} from '@/lib/adjudication/policy'
import type {
  AdjudicationEvent,
  AdjudicationFilterDecision,
  AdjudicationPermissions,
  AdjudicationResultRecord,
  ReviewerAssignmentRole,
  ReviewRequirement,
} from '@/lib/adjudication/types'
import type { FilterVerdict } from '@/lib/domain/types'
import type { Database } from '@/types/supabase'

type AdminClient = ReturnType<typeof createAdminClient>
type AdjudicationEventRow = Database['public']['Tables']['human_adjudication_events']['Row']
type ReviewRequirementRow = Database['public']['Tables']['review_requirements']['Row']

const RunIdSchema = z.string().uuid()

const AdjudicationSchema = z.object({
  fsn_result_id: z.string().uuid(),
  phase: z.enum(['provisional_blind', 'final', 'second_review']),
  disposition: z.enum(['relevant', 'uncertain', 'excluded']),
  confidence: z.number().int().min(1).max(5).optional(),
  rationale: z.string().trim().min(10).max(5_000),
  reviewer_role: z.enum(['prrc', 'regulatory_affairs', 'quality_assurance', 'clinical', 'other']),
  qualification_attestation: z.string().trim().min(10).max(500),
  attests_qualified: z.literal(true),
  serious_event: z.boolean().optional(),
  supersedes_event_id: z.string().uuid().optional(),
}).strict()

function asEvent(row: AdjudicationEventRow): AdjudicationEvent {
  return row as AdjudicationEvent
}

function asRequirement(row: ReviewRequirementRow): ReviewRequirement {
  return row as ReviewRequirement
}

async function reviewerContext(db: AdminClient, runId: string, userId: string) {
  const { data: run, error: runError } = await db
    .from('search_runs')
    .select('id, user_id, review_status, is_synthetic_canary')
    .eq('id', runId)
    .eq('is_synthetic_canary', false)
    .is('deleted_at', null)
    .maybeSingle()

  if (runError) {
    console.error('[adjudications] run lookup failed:', runError.message)
    return { kind: 'error' as const }
  }
  if (!run || run.is_synthetic_canary !== false) return { kind: 'not_found' as const }

  const { data: assignment, error: assignmentError } = await db
    .from('run_reviewer_assignments')
    .select('assignment_role')
    .eq('search_run_id', runId)
    .eq('reviewer_id', userId)
    .maybeSingle()

  if (assignmentError) {
    console.error('[adjudications] assignment lookup failed:', assignmentError.message)
    return { kind: 'error' as const }
  }

  const isOwner = run.user_id === userId
  const assignmentRole = (assignment?.assignment_role ?? null) as ReviewerAssignmentRole | null
  if (!isOwner && !assignmentRole) return { kind: 'not_found' as const }

  const permissions: AdjudicationPermissions = {
    is_owner: isOwner,
    assignment_role: assignmentRole,
    can_primary_review: isOwner || assignmentRole === 'primary' || assignmentRole === 'both',
    // Ownership does not implicitly qualify the owner as an independent
    // second reviewer. That authority must be explicitly assigned.
    can_second_review: assignmentRole === 'secondary' || assignmentRole === 'both',
  }

  return { kind: 'ok' as const, run, permissions }
}

async function loadRunEvidence(db: AdminClient, runId: string) {
  const [resultsResponse, decisionsResponse, requirementsResponse, eventsResponse] = await Promise.all([
    db.from('fsn_results')
      .select('id, title, manufacturer, fsn_date, source_url, source_db, raw_content')
      .eq('run_id', runId)
      .order('fsn_date', { ascending: false }),
    db.from('filter_decisions')
      .select('id, fsn_result_id, decision, rationale, confidence, model_used, prompt_version, authority_revision_id, evidence_parser_version, decided_at')
      .eq('search_run_id', runId)
      .order('decided_at', { ascending: true }),
    db.from('review_requirements')
      .select('id, search_run_id, fsn_result_id, filter_decision_id, requirement_reason, blind_review_required, blind_policy_version, blind_inclusion_probability, source_reference_id, created_by, created_at')
      .eq('search_run_id', runId)
      .order('created_at', { ascending: true }),
    db.from('human_adjudication_events')
      .select('*')
      .eq('search_run_id', runId)
      .order('created_at', { ascending: true }),
  ])

  const error = resultsResponse.error
    ?? decisionsResponse.error
    ?? requirementsResponse.error
    ?? eventsResponse.error
  if (error) {
    console.error('[adjudications] evidence lookup failed:', error.message)
    return null
  }

  return {
    results: (resultsResponse.data ?? []) as AdjudicationResultRecord[],
    decisions: (decisionsResponse.data ?? []).map((row) => ({
      ...row,
      decision: row.decision as FilterVerdict,
    })) as AdjudicationFilterDecision[],
    requirements: (requirementsResponse.data ?? []).map(asRequirement),
    events: (eventsResponse.data ?? []).map(asEvent),
  }
}

function responseForRun(input: {
  runId: string
  reviewStatus: string | null
  viewerId: string
  permissions: AdjudicationPermissions
  evidence: NonNullable<Awaited<ReturnType<typeof loadRunEvidence>>>
}) {
  const records = buildAdjudicationRecords({
    ...input.evidence,
    viewerId: input.viewerId,
    viewerCanOnlySecondReview:
      input.permissions.can_second_review && !input.permissions.can_primary_review,
  })
  const requiredRecords = records.filter((record) => record.review_required)
  const completedRecords = requiredRecords.filter((record) => record.complete)
  const secondReviewPending = requiredRecords.filter((record) =>
    record.final?.requires_second_review
    && record.second_review?.disposition !== record.final.disposition,
  ).length

  return {
    run_id: input.runId,
    review_status: input.reviewStatus ?? 'draft',
    permissions: input.permissions,
    summary: {
      total_records: records.length,
      required_records: requiredRecords.length,
      completed_records: completedRecords.length,
      pending_records: requiredRecords.length - completedRecords.length,
      second_review_pending: secondReviewPending,
      ready_for_approval: requiredRecords.length === completedRecords.length,
    },
    records,
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!RunIdSchema.safeParse(id).success) {
    return Response.json({ error: 'Invalid ID' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const context = await reviewerContext(db, id, user.id)
  if (context.kind === 'not_found') {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }
  if (context.kind === 'error') {
    return Response.json({ error: 'Review access could not be verified.' }, { status: 503 })
  }

  const evidence = await loadRunEvidence(db, id)
  if (!evidence) {
    return Response.json({ error: 'Review evidence could not be loaded.' }, { status: 503 })
  }

  return Response.json(responseForRun({
    runId: id,
    reviewStatus: context.run.review_status,
    viewerId: user.id,
    permissions: context.permissions,
    evidence,
  }))
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!RunIdSchema.safeParse(id).success) {
    return Response.json({ error: 'Invalid ID' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rl = await rateLimit(`adjudication:${user.id}`, 30, 60_000)
  if (!rl.allowed) {
    return Response.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1_000)) },
      },
    )
  }

  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const parsed = AdjudicationSchema.safeParse(rawBody)
  if (!parsed.success) {
    return Response.json({ error: 'Validation failed. Check the disposition and reviewer attestation.' }, { status: 422 })
  }
  const body = parsed.data

  const db = createAdminClient()
  const context = await reviewerContext(db, id, user.id)
  if (context.kind === 'not_found') {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }
  if (context.kind === 'error') {
    return Response.json({ error: 'Review access could not be verified.' }, { status: 503 })
  }
  if (context.run.review_status === 'approved') {
    return Response.json({ error: 'Approved runs are locked. Append a controlled correction through the release process.' }, { status: 409 })
  }

  const { data: result, error: resultError } = await db
    .from('fsn_results')
    .select('id, title, manufacturer, fsn_date, source_url, source_db, raw_content')
    .eq('id', body.fsn_result_id)
    .eq('run_id', id)
    .maybeSingle()
  if (resultError) {
    console.error('[adjudications] result lookup failed:', resultError.message)
    return Response.json({ error: 'Review evidence could not be verified.' }, { status: 503 })
  }
  if (!result) return Response.json({ error: 'Record not found' }, { status: 404 })

  const [decisionResponse, requirementsResponse, eventsResponse] = await Promise.all([
    db.from('filter_decisions')
      .select('id, fsn_result_id, decision, rationale, confidence, model_used, prompt_version, authority_revision_id, evidence_parser_version, decided_at')
      .eq('search_run_id', id)
      .eq('fsn_result_id', body.fsn_result_id)
      .order('decided_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    db.from('review_requirements')
      .select('id, search_run_id, fsn_result_id, filter_decision_id, requirement_reason, blind_review_required, blind_policy_version, blind_inclusion_probability, source_reference_id, created_by, created_at')
      .eq('search_run_id', id)
      .eq('fsn_result_id', body.fsn_result_id),
    db.from('human_adjudication_events')
      .select('*')
      .eq('search_run_id', id)
      .eq('fsn_result_id', body.fsn_result_id)
      .order('created_at', { ascending: true }),
  ])

  const lookupError = decisionResponse.error ?? requirementsResponse.error ?? eventsResponse.error
  if (lookupError) {
    console.error('[adjudications] record state lookup failed:', lookupError.message)
    return Response.json({ error: 'Review state could not be verified.' }, { status: 503 })
  }
  if (!decisionResponse.data) {
    return Response.json({ error: 'This record has no immutable AI decision to adjudicate.' }, { status: 422 })
  }

  const decision: AdjudicationFilterDecision = {
    ...decisionResponse.data,
    decision: decisionResponse.data.decision as FilterVerdict,
  }
  const requirements = (requirementsResponse.data ?? []).map(asRequirement)
  const events = (eventsResponse.data ?? []).map(asEvent)
  const explicitReviewRequired = requirements.length > 0
  const derivedReviewRequired = ['relevant', 'uncertain', 'filter_failed'].includes(decision.decision)
  if (!explicitReviewRequired && !derivedReviewRequired) {
    return Response.json({ error: 'This record is not selected for human adjudication.' }, { status: 422 })
  }

  const blindRequired = requirements.some((item) => item.blind_review_required)
  const viewerProvisional = [...events].reverse().find((event) =>
    event.phase === 'provisional_blind' && event.reviewer_id === user.id,
  ) ?? null
  const currentFinal = currentFinalEvent(events)
  const seriousEvent = isSeriousEventText(result.title, result.raw_content) || body.serious_event === true

  let insert: Database['public']['Tables']['human_adjudication_events']['Insert']

  if (body.phase === 'provisional_blind') {
    if (!context.permissions.can_primary_review) {
      return Response.json({ error: 'Your assignment does not permit primary adjudication.' }, { status: 403 })
    }
    if (!blindRequired) {
      return Response.json({ error: 'A blind provisional disposition is not required for this record.' }, { status: 422 })
    }
    if (body.confidence == null) {
      return Response.json({ error: 'Confidence from 1 to 5 is required for a blind provisional disposition.' }, { status: 422 })
    }
    if (viewerProvisional || currentFinal) {
      return Response.json({ error: 'The provisional disposition is already locked.' }, { status: 409 })
    }
    insert = {
      search_run_id: id,
      fsn_result_id: result.id,
      filter_decision_id: decision.id,
      reviewer_id: user.id,
      phase: 'provisional_blind',
      disposition: body.disposition,
      confidence: body.confidence,
      rationale: body.rationale,
      reviewer_role: body.reviewer_role,
      qualification_attestation: body.qualification_attestation,
      attests_qualified: true,
      blind_to_ai: true,
      serious_event_signal: seriousEvent,
    }
  } else if (body.phase === 'final') {
    if (!context.permissions.can_primary_review) {
      return Response.json({ error: 'Your assignment does not permit primary adjudication.' }, { status: 403 })
    }
    if (blindRequired && !viewerProvisional) {
      return Response.json({ error: 'Submit and lock the blind provisional disposition before revealing the AI assessment.' }, { status: 422 })
    }
    if (currentFinal) {
      if (body.supersedes_event_id !== currentFinal.id) {
        return Response.json({ error: 'A current final disposition already exists. Refresh before appending a correction.' }, { status: 409 })
      }
      if (currentFinal.reviewer_id !== user.id) {
        return Response.json({ error: 'Only the original primary reviewer can supersede this final disposition.' }, { status: 403 })
      }
    } else if (body.supersedes_event_id) {
      return Response.json({ error: 'The disposition being superseded is no longer current.' }, { status: 409 })
    }

    const assessment = assessFinalDecision({
      aiDisposition: decision.decision,
      provisionalDisposition: viewerProvisional?.disposition,
      previousFinalDisposition: currentFinal?.disposition,
      finalDisposition: body.disposition,
      seriousEvent,
    })
    if (assessment.materialChange && body.rationale.length < 20) {
      return Response.json({ error: 'A post-reveal downgrade to excluded requires a written rationale of at least 20 characters.' }, { status: 422 })
    }

    insert = {
      search_run_id: id,
      fsn_result_id: result.id,
      filter_decision_id: decision.id,
      reviewer_id: user.id,
      phase: 'final',
      disposition: body.disposition,
      confidence: body.confidence ?? null,
      rationale: body.rationale,
      reviewer_role: body.reviewer_role,
      qualification_attestation: body.qualification_attestation,
      attests_qualified: true,
      blind_to_ai: false,
      provisional_event_id: viewerProvisional?.id ?? null,
      supersedes_event_id: body.supersedes_event_id ?? null,
      requires_second_review: assessment.requiresSecondReview,
      material_change: assessment.materialChange,
      serious_event_signal: seriousEvent,
      ai_model_snapshot: decision.model_used,
      ai_prompt_version_snapshot: decision.prompt_version,
      authority_revision_id: decision.authority_revision_id,
      evidence_parser_version_snapshot: decision.evidence_parser_version,
    }
  } else {
    if (!context.permissions.can_second_review) {
      return Response.json({ error: 'Your assignment does not permit independent second review.' }, { status: 403 })
    }
    if (!currentFinal || !currentFinal.requires_second_review) {
      return Response.json({ error: 'No independent second review is currently required.' }, { status: 422 })
    }
    if (currentFinal.reviewer_id === user.id) {
      return Response.json({ error: 'The second reviewer must be different from the primary reviewer.' }, { status: 403 })
    }
    if (events.some((event) =>
      event.phase === 'second_review'
      && event.review_of_event_id === currentFinal.id
      && event.reviewer_id === user.id,
    )) {
      return Response.json({ error: 'Your second-review disposition is already locked.' }, { status: 409 })
    }

    insert = {
      search_run_id: id,
      fsn_result_id: result.id,
      filter_decision_id: decision.id,
      reviewer_id: user.id,
      phase: 'second_review',
      disposition: body.disposition,
      confidence: body.confidence ?? null,
      rationale: body.rationale,
      reviewer_role: body.reviewer_role,
      qualification_attestation: body.qualification_attestation,
      attests_qualified: true,
      blind_to_ai: false,
      review_of_event_id: currentFinal.id,
      serious_event_signal: currentFinal.serious_event_signal,
      ai_model_snapshot: decision.model_used,
      ai_prompt_version_snapshot: decision.prompt_version,
      authority_revision_id: decision.authority_revision_id,
      evidence_parser_version_snapshot: decision.evidence_parser_version,
    }
  }

  const { data: insertedRow, error: insertError } = await db
    .from('human_adjudication_events')
    .insert(insert)
    .select('*')
    .single()

  if (insertError || !insertedRow) {
    if (insertError?.code === '23505') {
      return Response.json({ error: 'This disposition was already recorded. Refresh to see the current state.' }, { status: 409 })
    }
    if (insertError?.code === '23514') {
      return Response.json({ error: 'The adjudication state changed or violates the controlled review sequence.' }, { status: 422 })
    }
    console.error('[adjudications] append failed:', insertError?.message ?? 'no returned event')
    return Response.json({ error: 'The disposition could not be recorded.' }, { status: 500 })
  }

  const insertedEvent = asEvent(insertedRow)
  await logAuditEvent(user.id, 'adjudication_event_recorded', {
    run_id: id,
    fsn_result_id: result.id,
    adjudication_event_id: insertedEvent.id,
    phase: insertedEvent.phase,
    disposition: insertedEvent.disposition,
    requires_second_review: insertedEvent.requires_second_review,
  }, request)

  const record = buildAdjudicationRecords({
    results: [result as AdjudicationResultRecord],
    decisions: [decision],
    requirements,
    events: [...events, insertedEvent],
    viewerId: user.id,
    viewerCanOnlySecondReview:
      context.permissions.can_second_review && !context.permissions.can_primary_review,
  })[0]

  return Response.json({ event: publicEvent(insertedEvent), record }, { status: 201 })
}
