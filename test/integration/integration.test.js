import { describe, it, expect, beforeAll } from 'vitest'
import { resolve } from 'node:path'
import { buildIndex } from '../../src/core/indexer.js'
import { createFixtureProvider } from '../helpers/mock-provider.js'
import { formatOutput } from '../../src/core/formatter.js'

const FIXTURE_DIR = resolve(import.meta.dirname, '../fixtures/rails-8.1-full')

describe('Integration - Rails 8.1 Full', () => {
  let index
  let provider

  beforeAll(async () => {
    provider = createFixtureProvider(FIXTURE_DIR)
    index = await buildIndex(provider)
  })

  describe('index structure', () => {
    it('produces a complete index with all sections', () => {
      expect(index.version).toBe('1.0.0')
      expect(index.generated_at).toBeTruthy()
      expect(index.context).toBeDefined()
      expect(index.versions).toBeDefined()
      expect(index.manifest).toBeDefined()
      expect(index.extractions).toBeDefined()
      expect(index.relationships).toBeDefined()
      expect(index.rankings).toBeDefined()
      expect(index.drift).toBeDefined()
      expect(index.statistics).toBeDefined()
    })

    it('has no undefined values in top-level sections', () => {
      for (const [key, value] of Object.entries(index)) {
        expect(value).not.toBeUndefined()
      }
    })
  })

  describe('version detection', () => {
    it('detects Rails 8.1', () => {
      expect(index.versions.rails).toContain('8.1')
    })
  })

  describe('manifest', () => {
    it('has classified files', () => {
      expect(index.manifest.total_files).toBeGreaterThan(10)
    })

    it('has models category', () => {
      const models = index.manifest.byCategory?.models || []
      expect(models.length).toBeGreaterThan(0)
    })

    it('has controllers category', () => {
      const controllers = index.manifest.byCategory?.controllers || []
      expect(controllers.length).toBeGreaterThan(0)
    })
  })

  describe('free tools data', () => {
    it('get_overview: versions detected', () => {
      expect(index.versions.rails).toBeTruthy()
    })

    it('list_models: models extracted', () => {
      const models = index.extractions?.models || {}
      expect(Object.keys(models).length).toBeGreaterThan(0)
      expect(models['User']).toBeDefined()
      expect(models['Post']).toBeDefined()
    })

    it('list_controllers: controllers extracted', () => {
      const controllers = index.extractions?.controllers || {}
      expect(Object.keys(controllers).length).toBeGreaterThan(0)
    })

    it('get_dependencies: gemfile parsed', () => {
      const gemfile = index.extractions?.gemfile
      expect(gemfile).toBeDefined()
      expect(gemfile.gems.length).toBeGreaterThan(5)
    })

    it('get_manifest: file classification works', () => {
      expect(index.manifest.total_files).toBeGreaterThan(0)
    })
  })

  describe('pro tools data', () => {
    it('get_model: User has associations', () => {
      const user = index.extractions?.models?.User
      expect(user).toBeDefined()
      expect(user.associations.length).toBeGreaterThan(0)
    })

    it('get_model: User has devise modules', () => {
      const user = index.extractions?.models?.User
      expect(user.devise_modules || []).toContain('database_authenticatable')
    })

    it('get_routes: routes extracted', () => {
      const routes = index.extractions?.routes
      expect(routes).toBeDefined()
    })

    it('get_schema: tables extracted', () => {
      const schema = index.extractions?.schema
      expect(schema).toBeDefined()
      expect(schema.tables.length).toBeGreaterThan(0)
    })

    it('get_schema_for: users table exists', () => {
      const users = index.extractions?.schema?.tables?.find(
        (t) => t.name === 'users',
      )
      expect(users).toBeDefined()
    })

    it('get_authentication: auth detected', () => {
      const auth = index.extractions?.auth
      expect(auth).toBeDefined()
    })

    it('get_authorization: authorization detected', () => {
      const authz = index.extractions?.authorization
      expect(authz).toBeDefined()
    })

    it('get_jobs: jobs detected', () => {
      const jobs = index.extractions?.jobs
      expect(jobs).toBeDefined()
    })

    it('get_full_index: fits within budget', () => {
      const trimmed = formatOutput(index, 4000)
      const json = JSON.stringify(trimmed)
      const tokens = Math.ceil(json.length / 4)
      expect(tokens).toBeLessThanOrEqual(4600) // 15% margin
    })
  })

  describe('relationships and rankings', () => {
    it('has relationships', () => {
      expect(index.relationships.length).toBeGreaterThan(0)
    })

    it('has rankings', () => {
      expect(Object.keys(index.rankings).length).toBeGreaterThan(0)
    })

    it('User appears in relationships', () => {
      const userRels = index.relationships.filter(
        (r) => r.from === 'User' || r.to === 'User',
      )
      expect(userRels.length).toBeGreaterThan(0)
    })

    it('get_related: User has connected entities at depth 2', () => {
      const allRels = index.relationships
      const visited = new Set(['User'])
      let frontier = ['User']
      const connected = []

      for (let d = 0; d < 2 && frontier.length > 0; d++) {
        const nextFrontier = []
        for (const current of frontier) {
          for (const rel of allRels) {
            let neighbor = null
            if (rel.from === current && !visited.has(rel.to)) neighbor = rel.to
            else if (rel.to === current && !visited.has(rel.from))
              neighbor = rel.from
            if (neighbor) {
              visited.add(neighbor)
              nextFrontier.push(neighbor)
              connected.push(neighbor)
            }
          }
        }
        frontier = nextFrontier
      }

      expect(connected.length).toBeGreaterThan(0)
    })
  })

  describe('statistics', () => {
    it('reports model count', () => {
      expect(index.statistics.models).toBeGreaterThan(0)
    })

    it('reports controller count', () => {
      expect(index.statistics.controllers).toBeGreaterThan(0)
    })

    it('reports gem count', () => {
      expect(index.statistics.gems).toBeGreaterThan(0)
    })
  })
})
