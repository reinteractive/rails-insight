import { describe, it, expect, beforeAll } from 'vitest'
import { buildIndex } from '../../src/core/indexer.js'
import { registerBlastRadiusTools } from '../../src/tools/blast-radius-tools.js'
import { estimateTokensForObject } from '../../src/utils/token-counter.js'

function createMockProvider() {
  const files = {
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
    'app/controllers/users_controller.rb': `
class UsersController < ApplicationController
  def index
    @users = User.all
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
    t.timestamps
  end
end`,
  }

  return {
    readFile(path) { return files[path] || null },
    fileExists(path) { return path in files },
    glob(pattern) {
      return Object.keys(files).filter((p) => matchGlob(pattern, p))
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
    async execCommand() {
      return { stdout: '', stderr: 'Not a git repository', exitCode: 128 }
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

function parseResponse(result) {
  const text = result.content?.[0]?.text
  return text ? JSON.parse(text) : null
}

describe('Blast Radius Tools — MCP Handlers', () => {
  let mock
  let provider

  beforeAll(async () => {
    provider = createMockProvider()
    const builtIndex = await buildIndex(provider)
    mock = createMockServer()
    const state = { index: builtIndex, provider, verbose: false }
    registerBlastRadiusTools(mock.server, state)
  })

  describe('get_blast_radius', () => {
    it('with explicit files returns impact analysis', async () => {
      const result = await mock.callTool('get_blast_radius', {
        files: ['app/models/user.rb'],
      })
      const data = parseResponse(result)
      expect(data.seeds).toBeDefined()
      expect(data.seeds.length).toBeGreaterThan(0)
      expect(data.impacted).toBeDefined()
      expect(data.summary).toBeDefined()
    })

    it('with no files and no git returns error', async () => {
      const noGitMock = createMockServer()
      const state = { index: await buildIndex(provider), provider, verbose: false }
      registerBlastRadiusTools(noGitMock.server, state)
      const result = await noGitMock.callTool('get_blast_radius', {})
      const data = parseResponse(result)
      // Provider's execCommand returns "Not a git repository"
      expect(data.error || data.message).toBeTruthy()
    })

    it('returns seeds and impacted entities', async () => {
      const result = await mock.callTool('get_blast_radius', {
        files: ['app/models/post.rb'],
      })
      const data = parseResponse(result)
      expect(data.seeds[0].entity).toBe('Post')
      expect(data.impacted).toBeDefined()
    })

    it('returns impactedTests', async () => {
      const result = await mock.callTool('get_blast_radius', {
        files: ['app/models/user.rb'],
      })
      const data = parseResponse(result)
      expect(data.impactedTests).toBeDefined()
      expect(Array.isArray(data.impactedTests)).toBe(true)
    })

    it('handles unknown files in warnings', async () => {
      const result = await mock.callTool('get_blast_radius', {
        files: ['unknown_file.txt', 'app/models/user.rb'],
      })
      const data = parseResponse(result)
      expect(data.warnings.some((w) => w.includes('unknown_file.txt'))).toBe(true)
    })

    it('returns noIndex error when index is null', async () => {
      const noIndexMock = createMockServer()
      const state = { index: null, provider, verbose: false }
      registerBlastRadiusTools(noIndexMock.server, state)
      const result = await noIndexMock.callTool('get_blast_radius', {
        files: ['app/models/user.rb'],
      })
      const data = parseResponse(result)
      expect(data.error).toContain('index_project')
    })
  })

  describe('get_review_context', () => {
    it('returns token-budgeted output', async () => {
      const result = await mock.callTool('get_review_context', {
        files: ['app/models/user.rb'],
        token_budget: 8000,
      })
      const data = parseResponse(result)
      const tokens = estimateTokensForObject(data)
      expect(tokens).toBeLessThanOrEqual(8000)
    })

    it('filters by risk_filter', async () => {
      const result = await mock.callTool('get_review_context', {
        files: ['app/models/user.rb'],
        risk_filter: 'HIGH',
      })
      const data = parseResponse(result)
      for (const entity of data.entities || []) {
        expect(['CRITICAL', 'HIGH']).toContain(entity.risk)
      }
    })

    it('includes structural summaries', async () => {
      const result = await mock.callTool('get_review_context', {
        files: ['app/models/user.rb'],
      })
      const data = parseResponse(result)
      expect(data.entities).toBeDefined()
      expect(data.summary).toBeDefined()
    })

    it('returns noIndex error when index is null', async () => {
      const noIndexMock = createMockServer()
      const state = { index: null, provider, verbose: false }
      registerBlastRadiusTools(noIndexMock.server, state)
      const result = await noIndexMock.callTool('get_review_context', {
        files: ['app/models/user.rb'],
      })
      const data = parseResponse(result)
      expect(data.error).toContain('index_project')
    })
  })
})
