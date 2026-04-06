import { describe, it, expect } from 'vitest'
import { Graph, buildGraph } from '../../src/core/graph.js'

describe('Graph', () => {
  describe('addNode', () => {
    it('adds nodes with type and label', () => {
      const g = new Graph()
      g.addNode('User', 'model', 'User')
      expect(g.nodes.size).toBe(1)
      expect(g.nodes.get('User').type).toBe('model')
    })

    it('does not duplicate nodes', () => {
      const g = new Graph()
      g.addNode('User', 'model')
      g.addNode('User', 'model')
      expect(g.nodes.size).toBe(1)
    })
  })

  describe('addEdge', () => {
    it('adds directed weighted edges', () => {
      const g = new Graph()
      g.addNode('User', 'model')
      g.addNode('Post', 'model')
      g.addEdge('User', 'Post', 'has_many')
      expect(g.edges).toHaveLength(1)
      expect(g.edges[0].weight).toBe(2.0)
    })

    it('auto-creates nodes for edges', () => {
      const g = new Graph()
      g.addEdge('A', 'B', 'references')
      expect(g.nodes.size).toBe(2)
    })

    it('uses correct weights for edge types', () => {
      const g = new Graph()
      g.addEdge('A', 'B', 'inherits')
      g.addEdge('B', 'C', 'contains')
      expect(g.edges[0].weight).toBe(3.0)
      expect(g.edges[1].weight).toBe(0.5)
    })
  })

  describe('personalizedPageRank', () => {
    it('returns empty map for empty graph', () => {
      const g = new Graph()
      const ranks = g.personalizedPageRank()
      expect(ranks.size).toBe(0)
    })

    it('computes ranks for a simple chain', () => {
      const g = new Graph()
      g.addEdge('A', 'B', 'references')
      g.addEdge('B', 'C', 'references')
      const ranks = g.personalizedPageRank()
      expect(ranks.size).toBe(3)
      // C should have highest rank (sink node)
      expect(ranks.get('C')).toBeGreaterThan(ranks.get('A'))
    })

    it('converges for a cycle', () => {
      const g = new Graph()
      g.addEdge('A', 'B', 'references')
      g.addEdge('B', 'C', 'references')
      g.addEdge('C', 'A', 'references')
      const ranks = g.personalizedPageRank()
      // Symmetric cycle: all ranks should be approximately equal
      const vals = [...ranks.values()]
      const max = Math.max(...vals)
      const min = Math.min(...vals)
      expect(max - min).toBeLessThan(0.01)
    })

    it('handles dangling nodes', () => {
      const g = new Graph()
      g.addNode('A', 'model')
      g.addNode('B', 'model')
      g.addEdge('A', 'B', 'references')
      // B is a dangling node (no outgoing edges)
      const ranks = g.personalizedPageRank()
      expect(ranks.get('B')).toBeGreaterThan(ranks.get('A'))
    })

    it('applies personalization bias', () => {
      const g = new Graph()
      g.addNode('A', 'model')
      g.addNode('B', 'model')
      g.addNode('C', 'model')
      g.addEdge('A', 'B', 'references')
      g.addEdge('A', 'C', 'references')

      // Bias toward C
      const ranks = g.personalizedPageRank({ C: 10.0 })
      expect(ranks.get('C')).toBeGreaterThan(ranks.get('B'))
    })

    it('sum of ranks approximately equals 1', () => {
      const g = new Graph()
      g.addEdge('A', 'B', 'has_many')
      g.addEdge('B', 'C', 'belongs_to')
      g.addEdge('C', 'A', 'inherits')
      g.addEdge('A', 'D', 'references')
      const ranks = g.personalizedPageRank()
      const sum = [...ranks.values()].reduce((s, v) => s + v, 0)
      expect(sum).toBeCloseTo(1.0, 2)
    })

    it('computes PageRank for 500 nodes in under 100ms', () => {
      const g = new Graph()
      for (let i = 0; i < 500; i++) {
        g.addNode(`node_${i}`, 'model')
      }
      // Add ~2000 random edges
      for (let i = 0; i < 2000; i++) {
        const from = `node_${i % 500}`
        const to = `node_${(i * 7 + 13) % 500}`
        g.addEdge(from, to, 'references')
      }
      const start = performance.now()
      const ranks = g.personalizedPageRank()
      const elapsed = performance.now() - start
      expect(elapsed).toBeLessThan(100)
      expect(ranks.size).toBe(500)
    })
  })
})

describe('buildGraph', () => {
  it('builds graph from model extractions', () => {
    const extractions = {
      models: {
        User: {
          superclass: 'ApplicationRecord',
          associations: [{ name: 'posts', type: 'has_many' }],
          concerns: ['Authenticatable'],
        },
        Post: {
          superclass: 'ApplicationRecord',
          associations: [{ name: 'user', type: 'belongs_to' }],
        },
      },
      controllers: {
        PostsController: { actions: ['index', 'show'] },
      },
    }

    const { graph, relationships, rankings } = buildGraph(extractions, {})
    expect(graph.nodes.size).toBeGreaterThan(0)
    expect(relationships.length).toBeGreaterThan(0)
    expect(Object.keys(rankings).length).toBeGreaterThan(0)

    // Check convention pair
    const convPair = relationships.find(
      (r) => r.from === 'PostsController' && r.type === 'convention_pair',
    )
    expect(convPair).toBeTruthy()
    expect(convPair.to).toBe('Post')
  })

  it('includes schema foreign keys', () => {
    const extractions = {
      schema: {
        foreign_keys: [{ from_table: 'posts', to_table: 'users' }],
      },
    }

    const { relationships } = buildGraph(extractions, {})
    const fk = relationships.find((r) => r.type === 'schema_fk')
    expect(fk).toBeTruthy()
    expect(fk.from).toBe('posts')
    expect(fk.to).toBe('users')
  })

  it('returns empty results for empty extractions', () => {
    const { graph, relationships, rankings } = buildGraph({}, {})
    expect(graph.nodes.size).toBe(0)
    expect(relationships).toEqual([])
    expect(rankings).toEqual({})
  })

  it('creates tests edge from model spec to model', () => {
    const extractions = {
      models: {
        User: {
          superclass: 'ApplicationRecord',
          associations: [],
        },
      },
      test_conventions: {},
    }
    const manifest = {
      entries: [
        {
          path: 'spec/models/user_spec.rb',
          category: 19,
          specCategory: 'model_specs',
        },
      ],
    }
    const { relationships } = buildGraph(extractions, manifest)
    const testsEdge = relationships.find(
      (r) => r.type === 'tests' && r.to === 'User',
    )
    expect(testsEdge).toBeTruthy()
    expect(testsEdge.from).toBe('spec:User')
  })

  it('creates tests edge from namespaced model spec to FQN', () => {
    const extractions = {
      models: {
        'Salesforce::ServiceProvider': {
          superclass: 'ApplicationRecord',
          associations: [],
        },
      },
      test_conventions: {},
    }
    const manifest = {
      entries: [
        {
          path: 'spec/models/salesforce/service_provider_spec.rb',
          category: 19,
          specCategory: 'model_specs',
        },
      ],
    }
    const { relationships } = buildGraph(extractions, manifest)
    const testsEdge = relationships.find(
      (r) => r.type === 'tests' && r.to === 'Salesforce::ServiceProvider',
    )
    expect(testsEdge).toBeTruthy()
    expect(testsEdge.from).toBe('spec:Salesforce::ServiceProvider')
  })

  it('creates tests edge from request spec to controller', () => {
    const extractions = {
      controllers: {
        UsersController: { actions: ['index'] },
      },
      test_conventions: {},
    }
    const manifest = {
      entries: [
        {
          path: 'spec/requests/users_spec.rb',
          category: 19,
          specCategory: 'request_specs',
        },
      ],
    }
    const { relationships } = buildGraph(extractions, manifest)
    const testsEdge = relationships.find(
      (r) => r.type === 'tests' && r.to === 'UsersController',
    )
    expect(testsEdge).toBeTruthy()
  })

  it('silently skips specs for models that do not exist', () => {
    const extractions = {
      models: {},
      test_conventions: {},
    }
    const manifest = {
      entries: [
        {
          path: 'spec/models/missing_spec.rb',
          category: 19,
          specCategory: 'model_specs',
        },
      ],
    }
    const { relationships } = buildGraph(extractions, manifest)
    const testsEdge = relationships.find((r) => r.type === 'tests')
    expect(testsEdge).toBeUndefined()
  })
})

describe('Graph BFS', () => {
  describe('reverseAdjacency', () => {
    it('is built correctly when edges are added', () => {
      const g = new Graph()
      g.addEdge('A', 'B', 'has_many')
      expect(g.reverseAdjacency.get('B')).toEqual(
        expect.arrayContaining([expect.objectContaining({ from: 'A' })]),
      )
    })
  })

  describe('bfsFromSeeds', () => {
    it('returns empty for empty graph', () => {
      const g = new Graph()
      const result = g.bfsFromSeeds(['A'])
      expect(result).toEqual([])
    })

    it('finds direct neighbours at distance 1', () => {
      const g = new Graph()
      g.addEdge('A', 'B', 'has_many')
      const result = g.bfsFromSeeds(['A'])
      expect(result).toHaveLength(1)
      expect(result[0].entity).toBe('B')
      expect(result[0].distance).toBe(1)
    })

    it('respects maxDepth', () => {
      const g = new Graph()
      g.addEdge('A', 'B', 'has_many')
      g.addEdge('B', 'C', 'has_many')
      g.addEdge('C', 'D', 'has_many')
      const result = g.bfsFromSeeds(['A'], 2)
      const entities = result.map((r) => r.entity)
      expect(entities).toContain('B')
      expect(entities).toContain('C')
      expect(entities).not.toContain('D')
    })

    it('traverses reverse edges', () => {
      const g = new Graph()
      g.addEdge('A', 'B', 'has_many')
      const result = g.bfsFromSeeds(['B'])
      const entities = result.map((r) => r.entity)
      expect(entities).toContain('A')
    })

    it('handles multiple seeds', () => {
      const g = new Graph()
      g.addEdge('A', 'B', 'has_many')
      g.addEdge('C', 'D', 'has_many')
      const result = g.bfsFromSeeds(['A', 'C'])
      const entities = result.map((r) => r.entity)
      expect(entities).toContain('B')
      expect(entities).toContain('D')
    })

    it('excludes specified edge types', () => {
      const g = new Graph()
      g.addEdge('A', 'B', 'has_many')
      g.addEdge('A', 'C', 'contains')
      const result = g.bfsFromSeeds(['A'], 3, {
        excludeEdgeTypes: new Set(['contains']),
      })
      const entities = result.map((r) => r.entity)
      expect(entities).toContain('B')
      expect(entities).not.toContain('C')
    })

    it('respects minEdgeWeight', () => {
      const g = new Graph()
      g.addEdge('A', 'B', 'has_many') // weight 2.0
      g.addEdge('A', 'C', 'contains') // weight 0.5
      const result = g.bfsFromSeeds(['A'], 3, { minEdgeWeight: 1.0 })
      const entities = result.map((r) => r.entity)
      expect(entities).toContain('B')
      expect(entities).not.toContain('C')
    })

    it('handles cycles without infinite loop', () => {
      const g = new Graph()
      g.addEdge('A', 'B', 'has_many')
      g.addEdge('B', 'C', 'has_many')
      g.addEdge('C', 'A', 'has_many')
      const result = g.bfsFromSeeds(['A'])
      expect(result.length).toBeLessThanOrEqual(3)
      const entities = result.map((r) => r.entity)
      expect(entities).toContain('B')
      expect(entities).toContain('C')
    })

    it('records reachedVia and edgeType', () => {
      const g = new Graph()
      g.addEdge('A', 'B', 'has_many')
      const result = g.bfsFromSeeds(['A'])
      expect(result[0].reachedVia).toBe('A')
      expect(result[0].edgeType).toBe('has_many')
    })

    it('handles disconnected nodes', () => {
      const g = new Graph()
      g.addEdge('A', 'B', 'has_many')
      g.addNode('C', 'model')
      const result = g.bfsFromSeeds(['A'])
      const entities = result.map((r) => r.entity)
      expect(entities).not.toContain('C')
    })
  })
})

describe('buildGraph new edge types', () => {
  it('adds helps_view edge for helpers', () => {
    const extractions = {
      helpers: {
        PostsHelper: {
          module: 'PostsHelper',
          file: 'app/helpers/posts_helper.rb',
          controller: 'PostsController',
          methods: ['format_date'],
          includes: [],
        },
      },
      controllers: {
        PostsController: { actions: ['index', 'show'] },
      },
    }

    const { graph, relationships } = buildGraph(extractions, {})
    expect(graph.nodes.has('PostsHelper')).toBe(true)
    const helpsEdge = relationships.find(
      (r) => r.from === 'PostsHelper' && r.type === 'helps_view',
    )
    expect(helpsEdge).toBeTruthy()
    expect(helpsEdge.to).toBe('PostsController')
  })

  it('does not add helps_view edge when controller missing', () => {
    const extractions = {
      helpers: {
        OrphanHelper: {
          module: 'OrphanHelper',
          file: 'app/helpers/orphan_helper.rb',
          controller: 'OrphanController',
          methods: [],
          includes: [],
        },
      },
      controllers: {},
    }

    const { relationships } = buildGraph(extractions, {})
    const helpsEdge = relationships.find((r) => r.type === 'helps_view')
    expect(helpsEdge).toBeUndefined()
  })

  it('adds manages_upload edge for uploaders', () => {
    const extractions = {
      models: {
        User: {
          superclass: 'ApplicationRecord',
          associations: [],
        },
      },
      uploaders: {
        uploaders: {
          AvatarUploader: {
            class: 'AvatarUploader',
            file: 'app/uploaders/avatar_uploader.rb',
            type: 'carrierwave',
          },
        },
        mounted: [
          { model: 'User', attribute: 'avatar', uploader: 'AvatarUploader' },
        ],
      },
    }

    const { graph, relationships } = buildGraph(extractions, {})
    expect(graph.nodes.has('AvatarUploader')).toBe(true)
    const uploadEdge = relationships.find(
      (r) => r.from === 'User' && r.type === 'manages_upload',
    )
    expect(uploadEdge).toBeTruthy()
    expect(uploadEdge.to).toBe('AvatarUploader')
  })

  it('worker nodes appear in graph', () => {
    const extractions = {
      workers: {
        BulkIndexWorker: {
          class: 'BulkIndexWorker',
          file: 'app/workers/bulk_index_worker.rb',
          type: 'sidekiq_native',
        },
      },
    }

    const { graph } = buildGraph(extractions, {})
    expect(graph.nodes.has('BulkIndexWorker')).toBe(true)
    expect(graph.nodes.get('BulkIndexWorker').type).toBe('worker')
  })
})

describe('ISSUE-G: Minitest test edges', () => {
  it('creates test edges for Minitest test files', () => {
    const extractions = {
      models: { User: { file: 'app/models/user.rb' } },
      controllers: {},
      test_conventions: {},
    }
    const manifest = {
      entries: [
        {
          path: 'test/models/user_test.rb',
          category: 19,
          categoryName: 'testing',
          specCategory: 'model_tests',
          type: 'ruby',
        },
      ],
    }
    const { relationships } = buildGraph(extractions, manifest)
    const testEdge = relationships.find(
      (r) => r.type === 'tests' && r.to === 'User',
    )
    expect(testEdge).toBeDefined()
  })
})

describe('class_name override — no phantom nodes', () => {
  it('uses class_name override for association edge target, no phantom node', () => {
    const extractions = {
      models: {
        Article: {
          associations: [
            {
              type: 'belongs_to',
              name: 'author',
              options: "class_name: 'AdminUser'",
            },
          ],
          concerns: [],
        },
        AdminUser: { associations: [], concerns: [] },
      },
      controllers: {},
      test_conventions: null,
    }
    const manifest = { entries: [] }
    const { graph } = buildGraph(extractions, manifest)

    expect(graph.nodes.has('AdminUser')).toBe(true)
    expect(graph.nodes.has('Author')).toBe(false)
    const edges = graph.edges.filter(
      (e) => e.from === 'Article' && e.to === 'AdminUser',
    )
    expect(edges.length).toBeGreaterThan(0)
  })

  it('handles class_name with hash rocket syntax', () => {
    const extractions = {
      models: {
        Comment: {
          associations: [
            {
              type: 'belongs_to',
              name: 'creator',
              options: ":class_name => 'User'",
            },
          ],
          concerns: [],
        },
        User: { associations: [], concerns: [] },
      },
      controllers: {},
      test_conventions: null,
    }
    const manifest = { entries: [] }
    const { graph } = buildGraph(extractions, manifest)

    expect(graph.nodes.has('User')).toBe(true)
    expect(graph.nodes.has('Creator')).toBe(false)
  })
})

describe('ISSUE-I: convention_pair prefers un-namespaced controller', () => {
  it('creates convention_pair only from un-namespaced controller when both exist', () => {
    const extractions = {
      models: { Email: { associations: [], concerns: [] } },
      controllers: {
        EmailsController: { class: 'EmailsController', actions: ['index'] },
        'Webhook::V1::EmailsController': {
          class: 'Webhook::V1::EmailsController',
          actions: ['create'],
        },
      },
      test_conventions: null,
    }
    const manifest = { entries: [] }
    const { relationships } = buildGraph(extractions, manifest)

    const conventionPairs = relationships.filter(
      (r) => r.type === 'convention_pair' && r.to === 'Email',
    )
    expect(conventionPairs).toHaveLength(1)
    expect(conventionPairs[0].from).toBe('EmailsController')
  })

  it('creates convention_pair from namespaced controller when no un-namespaced version', () => {
    const extractions = {
      models: { Email: { associations: [], concerns: [] } },
      controllers: {
        'Webhook::V1::EmailsController': {
          class: 'Webhook::V1::EmailsController',
          actions: ['create'],
        },
      },
      test_conventions: null,
    }
    const manifest = { entries: [] }
    const { relationships } = buildGraph(extractions, manifest)

    const conventionPairs = relationships.filter(
      (r) => r.type === 'convention_pair' && r.to === 'Email',
    )
    expect(conventionPairs).toHaveLength(1)
    expect(conventionPairs[0].from).toBe('Webhook::V1::EmailsController')
  })
})
