import { describe, it, expect } from 'vitest'
import { getSkillSeeds, register } from '../../src/tools/handlers/get-subgraph.js'

// ── Helper to call get_subgraph via mock MCP server ───────────────────
function buildMockState(extractions, relationships = [], rankings = {}) {
  return {
    index: { extractions, relationships, rankings },
    provider: null,
    verbose: false,
  }
}

async function callSubgraph(state, skill) {
  let handler = null
  const mockServer = {
    tool(name, desc, schema, fn) { if (name === 'get_subgraph') handler = fn },
  }
  register(mockServer, state)
  const resp = await handler({ skill })
  return JSON.parse(resp.content[0].text)
}

describe('ISSUE-I: Auth subgraph relevance filter', () => {
  it('authentication subgraph excludes unrelated models reached via inherited concerns', () => {
    // Mock an index where User (devise) and WpPost share an inherits relationship
    // but WpPost has no auth relevance
    const index = {
      extractions: {
        models: {
          User: {
            devise_modules: ['database_authenticatable'],
            has_secure_password: false,
          },
          WpPost: {
            type: 'model',
            devise_modules: [],
            has_secure_password: false,
          },
          WpBase: {
            type: 'model',
            devise_modules: [],
            has_secure_password: false,
          },
        },
        controllers: {
          SessionsController: {},
        },
      },
      relationships: [
        // WpPost inherits WpBase — not auth-relevant
        { from: 'WpPost', to: 'WpBase', type: 'inherits' },
        // User has a concern — auth-relevant
        { from: 'User', to: 'Authenticatable', type: 'includes_concern' },
      ],
      rankings: {},
    }

    const seeds = getSkillSeeds('authentication', index)
    expect(seeds.has('User')).toBe(true)
    expect(seeds.has('SessionsController')).toBe(true)

    // Simulate BFS expansion without inherits edges (as the fix does)
    const allRels = index.relationships || []
    const relevantEntities = new Set(seeds)
    const authIrrelevantEdges = new Set(['inherits'])

    for (const rel of allRels) {
      if (authIrrelevantEdges.has(rel.type)) continue
      if (seeds.has(rel.from)) relevantEntities.add(rel.to)
      if (seeds.has(rel.to)) relevantEntities.add(rel.from)
    }

    // WpPost should NOT be in the auth subgraph (only reachable via inherits)
    expect(relevantEntities.has('WpPost')).toBe(false)
    expect(relevantEntities.has('WpBase')).toBe(false)
    // User's concern should be included
    expect(relevantEntities.has('Authenticatable')).toBe(true)
  })
})

describe('ISSUE-F: email subgraph seeds from models/controllers', () => {
  it('email subgraph includes Email model and EmailsController when no mailers exist', () => {
    const index = {
      extractions: {
        models: {
          Email: { file: 'app/models/email.rb', associations: [] },
          User: { file: 'app/models/user.rb', associations: [] },
        },
        controllers: {
          EmailsController: {
            file: 'app/controllers/emails_controller.rb',
            actions: ['index'],
          },
          UsersController: {
            file: 'app/controllers/users_controller.rb',
            actions: ['index'],
          },
        },
        email: { mailers: [] },
        mailers: {},
      },
      relationships: [],
      rankings: { Email: 0.05, EmailsController: 0.03 },
    }

    const seeds = getSkillSeeds('email', index)
    expect(seeds.has('Email')).toBe(true)
    expect(seeds.has('EmailsController')).toBe(true)
    // Non-email entities should not be seeded
    expect(seeds.has('User')).toBe(false)
    expect(seeds.has('UsersController')).toBe(false)
  })
})

describe('get_subgraph accuracy fixes', () => {
  it('auth seeds from auth extractor devise models (Login paren-style devise call)', () => {
    // The model extractor may return devise_modules: [] for `devise(...)` paren calls.
    // getSkillSeeds must fall back to extractions.auth.devise.models.
    const index = {
      extractions: {
        models: {
          Login: { devise_modules: [], has_secure_password: false, type: 'model' },
        },
        controllers: {},
        auth: {
          primary_strategy: 'devise',
          devise: {
            models: { Login: { modules: ['database_authenticatable', 'recoverable'] } },
          },
        },
      },
      relationships: [],
      rankings: {},
    }

    const seeds = getSkillSeeds('authentication', index)
    expect(seeds.has('Login')).toBe(true)
  })

  it('auth seeds do not include AuthorsController (author contains auth substring)', () => {
    const index = {
      extractions: {
        models: {},
        controllers: {
          'Spree::Admin::AuthorsController': {},
          'Spree::Admin::SessionsController': {},
        },
        auth: {},
      },
      relationships: [],
      rankings: {},
    }

    const seeds = getSkillSeeds('authentication', index)
    // Should NOT seed AuthorsController — "auth" is a substring of "author" but not auth-related
    expect(seeds.has('Spree::Admin::AuthorsController')).toBe(false)
    // SHOULD seed SessionsController
    expect(seeds.has('Spree::Admin::SessionsController')).toBe(true)
  })

  it('auth subgraph excludes spec: prefix entities added by BFS via spec_for edges', async () => {
    const extractions = {
      models: {
        User: { devise_modules: ['database_authenticatable'], has_secure_password: false, type: 'model' },
      },
      controllers: {},
      auth: { devise: { models: { User: { modules: ['database_authenticatable'] } } } },
    }
    const relationships = [
      // spec file linked to User via spec_for edge
      { from: 'spec:user', to: 'User', type: 'spec_for' },
      { from: 'User', to: 'Role', type: 'has_many' },
    ]
    const state = buildMockState(extractions, relationships)
    const result = await callSubgraph(state, 'authentication')

    const entityNames = result.entities.map(e => e.entity)
    // spec:user must not appear (it's a spec file entity, not a code entity)
    expect(entityNames).not.toContain('spec:user')
    // Role is a valid neighbor (role matches auth pattern)
    expect(entityNames).toContain('User')
  })

  it('auth subgraph excludes concern modules pulled in via includes_concern BFS edges', async () => {
    const extractions = {
      models: {
        User: { devise_modules: ['database_authenticatable'], has_secure_password: false, type: 'model' },
        UserRansackable: { type: 'concern' },
        Orderable: { type: 'concern' },
      },
      controllers: {},
      auth: { devise: { models: { User: { modules: ['database_authenticatable'] } } } },
    }
    const relationships = [
      { from: 'User', to: 'UserRansackable', type: 'includes_concern' },
      { from: 'User', to: 'Orderable', type: 'includes_concern' },
    ]
    const state = buildMockState(extractions, relationships)
    const result = await callSubgraph(state, 'authentication')

    const entityNames = result.entities.map(e => e.entity)
    // Concern modules should not appear in auth subgraph
    expect(entityNames).not.toContain('UserRansackable')
    expect(entityNames).not.toContain('Orderable')
    expect(entityNames).toContain('User')
  })

  it('auth post-filter does not include Author model (auth substring in author)', async () => {
    const extractions = {
      models: {
        User: { devise_modules: ['database_authenticatable'], has_secure_password: false, type: 'model' },
        Author: { type: 'model', devise_modules: [], has_secure_password: false },
      },
      controllers: {},
      auth: { devise: { models: { User: { modules: ['database_authenticatable'] } } } },
    }
    const relationships = [
      // Author is a 1-hop neighbor of User via belongs_to
      { from: 'Post', to: 'Author', type: 'belongs_to' },
      { from: 'User', to: 'Author', type: 'has_many' },
    ]
    const state = buildMockState(extractions, relationships)
    const result = await callSubgraph(state, 'authentication')

    const entityNames = result.entities.map(e => e.entity)
    // Author should NOT appear — "auth" matches "author" but Author is not auth-relevant
    expect(entityNames).not.toContain('Author')
    expect(entityNames).toContain('User')
  })
})

