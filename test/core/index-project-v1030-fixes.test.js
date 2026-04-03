/**
 * Regression tests for v1.0.30 fixes to index_project statistics.
 */

import { describe, it, expect } from 'vitest'
import { extractModel } from '../../src/extractors/model.js'
import { extractWorker } from '../../src/extractors/worker.js'
import { extractJob } from '../../src/extractors/jobs.js'
import { extractRoutes } from '../../src/extractors/routes.js'
import { buildGraph } from '../../src/core/graph.js'
import { computeStatistics } from '../../src/core/indexer.js'

function mockProvider(files) {
  return {
    readFile(path) {
      return files[path] || null
    },
    glob(pattern) {
      const re = new RegExp(
        '^' + pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*') + '$',
      )
      return Object.keys(files).filter((f) => re.test(f))
    },
  }
}

// =====================================================
// Fix 1: Models module-only detection regression
// =====================================================
describe('Fix 1: models module-only detection', () => {
  it('PORO class without inheritance is NOT module-only', () => {
    const provider = mockProvider({
      'app/models/effects/base_effect.rb': `
module Effects
  class BaseEffect
    include ActiveModel::Validations
    validates :special, presence: true
  end
end`,
    })
    const result = extractModel(
      provider,
      'app/models/effects/base_effect.rb',
      'BaseEffect',
    )
    expect(result.type).not.toBe('module')
  })

  it('namespace-wrapped class with inheritance is NOT module-only', () => {
    const provider = mockProvider({
      'app/models/cxml/request/catalog_upload_request.rb': `
module Cxml
  module Request
    class CatalogUploadRequest < ::Cxml::Base
      xml_name 'CatalogUploadRequest'
    end
  end
end`,
    })
    const result = extractModel(
      provider,
      'app/models/cxml/request/catalog_upload_request.rb',
      'CatalogUploadRequest',
    )
    expect(result.type).not.toBe('module')
  })

  it('true module-only file IS classified as module', () => {
    const provider = mockProvider({
      'app/models/cxml/utils.rb': `
module Cxml::Utils
  module_function

  def sanitize(str)
    str.gsub(/[^a-zA-Z0-9]/, '')
  end
end`,
    })
    const result = extractModel(
      provider,
      'app/models/cxml/utils.rb',
      'Utils',
    )
    expect(result.type).toBe('module')
  })

  it('module with class << self is module-only (no real class)', () => {
    const provider = mockProvider({
      'app/models/saasu/config.rb': `
module Saasu::Config
  class << self
    def configure
      configuration.each { |key, value| instance_variable_set("@\#{key}", value) }
    end
  end
end`,
    })
    const result = extractModel(
      provider,
      'app/models/saasu/config.rb',
      'Config',
    )
    expect(result.type).toBe('module')
  })

  it('concern with ActiveSupport::Concern is concern type, not module', () => {
    const provider = mockProvider({
      'app/models/concerns/sluggable.rb': `
module Sluggable
  extend ActiveSupport::Concern

  included do
    before_validation :set_slug
  end
end`,
    })
    const result = extractModel(
      provider,
      'app/models/concerns/sluggable.rb',
      'Sluggable',
    )
    expect(result.type).toBe('concern')
  })

  it('module wrapping mixin (included pattern) is module-only', () => {
    const provider = mockProvider({
      'app/models/triggers/product_attr_matcher.rb': `
module Triggers
  module ProductAttrMatcher
    def self.included(base)
      base.validates :type, inclusion: { in: %w[group category] }
    end
  end
end`,
    })
    const result = extractModel(
      provider,
      'app/models/triggers/product_attr_matcher.rb',
      'ProductAttrMatcher',
    )
    expect(result.type).toBe('module')
  })
})

// =====================================================
// Fix 2: Relationships through-association double-counting
// =====================================================
describe('Fix 2: relationships through-association counting', () => {
  it('through association join edge uses has_many_through_join type', () => {
    const extractions = {
      models: {
        User: {
          associations: [
            {
              type: 'has_many',
              name: 'roles',
              through: 'user_roles',
              options: null,
            },
          ],
        },
      },
      controllers: {},
      routes: {},
      schema: {},
    }
    const { relationships } = buildGraph(extractions, { entries: [] })
    const joinEdges = relationships.filter(
      (r) => r.to === 'UserRole' && r.from === 'User',
    )
    expect(joinEdges).toHaveLength(1)
    expect(joinEdges[0].type).toBe('has_many_through_join')
  })

  it('through join edge is NOT counted in statistics', () => {
    const relationships = [
      { from: 'User', to: 'Role', type: 'has_many' },
      { from: 'User', to: 'UserRole', type: 'has_many_through_join' },
      { from: 'Role', to: 'User', type: 'belongs_to' },
    ]
    const manifest = { entries: [], stats: {} }
    const extractions = {
      models: {},
      controllers: {},
      helpers: {},
      workers: {},
      uploaders: { uploaders: {} },
      jobs: { jobs: [] },
      email: { mailers: [] },
      realtime: { channels: [] },
      routes: { resources: [] },
      gemfile: { gems: [] },
    }
    const stats = computeStatistics(manifest, extractions, relationships)
    // Only has_many + belongs_to should count, not has_many_through_join
    expect(stats.relationships).toBe(2)
  })
})

// =====================================================
// Fix 3: Workers — inheritance-based detection
// =====================================================
describe('Fix 3: workers inheriting from base class', () => {
  it('extracts worker that inherits from SidekiqWorker (no include)', () => {
    const provider = mockProvider({
      'app/workers/order_confirmation_worker.rb': `
class OrderConfirmationWorker < SidekiqWorker
  def perform(command, order_id)
    order = Order.find(order_id)
    order.confirm!
  end
end`,
    })
    const result = extractWorker(
      provider,
      'app/workers/order_confirmation_worker.rb',
    )
    expect(result).not.toBeNull()
    expect(result.class).toBe('OrderConfirmationWorker')
    expect(result.type).toBe('sidekiq_native')
  })

  it('still extracts worker with direct include Sidekiq::Worker', () => {
    const provider = mockProvider({
      'app/workers/sidekiq_worker.rb': `
class SidekiqWorker
  include Sidekiq::Worker

  def self.enqueue_to(queue, *args)
    set(queue: queue).perform_async(*args)
  end
end`,
    })
    const result = extractWorker(
      provider,
      'app/workers/sidekiq_worker.rb',
    )
    expect(result).not.toBeNull()
    expect(result.class).toBe('SidekiqWorker')
  })

  it('rejects file with no class definition', () => {
    const provider = mockProvider({
      'app/workers/concerns/retryable.rb': `
module Retryable
  def with_retry(attempts: 3)
    yield
  end
end`,
    })
    const result = extractWorker(
      provider,
      'app/workers/concerns/retryable.rb',
    )
    expect(result).toBeNull()
  })

  it('rejects file with class but no include and no inheritance', () => {
    const provider = mockProvider({
      'app/workers/plain_class.rb': `
class PlainClass
  def perform
    puts "hello"
  end
end`,
    })
    const result = extractWorker(
      provider,
      'app/workers/plain_class.rb',
    )
    expect(result).toBeNull()
  })
})

// =====================================================
// Fix 4: Route namespace counting
// =====================================================
describe('Fix 4: route namespace creates resource entry', () => {
  it('namespace blocks are counted as resources', () => {
    const provider = mockProvider({
      'config/routes.rb': `
Rails.application.routes.draw do
  namespace :admin do
    resources :users
  end
  namespace :api do
    resource :catalogue, only: %i(show create)
  end
end`,
    })
    const result = extractRoutes(provider)
    const namespaces = result.resources.filter((r) => r.type === 'namespace')
    expect(namespaces).toHaveLength(2)
    expect(namespaces.map((n) => n.name)).toContain('admin')
    expect(namespaces.map((n) => n.name)).toContain('api')
  })

  it('nested namespace gets parent namespace', () => {
    const provider = mockProvider({
      'config/routes.rb': `
Rails.application.routes.draw do
  namespace :api do
    namespace :v1 do
      resources :posts
    end
  end
end`,
    })
    const result = extractRoutes(provider)
    const v1ns = result.resources.find(
      (r) => r.name === 'v1' && r.type === 'namespace',
    )
    expect(v1ns).toBeDefined()
    expect(v1ns.namespace).toBe('api')
  })

  it('total resource count includes namespaces', () => {
    const provider = mockProvider({
      'config/routes.rb': `
Rails.application.routes.draw do
  namespace :admin do
    resources :users
    resources :posts
  end
end`,
    })
    const result = extractRoutes(provider)
    // 1 namespace + 2 resources = 3
    expect(result.resources.length).toBe(3)
  })
})

// =====================================================
// Fix 5: Delayed::RecurringJob detection
// =====================================================
describe('Fix 5: Delayed::RecurringJob mixin detection', () => {
  it('detects job with include Delayed::RecurringJob', () => {
    const provider = mockProvider({
      'app/jobs/daily_cleanup_job.rb': `
class DailyCleanupJob < Object
  include Delayed::RecurringJob

  run_every 1.day

  def perform
    OldRecord.cleanup!
  end
end`,
    })
    const result = extractJob(provider, 'app/jobs/daily_cleanup_job.rb')
    expect(result).not.toBeNull()
    expect(result.class).toBe('DailyCleanupJob')
  })

  it('still detects standard ApplicationJob subclass', () => {
    const provider = mockProvider({
      'app/jobs/send_email_job.rb': `
class SendEmailJob < ApplicationJob
  queue_as :mailers

  def perform(user_id)
    UserMailer.welcome(user_id).deliver_now
  end
end`,
    })
    const result = extractJob(provider, 'app/jobs/send_email_job.rb')
    expect(result).not.toBeNull()
    expect(result.class).toBe('SendEmailJob')
  })

  it('rejects class that is not a job', () => {
    const provider = mockProvider({
      'app/jobs/not_a_job.rb': `
class NotAJob < ApplicationRecord
  validates :name, presence: true
end`,
    })
    const result = extractJob(provider, 'app/jobs/not_a_job.rb')
    expect(result).toBeNull()
  })
})

// =====================================================
// Fix 6: Exclude lib/ jobs from statistics
// =====================================================
describe('Fix 6: lib/ jobs excluded from statistics', () => {
  it('jobs from lib/ are not counted in statistics', () => {
    const manifest = { entries: [], stats: {} }
    const extractions = {
      models: {},
      controllers: {},
      helpers: {},
      workers: {},
      uploaders: { uploaders: {} },
      jobs: {
        jobs: [
          { class: 'AppJob', file: 'app/jobs/app_job.rb', superclass: 'ApplicationJob' },
          { class: 'LibJob', file: 'lib/store_connect_mini/sync_job.rb', superclass: 'ApplicationJob' },
          { class: 'LibJob2', file: 'lib/store_connect_mini/import_job.rb', superclass: 'ApplicationJob' },
        ],
      },
      email: { mailers: [] },
      realtime: { channels: [] },
      routes: { resources: [] },
      gemfile: { gems: [] },
    }
    const stats = computeStatistics(manifest, extractions, [])
    expect(stats.jobs).toBe(1) // Only AppJob from app/
  })
})
