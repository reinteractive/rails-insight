import { describe, it, expect } from 'vitest'
import { WORKER_PATTERNS } from '../../src/core/patterns.js'

describe('WORKER_PATTERNS', () => {
  describe('includeSidekiq', () => {
    it('detects Sidekiq::Job include', () => {
      expect('  include Sidekiq::Job').toMatch(WORKER_PATTERNS.includeSidekiq)
    })

    it('detects legacy Sidekiq::Worker', () => {
      expect('  include Sidekiq::Worker').toMatch(
        WORKER_PATTERNS.includeSidekiq,
      )
    })

    it('does not match ActiveJob class', () => {
      expect('class MyJob < ApplicationJob').not.toMatch(
        WORKER_PATTERNS.includeSidekiq,
      )
    })
  })

  describe('sidekiqOptions', () => {
    it('extracts sidekiq_options', () => {
      const m = '  sidekiq_options queue: :low, retry: 3'.match(
        WORKER_PATTERNS.sidekiqOptions,
      )
      expect(m[1]).toContain('queue: :low')
      expect(m[1]).toContain('retry: 3')
    })
  })

  describe('queueOption', () => {
    it('extracts queue name with symbol', () => {
      const m = 'queue: :critical'.match(WORKER_PATTERNS.queueOption)
      expect(m[1]).toBe('critical')
    })

    it('extracts queue name with string', () => {
      const m = "queue: 'critical'".match(WORKER_PATTERNS.queueOption)
      expect(m[1]).toBe('critical')
    })
  })

  describe('performSignature', () => {
    it('extracts perform signature', () => {
      const m = '  def perform(user_id, options = {})'.match(
        WORKER_PATTERNS.performSignature,
      )
      expect(m[1]).toBe('user_id, options = {}')
    })
  })

  describe('classDeclaration', () => {
    it('detects class with superclass', () => {
      const m = 'class BulkIndexWorker < BaseWorker'.match(
        WORKER_PATTERNS.classDeclaration,
      )
      expect(m[1]).toBe('BulkIndexWorker')
      expect(m[2]).toBe('BaseWorker')
    })

    it('detects class without superclass', () => {
      const m = 'class BulkIndexWorker'.match(WORKER_PATTERNS.classDeclaration)
      expect(m[1]).toBe('BulkIndexWorker')
    })
  })
})
