import pLimit from 'p-limit'
import {
  stage1Filter,
  getProfileFingerprint,
  getFsnExternalId,
  buildRankingRequest,
  FILTER_PROMPT_VERSION,
  PRODUCTION_FILTER_PROVIDER,
  PRODUCTION_FILTER_MODEL,
  type FilterDecision,
} from '@/lib/claude/filter-pipeline'
import { computeInputSha256, computeOutputSha256 } from '@/lib/ai/provider'
import { buildManufacturerSearchTerms, extractManufacturerTerms } from '@/lib/search/manufacturer-terms'
import { matchesKeywordSignature, matchesKeywordTerm } from '@/lib/search/keyword-match'
import { fetchBfarmDetail } from '@/lib/scrapers/bfarm'
import { sanitizeForLlm } from '@/lib/scrapers/sanitize'
import { PMS_CLASSIFICATION_RULESET_VERSION } from '@/lib/regulatory/pms-classification-rules'
import {
  assessDeterministicDisposition,
  assessVigilanceBypass,
} from '@/lib/regulatory/deterministic-safety'
import type { PipelineContext, InsertedFsnRow, DecisionRow } from '../types'

const TRUST_SOURCE_FILTER = new Set(['fda'])
const PRIMARY_PROVIDER = PRODUCTION_FILTER_PROVIDER
const PRIMARY_MODEL = PRODUCTION_FILTER_MODEL

type CachedDecision = {
  fsn_external_id: string
  decision: string
  reasoning: string | null
  confidence: string | number | null
  provider?: string | null
  model_id?: string | null
  prompt_version?: string | null
  ruleset_version?: string | null
  input_sha256?: string | null
  output_sha256?: string | null
  original_decision_at?: string | null
  presentation_rank?: string | null
}

/** Exact bounded, sanitized evidence snapshot supplied to the production ranker. */
export function computeFilterInputSha256(row: InsertedFsnRow, profile: PipelineContext['profile']): string {
  return computeInputSha256(buildRankingRequest({
    title: row.title,
    manufacturer: row.manufacturer ?? '',
    raw_content: row.raw_content ?? '',
    fsn_date: row.fsn_date,
    source_db: row.source_db,
  }, profile))
}

export function computeFilterOutputSha256(input: {
  decision: string
  rationale: string | null
  confidence: string | number | null
  provider: string
  modelId: string
  promptVersion: string
  rulesetVersion: string
  presentationRank: string
}): string {
  const confidence = normalizeCachedConfidence(input.confidence)
  return computeOutputSha256({
    rank: input.presentationRank as 'high' | 'medium' | 'low',
    rationale: input.rationale ?? '',
    confidence: confidence ?? 0.5,
  })
}

export function normalizeCachedConfidence(value: string | number | null): number | null {
  if (value == null) return null
  const parsed = typeof value === 'number' ? value : parseFloat(value)
  if (!Number.isFinite(parsed)) return null
  const normalized = parsed > 1 ? parsed / 100 : parsed
  return Math.max(0, Math.min(1, normalized))
}

export function isTerminalAiAvailabilityFailure(decision: FilterDecision): boolean {
  if (decision.decision !== 'filter_failed') return false
  const detail = `${decision.error ?? ''} ${decision.rationale}`.toLowerCase()
  return /credit_exhausted|credit balance|insufficient_quota|billing|authentication|invalid api key/.test(detail)
}

function deterministicAiUnavailableDecision(row: InsertedFsnRow, reason: 'credit_or_auth' | 'run_circuit_open') {
  const explanation = reason === 'credit_or_auth'
    ? 'AI review unavailable because the Anthropic provider account is not currently usable. '
    : 'AI review unavailable for this run after an earlier provider availability failure. '

  return {
    fsn_result_id: row.id,
    decision: 'filter_failed' as const,
    rationale:
      explanation +
      'Raw source retrieval retained this item for PRRC manual review. ' +
      'No AI relevance classification was applied.',
    confidence: null,
    model: 'deterministic-ai-unavailable',
    decision_method: 'ai_unavailable' as const,
    presentation_rank: 'high' as const,
    provider: PRIMARY_PROVIDER,
    model_id: PRIMARY_MODEL,
    prompt_version: FILTER_PROMPT_VERSION,
    ruleset_version: PMS_CLASSIFICATION_RULESET_VERSION,
    original_decision_at: new Date().toISOString(),
    cache_hit: false,
  }
}

// Cache key computation lives in filter-pipeline.ts (getFsnExternalId) —
// single source of truth, content-aware since fp-v2.
function fsnIdOf(fsn: InsertedFsnRow): string {
  return getFsnExternalId({
    title:        fsn.title,
    manufacturer: fsn.manufacturer ?? '',
    raw_content:  fsn.raw_content ?? '',
    fsn_date:     fsn.fsn_date,
    source_db:    fsn.source_db,
  })
}

function isValidTimestamp(value: string | null | undefined): value is string {
  return Boolean(value && !Number.isNaN(Date.parse(value)))
}

function cachedDecisionFor(
  row: InsertedFsnRow,
  hit: CachedDecision,
  profile: PipelineContext['profile'],
): DecisionRow | null {
  if (hit.decision !== 'relevant' && hit.decision !== 'uncertain') return null
  if (hit.provider !== PRIMARY_PROVIDER || hit.model_id !== PRIMARY_MODEL) return null
  if (hit.prompt_version !== FILTER_PROMPT_VERSION) return null
  if (hit.ruleset_version !== PMS_CLASSIFICATION_RULESET_VERSION) return null
  if (!isValidTimestamp(hit.original_decision_at)) return null
  if (!['high', 'medium', 'low'].includes(hit.presentation_rank ?? '')) return null

  const expectedInputHash = computeFilterInputSha256(row, profile)
  if (hit.input_sha256 !== expectedInputHash) return null
  const expectedOutputHash = computeFilterOutputSha256({
    decision: hit.decision,
    rationale: hit.reasoning,
    confidence: hit.confidence,
    provider: hit.provider,
    modelId: hit.model_id,
    promptVersion: hit.prompt_version,
    rulesetVersion: hit.ruleset_version,
    presentationRank: hit.presentation_rank!,
  })
  if (hit.output_sha256 !== expectedOutputHash) return null

  return {
    fsn_result_id: row.id,
    decision: hit.decision,
    rationale: hit.reasoning ?? '',
    confidence: normalizeCachedConfidence(hit.confidence),
    model: hit.model_id,
    decision_method: 'ai_ranking',
    presentation_rank: hit.presentation_rank as 'high' | 'medium' | 'low',
    provider: hit.provider,
    model_id: hit.model_id,
    prompt_version: hit.prompt_version,
    ruleset_version: hit.ruleset_version,
    input_sha256: hit.input_sha256,
    output_sha256: hit.output_sha256,
    original_decision_at: hit.original_decision_at,
    cache_hit: true,
  }
}

function invalidCacheDecision(row: InsertedFsnRow): DecisionRow {
  return {
    fsn_result_id: row.id,
    decision: 'filter_failed',
    rationale: 'A prior model decision exists but its complete provenance could not be verified. The cached decision was not reused; manual PRRC review is required.',
    confidence: null,
    model: null,
    error: 'unverifiable_cache_provenance',
    decision_method: 'manual_review_required',
    presentation_rank: 'high',
    ruleset_version: PMS_CLASSIFICATION_RULESET_VERSION,
    cache_hit: false,
  }
}

function normalizeAiDecision(
  row: InsertedFsnRow,
  profile: PipelineContext['profile'],
  decision: FilterDecision,
): DecisionRow {
  const candidate = decision as FilterDecision & Partial<DecisionRow>
  const coerced = candidate.decision === 'excluded'
  const normalizedDecision = coerced ? 'uncertain' : candidate.decision
  const rank = candidate.presentation_rank
    ?? (normalizedDecision === 'relevant' ? 'high' : normalizedDecision === 'uncertain' ? 'low' : 'high')
  const rationale = coerced
    ? `${candidate.rationale} [Safety control: an AI-generated exclusion cannot remove a record; disposition coerced to uncertain for human review.]`
    : candidate.rationale
  const provider = candidate.provider ?? (candidate.model ? PRIMARY_PROVIDER : null)
  const modelId = candidate.model_id ?? candidate.model
  const originalDecisionAt = candidate.original_decision_at ?? new Date().toISOString()
  const inputHash = candidate.input_sha256 ?? computeFilterInputSha256(row, profile)
  const promptVersion = candidate.prompt_version ?? (modelId ? FILTER_PROMPT_VERSION : null)
  const rulesetVersion = candidate.ruleset_version ?? PMS_CLASSIFICATION_RULESET_VERSION
  const outputHash = candidate.output_sha256 ?? (
    provider && modelId && promptVersion
      ? computeFilterOutputSha256({
          decision: normalizedDecision,
          rationale,
          confidence: candidate.confidence,
          provider,
          modelId,
          promptVersion,
          rulesetVersion,
          presentationRank: rank,
        })
      : null
  )

  return {
    ...candidate,
    fsn_result_id: row.id,
    decision: normalizedDecision,
    rationale,
    decision_method: normalizedDecision === 'filter_failed' ? 'manual_review_required' : 'ai_ranking',
    presentation_rank: rank,
    provider,
    model_id: modelId,
    prompt_version: promptVersion,
    ruleset_version: rulesetVersion,
    input_sha256: inputHash,
    output_sha256: outputHash,
    original_decision_at: originalDecisionAt,
    cache_hit: false,
  }
}

export function computeKeywordPriority(
  hay: string,
  manufacturerTerms: string[],
  deviceTerms: string[],
  competitorTerms: string[],
): number {
  const h = hay.toLowerCase()
  const mfrMatch = manufacturerTerms.length > 0 && manufacturerTerms.some((t) => matchesKeywordTerm(h, t))
  const devMatch = matchesKeywordSignature(h, deviceTerms)
  const compMatch = competitorTerms.some((t) => matchesKeywordTerm(h, t))

  if (mfrMatch && devMatch) return 0
  if (devMatch)             return 1
  if (mfrMatch)             return 2
  if (compMatch)            return 3
  return 4
}

export async function filterStage(ctx: PipelineContext): Promise<void> {
  if (ctx.insertedRows.length === 0) return

  const { profile, aiOptOut, insertedRows, contentChanged, db } = ctx
  const profileFingerprint = getProfileFingerprint(profile)

  // 1. Deterministic scope is evaluated before any model or model cache. The
  // current source schema provides only a verified record date; absent
  // structured identifiers fail open to human/model ranking rather than being
  // inferred from free text.
  const residualRows: InsertedFsnRow[] = []
  let deterministicExcluded = 0
  for (const row of insertedRows) {
    const assessment = assessDeterministicDisposition({
      record: { recordDate: row.fsn_date },
      profile: { dateWindow: { from: ctx.payload.period_from, to: ctx.payload.period_to } },
    })
    if (assessment.disposition === 'excluded') {
      deterministicExcluded += 1
      ctx.decisions.push({
        fsn_result_id: row.id,
        decision: 'excluded',
        rationale: assessment.evidence.map((item) => item.explanation).join(' '),
        confidence: 1,
        model: null,
        decision_method: 'deterministic_scope',
        presentation_rank: 'low',
        provider: null,
        model_id: null,
        prompt_version: null,
        ruleset_version: assessment.rulesetVersion,
        original_decision_at: new Date().toISOString(),
        cache_hit: false,
        deterministic_reason_codes: assessment.reasonCodes,
        deterministic_evidence: {
          ruleset_version: assessment.rulesetVersion,
          retention: assessment.retention,
          evidence: assessment.evidence,
        },
      })
      continue
    }
    residualRows.push(row)
  }

  // 2. Vigilance bypass runs on the residual before cache/model lookup. These
  // records are always queued for human review and the model cannot downgrade
  // that disposition.
  const cacheCandidates: InsertedFsnRow[] = []
  let vigilanceBypassed = 0
  for (const row of residualRows) {
    const vigilance = assessVigilanceBypass({
      title: row.title,
      rawContent: row.raw_content,
    })
    if (vigilance.requiresHumanReview) {
      vigilanceBypassed += 1
      ctx.decisions.push({
        fsn_result_id: row.id,
        decision: 'uncertain',
        rationale: `Vigilance bypass requires human PRRC review (${vigilance.reasonCodes.join(', ')}). No model disposition was allowed to suppress this record.`,
        confidence: null,
        model: null,
        decision_method: 'vigilance_bypass',
        presentation_rank: 'high',
        provider: null,
        model_id: null,
        prompt_version: null,
        ruleset_version: vigilance.rulesetVersion,
        original_decision_at: new Date().toISOString(),
        cache_hit: false,
        deterministic_reason_codes: vigilance.reasonCodes,
        deterministic_evidence: {
          ruleset_version: vigilance.rulesetVersion,
          bypass_model_disposition: vigilance.bypassModelDisposition,
          evidence: vigilance.evidence,
        },
        vigilance_reason_codes: vigilance.reasonCodes,
        vigilance_evidence: vigilance.evidence,
      })
      continue
    }
    cacheCandidates.push(row)
  }
  ctx.timing.filter_deterministic_excluded = deterministicExcluded
  ctx.timing.filter_vigilance_bypassed = vigilanceBypassed

  if (cacheCandidates.length === 0) {
    ctx.timing.filter_total_items = insertedRows.length
    ctx.timing.filter_cache_hits = 0
    ctx.timing.filter_needs_filter = 0
    ctx.timing.filter_content_changed = 0
    ctx.timing.filter_unverifiable_cache = 0
    ctx.timing.filter_to_filter = 0
    ctx.timing.ai_review_status = 'not_required_safety_disposition'
    return
  }

  if (profile.controlled_evidence_status === 'unavailable') {
    ctx.timing.ai_review_status = 'controlled_evidence_unavailable'
    ctx.timing.filter_total_items = insertedRows.length
    ctx.timing.filter_to_filter = 0
    for (const row of cacheCandidates) {
      ctx.decisions.push({
        fsn_result_id: row.id,
        decision: 'filter_failed',
        rationale: 'Referenced controlled product evidence was unavailable or could not be extracted. No AI relevance classification was applied; manual PRRC review is required.',
        confidence: null,
        model: null,
        error: 'controlled_evidence_unavailable',
        decision_method: 'manual_review_required',
        presentation_rank: 'high',
        ruleset_version: PMS_CLASSIFICATION_RULESET_VERSION,
        cache_hit: false,
      })
    }
    return
  }

  // 3. Batch cache lookup. A cache entry is reusable only when every identity
  // and integrity field matches the current sanitized input and configuration.
  const cacheLookup = await db
    .from('filter_decision_cache')
    .select('fsn_external_id, decision, reasoning, confidence, provider, model_id, prompt_version, ruleset_version, input_sha256, output_sha256, original_decision_at, presentation_rank')
    .in('fsn_external_id', cacheCandidates.map((r) => fsnIdOf(r)))
    .eq('profile_fingerprint', profileFingerprint)

  const cacheMap = new Map<string, CachedDecision>()
  for (const rawHit of cacheLookup.data ?? []) {
    const hit = rawHit as unknown as CachedDecision
    cacheMap.set(hit.fsn_external_id, hit)
  }

  const alreadyCached: InsertedFsnRow[] = []
  const needsFilter: InsertedFsnRow[] = []
  const unverifiableCache: InsertedFsnRow[] = []
  let contentChangedCount = 0

  // Missing provenance columns are a rolling-deployment compatibility event,
  // not permission to trust a legacy verdict. Fail closed to manual review.
  if (cacheLookup.error) {
    unverifiableCache.push(...cacheCandidates)
    ctx.warnings.push('Model decision cache provenance could not be verified; affected records require manual PRRC review.')
  }

  for (const row of cacheLookup.error ? [] : cacheCandidates) {
    const skipCache = contentChanged.has(row.external_id ?? '')
    if (skipCache) contentChangedCount += 1
    const hit = cacheMap.get(fsnIdOf(row))
    if (skipCache || !hit) {
      needsFilter.push(row)
      continue
    }
    if (cachedDecisionFor(row, hit, profile)) alreadyCached.push(row)
    else unverifiableCache.push(row)
  }

  for (const row of unverifiableCache) ctx.decisions.push(invalidCacheDecision(row))

  ctx.timing.filter_total_items = insertedRows.length
  ctx.timing.filter_cache_hits = alreadyCached.length
  ctx.timing.filter_needs_filter = needsFilter.length
  ctx.timing.filter_content_changed = contentChangedCount
  ctx.timing.filter_unverifiable_cache = unverifiableCache.length

  console.error(
    '[pipeline]',
    `run_id=${ctx.runId} filter audit: total=${insertedRows.length} ` +
    `deterministic_excluded=${deterministicExcluded} vigilance_bypassed=${vigilanceBypassed} ` +
    `cache_hits=${alreadyCached.length} unverifiable_cache=${unverifiableCache.length} ` +
    `needs_filter=${needsFilter.length} content_changed=${contentChangedCount}`,
  )

  for (const row of alreadyCached) {
    const hit = cacheMap.get(fsnIdOf(row))!
    const verified = cachedDecisionFor(row, hit, profile)
    if (verified) ctx.decisions.push(verified)
  }

  // 2. Manufacturer keyword boost (informational only — never excludes items)
  // All items proceed to AI filtering regardless of keyword match.
  // Keyword match is recorded as a boost signal for downstream use.
  const ownFilterTerms    = buildManufacturerSearchTerms(profile.manufacturer ?? '', profile.device_name ?? '')
  const manufacturerTerms = extractManufacturerTerms(profile.manufacturer ?? '')
  const deviceTerms       = ownFilterTerms.filter((t) => !manufacturerTerms.includes(t))
  const { competitorTerms } = ctx
  const priorityScores = new Map<string, number>()

  for (const row of needsFilter) {
    if (row.source_db && TRUST_SOURCE_FILTER.has(row.source_db)) {
      priorityScores.set(row.id, 0)
      continue
    }
    const hay = `${row.title} ${row.manufacturer} ${row.raw_content}`.toLowerCase()
    priorityScores.set(row.id, computeKeywordPriority(hay, manufacturerTerms, deviceTerms, competitorTerms))
  }

  const boostedCount = [...priorityScores.values()].filter(s => s < 4).length
  ctx.timing.filter_keyword_boosted = boostedCount
  console.error(
    '[pipeline]',
    `run_id=${ctx.runId} keyword_boost: ${boostedCount}/${needsFilter.length} ` +
    `items needing fresh filtering matched keyword terms ` +
    `(total=${insertedRows.length} cache_hits=${alreadyCached.length})`,
  )

  if (ctx.onProgress) {
    await ctx.onProgress({
      current_source: null,
      sources_done: ctx.activeSources,
      sources_total: ctx.activeSources,
      items_found: ctx.insertedRows.length,
      filter_progress: { done: 0, total: needsFilter.length, cached: alreadyCached.length },
    })
  }

  needsFilter.sort((a, b) => (priorityScores.get(a.id) ?? 4) - (priorityScores.get(b.id) ?? 4))

  // 3. AI filter (or opt-out)
  if (aiOptOut) {
    console.error('[pipeline]', `run_id=${ctx.runId} ai_opt_out=true — skipping AI filter, marking ${needsFilter.length} items for manual review`)
    ctx.timing.ai_review_status = 'disabled_by_user'
    ctx.warnings.push('AI relevance review was disabled by user preference; all unreviewed raw source records require manual PRRC review.')
    for (const row of needsFilter) {
      ctx.decisions.push({
        fsn_result_id: row.id,
        decision:      'filter_failed',
        rationale:     'AI filtering disabled per user preference (GDPR Art 22).',
        confidence:    null,
        model:         null,
        decision_method: 'manual_review_required',
        presentation_rank: 'high',
        ruleset_version: PMS_CLASSIFICATION_RULESET_VERSION,
        cache_hit: false,
      })
    }
    return
  }

  // Per-run AI filter cap
  const n = Number(process.env.MAX_FILTER_ITEMS_PER_RUN)
  const MAX_FILTER_ITEMS = Number.isFinite(n) && n > 0 ? n : 300
  if (needsFilter.length > MAX_FILTER_ITEMS) {
    const skipped = needsFilter.slice(MAX_FILTER_ITEMS)
    ctx.timing.filter_cap_skipped = skipped.length
    ctx.timing.ai_review_cap = MAX_FILTER_ITEMS
    ctx.timing.ai_review_status = 'incomplete_cap'
    console.error('[pipeline]', `item cap: ${skipped.length} items skipped (limit=${MAX_FILTER_ITEMS})`)
    ctx.warnings.push(
      `${skipped.length} raw source record${skipped.length !== 1 ? 's were' : ' was'} not AI-reviewed because the run review cap is ${MAX_FILTER_ITEMS}; manual PRRC review is required.`,
    )
    for (const row of skipped) {
      ctx.decisions.push({
        fsn_result_id: row.id,
        decision:      'filter_failed',
        rationale:     `Run item limit (${MAX_FILTER_ITEMS}) reached — manual review required.`,
        confidence:    null,
        model:         null,
        decision_method: 'manual_review_required',
        presentation_rank: 'high',
        ruleset_version: PMS_CLASSIFICATION_RULESET_VERSION,
        cache_hit: false,
      })
    }
  }
  const toFilter = needsFilter.slice(0, MAX_FILTER_ITEMS)
  ctx.timing.filter_to_filter = toFilter.length
  if (needsFilter.length <= MAX_FILTER_ITEMS) ctx.timing.filter_cap_skipped = 0
  console.error(
    '[pipeline]',
    `run_id=${ctx.runId} filter execution: ai_candidates=${toFilter.length} ` +
    `cap_skipped=${ctx.timing.filter_cap_skipped} cache_hits=${alreadyCached.length}`,
  )

  const FILTER_DEADLINE_MS = 660_000
  const filterStartMs = Date.now()

  const filterLimit = pLimit(6)
  let cancelledDuringFilter = false
  let itemsProcessed = 0
  let terminalAiFailure: FilterDecision | null = null

  const filterRow = async (row: InsertedFsnRow) => {
    if (terminalAiFailure) {
      return deterministicAiUnavailableDecision(row, 'run_circuit_open')
    }
    if (cancelledDuringFilter) {
      return { fsn_result_id: row.id, decision: 'filter_failed' as const, rationale: 'Run cancelled by user.', confidence: null, model: null }
    }

    const myIndex = itemsProcessed++

    if (myIndex > 0 && myIndex % 20 === 0) {
      if (await ctx.isCancelled()) {
        cancelledDuringFilter = true
        console.error(`[pipeline] run_id=${ctx.runId} filter stage: cancellation detected at item ${myIndex}/${toFilter.length}`)
        return { fsn_result_id: row.id, decision: 'filter_failed' as const, rationale: 'Run cancelled by user.', confidence: null, model: null }
      }
    }

    if (Date.now() - filterStartMs > FILTER_DEADLINE_MS) {
      console.error(`[pipeline] run_id=${ctx.runId} filter deadline reached at item ${myIndex}/${toFilter.length}`)
      return { fsn_result_id: row.id, decision: 'filter_failed' as const, rationale: 'Filter time limit reached — manual review required.', confidence: null, model: null }
    }

    if (myIndex > 0 && myIndex % 10 === 0 && ctx.onProgress) {
      await ctx.onProgress({
        current_source: null,
        sources_done: ctx.activeSources,
        sources_total: ctx.activeSources,
        items_found: ctx.insertedRows.length,
        filter_progress: { done: myIndex, total: toFilter.length, cached: alreadyCached.length },
      })
    }

    const d = await stage1Filter(
      { title: row.title, manufacturer: row.manufacturer ?? '', raw_content: row.raw_content ?? '', fsn_date: row.fsn_date, source_db: row.source_db },
      profile,
      { skipCache: true },
    )
    if (isTerminalAiAvailabilityFailure(d)) {
      terminalAiFailure = d
      return deterministicAiUnavailableDecision(row, 'credit_or_auth')
    }
    return normalizeAiDecision(row, profile, d)
  }

  // Probe one item before opening concurrency. This prevents an exhausted or
  // invalid API account from producing one failed request per worker slot.
  const filterResults = [] as Array<Awaited<ReturnType<typeof filterRow>>>
  if (toFilter.length > 0) {
    filterResults.push(await filterRow(toFilter[0]))
    if (terminalAiFailure) {
      for (const row of toFilter.slice(1)) filterResults.push(await filterRow(row))
    } else {
      filterResults.push(...await Promise.all(
        toFilter.slice(1).map((row) => filterLimit(() => filterRow(row))),
      ))
    }
  }
  if (terminalAiFailure) {
    ctx.timing.ai_review_status = 'provider_unavailable'
    ctx.timing.ai_review_provider_error = 'billing_or_authentication'
    ctx.warnings.push('AI relevance review was unavailable because the AI provider rejected the request for billing/authentication reasons; manual PRRC review is required.')
  } else if ((ctx.timing.filter_cap_skipped as number | undefined) && ctx.timing.ai_review_status !== 'provider_unavailable') {
    ctx.timing.ai_review_status = 'incomplete_cap'
  } else {
    ctx.timing.ai_review_status = 'complete'
  }
  ctx.decisions.push(...filterResults)

  // 4. BfArM detail enrichment for uncertain items
  const uncertainBfarm = filterResults.filter(
    d => d.decision === 'uncertain' && toFilter.find(r => r.id === d.fsn_result_id)?.source_db === 'bfarm'
  )
  if (uncertainBfarm.length > 0) {
    const detailLimit = pLimit(2)
    const pendingUpdates: { id: string; content: string }[] = []
    const enriched = await Promise.all(
      uncertainBfarm.map(d => detailLimit(async () => {
        const row = toFilter.find(r => r.id === d.fsn_result_id)
        if (!row) return null
        const fsnRow = ctx.insertedRows.find(i => i.external_id === row.external_id)
        if (!fsnRow?.source_url) return null
        const detail = await fetchBfarmDetail(fsnRow.source_url)
        if (!detail) return null
        const enrichedContent = sanitizeForLlm(`${row.title}\n\n${detail}`, 8000)
        pendingUpdates.push({ id: row.id, content: enrichedContent })
        // Cache key is content-aware since fp-v2, so the enriched-content
        // decision is safely readable from cache on re-runs.
        const refiltered = await stage1Filter(
          { title: row.title, manufacturer: row.manufacturer ?? '', raw_content: enrichedContent, fsn_date: row.fsn_date, source_db: row.source_db },
          profile,
        )
        return normalizeAiDecision(row, profile, refiltered)
      }))
    )

    // Batch all content updates
    if (pendingUpdates.length > 0) {
      await Promise.all(
        pendingUpdates.map((u) => db.from('fsn_results').update({ raw_content: u.content }).eq('id', u.id))
      )
    }

    for (const result of enriched) {
      if (!result || result.decision === 'uncertain') continue
      // Push re-filtered decision as additional entry (preserves audit trail)
      ctx.decisions.push(result)
    }
  }
}
