import { describe, it, expect } from 'vitest'
import { HELPER_PATTERNS } from '../../src/core/patterns.js'

describe('HELPER_PATTERNS', () => {
  describe('moduleDeclaration', () => {
    it('detects module declaration', () => {
      const m = 'module PostsHelper'.match(HELPER_PATTERNS.moduleDeclaration)
      expect(m[1]).toBe('PostsHelper')
    })

    it('detects namespaced module', () => {
      const m = 'module Admin::UsersHelper'.match(
        HELPER_PATTERNS.moduleDeclaration,
      )
      expect(m[1]).toBe('Admin::UsersHelper')
    })

    it('does not match non-helper module', () => {
      expect('module Authenticatable').not.toMatch(
        HELPER_PATTERNS.moduleDeclaration,
      )
    })
  })

  describe('methodDefinition', () => {
    it('detects public method', () => {
      const re = new RegExp(HELPER_PATTERNS.methodDefinition.source, 'gm')
      const m = re.exec('  def format_date(date)')
      expect(m[1]).toBe('format_date')
    })

    it('detects predicate method', () => {
      const re = new RegExp(HELPER_PATTERNS.methodDefinition.source, 'gm')
      const m = re.exec('  def admin?')
      expect(m[1]).toBe('admin?')
    })
  })

  describe('includeHelper', () => {
    it('detects included helper', () => {
      const re = new RegExp(HELPER_PATTERNS.includeHelper.source, 'g')
      const m = re.exec('  include ApplicationHelper')
      expect(m[1]).toBe('ApplicationHelper')
    })
  })
})
