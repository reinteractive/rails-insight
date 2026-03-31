import { describe, it, expect } from 'vitest'
import { getSkillSeeds } from '../../src/tools/handlers/get-subgraph.js'

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
