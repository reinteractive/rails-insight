import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { LocalFSProvider } from '../../src/providers/local-fs.js'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const TMP = join(import.meta.dirname, '..', '__tmp_localfs_test__')

function setup() {
  // Create a small Rails-like structure
  const dirs = [
    'app/models',
    'app/models/concerns',
    'app/controllers',
    'app/controllers/api/v2',
    'app/views/users',
    'app/components/ui',
    'config',
    'config/routes',
    'db',
    'node_modules/some_pkg',
    'vendor/bundle',
    '.git/objects',
    'tmp',
    'log',
    'public/assets',
  ]
  for (const d of dirs) {
    mkdirSync(join(TMP, d), { recursive: true })
  }

  const files = {
    'app/models/user.rb': 'class User < ApplicationRecord; end',
    'app/models/project.rb': 'class Project < ApplicationRecord; end',
    'app/models/concerns/searchable.rb': 'module Searchable; end',
    'app/controllers/users_controller.rb':
      'class UsersController < ApplicationController; end',
    'app/controllers/api/v2/projects_controller.rb':
      'class Api::V2::ProjectsController; end',
    'app/views/users/index.html.erb': '<h1>Users</h1>',
    'app/components/ui/button_component.rb': 'class Ui::ButtonComponent; end',
    'config/routes.rb': 'Rails.application.routes.draw do; end',
    'config/routes/api.rb': '# API routes',
    'config/database.yml': 'development:\n  adapter: postgresql',
    'db/schema.rb': 'ActiveRecord::Schema.define do; end',
    Gemfile: "source 'https://rubygems.org'\ngem 'rails'",
    'node_modules/some_pkg/index.js': '// should be skipped',
  }
  for (const [path, content] of Object.entries(files)) {
    writeFileSync(join(TMP, path), content)
  }
}

describe('LocalFSProvider', () => {
  let provider

  beforeAll(() => {
    setup()
    provider = new LocalFSProvider(TMP)
  })

  afterAll(() => {
    rmSync(TMP, { recursive: true, force: true })
  })

  describe('getProjectRoot', () => {
    it('returns the project root path', () => {
      expect(provider.getProjectRoot()).toBe(TMP)
    })
  })

  describe('readFile', () => {
    it('reads an existing file', () => {
      const content = provider.readFile('Gemfile')
      expect(content).toContain("gem 'rails'")
    })

    it('returns null for nonexistent file', () => {
      expect(provider.readFile('nonexistent.txt')).toBeNull()
    })

    it('reads nested files', () => {
      const content = provider.readFile('app/models/user.rb')
      expect(content).toContain('class User')
    })

    it('blocks path traversal with ../', () => {
      expect(provider.readFile('../../../etc/passwd')).toBeNull()
    })

    it('blocks path traversal with encoded sequences', () => {
      expect(provider.readFile('app/../../etc/passwd')).toBeNull()
    })
  })

  describe('readLines', () => {
    it('returns array of lines', () => {
      const lines = provider.readLines('Gemfile')
      expect(lines).toHaveLength(2)
      expect(lines[0]).toBe("source 'https://rubygems.org'")
    })

    it('returns empty array for nonexistent file', () => {
      expect(provider.readLines('nope.rb')).toEqual([])
    })
  })

  describe('fileExists', () => {
    it('returns true for existing file', () => {
      expect(provider.fileExists('Gemfile')).toBe(true)
    })

    it('returns false for nonexistent file', () => {
      expect(provider.fileExists('nope.rb')).toBe(false)
    })

    it('returns true for directories', () => {
      expect(provider.fileExists('app/models')).toBe(true)
    })

    it('blocks path traversal with ../', () => {
      expect(provider.fileExists('../../../etc/passwd')).toBe(false)
    })
  })

  describe('glob', () => {
    it('matches *.rb in specific directory', () => {
      const files = provider.glob('app/models/*.rb')
      expect(files).toContain('app/models/user.rb')
      expect(files).toContain('app/models/project.rb')
      expect(files).not.toContain('app/models/concerns/searchable.rb')
    })

    it('matches **/*.rb recursively', () => {
      const files = provider.glob('app/models/**/*.rb')
      expect(files).toContain('app/models/user.rb')
      expect(files).toContain('app/models/project.rb')
      expect(files).toContain('app/models/concerns/searchable.rb')
    })

    it('matches controllers recursively', () => {
      const files = provider.glob('app/controllers/**/*.rb')
      expect(files).toContain('app/controllers/users_controller.rb')
      expect(files).toContain('app/controllers/api/v2/projects_controller.rb')
    })

    it('skips node_modules', () => {
      const files = provider.glob('**/*.js')
      expect(files).not.toContain('node_modules/some_pkg/index.js')
    })

    it('skips vendor/bundle', () => {
      const files = provider.glob('**/*.rb')
      // No vendor/bundle files should appear
      for (const f of files) {
        expect(f).not.toMatch(/^vendor\//)
      }
    })

    it('handles specific file match', () => {
      const files = provider.glob('config/routes.rb')
      expect(files).toEqual(['config/routes.rb'])
    })

    it('handles brace expansion', () => {
      const files = provider.glob('config/*.{rb,yml}')
      expect(files).toContain('config/routes.rb')
      expect(files).toContain('config/database.yml')
    })

    it('returns empty array for no matches', () => {
      expect(provider.glob('app/**/*.py')).toEqual([])
    })
  })

  describe('listDir', () => {
    it('lists directory contents', () => {
      const entries = provider.listDir('app/models')
      expect(entries).toContain('user.rb')
      expect(entries).toContain('project.rb')
      expect(entries).toContain('concerns')
    })

    it('returns sorted entries', () => {
      const entries = provider.listDir('app/models')
      const sorted = [...entries].sort()
      expect(entries).toEqual(sorted)
    })

    it('returns empty array for nonexistent dir', () => {
      expect(provider.listDir('nonexistent')).toEqual([])
    })

    it('blocks path traversal with ../', () => {
      expect(provider.listDir('../../../etc')).toEqual([])
    })
  })
})
