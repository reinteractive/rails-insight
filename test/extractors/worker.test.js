import { describe, it, expect } from 'vitest'
import { extractWorker } from '../../src/extractors/worker.js'

function mockProvider(files) {
  return {
    readFile(path) {
      return files[path] || null
    },
  }
}

describe('Worker Extractor', () => {
  describe('extracts Sidekiq::Job worker', () => {
    const fixture = `
class BulkIndexWorker
  include Sidekiq::Job

  sidekiq_options queue: :low, retry: 3

  def perform(user_id, options = {})
    User.find(user_id).reindex(options)
  end
end`

    const provider = mockProvider({
      'app/workers/bulk_index_worker.rb': fixture,
    })
    const result = extractWorker(provider, 'app/workers/bulk_index_worker.rb')

    it('extracts class name', () => {
      expect(result.class).toBe('BulkIndexWorker')
    })

    it('extracts type', () => {
      expect(result.type).toBe('sidekiq_native')
    })

    it('extracts queue', () => {
      expect(result.queue).toBe('low')
    })

    it('extracts retry option', () => {
      expect(result.retry).toBe(3)
    })

    it('extracts sidekiq_options string', () => {
      expect(result.sidekiq_options).toContain('queue: :low')
    })

    it('extracts perform arguments', () => {
      expect(result.perform_args).toEqual(['user_id', 'options = {}'])
    })
  })

  describe('extracts legacy Sidekiq::Worker', () => {
    it('include statement matches', () => {
      const provider = mockProvider({
        'app/workers/legacy_worker.rb': `
class LegacyWorker
  include Sidekiq::Worker

  def perform(id)
    puts id
  end
end`,
      })
      const result = extractWorker(provider, 'app/workers/legacy_worker.rb')
      expect(result).not.toBeNull()
      expect(result.type).toBe('sidekiq_native')
    })
  })

  describe('defaults queue to default', () => {
    it('no queue specified → default', () => {
      const provider = mockProvider({
        'app/workers/simple_worker.rb': `
class SimpleWorker
  include Sidekiq::Job

  def perform
    puts "hello"
  end
end`,
      })
      const result = extractWorker(provider, 'app/workers/simple_worker.rb')
      expect(result.queue).toBe('default')
    })
  })

  describe('returns null for non-Sidekiq file', () => {
    it('file without include Sidekiq::Job → null', () => {
      const provider = mockProvider({
        'app/workers/not_a_worker.rb': `
class NotAWorker
  def perform
    puts "hello"
  end
end`,
      })
      const result = extractWorker(provider, 'app/workers/not_a_worker.rb')
      expect(result).toBeNull()
    })
  })

  describe('extracts retry false', () => {
    it('sidekiq_options retry: false → false', () => {
      const provider = mockProvider({
        'app/workers/no_retry_worker.rb': `
class NoRetryWorker
  include Sidekiq::Job
  sidekiq_options retry: false

  def perform(id)
    process(id)
  end
end`,
      })
      const result = extractWorker(provider, 'app/workers/no_retry_worker.rb')
      expect(result.retry).toBe(false)
    })
  })

  describe('extracts multiple options', () => {
    it('parses queue, retry, and unique', () => {
      const provider = mockProvider({
        'app/workers/full_worker.rb': `
class FullWorker
  include Sidekiq::Job
  sidekiq_options queue: :low, retry: 3, unique: :until_executing

  def perform(user_id, name)
    process(user_id, name)
  end
end`,
      })
      const result = extractWorker(provider, 'app/workers/full_worker.rb')
      expect(result.queue).toBe('low')
      expect(result.retry).toBe(3)
      expect(result.perform_args).toEqual(['user_id', 'name'])
    })
  })

  describe('returns null for empty file', () => {
    it('returns null', () => {
      const provider = mockProvider({
        'app/workers/empty.rb': '',
      })
      const result = extractWorker(provider, 'app/workers/empty.rb')
      expect(result).toBeNull()
    })
  })
})
