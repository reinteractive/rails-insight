import { describe, it, expect } from 'vitest'
import {
  extractClassDeclaration,
  extractModuleDeclaration,
  extractMethodNames,
  extractDSLCalls,
  extractIncludesExtends,
  extractMethodsByVisibility,
} from '../../src/utils/ruby-parser.js'
import { parseYaml } from '../../src/utils/yaml-parser.js'
import {
  estimateTokens,
  estimateTokensForObject,
} from '../../src/utils/token-counter.js'
import { safeReadFile } from '../../src/utils/file-reader.js'

describe('ruby-parser', () => {
  describe('extractClassDeclaration', () => {
    it('extracts class with superclass', () => {
      const result = extractClassDeclaration(
        'class User < ApplicationRecord\nend',
      )
      expect(result).toEqual({ name: 'User', superclass: 'ApplicationRecord' })
    })

    it('extracts namespaced class', () => {
      const result = extractClassDeclaration(
        'class Api::V2::ProjectsController < Api::BaseController',
      )
      expect(result).toEqual({
        name: 'Api::V2::ProjectsController',
        superclass: 'Api::BaseController',
      })
    })

    it('returns null for no class', () => {
      expect(extractClassDeclaration('# just a comment')).toBeNull()
    })

    it('extracts class without superclass', () => {
      const result = extractClassDeclaration('class Standalone\nend')
      expect(result).toEqual({ name: 'Standalone', superclass: null })
    })
  })

  describe('extractModuleDeclaration', () => {
    it('extracts module name', () => {
      expect(extractModuleDeclaration('module Searchable\nend')).toBe(
        'Searchable',
      )
    })

    it('extracts namespaced module', () => {
      expect(extractModuleDeclaration('module Api::V2\nend')).toBe('Api::V2')
    })

    it('returns null for no module', () => {
      expect(extractModuleDeclaration('class Foo; end')).toBeNull()
    })
  })

  describe('extractMethodNames', () => {
    it('extracts method names', () => {
      const content = `
        def index
        end
        def show
        end
        def create
        end
      `
      expect(extractMethodNames(content)).toEqual(['index', 'show', 'create'])
    })

    it('extracts methods with special chars', () => {
      const content = `
        def admin?
        end
        def save!
        end
        def name=
        end
      `
      expect(extractMethodNames(content)).toEqual(['admin?', 'save!', 'name='])
    })

    it('handles self methods', () => {
      const content = 'def self.find_by_name\nend'
      expect(extractMethodNames(content)).toEqual(['find_by_name'])
    })

    it('returns empty for no methods', () => {
      expect(extractMethodNames('# just a comment')).toEqual([])
    })
  })

  describe('extractDSLCalls', () => {
    it('extracts DSL calls matching a pattern', () => {
      const content = `
        has_many :projects
        has_many :teams, through: :memberships
        has_one :profile
      `
      const matches = extractDSLCalls(content, /has_many\s+:(\w+)/)
      expect(matches).toHaveLength(2)
      expect(matches[0][1]).toBe('projects')
      expect(matches[1][1]).toBe('teams')
    })
  })

  describe('extractIncludesExtends', () => {
    it('extracts includes and extends', () => {
      const content = `
        include Searchable
        include Authenticatable
        extend ClassMethods
      `
      const result = extractIncludesExtends(content)
      expect(result.includes).toEqual(['Searchable', 'Authenticatable'])
      expect(result.extends).toEqual(['ClassMethods'])
    })

    it('handles namespaced modules', () => {
      const content = 'include ActiveModel::Validations'
      const result = extractIncludesExtends(content)
      expect(result.includes).toEqual(['ActiveModel::Validations'])
    })
  })

  describe('extractMethodsByVisibility', () => {
    it('groups methods by visibility', () => {
      const content = `
class UsersController < ApplicationController
  def index
  end

  def show
  end

  private

  def set_user
  end

  def user_params
  end

  protected

  def check_admin
  end
end`
      const result = extractMethodsByVisibility(content)
      expect(result.public).toEqual(['index', 'show'])
      expect(result.private).toEqual(['set_user', 'user_params'])
      expect(result.protected).toEqual(['check_admin'])
    })
  })
})

describe('yaml-parser', () => {
  describe('parseYaml', () => {
    it('parses simple key-value pairs', () => {
      const yaml = 'adapter: postgresql\nhost: localhost\nport: 5432'
      const result = parseYaml(yaml)
      expect(result.adapter).toBe('postgresql')
      expect(result.host).toBe('localhost')
      expect(result.port).toBe(5432)
    })

    it('parses boolean values', () => {
      const yaml = 'ssl: true\ndebug: false'
      const result = parseYaml(yaml)
      expect(result.ssl).toBe(true)
      expect(result.debug).toBe(false)
    })

    it('parses null values', () => {
      const yaml = 'value: null\nother: ~'
      const result = parseYaml(yaml)
      expect(result.value).toBeNull()
      expect(result.other).toBeNull()
    })

    it('handles quoted strings', () => {
      const yaml = 'name: \'hello world\'\ntitle: "goodbye"'
      const result = parseYaml(yaml)
      expect(result.name).toBe('hello world')
      expect(result.title).toBe('goodbye')
    })

    it('skips comments', () => {
      const yaml = '# This is a comment\nkey: value'
      const result = parseYaml(yaml)
      expect(result.key).toBe('value')
    })

    it('returns empty object for empty input', () => {
      expect(parseYaml('')).toEqual({})
      expect(parseYaml(null)).toEqual({})
    })
  })
})

describe('token-counter', () => {
  describe('estimateTokens', () => {
    it('estimates 1 token per 4 chars', () => {
      expect(estimateTokens('abcd')).toBe(1)
      expect(estimateTokens('abcde')).toBe(2)
      expect(estimateTokens('abcdefgh')).toBe(2)
    })

    it('returns 0 for empty string', () => {
      expect(estimateTokens('')).toBe(0)
    })

    it('returns 0 for null', () => {
      expect(estimateTokens(null)).toBe(0)
    })
  })

  describe('estimateTokensForObject', () => {
    it('estimates tokens for an object', () => {
      const obj = { name: 'User', count: 5 }
      const json = JSON.stringify(obj)
      expect(estimateTokensForObject(obj)).toBe(Math.ceil(json.length / 4))
    })

    it('returns 0 for null', () => {
      expect(estimateTokensForObject(null)).toBe(0)
    })
  })
})

describe('file-reader', () => {
  describe('safeReadFile', () => {
    it('strips BOM from content', () => {
      const mockProvider = {
        readFile: () => '\uFEFFhello',
      }
      expect(safeReadFile(mockProvider, 'test.rb')).toBe('hello')
    })

    it('returns content without BOM unchanged', () => {
      const mockProvider = {
        readFile: () => 'hello',
      }
      expect(safeReadFile(mockProvider, 'test.rb')).toBe('hello')
    })

    it('returns null when file does not exist', () => {
      const mockProvider = {
        readFile: () => null,
      }
      expect(safeReadFile(mockProvider, 'nope.rb')).toBeNull()
    })
  })
})
