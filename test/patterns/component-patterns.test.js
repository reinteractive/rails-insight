import { describe, it, expect } from 'vitest'
import { COMPONENT_PATTERNS } from '../../src/core/patterns.js'

describe('COMPONENT_PATTERNS', () => {
  describe('classDeclaration', () => {
    it('matches component class', () => {
      const m = 'class Ui::ButtonComponent < ApplicationComponent'.match(
        COMPONENT_PATTERNS.classDeclaration,
      )
      expect(m[1]).toBe('Ui::ButtonComponent')
      expect(m[2]).toBe('ApplicationComponent')
    })
    it('matches ViewComponent::Base', () => {
      const m = 'class CardComponent < ViewComponent::Base'.match(
        COMPONENT_PATTERNS.classDeclaration,
      )
      expect(m[1]).toBe('CardComponent')
    })
    it('does not match non-component class', () => {
      expect('class User < ApplicationRecord').not.toMatch(
        COMPONENT_PATTERNS.classDeclaration,
      )
    })
  })

  describe('rendersOne', () => {
    it('matches renders_one', () => {
      const m = '  renders_one :icon'.match(COMPONENT_PATTERNS.rendersOne)
      expect(m[1]).toBe('icon')
    })
    it('matches with component type', () => {
      const m = '  renders_one :header, HeaderComponent'.match(
        COMPONENT_PATTERNS.rendersOne,
      )
      expect(m[1]).toBe('header')
    })
  })

  describe('rendersMany', () => {
    it('matches renders_many', () => {
      const m = '  renders_many :items'.match(COMPONENT_PATTERNS.rendersMany)
      expect(m[1]).toBe('items')
    })
  })

  describe('collectionParam', () => {
    it('matches with_collection_parameter', () => {
      const m = '  with_collection_parameter :user'.match(
        COMPONENT_PATTERNS.collectionParam,
      )
      expect(m[1]).toBe('user')
    })
  })

  describe('initialize', () => {
    it('matches initialize with params', () => {
      const m = 'def initialize(label:, variant: :primary)'.match(
        COMPONENT_PATTERNS.initialize,
      )
      expect(m[1]).toContain('label')
    })
  })
})
