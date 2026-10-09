import { createClient } from '@supabase/supabase-js'
import { verifyReleaseSchema } from '../lib/verify/release-schema.mjs'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  process.stderr.write('Neuridion startup blocked: Supabase URL and server credential are required.\n')
  process.exit(1)
}

try {
  const db = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10000) }) },
  })
  const result = await verifyReleaseSchema({
    async queryColumns(table, columns) {
      const { error } = await db.from(table).select(columns).limit(0)
      return !error
    },
    async schemaVersion() {
      const { data, error } = await db.rpc('neuridion_release_schema_version')
      return error ? null : data
    },
  })
  if (!result.ok) {
    process.stderr.write(`Neuridion startup blocked: ${result.failures.join('; ')}. Apply the reviewed migrations before deployment.\n`)
    process.exit(1)
  }
  process.stdout.write('Neuridion release schema verified.\n')
} catch {
  process.stderr.write('Neuridion startup blocked: database schema could not be verified.\n')
  process.exit(1)
}
