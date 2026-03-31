import { describe, it, expect } from 'vitest'
import { extractConfig } from '../../src/extractors/config.js'

function mockProvider(files) {
  return {
    readFile(path) {
      return files[path] || null
    },
  }
}

describe('Config Extractor', () => {
  describe('full config', () => {
    const files = {
      'config/application.rb': `
module MyApp
  class Application < Rails::Application
    config.load_defaults 7.1
    config.time_zone = "Melbourne"
    config.active_job.queue_adapter = :solid_queue
  end
end`,
      'config/database.yml': `
default: &default
  adapter: postgresql
  pool: 5

production:
  <<: *default
  adapter: postgresql
  pool: 10`,
      'config/environments/production.rb': `
Rails.application.configure do
  config.cache_store = :solid_cache
  config.force_ssl = true
end`,
      'config/environments/development.rb': `
Rails.application.configure do
  config.cache_store = :memory_store
end`,
    }

    const provider = mockProvider(files)
    const result = extractConfig(provider)

    it('extracts load_defaults', () => {
      expect(result.load_defaults).toBe('7.1')
    })

    it('extracts time_zone', () => {
      expect(result.time_zone).toBe('Melbourne')
    })

    it('extracts queue_adapter', () => {
      expect(result.queue_adapter).toBe('solid_queue')
    })

    it('extracts database adapter', () => {
      expect(result.database.adapter).toBe('postgresql')
    })

    it('extracts database pool', () => {
      expect(result.database.pool).toBe(10)
    })

    it('extracts production cache_store', () => {
      expect(result.environments.production.cache_store).toBe('solid_cache')
    })

    it('detects force_ssl', () => {
      expect(result.environments.production.force_ssl).toBe(true)
    })

    it('extracts development cache_store', () => {
      expect(result.environments.development.cache_store).toBe('memory_store')
    })
  })

  describe('api_only mode', () => {
    it('detects api_only', () => {
      const provider = mockProvider({
        'config/application.rb': `
module MyApp
  class Application < Rails::Application
    config.api_only = true
  end
end`,
      })
      const result = extractConfig(provider)
      expect(result.api_only).toBe(true)
    })
  })

  describe('no config files', () => {
    it('returns empty result', () => {
      const provider = mockProvider({})
      const result = extractConfig(provider)
      expect(result.load_defaults).toBeNull()
      expect(result.api_only).toBe(false)
      expect(result.database).toEqual({})
      expect(result.environments).toEqual({})
    })
  })

  describe('ISSUE-E: database adapter fallback', () => {
    it('detects mysql2 adapter from Gemfile when database.yml is absent', () => {
      const provider = mockProvider({
        Gemfile: "gem 'rails'\ngem 'mysql2', '~> 0.5'",
      })
      const result = extractConfig(provider)
      expect(result.database.adapter).toBe('mysql2')
      expect(result.database.source).toBe('gemfile')
    })

    it('detects pg adapter from Gemfile', () => {
      const provider = mockProvider({
        Gemfile: "gem 'rails'\ngem 'pg', '~> 1.5'",
      })
      const result = extractConfig(provider)
      expect(result.database.adapter).toBe('postgresql')
    })

    it('detects adapter from database.yml.example when database.yml is absent', () => {
      const provider = mockProvider({
        'config/database.yml.example':
          'development:\n  adapter: postgresql\n  database: myapp_dev',
      })
      const result = extractConfig(provider)
      expect(result.database.adapter).toBe('postgresql')
      expect(result.database.source).toBe('database.yml.example')
    })

    it('prefers database.yml over Gemfile', () => {
      const provider = mockProvider({
        'config/database.yml':
          'production:\n  adapter: sqlite3\n  database: db/production.sqlite3',
        Gemfile: "gem 'rails'\ngem 'mysql2'",
      })
      const result = extractConfig(provider)
      expect(result.database.adapter).toBe('sqlite3')
    })
  })

  describe('ISSUE-D: multi-DB detection requires adapter key', () => {
    it('does not report pool/password as database names in single-DB config', () => {
      const provider = mockProvider({
        'config/database.yml': `production:
  adapter: postgresql
  database: kollaras_production
  pool: 5
  username: app
  password: secret`,
      })
      const result = extractConfig(provider)
      expect(result.database.multi_db).toBeFalsy()
      expect(result.database.databases).toBeUndefined()
      expect(result.database.adapter).toBe('postgresql')
    })

    it('correctly detects multi-DB when sub-sections have adapter keys', () => {
      const provider = mockProvider({
        'config/database.yml': `production:
  primary:
    adapter: postgresql
    database: app_primary
  secondary:
    adapter: postgresql
    database: app_secondary`,
      })
      const result = extractConfig(provider)
      expect(result.database.multi_db).toBe(true)
      expect(result.database.databases).toEqual(['primary', 'secondary'])
    })
  })
})
