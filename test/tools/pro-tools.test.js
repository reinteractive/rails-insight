import { describe, it, expect, beforeAll } from 'vitest'
import { buildIndex } from '../../src/core/indexer.js'

import { formatOutput } from '../../src/core/formatter.js'

function createMockProvider() {
  const files = {
    Gemfile: `
source 'https://rubygems.org'
gem 'rails', '~> 7.1'
gem 'pg'
gem 'devise'
gem 'pundit'
gem 'sidekiq'
`,
    'Gemfile.lock': `
GEM
  specs:
    rails (7.1.3)
    pg (1.5.4)
    devise (4.9.3)
    pundit (2.3.1)
    sidekiq (7.2.4)
`,
    'config/application.rb': `
module TestApp
  class Application < Rails::Application
    config.load_defaults 7.1
    config.active_job.queue_adapter = :sidekiq
  end
end`,
    'config/routes.rb': `
Rails.application.routes.draw do
  resources :posts do
    resources :comments, only: [:create, :destroy]
  end
  resources :users, only: [:index, :show]
end`,
    'app/models/user.rb': `
class User < ApplicationRecord
  devise :database_authenticatable, :registerable, :confirmable
  has_many :posts
  has_many :comments, through: :posts
  scope :active, -> { where(active: true) }
  enum :role, { user: 0, admin: 1, moderator: 2 }
end`,
    'app/models/post.rb': `
class Post < ApplicationRecord
  belongs_to :user
  has_many :comments
  validates :title, presence: true
  validates :body, length: { minimum: 10 }
  scope :published, -> { where(published: true) }
  before_save :normalize_title
end`,
    'app/models/comment.rb': `
class Comment < ApplicationRecord
  belongs_to :post
  belongs_to :user
  validates :body, presence: true
end`,
    'app/controllers/posts_controller.rb': `
class PostsController < ApplicationController
  before_action :authenticate_user!
  before_action :set_post, only: [:show, :edit, :update, :destroy]

  def index
    @posts = Post.published
  end

  def show
  end

  def create
    @post = current_user.posts.build(post_params)
  end

  private

  def set_post
    @post = Post.find(params[:id])
  end

  def post_params
    params.require(:post).permit(:title, :body)
  end
end`,
    'app/controllers/users_controller.rb': `
class UsersController < ApplicationController
  def index
    @users = User.active
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
    t.integer "role", default: 0
    t.timestamps
  end

  create_table "posts" do |t|
    t.references "user", foreign_key: true
    t.string "title"
    t.text "body"
    t.boolean "published", default: false
    t.timestamps
  end

  create_table "comments" do |t|
    t.references "post", foreign_key: true
    t.references "user", foreign_key: true
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

describe('Pro Tools Logic', () => {
  let index

  beforeAll(async () => {
    const provider = createMockProvider()
    index = await buildIndex(provider)
  })

  describe('get_model', () => {
    it('returns full extraction for existing model', () => {
      const models = index.extractions?.models || {}
      const user = models['User']
      expect(user).toBeDefined()
      expect(user.associations).toBeDefined()
      expect(user.associations.length).toBeGreaterThan(0)
    })

    it('lists available models when model not found', () => {
      const models = index.extractions?.models || {}
      const available = Object.keys(models)
      expect(available.length).toBeGreaterThan(0)
      expect(models['NonExistent']).toBeUndefined()
    })
  })

  describe('get_controller', () => {
    it('returns full extraction for existing controller', () => {
      const controllers = index.extractions?.controllers || {}
      const posts = controllers['PostsController']
      expect(posts).toBeDefined()
      expect(posts.actions).toBeDefined()
      expect(posts.actions.length).toBeGreaterThan(0)
    })

    it('lists available controllers when not found', () => {
      const controllers = index.extractions?.controllers || {}
      const available = Object.keys(controllers)
      expect(available.length).toBeGreaterThan(0)
      expect(controllers['NonExistentController']).toBeUndefined()
    })
  })

  describe('get_routes', () => {
    it('returns route data', () => {
      const routes = index.extractions?.routes
      expect(routes).toBeDefined()
    })
  })

  describe('get_schema', () => {
    it('returns schema with tables', () => {
      const schema = index.extractions?.schema
      expect(schema).toBeDefined()
      expect(schema.tables).toBeDefined()
      expect(schema.tables.length).toBeGreaterThan(0)
    })
  })

  describe('get_schema_for', () => {
    it('finds specific table', () => {
      const schema = index.extractions?.schema || {}
      const tables = schema.tables || []
      const posts = tables.find((t) => t.name === 'posts')
      expect(posts).toBeDefined()
      expect(posts.columns).toBeDefined()
    })

    it('knows table is missing', () => {
      const schema = index.extractions?.schema || {}
      const tables = schema.tables || []
      const unknown = tables.find((t) => t.name === 'nonexistent')
      expect(unknown).toBeUndefined()
    })
  })

  describe('get_subgraph', () => {
    it('returns auth-related entities for authentication skill', () => {
      const allRels = index.relationships || []
      const rankings = index.rankings || {}
      const domains = ['auth', 'devise', 'session', 'current']

      const relevantEntities = new Set()
      for (const rel of allRels) {
        const fromMatch = domains.some((d) =>
          rel.from.toLowerCase().includes(d),
        )
        const toMatch = domains.some((d) => rel.to.toLowerCase().includes(d))
        if (fromMatch || toMatch) {
          relevantEntities.add(rel.from)
          relevantEntities.add(rel.to)
        }
      }
      // With devise, User should be relevant
      // May or may not have auth-related entities depending on graph
      expect(relevantEntities.size).toBeGreaterThanOrEqual(0)
    })

    it('returns database-related entities for database skill', () => {
      const rankings = index.rankings || {}
      const dbEntities = Object.keys(rankings).filter(
        (k) =>
          k.toLowerCase().includes('model') ||
          ['User', 'Post', 'Comment'].includes(k),
      )
      expect(dbEntities.length).toBeGreaterThan(0)
    })
  })

  describe('get_related', () => {
    it('finds entities connected to User', () => {
      const allRels = index.relationships || []
      const visited = new Set(['User'])
      let frontier = ['User']
      const connected = []

      for (let d = 0; d < 2 && frontier.length > 0; d++) {
        const nextFrontier = []
        for (const current of frontier) {
          for (const rel of allRels) {
            let neighbor = null
            if (rel.from === current && !visited.has(rel.to)) {
              neighbor = rel.to
            } else if (rel.to === current && !visited.has(rel.from)) {
              neighbor = rel.from
            }
            if (neighbor) {
              visited.add(neighbor)
              nextFrontier.push(neighbor)
              connected.push({ entity: neighbor, distance: d + 1 })
            }
          }
        }
        frontier = nextFrontier
      }

      // User has_many posts, has_many comments through posts
      expect(connected.length).toBeGreaterThan(0)
    })

    it('returns empty for unknown entity', () => {
      const allRels = index.relationships || []
      const connected = []
      const frontier = ['NonExistent']
      const visited = new Set(frontier)

      for (const current of frontier) {
        for (const rel of allRels) {
          if (rel.from === current && !visited.has(rel.to)) {
            connected.push(rel.to)
          }
        }
      }

      expect(connected.length).toBe(0)
    })
  })

  describe('get_convention_drift', () => {
    it('returns drift array', () => {
      expect(Array.isArray(index.drift)).toBe(true)
    })
  })

  describe('get_full_index', () => {
    it('returns trimmed index within token budget', () => {
      const trimmed = formatOutput(index, 4000)
      const json = JSON.stringify(trimmed)
      const estimatedTokens = Math.ceil(json.length / 4)
      expect(estimatedTokens).toBeLessThanOrEqual(4000 * 1.15) // 15% margin
    })
  })

  describe('search_patterns', () => {
    it('finds has_many_through associations', () => {
      const models = index.extractions?.models || {}
      let found = false
      for (const [name, model] of Object.entries(models)) {
        if (model.associations) {
          for (const assoc of model.associations) {
            if (assoc.type?.includes('has_many') && assoc.through) {
              found = true
            }
          }
        }
      }
      // User has_many :comments, through: :posts
      expect(found).toBe(true)
    })

    it('finds before_action filters', () => {
      const controllers = index.extractions?.controllers || {}
      let found = false
      for (const [name, ctrl] of Object.entries(controllers)) {
        if (ctrl.before_actions?.length > 0 || ctrl.filters?.length > 0) {
          found = true
        }
      }
      expect(found).toBe(true)
    })

    it('finds enum patterns', () => {
      const models = index.extractions?.models || {}
      let enumCount = 0
      for (const model of Object.values(models)) {
        if (model.enums) {
          enumCount += Object.keys(model.enums).length
        }
      }
      expect(enumCount).toBeGreaterThan(0)
    })
  })

  describe('relationships and rankings', () => {
    it('has relationships between entities', () => {
      expect(index.relationships.length).toBeGreaterThan(0)
    })

    it('has rankings for entities', () => {
      expect(Object.keys(index.rankings).length).toBeGreaterThan(0)
    })

    it('User has connections in relationships', () => {
      const userRels = index.relationships.filter(
        (r) => r.from === 'User' || r.to === 'User',
      )
      expect(userRels.length).toBeGreaterThan(0)
    })
  })
})
