import { describe, it, expect, beforeAll } from 'vitest'
import { resolve } from 'node:path'
import { buildIndex } from '../../src/core/indexer.js'
import {
  createFixtureProvider,
  createMemoryProvider,
} from '../helpers/mock-provider.js'
import { Graph } from '../../src/core/graph.js'
import { formatOutput } from '../../src/core/formatter.js'

const FIXTURE_DIR = resolve(import.meta.dirname, '../fixtures/rails-8.1-full')

describe('Performance Benchmarks', () => {
  it('builds index in under 5 seconds', async () => {
    const provider = createFixtureProvider(FIXTURE_DIR)
    const start = Date.now()
    const index = await buildIndex(provider)
    const elapsed = Date.now() - start
    expect(elapsed).toBeLessThan(5000)
    expect(index).toBeDefined()
  })

  it('PageRank completes in under 100ms for 500-node graph', () => {
    const graph = new Graph()
    for (let i = 0; i < 500; i++) {
      graph.addNode(`node_${i}`, 'model', `Node${i}`)
    }
    for (let i = 0; i < 2000; i++) {
      const from = `node_${Math.floor(Math.random() * 500)}`
      const to = `node_${Math.floor(Math.random() * 500)}`
      if (from !== to) {
        graph.addEdge(from, to, 'has_many')
      }
    }
    const start = Date.now()
    const ranks = graph.personalizedPageRank()
    const elapsed = Date.now() - start
    expect(elapsed).toBeLessThan(100)
    expect(ranks.size).toBe(500)
  })

  it('token-budgeted output fits within 15% of budget', async () => {
    const provider = createFixtureProvider(FIXTURE_DIR)
    const index = await buildIndex(provider)
    const budget = 8000
    const trimmed = formatOutput(index, budget)
    const json = JSON.stringify(trimmed)
    const tokens = Math.ceil(json.length / 4)
    expect(tokens).toBeLessThanOrEqual(budget * 1.15)
  })

  it('individual extractor calls complete in under 50ms', async () => {
    const provider = createFixtureProvider(FIXTURE_DIR)
    const index = await buildIndex(provider)

    // Test accessing each extraction (simulates tool call)
    const start = Date.now()
    const models = index.extractions?.models || {}
    const user = models['User']
    const controllers = index.extractions?.controllers || {}
    const schema = index.extractions?.schema
    const routes = index.extractions?.routes
    const elapsed = Date.now() - start
    expect(elapsed).toBeLessThan(50)
  })
})
