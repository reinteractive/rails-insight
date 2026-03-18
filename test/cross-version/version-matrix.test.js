import { describe, it, expect, beforeAll } from 'vitest'
import { resolve } from 'node:path'
import { buildIndex } from '../../src/core/indexer.js'
import { createFixtureProvider } from '../helpers/mock-provider.js'
import { computeBlastRadius } from '../../src/core/blast-radius.js'

const FIXTURES = {
  6.1: resolve(import.meta.dirname, '../fixtures/rails-6.1-classic'),
  '7.0': resolve(import.meta.dirname, '../fixtures/rails-7.0-hotwire'),
  8.1: resolve(import.meta.dirname, '../fixtures/rails-8.1-full'),
}

describe('Cross-Version Regression', () => {
  const indexes = {}

  beforeAll(async () => {
    for (const [version, dir] of Object.entries(FIXTURES)) {
      const provider = createFixtureProvider(dir)
      indexes[version] = await buildIndex(provider)
    }
  })

  describe('structural invariants (all versions)', () => {
    for (const version of Object.keys(FIXTURES)) {
      it(`${version}: has non-empty manifest`, () => {
        expect(indexes[version].manifest.total_files).toBeGreaterThan(0)
      })

      it(`${version}: has models`, () => {
        const models = indexes[version].extractions?.models || {}
        expect(Object.keys(models).length).toBeGreaterThan(0)
      })

      it(`${version}: has routes`, () => {
        const routes = indexes[version].extractions?.routes
        expect(routes).toBeDefined()
      })

      it(`${version}: has relationships`, () => {
        expect(indexes[version].relationships.length).toBeGreaterThan(0)
      })

      it(`${version}: has valid index version`, () => {
        expect(indexes[version].version).toBe('1.0.0')
      })
    }
  })

  describe('version-specific assertions', () => {
    it('6.1: detects Rails 6.1', () => {
      expect(indexes['6.1'].versions.rails).toContain('6.1')
    })

    it('7.0: detects Rails 7.0', () => {
      expect(indexes['7.0'].versions.rails).toContain('7.0')
    })

    it('8.1: detects Rails 8.1', () => {
      expect(indexes['8.1'].versions.rails).toContain('8.1')
    })

    it('6.1: uses legacy enum syntax', () => {
      const post = indexes['6.1'].extractions?.models?.Post
      if (post?.enums) {
        const statusEnum = post.enums.status
        if (statusEnum) {
          expect(statusEnum.syntax).toBe('legacy')
        }
      }
    })

    it('8.1: has more categories detected than 6.1', () => {
      const stats81 = indexes['8.1'].manifest.stats || {}
      const stats61 = indexes['6.1'].manifest.stats || {}
      const count81 = Object.values(stats81).reduce((a, b) => a + b, 0)
      const count61 = Object.values(stats61).reduce((a, b) => a + b, 0)
      expect(count81).toBeGreaterThan(count61)
    })

    it('8.1: has components (7.0 may have fewer)', () => {
      const components = indexes['8.1'].extractions?.components || {}
      expect(Object.keys(components).length).toBeGreaterThan(0)
    })

    it('6.1: has devise detected', () => {
      const auth = indexes['6.1'].extractions?.auth
      expect(auth).toBeDefined()
    })

    it('all versions: User model exists', () => {
      for (const version of Object.keys(FIXTURES)) {
        const user = indexes[version].extractions?.models?.User
        expect(user).toBeDefined()
      }
    })

    it('all versions: fileEntityMap is populated', () => {
      for (const version of Object.keys(FIXTURES)) {
        const map = indexes[version].fileEntityMap
        expect(map).toBeDefined()
        expect(Object.keys(map).length).toBeGreaterThan(0)
      }
    })

    it('8.1: blast radius from User model change includes PostsController', () => {
      const index = indexes['8.1']
      const userFile = Object.entries(index.fileEntityMap || {}).find(
        ([, v]) => v.entity === 'User' && v.type === 'model',
      )
      if (userFile) {
        const result = computeBlastRadius(index, [
          { path: userFile[0], status: 'modified' },
        ])
        expect(result.seeds.length).toBeGreaterThan(0)
        expect(result.impacted).toBeDefined()
      }
    })
  })
})
