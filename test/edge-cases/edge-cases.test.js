import { describe, it, expect } from 'vitest'
import { buildIndex } from '../../src/core/indexer.js'
import { createMemoryProvider } from '../helpers/mock-provider.js'
import { extractModel } from '../../src/extractors/model.js'
import { extractController } from '../../src/extractors/controller.js'
import { extractRoutes } from '../../src/extractors/routes.js'
import { extractSchema } from '../../src/extractors/schema.js'
import { extractGemfile } from '../../src/extractors/gemfile.js'
import { extractComponent } from '../../src/extractors/component.js'
import { extractStimulusController } from '../../src/extractors/stimulus.js'
import { extractViews } from '../../src/extractors/views.js'
import { extractAuth } from '../../src/extractors/auth.js'
import { extractJobs } from '../../src/extractors/jobs.js'
import { extractEmail } from '../../src/extractors/email.js'
import { extractConfig } from '../../src/extractors/config.js'

describe('Edge Cases', () => {
  describe('empty files', () => {
    it('handles empty Gemfile gracefully', () => {
      const provider = createMemoryProvider({ Gemfile: '', 'Gemfile.lock': '' })
      const result = extractGemfile(provider)
      expect(result).toBeDefined()
      expect(result.gems).toBeDefined()
    })

    it('handles empty model file', () => {
      const provider = createMemoryProvider({ 'app/models/user.rb': '' })
      const result = extractModel(provider, 'app/models/user.rb', 'User')
      expect(result).toBeDefined()
    })

    it('handles empty controller file', () => {
      const provider = createMemoryProvider({
        'app/controllers/posts_controller.rb': '',
      })
      const result = extractController(
        provider,
        'app/controllers/posts_controller.rb',
      )
      expect(result).toBeDefined()
    })

    it('handles empty routes file', () => {
      const provider = createMemoryProvider({ 'config/routes.rb': '' })
      const result = extractRoutes(provider)
      expect(result).toBeDefined()
    })

    it('handles empty schema file', () => {
      const provider = createMemoryProvider({ 'db/schema.rb': '' })
      const result = extractSchema(provider)
      expect(result).toBeDefined()
    })

    it('handles empty config file', () => {
      const provider = createMemoryProvider({ 'config/application.rb': '' })
      const result = extractConfig(provider)
      expect(result).toBeDefined()
    })

    it('handles empty stimulus controller', () => {
      const provider = createMemoryProvider({
        'app/javascript/controllers/test_controller.js': '',
      })
      const result = extractStimulusController(
        provider,
        'app/javascript/controllers/test_controller.js',
      )
      expect(result).toBeDefined()
    })
  })

  describe('missing files', () => {
    it('builds index with no files at all', async () => {
      const provider = createMemoryProvider({})
      const index = await buildIndex(provider)
      expect(index).toBeDefined()
      expect(index.version).toBe('1.0.0')
      expect(index.manifest.total_files).toBe(0)
    })

    it('builds index with only Gemfile', async () => {
      const provider = createMemoryProvider({
        Gemfile: "gem 'rails', '~> 7.1'",
      })
      const index = await buildIndex(provider)
      expect(index).toBeDefined()
      expect(index.manifest.total_files).toBe(1)
    })

    it('handles missing schema file', () => {
      const provider = createMemoryProvider({})
      const result = extractSchema(provider)
      expect(result).toBeDefined()
      expect(result.tables).toEqual([])
    })

    it('handles missing routes file', () => {
      const provider = createMemoryProvider({})
      const result = extractRoutes(provider)
      expect(result).toBeDefined()
    })
  })

  describe('malformed files', () => {
    it('handles model with syntax errors', () => {
      const provider = createMemoryProvider({
        'app/models/user.rb': 'class User < \n  end end end\nhas_many :broken',
      })
      const result = extractModel(provider, 'app/models/user.rb', 'User')
      expect(result).toBeDefined()
    })

    it('handles routes with invalid ruby', () => {
      const provider = createMemoryProvider({
        'config/routes.rb':
          'Rails.application.routes.draw do\n  {{invalid}}\nend',
      })
      const result = extractRoutes(provider)
      expect(result).toBeDefined()
    })

    it('handles schema with garbled content', () => {
      const provider = createMemoryProvider({
        'db/schema.rb': 'not a schema file at all\nrandom text\n123',
      })
      const result = extractSchema(provider)
      expect(result).toBeDefined()
      expect(result.tables).toEqual([])
    })

    it('handles binary-like content in Gemfile', () => {
      const provider = createMemoryProvider({
        Gemfile: '\x00\x01\x02\x03invalid binary',
      })
      const result = extractGemfile(provider)
      expect(result).toBeDefined()
    })

    it('handles extremely long lines', () => {
      const longLine = 'x'.repeat(10000)
      const provider = createMemoryProvider({
        'app/models/user.rb': `class User < ApplicationRecord\n  validates :name, ${longLine}\nend`,
      })
      const result = extractModel(provider, 'app/models/user.rb', 'User')
      expect(result).toBeDefined()
    })
  })

  describe('encoding edge cases', () => {
    it('handles UTF-8 content in comments', () => {
      const provider = createMemoryProvider({
        'app/models/user.rb':
          '# Ünïcödé cömments 日本語\nclass User < ApplicationRecord\n  validates :name, presence: true\nend',
      })
      const result = extractModel(provider, 'app/models/user.rb', 'User')
      expect(result).toBeDefined()
      expect(result.validations?.length).toBeGreaterThan(0)
    })

    it('handles BOM in file', () => {
      const provider = createMemoryProvider({
        Gemfile: "\uFEFFgem 'rails', '~> 7.1'",
      })
      const result = extractGemfile(provider)
      expect(result).toBeDefined()
    })
  })

  describe('minimal valid apps', () => {
    it('builds index for minimal model-only app', async () => {
      const provider = createMemoryProvider({
        'app/models/user.rb': 'class User < ApplicationRecord\nend',
        'db/schema.rb':
          'ActiveRecord::Schema[7.1].define do\n  create_table "users" do |t|\n    t.string "name"\n  end\nend',
      })
      const index = await buildIndex(provider)
      expect(index.statistics.models).toBe(1)
    })

    it('builds index for API-only app', async () => {
      const provider = createMemoryProvider({
        Gemfile: "gem 'rails', '~> 7.1'\ngem 'jsonapi-serializer'",
        'config/application.rb': 'config.api_only = true',
        'app/controllers/api/v1/users_controller.rb':
          'class Api::V1::UsersController < ApplicationController\n  def index\n    render json: User.all\n  end\nend',
      })
      const index = await buildIndex(provider)
      expect(index).toBeDefined()
    })
  })

  describe('duplicate and overlapping patterns', () => {
    it('handles model with duplicate associations', () => {
      const provider = createMemoryProvider({
        'app/models/user.rb':
          'class User < ApplicationRecord\n  has_many :posts\n  has_many :posts\nend',
      })
      const result = extractModel(provider, 'app/models/user.rb', 'User')
      expect(result.associations.length).toBeGreaterThanOrEqual(2)
    })

    it('handles multiple devise_for in routes', () => {
      const provider = createMemoryProvider({
        'config/routes.rb':
          'Rails.application.routes.draw do\n  devise_for :users\n  devise_for :admins\nend',
      })
      const result = extractRoutes(provider)
      expect(result).toBeDefined()
    })
  })
})
