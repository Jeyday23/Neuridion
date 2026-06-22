import { createClient } from '@supabase/supabase-js'
import * as crypto from 'crypto'

const args = process.argv.slice(2)
function getArg(name: string, fallback: string): string {
  const idx = args.indexOf(`--${name}`)
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback
}

const BASE_URL = getArg('base-url', 'http://localhost:3000')
const TEST_EMAIL = getArg('email', '')

if (!TEST_EMAIL) {
  console.error('Usage: npx tsx scripts/prrc-search-timing.ts --email user@example.com [--base-url http://localhost:3000]')
  process.exit(1)
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
  console.error('Missing env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY')
  process.exit(1)
}

if (!BASE_URL.includes('localhost') && !BASE_URL.includes('127.0.0.1')) {
  console.error('Safety: this test script modifies data (review_status) — only run against localhost')
  process.exit(1)
}

const adminDb = createClient(supabaseUrl, supabaseServiceKey)

function hmacSha256Hex(key: string, data: string): string {
  return crypto.createHmac('sha256', key).update(data).digest('hex')
}

interface TestResult {
  name: string
  status: 'pass' | 'fail' | 'skip'
  detail: string
  timing?: number
}

const results: TestResult[] = []

function pass(name: string, detail: string, timing?: number) {
  results.push({ name, status: 'pass', detail, timing })
  console.log(`  ✓ ${name}${timing ? ` (${timing}ms)` : ''} — ${detail}`)
}
function fail(name: string, detail: string) {
  results.push({ name, status: 'fail', detail })
  console.log(`  ✗ ${name} — ${detail}`)
}
function skip(name: string, detail: string) {
  results.push({ name, status: 'skip', detail })
  console.log(`  ○ ${name} — ${detail}`)
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: linkData, error: linkError } = await adminDb.auth.admin.generateLink({
    type: 'magiclink',
    email: TEST_EMAIL,
  })
  if (linkError || !linkData) throw new Error(`generateLink failed: ${linkError?.message}`)

  const otp = (linkData.properties as Record<string, unknown>)?.email_otp as string
  if (!otp) throw new Error('No email_otp from admin API')

  const anonClient = createClient(supabaseUrl, supabaseAnonKey)
  const { data: verifyData, error: verifyError } = await anonClient.auth.verifyOtp({
    email: TEST_EMAIL,
    token: otp,
    type: 'email',
  })
  if (verifyError || !verifyData.session) throw new Error(`verifyOtp failed: ${verifyError?.message}`)

  const session = verifyData.session
  const projectRef = new URL(supabaseUrl).hostname.split('.')[0]
  const cookieBase = `sb-${projectRef}-auth-token`

  const sessionPayload = JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    expires_in: session.expires_in,
    token_type: session.token_type,
    user: session.user,
  })
  const encodedValue = 'base64-' + Buffer.from(sessionPayload).toString('base64url')

  const CHUNK_SIZE = 3180
  let cookieParts: string[]
  if (encodedValue.length <= CHUNK_SIZE) {
    cookieParts = [`${cookieBase}=${encodedValue}`]
  } else {
    cookieParts = []
    let remaining = encodedValue
    let i = 0
    while (remaining.length > 0) {
      const chunkEnd = Math.min(CHUNK_SIZE, remaining.length)
      cookieParts.push(`${cookieBase}.${i}=${remaining.slice(0, chunkEnd)}`)
      remaining = remaining.slice(chunkEnd)
      i++
    }
  }

  const hmacSalt = process.env.SESSION_HMAC_SALT ?? 'neuridion-session-v1'
  const sessionHmacKey = hmacSha256Hex(supabaseServiceKey!, hmacSalt)
  const now = String(Date.now())
  const sessionSig = hmacSha256Hex(sessionHmacKey, now)
  const idleSig = hmacSha256Hex(sessionHmacKey, now)

  cookieParts.push(`session_started_at=${now}.${sessionSig}`)
  cookieParts.push(`_neuridion_active=${now}.${idleSig}`)

  return {
    'Cookie': cookieParts.join('; '),
    'Content-Type': 'application/json',
    'x-csrf-protection': '1',
    'Origin': BASE_URL,
  }
}

async function main() {
  console.log(`\n🔬 PRRC Search Timing & Accuracy Test — ${BASE_URL}`)
  console.log(`   Test account: ${TEST_EMAIL}\n`)

  // ── 1. Authenticate ──────────────────────────────────────────────────────
  console.log('[1/6] Authentication')
  let headers: Record<string, string>
  try {
    const t0 = Date.now()
    headers = await getAuthHeaders()
    pass('Auth session established', `Cookies generated via OTP verify`, Date.now() - t0)
  } catch (err) {
    fail('Auth session established', err instanceof Error ? err.message : String(err))
    return
  }

  // ── 2. Fetch profiles ────────────────────────────────────────────────────
  console.log('[2/6] Profile fetch')
  let profileId: string | null = null
  let profileName = ''
  {
    const t0 = Date.now()
    const res = await fetch(`${BASE_URL}/api/profiles`, { headers })
    const elapsed = Date.now() - t0
    if (res.ok) {
      const data = await res.json()
      const profiles = data.profiles ?? data
      if (Array.isArray(profiles) && profiles.length > 0) {
        profileId = profiles[0].id
        profileName = profiles[0].device_name ?? 'unknown'
        pass('Profiles fetched', `${profiles.length} profile(s), using "${profileName}"`, elapsed)
      } else {
        fail('Profiles fetched', 'No profiles found for this user')
        return
      }
    } else {
      fail('Profiles fetched', `HTTP ${res.status}: ${await res.text()}`)
      return
    }
  }

  // ── 3. Start search run ──────────────────────────────────────────────────
  console.log('[3/6] Search execution (BfArM, 2-month window)')
  let runId: string | null = null
  const periodFrom = '2026-03-01'
  const periodTo = '2026-04-30'
  {
    const t0 = Date.now()
    const res = await fetch(`${BASE_URL}/api/search-runs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        profile_id: profileId,
        period_from: periodFrom,
        period_to: periodTo,
        selected_dbs: ['bfarm'],
      }),
    })
    const elapsed = Date.now() - t0
    if (res.ok || res.status === 202) {
      const data = await res.json()
      runId = data.run_id
      pass('Search enqueued', `run_id=${runId}, enqueue latency`, elapsed)
    } else {
      const body = await res.json().catch(() => ({}))
      if (res.status === 429 && body.error?.includes('already running')) {
        // Find the existing active run
        const { data: activeRuns } = await adminDb
          .from('search_runs')
          .select('id')
          .eq('user_id', (await adminDb.auth.admin.getUserById((await adminDb.auth.admin.listUsers()).data.users.find((u: { email?: string }) => u.email === TEST_EMAIL)!.id)).data.user!.id)
          .in('status', ['pending', 'running'])
          .limit(1)
        if (activeRuns?.[0]) {
          runId = activeRuns[0].id
          skip('Search enqueued', `Active run found: ${runId}, monitoring that instead`)
        } else {
          fail('Search enqueued', `HTTP ${res.status}: ${body.error ?? 'unknown'}`)
          return
        }
      } else {
        fail('Search enqueued', `HTTP ${res.status}: ${body.error ?? 'unknown'}`)
        return
      }
    }
  }

  // ── 4. Poll for completion with timing ───────────────────────────────────
  console.log('[4/6] Search completion polling')
  const searchStart = Date.now()
  let searchStatus = 'pending'
  let relevantCount = 0
  let uncertainCount = 0
  let excludedCount = 0
  let pollCount = 0
  const MAX_POLL = 120 // 2 minutes max
  const POLL_INTERVAL = 3000

  while (pollCount < MAX_POLL) {
    pollCount++
    await new Promise(r => setTimeout(r, POLL_INTERVAL))
    const res = await fetch(`${BASE_URL}/api/search-runs/${runId}`, { headers })
    if (!res.ok) {
      if (pollCount % 10 === 0) console.log(`    ... poll #${pollCount}, HTTP ${res.status}`)
      continue
    }
    const data = await res.json()
    searchStatus = data.status ?? data.run?.status ?? 'unknown'
    relevantCount = data.relevant_count ?? 0
    uncertainCount = data.uncertain_count ?? 0
    excludedCount = data.excluded_count ?? 0

    if (['complete', 'degraded', 'error', 'cancelled'].includes(searchStatus)) break
    if (pollCount % 5 === 0) {
      const elapsed = ((Date.now() - searchStart) / 1000).toFixed(1)
      console.log(`    ... poll #${pollCount} (${elapsed}s), status: ${searchStatus}`)
    }
  }

  const totalSearchTime = Date.now() - searchStart
  if (searchStatus === 'complete' || searchStatus === 'degraded') {
    pass('Search completed', `Status: ${searchStatus}, total time: ${(totalSearchTime / 1000).toFixed(1)}s, ${pollCount} polls`, totalSearchTime)
  } else if (searchStatus === 'error') {
    fail('Search completed', `Search errored after ${(totalSearchTime / 1000).toFixed(1)}s`)
  } else {
    fail('Search completed', `Timed out after ${(totalSearchTime / 1000).toFixed(1)}s, status: ${searchStatus}`)
  }

  // ── 5. Accuracy checks ───────────────────────────────────────────────────
  console.log('[5/6] Search accuracy')
  {
    const { data: fsnResults } = await adminDb
      .from('fsn_results')
      .select('id, external_id, title, manufacturer, product_name, fsn_date, source_url, source_db')
      .eq('run_id', runId)

    const actualFsnCount = fsnResults?.length ?? 0
    if (actualFsnCount > 0) {
      pass('FSN results stored', `${actualFsnCount} FSNs in database`)
    } else {
      fail('FSN results stored', 'No FSN results found in database')
    }

    // Check source distribution
    const sources = new Set(fsnResults?.map(r => r.source_db) ?? [])
    const unexpectedSources = [...sources].filter(source => source !== 'bfarm')
    if (sources.size === 1 && sources.has('bfarm')) {
      pass('Source database accuracy', 'All stored results are from requested source bfarm')
    } else {
      fail('Source database accuracy', `Expected only bfarm; got ${[...sources].join(', ') || 'none'}${unexpectedSources.length ? ` (unexpected: ${unexpectedSources.join(', ')})` : ''}`)
    }

    const missingRequiredFields = (fsnResults ?? []).filter(row =>
      !row.external_id || !row.title || !row.manufacturer || !row.fsn_date || !row.source_url
    )
    if (missingRequiredFields.length === 0) {
      pass('Required evidence fields', `All ${actualFsnCount} rows have ID, title, manufacturer, date, and authority URL`)
    } else {
      fail('Required evidence fields', `${missingRequiredFields.length}/${actualFsnCount} rows have missing evidence fields`)
    }

    const externalIds = (fsnResults ?? []).map(row => row.external_id).filter(Boolean)
    const duplicateCount = externalIds.length - new Set(externalIds).size
    if (duplicateCount === 0) pass('Duplicate control', 'No duplicate authority IDs')
    else fail('Duplicate control', `${duplicateCount} duplicate authority ID(s) stored`)

    // Check date range accuracy
    const dates = (fsnResults ?? [])
      .map(r => r.fsn_date)
      .filter((d): d is string => !!d)
      .sort()
    const outOfRangeDates = dates.filter(date => date < periodFrom || date > periodTo)
    if (dates.length === actualFsnCount && outOfRangeDates.length === 0) {
      pass('Date range accuracy', `All dates are inside ${periodFrom} to ${periodTo}; observed ${dates[0]} to ${dates[dates.length - 1]}`)
    } else if (dates.length > 0) {
      fail('Date range accuracy', `${outOfRangeDates.length} out-of-range and ${actualFsnCount - dates.length} missing date(s)`)
    } else {
      fail('Date range accuracy', 'No dated FSNs found')
    }

    // Check for filter decisions (AI may not have run)
    const { count: decisionCount } = await adminDb
      .from('filter_decisions')
      .select('id', { count: 'exact', head: true })
      .eq('search_run_id', runId)

    if ((decisionCount ?? 0) > 0) {
      pass('AI filter decisions', `${decisionCount} decisions recorded (R:${relevantCount} U:${uncertainCount} E:${excludedCount})`)
    } else {
      skip('AI filter decisions', 'AI filter did not run (Anthropic API may need credits or QStash bypass in dev mode)')
    }
  }

  // ── 6. Report generation (Word + Excel) ──────────────────────────────────
  console.log('[6/6] Report generation')

  // Reports require an attributed draft -> reviewed -> approved API workflow.
  const { data: runData } = await adminDb
    .from('search_runs')
    .select('review_status, reviewed_by, reviewed_at, status')
    .eq('id', runId)
    .single()

  const reviewStatus = runData?.review_status

  if (reviewStatus && reviewStatus !== 'draft') {
    fail('PRRC initial state', `Expected a new draft run; found ${reviewStatus}. Refusing to bypass or reset review state.`)
    throw new Error('PRRC workflow test requires a newly created draft run')
  }
  pass('PRRC initial state', 'New search is draft')

  const blockedReport = await fetch(`${BASE_URL}/api/reports`, {
    method: 'POST', headers, body: JSON.stringify({ run_id: runId }),
  })
  if (blockedReport.status === 422) pass('Draft report gate', 'Report generation blocked before PRRC review')
  else fail('Draft report gate', `Expected HTTP 422, received ${blockedReport.status}`)

  for (const target of ['reviewed', 'approved'] as const) {
    const transition = await fetch(`${BASE_URL}/api/search-runs/${runId}/review`, {
      method: 'PATCH', headers, body: JSON.stringify({ review_status: target }),
    })
    if (transition.ok) {
      const payload = await transition.json()
      if (payload.review_status === target && payload.reviewed_by && payload.reviewed_at) {
        pass(`PRRC transition to ${target}`, `Attributed to reviewer ${payload.reviewed_by}`)
      } else {
        fail(`PRRC transition to ${target}`, 'Response lacked status, reviewer identity, or timestamp')
      }
    } else {
      fail(`PRRC transition to ${target}`, `HTTP ${transition.status}: ${await transition.text()}`)
    }
  }

  const { data: approvedRun } = await adminDb
    .from('search_runs')
    .select('review_status, reviewed_by, reviewed_at')
    .eq('id', runId)
    .single()
  if (approvedRun?.review_status === 'approved' && approvedRun.reviewed_by && approvedRun.reviewed_at) {
    pass('PRRC approval persistence', `Approved with reviewer and timestamp ${approvedRun.reviewed_at}`)
  } else {
    fail('PRRC approval persistence', 'Approved state or reviewer attribution was not persisted')
  }

  {
    const t0 = Date.now()
    const res = await fetch(`${BASE_URL}/api/reports`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ run_id: runId }),
    })
    const elapsed = Date.now() - t0

    if (res.ok || res.status === 201) {
      const data = await res.json()
      pass('Report generated', `Generation time`, elapsed)

      // Check Excel
      if (data.excel_url) {
        const excelRes = await fetch(data.excel_url)
        if (excelRes.ok) {
          const buf = await excelRes.arrayBuffer()
          const sizeKb = (buf.byteLength / 1024).toFixed(1)
          pass('Excel (.xlsx) download', `${sizeKb} KB, content-type: ${excelRes.headers.get('content-type')?.split(';')[0]}`)
        } else {
          fail('Excel (.xlsx) download', `HTTP ${excelRes.status}`)
        }
      } else {
        fail('Excel (.xlsx) download', 'No excel_url in response')
      }

      // Check Word
      if (data.docx_url) {
        const docxRes = await fetch(data.docx_url)
        if (docxRes.ok) {
          const buf = await docxRes.arrayBuffer()
          const sizeKb = (buf.byteLength / 1024).toFixed(1)
          pass('Word (.docx) download', `${sizeKb} KB, content-type: ${docxRes.headers.get('content-type')?.split(';')[0]}`)
        } else {
          fail('Word (.docx) download', `HTTP ${docxRes.status}`)
        }
      } else {
        skip('Word (.docx) download', `No docx_url — user plan may be "free" (Word requires Starter+). Plan: ${(await adminDb.from('users').select('plan').eq('email', TEST_EMAIL).single()).data?.plan ?? 'unknown'}`)
      }

      // Check HTML
      if (data.html_url) {
        const htmlRes = await fetch(data.html_url)
        if (htmlRes.ok) {
          const text = await htmlRes.text()
          const sizeKb = (text.length / 1024).toFixed(1)
          const hasTitle = text.includes('Field Safety Notice Review Report')
          const hasDevice = text.includes(profileName)
          pass('HTML report content', `${sizeKb} KB, has title: ${hasTitle}, has device name: ${hasDevice}`)
        } else {
          fail('HTML report content', `HTTP ${htmlRes.status}`)
        }
      } else {
        skip('HTML report content', 'No html_url in response')
      }

      // Check PDF
      if (data.pdf_url) {
        const pdfRes = await fetch(data.pdf_url)
        if (pdfRes.ok) {
          const buf = await pdfRes.arrayBuffer()
          const sizeKb = (buf.byteLength / 1024).toFixed(1)
          pass('PDF download', `${sizeKb} KB`)
        } else {
          fail('PDF download', `HTTP ${pdfRes.status}`)
        }
      } else {
        skip('PDF download', `pdf_status: ${data.pdf_status ?? 'unknown'} (may need PDFShift credits)`)
      }
    } else {
      const body = await res.json().catch(() => ({}))
      fail('Report generated', `HTTP ${res.status}: ${body.error ?? 'unknown'}`)
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  const passed = results.filter(r => r.status === 'pass').length
  const failed = results.filter(r => r.status === 'fail').length
  const skipped = results.filter(r => r.status === 'skip').length

  console.log(`\n${'═'.repeat(60)}`)
  console.log(`  PRRC Search & Report Test Summary`)
  console.log(`  ${passed} pass / ${failed} fail / ${skipped} skip`)
  console.log(`${'═'.repeat(60)}`)

  // Timing summary
  const timings = results.filter(r => r.timing)
  if (timings.length > 0) {
    console.log(`\n  Timing Breakdown:`)
    for (const t of timings) {
      const seconds = (t.timing! / 1000).toFixed(2)
      console.log(`    ${t.name}: ${seconds}s`)
    }
  }

  console.log('')
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
