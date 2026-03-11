import { describe, it, expect } from 'vitest'
import {
  AUTH_PATTERNS,
  AUTHORIZATION_PATTERNS,
} from '../../src/core/patterns.js'

describe('AUTH_PATTERNS', () => {
  describe('deviseModules', () => {
    it('matches devise declarations', () => {
      expect(
        '  devise :database_authenticatable, :registerable, :recoverable',
      ).toMatch(AUTH_PATTERNS.deviseModules)
    })
    it('extracts modules list', () => {
      const str =
        '  devise :database_authenticatable, :registerable, :recoverable'
      const m = str.match(AUTH_PATTERNS.deviseModules)
      expect(m).toBeTruthy()
      expect(m[1]).toContain('database_authenticatable')
    })
  })

  describe('deviseController', () => {
    it('matches Devise controller subclass', () => {
      expect(
        'class Users::SessionsController < Devise::SessionsController',
      ).toMatch(AUTH_PATTERNS.deviseController)
    })
  })

  describe('requireAuth', () => {
    it('matches require_authentication filter', () => {
      expect('  before_action :require_authentication').toMatch(
        AUTH_PATTERNS.requireAuth,
      )
    })
  })

  describe('currentAttributes', () => {
    it('matches Current < CurrentAttributes', () => {
      expect('class Current < ActiveSupport::CurrentAttributes').toMatch(
        AUTH_PATTERNS.currentAttributes,
      )
    })
  })

  describe('omniauthProvider', () => {
    it('matches provider declaration', () => {
      expect('  provider :google_oauth2, "CLIENT_ID"').toMatch(
        AUTH_PATTERNS.omniauthProvider,
      )
    })
  })

  describe('jwtEncode', () => {
    it('matches JWT.encode', () => {
      expect('  JWT.encode(payload, secret)').toMatch(AUTH_PATTERNS.jwtEncode)
    })
  })

  describe('jwtDecode', () => {
    it('matches JWT.decode', () => {
      expect('  JWT.decode(token, secret)').toMatch(AUTH_PATTERNS.jwtDecode)
    })
  })

  describe('hasSecurePassword', () => {
    it('matches has_secure_password', () => {
      expect('  has_secure_password').toMatch(AUTH_PATTERNS.hasSecurePassword)
    })
  })
})

describe('AUTHORIZATION_PATTERNS', () => {
  describe('policyClass', () => {
    it('matches ApplicationPolicy subclass', () => {
      expect('class PostPolicy < ApplicationPolicy').toMatch(
        AUTHORIZATION_PATTERNS.policyClass,
      )
    })
  })

  describe('authorize', () => {
    it('matches authorize call', () => {
      expect('  authorize @post').toMatch(AUTHORIZATION_PATTERNS.authorize)
    })
  })

  describe('policyScope', () => {
    it('matches policy_scope', () => {
      expect('  @posts = policy_scope(Post)').toMatch(
        AUTHORIZATION_PATTERNS.policyScope,
      )
    })
  })

  describe('abilityClass', () => {
    it('matches Ability class', () => {
      expect('class Ability').toMatch(AUTHORIZATION_PATTERNS.abilityClass)
    })
  })

  describe('canDef', () => {
    it('matches can definitions', () => {
      expect('  can :manage, Article').toMatch(AUTHORIZATION_PATTERNS.canDef)
    })
  })

  describe('cannotDef', () => {
    it('matches cannot definitions', () => {
      expect('  cannot :destroy, Article').toMatch(
        AUTHORIZATION_PATTERNS.cannotDef,
      )
    })
  })

  describe('authorizeAction', () => {
    it('matches authorize!', () => {
      expect('  authorize! :read, @article').toMatch(
        AUTHORIZATION_PATTERNS.authorizeAction,
      )
    })
  })

  describe('loadAndAuthorize', () => {
    it('matches load_and_authorize_resource', () => {
      expect('  load_and_authorize_resource').toMatch(
        AUTHORIZATION_PATTERNS.loadAndAuthorize,
      )
    })
  })

  describe('hasRole', () => {
    it('matches has_role call', () => {
      expect('  user.has_role :admin').toMatch(AUTHORIZATION_PATTERNS.hasRole)
    })
  })
})
