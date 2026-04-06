import { describe, it, expect } from 'vitest'
import { register } from '../../src/tools/handlers/get-overview.js'

function createMockServer() {
  const tools = {}
  return {
    server: {
      tool(name, description, schema, handler) {
        tools[name] = handler
      },
    },
    async callTool(name) {
      return tools[name]()
    },
  }
}

function parseResponse(result) {
  const text = result.content?.[0]?.text
  return text ? JSON.parse(text) : null
}

function makeState(overrides = {}) {
  return {
    index: {
      versions: { rails: '7.2.0', ruby: '3.2.0', ...overrides.versions },
      extractions: {
        auth: {},
        models: {},
        controllers: {},
        authorization: {},
        caching: {},
        jobs: {},
        tier2: {},
        tier3: {},
        config: { ...overrides.config },
        ...overrides.extractions,
      },
      statistics: {},
    },
  }
}

describe('get_overview handler — database field', () => {
  it('returns adapter string when config.database is an object', async () => {
    // Regression: config.database may be {adapter: 'postgresql', pool: {}} —
    // the handler must extract the adapter string, not return the object.
    const state = makeState({
      config: { database: { adapter: 'postgresql', pool: 5 } },
    })
    const mock = createMockServer()
    register(mock.server, state)
    const result = await mock.callTool('get_overview')
    const data = parseResponse(result)

    expect(typeof data.database).toBe('string')
    expect(data.database).toBe('postgresql')
  })

  it('returns adapter string when config.database is already a string', async () => {
    const state = makeState({
      config: { database: 'sqlite3' },
    })
    const mock = createMockServer()
    register(mock.server, state)
    const result = await mock.callTool('get_overview')
    const data = parseResponse(result)

    expect(typeof data.database).toBe('string')
    expect(data.database).toBe('sqlite3')
  })

  it('falls back to "unknown" when database config is absent', async () => {
    const state = makeState({ config: {} })
    const mock = createMockServer()
    register(mock.server, state)
    const result = await mock.callTool('get_overview')
    const data = parseResponse(result)

    expect(typeof data.database).toBe('string')
    expect(data.database).toBe('unknown')
  })
})
