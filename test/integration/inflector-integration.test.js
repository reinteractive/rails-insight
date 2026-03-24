/**
 * Integration tests verifying inflector is wired into toTableName and classify.
 * @module inflector-integration.test
 */

import { describe, it, expect } from 'vitest'
import { toTableName } from '../../src/tools/handlers/helpers.js'
import { classify } from '../../src/core/graph.js'

describe('toTableName via inflector', () => {
  it('toTableName produces correct table for Person', () => {
    expect(toTableName('Person')).toBe('people')
  })

  it('toTableName produces correct table for Category', () => {
    expect(toTableName('Category')).toBe('categories')
  })

  it('toTableName produces correct table for Address', () => {
    expect(toTableName('Address')).toBe('addresses')
  })

  it('toTableName produces correct table for UserProfile', () => {
    expect(toTableName('UserProfile')).toBe('user_profiles')
  })
})

describe('graph classify via inflector', () => {
  it('graph classify singularizes association names', () => {
    expect(classify('comments')).toBe('Comment')
  })

  it('graph classify singularizes irregular names', () => {
    expect(classify('people')).toBe('Person')
  })

  it('graph classify handles snake_case plural', () => {
    expect(classify('user_profiles')).toBe('UserProfile')
  })

  it('graph classify handles already-singular', () => {
    expect(classify('user')).toBe('User')
  })
})
