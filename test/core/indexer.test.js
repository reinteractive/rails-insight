import { describe, it, expect } from 'vitest'
import { buildIndex, computeStatistics } from '../../src/core/indexer.js'

/**
 * Mock provider simulating a small Rails app.
 */
function createMockProvider() {
  const files = {
    Gemfile: `
source 'https://rubygems.org'
gem 'rails', '~> 7.1'
gem 'pg'
gem 'puma'
gem 'devise'
gem 'sidekiq'
`,
    'Gemfile.lock': `
GEM
  specs:
    rails (7.1.3)
    pg (1.5.4)
    devise (4.9.3)
    sidekiq (7.2.4)
`,
    'config/application.rb': `
module TestApp
  class Application < Rails::Application
    config.load_defaults 7.1
    config.time_zone = "UTC"
    config.active_job.queue_adapter = :sidekiq
  end
end`,
    'config/routes.rb': `
Rails.application.routes.draw do
  resources :posts
  resources :users
end`,
    'app/models/user.rb': `
class User < ApplicationRecord
  devise :database_authenticatable, :registerable
  has_many :posts
end`,
    'app/models/post.rb': `
class Post < ApplicationRecord
  belongs_to :user
  has_many :comments
  validates :title, presence: true
end`,
    'app/controllers/posts_controller.rb': `
class PostsController < ApplicationController
  before_action :authenticate_user!

  def index
    @posts = Post.all
  end

  def show
    @post = Post.find(params[:id])
  end
end`,
    'db/schema.rb': `
ActiveRecord::Schema[7.1].define(version: 2024_01_01_000000) do
  create_table "users" do |t|
    t.string "email"
    t.timestamps
  end

  create_table "posts" do |t|
    t.references "user", foreign_key: true
    t.string "title"
    t.text "body"
    t.timestamps
  end
end`,
  }

  return {
    readFile(path) {
      return files[path] || null
    },
    fileExists(path) {
      return path in files
    },
    glob(pattern) {
      const results = []
      for (const p of Object.keys(files)) {
        if (matchGlob(pattern, p)) results.push(p)
      }
      return results
    },
    listDir(path) {
      const prefix = path.endsWith('/') ? path : path + '/'
      const items = new Set()
      for (const p of Object.keys(files)) {
        if (p.startsWith(prefix)) {
          const rest = p.slice(prefix.length)
          const parts = rest.split('/')
          items.add(parts[0] + (parts.length > 1 ? '/' : ''))
        }
      }
      return [...items]
    },
  }
}

function matchGlob(pattern, path) {
  // Simple glob matching for test
  if (pattern.includes('**')) {
    const parts = pattern.split('**')
    const prefix = parts[0].replace(/\/$/, '')
    const suffix = (parts[1] || '').replace(/^\//, '')
    if (prefix && !path.startsWith(prefix)) return false
    if (suffix) {
      const ext = suffix.replace('*', '')
      return path.endsWith(ext)
    }
    return true
  }
  const regex = pattern.replace(/\./g, '\\.').replace(/\*/g, '[^/]*')
  return new RegExp(`^${regex}$`).test(path)
}

describe('Core Indexer', () => {
  it('produces a complete index with all sections', async () => {
    const provider = createMockProvider()
    const index = await buildIndex(provider)

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

  it('extracts models from entries', async () => {
    const provider = createMockProvider()
    const index = await buildIndex(provider)
    const models = index.extractions.models
    expect(Object.keys(models).length).toBeGreaterThan(0)
  })

  it('extracts controllers from entries', async () => {
    const provider = createMockProvider()
    const index = await buildIndex(provider)
    const controllers = index.extractions.controllers
    expect(Object.keys(controllers).length).toBeGreaterThan(0)
  })

  it('extracts gemfile information', async () => {
    const provider = createMockProvider()
    const index = await buildIndex(provider)
    expect(index.extractions.gemfile).toBeDefined()
    expect(index.extractions.gemfile.gems).toBeDefined()
  })

  it('computes statistics', async () => {
    const provider = createMockProvider()
    const index = await buildIndex(provider)
    expect(index.statistics.total_files).toBeGreaterThanOrEqual(0)
  })

  it('builds relationships', async () => {
    const provider = createMockProvider()
    const index = await buildIndex(provider)
    expect(Array.isArray(index.relationships)).toBe(true)
  })

  it('no undefined sections exist', async () => {
    const provider = createMockProvider()
    const index = await buildIndex(provider)
    for (const [key, value] of Object.entries(index)) {
      expect(value).not.toBeUndefined()
    }
  })

  it('includes helpers, workers, uploaders in extractions', async () => {
    const provider = createMockProvider()
    const index = await buildIndex(provider)
    expect(index.extractions.helpers).toBeDefined()
    expect(index.extractions.workers).toBeDefined()
    expect(index.extractions.uploaders).toBeDefined()
    expect(index.extractions.uploaders.uploaders).toBeDefined()
    expect(index.extractions.uploaders.mounted).toBeDefined()
  })

  it('includes pwa detection in index', async () => {
    const provider = createMockProvider()
    const index = await buildIndex(provider)
    expect(index.pwa).toBeDefined()
    expect(index.pwa.detected).toBe(false)
  })

  it('includes new statistics fields', async () => {
    const provider = createMockProvider()
    const index = await buildIndex(provider)
    expect(index.statistics).toHaveProperty('helpers')
    expect(index.statistics).toHaveProperty('workers')
    expect(index.statistics).toHaveProperty('uploaders')
  })

  it('maps helper files in fileEntityMap', async () => {
    const files = {
      Gemfile: "gem 'rails', '~> 7.1'",
      'Gemfile.lock': '',
      'config/application.rb': '',
      'app/helpers/posts_helper.rb': `
module PostsHelper
  def format_date(date)
    date.strftime('%B %d, %Y')
  end
end`,
    }

    const provider = {
      readFile(path) {
        return files[path] || null
      },
      fileExists(path) {
        return path in files
      },
      glob(pattern) {
        return Object.keys(files).filter((p) => matchGlob(pattern, p))
      },
      listDir() {
        return []
      },
    }

    const index = await buildIndex(provider)
    const helperEntry = index.fileEntityMap['app/helpers/posts_helper.rb']
    expect(helperEntry).toBeDefined()
    expect(helperEntry.type).toBe('helper')
  })

  it('maps worker files in fileEntityMap', async () => {
    const files = {
      Gemfile: "gem 'rails', '~> 7.1'",
      'Gemfile.lock': '',
      'config/application.rb': '',
      'app/workers/bulk_index_worker.rb': `
class BulkIndexWorker
  include Sidekiq::Job
  sidekiq_options queue: :low

  def perform(user_id)
    User.find(user_id).reindex
  end
end`,
    }

    const provider = {
      readFile(path) {
        return files[path] || null
      },
      fileExists(path) {
        return path in files
      },
      glob(pattern) {
        return Object.keys(files).filter((p) => matchGlob(pattern, p))
      },
      listDir() {
        return []
      },
    }

    const index = await buildIndex(provider)
    const workerEntry = index.fileEntityMap['app/workers/bulk_index_worker.rb']
    expect(workerEntry).toBeDefined()
    expect(workerEntry.type).toBe('worker')
  })

  it('ISSUE-B: extracts Devise sub-controllers classified as authentication', async () => {
    const files = {
      Gemfile: "gem 'rails'\ngem 'devise'",
      'Gemfile.lock': '  specs:\n    rails (7.1.0)',
      'config/application.rb': '',
      'app/controllers/admin_users/sessions_controller.rb': `class AdminUsers::SessionsController < Devise::SessionsController
  def new
    super
  end
end`,
      'app/controllers/members/registrations_controller.rb': `class Members::RegistrationsController < Devise::RegistrationsController
  def create
    super
  end
end`,
    }

    const provider = {
      readFile(path) {
        return files[path] || null
      },
      fileExists(path) {
        return path in files
      },
      glob(pattern) {
        return Object.keys(files).filter((p) => {
          if (pattern.includes('**')) {
            const suffix = pattern.split('**').pop().replace(/^\//, '')
            if (suffix.includes('*')) {
              const ext = suffix.replace('*', '')
              return p.endsWith(ext)
            }
            return p.endsWith(suffix)
          }
          return false
        })
      },
      listDir() {
        return []
      },
    }

    const index = await buildIndex(provider)
    const controllerNames = Object.keys(index.extractions.controllers)
    expect(controllerNames).toContain('AdminUsers::SessionsController')
    expect(controllerNames).toContain('Members::RegistrationsController')
  })

  it('ISSUE-J: statistics.models_file_count is present', async () => {
    const provider = createMockProvider()
    const index = await buildIndex(provider)
    expect(index.statistics).toHaveProperty('models_file_count')
    expect(typeof index.statistics.models_file_count).toBe('number')
  })
})

describe('ISSUE-K: Model count file_count in statistics', () => {
  it('statistics includes both extracted model count and file count', () => {
    const manifest = { entries: [], stats: { models: 10 } }
    const extractions = {
      models: { User: {}, Post: {}, Comment: {} },
      controllers: {},
      components: {},
      gemfile: { gems: [] },
      helpers: {},
      workers: {},
      uploaders: { uploaders: {} },
    }
    const stats = computeStatistics(manifest, extractions, [])
    expect(stats.models).toBe(3)
    expect(stats.models_file_count).toBe(10)
  })
})

describe('computeStatistics: abstract models and enriched counts', () => {
  const baseExtractions = {
    models: {},
    controllers: {},
    components: {},
    gemfile: { gems: [] },
    helpers: {},
    workers: {},
    uploaders: { uploaders: {} },
  }

  it('counts abstract models in statistics.models', () => {
    const manifest = { entries: [], stats: { models: 5 } }
    const extractions = {
      ...baseExtractions,
      models: {
        ApplicationRecord: { type: 'model', abstract: true },
        User: { type: 'model' },
        Post: { type: 'model' },
        'Wordpress::WpBase': { type: 'model', abstract: true },
        'Wordpress::Post': { type: 'model' },
      },
    }
    const stats = computeStatistics(manifest, extractions, [])
    // Abstract classes ARE model classes — they define shared behavior
    expect(stats.models).toBe(5)
  })

  it('still excludes concerns from model count', () => {
    const manifest = { entries: [], stats: { models: 4 } }
    const extractions = {
      ...baseExtractions,
      models: {
        ApplicationRecord: { type: 'model', abstract: true },
        User: { type: 'model' },
        Post: { type: 'model' },
        Sluggable: { type: 'concern' },
      },
    }
    const stats = computeStatistics(manifest, extractions, [])
    expect(stats.models).toBe(3)
  })

  it('includes jobs count from extractions.jobs.jobs', () => {
    const manifest = { entries: [], stats: {} }
    const extractions = {
      ...baseExtractions,
      jobs: {
        adapter: 'sidekiq',
        jobs: [
          { name: 'ProcessPaymentJob' },
          { name: 'SendEmailJob' },
          { name: 'CleanupJob' },
        ],
      },
    }
    const stats = computeStatistics(manifest, extractions, [])
    expect(stats.jobs).toBe(3)
  })

  it('includes mailers count from extractions.email.mailers', () => {
    const manifest = { entries: [], stats: {} }
    const extractions = {
      ...baseExtractions,
      email: { mailers: [{ name: 'UserMailer' }, { name: 'AdminMailer' }] },
    }
    const stats = computeStatistics(manifest, extractions, [])
    expect(stats.mailers).toBe(2)
  })

  it('includes channels count from extractions.realtime.channels', () => {
    const manifest = { entries: [], stats: {} }
    const extractions = {
      ...baseExtractions,
      realtime: { channels: [{ name: 'ChatChannel' }] },
    }
    const stats = computeStatistics(manifest, extractions, [])
    expect(stats.channels).toBe(1)
  })

  it('includes route_resources count from extractions.routes.resources', () => {
    const manifest = { entries: [], stats: {} }
    const extractions = {
      ...baseExtractions,
      routes: {
        resources: [{ name: 'users' }, { name: 'posts' }, { name: 'comments' }],
      },
    }
    const stats = computeStatistics(manifest, extractions, [])
    expect(stats.route_resources).toBe(3)
  })

  it('returns 0 for jobs/mailers/channels/routes when not present', () => {
    const manifest = { entries: [], stats: {} }
    const stats = computeStatistics(manifest, baseExtractions, [])
    expect(stats.jobs).toBe(0)
    expect(stats.mailers).toBe(0)
    expect(stats.channels).toBe(0)
    expect(stats.route_resources).toBe(0)
  })

  it('does not include redundant models_in_manifest or controllers_all', () => {
    const manifest = { entries: [], stats: { models: 5 } }
    const stats = computeStatistics(manifest, baseExtractions, [])
    expect(stats).not.toHaveProperty('models_in_manifest')
    expect(stats).not.toHaveProperty('controllers_all')
  })
})

describe('ISSUE-A: FQN keys prevent model and component shadowing', () => {
  it('does not deduplicate models with same short name but different namespaces', async () => {
    const files = {
      Gemfile: "gem 'rails'",
      'Gemfile.lock': '  specs:\n    rails (7.1.0)',
      'config/application.rb': '',
      'app/models/contact.rb': `
class Contact < ApplicationRecord
  has_many :offers
  has_many :addresses
end`,
      'app/models/setups/contact.rb': `
module Setups
  class Contact < Setup
  end
end`,
    }

    const provider = {
      readFile: (path) => files[path] || null,
      fileExists: (path) => path in files,
      glob: (pattern) =>
        Object.keys(files).filter((p) => matchGlob(pattern, p)),
      listDir: () => [],
    }

    const index = await buildIndex(provider)
    expect(index.extractions.models['Contact']).toBeDefined()
    expect(index.extractions.models['Setups::Contact']).toBeDefined()
    expect(index.extractions.models['Contact'].associations).toHaveLength(2)
  })
})
