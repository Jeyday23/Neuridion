/**
 * Minimal in-memory PostgREST-style query builder for route tests. Supports
 * the filters the review workflow uses: eq, is, in, ilike (LIKE semantics),
 * order/range/limit (range and limit are honoured), insert with UNIQUE
 * constraints, maybeSingle/single and awaiting the chain.
 */

export type Row = Record<string, unknown>
export type Tables = Record<string, Row[]>

export interface FakeDb {
  tables: Tables
  unique: Record<string, string[][]>
  failTables: Set<string>
  /** Every update call: table, patch, and the ids of rows it matched. */
  updates: Array<{ table: string; patch: Row; matched: string[] }>
  /**
   * Runs before an update is applied (after filters are evaluated). Return an
   * error to simulate a trigger rejection, or mutate tables to simulate a
   * concurrent write (filters are re-evaluated afterwards).
   */
  beforeUpdate?: (table: string, patch: Row) => { code: string; message: string } | null | void
  from: (table: string) => unknown
}

let idCounter = 0
export function nextId(): string {
  idCounter += 1
  const hex = idCounter.toString(16).padStart(12, '0')
  return `00000000-0000-4000-8000-${hex}`
}

/** Postgres ILIKE semantics: `%` any run, `_` any char, `\` escapes. */
function likeToRegExp(pattern: string): RegExp {
  let out = ''
  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i]
    if (char === '\\' && i + 1 < pattern.length) {
      i += 1
      out += pattern[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    } else if (char === '%') out += '.*'
    else if (char === '_') out += '.'
    else out += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${out}$`, 'is')
}

export function createFakeDb(tables: Tables, unique: Record<string, string[][]> = {}): FakeDb {
  const db: FakeDb = {
    tables,
    unique,
    failTables: new Set(),
    updates: [],
    from: (table: string) => query(db, table),
  }
  return db
}

function query(db: FakeDb, table: string) {
  const filters: Array<(row: Row) => boolean> = []
  let inserted: Row | null = null
  let insertError: { code: string; message: string } | null = null
  let updatePatch: Row | null = null
  let rangeFrom: number | null = null
  let rangeTo: number | null = null
  let limitN: number | null = null

  function applyUpdate(patch: Row): { data: Row[]; error: { code?: string; message: string } | null } {
    const hookError = db.beforeUpdate?.(table, patch)
    if (hookError) {
      db.updates.push({ table, patch, matched: [] })
      return { data: [], error: hookError }
    }
    const matched = (db.tables[table] ?? []).filter((row) => filters.every((f) => f(row)))
    for (const row of matched) Object.assign(row, patch)
    db.updates.push({ table, patch, matched: matched.map((row) => String(row.id)) })
    return { data: matched, error: null }
  }

  function rows(): { data: Row[]; error: { code?: string; message: string } | null } {
    if (db.failTables.has(table)) return { data: [], error: { message: `${table} unavailable` } }
    if (insertError) return { data: [], error: insertError }
    if (inserted) return { data: [inserted], error: null }
    if (updatePatch) {
      const patch = updatePatch
      updatePatch = null
      return applyUpdate(patch)
    }
    let out = (db.tables[table] ?? []).filter((row) => filters.every((f) => f(row)))
    if (rangeFrom !== null && rangeTo !== null) out = out.slice(rangeFrom, rangeTo + 1)
    if (limitN !== null) out = out.slice(0, limitN)
    return { data: out, error: null }
  }

  const chain = {
    select: () => chain,
    eq: (column: string, value: unknown) => { filters.push((row) => (row[column] ?? null) === value); return chain },
    is: (column: string, value: unknown) => { filters.push((row) => (row[column] ?? null) === value); return chain },
    in: (column: string, values: unknown[]) => { filters.push((row) => values.includes(row[column])); return chain },
    ilike: (column: string, pattern: string) => {
      const re = likeToRegExp(pattern)
      filters.push((row) => typeof row[column] === 'string' && re.test(row[column] as string))
      return chain
    },
    order: () => chain,
    limit: (n: number) => { limitN = n; return chain },
    range: (from: number, to: number) => { rangeFrom = from; rangeTo = to; return chain },
    update: (patch: Row) => { updatePatch = patch; return chain },
    insert: (value: Row) => {
      const row: Row = { id: nextId(), created_at: '2026-10-10T10:00:00.000Z', ...value }
      if (table === 'run_reviewer_assignments') row.assigned_at ??= '2026-10-10T10:00:00.000Z'
      if (table === 'run_reviewer_assignment_revocations') row.revoked_at ??= '2026-10-10T11:00:00.000Z'
      for (const columns of db.unique[table] ?? []) {
        const clash = (db.tables[table] ?? []).some((existing) => columns.every((c) => existing[c] === row[c]))
        if (clash) {
          insertError = { code: '23505', message: 'duplicate key' }
          return chain
        }
      }
      db.tables[table] = [...(db.tables[table] ?? []), row]
      inserted = row
      return chain
    },
    maybeSingle: async () => {
      const { data, error } = rows()
      return { data: data[0] ?? null, error }
    },
    single: async () => {
      const { data, error } = rows()
      return { data: data[0] ?? null, error: error ?? (data[0] ? null : { code: 'PGRST116', message: 'no rows' }) }
    },
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(rows()).then(resolve, reject),
  }
  return chain
}
