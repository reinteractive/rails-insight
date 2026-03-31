import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildIndex } from '../../src/core/indexer.js'
import {
  RUNTIME_MODELS,
  RUNTIME_CONTROLLERS,
  RUNTIME_ROUTES,
  RUNTIME_DATABASE,
} from '../fixtures/introspection-fixtures.js'

vi.mock('../../src/introspection/bridge.js', () => ({
  runIntrospection: vi.fn(),
}))

import { runIntrospection } from '../../src/introspection/bridge.js'

// ---------------------------------------------------------------------------
// Mock provider helpers
// ---------------------------------------------------------------------------

const BASE_FILES = {
  Gemfile: `
source 'https://rubygems.org'
gem 'rails', '~> 7.1'
gem 'pg'
gem 'devise'
`,
  'Gemfile.lock': `
GEM
  specs:
    rails (7.1.3)
    pg (1.5.4)
    devise (4.9.3)
`,
  'config/application.rb': `
module TestApp
  class Application < Rails::Application
    config.load_defaults 7.1
  end
end`,
  'config/routes.rb': `
Rails.application.routes.draw do
  resources :users
  resources :posts
end`,
  'db/schema.rb': `
ActiveRecord::Schema[7.1].define(version: 2024_01_01_000000) do
  create_table "users" do |t|
    t.string "email", null: false
    t.string "name"
    t.timestamps
  end

  create_table "posts" do |t|
    t.references "user", foreign_key: true
    t.string "title"
    t.text "body"
    t.timestamps
  end
end`,
  'app/models/user.rb': `
class User < ApplicationRecord
  devise :database_authenticatable, :registerable
  has_many :posts
end`,
  'app/models/post.rb': `
class Post < ApplicationRecord
  belongs_to :user
  validates :title, presence: true
end`,
  'app/controllers/users_controller.rb': `
class UsersController < ApplicationController
  def index
    @users = User.all
  end
end`,
}

function matchGlob(pattern, files) {
  const results = []
  for (const p of Object.keys(files)) {
    if (pattern.includes('**')) {
      const parts = pattern.split('**')
      const prefix = parts[0].replace(/\/$/, '')
      const suffix = (parts[1] || '').replace(/^\//, '')
      if (prefix && !p.startsWith(prefix)) continue
      if (suffix) {
        const ext = suffix.replace(/\*/g, '[^/]*')
        if (!new RegExp(`${ext}$`).test(p)) continue
      }
      results.push(p)
    } else {
      const regex = pattern.replace(/\./g, '\\.').replace(/\*/g, '[^/]*')
      if (new RegExp(`^${regex}$`).test(p)) results.push(p)
    }
  }
  return results
}

function createProvider(extraFiles = {}, includeExecCommand = true) {
  const files = { ...BASE_FILES, ...extraFiles }

  const provider = {
    readFile: (path) => files[path] ?? null,
    fileExists: (path) => path in files,
    glob: (pattern) => matchGlob(pattern, files),
    listDir: (path) => {
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

  if (includeExecCommand) {
    provider.execCommand = async () => ({
      exitCode: 0,
      stdout: '{}',
      stderr: '',
    })
  }

  return provider
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildIndex with introspection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls runIntrospection and merges runtime models into extractions', async () => {
    runIntrospection.mockResolvedValue({
      available: true,
      models: RUNTIME_MODELS,
      controllers: RUNTIME_CONTROLLERS,
      routes: RUNTIME_ROUTES,
      database: RUNTIME_DATABASE,
      error: null,
      duration_ms: 42,
    })

    const provider = createProvider()
    const index = await buildIndex(provider)

    expect(runIntrospection).toHaveBeenCalledOnce()
    expect(index.extractions._introspection.available).toBe(true)
  })

  it('does not call runIntrospection when noIntrospection option is true', async () => {
    runIntrospection.mockResolvedValue({
      available: true,
      models: RUNTIME_MODELS,
      controllers: RUNTIME_CONTROLLERS,
      routes: RUNTIME_ROUTES,
      database: RUNTIME_DATABASE,
      error: null,
      duration_ms: 42,
    })

    const provider = createProvider()

    // Without noIntrospection: bridge should be called and _introspection metadata set
    const normalResult = await buildIndex(provider)
    expect(normalResult.extractions._introspection?.available).toBe(true)

    // With noIntrospection: true — bridge must NOT be called
    vi.clearAllMocks()
    const skipResult = await buildIndex(provider, { noIntrospection: true })
    expect(runIntrospection).not.toHaveBeenCalled()
    expect(skipResult.extractions._introspection).toBeUndefined()
  })

  it('does not throw when introspection returns available: false', async () => {
    runIntrospection.mockResolvedValue({
      available: false,
      models: null,
      controllers: null,
      routes: null,
      database: null,
      error: 'bundle exec ruby exited with code 1',
      duration_ms: 5,
    })

    const provider = createProvider()
    const index = await buildIndex(provider)

    expect(runIntrospection).toHaveBeenCalledOnce()
    expect(index.extractions.models).toBeDefined()
    expect(index.extractions._introspection).toBeUndefined()
  })

  it('falls back gracefully when provider has no execCommand', async () => {
    // Provider without execCommand — bridge handles this guard internally.
    // Indexer should still invoke the bridge (which will return available: false).
    runIntrospection.mockResolvedValue({
      available: false,
      models: null,
      controllers: null,
      routes: null,
      database: null,
      error: 'Provider does not support execCommand',
      duration_ms: 0,
    })

    const provider = createProvider({}, false) // no execCommand
    const index = await buildIndex(provider)

    expect(runIntrospection).toHaveBeenCalledOnce()
    expect(index.extractions).toBeDefined()
    expect(index.extractions.models).toBeDefined()
  })
})
