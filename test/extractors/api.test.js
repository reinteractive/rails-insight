import { describe, it, expect } from 'vitest'
import { extractApi } from '../../src/extractors/api.js'

function mockProvider(files) {
  return {
    readFile(path) {
      return files[path] || null
    },
  }
}

describe('API Extractor', () => {
  describe('full API config', () => {
    const files = {
      'config/application.rb': `
module MyApp
  class Application < Rails::Application
    config.api_only = true
  end
end`,
      'app/controllers/api/v1/posts_controller.rb': `
class Api::V1::PostsController < ApplicationController
  def index
    @posts = Post.page(params[:page]).per(25)
    render json: PostSerializer.new(@posts)
  end
end`,
      'config/initializers/rack_attack.rb': `
Rack::Attack.throttle("api/ip", limit: 300, period: 5.minutes) do |req|
  req.ip if req.path.start_with?("/api")
end`,
      'config/initializers/cors.rb': `
Rails.application.config.middleware.insert_before 0, Rack::Cors do
  allow do
    origins '*'
    resource '/api/*',
      headers: :any,
      methods: [:get, :post, :put, :patch, :delete],
      max_age: 600
  end
end`,
      'app/graphql/my_app_schema.rb': `
class MyAppSchema < GraphQL::Schema
  mutation(Types::MutationType)
  query(Types::QueryType)
end`,
      'app/graphql/types/query_type.rb': `
class Types::QueryType < Types::BaseObject
  field :posts, [Types::PostType], null: false
  field :post, Types::PostType, null: true do
    argument :id, ID, required: true
  end
end`,
      'app/graphql/mutations/create_post.rb': `
class Mutations::CreatePost < Mutations::BaseMutation
  argument :title, String, required: true
  field :post, Types::PostType, null: true
end`,
    }

    const entries = [
      {
        path: 'app/controllers/api/v1/posts_controller.rb',
        category: 'controller',
      },
      { path: 'app/graphql/my_app_schema.rb', category: 'graphql' },
      { path: 'app/graphql/types/query_type.rb', category: 'graphql' },
      { path: 'app/graphql/mutations/create_post.rb', category: 'graphql' },
    ]

    const gemInfo = {
      gems: {
        'jsonapi-serializer': {},
        kaminari: {},
        'rack-attack': {},
        'rack-cors': {},
        graphql: {},
      },
    }

    const provider = mockProvider(files)
    const result = extractApi(provider, entries, gemInfo)

    it('detects api_only mode', () => {
      expect(result.api_only).toBe(true)
    })

    it('detects serialization library', () => {
      expect(result.serialization).toBeTruthy()
      expect(result.serialization.gem).toBe('jsonapi-serializer')
    })

    it('detects pagination library', () => {
      expect(result.pagination).toBeTruthy()
      expect(result.pagination.gem).toBe('kaminari')
    })

    it('detects rate limiting', () => {
      expect(result.rate_limiting).toBeTruthy()
      expect(result.rate_limiting.gem).toBe('rack-attack')
    })

    it('detects CORS configuration', () => {
      expect(result.cors).toBeTruthy()
    })

    it('detects GraphQL schema', () => {
      expect(result.graphql).toBeTruthy()
      expect(result.graphql.schema).toBe('MyAppSchema')
    })

    it('counts GraphQL types', () => {
      expect(result.graphql.types.length).toBeGreaterThanOrEqual(1)
    })

    it('counts GraphQL mutations', () => {
      expect(result.graphql.mutations.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('versioning detection', () => {
    it('detects API version namespaces from paths', () => {
      const files = {}
      const entries = [
        {
          path: 'app/controllers/api/v1/users_controller.rb',
          category: 'controller',
        },
        {
          path: 'app/controllers/api/v2/users_controller.rb',
          category: 'controller',
        },
      ]
      const provider = mockProvider(files)
      const result = extractApi(provider, entries, { gems: {} })
      expect(result.versioning).toContain('v1')
      expect(result.versioning).toContain('v2')
    })
  })

  describe('no API config', () => {
    it('returns empty result', () => {
      const provider = mockProvider({
        'config/application.rb': `
module MyApp
  class Application < Rails::Application
  end
end`,
      })
      const result = extractApi(provider, [], { gems: {} })
      expect(result.api_only).toBe(false)
      expect(result.serialization).toBeNull()
      expect(result.pagination).toBeNull()
      expect(result.rate_limiting).toBeNull()
      expect(result.cors).toBeNull()
      expect(result.graphql).toBeNull()
    })
  })
})
