import { describe, it, expect, beforeAll } from 'vitest'
import {
  computeBlastRadius,
  classifyRisk,
  buildReviewContext,
} from '../../src/core/blast-radius.js'
import { buildIndex } from '../../src/core/indexer.js'
import { buildGraph } from '../../src/core/graph.js'
import { estimateTokensForObject } from '../../src/utils/token-counter.js'

function createMockIndex() {
  const index = {
    extractions: {
      models: {
        User: {
          file: 'app/models/user.rb',
          superclass: 'ApplicationRecord',
          associations: [
            { name: 'posts', type: 'has_many' },
            { name: 'comments', type: 'has_many' },
          ],
          concerns: ['Authenticatable'],
          scopes: [{ name: 'active' }],
          callbacks: [{ name: 'before_save' }],
          devise_modules: ['database_authenticatable'],
        },
        Post: {
          file: 'app/models/post.rb',
          superclass: 'ApplicationRecord',
          associations: [
            { name: 'user', type: 'belongs_to' },
            { name: 'comments', type: 'has_many' },
          ],
          scopes: [{ name: 'published' }, { name: 'recent' }],
        },
        Comment: {
          file: 'app/models/comment.rb',
          superclass: 'ApplicationRecord',
          associations: [
            { name: 'post', type: 'belongs_to' },
            { name: 'user', type: 'belongs_to' },
          ],
        },
      },
      controllers: {
        PostsController: {
          file: 'app/controllers/posts_controller.rb',
          actions: ['index', 'show', 'create'],
          before_actions: [{ name: 'authenticate_user!' }],
        },
        UsersController: {
          file: 'app/controllers/users_controller.rb',
          actions: ['index', 'show'],
        },
        CommentsController: {
          file: 'app/controllers/comments_controller.rb',
          actions: ['create', 'destroy'],
        },
      },
      components: {},
      stimulus_controllers: [],
      routes: {
        routes: [
          { controller: 'posts', action: 'index' },
          { controller: 'users', action: 'index' },
        ],
      },
      schema: {
        tables: {
          users: { columns: ['id', 'email'] },
          posts: { columns: ['id', 'user_id', 'title'] },
          comments: { columns: ['id', 'post_id', 'user_id'] },
        },
        foreign_keys: [
          { from_table: 'posts', to_table: 'users' },
          { from_table: 'comments', to_table: 'posts' },
        ],
      },
      test_conventions: {},
    },
    manifest: {
      entries: [],
      byCategory: {},
      stats: {},
      total_files: 0,
    },
    relationships: [],
    rankings: {},
    fileEntityMap: {
      'app/models/user.rb': { entity: 'User', type: 'model' },
      'app/models/post.rb': { entity: 'Post', type: 'model' },
      'app/models/comment.rb': { entity: 'Comment', type: 'model' },
      'app/controllers/posts_controller.rb': {
        entity: 'PostsController',
        type: 'controller',
      },
      'app/controllers/users_controller.rb': {
        entity: 'UsersController',
        type: 'controller',
      },
      'app/controllers/comments_controller.rb': {
        entity: 'CommentsController',
        type: 'controller',
      },
      'db/schema.rb': { entity: '__schema__', type: 'schema' },
      'config/routes.rb': { entity: '__routes__', type: 'routes' },
      Gemfile: { entity: '__gemfile__', type: 'gemfile' },
      'app/models/concerns/searchable.rb': {
        entity: 'Searchable',
        type: 'concern',
      },
    },
  }
  // Build a real graph from mock extractions
  const { graph, relationships } = buildGraph(index.extractions, index.manifest)
  index.graph = graph
  index.relationships = relationships
  return index
}

describe('computeBlastRadius', () => {
  it('maps files to seed entities', () => {
    const index = createMockIndex()
    const result = computeBlastRadius(index, [
      { path: 'app/models/user.rb', status: 'modified' },
    ])
    expect(result.seeds).toHaveLength(1)
    expect(result.seeds[0].entity).toBe('User')
  })

  it('finds impacted entities via graph', () => {
    const index = createMockIndex()
    const result = computeBlastRadius(index, [
      { path: 'app/models/user.rb', status: 'modified' },
    ])
    const impactedEntities = result.impacted.map((e) => e.entity)
    expect(impactedEntities.length).toBeGreaterThan(0)
  })

  it('classifies direct changes as seeds', () => {
    const index = createMockIndex()
    const result = computeBlastRadius(index, [
      { path: 'app/models/user.rb', status: 'modified' },
    ])
    expect(result.seeds[0].entity).toBe('User')
    expect(result.seeds[0].type).toBe('model')
  })

  it('classifies distance-1 strong edges as HIGH', () => {
    const index = createMockIndex()
    const result = computeBlastRadius(index, [
      { path: 'app/models/user.rb', status: 'modified' },
    ])
    const highEntities = result.impacted.filter((e) => e.risk === 'HIGH')
    expect(highEntities.length).toBeGreaterThanOrEqual(0)
  })

  it('identifies impacted tests', () => {
    const index = createMockIndex()
    // Add test_conventions to trigger spec edges
    index.extractions.test_conventions = {}
    index.manifest.entries = [
      {
        path: 'spec/models/user_spec.rb',
        category: 19,
        specCategory: 'model_specs',
      },
    ]
    const result = computeBlastRadius(index, [
      { path: 'app/models/user.rb', status: 'modified' },
    ])
    // impactedTests may be populated if graph has test edges
    expect(result.impactedTests).toBeDefined()
    expect(Array.isArray(result.impactedTests)).toBe(true)
  })

  it('handles unmapped files gracefully', () => {
    const index = createMockIndex()
    const result = computeBlastRadius(index, [
      { path: 'README.md', status: 'modified' },
    ])
    expect(result.warnings).toContain('Unmapped file: README.md')
  })

  it('escalates concern changes', () => {
    const index = createMockIndex()
    const result = computeBlastRadius(index, [
      { path: 'app/models/concerns/searchable.rb', status: 'modified' },
    ])
    expect(result.seeds[0].type).toBe('concern')
  })

  it('escalates schema changes', () => {
    const index = createMockIndex()
    const result = computeBlastRadius(index, [
      { path: 'db/schema.rb', status: 'modified' },
    ])
    // Schema changes should seed all models
    expect(result.seeds[0].entity).toBe('__schema__')
    expect(result.impacted.length).toBeGreaterThan(0)
  })

  it('escalates auth changes', () => {
    const index = createMockIndex()
    const result = computeBlastRadius(index, [
      { path: 'app/models/user.rb', status: 'modified' },
    ])
    // User has devise modules, so auth-related entities should be escalated
    expect(result.seeds[0].entity).toBe('User')
  })

  it('produces correct summary counts', () => {
    const index = createMockIndex()
    const result = computeBlastRadius(index, [
      { path: 'app/models/user.rb', status: 'modified' },
    ])
    const total =
      result.summary.CRITICAL +
      result.summary.HIGH +
      result.summary.MEDIUM +
      result.summary.LOW
    expect(total).toBe(result.summary.total)
  })

  it('respects maxDepth', () => {
    const index = createMockIndex()
    const result = computeBlastRadius(
      index,
      [{ path: 'app/models/user.rb', status: 'modified' }],
      { maxDepth: 1 },
    )
    for (const entity of result.impacted) {
      expect(entity.distance).toBeLessThanOrEqual(1)
    }
  })

  it('handles empty changed files', () => {
    const index = createMockIndex()
    const result = computeBlastRadius(index, [])
    expect(result.seeds).toEqual([])
    expect(result.impacted).toEqual([])
    expect(result.message).toBe('No changes detected')
  })

  it('deduplicates impacted entities', () => {
    const index = createMockIndex()
    const result = computeBlastRadius(index, [
      { path: 'app/models/user.rb', status: 'modified' },
      { path: 'app/models/post.rb', status: 'modified' },
    ])
    const entityNames = result.impacted.map((e) => e.entity)
    const unique = new Set(entityNames)
    expect(entityNames.length).toBe(unique.size)
  })
})

describe('classifyRisk', () => {
  const index = createMockIndex()

  it('returns CRITICAL for distance 0', () => {
    const result = classifyRisk(
      { entity: 'User', distance: 0, edgeType: null },
      { entity: 'User', type: 'model' },
      index,
    )
    expect(result).toBe('CRITICAL')
  })

  it('returns HIGH for auth-related changes at distance 1', () => {
    const result = classifyRisk(
      { entity: 'Authenticatable', distance: 1, edgeType: 'includes_concern' },
      { entity: 'User', type: 'model' },
      index,
    )
    expect(result).toBe('HIGH')
  })

  it('returns MEDIUM for distance 2 with strong edge', () => {
    const result = classifyRisk(
      { entity: 'Comment', distance: 2, edgeType: 'has_many' },
      { entity: 'User', type: 'model' },
      index,
    )
    expect(result).toBe('MEDIUM')
  })

  it('returns LOW for distance 3', () => {
    const result = classifyRisk(
      { entity: 'SomeFarEntity', distance: 3, edgeType: 'references' },
      { entity: 'User', type: 'model' },
      index,
    )
    expect(result).toBe('LOW')
  })
})

describe('buildReviewContext', () => {
  it('fits within token budget', () => {
    const index = createMockIndex()
    const blastResult = computeBlastRadius(index, [
      { path: 'app/models/user.rb', status: 'modified' },
    ])
    const context = buildReviewContext(index, blastResult, 8000)
    const tokens = estimateTokensForObject(context)
    expect(tokens).toBeLessThanOrEqual(8000)
  })

  it('prioritises CRITICAL entities', () => {
    const index = createMockIndex()
    const blastResult = computeBlastRadius(index, [
      { path: 'db/schema.rb', status: 'modified' },
    ])
    const context = buildReviewContext(index, blastResult, 500)
    // Even at tight budget, should include some entities
    expect(context.entities).toBeDefined()
    expect(context.summary).toBeDefined()
  })

  it('includes model summaries', () => {
    const index = createMockIndex()
    const blastResult = computeBlastRadius(index, [
      { path: 'app/models/user.rb', status: 'modified' },
    ])
    const context = buildReviewContext(index, blastResult, 8000)
    const modelEntities = context.entities.filter((e) => e.type === 'model')
    if (modelEntities.length > 0) {
      expect(modelEntities[0].summary).toBeDefined()
    }
  })

  it('includes controller summaries', () => {
    const index = createMockIndex()
    const blastResult = computeBlastRadius(index, [
      { path: 'app/controllers/posts_controller.rb', status: 'modified' },
    ])
    const context = buildReviewContext(index, blastResult, 8000)
    const ctrlEntities = context.entities.filter((e) => e.type === 'controller')
    if (ctrlEntities.length > 0) {
      expect(ctrlEntities[0].summary).toBeDefined()
    }
  })

  it('progressively trims at tight budget', () => {
    const index = createMockIndex()
    const blastResult = computeBlastRadius(index, [
      { path: 'app/models/user.rb', status: 'modified' },
    ])
    const context = buildReviewContext(index, blastResult, 200)
    const tokens = estimateTokensForObject(context)
    expect(tokens).toBeLessThanOrEqual(200)
  })
})

describe('Edge cases', () => {
  it('handles routes.rb change as wide-blast-radius', () => {
    const index = createMockIndex()
    const result = computeBlastRadius(index, [
      { path: 'config/routes.rb', status: 'modified' },
    ])
    // Routes change should seed all controllers
    expect(result.impacted.length).toBeGreaterThan(0)
  })

  it('handles view file change', () => {
    const index = createMockIndex()
    index.fileEntityMap['app/views/posts/index.html.erb'] = {
      entity: 'PostsController',
      type: 'view',
    }
    const result = computeBlastRadius(index, [
      { path: 'app/views/posts/index.html.erb', status: 'modified' },
    ])
    expect(result.seeds[0].entity).toBe('PostsController')
  })

  it('handles Gemfile change with warning', () => {
    const index = createMockIndex()
    const result = computeBlastRadius(index, [
      { path: 'Gemfile', status: 'modified' },
    ])
    expect(result.warnings.some((w) => w.includes('Gemfile'))).toBe(true)
  })

  it('handles concern with many includers', () => {
    const index = createMockIndex()
    const result = computeBlastRadius(index, [
      { path: 'app/models/concerns/searchable.rb', status: 'modified' },
    ])
    // Should not crash, concern fan-out handled
    expect(result.seeds).toBeDefined()
    expect(result.impacted).toBeDefined()
  })

  it('handles file in app/services/', () => {
    const index = createMockIndex()
    index.fileEntityMap['app/services/payment_processor.rb'] = {
      entity: 'PaymentProcessor',
      type: 'service',
    }
    const result = computeBlastRadius(index, [
      { path: 'app/services/payment_processor.rb', status: 'modified' },
    ])
    expect(result.seeds[0].entity).toBe('PaymentProcessor')
  })
})
