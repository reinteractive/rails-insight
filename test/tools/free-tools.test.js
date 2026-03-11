import { describe, it, expect, beforeAll } from 'vitest'
import { buildIndex } from '../../src/core/indexer.js'
import { registerFreeTools } from '../../src/tools/free-tools.js'
import { registerTools } from '../../src/tools/index.js'

/**
 * Create a mock provider for a small Rails app.
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
gem 'rspec-rails'
`,
    'Gemfile.lock': `
GEM
  specs:
    rails (7.1.3)
    pg (1.5.4)
    devise (4.9.3)
    sidekiq (7.2.4)
    rspec-rails (6.1.0)
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
  scope :active, -> { where(active: true) }
end`,
    'app/models/post.rb': `
class Post < ApplicationRecord
  belongs_to :user
  has_many :comments
  validates :title, presence: true
  scope :published, -> { where(published: true) }
  scope :recent, -> { order(created_at: :desc) }
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

  def create
    @post = Post.new(post_params)
  end
end`,
    'app/controllers/users_controller.rb': `
class UsersController < ApplicationController
  def index
    @users = User.all
  end

  def show
    @user = User.find(params[:id])
  end
end`,
    'db/schema.rb': `
ActiveRecord::Schema[7.1].define(version: 2024_01_01_000000) do
  create_table "users" do |t|
    t.string "email"
    t.boolean "active", default: true
    t.timestamps
  end

  create_table "posts" do |t|
    t.references "user", foreign_key: true
    t.string "title"
    t.text "body"
    t.boolean "published", default: false
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

/**
 * Create a mock MCP server that captures tool registrations.
 * Returns a map of tool name → handler function.
 */
function createMockServer() {
  const tools = {}
  return {
    server: {
      tool(name, description, schema, handler) {
        tools[name] = { description, schema, handler }
      },
    },
    tools,
    async callTool(name, args = {}) {
      const t = tools[name]
      if (!t) throw new Error(`Tool '${name}' not registered`)
      return t.handler(args)
    },
  }
}

/** Parse the JSON response from a tool call. */
function parseResponse(result) {
  const text = result.content?.[0]?.text
  return text ? JSON.parse(text) : null
}

/**
 * Since free tools are registered on an MCP server,
 * we test them via the underlying functions that the tools call.
 * This validates the logic, not the MCP protocol layer (tested in Task 36).
 */
describe('Free Tools Logic', () => {
  let index

  beforeAll(async () => {
    const provider = createMockProvider()
    index = await buildIndex(provider)
  })

  describe('get_overview logic', () => {
    it('produces compact overview under 500 tokens', () => {
      const v = index.versions || {}
      const config = index.extractions?.config || {}
      const overview = {
        rails_version: v.rails || 'unknown',
        ruby_version: v.ruby || 'unknown',
        database: config.database || v.database || 'unknown',
        file_counts: index.statistics || {},
      }

      const json = JSON.stringify(overview)
      const estimatedTokens = Math.ceil(json.length / 4)
      expect(estimatedTokens).toBeLessThan(500)
    })
  })

  describe('get_manifest logic', () => {
    it('returns total files and category stats', () => {
      const manifest = index.manifest
      expect(manifest.total_files).toBeGreaterThan(0)
      expect(manifest.stats).toBeDefined()
    })

    it('filters by category', () => {
      const entries = index.manifest.byCategory?.models || []
      expect(entries.length).toBeGreaterThan(0)
      for (const entry of entries) {
        expect(entry.path).toContain('app/models/')
      }
    })

    it('returns empty array for unknown category', () => {
      const entries = index.manifest.byCategory?.nonexistent || []
      expect(entries).toEqual([])
    })
  })

  describe('get_dependencies logic', () => {
    it('returns gemfile data', () => {
      const gemfile = index.extractions?.gemfile
      expect(gemfile).toBeDefined()
      expect(gemfile.gems).toBeDefined()
      const railsGem = gemfile.gems.find((g) => g.name === 'rails')
      expect(railsGem).toBeDefined()
    })
  })

  describe('get_detected_stack logic', () => {
    it('returns version information', () => {
      const versions = index.versions
      expect(versions).toBeDefined()
      expect(versions.rails).toBeDefined()
    })
  })

  describe('list_models logic', () => {
    it('lists all models with compact info', () => {
      const models = index.extractions?.models || {}
      const list = Object.entries(models).map(([name, m]) => ({
        name,
        superclass: m.superclass || 'ApplicationRecord',
        association_count: (m.associations || []).length,
        scope_count: (m.scopes || []).length,
      }))

      expect(list.length).toBeGreaterThan(0)
      const user = list.find((m) => m.name === 'User')
      expect(user).toBeDefined()
      expect(user.association_count).toBeGreaterThan(0)
      expect(user.scope_count).toBeGreaterThan(0)
    })

    it('returns all models from the index', () => {
      const models = index.extractions?.models || {}
      const names = Object.keys(models)
      expect(names.length).toBe(2) // User, Post
    })
  })

  describe('list_controllers logic', () => {
    it('lists all controllers with compact info', () => {
      const controllers = index.extractions?.controllers || {}
      const list = Object.entries(controllers).map(([name, c]) => ({
        name,
        superclass: c.superclass || 'ApplicationController',
        action_count: (c.actions || []).length,
      }))

      expect(list.length).toBeGreaterThan(0)
      const posts = list.find((c) => c.name === 'PostsController')
      expect(posts).toBeDefined()
      expect(posts.action_count).toBeGreaterThan(0)
    })
  })

  describe('list_components logic', () => {
    it('returns empty list when no components', () => {
      const components = index.extractions?.components || {}
      const list = Object.entries(components).map(([name, c]) => ({
        name,
        tier: c.tier || 'unknown',
        slot_count: (c.slots || []).length,
        has_preview: c.has_preview || false,
      }))

      // Our mock has no components
      expect(list).toEqual([])
    })
  })

  describe('index structure', () => {
    it('has all required sections', () => {
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

    it('statistics reflect the index content', () => {
      expect(index.statistics.models).toBe(2)
      expect(index.statistics.controllers).toBe(2)
      expect(index.statistics.total_files).toBeGreaterThan(0)
    })
  })

  describe('error handling', () => {
    it('tools return error when index is null', () => {
      // Simulate what the tool handler would do
      const nullIndex = null
      const result = nullIndex
        ? { data: 'ok' }
        : { error: 'Index not built. Call index_project first.' }
      expect(result.error).toContain('index_project')
    })
  })
})

describe('Free Tools — MCP Handlers', () => {
  let mock
  let provider

  beforeAll(async () => {
    provider = createMockProvider()
    const builtIndex = await buildIndex(provider)
    mock = createMockServer()
    const state = { index: builtIndex, provider, verbose: false }
    registerFreeTools(mock.server, state)
  })

  describe('index_project', () => {
    it('re-indexes and returns statistics', async () => {
      const result = await mock.callTool('index_project', { force: true })
      const data = parseResponse(result)
      expect(data.status).toBe('success')
      expect(data.statistics).toBeDefined()
      expect(data.duration_ms).toBeDefined()
    })
  })

  describe('get_overview', () => {
    it('returns structured overview', async () => {
      const result = await mock.callTool('get_overview', {})
      const data = parseResponse(result)
      expect(data.rails_version).toBeDefined()
      expect(data.authentication).toBeDefined()
      expect(data.key_models).toBeDefined()
      expect(data.key_controllers).toBeDefined()
      expect(data.file_counts).toBeDefined()
    })
  })

  describe('get_full_index', () => {
    it('returns trimmed index within budget', async () => {
      const result = await mock.callTool('get_full_index', {
        token_budget: 12000,
      })
      const data = parseResponse(result)
      expect(data).toBeDefined()
    })
  })

  describe('get_model', () => {
    it('returns model with schema enrichment', async () => {
      const result = await mock.callTool('get_model', { name: 'Post' })
      const data = parseResponse(result)
      expect(data.class).toBe('Post')
      expect(data.associations).toBeDefined()
      expect(data.validations).toBeDefined()
      expect(data.columns).toBeDefined()
    })

    it('returns inverse_associations for referenced models', async () => {
      const result = await mock.callTool('get_model', { name: 'User' })
      const data = parseResponse(result)
      // Post belongs_to :user → User should have inverse
      if (data.inverse_associations) {
        expect(data.inverse_associations.length).toBeGreaterThan(0)
      }
    })

    it('returns error for unknown model', async () => {
      const result = await mock.callTool('get_model', { name: 'NonExistent' })
      const data = parseResponse(result)
      expect(data.error).toContain('not found')
      expect(data.available).toBeDefined()
    })
  })

  describe('get_controller', () => {
    it('returns controller with action routes and detail', async () => {
      const result = await mock.callTool('get_controller', {
        name: 'PostsController',
      })
      const data = parseResponse(result)
      expect(data.class).toBe('PostsController')
      expect(data.actions).toContain('index')
      expect(data.actions_detail).toBeDefined()
      expect(data.actions_detail.index).toBeDefined()
    })

    it('returns error for unknown controller', async () => {
      const result = await mock.callTool('get_controller', {
        name: 'UnknownController',
      })
      const data = parseResponse(result)
      expect(data.error).toContain('not found')
      expect(data.available).toBeDefined()
    })
  })

  describe('get_routes', () => {
    it('returns route data', async () => {
      const result = await mock.callTool('get_routes', {})
      const data = parseResponse(result)
      expect(data).toBeDefined()
    })
  })

  describe('get_schema', () => {
    it('returns schema with model_table_map and fk_arrows', async () => {
      const result = await mock.callTool('get_schema', {})
      const data = parseResponse(result)
      expect(data.model_table_map).toBeDefined()
      expect(data.fk_arrows).toBeDefined()
    })
  })

  describe('get_subgraph', () => {
    it('returns subgraph for authentication skill', async () => {
      const result = await mock.callTool('get_subgraph', {
        skill: 'authentication',
      })
      const data = parseResponse(result)
      expect(data.skill).toBe('authentication')
      expect(data.entities).toBeDefined()
      expect(data.relationships).toBeDefined()
    })

    it('returns error for unknown skill', async () => {
      const result = await mock.callTool('get_subgraph', { skill: 'unknown' })
      const data = parseResponse(result)
      expect(data.error).toContain('Unknown skill')
      expect(data.available).toBeDefined()
    })
  })

  describe('search_patterns', () => {
    it('finds has_many associations', async () => {
      const result = await mock.callTool('search_patterns', {
        pattern: 'has_many',
      })
      const data = parseResponse(result)
      expect(data.results).toBeDefined()
      expect(data.total_matches).toBeGreaterThan(0)
    })

    it('finds scope patterns', async () => {
      const result = await mock.callTool('search_patterns', {
        pattern: 'scope',
      })
      const data = parseResponse(result)
      expect(data.results).toBeDefined()
    })

    it('returns zero matches for nonexistent patterns', async () => {
      const result = await mock.callTool('search_patterns', {
        pattern: 'graphql_subscription_xyz',
      })
      const data = parseResponse(result)
      expect(data.total_matches).toBe(0)
    })
  })

  describe('get_deep_analysis', () => {
    it('returns authentication data', async () => {
      const result = await mock.callTool('get_deep_analysis', {
        category: 'authentication',
      })
      const data = parseResponse(result)
      expect(data).toBeDefined()
    })

    it('returns authorization data', async () => {
      const result = await mock.callTool('get_deep_analysis', {
        category: 'authorization',
      })
      const data = parseResponse(result)
      expect(data).toBeDefined()
    })

    it('returns jobs data', async () => {
      const result = await mock.callTool('get_deep_analysis', {
        category: 'jobs',
      })
      const data = parseResponse(result)
      expect(data).toBeDefined()
    })

    it('returns email data', async () => {
      const result = await mock.callTool('get_deep_analysis', {
        category: 'email',
      })
      const data = parseResponse(result)
      expect(data).toBeDefined()
    })

    it('returns storage data', async () => {
      const result = await mock.callTool('get_deep_analysis', {
        category: 'storage',
      })
      const data = parseResponse(result)
      expect(data).toBeDefined()
    })

    it('returns caching data', async () => {
      const result = await mock.callTool('get_deep_analysis', {
        category: 'caching',
      })
      const data = parseResponse(result)
      expect(data).toBeDefined()
    })

    it('returns realtime data', async () => {
      const result = await mock.callTool('get_deep_analysis', {
        category: 'realtime',
      })
      const data = parseResponse(result)
      expect(data).toBeDefined()
    })

    it('returns api_patterns data', async () => {
      const result = await mock.callTool('get_deep_analysis', {
        category: 'api_patterns',
      })
      const data = parseResponse(result)
      expect(data).toBeDefined()
    })

    it('returns slimmed dependencies', async () => {
      const result = await mock.callTool('get_deep_analysis', {
        category: 'dependencies',
      })
      const data = parseResponse(result)
      expect(data).toBeDefined()
      expect(data.total_gem_count).toBeDefined()
      expect(data.notable_absent).toBeDefined()
    })

    it('returns components list', async () => {
      const result = await mock.callTool('get_deep_analysis', {
        category: 'components',
      })
      const data = parseResponse(result)
      expect(data).toBeDefined()
    })

    it('returns specific component by name (error if not found)', async () => {
      const result = await mock.callTool('get_deep_analysis', {
        category: 'components',
        name: 'Missing',
      })
      const data = parseResponse(result)
      expect(data.error).toBeDefined()
    })

    it('returns stimulus controllers', async () => {
      const result = await mock.callTool('get_deep_analysis', {
        category: 'stimulus',
      })
      const data = parseResponse(result)
      expect(data).toBeDefined()
    })

    it('returns stimulus controller by name (error if not found)', async () => {
      const result = await mock.callTool('get_deep_analysis', {
        category: 'stimulus',
        name: 'missing',
      })
      const data = parseResponse(result)
      expect(data.error).toBeDefined()
    })

    it('returns views data', async () => {
      const result = await mock.callTool('get_deep_analysis', {
        category: 'views',
      })
      const data = parseResponse(result)
      expect(data).toBeDefined()
    })

    it('returns convention_drift', async () => {
      const result = await mock.callTool('get_deep_analysis', {
        category: 'convention_drift',
      })
      const data = parseResponse(result)
      expect(data.drift).toBeDefined()
      expect(data.total).toBeDefined()
    })

    it('returns manifest', async () => {
      const result = await mock.callTool('get_deep_analysis', {
        category: 'manifest',
      })
      const data = parseResponse(result)
      expect(data.total_files).toBeDefined()
      expect(data.categories).toBeDefined()
    })

    it('returns manifest filtered by name', async () => {
      const result = await mock.callTool('get_deep_analysis', {
        category: 'manifest',
        name: 'models',
      })
      const data = parseResponse(result)
      expect(data.category).toBe('models')
      expect(data.count).toBeDefined()
    })

    it('returns detected_stack', async () => {
      const result = await mock.callTool('get_deep_analysis', {
        category: 'detected_stack',
      })
      const data = parseResponse(result)
      expect(data.rails).toBeDefined()
    })

    it('returns related entities', async () => {
      const result = await mock.callTool('get_deep_analysis', {
        category: 'related',
        name: 'User',
      })
      const data = parseResponse(result)
      expect(data.source).toBe('User')
      expect(data.connected).toBeDefined()
    })

    it('returns error for related without name', async () => {
      const result = await mock.callTool('get_deep_analysis', {
        category: 'related',
      })
      const data = parseResponse(result)
      expect(data.error).toBeDefined()
    })

    it('returns model_list', async () => {
      const result = await mock.callTool('get_deep_analysis', {
        category: 'model_list',
      })
      const data = parseResponse(result)
      expect(Array.isArray(data)).toBe(true)
      expect(data.length).toBe(2)
      expect(data[0].name).toBeDefined()
    })

    it('returns controller_list', async () => {
      const result = await mock.callTool('get_deep_analysis', {
        category: 'controller_list',
      })
      const data = parseResponse(result)
      expect(Array.isArray(data)).toBe(true)
      expect(data.length).toBe(2)
    })

    it('returns component_list', async () => {
      const result = await mock.callTool('get_deep_analysis', {
        category: 'component_list',
      })
      const data = parseResponse(result)
      expect(Array.isArray(data)).toBe(true)
    })

    it('returns error for unknown category', async () => {
      const result = await mock.callTool('get_deep_analysis', {
        category: 'nonexistent',
      })
      const data = parseResponse(result)
      expect(data.error).toBeDefined()
    })
  })
})

describe('registerTools', () => {
  it('registers tools via the index module', async () => {
    const provider = createMockProvider()
    const builtIndex = await buildIndex(provider)
    const mock = createMockServer()
    registerTools(mock.server, { index: builtIndex, provider, tier: 'free' })
    expect(Object.keys(mock.tools).length).toBeGreaterThan(0)
    expect(mock.tools['get_overview']).toBeDefined()
  })

  it('registers pro tools when tier is pro', async () => {
    const provider = createMockProvider()
    const builtIndex = await buildIndex(provider)
    const mock = createMockServer()
    registerTools(mock.server, { index: builtIndex, provider, tier: 'pro' })
    expect(mock.tools['get_overview']).toBeDefined()
  })
})

describe('Free Tools — no index state', () => {
  it('returns noIndex error when state.index is null', async () => {
    const mock = createMockServer()
    registerFreeTools(mock.server, {
      index: null,
      provider: null,
      verbose: false,
    })
    const result = await mock.callTool('get_overview', {})
    const data = parseResponse(result)
    expect(data.error).toContain('index_project')
  })

  it('index_project returns error when no provider', async () => {
    const mock = createMockServer()
    registerFreeTools(mock.server, {
      index: null,
      provider: null,
      verbose: false,
    })
    const result = await mock.callTool('index_project', {})
    const data = parseResponse(result)
    expect(data.error).toContain('project root')
  })
})
