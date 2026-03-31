import { describe, it, expect } from 'vitest'
import { buildIndex } from '../../src/core/indexer.js'
import {
  RUNTIME_MODELS,
  RUNTIME_CONTROLLERS,
  RUNTIME_ROUTES,
  RUNTIME_DATABASE,
} from '../fixtures/introspection-fixtures.js'

// ---------------------------------------------------------------------------
// Realistic Rails project mock file system
// ---------------------------------------------------------------------------

const MOCK_FILES = {
  Gemfile: `source 'https://rubygems.org'
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
  # authored_comments is defined via metaprogramming — not visible to regex extraction
end`,
  'app/models/post.rb': `
class Post < ApplicationRecord
  belongs_to :user
  validates :title, presence: true
end`,
  'app/controllers/users_controller.rb': `
class UsersController < ApplicationController
  before_action :set_user, only: [:show, :update, :destroy]

  def index
    @users = User.all
  end

  def show; end
  def create; end
  def update; end
  def destroy; end

  private

  def set_user
    @user = User.find(params[:id])
  end
end`,
  'app/controllers/posts_controller.rb': `
class PostsController < ApplicationController
  before_action :set_post, only: [:show]

  def index
    @posts = Post.all
  end

  def show; end
  def create; end

  private

  def set_post
    @post = Post.find(params[:id])
  end
end`,
}

// ---------------------------------------------------------------------------
// Glob helper (matches against MOCK_FILES keys)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Provider factory
// The execCommand mock returns RUNTIME_MODELS which includes the metaprogrammed
// authored_comments association that the regex extractor cannot detect.
// ---------------------------------------------------------------------------

function createProvider() {
  return {
    readFile: (path) => MOCK_FILES[path] ?? null,
    fileExists: (path) => path in MOCK_FILES,
    glob: (pattern) => matchGlob(pattern, MOCK_FILES),
    listDir: (path) => {
      const prefix = path.endsWith('/') ? path : path + '/'
      const items = new Set()
      for (const p of Object.keys(MOCK_FILES)) {
        if (p.startsWith(prefix)) {
          const rest = p.slice(prefix.length)
          const parts = rest.split('/')
          items.add(parts[0] + (parts.length > 1 ? '/' : ''))
        }
      }
      return [...items]
    },
    getProjectRoot: () => '/test/project',
    execCommand: async () => ({
      exitCode: 0,
      stdout: JSON.stringify({
        models: RUNTIME_MODELS,
        controllers: RUNTIME_CONTROLLERS,
        routes: RUNTIME_ROUTES,
        database: RUNTIME_DATABASE,
      }),
      stderr: '',
    }),
  }
}

// ---------------------------------------------------------------------------
// End-to-end tests
// ---------------------------------------------------------------------------

describe('full pipeline: regex + introspection', () => {
  it('full pipeline: regex + introspection → merged index with graph', async () => {
    const provider = createProvider()
    const index = await buildIndex(provider)

    // Flush the microtask queue so the non-awaited runIntrospection().then()
    // chain completes and Object.assign(extractions, merged) runs before
    // the assertions below execute.
    await Promise.resolve()

    // Introspection metadata is set on extractions after the async merge
    expect(index.extractions._introspection.available).toBe(true)

    // The metaprogrammed authored_comments association is NOT in the model
    // source file, so the regex extractor misses it. The runtime bridge finds
    // it via reflect_on_all_associations. After the merge it must be present.
    const userAssocs = index.extractions.models.User?.associations ?? []
    const authoredComments = userAssocs.find(
      (a) => a.name === 'authored_comments',
    )
    expect(authoredComments).toBeDefined()
    expect(authoredComments.class_name).toBe('Comment')

    // Graph has nodes for both regex-extracted models
    expect(index.graph.nodes.has('User')).toBe(true)
    expect(index.graph.nodes.has('Post')).toBe(true)

    // Statistics reflect at least the two regex-extracted models
    expect(index.statistics.models).toBeGreaterThanOrEqual(2)
  }, 15000)

  it('full pipeline: introspection disabled falls back cleanly', async () => {
    const provider = createProvider()
    const index = await buildIndex(provider, { noIntrospection: true })

    // No introspection metadata — regex-only mode
    expect(index.extractions._introspection).toBeUndefined()

    // Regex-extracted models are still present
    expect(index.extractions.models).toBeDefined()
    expect(index.extractions.models.User).toBeDefined()
    expect(index.extractions.models.Post).toBeDefined()

    // The metaprogrammed association is absent in regex-only mode — the
    // extractor only sees the declared has_many :posts in user.rb
    const userAssocs = index.extractions.models.User?.associations ?? []
    const authoredComments = userAssocs.find(
      (a) => a.name === 'authored_comments',
    )
    expect(authoredComments).toBeUndefined()

    // Graph still builds correctly from regex data
    expect(index.graph).toBeDefined()
    expect(index.graph.nodes.has('User')).toBe(true)
    expect(index.graph.nodes.has('Post')).toBe(true)
  }, 15000)
})
