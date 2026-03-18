import { describe, it, expect } from 'vitest'
import { extractCoverageSnapshot } from '../../src/extractors/coverage-snapshot.js'
import { createMemoryProvider } from '../helpers/mock-provider.js'

describe('Coverage Snapshot Extractor', () => {
  it('returns available: false when no coverage file exists', () => {
    const provider = createMemoryProvider({})
    const result = extractCoverageSnapshot(provider)
    expect(result.available).toBe(false)
    expect(result.tool).toBeNull()
  })

  it('parses modern SimpleCov JSON format correctly', () => {
    const coverageData = {
      timestamp: 1700000000,
      coverage: {
        '/project/app/models/user.rb': {
          lines: [1, 1, null, 0, 1, 1, null, 0, 1, 1],
        },
      },
    }
    const provider = createMemoryProvider({
      'coverage/coverage.json': JSON.stringify(coverageData),
    })
    const result = extractCoverageSnapshot(provider)
    expect(result.available).toBe(true)
    expect(result.tool).toBe('simplecov')
    expect(result.timestamp).toBe(1700000000)
  })

  it('calculates overall line coverage percentage accurately', () => {
    const coverageData = {
      coverage: {
        '/project/app/models/user.rb': {
          lines: [1, 1, 1, 0, 0, null, null, 1],
        },
      },
    }
    const provider = createMemoryProvider({
      'coverage/coverage.json': JSON.stringify(coverageData),
    })
    const result = extractCoverageSnapshot(provider)
    // 4 covered out of 6 relevant lines = 66.7%
    expect(result.overall.line_coverage).toBe(66.7)
  })

  it('calculates per-file coverage correctly', () => {
    const coverageData = {
      coverage: {
        '/project/app/models/user.rb': {
          lines: [1, 1, 0, null],
        },
        '/project/app/models/post.rb': {
          lines: [1, 1, 1, 1],
        },
      },
    }
    const provider = createMemoryProvider({
      'coverage/coverage.json': JSON.stringify(coverageData),
    })
    const result = extractCoverageSnapshot(provider)
    expect(result.per_file['app/models/user.rb'].line_coverage).toBe(66.7)
    expect(result.per_file['app/models/post.rb'].line_coverage).toBe(100)
    expect(result.overall.files_tracked).toBe(2)
  })

  it('identifies uncovered line numbers (0-values)', () => {
    const coverageData = {
      coverage: {
        '/project/app/models/user.rb': {
          lines: [1, 0, null, 0, 1],
        },
      },
    }
    const provider = createMemoryProvider({
      'coverage/coverage.json': JSON.stringify(coverageData),
    })
    const result = extractCoverageSnapshot(provider)
    expect(result.per_file['app/models/user.rb'].uncovered_lines).toEqual([
      2, 4,
    ])
  })

  it('handles null entries in lines array correctly', () => {
    const coverageData = {
      coverage: {
        '/project/app/models/user.rb': {
          lines: [null, null, 1, null, 0],
        },
      },
    }
    const provider = createMemoryProvider({
      'coverage/coverage.json': JSON.stringify(coverageData),
    })
    const result = extractCoverageSnapshot(provider)
    // Only 2 relevant lines (index 2 and 4), 1 covered
    expect(result.per_file['app/models/user.rb'].lines_total).toBe(2)
    expect(result.per_file['app/models/user.rb'].lines_covered).toBe(1)
    expect(result.overall.line_coverage).toBe(50)
  })

  it('parses branch coverage when available', () => {
    const coverageData = {
      coverage: {
        '/project/app/models/user.rb': {
          lines: [1, 1, 1],
          branches: {
            branch_0: { then: 1, else: 0 },
          },
        },
      },
    }
    const provider = createMemoryProvider({
      'coverage/coverage.json': JSON.stringify(coverageData),
    })
    const result = extractCoverageSnapshot(provider)
    expect(result.overall.branch_coverage).toBe(50)
    expect(result.per_file['app/models/user.rb'].branch_coverage).toBe(50)
  })

  it('cross-references uncovered lines with model method_line_ranges', () => {
    const coverageData = {
      coverage: {
        'app/models/user.rb': {
          lines: [1, 1, 0, 0, 1, 1, null, 1, 1, 1],
        },
      },
    }
    const provider = createMemoryProvider({
      'coverage/coverage.json': JSON.stringify(coverageData),
    })
    const modelExtractions = {
      User: {
        file: 'app/models/user.rb',
        method_line_ranges: {
          activate: { start: 2, end: 5 },
          deactivate: { start: 7, end: 10 },
        },
      },
    }
    const result = extractCoverageSnapshot(provider, modelExtractions, {})
    const activateUncovered = result.uncovered_methods.find(
      (m) => m.method === 'activate',
    )
    expect(activateUncovered).toBeDefined()
    expect(activateUncovered.entity).toBe('User')
    expect(activateUncovered.entity_type).toBe('model')
    expect(activateUncovered.uncovered_lines).toBe(2)
  })

  it('cross-references uncovered lines with controller action_line_ranges', () => {
    const coverageData = {
      coverage: {
        'app/controllers/users_controller.rb': {
          lines: [1, 0, 0, 1],
        },
      },
    }
    const provider = createMemoryProvider({
      'coverage/coverage.json': JSON.stringify(coverageData),
    })
    const controllerExtractions = {
      UsersController: {
        file: 'app/controllers/users_controller.rb',
        action_line_ranges: {
          index: { start: 1, end: 4 },
        },
      },
    }
    const result = extractCoverageSnapshot(provider, {}, controllerExtractions)
    const indexUncovered = result.uncovered_methods.find(
      (m) => m.method === 'index',
    )
    expect(indexUncovered).toBeDefined()
    expect(indexUncovered.entity_type).toBe('controller')
  })

  it('normalises absolute file paths to relative', () => {
    const coverageData = {
      coverage: {
        '/home/user/project/app/models/user.rb': {
          lines: [1, 1, 1],
        },
        '/home/user/project/lib/utils.rb': {
          lines: [1, 0],
        },
      },
    }
    const provider = createMemoryProvider({
      'coverage/coverage.json': JSON.stringify(coverageData),
    })
    const result = extractCoverageSnapshot(provider)
    expect(result.per_file['app/models/user.rb']).toBeDefined()
    expect(result.per_file['lib/utils.rb']).toBeDefined()
  })

  it('skips non-app files (gem files)', () => {
    const coverageData = {
      coverage: {
        '/home/user/.gems/ruby/3.2.0/gems/some_gem/lib/gem.rb': {
          lines: [1, 1, 1],
        },
        '/project/app/models/user.rb': {
          lines: [1, 0],
        },
      },
    }
    const provider = createMemoryProvider({
      'coverage/coverage.json': JSON.stringify(coverageData),
    })
    const result = extractCoverageSnapshot(provider)
    // Gem file should be skipped (no app/ or lib/ in relative context)
    expect(result.overall.files_tracked).toBe(1)
  })

  it('handles malformed JSON gracefully', () => {
    const provider = createMemoryProvider({
      'coverage/coverage.json': '{ invalid json }}',
    })
    const result = extractCoverageSnapshot(provider)
    expect(result.available).toBe(false)
  })

  it('handles legacy array format for line data', () => {
    const coverageData = {
      coverage: {
        '/project/app/models/user.rb': [1, 0, null, 1, 1],
      },
    }
    const provider = createMemoryProvider({
      'coverage/coverage.json': JSON.stringify(coverageData),
    })
    const result = extractCoverageSnapshot(provider)
    expect(result.available).toBe(true)
    expect(result.per_file['app/models/user.rb'].lines_total).toBe(4)
    expect(result.per_file['app/models/user.rb'].lines_covered).toBe(3)
  })
})
