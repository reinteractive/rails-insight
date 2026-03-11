import { describe, it, expect } from 'vitest'
import { detectVersions } from '../../src/core/version-detector.js'

function createMockProvider(files = {}) {
  return {
    readFile(path) {
      return files[path] ?? null
    },
    readLines(path) {
      const c = files[path]
      return c ? c.split('\n') : []
    },
    fileExists(path) {
      return path in files
    },
    glob() {
      return []
    },
    listDir() {
      return []
    },
    getProjectRoot() {
      return '/mock'
    },
  }
}

const GEMFILE_RAILS8 = `source 'https://rubygems.org'

ruby '3.3.0'

gem 'rails', '~> 8.0.0'
gem 'propshaft'
gem 'importmap-rails'
gem 'turbo-rails'
gem 'stimulus-rails'
gem 'tailwindcss-rails'
gem 'solid_queue'
gem 'solid_cache'
gem 'solid_cable'
gem 'kamal'
gem 'puma'

group :development, :test do
  gem 'rspec-rails'
  gem 'factory_bot_rails'
end
`

const GEMFILE_LOCK_RAILS8 = `GEM
  remote: https://rubygems.org/
  specs:
    rails (8.0.1)
    propshaft (1.0.0)
    importmap-rails (2.0.0)
    turbo-rails (2.0.0)
    stimulus-rails (1.3.0)
    tailwindcss-rails (3.0.0)
    solid_queue (1.0.0)
    solid_cache (1.0.0)
    solid_cable (1.0.0)
    kamal (2.0.0)
    puma (6.4.0)
    rspec-rails (7.0.0)

RUBY VERSION
   ruby 3.3.0p0
`

const APP_CONFIG_RAILS8 = `require_relative "boot"
require "rails/all"
Bundler.require(*Rails.groups)

module MyApp
  class Application < Rails::Application
    config.load_defaults 8.0
  end
end
`

const GEMFILE_RAILS6 = `source 'https://rubygems.org'

ruby '2.7.6'

gem 'rails', '~> 6.1.0'
gem 'sprockets-rails'
gem 'webpacker'
gem 'sass-rails'
gem 'devise'
gem 'sidekiq'
gem 'redis'
gem 'capistrano'

group :test do
  gem 'minitest'
end
`

describe('Version Detector', () => {
  describe('detectVersions', () => {
    it('detects Rails version from Gemfile.lock', () => {
      const provider = createMockProvider({
        Gemfile: GEMFILE_RAILS8,
        'Gemfile.lock': GEMFILE_LOCK_RAILS8,
        'config/application.rb': APP_CONFIG_RAILS8,
      })
      const result = detectVersions(provider)
      expect(result.rails).toBe('8.0.1')
    })

    it('detects Rails version from Gemfile when no lock file', () => {
      const provider = createMockProvider({
        Gemfile: GEMFILE_RAILS8,
        'config/application.rb': APP_CONFIG_RAILS8,
      })
      const result = detectVersions(provider)
      expect(result.rails).toBe('8.0.0')
    })

    it('detects Ruby version from Gemfile.lock', () => {
      const provider = createMockProvider({
        Gemfile: GEMFILE_RAILS8,
        'Gemfile.lock': GEMFILE_LOCK_RAILS8,
        'config/application.rb': '',
      })
      const result = detectVersions(provider)
      expect(result.ruby).toBe('3.3.0')
    })

    it('detects Ruby version from Gemfile', () => {
      const provider = createMockProvider({
        Gemfile: GEMFILE_RAILS8,
        'config/application.rb': '',
      })
      const result = detectVersions(provider)
      expect(result.ruby).toBe('3.3.0')
    })

    it('detects Ruby version from .ruby-version', () => {
      const provider = createMockProvider({
        Gemfile: "gem 'rails'",
        '.ruby-version': '3.2.2',
        'config/application.rb': '',
      })
      const result = detectVersions(provider)
      expect(result.ruby).toBe('3.2.2')
    })

    it('detects load_defaults', () => {
      const provider = createMockProvider({
        Gemfile: GEMFILE_RAILS8,
        'config/application.rb': APP_CONFIG_RAILS8,
      })
      const result = detectVersions(provider)
      expect(result.loadDefaults).toBe('8.0')
    })

    it('detects Rails 8 framework stack', () => {
      const provider = createMockProvider({
        Gemfile: GEMFILE_RAILS8,
        'Gemfile.lock': GEMFILE_LOCK_RAILS8,
        'config/application.rb': APP_CONFIG_RAILS8,
      })
      const result = detectVersions(provider)
      expect(result.framework.assetPipeline).toBe('propshaft')
      expect(result.framework.jsBundling).toBe('importmap')
      expect(result.framework.cssBundling).toBe('tailwind')
      expect(result.framework.jobAdapter).toBe('solid_queue')
      expect(result.framework.cacheStore).toBe('solid_cache')
      expect(result.framework.cableAdapter).toBe('solid_cable')
      expect(result.framework.deploy).toBe('kamal')
      expect(result.framework.hotwire).toBe(true)
      expect(result.framework.testFramework).toBe('rspec')
    })

    it('detects Rails 6 framework stack', () => {
      const provider = createMockProvider({
        Gemfile: GEMFILE_RAILS6,
        'config/application.rb': '',
        test: 'exists',
      })
      const result = detectVersions(provider)
      expect(result.framework.assetPipeline).toBe('sprockets')
      expect(result.framework.jsBundling).toBe('webpacker')
      expect(result.framework.cssBundling).toBe('sass')
      expect(result.framework.auth).toBe('devise')
      expect(result.framework.jobAdapter).toBe('sidekiq')
      expect(result.framework.deploy).toBe('capistrano')
    })

    it('detects API-only app', () => {
      const provider = createMockProvider({
        Gemfile: "gem 'rails'",
        'config/application.rb': 'config.api_only = true',
      })
      const result = detectVersions(provider)
      expect(result.framework.apiOnly).toBe(true)
    })

    it('detects native Rails 8 auth', () => {
      const provider = createMockProvider({
        Gemfile: "gem 'rails'",
        'config/application.rb': '',
        'app/models/session.rb': 'class Session < ApplicationRecord; end',
        'app/models/current.rb':
          'class Current < ActiveSupport::CurrentAttributes; end',
      })
      const result = detectVersions(provider)
      expect(result.framework.auth).toBe('native')
    })

    it('parses gem entries', () => {
      const provider = createMockProvider({
        Gemfile: GEMFILE_RAILS8,
        'Gemfile.lock': GEMFILE_LOCK_RAILS8,
        'config/application.rb': '',
      })
      const result = detectVersions(provider)
      expect(result.gems['rails']).toBeDefined()
      expect(result.gems['propshaft']).toBeDefined()
      expect(result.gems['rails'].locked).toBe('8.0.1')
    })

    it('warns when Rails version cannot be determined', () => {
      const provider = createMockProvider({
        Gemfile: '# empty',
        'config/application.rb': '',
      })
      const result = detectVersions(provider)
      expect(result.warnings.some((w) => w.includes('Rails version'))).toBe(
        true,
      )
    })

    it('warns when Ruby version cannot be determined', () => {
      const provider = createMockProvider({
        Gemfile: "gem 'rails'",
        'config/application.rb': '',
      })
      const result = detectVersions(provider)
      expect(result.warnings.some((w) => w.includes('Ruby version'))).toBe(true)
    })

    it('handles completely missing files', () => {
      const provider = createMockProvider({})
      const result = detectVersions(provider)
      expect(result.rails).toBeNull()
      expect(result.ruby).toBeNull()
      expect(result.framework).toBeDefined()
    })
  })
})
