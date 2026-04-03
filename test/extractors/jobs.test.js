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

  describe('ISSUE-F: Sidekiq native workers and cron jobs', () => {
    it('extracts Sidekiq native workers from app/workers/ entries', () => {
      const files = {
        'app/workers/cleanup_worker.rb': `
class CleanupWorker
  include Sidekiq::Worker
  sidekiq_options queue: :low, retry: 3

  def perform
  end
end`,
      }
      const entries = [
        {
          path: 'app/workers/cleanup_worker.rb',
          workerType: 'sidekiq_native',
        },
      ]
      const provider = mockProvider(files)
      const result = extractJobs(provider, entries, {})
      const worker = result.jobs.find((j) => j.class === 'CleanupWorker')
      expect(worker).toBeDefined()
      expect(worker.type).toBe('sidekiq_worker')
      expect(worker.queue).toBe('low')
    })

    it('includes Sidekiq worker queues in queues_detected', () => {
      const files = {
        'app/workers/email_worker.rb': `
class EmailWorker
  include Sidekiq::Job
  sidekiq_options queue: :mailers

  def perform(id); end
end`,
      }
      const entries = [
        { path: 'app/workers/email_worker.rb', workerType: 'sidekiq_native' },
      ]
      const result = extractJobs(mockProvider(files), entries, {})
      expect(result.queues_detected).toContain('mailers')
    })

    it('extracts Sidekiq::Cron::Job.create definitions from initializers', () => {
      const files = {
        'config/initializers/sidekiq.rb': `
Sidekiq::Cron::Job.create(
  name: 'cleanup - every hour',
  cron: '0 * * * *',
  class: 'CleanupWorker'
)`,
      }
      const provider = {
        readFile: (path) => files[path] || null,
        glob: (pattern) => {
          if (pattern === 'config/initializers/*.rb')
            return ['config/initializers/sidekiq.rb']
          return []
        },
      }
      const result = extractJobs(provider, [], {})
      expect(result.recurring_jobs).toBeDefined()
      expect(result.recurring_jobs.sidekiq_cron).toHaveLength(1)
      expect(result.recurring_jobs.sidekiq_cron[0].name).toBe(
        'cleanup - every hour',
      )
      expect(result.recurring_jobs.sidekiq_cron[0].cron).toBe('0 * * * *')
      expect(result.recurring_jobs.sidekiq_cron[0].class).toBe('CleanupWorker')
    })
  })

  describe('mixin-only job detection (no inheritance)', () => {
    it('detects Delayed::RecurringJob mixin without superclass', () => {
      const provider = mockProvider({
        'app/jobs/cache_configs_job.rb': `
class CacheConfigsJob
  include Delayed::RecurringJob
  run_every 1.hour
  queue 'cache_configs'

  def perform
    Config.cache_all
  end
end`,
      })
      const result = extractJob(provider, 'app/jobs/cache_configs_job.rb')
      expect(result).not.toBeNull()
      expect(result.class).toBe('CacheConfigsJob')
      expect(result.superclass).toBeNull()
    })

    it('detects Sidekiq::Job mixin without superclass', () => {
      const provider = mockProvider({
        'app/jobs/hello_world_job.rb': `
class HelloWorldJob
  include Sidekiq::Job

  def perform
    puts "hello"
  end
end`,
      })
      const result = extractJob(provider, 'app/jobs/hello_world_job.rb')
      expect(result).not.toBeNull()
      expect(result.class).toBe('HelloWorldJob')
      expect(result.superclass).toBeNull()
    })

    it('detects Resque::Job mixin without superclass', () => {
      const provider = mockProvider({
        'app/jobs/resque_task_job.rb': `
class ResqueTaskJob
  include Resque::Job
  @queue = :default

  def self.perform
    Task.process_all
  end
end`,
      })
      const result = extractJob(provider, 'app/jobs/resque_task_job.rb')
      expect(result).not.toBeNull()
      expect(result.class).toBe('ResqueTaskJob')
      expect(result.superclass).toBeNull()
    })

    it('detects Delayed::Job mixin without superclass', () => {
      const provider = mockProvider({
        'app/jobs/delayed_task_job.rb': `
class DelayedTaskJob
  include Delayed::Job

  def perform
    Task.run
  end
end`,
      })
      const result = extractJob(provider, 'app/jobs/delayed_task_job.rb')
      expect(result).not.toBeNull()
      expect(result.class).toBe('DelayedTaskJob')
      expect(result.superclass).toBeNull()
    })

    it('returns null for plain class without inheritance or job mixin', () => {
      const provider = mockProvider({
        'app/jobs/not_a_real_job.rb': `
class NotARealJob
  def perform
    puts "I look like a job but I'm not"
  end
end`,
      })
      const result = extractJob(provider, 'app/jobs/not_a_real_job.rb')
      expect(result).toBeNull()
    })

    it('detects namespaced mixin-only job', () => {
      const provider = mockProvider({
        'app/jobs/sync_energy_coach_daily_entry_job.rb': `
class SyncEnergyCoachDailyEntryJob
  include Delayed::RecurringJob
  run_every 1.day
  queue 'sync_energy_coach'

  def perform
    EnergyCoach::DailyEntry.sync_all
  end
end`,
      })
      const result = extractJob(provider, 'app/jobs/sync_energy_coach_daily_entry_job.rb')
      expect(result).not.toBeNull()
      expect(result.class).toBe('SyncEnergyCoachDailyEntryJob')
    })

    it('extracts sidekiq_options from mixin-only job', () => {
      const provider = mockProvider({
        'app/jobs/background_task_job.rb': `
class BackgroundTaskJob
  include Sidekiq::Job
  sidekiq_options queue: :critical, retry: 5

  def perform
    Task.run
  end
end`,
      })
      const result = extractJob(provider, 'app/jobs/background_task_job.rb')
      expect(result).not.toBeNull()
      expect(result.sidekiq_options).toContain('queue: :critical')
    })
  })

  describe('ISSUE-SHARP: namespaced superclass job detection', () => {
    it('detects job inheriting from a namespaced ScheduledJobBase (e.g. StoreConnect::ScheduledJobBase)', () => {
      const provider = mockProvider({
        'app/jobs/sync_logins_job.rb': `
class SyncLoginsJob < StoreConnect::ScheduledJobBase
  queue_as :default

  def perform
    Sync::LoginWithContactService.execute
  end
end`,
      })
      const result = extractJob(provider, 'app/jobs/sync_logins_job.rb')
      expect(result).not.toBeNull()
      expect(result.class).toBe('SyncLoginsJob')
      expect(result.superclass).toBe('StoreConnect::ScheduledJobBase')
    })

    it('does NOT detect a class inheriting from a namespaced non-Job superclass', () => {
      const provider = mockProvider({
        'app/jobs/batch_processor.rb': `
class BatchProcessor < StoreConnect::ApplicationRecord
  def process; end
end`,
      })
      const result = extractJob(provider, 'app/jobs/batch_processor.rb')
      expect(result).toBeNull()
    })

    it('still detects standard ApplicationJob subclass (regression guard)', () => {
      const provider = mockProvider({
        'app/jobs/report_job.rb': `
class ReportJob < ApplicationJob
  queue_as :reports
  def perform; end
end`,
      })
      const result = extractJob(provider, 'app/jobs/report_job.rb')
      expect(result).not.toBeNull()
      expect(result.class).toBe('ReportJob')
      expect(result.queue).toBe('reports')
    })

    it('still detects ActiveJob::Base subclass (regression guard)', () => {
      const provider = mockProvider({
        'app/jobs/legacy_job.rb': `
class LegacyJob < ActiveJob::Base
  def perform; end
end`,
      })
      const result = extractJob(provider, 'app/jobs/legacy_job.rb')
      expect(result).not.toBeNull()
      expect(result.class).toBe('LegacyJob')
    })
  })
})
