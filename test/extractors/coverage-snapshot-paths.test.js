/**
 * Tests for coverage snapshot path normalization.
 * @module coverage-snapshot-paths.test
 */

import { describe, it, expect } from 'vitest'
import { extractCoverageSnapshot } from '../../src/extractors/coverage-snapshot.js'

// We test normaliseToRelative indirectly through the extractor.
// Create a mock provider with SimpleCov JSON containing various path formats.
function mockProvider(filePaths) {
  const coverage = {}
  for (const fp of filePaths) {
    coverage[fp] = [1, 1, 1] // 3 covered lines
  }
  return {
    readFile: (path) => {
      if (path === 'coverage/coverage.json') {
        return JSON.stringify({ coverage })
      }
      return null
    },
  }
}

describe('coverage snapshot path normalization', () => {
  it('already relative app path', () => {
    const provider = mockProvider(['app/models/user.rb'])
    const result = extractCoverageSnapshot(provider)
    expect(result.per_file).toHaveProperty('app/models/user.rb')
  })

  it('absolute path with single app', () => {
    const provider = mockProvider(['/home/user/project/app/models/user.rb'])
    const result = extractCoverageSnapshot(provider)
    expect(result.per_file).toHaveProperty('app/models/user.rb')
  })

  it('absolute path with app in parent', () => {
    const provider = mockProvider(['/home/user/my-app/app/models/user.rb'])
    const result = extractCoverageSnapshot(provider)
    expect(result.per_file).toHaveProperty('app/models/user.rb')
  })

  it('lib path without gems', () => {
    const provider = mockProvider(['/home/user/project/lib/tasks/seed.rb'])
    const result = extractCoverageSnapshot(provider)
    expect(result.per_file).toHaveProperty('lib/tasks/seed.rb')
  })

  it('lib path inside gem ignored', () => {
    const provider = mockProvider([
      '/home/user/.rbenv/gems/devise/lib/devise.rb',
    ])
    const result = extractCoverageSnapshot(provider)
    expect(result.per_file).not.toHaveProperty('lib/devise.rb')
  })

  it('unrecognized path', () => {
    const provider = mockProvider(['/etc/config.rb'])
    const result = extractCoverageSnapshot(provider)
    expect(Object.keys(result.per_file)).toHaveLength(0)
  })
})
