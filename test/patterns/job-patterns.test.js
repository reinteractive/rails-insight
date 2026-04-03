import { describe, it, expect } from 'vitest'
import { JOB_PATTERNS } from '../../src/core/patterns.js'

describe('JOB_PATTERNS', () => {
  describe('classDeclaration', () => {
    it('captures a plain single-word superclass', () => {
      const m = 'class ImportJob < ApplicationJob'.match(
        JOB_PATTERNS.classDeclaration,
      )
      expect(m).not.toBeNull()
      expect(m[1]).toBe('ImportJob')
      expect(m[2]).toBe('ApplicationJob')
    })

    it('captures a namespaced superclass with one segment', () => {
      const m = 'class SyncJob < ActiveJob::Base'.match(
        JOB_PATTERNS.classDeclaration,
      )
      expect(m).not.toBeNull()
      expect(m[1]).toBe('SyncJob')
      expect(m[2]).toBe('ActiveJob::Base')
    })

    it('captures a deeply namespaced superclass (vendor engine base class)', () => {
      const m =
        'class SyncLoginsJob < StoreConnect::ScheduledJobBase'.match(
          JOB_PATTERNS.classDeclaration,
        )
      expect(m).not.toBeNull()
      expect(m[1]).toBe('SyncLoginsJob')
      expect(m[2]).toBe('StoreConnect::ScheduledJobBase')
    })

    it('captures a three-segment namespaced superclass', () => {
      const m =
        'class ReportJob < My::Engine::BaseJob'.match(
          JOB_PATTERNS.classDeclaration,
        )
      expect(m).not.toBeNull()
      expect(m[2]).toBe('My::Engine::BaseJob')
    })

    it('captures a namespaced job class itself', () => {
      const m =
        'class Salesforce::SyncToAccountJob < ApplicationJob'.match(
          JOB_PATTERNS.classDeclaration,
        )
      expect(m).not.toBeNull()
      expect(m[1]).toBe('Salesforce::SyncToAccountJob')
      expect(m[2]).toBe('ApplicationJob')
    })

    it('matches class with no superclass (group 2 is undefined)', () => {
      const m = 'class MyJob'.match(JOB_PATTERNS.classDeclaration)
      // No superclass means the overall match fails (< is required)
      expect(m).toBeNull()
    })
  })
})
