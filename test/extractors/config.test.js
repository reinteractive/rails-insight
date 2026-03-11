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
})
