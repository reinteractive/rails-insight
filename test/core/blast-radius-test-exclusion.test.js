/**
 * Tests for test edge exclusion from blast radius BFS.
 * @module blast-radius-test-exclusion.test
 */

import { describe, it, expect } from 'vitest'
import { Graph } from '../../src/core/graph.js'
import { computeBlastRadius } from '../../src/core/blast-radius.js'

describe('test edge exclusion from BFS', () => {
  /**
   * Build a minimal index with a graph containing test edges.
   */
  function buildTestIndex() {
    const graph = new Graph()
    graph.addNode('User', 'model')
    graph.addNode('PostsController', 'controller')
    graph.addNode('spec:User', 'spec')
    graph.addEdge('PostsController', 'User', 'convention_pair')
    graph.addEdge('spec:User', 'User', 'tests')

    return {
      graph,
      extractions: {
        models: { User: {} },
        controllers: { PostsController: {} },
      },
      fileEntityMap: {
        'app/models/user.rb': { entity: 'User', type: 'model' },
      },
    }
  }

  it('test entities not in impacted array', () => {
    const index = buildTestIndex()
    const blastResult = computeBlastRadius(index, [
      { path: 'app/models/user.rb', status: 'modified' },
    ])
    const impactedEntities = blastResult.impacted.map((e) => e.entity)
    expect(impactedEntities).not.toContain('spec:User')
  })

  it('test entities appear in impactedTests', () => {
    const index = buildTestIndex()
    const blastResult = computeBlastRadius(index, [
      { path: 'app/models/user.rb', status: 'modified' },
    ])
    const testEntities = blastResult.impactedTests.map((t) => t.entity)
    expect(testEntities).toContain('spec:User')
  })

  it('non-test entities still reachable', () => {
    const index = buildTestIndex()
    const blastResult = computeBlastRadius(index, [
      { path: 'app/models/user.rb', status: 'modified' },
    ])
    const impactedEntities = blastResult.impacted.map((e) => e.entity)
    expect(impactedEntities).toContain('PostsController')
  })
})
