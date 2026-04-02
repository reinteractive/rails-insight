import { describe, it, expect } from 'vitest'
import { extractCaching } from '../../src/extractors/caching.js'

function mockProvider(files) {
  return {
    readFile(path) {
      return files[path] || null
    },
  }
}

describe('Caching Extractor', () => {
  describe('full caching config', () => {
    const files = {
      'config/environments/production.rb': `
Rails.application.configure do
  config.cache_store = :solid_cache
end`,
      'config/environments/development.rb': `
Rails.application.configure do
  config.cache_store = :memory_store
end`,
      'app/views/posts/index.html.erb': `
<% cache @posts do %>
  <% @posts.each do |post| %>
    <% cache [post, post.comments.maximum(:updated_at)] do %>
      <%= render post %>
    <% end %>
  <% end %>
<% end %>`,
      'app/controllers/posts_controller.rb': `
class PostsController < ApplicationController
  def show
    @post = Post.find(params[:id])
    if stale?(@post)
      respond_to do |format|
        format.html
      end
    end
  end

  def index
    fresh_when(@posts)
    expires_in 5.minutes
  end
end`,
      'app/services/stats_service.rb': `
class StatsService
  def calculate
    Rails.cache.fetch("stats/daily", expires_in: 1.hour) do
      Post.count
    end
    Rails.cache.fetch("stats/weekly") do
      User.count
    end
  end
end`,
    }

    const entries = [
      { path: 'app/views/posts/index.html.erb', category: 'view' },
      { path: 'app/controllers/posts_controller.rb', category: 'controller' },
      { path: 'app/services/stats_service.rb', category: 'service' },
    ]

    const provider = mockProvider(files)
    const result = extractCaching(provider, entries)

    it('extracts cache store per environment', () => {
      expect(result.store.production).toBe('solid_cache')
      expect(result.store.development).toBe('memory_store')
    })

    it('counts fragment caching usage', () => {
      expect(result.fragment_caching.usage_count).toBeGreaterThanOrEqual(2)
    })

    it('detects russian doll caching', () => {
      expect(result.fragment_caching.russian_doll_detected).toBe(true)
    })

    it('counts Rails.cache.fetch usage', () => {
      expect(
        result.low_level_caching.rails_cache_fetch_count,
      ).toBeGreaterThanOrEqual(2)
    })

    it('counts stale? usage', () => {
      expect(result.http_caching.stale_usage).toBeGreaterThanOrEqual(1)
    })

    it('counts fresh_when usage', () => {
      expect(result.http_caching.fresh_when_usage).toBeGreaterThanOrEqual(1)
    })

    it('counts expires_in usage', () => {
      expect(result.http_caching.expires_in_usage).toBeGreaterThanOrEqual(1)
    })
  })

  describe('no caching', () => {
    it('returns empty result', () => {
      const provider = mockProvider({})
      const result = extractCaching(provider, [])
      expect(result.store).toEqual({ production: 'file_store (Rails default \u2014 not explicitly configured)' })
      expect(result.fragment_caching.usage_count).toBe(0)
      expect(result.low_level_caching.rails_cache_fetch_count).toBe(0)
    })
  })

  describe('ISSUE-08: commented-out cache configuration', () => {
    it('ignores commented-out cache_store in production.rb', () => {
      const provider = mockProvider({
        'config/environments/production.rb': `
Rails.application.configure do
  # config.cache_store = :mem_cache_store
  config.force_ssl = true
end`,
      })
      const result = extractCaching(provider, [])
      expect(result.store.production).toBe('file_store (Rails default \u2014 not explicitly configured)')
    })

    it('detects uncommented cache_store in production.rb', () => {
      const provider = mockProvider({
        'config/environments/production.rb': `
Rails.application.configure do
  # config.cache_store = :mem_cache_store
  config.cache_store = :redis_cache_store
end`,
      })
      const result = extractCaching(provider, [])
      expect(result.store.production).toBe('redis_cache_store')
    })
  })

  describe('ISSUE-D: HAML fragment cache detection', () => {
    it('counts fragment cache calls in HAML views', () => {
      const entries = [
        {
          path: 'app/views/activities/show.html.haml',
          category: 7,
          categoryName: 'views',
          type: 'haml',
        },
        {
          path: 'app/views/articles/index.html.erb',
          category: 7,
          categoryName: 'views',
          type: 'erb',
        },
      ]
      const provider = {
        readFile(path) {
          if (path.endsWith('.haml'))
            return `%h1 Activity
- cache @activity do
  = render @activity
- cache ['v2', @sidebar] do
  = render 'sidebar'`
          if (path.endsWith('.erb'))
            return `<% cache @article do %>
  <%= render @article %>
<% end %>`
          return null
        },
      }
      const result = extractCaching(provider, entries)
      expect(result.fragment_caching.usage_count).toBe(3)
    })
  })

  describe('ISSUE-E: Rails.cache ops counting', () => {
    it('counts all Rails.cache operations, not just fetch', () => {
      const entries = [
        {
          path: 'app/models/product.rb',
          category: 1,
          categoryName: 'models',
          type: 'ruby',
        },
      ]
      const provider = {
        readFile(path) {
          if (path === 'app/models/product.rb')
            return `class Product < ApplicationRecord
  def cached_price
    Rails.cache.fetch("price_\#{id}") { calculate }
  end
  def update_cache
    Rails.cache.write("price_\#{id}", price)
  end
  def clear_cache
    Rails.cache.delete("price_\#{id}")
    Rails.cache.delete_matched("products:*")
  end
  def cached?
    Rails.cache.exist?("price_\#{id}")
  end
end`
          return null
        },
      }
      const result = extractCaching(provider, entries)
      expect(result.low_level_caching.rails_cache_fetch_count).toBe(1)
      expect(
        result.low_level_caching.rails_cache_ops_count,
      ).toBeGreaterThanOrEqual(3)
    })
  })

  describe('conditional cache_store detection', () => {
    it('handles conditional cache_store assignments in development', () => {
      const provider = {
        readFile(path) {
          if (path === 'config/environments/development.rb') {
            return `Rails.application.configure do
  if Rails.root.join('tmp/caching-dev.txt').exist?
    config.cache_store = :memory_store
  else
    config.cache_store = :null_store
  end
end`
          }
          return null
        },
      }
      const result = extractCaching(provider, [])
      // Should not just pick :memory_store — should note it's conditional
      expect(result.store.development).not.toBe('memory_store')
      expect(result.store.development).toMatchObject({
        values: expect.arrayContaining(['memory_store', 'null_store']),
        note: expect.stringContaining('conditional'),
      })
    })

    it('reports single unconditional cache_store as a string', () => {
      const provider = {
        readFile(path) {
          if (path === 'config/environments/production.rb') {
            return 'Rails.application.configure do\n  config.cache_store = :redis_cache_store\nend'
          }
          return null
        },
      }
      const result = extractCaching(provider, [])
      expect(result.store.production).toBe('redis_cache_store')
    })
  })
})
