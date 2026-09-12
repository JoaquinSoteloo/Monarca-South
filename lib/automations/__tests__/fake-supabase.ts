// Cliente Supabase en memoria, suficiente para ejercitar exactamente las
// cadenas de query que usan lib/automations/engine.ts (ver engine.test.ts) y
// lib/modo-ausente/engine.ts (ver ../../modo-ausente/__tests__/engine.test.ts).
// No pretende ser un mock general de supabase-js — solo soporta los métodos
// y el único embed (automatizaciones -> dispositivo) que el código real
// usa. Si algún motor empieza a usar una cadena nueva, este archivo necesita
// un método nuevo, no al revés.
type Row = Record<string, any>

class FakeQueryBuilder {
  private filters: ((row: Row) => boolean)[] = []
  private orderSpec: { col: string; ascending: boolean } | null = null
  private limitN: number | null = null
  private op: "select" | "insert" | "update" | "delete" = "select"
  private payload: any = null
  private wantSingle = false
  private wantMaybe = false
  private selectStr = "*"

  constructor(
    private db: FakeSupabase,
    private table: string,
  ) {}

  select(cols?: string) {
    this.selectStr = cols ?? "*"
    return this
  }

  eq(col: string, val: unknown) {
    this.filters.push((r) => r[col] === val)
    return this
  }

  in(col: string, vals: unknown[]) {
    this.filters.push((r) => vals.includes(r[col]))
    return this
  }

  // Solo soporta el patrón que usa lib/modo-ausente/engine.ts:
  // .not("col", "is", null) -> col IS NOT NULL.
  not(col: string, op: "is", val: unknown) {
    if (op === "is" && val === null) {
      this.filters.push((r) => r[col] !== null && r[col] !== undefined)
    }
    return this
  }

  gte(col: string, val: string) {
    this.filters.push((r) => r[col] != null && new Date(r[col]).getTime() >= new Date(val).getTime())
    return this
  }

  lte(col: string, val: string) {
    this.filters.push((r) => r[col] != null && new Date(r[col]).getTime() <= new Date(val).getTime())
    return this
  }

  order(col: string, opts?: { ascending?: boolean }) {
    this.orderSpec = { col, ascending: opts?.ascending ?? true }
    return this
  }

  limit(n: number) {
    this.limitN = n
    return this
  }

  // Solo soporta los patrones exactos que genera el código real:
  // "col.is.null,col.lt.<isoTimestamp>" (cooldown de reglas) y
  // "col.eq.false,col.lt.<isoTimestamp>" (lock del motor, ver lock.ts).
  or(expr: string) {
    const clauses = expr.split(",")
    this.filters.push((row) =>
      clauses.some((clause) => {
        const m = clause.match(/^(\w+)\.(is|lt|eq)\.(.*)$/)
        if (!m) return false
        const [, col, op, val] = m
        if (op === "is") return val === "null" ? row[col] === null || row[col] === undefined : false
        if (op === "lt") return row[col] != null && new Date(row[col]).getTime() < new Date(val).getTime()
        if (op === "eq") {
          const parsed = val === "true" ? true : val === "false" ? false : val
          return row[col] === parsed
        }
        return false
      }),
    )
    return this
  }

  insert(data: Row | Row[]) {
    this.op = "insert"
    this.payload = data
    return this
  }

  update(data: Row) {
    this.op = "update"
    this.payload = data
    return this
  }

  delete() {
    this.op = "delete"
    return this
  }

  // Soporta exactamente el patrón que usa lib/modo-ausente/engine.ts: upsert
  // de un objeto o array, sin onConflict explícito. La columna de conflicto
  // se infiere de las filas mismas ("id" si está presente, si no
  // "dispositivo_id") — alcanza para las dos tablas con upsert de este
  // proyecto (modo_ausente_estado y modo_ausente_violaciones).
  upsert(data: Row | Row[]) {
    this.op = "upsert"
    this.payload = data
    return this
  }

  maybeSingle() {
    this.wantSingle = true
    this.wantMaybe = true
    return this
  }

  single() {
    this.wantSingle = true
    this.wantMaybe = false
    return this
  }

  private applyEmbeds(row: Row): Row {
    if (this.table === "automatizaciones" && this.selectStr.includes("dispositivo:dispositivos_controlables")) {
      const dispositivo = (this.db.tables["dispositivos_controlables"] ?? []).find((d) => d.id === row.dispositivo_id) ?? null
      return { ...row, dispositivo }
    }
    return row
  }

  private async exec(): Promise<{ data: any; error: any; count?: number }> {
    const table = this.db.tables[this.table] ?? (this.db.tables[this.table] = [])

    if (this.op === "insert") {
      const payloadWasArray = Array.isArray(this.payload)
      const items: Row[] = payloadWasArray ? this.payload : [this.payload]
      const inserted = items.map((item) => {
        const row: Row = { ...item, id: item.id ?? this.db.nextId(this.table) }
        table.push(row)
        return row
      })
      const data = this.wantSingle ? (inserted[0] ?? null) : payloadWasArray ? inserted : inserted[0]
      return { data, error: null }
    }

    if (this.op === "update") {
      const matched = table.filter((r) => this.filters.every((f) => f(r)))
      matched.forEach((r) => Object.assign(r, this.payload))
      const data = this.wantSingle ? (matched[0] ?? (this.wantMaybe ? null : undefined)) : matched
      return { data, error: null }
    }

    if (this.op === "delete") {
      this.db.tables[this.table] = table.filter((r) => !this.filters.every((f) => f(r)))
      return { data: null, error: null }
    }

    if (this.op === "upsert") {
      const items: Row[] = Array.isArray(this.payload) ? this.payload : [this.payload]
      const upserted = items.map((item) => {
        const conflictCol = "id" in item ? "id" : "dispositivo_id"
        const existing = table.find((r) => r[conflictCol] === item[conflictCol])
        if (existing) {
          Object.assign(existing, item)
          return existing
        }
        const row: Row = { ...item, id: item.id ?? this.db.nextId(this.table) }
        table.push(row)
        return row
      })
      const data = this.wantSingle ? (upserted[0] ?? null) : upserted
      return { data, error: null }
    }

    let rows = table.filter((r) => this.filters.every((f) => f(r)))
    if (this.orderSpec) {
      const { col, ascending } = this.orderSpec
      rows = [...rows].sort((a, b) => {
        const av = a[col]
        const bv = b[col]
        const cmp = av === bv ? 0 : av < bv ? -1 : 1
        return ascending ? cmp : -cmp
      })
    }
    if (this.limitN !== null) rows = rows.slice(0, this.limitN)
    rows = rows.map((r) => this.applyEmbeds(r))

    const data = this.wantSingle ? (rows[0] ?? (this.wantMaybe ? null : undefined)) : rows
    return { data, error: null, count: rows.length }
  }

  // Thenable: engine.ts hace `await supabase.from(...).update(...).eq(...)`
  // sin llamar a ningún terminal explícito — igual que el builder real de
  // supabase-js (PostgrestFilterBuilder).
  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: { data: any; error: any; count?: number }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.exec().then(onfulfilled, onrejected)
  }
}

export class FakeSupabase {
  tables: Record<string, Row[]> = {}
  private counters: Record<string, number> = {}

  nextId(table: string): number {
    this.counters[table] = (this.counters[table] ?? 0) + 1
    return this.counters[table]
  }

  from(table: string) {
    return new FakeQueryBuilder(this, table)
  }

  seed(table: string, rows: Row[]) {
    this.tables[table] = rows.map((r) => ({ ...r }))
    const maxId = Math.max(0, ...rows.map((r) => (typeof r.id === "number" ? r.id : 0)))
    this.counters[table] = Math.max(this.counters[table] ?? 0, maxId)
  }
}

export function createFakeSupabase(): FakeSupabase {
  return new FakeSupabase()
}
