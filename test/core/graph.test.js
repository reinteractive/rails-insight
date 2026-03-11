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
})
