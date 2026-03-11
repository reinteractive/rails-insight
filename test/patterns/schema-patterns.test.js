import { describe, it, expect } from 'vitest'
import { SCHEMA_PATTERNS } from '../../src/core/patterns.js'

describe('SCHEMA_PATTERNS', () => {
  describe('schemaVersion', () => {
    it('matches ActiveRecord::Schema version', () => {
      const m =
        'ActiveRecord::Schema[7.1].define(version: 2024_03_15_120000)'.match(
          SCHEMA_PATTERNS.schemaVersion,
        )
      expect(m[1]).toBe('2024_03_15_120000')
    })
    it('matches alt schema version', () => {
      const m = 'ActiveRecord::Schema.define(version: 2023_01_01_000000)'.match(
        SCHEMA_PATTERNS.schemaVersionAlt,
      )
      expect(m[1]).toBe('2023_01_01_000000')
    })
  })

  describe('createTable', () => {
    it('matches create_table', () => {
      const m = '  create_table "users" do |t|'.match(
        SCHEMA_PATTERNS.createTable,
      )
      expect(m[1]).toBe('users')
    })
    it('matches with options', () => {
      const m = '  create_table "users", id: :uuid do |t|'.match(
        SCHEMA_PATTERNS.createTable,
      )
      expect(m[1]).toBe('users')
      expect(m[2]).toContain('uuid')
    })
  })

  describe('column', () => {
    it('matches string column', () => {
      const m = '    t.string "email", null: false'.match(
        SCHEMA_PATTERNS.column,
      )
      expect(m[1]).toBe('string')
      expect(m[2]).toBe('email')
    })
    it('matches integer column', () => {
      const m = '    t.integer "age"'.match(SCHEMA_PATTERNS.column)
      expect(m[1]).toBe('integer')
      expect(m[2]).toBe('age')
    })
  })

  describe('references', () => {
    it('matches t.references', () => {
      const m = '    t.references :user, foreign_key: true'.match(
        SCHEMA_PATTERNS.references,
      )
      expect(m[1]).toBe('user')
    })
    it('matches t.belongs_to', () => {
      expect('    t.belongs_to :organization').toMatch(
        SCHEMA_PATTERNS.references,
      )
    })
  })

  describe('foreignKey', () => {
    it('matches add_foreign_key', () => {
      const m = '  add_foreign_key "posts", "users"'.match(
        SCHEMA_PATTERNS.foreignKey,
      )
      expect(m[1]).toBe('posts')
      expect(m[2]).toBe('users')
    })
  })

  describe('enableExtension', () => {
    it('matches enable_extension', () => {
      const m = '  enable_extension "pgcrypto"'.match(
        SCHEMA_PATTERNS.enableExtension,
      )
      expect(m[1]).toBe('pgcrypto')
    })
  })

  describe('createEnum', () => {
    it('matches create_enum', () => {
      const m = '  create_enum "user_role", ["member", "admin"]'.match(
        SCHEMA_PATTERNS.createEnum,
      )
      expect(m[1]).toBe('user_role')
    })
  })

  describe('idType', () => {
    it('matches id type', () => {
      const m = 'id: :uuid'.match(SCHEMA_PATTERNS.idType)
      expect(m[1]).toBe('uuid')
    })
  })

  describe('idFalse', () => {
    it('matches id: false', () => {
      expect('id: false').toMatch(SCHEMA_PATTERNS.idFalse)
    })
  })
})
