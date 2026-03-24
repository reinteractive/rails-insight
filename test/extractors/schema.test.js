import { describe, it, expect, beforeAll } from 'vitest'
import { extractSchema } from '../../src/extractors/schema.js'

function mockProvider(files) {
  return {
    readFile(path) {
      return files[path] || null
    },
  }
}

describe('Schema Extractor', () => {
  describe('complex schema with all patterns', () => {
    const fixture = `
ActiveRecord::Schema[7.1].define(version: 2024_03_15_120000) do
  enable_extension "pgcrypto"
  enable_extension "hstore"
  enable_extension "citext"

  create_enum "user_role", ["member", "admin", "owner"]
  create_enum "order_status", ["pending", "processing", "shipped", "delivered"]

  create_table "users", force: :cascade do |t|
    t.string "email", null: false
    t.string "name", limit: 100
    t.integer "role", default: 0
    t.jsonb "settings", default: {}
    t.text "bio"
    t.boolean "active", default: true
    t.references "organization", foreign_key: true
    t.timestamps
    t.index ["email"], unique: true, name: "index_users_on_email"
    t.index ["organization_id"]
  end

  create_table "projects", id: :uuid, force: :cascade do |t|
    t.string "title", null: false
    t.text "description"
    t.integer "status", default: 0
    t.belongs_to "user", null: false, foreign_key: true
    t.timestamps
    t.index ["user_id", "title"], unique: true
  end

  create_table "taggings", id: false do |t|
    t.bigint "tag_id", null: false
    t.bigint "taggable_id", null: false
    t.string "taggable_type", null: false
    t.index ["taggable_type", "taggable_id"]
    t.index ["tag_id"]
  end

  create_table "tags", force: :cascade do |t|
    t.string "name", null: false
    t.integer "taggings_count", default: 0
    t.index ["name"], unique: true
  end

  create_table "orders", comment: "Customer orders" do |t|
    t.string "number", null: false
    t.decimal "total", precision: 10, scale: 2
    t.integer "status", default: 0
    t.references "user", null: false
    t.timestamps
    t.index ["number"], unique: true
  end

  create_table "audits", force: :cascade do |t|
    t.string "auditable_type"
    t.bigint "auditable_id"
    t.text "changes_json"
    t.timestamps
    t.index ["auditable_type", "auditable_id"]
  end

  add_foreign_key "projects", "users"
  add_foreign_key "orders", "users", column: "user_id"
end`

    let result

    beforeAll(() => {
      const provider = mockProvider({ 'db/schema.rb': fixture })
      result = extractSchema(provider)
    })

    // === VERSION ===
    it('extracts schema version', () => {
      expect(result.version).toBe('2024_03_15_120000')
    })

    // === EXTENSIONS ===
    it('extracts all extensions', () => {
      expect(result.extensions).toContain('pgcrypto')
      expect(result.extensions).toContain('hstore')
      expect(result.extensions).toContain('citext')
      expect(result.extensions).toHaveLength(3)
    })

    // === ENUMS ===
    it('extracts enum definitions', () => {
      expect(result.enums.user_role).toEqual(['member', 'admin', 'owner'])
      expect(result.enums.order_status).toEqual([
        'pending',
        'processing',
        'shipped',
        'delivered',
      ])
    })

    it('has correct number of enums', () => {
      expect(Object.keys(result.enums)).toHaveLength(2)
    })

    // === TABLES ===
    it('extracts all tables', () => {
      expect(result.tables).toHaveLength(6)
      const names = result.tables.map((t) => t.name)
      expect(names).toContain('users')
      expect(names).toContain('projects')
      expect(names).toContain('taggings')
      expect(names).toContain('tags')
      expect(names).toContain('orders')
      expect(names).toContain('audits')
    })

    // === PRIMARY KEYS ===
    it('extracts default bigint primary key', () => {
      const users = result.tables.find((t) => t.name === 'users')
      expect(users.primary_key).toEqual({ type: 'bigint', auto: true })
    })

    it('extracts UUID primary key', () => {
      const projects = result.tables.find((t) => t.name === 'projects')
      expect(projects.primary_key).toEqual({ type: 'uuid', auto: true })
    })

    it('extracts no-id table (id: false)', () => {
      const taggings = result.tables.find((t) => t.name === 'taggings')
      expect(taggings.primary_key).toBeNull()
    })

    // === COLUMNS ===
    it('extracts column types and names', () => {
      const users = result.tables.find((t) => t.name === 'users')
      const email = users.columns.find((c) => c.name === 'email')
      expect(email.type).toBe('string')
      expect(email.constraints).toContain('null: false')
    })

    it('extracts column with limit', () => {
      const users = result.tables.find((t) => t.name === 'users')
      const name = users.columns.find((c) => c.name === 'name')
      expect(name.type).toBe('string')
      expect(name.constraints).toContain('limit: 100')
    })

    it('extracts column with default', () => {
      const users = result.tables.find((t) => t.name === 'users')
      const role = users.columns.find((c) => c.name === 'role')
      expect(role.type).toBe('integer')
      expect(role.constraints).toContain('default: 0')
    })

    it('extracts jsonb columns', () => {
      const users = result.tables.find((t) => t.name === 'users')
      const settings = users.columns.find((c) => c.name === 'settings')
      expect(settings.type).toBe('jsonb')
    })

    it('extracts boolean columns', () => {
      const users = result.tables.find((t) => t.name === 'users')
      const active = users.columns.find((c) => c.name === 'active')
      expect(active.type).toBe('boolean')
    })

    it('extracts decimal with precision and scale', () => {
      const orders = result.tables.find((t) => t.name === 'orders')
      const total = orders.columns.find((c) => c.name === 'total')
      expect(total.type).toBe('decimal')
      expect(total.constraints).toContain('precision: 10')
    })

    // === REFERENCES ===
    it('extracts references columns', () => {
      const users = result.tables.find((t) => t.name === 'users')
      const org = users.columns.find((c) => c.name === 'organization_id')
      expect(org).toBeDefined()
      expect(org.type).toBe('references')
      expect(org.ref_name).toBe('organization')
    })

    it('extracts belongs_to references', () => {
      const projects = result.tables.find((t) => t.name === 'projects')
      const user = projects.columns.find((c) => c.name === 'user_id')
      expect(user).toBeDefined()
      expect(user.type).toBe('references')
    })

    // === TIMESTAMPS ===
    it('extracts timestamps as two columns', () => {
      const users = result.tables.find((t) => t.name === 'users')
      const createdAt = users.columns.find((c) => c.name === 'created_at')
      const updatedAt = users.columns.find((c) => c.name === 'updated_at')
      expect(createdAt).toBeDefined()
      expect(updatedAt).toBeDefined()
    })

    // === INDEXES ===
    it('extracts unique index', () => {
      const users = result.tables.find((t) => t.name === 'users')
      const emailIdx = users.indexes.find((i) => i.columns.includes('email'))
      expect(emailIdx.unique).toBe(true)
      expect(emailIdx.name).toBe('index_users_on_email')
    })

    it('extracts non-unique index', () => {
      const users = result.tables.find((t) => t.name === 'users')
      const orgIdx = users.indexes.find((i) =>
        i.columns.includes('organization_id'),
      )
      expect(orgIdx.unique).toBe(false)
    })

    it('extracts composite index', () => {
      const projects = result.tables.find((t) => t.name === 'projects')
      const idx = projects.indexes.find((i) => i.columns.length === 2)
      expect(idx.columns).toContain('user_id')
      expect(idx.columns).toContain('title')
      expect(idx.unique).toBe(true)
    })

    it('extracts polymorphic index', () => {
      const taggings = result.tables.find((t) => t.name === 'taggings')
      const polyIdx = taggings.indexes.find((i) =>
        i.columns.includes('taggable_type'),
      )
      expect(polyIdx).toBeDefined()
      expect(polyIdx.columns).toHaveLength(2)
    })

    // === FOREIGN KEYS ===
    it('extracts foreign keys', () => {
      expect(result.foreign_keys.length).toBeGreaterThanOrEqual(2)
      const projectsFk = result.foreign_keys.find(
        (fk) => fk.from_table === 'projects',
      )
      expect(projectsFk.to_table).toBe('users')
    })

    it('extracts foreign key with options', () => {
      const ordersFk = result.foreign_keys.find(
        (fk) => fk.from_table === 'orders',
      )
      expect(ordersFk.to_table).toBe('users')
      expect(ordersFk.options).toContain('column: "user_id"')
    })

    // === TABLE COMMENTS ===
    it('extracts table comment', () => {
      const orders = result.tables.find((t) => t.name === 'orders')
      expect(orders.comment).toBe('Customer orders')
    })

    it('has null comment for uncommented tables', () => {
      const users = result.tables.find((t) => t.name === 'users')
      expect(users.comment).toBeNull()
    })
  })

  // === EDGE CASES ===
  describe('empty schema', () => {
    it('returns defaults when no schema file exists', () => {
      const provider = mockProvider({})
      const result = extractSchema(provider)
      expect(result.version).toBeNull()
      expect(result.extensions).toEqual([])
      expect(result.enums).toEqual({})
      expect(result.tables).toEqual([])
      expect(result.foreign_keys).toEqual([])
    })
  })

  describe('old-style schema version', () => {
    it('parses ActiveRecord::Schema.define format', () => {
      const provider = mockProvider({
        'db/schema.rb': `
ActiveRecord::Schema.define(version: 2021_06_01_000000) do
  create_table "posts", force: :cascade do |t|
    t.string "title"
  end
end`,
      })
      const result = extractSchema(provider)
      expect(result.version).toBe('2021_06_01_000000')
      expect(result.tables).toHaveLength(1)
    })
  })

  describe('schema with only extensions', () => {
    it('parses extensions without tables', () => {
      const provider = mockProvider({
        'db/schema.rb': `
ActiveRecord::Schema[7.1].define(version: 2024_01_01_000000) do
  enable_extension "plpgsql"
end`,
      })
      const result = extractSchema(provider)
      expect(result.extensions).toEqual(['plpgsql'])
      expect(result.tables).toEqual([])
    })
  })

  describe('table with custom id type', () => {
    it('extracts custom id type', () => {
      const provider = mockProvider({
        'db/schema.rb': `
ActiveRecord::Schema[7.1].define(version: 2024_01_01_000000) do
  create_table "legacy_records", id: :integer do |t|
    t.string "code"
  end
end`,
      })
      const result = extractSchema(provider)
      const table = result.tables[0]
      expect(table.primary_key.type).toBe('integer')
    })
  })

  describe('multiple tables no foreign keys', () => {
    it('returns empty foreign keys array', () => {
      const provider = mockProvider({
        'db/schema.rb': `
ActiveRecord::Schema[7.1].define(version: 2024_01_01_000000) do
  create_table "things", force: :cascade do |t|
    t.string "name"
  end
end`,
      })
      const result = extractSchema(provider)
      expect(result.foreign_keys).toEqual([])
    })
  })

  // === BUG REGRESSION TESTS ===

  describe('Bug 1 — functional/expression index not treated as phantom column', () => {
    let result
    beforeAll(() => {
      const provider = mockProvider({
        'db/schema.rb': `
ActiveRecord::Schema[7.1].define(version: 2024_01_01_000000) do
  create_table "metric_categories", force: :cascade do |t|
    t.string "title"
    t.datetime "discarded_at"
    t.index "lower((title)::text)", name: "index_metric_categories_on_active_lower_title_unique", unique: true, where: "(discarded_at IS NULL)"
  end
end`,
      })
      result = extractSchema(provider)
    })

    it('does not add a phantom "lower" column', () => {
      const table = result.tables.find((t) => t.name === 'metric_categories')
      const lowerCol = table.columns.find((c) => c.name === 'lower')
      expect(lowerCol).toBeUndefined()
    })

    it('records the expression index in the indexes array', () => {
      const table = result.tables.find((t) => t.name === 'metric_categories')
      expect(table.indexes).toHaveLength(1)
      const idx = table.indexes[0]
      expect(idx.name).toBe('index_metric_categories_on_active_lower_title_unique')
      expect(idx.expression).toBe('lower((title)::text)')
    })
  })

  describe('Bug 2 — partial index WHERE clause is captured', () => {
    let result
    beforeAll(() => {
      const provider = mockProvider({
        'db/schema.rb': `
ActiveRecord::Schema[7.1].define(version: 2024_01_01_000000) do
  create_table "metrics", force: :cascade do |t|
    t.bigint "metric_sub_section_id"
    t.bigint "metric_category_id"
    t.index ["metric_sub_section_id", "metric_category_id"], name: "index_metrics_on_sub_section_and_category_unique", unique: true, where: "((metric_sub_section_id IS NOT NULL) AND (metric_category_id IS NOT NULL))"
  end
end`,
      })
      result = extractSchema(provider)
    })

    it('captures the where clause on a composite partial index', () => {
      const table = result.tables.find((t) => t.name === 'metrics')
      const idx = table.indexes.find(
        (i) => i.name === 'index_metrics_on_sub_section_and_category_unique',
      )
      expect(idx).toBeDefined()
      expect(idx.where).toContain('metric_sub_section_id IS NOT NULL')
    })
  })

  describe('Bug 3 — GIN index using clause is captured', () => {
    let result
    beforeAll(() => {
      const provider = mockProvider({
        'db/schema.rb': `
ActiveRecord::Schema[7.1].define(version: 2024_01_01_000000) do
  create_table "comments", force: :cascade do |t|
    t.string "tags", array: true
    t.index ["tags"], name: "index_comments_on_tags", using: :gin
  end
end`,
      })
      result = extractSchema(provider)
    })

    it('captures using: :gin on the index', () => {
      const table = result.tables.find((t) => t.name === 'comments')
      const idx = table.indexes.find((i) => i.name === 'index_comments_on_tags')
      expect(idx).toBeDefined()
      expect(idx.using).toBe('gin')
    })

    it('does not set using when not present', () => {
      const provider = mockProvider({
        'db/schema.rb': `
ActiveRecord::Schema[7.1].define(version: 2024_01_01_000000) do
  create_table "posts", force: :cascade do |t|
    t.string "title"
    t.index ["title"], name: "index_posts_on_title"
  end
end`,
      })
      const r = extractSchema(provider)
      const idx = r.tables[0].indexes[0]
      expect(idx.using).toBeNull()
    })
  })
})
