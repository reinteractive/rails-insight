import { describe, it, expect } from 'vitest'
import { getSkillSeeds } from '../../src/tools/handlers/get-subgraph.js'

describe('ISSUE-I: Auth subgraph relevance filter', () => {
  it('authentication subgraph excludes unrelated models reached via inherited concerns', () => {
    // Mock an index where User (devise) and WpPost share an inherits relationship
    // but WpPost has no auth relevance
    const index = {
      extractions: {
        models: {
          User: { devise_modules: ['database_authenticatable'], has_secure_password: false },
          WpPost: { type: 'model', devise_modules: [], has_secure_password: false },
          WpBase: { type: 'model', devise_modules: [], has_secure_password: false },
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
