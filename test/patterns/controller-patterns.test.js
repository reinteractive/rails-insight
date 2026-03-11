import { describe, it, expect } from 'vitest'
import { CONTROLLER_PATTERNS } from '../../src/core/patterns.js'

describe('CONTROLLER_PATTERNS', () => {
  describe('classDeclaration', () => {
    it('matches standard controller', () => {
      const m = 'class UsersController < ApplicationController'.match(
        CONTROLLER_PATTERNS.classDeclaration,
      )
      expect(m[1]).toBe('UsersController')
      expect(m[2]).toBe('ApplicationController')
    })
    it('matches namespaced controller', () => {
      const m = 'class Api::V2::ProjectsController < Api::BaseController'.match(
        CONTROLLER_PATTERNS.classDeclaration,
      )
      expect(m[1]).toBe('Api::V2::ProjectsController')
    })
    it('does not match model class', () => {
      expect('class User < ApplicationRecord').not.toMatch(
        CONTROLLER_PATTERNS.classDeclaration,
      )
    })
  })

  describe('filterType', () => {
    it('matches before_action', () => {
      const m = '  before_action :authenticate_user!'.match(
        CONTROLLER_PATTERNS.filterType,
      )
      expect(m[1]).toBe('before_action')
      expect(m[2]).toBe('authenticate_user!')
    })
    it('matches skip_before_action', () => {
      const m = '  skip_before_action :verify_authenticity_token'.match(
        CONTROLLER_PATTERNS.filterType,
      )
      expect(m[1]).toBe('skip_before_action')
    })
    it('matches with options', () => {
      const m = '  before_action :set_project, only: [:show, :edit]'.match(
        CONTROLLER_PATTERNS.filterType,
      )
      expect(m[2]).toBe('set_project')
      expect(m[3]).toContain('only')
    })
    it('does not match stray text', () => {
      expect('before_action_in_prose').not.toMatch(
        CONTROLLER_PATTERNS.filterType,
      )
    })
  })

  describe('visibility', () => {
    it('matches private', () => {
      expect('  private').toMatch(CONTROLLER_PATTERNS.visibility)
    })
    it('matches protected', () => {
      expect('  protected').toMatch(CONTROLLER_PATTERNS.visibility)
    })
    it('does not match private method def', () => {
      expect('  private_method').not.toMatch(CONTROLLER_PATTERNS.visibility)
    })
  })

  describe('strongParamsMethod', () => {
    it('matches _params method', () => {
      const m = '  def user_params'.match(
        CONTROLLER_PATTERNS.strongParamsMethod,
      )
      expect(m[1]).toBe('user_params')
    })
    it('does not match regular method', () => {
      expect('  def show').not.toMatch(CONTROLLER_PATTERNS.strongParamsMethod)
    })
  })

  describe('paramsRequire', () => {
    it('matches params.require.permit', () => {
      const m = 'params.require(:user).permit(:name, :email)'.match(
        CONTROLLER_PATTERNS.paramsRequire,
      )
      expect(m[1]).toBe('user')
      expect(m[2]).toContain('name')
    })
  })

  describe('rescueFrom', () => {
    it('matches rescue_from', () => {
      const m =
        '  rescue_from ActiveRecord::RecordNotFound, with: :not_found'.match(
          CONTROLLER_PATTERNS.rescueFrom,
        )
      expect(m[1]).toBe('ActiveRecord::RecordNotFound')
      expect(m[2]).toBe('not_found')
    })
    it('matches without handler', () => {
      const m = '  rescue_from StandardError'.match(
        CONTROLLER_PATTERNS.rescueFrom,
      )
      expect(m[1]).toBe('StandardError')
    })
  })

  describe('layout', () => {
    it('matches layout declaration', () => {
      const m = '  layout "admin"'.match(CONTROLLER_PATTERNS.layout)
      expect(m[1]).toBe('admin')
    })
  })

  describe('skipForgeryProtection', () => {
    it('matches skip_forgery_protection', () => {
      expect('  skip_forgery_protection').toMatch(
        CONTROLLER_PATTERNS.skipForgeryProtection,
      )
    })
  })

  describe('actionControllerLive', () => {
    it('matches ActionController::Live include', () => {
      expect('  include ActionController::Live').toMatch(
        CONTROLLER_PATTERNS.actionControllerLive,
      )
    })
  })
})
