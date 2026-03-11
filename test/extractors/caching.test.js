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
      expect(result.store).toEqual({})
      expect(result.fragment_caching.usage_count).toBe(0)
      expect(result.low_level_caching.rails_cache_fetch_count).toBe(0)
    })
  })
})
