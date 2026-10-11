import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAuditEvent } from '@/lib/audit'
import { rateLimit } from '@/lib/rate-limit'
import {
  assignmentForReviewer,
  describeActiveAssignments,
  toPublicAssignment,
} from '@/lib/review/assignments'

/**
 * Reviewer assignment management. Owner only.
 *
 * Tenancy is search_runs.user_id: there is no organisation model, so the run
 * owner is the only person who can grant or revoke review access. Non-owners
 * receive 404 so run existence is not disclosed.
 *
 * Known limitation: run_reviewer_assignments has UNIQUE(search_run_id,
 * reviewer_id) and is append-only. A revoked reviewer therefore cannot be
 * re-assigned to the same run; the owner must start a new run or use a
 * different reviewer account.
 */

type AdminClient = ReturnType<typeof createAdminClient>

const RunIdSchema = z.string().uuid()

const AssignSchema = z.object({
  email: z.string().trim().max(254).toLowerCase().pipe(z.email()),
  assignment_role: z.enum(['primary', 'secondary', 'both']),
}).strict()

const RevokeBodySchema = z.object({
  reason: z.string().trim().min(1).max(500).optional(),
}).strict()

const NOT_FOUND = { error: 'Not found' }
const NO_ACCOUNT = { error: 'No Neuridion account matches that email.' }
const APPROVED_LOCKED = { error: 'This run is approved. Reviewer assignments are locked.' }

async function authenticatedUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return user
}

async function ownedRun(db: AdminClient, runId: string, userId: string) {
  const { data, error } = await db
    .from('search_runs')
    .select('id, user_id, review_status')
    .eq('id', runId)
    .eq('user_id', userId)
    .eq('is_synthetic_canary', false)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) {
    console.error('[reviewers] run lookup failed:', error.message)
    return { kind: 'error' as const }
  }
  if (!data || data.user_id !== userId) return { kind: 'not_found' as const }
  return { kind: 'ok' as const, run: data }
}

/** ilike with `%`, `_` and `\` matched literally, i.e. case-insensitive equality. */
function likeLiteral(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`)
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!RunIdSchema.safeParse(id).success) {
    return Response.json({ error: 'Invalid ID' }, { status: 400 })
  }
  const user = await authenticatedUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createAdminClient()
  const run = await ownedRun(db, id, user.id)
  if (run.kind === 'not_found') return Response.json(NOT_FOUND, { status: 404 })
  if (run.kind === 'error') {
    return Response.json({ error: 'Reviewer assignments could not be loaded.' }, { status: 503 })
  }

  const assignments = await describeActiveAssignments(db, id)
  if (assignments.error) {
    console.error('[reviewers] assignment lookup failed:', assignments.error.message)
    return Response.json({ error: 'Reviewer assignments could not be loaded.' }, { status: 503 })
  }

  return Response.json({
    run_id: id,
    review_status: run.run.review_status ?? 'draft',
    assignments: assignments.data,
  })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!RunIdSchema.safeParse(id).success) {
    return Response.json({ error: 'Invalid ID' }, { status: 400 })
  }
  const user = await authenticatedUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  // The 404 for an unknown email reveals account existence to the run owner.
  // A tight per-user limit keeps that from being usable as an enumeration oracle.
  const rl = await rateLimit(`review-assign:${user.id}`, 10, 10 * 60_000)
  if (!rl.allowed) {
    return Response.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1_000)) } },
    )
  }

  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const parsed = AssignSchema.safeParse(rawBody)
  if (!parsed.success) {
    return Response.json({ error: 'Enter a valid email address and reviewer role.' }, { status: 422 })
  }
  const body = parsed.data

  const db = createAdminClient()
  const run = await ownedRun(db, id, user.id)
  if (run.kind === 'not_found') return Response.json(NOT_FOUND, { status: 404 })
  if (run.kind === 'error') {
    return Response.json({ error: 'Reviewer assignment could not be verified.' }, { status: 503 })
  }
  if (run.run.review_status === 'approved') {
    return Response.json(APPROVED_LOCKED, { status: 409 })
  }

  const { data: matches, error: lookupError } = await db
    .from('users')
    .select('id, full_name, email')
    .ilike('email', likeLiteral(body.email))
    .is('deleted_at', null)
    .limit(2)
  if (lookupError) {
    console.error('[reviewers] reviewer lookup failed:', lookupError.message)
    return Response.json({ error: 'Reviewer assignment could not be verified.' }, { status: 503 })
  }
  if (!matches || matches.length === 0) {
    return Response.json(NO_ACCOUNT, { status: 404 })
  }
  if (matches.length > 1) {
    // Emails are unique in auth; a case-variant duplicate is a data problem.
    // Refuse rather than guess which account gets access.
    console.error('[reviewers] ambiguous reviewer email match')
    return Response.json({ error: 'That email matches more than one account. Contact support.' }, { status: 409 })
  }
  const reviewer = matches[0]

  if (reviewer.id === user.id) {
    return Response.json(
      { error: 'You own this run. Assign a different person as reviewer.' },
      { status: 400 },
    )
  }

  const existing = await assignmentForReviewer(db, id, reviewer.id)
  if (existing.error) {
    console.error('[reviewers] existing assignment lookup failed:', existing.error.message)
    return Response.json({ error: 'Reviewer assignment could not be verified.' }, { status: 503 })
  }
  if (existing.data && !existing.data.revoked) {
    return Response.json({ error: 'This person is already an active reviewer on this run.' }, { status: 409 })
  }
  if (existing.data?.revoked) {
    return Response.json(
      { error: 'This person was removed as a reviewer on this run. A removed reviewer cannot be re-assigned to the same run.' },
      { status: 409 },
    )
  }

  const { data: inserted, error: insertError } = await db
    .from('run_reviewer_assignments')
    .insert({
      search_run_id: id,
      reviewer_id: reviewer.id,
      assigned_by: user.id,
      assignment_role: body.assignment_role,
    })
    .select('id, search_run_id, reviewer_id, assigned_by, assignment_role, assigned_at')
    .single()
  if (insertError || !inserted) {
    if (insertError?.code === '23505') {
      return Response.json({ error: 'This person is already assigned to this run.' }, { status: 409 })
    }
    console.error('[reviewers] assignment insert failed:', insertError?.message ?? 'no row returned')
    return Response.json({ error: 'The reviewer could not be assigned.' }, { status: 500 })
  }

  await logAuditEvent(user.id, 'review_assignment_created', {
    run_id: id,
    assignment_id: inserted.id,
    reviewer_id: reviewer.id,
    assignment_role: inserted.assignment_role,
  }, request)

  const users = new Map([
    [reviewer.id, { name: reviewer.full_name?.trim() || reviewer.email, email: reviewer.email }],
    [user.id, { name: 'You', email: user.email ?? '' }],
  ])

  return Response.json({
    assignment: toPublicAssignment({
      ...inserted,
      assignment_role: body.assignment_role,
    }, users),
  }, { status: 201 })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!RunIdSchema.safeParse(id).success) {
    return Response.json({ error: 'Invalid ID' }, { status: 400 })
  }
  const assignmentId = new URL(request.url).searchParams.get('assignment_id')
  if (!assignmentId || !RunIdSchema.safeParse(assignmentId).success) {
    return Response.json({ error: 'A valid assignment_id is required.' }, { status: 400 })
  }

  const user = await authenticatedUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = await rateLimit(`review-revoke:${user.id}`, 20, 60_000)
  if (!rl.allowed) {
    return Response.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1_000)) } },
    )
  }

  let reason: string | null = null
  const rawText = await request.text().catch(() => '')
  if (rawText.trim()) {
    let rawBody: unknown
    try {
      rawBody = JSON.parse(rawText)
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const parsed = RevokeBodySchema.safeParse(rawBody)
    if (!parsed.success) {
      return Response.json({ error: 'The reason must be 500 characters or fewer.' }, { status: 422 })
    }
    reason = parsed.data.reason ?? null
  }

  const db = createAdminClient()
  const run = await ownedRun(db, id, user.id)
  if (run.kind === 'not_found') return Response.json(NOT_FOUND, { status: 404 })
  if (run.kind === 'error') {
    return Response.json({ error: 'Reviewer assignment could not be verified.' }, { status: 503 })
  }
  if (run.run.review_status === 'approved') {
    return Response.json(APPROVED_LOCKED, { status: 409 })
  }

  const { data: assignment, error: assignmentError } = await db
    .from('run_reviewer_assignments')
    .select('id, reviewer_id')
    .eq('id', assignmentId)
    .eq('search_run_id', id)
    .maybeSingle()
  if (assignmentError) {
    console.error('[reviewers] assignment lookup failed:', assignmentError.message)
    return Response.json({ error: 'Reviewer assignment could not be verified.' }, { status: 503 })
  }
  if (!assignment) return Response.json(NOT_FOUND, { status: 404 })

  const { data: revocation, error: revokeError } = await db
    .from('run_reviewer_assignment_revocations')
    .insert({ assignment_id: assignment.id, revoked_by: user.id, reason })
    .select('id, revoked_at')
    .single()
  if (revokeError || !revocation) {
    if (revokeError?.code === '23505') {
      return Response.json({ error: 'This reviewer was already removed.' }, { status: 409 })
    }
    console.error('[reviewers] revocation insert failed:', revokeError?.message ?? 'no row returned')
    return Response.json({ error: 'The reviewer could not be removed.' }, { status: 500 })
  }

  await logAuditEvent(user.id, 'review_assignment_revoked', {
    run_id: id,
    assignment_id: assignment.id,
    reviewer_id: assignment.reviewer_id,
    revocation_id: revocation.id,
    reason_provided: reason !== null,
  }, request)

  return Response.json({ assignment_id: assignment.id, revoked_at: revocation.revoked_at })
}
