import { describe, it, expect } from 'vitest'
import { buildIndex } from '../../src/core/indexer.js'

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
})
