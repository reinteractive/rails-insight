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

  // === REGRESSION TESTS FOR 5 BUGS ===

  describe('Bug 1: multi-line association options', () => {
    const fixture = `
class Review < ApplicationRecord
  belongs_to :resubmit_asker, class_name: 'User', foreign_key: 'resubmit_ask_by_id',
                              inverse_of: :resubmit_asked_reviews, optional: true
  belongs_to :resubmit_assigned_to,
             class_name: 'User',
             inverse_of: :resubmit_assigned_reviews,
             optional: true
end`

    it('captures options from the same line as the association', () => {
      const result = extractModel(
        mockProvider({ 'app/models/review.rb': fixture }),
        'app/models/review.rb',
        'Review',
      )
      const asker = result.associations.find((a) => a.name === 'resubmit_asker')
      expect(asker).toBeDefined()
      expect(asker.options).toContain('optional: true')
    })

    it('captures options from continuation lines', () => {
      const result = extractModel(
        mockProvider({ 'app/models/review.rb': fixture }),
        'app/models/review.rb',
        'Review',
      )
      const assigned = result.associations.find(
        (a) => a.name === 'resubmit_assigned_to',
      )
      expect(assigned).toBeDefined()
      expect(assigned.options).toContain('optional: true')
    })

    it('does not collapse two separate associations', () => {
      const result = extractModel(
        mockProvider({ 'app/models/review.rb': fixture }),
        'app/models/review.rb',
        'Review',
      )
      expect(result.associations).toHaveLength(2)
    })
  })

  describe('Bug 2: def self.method_name captured correctly', () => {
    const fixture = `
class MetricSection < ApplicationRecord
  def self.sort_by_metric_section(sections)
    sections.sort_by { |s| s.title }
  end

  def self.active_sections
    where(active: true)
  end

  def instance_method
    true
  end
end`

    it('captures self.method_name as the full method name', () => {
      const result = extractModel(
        mockProvider({ 'app/models/metric_section.rb': fixture }),
        'app/models/metric_section.rb',
        'MetricSection',
      )
      expect(result.public_methods).toContain('self.sort_by_metric_section')
      expect(result.public_methods).toContain('self.active_sections')
    })

    it('does not emit bare "self" as a method name', () => {
      const result = extractModel(
        mockProvider({ 'app/models/metric_section.rb': fixture }),
        'app/models/metric_section.rb',
        'MetricSection',
      )
      expect(result.public_methods).not.toContain('self')
    })

    it('still captures regular instance methods', () => {
      const result = extractModel(
        mockProvider({ 'app/models/metric_section.rb': fixture }),
        'app/models/metric_section.rb',
        'MetricSection',
      )
      expect(result.public_methods).toContain('instance_method')
    })
  })

  describe('Bug 3: multi-line and lambda scope bodies', () => {
    const fixture = `
class Asset < ApplicationRecord
  scope :argos_push_eligible, lambda {
    where(status: 'approved', argos_synced_at: nil)
      .joins(:curtailment_code)
      .where(metric_sections: { title: ['Condition', 'Supplier Type'] })
  }

  scope :active, -> { where(deactivated_at: nil) }

  scope :with_data, -> {
    includes(:metrics)
      .where.not(data: nil)
  }
end`

    it('extracts multi-line lambda { } scope body', () => {
      const result = extractModel(
        mockProvider({ 'app/models/asset.rb': fixture }),
        'app/models/asset.rb',
        'Asset',
      )
      expect(result.scopes).toContain('argos_push_eligible')
      expect(result.scope_queries.argos_push_eligible).toBeDefined()
      expect(result.scope_queries.argos_push_eligible).toContain('where')
    })

    it('extracts multi-line -> { } scope body', () => {
      const result = extractModel(
        mockProvider({ 'app/models/asset.rb': fixture }),
        'app/models/asset.rb',
        'Asset',
      )
      expect(result.scopes).toContain('with_data')
      expect(result.scope_queries.with_data).toBeDefined()
      expect(result.scope_queries.with_data).toContain('includes')
    })

    it('still extracts single-line scope bodies', () => {
      const result = extractModel(
        mockProvider({ 'app/models/asset.rb': fixture }),
        'app/models/asset.rb',
        'Asset',
      )
      expect(result.scopes).toContain('active')
      expect(result.scope_queries.active).toBeDefined()
      expect(result.scope_queries.active).toContain('deactivated_at')
    })

    it('handles nested braces in scope body without truncating', () => {
      const result = extractModel(
        mockProvider({ 'app/models/asset.rb': fixture }),
        'app/models/asset.rb',
        'Asset',
      )
      // Body should contain the nested hash with inner braces intact
      expect(result.scope_queries.argos_push_eligible).toContain(
        'metric_sections',
      )
    })
  })

  describe('Bug 4: accepts_nested_attributes_for', () => {
    const fixture = `
class Invoice < ApplicationRecord
  has_many :line_items
  accepts_nested_attributes_for :line_items, allow_destroy: true
  accepts_nested_attributes_for :address
end`

    it('extracts nested_attributes array', () => {
      const result = extractModel(
        mockProvider({ 'app/models/invoice.rb': fixture }),
        'app/models/invoice.rb',
        'Invoice',
      )
      expect(result.nested_attributes).toBeDefined()
      expect(result.nested_attributes.map((a) => a.name)).toContain(
        'line_items',
      )
      expect(result.nested_attributes.map((a) => a.name)).toContain('address')
    })

    it('captures options for nested_attributes entry', () => {
      const result = extractModel(
        mockProvider({ 'app/models/invoice.rb': fixture }),
        'app/models/invoice.rb',
        'Invoice',
      )
      const li = result.nested_attributes.find((a) => a.name === 'line_items')
      expect(li.options).toContain('allow_destroy: true')
    })

    it('sets options to null when no options given', () => {
      const result = extractModel(
        mockProvider({ 'app/models/invoice.rb': fixture }),
        'app/models/invoice.rb',
        'Invoice',
      )
      const addr = result.nested_attributes.find((a) => a.name === 'address')
      expect(addr.options).toBeNull()
    })

    it('returns empty nested_attributes when none present', () => {
      const result = extractModel(
        mockProvider({
          'app/models/invoice.rb': `class Order < ApplicationRecord\nend`,
        }),
        'app/models/invoice.rb',
        'Order',
      )
      expect(result.nested_attributes).toEqual([])
    })
  })

  describe('Bug 5: has_associated_audits detection', () => {
    const fixture = `
class Company < ApplicationRecord
  audited
  has_associated_audits
end`

    it('detects has_associated_audits as true', () => {
      const result = extractModel(
        mockProvider({ 'app/models/company.rb': fixture }),
        'app/models/company.rb',
        'Company',
      )
      expect(result.has_associated_audits).toBe(true)
    })

    it('audited remains true when has_associated_audits is also present', () => {
      const result = extractModel(
        mockProvider({ 'app/models/company.rb': fixture }),
        'app/models/company.rb',
        'Company',
      )
      expect(result.audited).toBe(true)
    })

    it('has_associated_audits is false when not present', () => {
      const result = extractModel(
        mockProvider({
          'app/models/post.rb': `class Post < ApplicationRecord\n  audited\nend`,
        }),
        'app/models/post.rb',
        'Post',
      )
      expect(result.has_associated_audits).toBe(false)
    })
  })

  describe('ISSUE-02: Devise module extraction', () => {
    it('extracts only devise modules, not subsequent model attributes', () => {
      const content = `class User < ApplicationRecord
  devise :database_authenticatable, :recoverable,
         :rememberable, :validatable

  enum role: { user: 0, admin: 1 }
  before_save :set_display_name

  has_many :reviews
end`
      const result = extractModel(
        mockProvider({ 'app/models/user.rb': content }),
        'app/models/user.rb',
        'User',
      )
      expect(result.devise_modules).toContain('database_authenticatable')
      expect(result.devise_modules).toContain('recoverable')
      expect(result.devise_modules).toContain('rememberable')
      expect(result.devise_modules).toContain('validatable')
      expect(result.devise_modules).not.toContain('role')
      expect(result.devise_modules).not.toContain('set_display_name')
      expect(result.devise_modules).not.toContain('reviews')
    })

    it('captures devise modules from multiple devise calls', () => {
      const content = `class User < ApplicationRecord
  devise :two_factor_authenticatable, :two_factor_backupable
  devise :recoverable, :rememberable, :trackable, :validatable
end`
      const result = extractModel(
        mockProvider({ 'app/models/user.rb': content }),
        'app/models/user.rb',
        'User',
      )
      expect(result.devise_modules).toContain('two_factor_authenticatable')
      expect(result.devise_modules).toContain('two_factor_backupable')
      expect(result.devise_modules).toContain('recoverable')
      expect(result.devise_modules).toContain('validatable')
      expect(result.devise_modules.length).toBeGreaterThanOrEqual(4)
    })
  })

  describe('ISSUE-C: old-style validators', () => {
    const content = `class Article < ApplicationRecord
  validates_presence_of :title
  validates_length_of :body, minimum: 10
  validates_uniqueness_of :slug
  validates :status, presence: true
end`

    it('extracts validates_presence_of', () => {
      const result = extractModel(
        mockProvider({ 'app/models/article.rb': content }),
        'app/models/article.rb',
        'Article',
      )
      expect(
        result.validations.some((v) => v.attributes.includes('title')),
      ).toBe(true)
    })

    it('extracts validates_length_of', () => {
      const result = extractModel(
        mockProvider({ 'app/models/article.rb': content }),
        'app/models/article.rb',
        'Article',
      )
      expect(
        result.validations.some((v) => v.attributes.includes('body')),
      ).toBe(true)
    })

    it('extracts validates_uniqueness_of', () => {
      const result = extractModel(
        mockProvider({ 'app/models/article.rb': content }),
        'app/models/article.rb',
        'Article',
      )
      expect(
        result.validations.some((v) => v.attributes.includes('slug')),
      ).toBe(true)
    })

    it('extracts all 4 validations including modern syntax', () => {
      const result = extractModel(
        mockProvider({ 'app/models/article.rb': content }),
        'app/models/article.rb',
        'Article',
      )
      expect(result.validations.length).toBe(4)
    })
  })

  describe('ISSUE-D: FriendlyId in extends array', () => {
    it('includes FriendlyId in extends array', () => {
      const content = `class Article < ApplicationRecord
  extend FriendlyId
  extend Enumerize
  friendly_id :title, use: :slugged
end`
      const result = extractModel(
        mockProvider({ 'app/models/article.rb': content }),
        'app/models/article.rb',
        'Article',
      )
      expect(result.extends).toContain('FriendlyId')
      expect(result.extends).toContain('Enumerize')
      expect(result.friendly_id).toBeDefined()
    })
  })

  describe('ISSUE-A: Anonymous block callbacks', () => {
    it('extracts anonymous block callbacks', () => {
      const content = `class Activity < ApplicationRecord
  before_validation { self.url.clear if self.url == "http://" }
  after_save :notify_admin
  before_create do
    self.token = SecureRandom.hex(10)
  end
end`
      const result = extractModel(
        mockProvider({ 'app/models/activity.rb': content }),
        'app/models/activity.rb',
        'Activity',
      )
      expect(result.callbacks).toHaveLength(3)

      const blockCb = result.callbacks.find(
        (c) => c.type === 'before_validation' && c.method === null,
      )
      expect(blockCb).toBeDefined()

      const namedCb = result.callbacks.find((c) => c.method === 'notify_admin')
      expect(namedCb).toBeDefined()

      const doCb = result.callbacks.find(
        (c) => c.type === 'before_create' && c.method === null,
      )
      expect(doCb).toBeDefined()
    })
  })

  describe('ISSUE-B: Multi-attribute old-style validators', () => {
    it('extracts validates_presence_of with multiple attributes', () => {
      const content = `class Article < ApplicationRecord
  validates_presence_of :title, :body
  validates_length_of :summary, maximum: 200
  validates_uniqueness_of :slug, :permalink
end`
      const result = extractModel(
        mockProvider({ 'app/models/article.rb': content }),
        'app/models/article.rb',
        'Article',
      )

      const presenceVal = result.validations.find((v) =>
        v.rules.includes('presence'),
      )
      expect(presenceVal.attributes).toContain('title')
      expect(presenceVal.attributes).toContain('body')

      const uniqueVal = result.validations.find((v) =>
        v.rules.includes('uniqueness'),
      )
      expect(uniqueVal.attributes).toContain('slug')
      expect(uniqueVal.attributes).toContain('permalink')
    })
  })

  describe('ISSUE-G: after_save_commit and compound commit callbacks', () => {
    it('extracts after_save_commit callbacks', () => {
      const content = `class User < ApplicationRecord
  after_save_commit :unassign_role!, :assign_role!
  after_create_commit :send_welcome
  after_destroy_commit :cleanup_data
end`
      const result = extractModel(
        mockProvider({ 'app/models/user.rb': content }),
        'app/models/user.rb',
        'User',
      )
      const commitCallbacks = result.callbacks.filter((c) =>
        c.type.includes('commit'),
      )
      expect(commitCallbacks.length).toBeGreaterThanOrEqual(4)
      expect(
        commitCallbacks.some(
          (c) =>
            c.type === 'after_save_commit' && c.method === 'unassign_role!',
        ),
      ).toBe(true)
      expect(
        commitCallbacks.some(
          (c) => c.type === 'after_save_commit' && c.method === 'assign_role!',
        ),
      ).toBe(true)
      expect(
        commitCallbacks.some(
          (c) =>
            c.type === 'after_create_commit' && c.method === 'send_welcome',
        ),
      ).toBe(true)
      expect(
        commitCallbacks.some(
          (c) =>
            c.type === 'after_destroy_commit' && c.method === 'cleanup_data',
        ),
      ).toBe(true)
    })
  })

  describe('ISSUE-J: multi-method callback expansion', () => {
    it('expands callbacks with multiple method symbols', () => {
      const content = `class User < ApplicationRecord
  after_save_commit :unassign_role!, :assign_role!
  before_save :normalize_name, :set_defaults, if: :active?
end`
      const result = extractModel(
        mockProvider({ 'app/models/user.rb': content }),
        'app/models/user.rb',
        'User',
      )

      const commitCbs = result.callbacks.filter(
        (c) => c.type === 'after_save_commit',
      )
      expect(commitCbs).toHaveLength(2)
      expect(commitCbs.map((c) => c.method)).toContain('unassign_role!')
      expect(commitCbs.map((c) => c.method)).toContain('assign_role!')

      const saveCbs = result.callbacks.filter((c) => c.type === 'before_save')
      expect(saveCbs).toHaveLength(2)
      expect(saveCbs.map((c) => c.method)).toContain('normalize_name')
      expect(saveCbs.map((c) => c.method)).toContain('set_defaults')
      // Both should carry the if: condition
      expect(saveCbs.every((c) => c.options && c.options.includes('if:'))).toBe(
        true,
      )
    })
  })

  describe('ISSUE-A: module wrapping detection for models', () => {
    it('detects FQN for module-wrapped model', () => {
      const content = `module Setups\n  class Contact < Setup\n    # no associations\n  end\nend`
      const result = extractModel(
        mockProvider({ 'app/models/setups/contact.rb': content }),
        'app/models/setups/contact.rb',
      )
      expect(result.class).toBe('Setups::Contact')
      expect(result.namespace).toBe('Setups')
    })

    it('returns short class name for unwrapped model', () => {
      const content = `class Contact < ApplicationRecord\n  has_many :offers\nend`
      const result = extractModel(
        mockProvider({ 'app/models/contact.rb': content }),
        'app/models/contact.rb',
      )
      expect(result.class).toBe('Contact')
      expect(result.namespace).toBeNull()
    })
  })

  describe('ISSUE-G: Devise omniauth provider not included as module', () => {
    it('does not include omniauth provider symbol as devise module', () => {
      const content = `class User < ApplicationRecord
  devise :database_authenticatable, :registerable, :recoverable,
         :rememberable, :validatable, :omniauthable,
         omniauth_providers: [:saml]
end`
      const result = extractModel(
        mockProvider({ 'app/models/user.rb': content }),
        'app/models/user.rb',
      )
      expect(result.devise_modules).toContain('omniauthable')
      expect(result.devise_modules).not.toContain('saml')
    })

    it('does not include provider on a single-line devise call', () => {
      const content = `class User < ApplicationRecord
  devise :database_authenticatable, :omniauthable, omniauth_providers: [:saml]
end`
      const result = extractModel(
        mockProvider({ 'app/models/user.rb': content }),
        'app/models/user.rb',
      )
      expect(result.devise_modules).toContain('omniauthable')
      expect(result.devise_modules).not.toContain('saml')
    })

    it('does not include multiple omniauth providers', () => {
      const content = `class User < ApplicationRecord
  devise :database_authenticatable, :omniauthable,
         omniauth_providers: [:google_oauth2, :saml]
end`
      const result = extractModel(
        mockProvider({ 'app/models/user.rb': content }),
        'app/models/user.rb',
      )
      expect(result.devise_modules).not.toContain('google_oauth2')
      expect(result.devise_modules).not.toContain('saml')
    })
  })
})
