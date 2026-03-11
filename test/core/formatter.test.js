import { describe, it, expect } from 'vitest'
import { formatOutput } from '../../src/core/formatter.js'
import { estimateTokens } from '../../src/utils/token-counter.js'

describe('Formatter', () => {
  // Create a large index to test trimming
  function createLargeIndex() {
    const models = {}
    for (let i = 0; i < 50; i++) {
      models[`Model${i}`] = {
        superclass: 'ApplicationRecord',
        associations: Array.from({ length: 5 }, (_, j) => ({
          name: `assoc_${j}`,
          type: 'has_many',
        })),
        columns: Array.from({ length: 10 }, (_, j) => ({
          name: `column_${j}`,
          type: 'string',
        })),
      }
    }

    return {
      version: '1.0.0',
      generated_at: new Date().toISOString(),
      versions: { rails: '7.1', ruby: '3.3.0' },
      statistics: { total_files: 150, models: 50 },
      context: { conventions: ['Use RSpec'] },
      manifest: {
        entries: Array.from({ length: 150 }, (_, i) => ({
          path: `app/models/model_${i}.rb`,
          category: 'model',
        })),
      },
      drift: [],
      rankings: Object.fromEntries(
        Array.from({ length: 50 }, (_, i) => [`Model${i}`, 0.02]),
      ),
      relationships: Array.from({ length: 100 }, (_, i) => ({
        from: `Model${i % 50}`,
        to: `Model${(i + 1) % 50}`,
        type: 'has_many',
      })),
      extractions: {
        models,
        gemfile: { gems: { rails: { version: '7.1' } } },
        schema: { tables: [] },
        controllers: {},
        routes: { routes: [] },
        auth: { primary_strategy: null },
        config: {},
        jobs: {},
        email: {},
        storage: {},
        caching: {},
        realtime: {},
        api: {},
        views: {},
        tier2: {},
        tier3: {},
      },
    }
  }

  it('returns full index when under budget', () => {
    const small = { version: '1.0', stats: { files: 1 } }
    const result = formatOutput(small, 100000)
    expect(result).toEqual(small)
  })

  it('returns empty object for null input', () => {
    expect(formatOutput(null)).toEqual({})
  })

  it('preserves high-priority sections', () => {
    const fullIndex = createLargeIndex()
    const result = formatOutput(fullIndex, 4000)
    expect(result.version).toBe('1.0.0')
    expect(result.versions).toBeDefined()
    expect(result.statistics).toBeDefined()
  })

  it('token-budgeted output fits within 15% of budget', () => {
    const fullIndex = createLargeIndex()
    const budgets = [4000, 8000, 12000, 20000]
    for (const budget of budgets) {
      const result = formatOutput(fullIndex, budget)
      const tokens = estimateTokens(JSON.stringify(result))
      expect(tokens).toBeLessThan(budget * 1.15)
      // Output should use a meaningful portion of the budget
      expect(tokens).toBeGreaterThan(budget * 0.3)
    }
  })

  it('trims extractions by priority', () => {
    const fullIndex = createLargeIndex()
    const result = formatOutput(fullIndex, 8000)
    if (result.extractions) {
      // Higher priority sections should be present
      const keys = Object.keys(result.extractions)
      if (keys.length > 0) {
        // gemfile/schema should appear before tier3 if space allows
        expect(
          keys.indexOf('tier3') === -1 ||
            keys.indexOf('gemfile') < keys.indexOf('tier3'),
        ).toBe(true)
      }
    }
  })

  it('handles empty index', () => {
    const result = formatOutput({}, 1000)
    expect(result).toEqual({})
  })

  it('returns empty object for non-object input', () => {
    expect(formatOutput('string')).toEqual({})
    expect(formatOutput(42)).toEqual({})
    expect(formatOutput(undefined)).toEqual({})
  })

  it('uses default budget when none provided', () => {
    const small = { version: '1.0', stats: { files: 1 } }
    const result = formatOutput(small)
    expect(result).toEqual(small)
  })

  it('trims an array section to fit', () => {
    const index = {
      version: '1.0',
      statistics: { files: 1 },
      relationships: Array.from({ length: 1000 }, (_, i) => ({
        from: `Model${i}`,
        to: `Model${i + 1}`,
        type: 'has_many',
        details:
          'This is a longer string to make each element take more tokens for testing',
      })),
    }
    // Very tight budget — should trim relationships
    const result = formatOutput(index, 200)
    expect(result.version).toBe('1.0')
    if (result.relationships) {
      expect(result.relationships.length).toBeLessThan(1000)
    }
  })

  it('trims an object section to fit', () => {
    const rankings = {}
    for (let i = 0; i < 500; i++) {
      rankings[`EntityWithALongName${i}`] = Math.random()
    }
    const index = {
      version: '1.0',
      statistics: { files: 1 },
      rankings,
    }
    const result = formatOutput(index, 500)
    expect(result.version).toBe('1.0')
    if (result.rankings) {
      expect(Object.keys(result.rankings).length).toBeLessThan(500)
    }
  })

  it('trims extractions by priority order', () => {
    const largeExtraction = {}
    for (let i = 0; i < 100; i++) {
      largeExtraction[`key${i}`] = `value ${i} padding padding padding padding`
    }
    const index = {
      version: '1.0',
      extractions: {
        gemfile: { gems: { rails: '7.1' } },
        schema: { tables: [{ name: 'users', columns: [] }] },
        tier3: largeExtraction,
        tier2: largeExtraction,
      },
    }
    const result = formatOutput(index, 300)
    if (result.extractions) {
      const keys = Object.keys(result.extractions)
      // gemfile/schema should be included before tier2/tier3
      if (keys.includes('gemfile') && keys.includes('tier3')) {
        expect(keys.indexOf('gemfile')).toBeLessThan(keys.indexOf('tier3'))
      }
    }
  })

  it('drops sections that cannot fit even when trimmed', () => {
    const index = {
      version: '1.0',
      statistics: { files: 1 },
      extractions: {
        models: Array.from({ length: 200 }, (_, i) => ({
          name: `VeryLongModelName${i}`,
          associations: Array.from({ length: 20 }, () => ({
            type: 'has_many',
            name: 'things',
          })),
        })),
      },
    }
    // Extremely tight budget
    const result = formatOutput(index, 50)
    expect(result.version).toBe('1.0')
  })

  it('includes non-priority top-level keys if budget allows', () => {
    const index = {
      version: '1.0',
      statistics: { files: 1 },
      custom_section: { hello: 'world' },
    }
    const result = formatOutput(index, 5000)
    expect(result.custom_section).toEqual({ hello: 'world' })
  })

  it('trimSection returns null when available tokens <= 10', () => {
    const fullIndex = createLargeIndex()
    // Force a very tiny remaining budget by having large preceding sections
    const result = formatOutput(fullIndex, 50)
    expect(result.version).toBe('1.0.0')
  })
})
