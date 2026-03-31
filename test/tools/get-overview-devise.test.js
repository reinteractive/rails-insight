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

describe('get_overview handler — Devise features deduplication', () => {
  it('deduplicates Devise features across models', async () => {
    const state = {
      index: {
        versions: {},
        extractions: {
          auth: {
            primary_strategy: 'devise',
            devise: {
              models: {
                AdminUser: {
                  modules: [
                    'database_authenticatable',
                    'recoverable',
                    'trackable',
                  ],
                },
                Member: {
                  modules: [
                    'database_authenticatable',
                    'registerable',
                    'confirmable',
                  ],
                },
              },
            },
          },
          models: {},
          controllers: {},
          authorization: {},
          caching: {},
          jobs: {},
          tier2: {},
          tier3: {},
        },
        statistics: {},
      },
    }

    const mock = createMockServer()
    register(mock.server, state)
    const result = await mock.callTool('get_overview')
    const data = parseResponse(result)

    const features = data.authentication.features
    // database_authenticatable should appear exactly once
    const count = features.filter(
      (f) => f === 'database_authenticatable',
    ).length
    expect(count).toBe(1)

    // All unique modules should be present
    expect(features).toContain('recoverable')
    expect(features).toContain('trackable')
    expect(features).toContain('registerable')
    expect(features).toContain('confirmable')
  })

  it('includes per-model features_by_model breakdown', async () => {
    const state = {
      index: {
        versions: {},
        extractions: {
          auth: {
            primary_strategy: 'devise',
            devise: {
              models: {
                User: { modules: ['database_authenticatable', 'registerable'] },
              },
            },
          },
          models: {},
          controllers: {},
          authorization: {},
          caching: {},
          jobs: {},
          tier2: {},
          tier3: {},
        },
        statistics: {},
      },
    }

    const mock = createMockServer()
    register(mock.server, state)
    const result = await mock.callTool('get_overview')
    const data = parseResponse(result)

    expect(data.authentication.features_by_model).toBeDefined()
    expect(data.authentication.features_by_model.User).toEqual([
      'database_authenticatable',
      'registerable',
    ])
  })
})
