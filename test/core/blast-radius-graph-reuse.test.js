/**
 * Tests for blast radius graph reuse from index.
 * @module blast-radius-graph-reuse.test
 */

import { describe, it, expect } from 'vitest'
import { Graph, buildGraph } from '../../src/core/graph.js'
import { computeBlastRadius } from '../../src/core/blast-radius.js'

describe('blast radius graph reuse', () => {
  it('index includes graph instance', () => {
    const extractions = {
      models: {
        User: { associations: [], concerns: [] },
      },
      controllers: {},
      routes: {},
      schema: {},
    }
    const { graph } = buildGraph(extractions, { entries: [] })
    expect(graph).toBeInstanceOf(Graph)
    expect(graph.nodes.size).toBeGreaterThan(0)
  })

  it('blast radius uses index graph', () => {
    const graph = new Graph()
    graph.addNode('User', 'model')
    graph.addNode('PostsController', 'controller')
    graph.addEdge('PostsController', 'User', 'convention_pair')

    const index = {
      graph,
      extractions: {
        models: { User: {} },
        controllers: { PostsController: {} },
      },
      fileEntityMap: {
        'app/models/user.rb': { entity: 'User', type: 'model' },
      },
    }

    const blastResult = computeBlastRadius(index, [
      { path: 'app/models/user.rb', status: 'modified' },
    ])
    expect(blastResult.seeds.length).toBeGreaterThan(0)
    expect(blastResult).toHaveProperty('impacted')
  })

  it('blast radius without graph returns error', () => {
    const index = {
      extractions: { models: {}, controllers: {} },
      fileEntityMap: {
        'app/models/user.rb': { entity: 'User', type: 'model' },
      },
    }

    const blastResult = computeBlastRadius(index, [
      { path: 'app/models/user.rb', status: 'modified' },
    ])
    expect(blastResult.message).toContain('No graph available')
  })

  it('no redundant graph build imports', async () => {
    const { readFileSync } = await import('node:fs')
    const content = readFileSync(
      new URL('../../src/core/blast-radius.js', import.meta.url),
      'utf-8',
    )
    expect(content).not.toContain('import { buildGraph')
    expect(content).not.toContain('_buildGraphDirect')
  })
})
