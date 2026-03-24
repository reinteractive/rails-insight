import { describe, it, expect, beforeAll } from 'vitest'
import { extractModel } from '../../src/extractors/model.js'

function mockProvider(files) {
  return {
    readFile(path) {
      return files[path] || null
    },
  }
}

describe('Model Extractor', () => {
  describe('complex model with all patterns', () => {
    const fixture = `
class User < ApplicationRecord
  include Authenticatable
  include Notifiable
  extend Searchable

  has_many :projects, dependent: :destroy
  has_many :memberships
  has_many :teams, through: :memberships
  has_one :profile, dependent: :destroy
  belongs_to :organization, optional: true, counter_cache: true
  has_and_belongs_to_many :roles

  validates :email, presence: true, uniqueness: true
  validates :name, presence: true, length: { maximum: 100 }
  validate :check_email_domain

  scope :active, -> { where(deactivated_at: nil) }
  scope :admins, -> { where(role: :admin) }
  scope :recent, ->(days) { where('created_at > ?', days.days.ago) }

  enum :role, { member: 0, admin: 1, owner: 2 }
  enum :status, { pending: 0, active: 1, suspended: 2 }

  encrypts :ssn
  normalizes :email, with: -> (e) { e.strip.downcase }
  generates_token_for :password_reset

  has_secure_password
  has_secure_token :api_key

  has_one_attached :avatar
  has_many_attached :documents

  has_rich_text :bio

  store_accessor :settings, :theme, :locale, :notifications_enabled

  delegate :name, :address, to: :organization, prefix: true, allow_nil: true

  before_create :set_defaults
  after_commit :sync_to_crm, on: :create
  before_validation :normalize_phone

  broadcasts_to :notifications_stream

  devise :database_authenticatable, :registerable, :recoverable,
         :rememberable, :validatable, :confirmable, :lockable,
         :omniauthable, omniauth_providers: [:google_oauth2, :github]

  searchkick

  self.table_name = 'app_users'
end`

    let result

    beforeAll(() => {
      const provider = mockProvider({ 'app/models/user.rb': fixture })
      result = extractModel(provider, 'app/models/user.rb', 'User')
    })

    // === CLASS STRUCTURE ===
    it('extracts class name', () => {
      expect(result.class).toBe('User')
    })

    it('extracts superclass', () => {
      expect(result.superclass).toBe('ApplicationRecord')
    })

    it('identifies as model type', () => {
      expect(result.type).toBe('model')
    })

    it('extracts includes', () => {
      expect(result.concerns).toContain('Authenticatable')
      expect(result.concerns).toContain('Notifiable')
    })

    it('extracts extends', () => {
      expect(result.extends).toContain('Searchable')
    })

    // === ASSOCIATIONS ===
    it('extracts has_many', () => {
      const projects = result.associations.find((a) => a.name === 'projects')
      expect(projects).toBeDefined()
      expect(projects.type).toBe('has_many')
      expect(projects.options).toContain('dependent: :destroy')
    })

    it('extracts has_many through', () => {
      const teams = result.associations.find((a) => a.name === 'teams')
      expect(teams).toBeDefined()
      expect(teams.through).toBe('memberships')
    })

    it('extracts has_one', () => {
      const profile = result.associations.find((a) => a.name === 'profile')
      expect(profile).toBeDefined()
      expect(profile.type).toBe('has_one')
    })

    it('extracts belongs_to with counter_cache', () => {
      const org = result.associations.find((a) => a.name === 'organization')
      expect(org).toBeDefined()
      expect(org.type).toBe('belongs_to')
      expect(org.counter_cache).toBe(true)
    })

    it('extracts HABTM', () => {
      const roles = result.associations.find((a) => a.name === 'roles')
      expect(roles).toBeDefined()
      expect(roles.type).toBe('has_and_belongs_to_many')
    })

    it('extracts correct total association count', () => {
      expect(result.associations).toHaveLength(6)
    })

    // === VALIDATIONS ===
    it('extracts validates with rules', () => {
      const email = result.validations.find((v) =>
        v.attributes.includes('email'),
      )
      expect(email).toBeDefined()
      expect(email.rules).toContain('presence')
      expect(email.rules).toContain('uniqueness')
    })

    it('extracts custom validators', () => {
      expect(result.custom_validators).toContain('check_email_domain')
    })

    // === SCOPES ===
    it('extracts all scopes', () => {
      expect(result.scopes).toContain('active')
      expect(result.scopes).toContain('admins')
      expect(result.scopes).toContain('recent')
      expect(result.scopes).toHaveLength(3)
    })

    // === ENUMS ===
    it('extracts enum with positional syntax', () => {
      expect(result.enums.role).toBeDefined()
      expect(result.enums.role.values).toContain('member')
      expect(result.enums.role.values).toContain('admin')
      expect(result.enums.role.values).toContain('owner')
    })

    it('extracts multiple enums', () => {
      expect(Object.keys(result.enums)).toHaveLength(2)
    })

    // === ENCRYPTION / NORMALIZATION / TOKEN ===
    it('extracts encrypts', () => {
      expect(result.encrypts).toContain('ssn')
    })

    it('extracts normalizes', () => {
      expect(result.normalizes.map((n) => n.attribute)).toContain('email')
    })

    it('extracts generates_token_for', () => {
      expect(result.token_generators).toContain('password_reset')
    })

    // === SECURE PASSWORD ===
    it('extracts has_secure_password', () => {
      expect(result.has_secure_password).toBe(true)
    })

    // === ATTACHMENTS ===
    it('extracts has_one_attached', () => {
      const avatar = result.attachments.find((a) => a.name === 'avatar')
      expect(avatar).toBeDefined()
      expect(avatar.type).toBe('has_one_attached')
    })

    it('extracts has_many_attached', () => {
      const docs = result.attachments.find((a) => a.name === 'documents')
      expect(docs).toBeDefined()
      expect(docs.type).toBe('has_many_attached')
    })

    // === RICH TEXT ===
    it('extracts has_rich_text', () => {
      expect(result.rich_text).toContain('bio')
    })

    // === STORE ACCESSORS ===
    it('extracts store_accessor', () => {
      expect(result.store_accessors.settings).toContain('theme')
      expect(result.store_accessors.settings).toContain('locale')
      expect(result.store_accessors.settings).toContain('notifications_enabled')
    })

    // === DELEGATIONS ===
    it('extracts delegate', () => {
      expect(result.delegations).toHaveLength(1)
      expect(result.delegations[0].to).toBe('organization')
    })

    // === CALLBACKS ===
    it('extracts all callbacks', () => {
      expect(result.callbacks).toHaveLength(3)
      expect(result.callbacks.map((c) => c.method)).toContain('set_defaults')
      expect(result.callbacks.map((c) => c.method)).toContain('sync_to_crm')
      expect(result.callbacks.map((c) => c.method)).toContain('normalize_phone')
    })

    it('extracts callback types', () => {
      const bc = result.callbacks.find((c) => c.method === 'set_defaults')
      expect(bc.type).toBe('before_create')
    })

    // === BROADCASTS ===
    it('extracts broadcasts_to', () => {
      expect(result.broadcasts).toBe(true)
    })

    // === DEVISE ===
    it('extracts devise modules', () => {
      expect(result.devise_modules).toContain('database_authenticatable')
      expect(result.devise_modules).toContain('registerable')
      expect(result.devise_modules).toContain('confirmable')
      expect(result.devise_modules).toContain('lockable')
      expect(result.devise_modules).toContain('omniauthable')
    })

    // === SEARCHABLE ===
    it('extracts searchkick', () => {
      expect(result.searchable.gem).toBe('searchkick')
    })

    // === TABLE NAME ===
    it('extracts custom table name', () => {
      expect(result.table_name).toBe('app_users')
    })

    // === FILE PATH ===
    it('stores file path', () => {
      expect(result.file).toBe('app/models/user.rb')
    })

    // === ABSTRACT / DEFAULT SCOPE ===
    it('is not abstract', () => {
      expect(result.abstract).toBe(false)
    })
  })

  // === EDGE CASES ===
  describe('minimal model (empty class body)', () => {
    const fixture = `class Tag < ApplicationRecord\nend`

    it('produces valid output with empty arrays', () => {
      const provider = mockProvider({ 'app/models/tag.rb': fixture })
      const result = extractModel(provider, 'app/models/tag.rb', 'Tag')
      expect(result.class).toBe('Tag')
      expect(result.superclass).toBe('ApplicationRecord')
      expect(result.associations).toEqual([])
      expect(result.validations).toEqual([])
      expect(result.scopes).toEqual([])
      expect(result.callbacks).toEqual([])
      expect(result.enums).toEqual({})
      expect(result.encrypts).toEqual([])
      expect(result.broadcasts).toBe(false)
      expect(result.has_secure_password).toBe(false)
    })
  })

  describe('concern file', () => {
    const fixture = `
module Authenticatable
  extend ActiveSupport::Concern

  included do
    has_secure_password
    validates :email, presence: true
    scope :active, -> { where(active: true) }
    before_save :downcase_email
  end

  def authenticate(password)
  end
end`

    it('identifies as concern type', () => {
      const provider = mockProvider({
        'app/models/concerns/authenticatable.rb': fixture,
      })
      const result = extractModel(
        provider,
        'app/models/concerns/authenticatable.rb',
        'Authenticatable',
      )
      expect(result.type).toBe('concern')
    })

    it('extracts concern patterns from included block', () => {
      const provider = mockProvider({
        'app/models/concerns/authenticatable.rb': fixture,
      })
      const result = extractModel(
        provider,
        'app/models/concerns/authenticatable.rb',
        'Authenticatable',
      )
      expect(result.has_secure_password).toBe(true)
      expect(result.scopes).toContain('active')
    })
  })

  describe('STI model', () => {
    const fixture = `
class AdminUser < User
  scope :super_admins, -> { where(super: true) }
end`

    it('detects non-ApplicationRecord superclass', () => {
      const provider = mockProvider({ 'app/models/admin_user.rb': fixture })
      const result = extractModel(
        provider,
        'app/models/admin_user.rb',
        'AdminUser',
      )
      expect(result.superclass).toBe('User')
    })
  })

  describe('abstract model', () => {
    const fixture = `
class ApplicationRecord < ActiveRecord::Base
  self.abstract_class = true
end`

    it('detects abstract class', () => {
      const provider = mockProvider({
        'app/models/application_record.rb': fixture,
      })
      const result = extractModel(provider, 'app/models/application_record.rb')
      expect(result.abstract).toBe(true)
    })
  })

  describe('multi-line declarations', () => {
    const fixture = `
class Order < ApplicationRecord
  has_many :line_items,
           dependent: :destroy,
           inverse_of: :order

  validates :total,
            presence: true,
            numericality: { greater_than: 0 }

  enum :status, {
    pending: 0,
    confirmed: 1,
    shipped: 2,
    delivered: 3,
    cancelled: 4
  }
end`

    it('handles multi-line has_many', () => {
      const provider = mockProvider({ 'app/models/order.rb': fixture })
      const result = extractModel(provider, 'app/models/order.rb', 'Order')
      const lineItems = result.associations.find((a) => a.name === 'line_items')
      expect(lineItems).toBeDefined()
    })

    it('handles multi-line enum', () => {
      const provider = mockProvider({ 'app/models/order.rb': fixture })
      const result = extractModel(provider, 'app/models/order.rb', 'Order')
      expect(result.enums.status).toBeDefined()
      expect(result.enums.status.values).toHaveLength(5)
    })
  })

  describe('soft delete models', () => {
    it('detects Discard', () => {
      const fixture = `
class Post < ApplicationRecord
  include Discard::Model
end`
      const result = extractModel(
        mockProvider({ 'app/models/post.rb': fixture }),
        'app/models/post.rb',
      )
      expect(result.soft_delete).toEqual({ strategy: 'discard' })
    })

    it('detects acts_as_paranoid', () => {
      const fixture = `
class Post < ApplicationRecord
  acts_as_paranoid
end`
      const result = extractModel(
        mockProvider({ 'app/models/post.rb': fixture }),
        'app/models/post.rb',
      )
      expect(result.soft_delete).toEqual({ strategy: 'paranoid' })
    })
  })

  describe('state machine models', () => {
    it('detects AASM', () => {
      const fixture = `
class Order < ApplicationRecord
  include AASM
  aasm do
    state :pending, initial: true
    state :confirmed
  end
end`
      const result = extractModel(
        mockProvider({ 'app/models/order.rb': fixture }),
        'app/models/order.rb',
      )
      expect(result.state_machine).toEqual({ gem: 'aasm', detected: true })
    })
  })

  describe('friendly_id model', () => {
    it('detects friendly_id', () => {
      const fixture = `
class Article < ApplicationRecord
  extend FriendlyId
  friendly_id :title, use: :slugged
end`
      const result = extractModel(
        mockProvider({ 'app/models/article.rb': fixture }),
        'app/models/article.rb',
      )
      expect(result.friendly_id).toEqual({ attribute: 'title' })
    })
  })

  describe('paper_trail model', () => {
    it('detects has_paper_trail', () => {
      const fixture = `
class Document < ApplicationRecord
  has_paper_trail
end`
      const result = extractModel(
        mockProvider({ 'app/models/document.rb': fixture }),
        'app/models/document.rb',
      )
      expect(result.paper_trail).toBe(true)
    })
  })

  describe('pg_search model', () => {
    it('detects pg_search with scopes', () => {
      const fixture = `
class Product < ApplicationRecord
  include PgSearch::Model
  pg_search_scope :search_by_name, against: :name
  pg_search_scope :search_full, against: [:name, :description]
end`
      const result = extractModel(
        mockProvider({ 'app/models/product.rb': fixture }),
        'app/models/product.rb',
      )
      expect(result.searchable.gem).toBe('pg_search')
      expect(result.searchable.scopes).toContain('search_by_name')
      expect(result.searchable.scopes).toContain('search_full')
    })
  })

  describe('polymorphic association', () => {
    it('detects polymorphic belongs_to', () => {
      const fixture = `
class Comment < ApplicationRecord
  belongs_to :commentable, polymorphic: true
end`
      const result = extractModel(
        mockProvider({ 'app/models/comment.rb': fixture }),
        'app/models/comment.rb',
      )
      const assoc = result.associations.find((a) => a.name === 'commentable')
      expect(assoc.polymorphic).toBe(true)
    })
  })

  describe('default scope', () => {
    it('detects default_scope', () => {
      const fixture = `
class Post < ApplicationRecord
  default_scope { where(published: true) }
end`
      const result = extractModel(
        mockProvider({ 'app/models/post.rb': fixture }),
        'app/models/post.rb',
      )
      expect(result.default_scope).toBe(true)
    })
  })

  describe('legacy enum syntax', () => {
    it('handles legacy hash enum syntax', () => {
      const fixture = `
class Post < ApplicationRecord
  enum status: { draft: 0, published: 1, archived: 2 }
end`
      const result = extractModel(
        mockProvider({ 'app/models/post.rb': fixture }),
        'app/models/post.rb',
      )
      expect(result.enums.status.syntax).toBe('legacy')
      expect(result.enums.status.values).toContain('draft')
      expect(result.enums.status.values).toContain('published')
    })
  })

  describe('missing file', () => {
    it('returns null for missing file', () => {
      const provider = mockProvider({})
      const result = extractModel(provider, 'app/models/missing.rb')
      expect(result).toBeNull()
    })
  })

  describe('method_line_ranges', () => {
    it('tracks line ranges for public methods', () => {
      const fixture = `
class User < ApplicationRecord
  def activate
    update(active: true)
  end

  def deactivate
    update(active: false)
  end
end`
      const result = extractModel(
        mockProvider({ 'app/models/user.rb': fixture }),
        'app/models/user.rb',
        'User',
      )
      expect(result.method_line_ranges.activate).toBeDefined()
      expect(result.method_line_ranges.deactivate).toBeDefined()
      expect(result.method_line_ranges.activate.start).toBeLessThan(
        result.method_line_ranges.deactivate.start,
      )
    })

    it('uses 1-indexed line numbers', () => {
      const fixture = `class User < ApplicationRecord
  def greet
    "hello"
  end
end`
      const result = extractModel(
        mockProvider({ 'app/models/user.rb': fixture }),
        'app/models/user.rb',
        'User',
      )
      expect(result.method_line_ranges.greet.start).toBe(2)
    })

    it('excludes methods after private keyword', () => {
      const fixture = `
class User < ApplicationRecord
  def public_method
    true
  end

  private

  def secret_method
    false
  end
end`
      const result = extractModel(
        mockProvider({ 'app/models/user.rb': fixture }),
        'app/models/user.rb',
        'User',
      )
      expect(result.method_line_ranges.public_method).toBeDefined()
      expect(result.method_line_ranges.secret_method).toBeUndefined()
    })

    it('excludes initialize method', () => {
      const fixture = `
class User < ApplicationRecord
  def initialize(attrs)
    super
  end

  def activate
    true
  end
end`
      const result = extractModel(
        mockProvider({ 'app/models/user.rb': fixture }),
        'app/models/user.rb',
        'User',
      )
      expect(result.method_line_ranges.initialize).toBeUndefined()
      expect(result.method_line_ranges.activate).toBeDefined()
    })

    it('returns empty object for model with no public methods', () => {
      const fixture = `
class User < ApplicationRecord
  private

  def secret
    true
  end
end`
      const result = extractModel(
        mockProvider({ 'app/models/user.rb': fixture }),
        'app/models/user.rb',
        'User',
      )
      expect(result.method_line_ranges).toEqual({})
    })
  })
})
