/** Runs actual migration SQL in isolated PostgreSQL WASM; never connects to production.
 * npm install --prefix /tmp/neuridion-sql-test --no-save --package-lock=false @electric-sql/pglite@0.3.15
 * PGLITE_MODULE=/tmp/neuridion-sql-test/node_modules/@electric-sql/pglite/dist/index.js node scripts/test-run-release-integrity.mjs
 * Single-session checks do not simulate concurrent lock waits.
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite')
const db = new PGlite()
await db.exec(`
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  CREATE TABLE public.search_runs (id uuid PRIMARY KEY, status text NOT NULL DEFAULT 'running',
    completed_at timestamptz, deleted_at timestamptz, is_synthetic_canary boolean NOT NULL DEFAULT false,
    total_scraped integer DEFAULT 0, review_status text DEFAULT 'draft', reviewed_by uuid, reviewed_at timestamptz,
    report_html_path text, report_pdf_path text, report_excel_path text, report_docx_path text, report_generated_at timestamptz);
  CREATE TABLE public.fsn_results (id uuid PRIMARY KEY, run_id uuid REFERENCES public.search_runs(id), raw_content text);
  CREATE TABLE public.filter_decisions (id uuid PRIMARY KEY, fsn_result_id uuid REFERENCES public.fsn_results(id),
    search_run_id uuid, decision text, decided_at timestamptz DEFAULT now());
  CREATE TABLE public.filter_decision_cache (id uuid PRIMARY KEY);
  CREATE TABLE public.review_requirements (id uuid DEFAULT gen_random_uuid(), search_run_id uuid, fsn_result_id uuid, filter_decision_id uuid);
  CREATE TABLE public.human_adjudication_events (id uuid PRIMARY KEY, search_run_id uuid, fsn_result_id uuid, filter_decision_id uuid,
    phase text, disposition text, reviewer_id uuid, review_of_event_id uuid, supersedes_event_id uuid,
    requires_second_review boolean DEFAULT false, created_at timestamptz DEFAULT now());
  CREATE TABLE public.exclusion_review_samples (id uuid DEFAULT gen_random_uuid(), search_run_id uuid, fsn_result_id uuid, filter_decision_id uuid, selected_at timestamptz DEFAULT now());
`)
for (const file of ['20261009070635_accuracy_safety_provenance.sql', '20261009070945_run_release_integrity.sql']) {
  await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'))
}
const run = '00000000-0000-4000-8000-000000000001'
const result = '00000000-0000-4000-8000-000000000002'
const decision = '00000000-0000-4000-8000-000000000003'
const reviewer = '00000000-0000-4000-8000-000000000004'
const final = '00000000-0000-4000-8000-000000000005'
const reviewer2 = '00000000-0000-4000-8000-000000000006'
const ready = async () => (await db.query(`SELECT public.is_search_run_adjudication_complete('${run}') AS ready`)).rows[0].ready
const rejects = async (sql) => assert.rejects(db.exec(sql), (error) => error.code === '23514')
await db.exec(`INSERT INTO public.search_runs (id) VALUES ('${run}')`)
assert.equal(await ready(), false, 'unfinished empty run must fail')
await rejects(`UPDATE public.search_runs SET review_status='reviewed' WHERE id='${run}'`)
await db.exec(`UPDATE public.search_runs SET status='complete' WHERE id='${run}'`)
assert.equal(await ready(), false, 'completion timestamp required')
await db.exec(`UPDATE public.search_runs SET completed_at=now() WHERE id='${run}'`)
assert.equal(await ready(), true, 'genuinely empty completed run is valid')
await db.exec(`UPDATE public.search_runs SET total_scraped=1 WHERE id='${run}'`)
assert.equal(await ready(), false, 'persisted result count must match')
await db.exec(`INSERT INTO public.fsn_results VALUES ('${result}','${run}','original evidence')`)
assert.equal(await ready(), false, 'a result without a decision blocks approval')
await db.exec(`INSERT INTO public.filter_decisions (id,fsn_result_id,search_run_id,decision) VALUES ('${decision}','${result}','${run}','uncertain')`)
assert.equal(await ready(), false, 'missing requirement row cannot bypass human review')
await db.exec(`INSERT INTO public.human_adjudication_events (id,search_run_id,fsn_result_id,filter_decision_id,phase,disposition,reviewer_id,requires_second_review)
  VALUES ('${final}','${run}','${result}','${decision}','final','excluded','${reviewer}',true)`)
assert.equal(await ready(), false, 'independent review required')
await db.exec(`INSERT INTO public.human_adjudication_events (id,search_run_id,fsn_result_id,filter_decision_id,phase,disposition,reviewer_id,review_of_event_id)
  VALUES ('00000000-0000-4000-8000-000000000007','${run}','${result}','${decision}','second_review','excluded','${reviewer}','${final}')`)
assert.equal(await ready(), false, 'same reviewer cannot confirm own decision')
await db.exec(`INSERT INTO public.human_adjudication_events (id,search_run_id,fsn_result_id,filter_decision_id,phase,disposition,reviewer_id,review_of_event_id)
  VALUES ('00000000-0000-4000-8000-000000000008','${run}','${result}','${decision}','second_review','excluded','${reviewer2}','${final}')`)
assert.equal(await ready(), true)
await db.exec('BEGIN')
await db.exec(`INSERT INTO public.filter_decisions (id,fsn_result_id,search_run_id,decision,decided_at)
  VALUES ('00000000-0000-4000-8000-000000000013','${result}','${run}','relevant',now()+interval '1 second')`)
assert.equal(await ready(), false, 'human conclusion on a stale decision cannot approve new evidence')
await db.exec('ROLLBACK')
await db.exec('BEGIN')
await db.exec(`INSERT INTO public.human_adjudication_events (id,search_run_id,fsn_result_id,filter_decision_id,phase,disposition,reviewer_id,review_of_event_id,created_at)
  VALUES ('00000000-0000-4000-8000-000000000014','${run}','${result}','${decision}','second_review','relevant','00000000-0000-4000-8000-000000000015','${final}',now()+interval '1 second')`)
assert.equal(await ready(), false, 'a later dissent cannot be hidden by an earlier agreeing second review')
await db.exec('ROLLBACK')
await db.exec(`UPDATE public.search_runs SET status='degraded', review_status='reviewed' WHERE id='${run}'`)
assert.equal(await ready(), true, 'degraded terminal runs remain explicitly reviewable')
await db.exec(`UPDATE public.search_runs SET review_status='approved', reviewed_by='${reviewer}', reviewed_at=now() WHERE id='${run}'`)
await rejects(`UPDATE public.fsn_results SET raw_content='altered' WHERE id='${result}'`)
await rejects(`DELETE FROM public.fsn_results WHERE id='${result}'`)
await rejects(`INSERT INTO public.fsn_results VALUES ('00000000-0000-4000-8000-000000000009','${run}','late evidence')`)
await rejects(`INSERT INTO public.filter_decisions (id,fsn_result_id,search_run_id,decision) VALUES ('00000000-0000-4000-8000-000000000010','${result}','${run}','excluded')`)
await rejects(`INSERT INTO public.human_adjudication_events (id,search_run_id) VALUES ('00000000-0000-4000-8000-000000000011','${run}')`)
await rejects(`INSERT INTO public.review_requirements (search_run_id) VALUES ('${run}')`)
await rejects(`INSERT INTO public.exclusion_review_samples (search_run_id) VALUES ('${run}')`)
await rejects(`UPDATE public.search_runs SET status='running' WHERE id='${run}'`)
await rejects(`UPDATE public.search_runs SET review_status='draft' WHERE id='${run}'`)
await db.exec(`UPDATE public.search_runs SET report_pdf_path='report.pdf', report_generated_at=now() WHERE id='${run}'`)
await db.exec(`UPDATE public.search_runs SET deleted_at=now() WHERE id='${run}'`)
assert.equal(await ready(), false, 'deleted runs cannot release reports')
await rejects(`INSERT INTO public.search_runs (id,status,completed_at,review_status) VALUES ('00000000-0000-4000-8000-000000000012','complete',now(),'approved')`)
const permissions = await db.query(`SELECT has_function_privilege('anon','public.neuridion_release_schema_version()','EXECUTE') AS anon,
  has_function_privilege('authenticated','public.is_search_run_adjudication_complete(uuid)','EXECUTE') AS authenticated,
  has_function_privilege('service_role','public.neuridion_release_schema_version()','EXECUTE') AS service,
  public.neuridion_release_schema_version() AS version`)
assert.deepEqual(permissions.rows[0], { anon: false, authenticated: false, service: true, version: 74 })
await db.close()
console.log('Migration 073 + 074 SQL integration: lifecycle, persisted readiness, independent review, immutable approval and RPC privileges passed.')
