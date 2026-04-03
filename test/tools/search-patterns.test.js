import { describe, it, expect } from 'vitest'
import { register } from '../../src/tools/handlers/search-patterns.js'

/**
 * Create a mock MCP server that captures tool registrations.
 */
function createMockServer() {
  const tools = {}
  return {
    server: {
      tool(name, description, schema, handler) {
        tools[name] = handler
      },
    },
    tools,
    async callTool(name, args) {
      const handler = tools[name]
      if (!handler) throw new Error(`Tool '${name}' not registered`)
      const result = await handler(args)
      return JSON.parse(result.content[0].text)
    },
  }
}

/**
 * Build a mock index with models that exercise search_patterns edge cases.
 * - Widget: has scopes, callbacks with "scope" in method name, validations with "scope" in rules
 * - Account: has devise modules, validations, delegations
 */
function buildTestIndex() {
  return {
    extractions: {
      models: {
        Widget: {
          scopes: ['active', 'published', 'by_region'],
          scope_queries: {
            active: '-> { where(active: true) }',
            published: '-> { where(published: true) }',
            by_region: '->(r) { where(region: r) }',
          },
          callbacks: [
            { type: 'before_save', method: 'set_site_scope_flags' },
            { type: 'after_create', method: 'notify_admin' },
          ],
          validations: [
            { attributes: ['name'], rules: 'presence: true' },
            { attributes: ['code'], rules: 'uniqueness: { scope: :region }' },
          ],
          associations: [
            { type: 'has_many', name: 'parts' },
          ],
          enums: {},
        },
        Account: {
          scopes: ['locked'],
          scope_queries: { locked: '-> { where(locked: true) }' },
          callbacks: [],
          validations: [
            { attributes: ['email'], rules: 'presence: true, uniqueness: true' },
            { attributes: ['status'], rules: 'inclusion: { in: %w[active inactive] }' },
          ],
          associations: [
            { type: 'has_many', name: 'orders' },
            { type: 'belongs_to', name: 'plan' },
          ],
          devise_modules: ['database_authenticatable', 'registerable', 'recoverable'],
          delegations: [{ to: 'plan', methods: ['tier'] }],
          enums: { status: { type: 'enum', values: ['active', 'inactive'] } },
          has_secure_password: true,
        },
      },
      controllers: {
        WidgetsController: {
          filters: [
            { type: 'before_action', name: 'authenticate_user!' },
            { type: 'before_action', name: 'set_widget', method: 'set_widget' },
          ],
        },
      },
    },
  }
}

describe('search_patterns', () => {
  let mock
  let state

  function setup(indexOverride) {
    mock = createMockServer()
    state = { index: arguments.length ? indexOverride : buildTestIndex(), provider: null, verbose: false }
    register(mock.server, state)
  }

  describe('scope pattern — no false positives', () => {
    it('returns only scope-type matches, not callbacks containing "scope"', async () => {
      setup()
      const data = await mock.callTool('search_patterns', { pattern: 'scope' })

      // Should find 4 scopes total: Widget(3) + Account(1)
      const allMatches = data.results.flatMap((r) => r.matches)
      const scopeMatches = allMatches.filter((m) => m.type === 'scope')
      const callbackMatches = allMatches.filter((m) => m.type === 'callback')

      expect(scopeMatches).toHaveLength(4)
      expect(callbackMatches).toHaveLength(0)
    })

    it('does not match validations with "scope" in rules text', async () => {
      setup()
      const data = await mock.callTool('search_patterns', { pattern: 'scope' })

      const allMatches = data.results.flatMap((r) => r.matches)
      const validationMatches = allMatches.filter((m) => m.type === 'validation')

      expect(validationMatches).toHaveLength(0)
    })

    it('returns correct total_matches count', async () => {
      setup()
      const data = await mock.callTool('search_patterns', { pattern: 'scope' })

      expect(data.total_matches).toBe(4)
    })
  })

  describe('validates pattern', () => {
    it('returns all validations and custom validators', async () => {
      setup()
      const data = await mock.callTool('search_patterns', { pattern: 'validates' })

      const allMatches = data.results.flatMap((r) => r.matches)
      const validationMatches = allMatches.filter((m) => m.type === 'validation')

      // Widget: 2 validations, Account: 2 validations = 4 total
      expect(validationMatches).toHaveLength(4)
    })

    it('does not return scopes or callbacks', async () => {
      setup()
      const data = await mock.callTool('search_patterns', { pattern: 'validates' })

      const allMatches = data.results.flatMap((r) => r.matches)
      const scopeMatches = allMatches.filter((m) => m.type === 'scope')
      const callbackMatches = allMatches.filter((m) => m.type === 'callback')

      expect(scopeMatches).toHaveLength(0)
      expect(callbackMatches).toHaveLength(0)
    })
  })

  describe('devise pattern', () => {
    it('returns all devise modules', async () => {
      setup()
      const data = await mock.callTool('search_patterns', { pattern: 'devise' })

      const allMatches = data.results.flatMap((r) => r.matches)
      const deviseMatches = allMatches.filter((m) => m.type === 'devise_module')

      expect(deviseMatches).toHaveLength(3)
    })

    it('does not return unrelated matches', async () => {
      setup()
      const data = await mock.callTool('search_patterns', { pattern: 'devise' })

      const allMatches = data.results.flatMap((r) => r.matches)
      const nonDevise = allMatches.filter((m) => m.type !== 'devise_module')

      expect(nonDevise).toHaveLength(0)
    })
  })

  describe('enum pattern', () => {
    it('returns enum matches', async () => {
      setup()
      const data = await mock.callTool('search_patterns', { pattern: 'enum' })

      const allMatches = data.results.flatMap((r) => r.matches)
      const enumMatches = allMatches.filter((m) => m.type === 'enum')

      expect(enumMatches).toHaveLength(1)
      expect(enumMatches[0].detail.name).toBe('status')
    })
  })

  describe('delegate pattern', () => {
    it('returns delegation matches', async () => {
      setup()
      const data = await mock.callTool('search_patterns', { pattern: 'delegate' })

      const allMatches = data.results.flatMap((r) => r.matches)
      const delegationMatches = allMatches.filter((m) => m.type === 'delegation')

      expect(delegationMatches).toHaveLength(1)
    })
  })

  describe('has_secure_password pattern', () => {
    it('returns has_secure_password matches', async () => {
      setup()
      const data = await mock.callTool('search_patterns', { pattern: 'has_secure_password' })

      const allMatches = data.results.flatMap((r) => r.matches)
      expect(allMatches).toHaveLength(1)
      expect(allMatches[0].type).toBe('has_secure_password')
    })
  })

  describe('generic patterns still do substring matching', () => {
    it('finds callbacks by type substring', async () => {
      setup()
      const data = await mock.callTool('search_patterns', { pattern: 'before_save' })

      const allMatches = data.results.flatMap((r) => r.matches)
      const callbackMatches = allMatches.filter((m) => m.type === 'callback')

      expect(callbackMatches).toHaveLength(1)
      expect(callbackMatches[0].detail.method).toBe('set_site_scope_flags')
    })

    it('finds controller filters by name substring', async () => {
      setup()
      const data = await mock.callTool('search_patterns', { pattern: 'before_action' })

      const allMatches = data.results.flatMap((r) => r.matches)
      const filterMatches = allMatches.filter((m) => m.type === 'filter')

      expect(filterMatches).toHaveLength(2)
    })

    it('finds associations by type', async () => {
      setup()
      const data = await mock.callTool('search_patterns', { pattern: 'has_many' })

      const allMatches = data.results.flatMap((r) => r.matches)
      const assocMatches = allMatches.filter((m) => m.type === 'association')

      expect(assocMatches).toHaveLength(2)
    })
  })

  describe('no index', () => {
    it('returns error when index is null', async () => {
      setup(null)
      const data = await mock.callTool('search_patterns', { pattern: 'scope' })

      expect(data.error).toBeDefined()
    })
  })
})
