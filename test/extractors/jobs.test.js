import { describe, it, expect } from 'vitest'
import { extractJob, extractJobs } from '../../src/extractors/jobs.js'

function mockProvider(files) {
  return {
    readFile(path) {
      return files[path] || null
    },
  }
}

describe('Jobs Extractor', () => {
  describe('complex job', () => {
    const fixture = `
class ProcessWebhookJob < ApplicationJob
  queue_as :webhooks

  retry_on Net::TimeoutError, wait: :exponentially_longer, attempts: 5
  retry_on ActiveRecord::Deadlocked, wait: 5.seconds
  discard_on ActiveJob::DeserializationError

  sidekiq_options retry: 3, backtrace: true

  def perform(webhook_id)
    webhook = Webhook.find(webhook_id)
    webhook.process!
  end
end`

    const provider = mockProvider({
      'app/jobs/process_webhook_job.rb': fixture,
    })
    const result = extractJob(provider, 'app/jobs/process_webhook_job.rb')

    it('extracts class name', () => {
      expect(result.class).toBe('ProcessWebhookJob')
    })

    it('extracts queue', () => {
      expect(result.queue).toBe('webhooks')
    })

    it('extracts retry_on with options', () => {
      expect(result.retry_on).toHaveLength(2)
      expect(result.retry_on[0].exception).toBe('Net::TimeoutError')
      expect(result.retry_on[0].options).toContain(
        'wait: :exponentially_longer',
      )
    })

    it('extracts discard_on', () => {
      expect(result.discard_on).toContain('ActiveJob::DeserializationError')
    })

    it('extracts sidekiq_options', () => {
      expect(result.sidekiq_options).toContain('retry: 3')
    })
  })

  describe('simple job', () => {
    it('uses default queue', () => {
      const provider = mockProvider({
        'app/jobs/simple_job.rb': `
class SimpleJob < ApplicationJob
  def perform
    puts "hello"
  end
end`,
      })
      const result = extractJob(provider, 'app/jobs/simple_job.rb')
      expect(result.queue).toBe('default')
      expect(result.retry_on).toEqual([])
      expect(result.discard_on).toEqual([])
    })
  })

  describe('extractJobs aggregate', () => {
    const files = {
      'app/jobs/process_webhook_job.rb': `
class ProcessWebhookJob < ApplicationJob
  queue_as :webhooks
  def perform; end
end`,
      'app/jobs/generate_report_job.rb': `
class GenerateReportJob < ApplicationJob
  queue_as :reports
  def perform; end
end`,
      'config/recurring.yml': `
cleanup:
  class: CleanupExpiredSessionsJob
  schedule: every hour
sync:
  class: SyncAnalyticsJob
  schedule: every day`,
    }

    const entries = [
      { path: 'app/jobs/process_webhook_job.rb' },
      { path: 'app/jobs/generate_report_job.rb' },
    ]

    const provider = mockProvider(files)
    const result = extractJobs(provider, entries, {
      gems: { sidekiq: { version: '7.0' } },
    })

    it('detects adapter', () => {
      expect(result.adapter).toBe('sidekiq')
    })

    it('extracts all jobs', () => {
      expect(result.jobs).toHaveLength(2)
    })

    it('collects queues', () => {
      expect(result.queues_detected).toContain('webhooks')
      expect(result.queues_detected).toContain('reports')
    })

    it('extracts recurring jobs', () => {
      expect(result.recurring_jobs).toBeDefined()
      expect(result.recurring_jobs.jobs).toContain('CleanupExpiredSessionsJob')
      expect(result.recurring_jobs.jobs).toContain('SyncAnalyticsJob')
    })
  })

  describe('no jobs', () => {
    it('returns empty result', () => {
      const provider = mockProvider({})
      const result = extractJobs(provider, [], {})
      expect(result.adapter).toBeNull()
      expect(result.jobs).toEqual([])
      expect(result.queues_detected).toEqual([])
    })
  })

  describe('non-job file', () => {
    it('returns null for non-job class', () => {
      const provider = mockProvider({
        'app/jobs/not_a_job.rb': 'class NotAJob < ApplicationRecord\nend',
      })
      const result = extractJob(provider, 'app/jobs/not_a_job.rb')
      expect(result).toBeNull()
    })
  })
})
