import { describe, it, expect } from 'vitest'
import { MODEL_PATTERNS } from '../../src/core/patterns.js'

describe('MODEL_PATTERNS', () => {
  describe('classDeclaration', () => {
    it('matches standard class', () => {
      expect('class User < ApplicationRecord').toMatch(
        MODEL_PATTERNS.classDeclaration,
      )
    })
    it('matches namespaced class', () => {
      const m = 'class Admin::User < ApplicationRecord'.match(
        MODEL_PATTERNS.classDeclaration,
      )
      expect(m[1]).toBe('Admin::User')
      expect(m[2]).toBe('ApplicationRecord')
    })
    it('does not match module', () => {
      expect('module Searchable').not.toMatch(MODEL_PATTERNS.classDeclaration)
    })
  })

  describe('hasMany', () => {
    it('matches basic has_many', () => {
      const m = '  has_many :projects'.match(MODEL_PATTERNS.hasMany)
      expect(m[1]).toBe('projects')
    })
    it('matches has_many with options', () => {
      const m = '  has_many :projects, dependent: :destroy'.match(
        MODEL_PATTERNS.hasMany,
      )
      expect(m[1]).toBe('projects')
      expect(m[2]).toContain('dependent')
    })
    it('does not match has_one', () => {
      expect('  has_one :profile').not.toMatch(MODEL_PATTERNS.hasMany)
    })
  })

  describe('belongsTo', () => {
    it('matches basic belongs_to', () => {
      const m = '  belongs_to :organization'.match(MODEL_PATTERNS.belongsTo)
      expect(m[1]).toBe('organization')
    })
    it('matches with options', () => {
      const m = '  belongs_to :user, optional: true'.match(
        MODEL_PATTERNS.belongsTo,
      )
      expect(m[1]).toBe('user')
    })
    it('does not match has_many', () => {
      expect('  has_many :items').not.toMatch(MODEL_PATTERNS.belongsTo)
    })
  })

  describe('hasOne', () => {
    it('matches basic has_one', () => {
      const m = '  has_one :profile'.match(MODEL_PATTERNS.hasOne)
      expect(m[1]).toBe('profile')
    })
    it('matches with dependent destroy', () => {
      const m = '  has_one :profile, dependent: :destroy'.match(
        MODEL_PATTERNS.hasOne,
      )
      expect(m[1]).toBe('profile')
    })
    it('does not match has_many', () => {
      expect('  has_many :items').not.toMatch(MODEL_PATTERNS.hasOne)
    })
  })

  describe('habtm', () => {
    it('matches has_and_belongs_to_many', () => {
      const m = '  has_and_belongs_to_many :roles'.match(MODEL_PATTERNS.habtm)
      expect(m[1]).toBe('roles')
    })
    it('does not match has_many', () => {
      expect('  has_many :roles').not.toMatch(MODEL_PATTERNS.habtm)
    })
  })

  describe('through', () => {
    it('extracts through association', () => {
      const m = 'through: :memberships'.match(MODEL_PATTERNS.through)
      expect(m[1]).toBe('memberships')
    })
    it('does not match unrelated text', () => {
      expect('through_the_looking_glass').not.toMatch(MODEL_PATTERNS.through)
    })
  })

  describe('polymorphic', () => {
    it('matches polymorphic: true', () => {
      expect('polymorphic: true').toMatch(MODEL_PATTERNS.polymorphic)
    })
    it('does not match polymorphic: false', () => {
      expect('polymorphic: false').not.toMatch(MODEL_PATTERNS.polymorphic)
    })
  })

  describe('validates', () => {
    it('matches validates with presence', () => {
      const m = '  validates :email, presence: true'.match(
        MODEL_PATTERNS.validates,
      )
      expect(m[1]).toBe('email')
    })
    it('matches validate (custom)', () => {
      expect('  validate :check_email_domain').toMatch(MODEL_PATTERNS.validate)
    })
    it('does not match validation in comment', () => {
      expect('# validates something').not.toMatch(MODEL_PATTERNS.validates)
    })
  })

  describe('scope', () => {
    it('matches lambda scope', () => {
      const m = '  scope :active, -> { where(deactivated_at: nil) }'.match(
        MODEL_PATTERNS.scope,
      )
      expect(m[1]).toBe('active')
    })
    it('matches proc scope', () => {
      expect('  scope :recent, proc { order(created_at: :desc) }').toMatch(
        MODEL_PATTERNS.scope,
      )
    })
    it('does not match scope in string', () => {
      expect('"scope :foo"').not.toMatch(MODEL_PATTERNS.scope)
    })
  })

  describe('enumPositional', () => {
    it('matches Rails 7+ positional enum', () => {
      const m = '  enum :role, { member: 0, admin: 1 }'.match(
        MODEL_PATTERNS.enumPositional,
      )
      expect(m[1]).toBe('role')
      expect(m[2]).toContain('member')
    })
    it('does not match legacy syntax', () => {
      expect('  enum role: { member: 0 }').not.toMatch(
        MODEL_PATTERNS.enumPositional,
      )
    })
  })

  describe('enumLegacy', () => {
    it('matches legacy hash enum', () => {
      const m = '  enum status: { pending: 0, active: 1 }'.match(
        MODEL_PATTERNS.enumLegacy,
      )
      expect(m[1]).toBe('status')
    })
    it('does not match positional syntax', () => {
      expect('  enum :role, { member: 0 }').not.toMatch(
        MODEL_PATTERNS.enumLegacy,
      )
    })
  })

  describe('callbackType', () => {
    it('matches before_save', () => {
      const m = '  before_save :normalize_email'.match(
        MODEL_PATTERNS.callbackType,
      )
      expect(m[1]).toBe('before_save')
      expect(m[2]).toBe('normalize_email')
    })
    it('matches after_commit with options', () => {
      const m = '  after_commit :sync_to_crm, on: :create'.match(
        MODEL_PATTERNS.callbackType,
      )
      expect(m[1]).toBe('after_commit')
      expect(m[2]).toBe('sync_to_crm')
    })
    it('does not match random text', () => {
      expect('before_sunrise').not.toMatch(MODEL_PATTERNS.callbackType)
    })
  })

  describe('delegate', () => {
    it('matches delegate to', () => {
      const m = '  delegate :name, :address, to: :organization'.match(
        MODEL_PATTERNS.delegate,
      )
      expect(m[1]).toContain('name')
      expect(m[2]).toBe('organization')
    })
    it('does not match delegation in prose', () => {
      expect('# delegate to another').not.toMatch(MODEL_PATTERNS.delegate)
    })
  })

  describe('encrypts', () => {
    it('matches encrypts directive', () => {
      const m = '  encrypts :ssn'.match(MODEL_PATTERNS.encrypts)
      expect(m[1]).toContain('ssn')
    })
    it('does not match encrypted in prose', () => {
      expect('# encrypts nothing').not.toMatch(MODEL_PATTERNS.encrypts)
    })
  })

  describe('normalizes', () => {
    it('matches normalizes directive', () => {
      expect('  normalizes :email, with: -> (e) { e.strip.downcase }').toMatch(
        MODEL_PATTERNS.normalizes,
      )
    })
  })

  describe('generatesTokenFor', () => {
    it('matches generates_token_for', () => {
      const m = '  generates_token_for :password_reset'.match(
        MODEL_PATTERNS.generatesTokenFor,
      )
      expect(m[1]).toBe('password_reset')
    })
  })

  describe('hasSecurePassword', () => {
    it('matches has_secure_password', () => {
      expect('  has_secure_password').toMatch(MODEL_PATTERNS.hasSecurePassword)
    })
  })

  describe('hasOneAttached', () => {
    it('matches has_one_attached', () => {
      const m = '  has_one_attached :avatar'.match(
        MODEL_PATTERNS.hasOneAttached,
      )
      expect(m[1]).toBe('avatar')
    })
  })

  describe('hasManyAttached', () => {
    it('matches has_many_attached', () => {
      const m = '  has_many_attached :documents'.match(
        MODEL_PATTERNS.hasManyAttached,
      )
      expect(m[1]).toBe('documents')
    })
  })

  describe('hasRichText', () => {
    it('matches has_rich_text', () => {
      const m = '  has_rich_text :bio'.match(MODEL_PATTERNS.hasRichText)
      expect(m[1]).toBe('bio')
    })
  })

  describe('storeAccessor', () => {
    it('matches store_accessor', () => {
      const m = '  store_accessor :settings, :theme, :locale'.match(
        MODEL_PATTERNS.storeAccessor,
      )
      expect(m[1]).toBe('settings')
    })
  })

  describe('tableName', () => {
    it('matches table_name override', () => {
      const m = "  self.table_name = 'app_users'".match(
        MODEL_PATTERNS.tableName,
      )
      expect(m[1]).toBe('app_users')
    })
  })

  describe('defaultScope', () => {
    it('matches default_scope', () => {
      expect('  default_scope { where(active: true) }').toMatch(
        MODEL_PATTERNS.defaultScope,
      )
    })
  })

  describe('abstractClass', () => {
    it('matches abstract_class = true', () => {
      expect('  self.abstract_class = true').toMatch(
        MODEL_PATTERNS.abstractClass,
      )
    })
  })

  describe('devise', () => {
    it('matches devise declaration', () => {
      const m =
        '  devise :database_authenticatable, :registerable, :recoverable'.match(
          MODEL_PATTERNS.devise,
        )
      expect(m[1]).toContain('database_authenticatable')
    })
  })

  describe('searchkick', () => {
    it('matches searchkick', () => {
      expect('  searchkick').toMatch(MODEL_PATTERNS.searchkick)
    })
  })

  describe('broadcastsTo', () => {
    it('matches broadcasts_to', () => {
      expect('  broadcasts_to :conversation').toMatch(
        MODEL_PATTERNS.broadcastsTo,
      )
    })
  })

  describe('broadcasts', () => {
    it('matches broadcasts', () => {
      expect('  broadcasts').toMatch(MODEL_PATTERNS.broadcasts)
    })
  })

  describe('hasPaperTrail', () => {
    it('matches has_paper_trail', () => {
      expect('  has_paper_trail').toMatch(MODEL_PATTERNS.hasPaperTrail)
    })
  })

  describe('friendlyId', () => {
    it('matches friendly_id', () => {
      const m = '  friendly_id :name'.match(MODEL_PATTERNS.friendlyId)
      expect(m[1]).toBe('name')
    })
  })
})
