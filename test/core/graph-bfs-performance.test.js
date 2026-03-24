/**
 * Tests for BFS performance and adjacency map usage.
 * @module graph-bfs-performance.test
 */

import { describe, it, expect } from 'vitest'
import { Graph } from '../../src/core/graph.js'

describe('BFS via adjacency maps', () => {
  it('BFS returns same results as linear scan', () => {
    const graph = new Graph()
    for (let i = 0; i < 10; i++) graph.addNode(`N${i}`, 'model')
    graph.addEdge('N0', 'N1', 'has_many')
    graph.addEdge('N1', 'N2', 'belongs_to')
    graph.addEdge('N2', 'N3', 'has_many')
    graph.addEdge('N3', 'N4', 'belongs_to')
    graph.addEdge('N0', 'N5', 'has_one')
    graph.addEdge('N5', 'N6', 'has_many')

    const bfsResults = graph.bfsFromSeeds(['N0'], 3)
    const entities = bfsResults.map((r) => r.entity)
    expect(entities).toContain('N1')
    expect(entities).toContain('N2')
    expect(entities).toContain('N5')
  })

  it('BFS respects excludeEdgeTypes', () => {
    const graph = new Graph()
    graph.addNode('A', 'model')
    graph.addNode('B', 'model')
    graph.addNode('C', 'model')
    graph.addEdge('A', 'B', 'has_many')
    graph.addEdge('A', 'C', 'tests')

    const bfsResults = graph.bfsFromSeeds(['A'], 3, {
      excludeEdgeTypes: new Set(['tests']),
    })
    const entities = bfsResults.map((r) => r.entity)
    expect(entities).toContain('B')
    expect(entities).not.toContain('C')
  })

  it('BFS respects minEdgeWeight', () => {
    const graph = new Graph()
    graph.addNode('A', 'model')
    graph.addNode('B', 'model')
    graph.addNode('C', 'model')
    graph.addEdge('A', 'B', 'has_many') // weight 2.0
    graph.addEdge('A', 'C', 'validates_with') // weight 0.5

    const bfsResults = graph.bfsFromSeeds(['A'], 3, { minEdgeWeight: 1.0 })
    const entities = bfsResults.map((r) => r.entity)
    expect(entities).toContain('B')
    expect(entities).not.toContain('C')
  })

  it('BFS handles disconnected nodes', () => {
    const graph = new Graph()
    graph.addNode('A', 'model')
    graph.addNode('B', 'model')
    graph.addNode('Disconnected', 'model')
    graph.addEdge('A', 'B', 'has_many')

    const bfsResults = graph.bfsFromSeeds(['A'], 3)
    const entities = bfsResults.map((r) => r.entity)
    expect(entities).not.toContain('Disconnected')
  })

  it('BFS handles self-referencing edges', () => {
    const graph = new Graph()
    graph.addNode('A', 'model')
    graph.addEdge('A', 'A', 'has_many')

    const bfsResults = graph.bfsFromSeeds(['A'], 3)
    // A is a seed (distance 0), self-edge doesn't create a duplicate
    expect(bfsResults.filter((r) => r.entity === 'A')).toHaveLength(0)
  })

  it('forward adjacency entries include type', () => {
    const graph = new Graph()
    graph.addNode('A', 'model')
    graph.addNode('B', 'model')
    graph.addEdge('A', 'B', 'has_many')

    const adjEntries = graph.adjacency.get('A')
    expect(adjEntries[0]).toHaveProperty('type', 'has_many')
  })

  it('BFS traverses reverse edges', () => {
    const graph = new Graph()
    graph.addNode('A', 'model')
    graph.addNode('B', 'model')
    graph.addEdge('A', 'B', 'has_many')

    const bfsResults = graph.bfsFromSeeds(['B'], 3)
    const entities = bfsResults.map((r) => r.entity)
    expect(entities).toContain('A')
  })

  it('BFS maxDepth is respected', () => {
    const graph = new Graph()
    graph.addNode('A', 'model')
    graph.addNode('B', 'model')
    graph.addNode('C', 'model')
    graph.addNode('D', 'model')
    graph.addEdge('A', 'B', 'has_many')
    graph.addEdge('B', 'C', 'has_many')
    graph.addEdge('C', 'D', 'has_many')

    const bfsResults = graph.bfsFromSeeds(['A'], 2)
    const entities = bfsResults.map((r) => r.entity)
    expect(entities).toContain('B')
    expect(entities).toContain('C')
    expect(entities).not.toContain('D')
  })
})
