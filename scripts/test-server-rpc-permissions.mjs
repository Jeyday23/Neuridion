/** Isolated PostgreSQL ACL regression; never connects to production.
 * Uses stub server RPC bodies to test the real migration's permissions and
 * the actual canary/privilege trigger bodies to test trigger compatibility.
 * npm install --prefix /tmp/neuridion-sql-test --no-save --package-lock=false @electric-sql/pglite@0.3.15
 * PGLITE_MODULE=/tmp/neuridion-sql-test/node_modules/@electric-sql/pglite/dist/index.js node scripts/test-server-rpc-permissions.mjs
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite')
const db = new PGlite()
const migration = async (name) => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8')
const rpcSpecs = [
  ['check_and_insert_search_run', 'uuid,uuid,date,date,integer', "NULL,NULL,NULL,NULL,0"],
  ['claim_next_job', 'text', "'worker'"],
  ['gdpr_purge_user_data', 'uuid', 'NULL'],
  ['increment_pdf_usage', 'uuid,text', "NULL,'2026-10'"],
  ['merge_coverage_for_source', 'text,date,date', "'test',NULL,NULL"],
  ['requeue_stale_jobs', 'integer', '10'],
]
await db.exec(`
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  CREATE TABLE public.rpc_calls (name text);
  CREATE TABLE public.product_profiles (id uuid PRIMARY KEY, is_synthetic_canary boolean);
  CREATE TABLE public.search_runs (id uuid PRIMARY KEY, profile_id uuid, is_synthetic_canary boolean, canary_execution_id uuid);
  CREATE TABLE public.users (id uuid PRIMARY KEY, role text, plan text, email text,
    deletion_requested_at timestamptz, deleted_at timestamptz, processing_restricted boolean,
    ai_opt_out boolean, consent_terms_at timestamptz, consent_privacy_at timestamptz, consent_cookies_at timestamptz);
  GRANT SELECT, INSERT, UPDATE ON public.search_runs, public.users TO authenticated, service_role;
`)
for (const [name, args] of rpcSpecs) {
  await db.exec(`CREATE FUNCTION public.${name}(${args}) RETURNS void LANGUAGE sql SECURITY DEFINER
    SET search_path='' AS $$ INSERT INTO public.rpc_calls VALUES ('${name}') $$;
    GRANT EXECUTE ON FUNCTION public.${name}(${args}) TO anon, authenticated, service_role;`)
}
const canarySource = await migration('072_sampling_and_production_canaries.sql')
const canaryFunction = canarySource.match(/CREATE OR REPLACE FUNCTION public\.derive_search_run_canary_scope\(\)[\s\S]*?\$\$;/)?.[0]
assert.ok(canaryFunction)
await db.exec(canaryFunction)
await db.exec(await migration('057_fix_privilege_escalation_trigger.sql'))
await db.exec(`
  CREATE TRIGGER derive_canary BEFORE INSERT OR UPDATE ON public.search_runs
    FOR EACH ROW EXECUTE FUNCTION public.derive_search_run_canary_scope();
  CREATE TRIGGER protect_privileges BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.prevent_user_privilege_escalation();
  GRANT EXECUTE ON FUNCTION public.derive_search_run_canary_scope() TO anon, authenticated;
`)
const patch = await migration('20261009071006_restrict_server_rpc_execution.sql')
await db.exec(patch)
await db.exec(patch) // Safe to reapply on legacy installations with explicit grants.
for (const [name, args, values] of rpcSpecs) {
  const permissions = await db.query(`SELECT
    has_function_privilege('anon','public.${name}(${args})','EXECUTE') AS anon,
    has_function_privilege('authenticated','public.${name}(${args})','EXECUTE') AS authenticated,
    has_function_privilege('service_role','public.${name}(${args})','EXECUTE') AS service`)
  assert.deepEqual(permissions.rows[0], { anon: false, authenticated: false, service: true }, name)
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`SET ROLE ${role}`)
    await assert.rejects(db.exec(`SELECT public.${name}(${values})`), error => error.code === '42501')
    await db.exec('RESET ROLE')
  }
  await db.exec(`SET ROLE service_role; SELECT public.${name}(${values}); RESET ROLE`)
}
assert.equal((await db.query('SELECT count(*)::int AS count FROM public.rpc_calls')).rows[0].count, rpcSpecs.length)
const id = '00000000-0000-4000-8000-000000000001'
await db.exec(`INSERT INTO public.product_profiles VALUES ('${id}', true);
  INSERT INTO public.users (id,role,plan,email) VALUES ('${id}','user','free','unchanged@example.test');
  SET ROLE authenticated;
  INSERT INTO public.search_runs (id,profile_id,is_synthetic_canary) VALUES ('${id}','${id}',false);
  UPDATE public.users SET role='admin',plan='enterprise',email='forged@example.test' WHERE id='${id}';
  RESET ROLE;`)
assert.deepEqual((await db.query('SELECT is_synthetic_canary, canary_execution_id IS NOT NULL AS execution FROM public.search_runs')).rows[0],
  { is_synthetic_canary: true, execution: true }, 'revoking direct EXECUTE preserves the canary trigger')
assert.deepEqual((await db.query('SELECT role,plan,email FROM public.users')).rows[0],
  { role: 'user', plan: 'free', email: 'unchanged@example.test' }, 'pinned search path preserves privilege guard')
await db.exec(`SET ROLE service_role; SELECT set_config('request.jwt.claim.role','service_role',false);
  UPDATE public.users SET plan='enterprise' WHERE id='${id}'; RESET ROLE;`)
assert.equal((await db.query('SELECT plan FROM public.users')).rows[0].plan, 'enterprise')
const triggerAcl = await db.query(`SELECT has_function_privilege('anon','public.derive_search_run_canary_scope()','EXECUTE') AS anon,
  has_function_privilege('authenticated','public.derive_search_run_canary_scope()','EXECUTE') AS authenticated,
  has_function_privilege('service_role','public.derive_search_run_canary_scope()','EXECUTE') AS service`)
assert.deepEqual(triggerAcl.rows[0], { anon: false, authenticated: false, service: true })
await db.close()
console.log('PASS: 6 RPC ACLs reject anon/authenticated and allow service_role; canary and privilege triggers preserve behavior; migration is repeatable.')
