import { describe, it, expect } from 'vitest'

// Helper to build a mock state object for get_model handler testing
function buildState(overrides = {}) {
  return {
    index: {
      extractions: {
        models: {},
        schema: { tables: [], foreign_keys: [] },
        authorization: {},
        ...overrides,
      },
    },
  }
}

// Helper to call the handler logic directly (extracted for testability)
async function callGetModelHandler(name, state) {
  // Dynamically import the module and create a mock server to capture the handler
  const { register } = await import('../../src/tools/handlers/get-model.js')

  let capturedHandler = null
  const mockServer = {
    tool(_name, _desc, _schema, handler) {
      capturedHandler = handler
    },
  }

  register(mockServer, state)
  return capturedHandler({ name })
}

describe('ISSUE-A: get_model auth_relevance for Role model', () => {
  it('identifies Rolify RBAC Role model via polymorphic resource columns', async () => {
    const state = buildState({
      models: {
        Role: {
          class: 'Role',
          file: 'app/models/role.rb',
          superclass: 'ApplicationRecord',
          associations: [
            { type: 'has_and_belongs_to_many', name: 'users' },
            {
              type: 'belongs_to',
              name: 'resource',
              options: 'polymorphic: true',
            },
          ],
          scopes: [],
          callbacks: [],
          validations: [],
        },
      },
      schema: {
        tables: [
          {
            name: 'roles',
            columns: [
              { name: 'name', type: 'string' },
              { name: 'resource_type', type: 'string' },
              { name: 'resource_id', type: 'bigint' },
            ],
            indexes: [],
          },
        ],
        foreign_keys: [],
      },
      authorization: { roles: { model: 'User', source: 'rolify' } },
    })

    const result = await callGetModelHandler('Role', state)
    const content = JSON.parse(result.content[0].text)

    // Should NOT say "domain model" or "job positions"
    expect(content.auth_relevance).toBeDefined()
    expect(content.auth_relevance).not.toMatch(/domain model/i)
    expect(content.auth_relevance).not.toMatch(/job positions/i)
    // Should mention Rolify or RBAC
    expect(content.auth_relevance).toMatch(/rolify|rbac/i)
  })

  it('does not hallucinate Rolify when Role model has no resource columns', async () => {
    const state = buildState({
      models: {
        Role: {
          class: 'Role',
          file: 'app/models/role.rb',
          superclass: 'ApplicationRecord',
          associations: [],
          scopes: [],
          callbacks: [],
          validations: [],
        },
      },
      schema: {
        tables: [
          {
            name: 'roles',
            columns: [
              { name: 'name', type: 'string' },
              { name: 'level', type: 'integer' },
            ],
            indexes: [],
          },
        ],
        foreign_keys: [],
      },
      authorization: { roles: { model: 'User', source: 'enum' } },
    })

    const result = await callGetModelHandler('Role', state)
    const content = JSON.parse(result.content[0].text)

    // Should mention the real auth model, not falsely call this Rolify
    expect(content.auth_relevance).toBeDefined()
    expect(content.auth_relevance).not.toMatch(/rolify rbac/i)
    expect(content.auth_relevance).toMatch(/User/i)
  })

  it('returns no auth_relevance for non-Role models', async () => {
    const state = buildState({
      models: {
        User: {
          class: 'User',
          file: 'app/models/user.rb',
          superclass: 'ApplicationRecord',
          associations: [],
          scopes: [],
          callbacks: [],
          validations: [],
        },
      },
      schema: { tables: [], foreign_keys: [] },
      authorization: {},
    })

    const result = await callGetModelHandler('User', state)
    const content = JSON.parse(result.content[0].text)
    expect(content.auth_relevance).toBeUndefined()
  })
})
