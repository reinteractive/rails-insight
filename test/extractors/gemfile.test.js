import { describe, it, expect } from 'vitest'
import { extractGemfile } from '../../src/extractors/gemfile.js'
import { readFileSync } from 'fs'
import { join } from 'path'

const FIXTURES = join(
  import.meta.dirname,
  '../fixtures/extractor-fixtures/gemfiles',
)

function fixtureProvider(gemfileName, lockName = null) {
  return {
    readFile(path) {
      if (path === 'Gemfile') {
        return readFileSync(join(FIXTURES, gemfileName), 'utf-8')
      }
      if (path === 'Gemfile.lock' && lockName) {
        return readFileSync(join(FIXTURES, lockName), 'utf-8')
      }
      return null
    },
  }
}

function emptyProvider() {
  return {
    readFile() {
      return null
    },
  }
}

describe('Gemfile Extractor', () => {
  describe('Rails 8 modern Gemfile', () => {
    const provider = fixtureProvider(
      'rails8-modern.gemfile',
      'rails8-modern.gemfile.lock',
    )
    const result = extractGemfile(provider)

    it('extracts source URL', () => {
      expect(result.source).toBe('https://rubygems.org')
    })

    it('extracts ruby version', () => {
      expect(result.rubyVersion).toBe('3.3.0')
    })

    it('extracts all gems', () => {
      // Count distinct gem entries from the Gemfile
      expect(result.gems.length).toBeGreaterThanOrEqual(40)
    })

    it('categorises core gems correctly', () => {
      const rails = result.gems.find((g) => g.name === 'rails')
      expect(rails.category).toBe('core')
      expect(rails.version).toBe('~> 8.0.0')
      expect(rails.resolved).toBe('8.0.0')

      const puma = result.gems.find((g) => g.name === 'puma')
      expect(puma.category).toBe('core')
    })

    it('categorises frontend gems correctly', () => {
      const importmap = result.gems.find((g) => g.name === 'importmap-rails')
      expect(importmap.category).toBe('frontend')

      const turbo = result.gems.find((g) => g.name === 'turbo-rails')
      expect(turbo.category).toBe('frontend')

      const stimulus = result.gems.find((g) => g.name === 'stimulus-rails')
      expect(stimulus.category).toBe('frontend')

      const tailwind = result.gems.find((g) => g.name === 'tailwindcss-rails')
      expect(tailwind.category).toBe('frontend')
    })

    it('categorises auth gems correctly', () => {
      expect(result.gems.find((g) => g.name === 'devise').category).toBe('auth')
      expect(result.gems.find((g) => g.name === 'omniauth').category).toBe(
        'auth',
      )
    })

    it('categorises authorization gems correctly', () => {
      expect(result.gems.find((g) => g.name === 'pundit').category).toBe(
        'authorization',
      )
    })

    it('categorises background gems correctly', () => {
      expect(result.gems.find((g) => g.name === 'solid_queue').category).toBe(
        'background',
      )
      expect(result.gems.find((g) => g.name === 'sidekiq').category).toBe(
        'background',
      )
      expect(
        result.gems.find((g) => g.name === 'mission_control-jobs').category,
      ).toBe('background')
    })

    it('categorises caching gems correctly', () => {
      expect(result.gems.find((g) => g.name === 'solid_cache').category).toBe(
        'caching',
      )
      expect(result.gems.find((g) => g.name === 'redis').category).toBe(
        'caching',
      )
    })

    it('categorises search gems correctly', () => {
      expect(result.gems.find((g) => g.name === 'pg_search').category).toBe(
        'search',
      )
    })

    it('categorises deployment gems correctly', () => {
      expect(result.gems.find((g) => g.name === 'kamal').category).toBe(
        'deployment',
      )
      expect(result.gems.find((g) => g.name === 'thruster').category).toBe(
        'deployment',
      )
    })

    it('categorises uploads gems correctly', () => {
      expect(result.gems.find((g) => g.name === 'aws-sdk-s3').category).toBe(
        'uploads',
      )
      expect(
        result.gems.find((g) => g.name === 'image_processing').category,
      ).toBe('uploads')
    })

    it('categorises monitoring gems correctly', () => {
      expect(result.gems.find((g) => g.name === 'sentry-rails').category).toBe(
        'monitoring',
      )
    })

    it('categorises admin gems correctly', () => {
      expect(result.gems.find((g) => g.name === 'avo').category).toBe('admin')
    })

    it('categorises API gems correctly', () => {
      expect(result.gems.find((g) => g.name === 'jbuilder').category).toBe(
        'api',
      )
      expect(result.gems.find((g) => g.name === 'rack-cors').category).toBe(
        'api',
      )
    })

    it('categorises payment gems correctly', () => {
      expect(result.gems.find((g) => g.name === 'pay').category).toBe(
        'payments',
      )
      expect(result.gems.find((g) => g.name === 'stripe').category).toBe(
        'payments',
      )
    })

    it('categorises PDF gems correctly', () => {
      expect(result.gems.find((g) => g.name === 'grover').category).toBe('pdf')
    })

    it('categorises i18n gems correctly', () => {
      expect(result.gems.find((g) => g.name === 'rails-i18n').category).toBe(
        'i18n',
      )
    })

    it('tracks group membership for development gems', () => {
      const webConsole = result.gems.find((g) => g.name === 'web-console')
      expect(webConsole.group).toBe('development')

      const spring = result.gems.find((g) => g.name === 'spring')
      expect(spring.group).toBe('development')
    })

    it('tracks group membership for test gems', () => {
      const capybara = result.gems.find((g) => g.name === 'capybara')
      expect(capybara.group).toBe('test')

      const simplecov = result.gems.find((g) => g.name === 'simplecov')
      expect(simplecov.group).toBe('test')
    })

    it('tracks group membership for development,test gems', () => {
      const debug = result.gems.find((g) => g.name === 'debug')
      expect(debug.group).toBe('development, test')

      const rspec = result.gems.find((g) => g.name === 'rspec-rails')
      expect(rspec.group).toBe('development, test')
    })

    it('tracks group membership for production gems', () => {
      const lograge = result.gems.find((g) => g.name === 'lograge')
      expect(lograge.group).toBe('production')
    })

    it('default group for top-level gems', () => {
      const rails = result.gems.find((g) => g.name === 'rails')
      expect(rails.group).toBe('default')
    })

    it('resolves versions from lockfile', () => {
      const pg = result.gems.find((g) => g.name === 'pg')
      expect(pg.version).toBe('~> 1.1')
      expect(pg.resolved).toBe('1.5.5')
    })

    it('builds byCategory index', () => {
      expect(result.byCategory.core).toBeDefined()
      expect(result.byCategory.core.length).toBeGreaterThanOrEqual(3)
      expect(result.byCategory.frontend.length).toBeGreaterThanOrEqual(4)
      expect(result.byCategory.auth.length).toBeGreaterThanOrEqual(2)
    })

    it('lists discovered groups', () => {
      expect(result.groups).toContain('development')
      expect(result.groups).toContain('test')
      expect(result.groups).toContain('production')
    })
  })

  describe('Rails 6 classic Gemfile', () => {
    const provider = fixtureProvider(
      'rails6-classic.gemfile',
      'rails6-classic.gemfile.lock',
    )
    const result = extractGemfile(provider)

    it('extracts ruby version', () => {
      expect(result.rubyVersion).toBe('2.7.8')
    })

    it('detects webpacker as frontend', () => {
      expect(result.gems.find((g) => g.name === 'webpacker').category).toBe(
        'frontend',
      )
    })

    it('detects cancancan as authorization', () => {
      expect(result.gems.find((g) => g.name === 'cancancan').category).toBe(
        'authorization',
      )
    })

    it('detects carrierwave as uploads', () => {
      expect(result.gems.find((g) => g.name === 'carrierwave').category).toBe(
        'uploads',
      )
    })

    it('resolves versions from lockfile', () => {
      const rails = result.gems.find((g) => g.name === 'rails')
      expect(rails.resolved).toBe('6.1.7')
    })

    it('categorises testing gems in test group', () => {
      const dbCleaner = result.gems.find((g) => g.name === 'database_cleaner')
      expect(dbCleaner.category).toBe('testing')
      expect(dbCleaner.group).toBe('test')
    })

    it('categorises dev_tools gems in development group', () => {
      const byebug = result.gems.find((g) => g.name === 'byebug')
      expect(byebug.category).toBe('dev_tools')
      expect(byebug.group).toBe('development, test')
    })
  })

  describe('edge cases', () => {
    it('handles empty Gemfile (source only)', () => {
      const provider = {
        readFile(path) {
          if (path === 'Gemfile') return 'source "https://rubygems.org"\n'
          return null
        },
      }
      const result = extractGemfile(provider)
      expect(result.gems).toEqual([])
      expect(result.source).toBe('https://rubygems.org')
      expect(result.rubyVersion).toBeNull()
      expect(result.groups).toEqual([])
      expect(result.byCategory).toEqual({})
    })

    it('handles missing Gemfile', () => {
      const result = extractGemfile(emptyProvider())
      expect(result.gems).toEqual([])
      expect(result.source).toBeNull()
      expect(result.rubyVersion).toBeNull()
      expect(result.byCategory).toEqual({})
    })

    it('handles Gemfile without lockfile', () => {
      const provider = {
        readFile(path) {
          if (path === 'Gemfile')
            return 'source "https://rubygems.org"\ngem "rails", "~> 7.0"\ngem "pg"\n'
          return null
        },
      }
      const result = extractGemfile(provider)
      expect(result.gems.length).toBe(2)
      expect(result.gems[0].resolved).toBeNull()
      expect(result.gems[1].resolved).toBeNull()
    })

    it('categorises unknown gems as "other"', () => {
      const provider = {
        readFile(path) {
          if (path === 'Gemfile') return 'gem "some_obscure_gem"\n'
          return null
        },
      }
      const result = extractGemfile(provider)
      expect(result.gems[0].category).toBe('other')
    })

    it('handles gem with no version constraint', () => {
      const provider = {
        readFile(path) {
          if (path === 'Gemfile') return 'gem "devise"\n'
          return null
        },
      }
      const result = extractGemfile(provider)
      expect(result.gems[0].name).toBe('devise')
      expect(result.gems[0].version).toBeNull()
    })

    it('handles lockfile with no matching gems', () => {
      const provider = {
        readFile(path) {
          if (path === 'Gemfile') return 'gem "rails"\n'
          if (path === 'Gemfile.lock')
            return 'GEM\n  remote: https://rubygems.org/\n  specs:\n    other_gem (1.0.0)\n\nPLATFORMS\n  ruby\n'
          return null
        },
      }
      const result = extractGemfile(provider)
      expect(result.gems[0].resolved).toBeNull()
    })

    it('ISSUE-05: parses gem with inline comment and no version', () => {
      const provider = {
        readFile(path) {
          if (path === 'Gemfile')
            return `gem 'pundit' # For access control\n`
          return null
        },
      }
      const result = extractGemfile(provider)
      expect(result.gems.some((g) => g.name === 'pundit')).toBe(true)
    })

    it('ISSUE-05: parses gem with version and inline comment', () => {
      const provider = {
        readFile(path) {
          if (path === 'Gemfile')
            return `gem 'rails', '~> 7.1' # Main framework\n`
          return null
        },
      }
      const result = extractGemfile(provider)
      const rails = result.gems.find((g) => g.name === 'rails')
      expect(rails).toBeDefined()
      expect(rails.version).toBe('~> 7.1')
    })

    it('ISSUE-05: parses gem with options and inline comment', () => {
      const provider = {
        readFile(path) {
          if (path === 'Gemfile')
            return `gem 'devise', github: 'heartcombo/devise' # Auth gem\n`
          return null
        },
      }
      const result = extractGemfile(provider)
      const devise = result.gems.find((g) => g.name === 'devise')
      expect(devise).toBeDefined()
    })
  })
})
