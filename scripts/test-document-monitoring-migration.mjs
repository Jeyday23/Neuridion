/** Runs migration 20261010190000 in isolated PostgreSQL WASM; never connects to production.
 * PGLITE_MODULE=/tmp/neuridion-sql-test/node_modules/@electric-sql/pglite/dist/index.js node scripts/test-document-monitoring-migration.mjs
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite')
const db = new PGlite()
await db.exec(`
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid PRIMARY KEY);
  CREATE TABLE public.users (id uuid PRIMARY KEY);
  CREATE TABLE public.search_runs (id uuid PRIMARY KEY, review_status text DEFAULT 'draft');
  CREATE TABLE public.fsn_canonical (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source text, source_record_id text,
    content_hash text NOT NULL, UNIQUE (source, source_record_id));
  CREATE TABLE public.fsn_results (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), run_id uuid, content_hash text);
  CREATE TABLE public.run_reviewer_assignments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), search_run_id uuid, reviewer_id uuid);
  CREATE OR REPLACE FUNCTION public.prevent_evidence_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN RAISE EXCEPTION '% is append-only; % is not permitted', TG_TABLE_NAME, TG_OP USING ERRCODE = 'P0001'; END; $$;
`)
const sql = await readFile(new URL('../supabase/migrations/20261010190000_document_monitoring_and_review_attribution.sql', import.meta.url), 'utf8')
await db.exec(sql)
await db.exec(sql) // repeatable

const v = (await db.query(`SELECT public.neuridion_release_schema_version() AS v`)).rows[0].v
assert.equal(v, 76, 'release marker must be 76')

const hash = 'a'.repeat(64)
const insert = (sha, url = 'https://assets.publishing.service.gov.uk/x.pdf') => db.exec(
  `INSERT INTO public.source_document_versions (source, source_record_id, document_url, sha256)
   VALUES ('mhra', '/n1', '${url}', '${sha}') ON CONFLICT DO NOTHING`)
await insert(hash)
await insert(hash) // duplicate version is ignored, not duplicated
assert.equal((await db.query(`SELECT count(*)::int AS n FROM public.source_document_versions`)).rows[0].n, 1)
await insert('b'.repeat(64))
assert.equal((await db.query(`SELECT count(*)::int AS n FROM public.source_document_versions`)).rows[0].n, 2, 'same URL, new body is a new version')

await assert.rejects(db.exec(`UPDATE public.source_document_versions SET sha256='${'c'.repeat(64)}'`), /append-only/)
await assert.rejects(db.exec(`DELETE FROM public.source_document_versions`), /append-only/)
await assert.rejects(insert('not-a-hash'), /check constraint/)
await assert.rejects(insert(hash, 'http://assets.publishing.service.gov.uk/x.pdf'), /check constraint/)
await assert.rejects(db.exec(`INSERT INTO public.source_document_versions (source, source_record_id, document_url, sha256, storage_path)
  VALUES ('mhra','/n2','https://x.gov.uk/a','${hash}','../escape')`), /check constraint/)

await assert.rejects(db.exec(`INSERT INTO public.fsn_canonical (source, source_record_id, content_hash, attachment_digest) VALUES ('mhra','/n1','h','bad')`), /check constraint/)
await db.exec(`INSERT INTO public.fsn_canonical (source, source_record_id, content_hash, attachment_digest) VALUES ('mhra','/n1','h','${hash}')`)
assert.equal((await db.query(`SELECT last_observation_degraded FROM public.fsn_canonical`)).rows[0].last_observation_degraded, false)
await db.exec(`INSERT INTO public.fsn_results (content_hash, attachment_digest, attachments) VALUES ('h', '${hash}', '[]')`)

const user = '00000000-0000-4000-8000-000000000001'
await db.exec(`INSERT INTO public.users (id) VALUES ('${user}'); INSERT INTO auth.users (id) VALUES ('${user}')`)
const assignment = (await db.query(`INSERT INTO public.run_reviewer_assignments (reviewer_id) VALUES ('${user}') RETURNING id`)).rows[0].id
await db.exec(`INSERT INTO public.run_reviewer_assignment_revocations (assignment_id, revoked_by) VALUES ('${assignment}', '${user}')`)
await assert.rejects(db.exec(`INSERT INTO public.run_reviewer_assignment_revocations (assignment_id, revoked_by) VALUES ('${assignment}', '${user}')`), /duplicate key/)
await assert.rejects(db.exec(`DELETE FROM public.run_reviewer_assignment_revocations`), /append-only/)
await db.exec(`INSERT INTO public.search_runs (id, approved_by, approved_at) VALUES (gen_random_uuid(), '${user}', now())`)

for (const table of ['source_document_versions', 'run_reviewer_assignment_revocations']) {
  for (const role of ['anon', 'authenticated']) {
    const allowed = (await db.query(`SELECT has_table_privilege('${role}', 'public.${table}', 'SELECT') AS ok`)).rows[0].ok
    assert.equal(allowed, false, `${role} must not read ${table}`)
  }
  const service = (await db.query(`SELECT has_table_privilege('service_role', 'public.${table}', 'INSERT') AS ok`)).rows[0].ok
  assert.equal(service, true, `service_role must insert ${table}`)
  const rls = (await db.query(`SELECT relrowsecurity FROM pg_class WHERE oid = 'public.${table}'::regclass`)).rows[0].relrowsecurity
  assert.equal(rls, true, `${table} must have RLS enabled`)
}
const fnAnon = (await db.query(`SELECT has_function_privilege('anon', 'public.neuridion_release_schema_version()', 'EXECUTE') AS ok`)).rows[0].ok
assert.equal(fnAnon, false, 'anon must not execute the release marker')

console.log('PASS: document monitoring migration is repeatable, append-only, constrained, service-role only; release marker 76.')
