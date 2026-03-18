import { describe, it, expect } from 'vitest'
import { extractTier2 } from '../../src/extractors/tier2.js'

function mockProvider(files) {
  return {
    readFile(path) {
      return files[path] || null
    },
    fileExists(path) {
      return path in files
    },
  }
}

describe('Tier 2 Extractor', () => {
  describe('security', () => {
    it('detects security settings', () => {
      const provider = mockProvider({
        'config/initializers/content_security_policy.rb': 'policy',
        'config/initializers/cors.rb': 'cors',
        'config/environments/production.rb': 'config.force_ssl = true',
        'config/initializers/filter_parameter_logging.rb': 'filter',
        'config/credentials.yml.enc': 'encrypted',
      })
      const gems = { brakeman: {}, 'bundler-audit': {} }
      const result = extractTier2(provider, [], { gems })
      expect(result.security.csp).toBe(true)
      expect(result.security.cors).toBe(true)
      expect(result.security.force_ssl).toBe(true)
      expect(result.security.filter_parameters).toBe(true)
      expect(result.security.credentials_encrypted).toBe(true)
      expect(result.security.brakeman).toBe(true)
      expect(result.security.bundler_audit).toBe(true)
    })
  })

  describe('testing', () => {
    it('detects rspec framework', () => {
      const result = extractTier2(mockProvider({}), [], {
        gems: {
          'rspec-rails': {},
          factory_bot_rails: {},
          simplecov: {},
          webmock: {},
          vcr: {},
        },
      })
      expect(result.testing.framework).toBe('rspec')
      expect(result.testing.factories).toBe(true)
      expect(result.testing.coverage).toBe(true)
      expect(result.testing.mocking).toContain('webmock')
      expect(result.testing.mocking).toContain('vcr')
    })

    it('detects minitest framework', () => {
      const entries = [
        { path: 'test/models/user_test.rb', category: 'testing' },
      ]
      const result = extractTier2(mockProvider({}), entries, { gems: {} })
      expect(result.testing.framework).toBe('minitest')
    })
  })

  describe('code quality', () => {
    it('detects rubocop with omakase preset', () => {
      const provider = mockProvider({ '.rubocop.yml': 'AllCops:' })
      const result = extractTier2(provider, [], {
        gems: { 'rubocop-rails-omakase': {} },
      })
      expect(result.code_quality.rubocop).toBe(true)
      expect(result.code_quality.rubocop_preset).toBe('omakase')
    })

    it('detects eslint', () => {
      const provider = mockProvider({ '.eslintrc.json': '{}' })
      const result = extractTier2(provider, [], { gems: {} })
      expect(result.code_quality.eslint).toBe(true)
    })
  })

  describe('deployment', () => {
    it('detects kamal and docker', () => {
      const provider = mockProvider({
        'config/deploy.yml': 'deploy',
        Dockerfile: 'FROM ruby',
      })
      const result = extractTier2(provider, [], { gems: {} })
      expect(result.deployment.kamal).toBe(true)
      expect(result.deployment.docker).toBe(true)
    })

    it('detects heroku', () => {
      const provider = mockProvider({ Procfile: 'web: rails s' })
      const result = extractTier2(provider, [], { gems: {} })
      expect(result.deployment.heroku).toBe(true)
    })
  })

  describe('search', () => {
    it('detects searchkick', () => {
      const result = extractTier2(mockProvider({}), [], {
        gems: { searchkick: {} },
      })
      expect(result.search.engine).toBe('searchkick')
    })

    it('detects pg_search', () => {
      const result = extractTier2(mockProvider({}), [], {
        gems: { pg_search: {} },
      })
      expect(result.search.engine).toBe('pg_search')
    })
  })

  describe('payments', () => {
    it('detects pay gem', () => {
      const result = extractTier2(mockProvider({}), [], { gems: { pay: {} } })
      expect(result.payments.provider).toBe('pay')
    })

    it('detects stripe', () => {
      const result = extractTier2(mockProvider({}), [], {
        gems: { stripe: {} },
      })
      expect(result.payments.provider).toBe('stripe')
    })
  })

  describe('admin', () => {
    it('detects activeadmin', () => {
      const result = extractTier2(mockProvider({}), [], {
        gems: { activeadmin: {} },
      })
      expect(result.admin.framework).toBe('activeadmin')
    })

    it('detects custom admin', () => {
      const entries = [
        {
          path: 'app/controllers/admin/dashboard_controller.rb',
          category: 'controller',
        },
      ]
      const result = extractTier2(mockProvider({}), entries, { gems: {} })
      expect(result.admin.framework).toBe('custom')
    })
  })

  describe('design patterns', () => {
    it('counts pattern directories', () => {
      const entries = [
        { path: 'app/services/foo.rb', category: 'service' },
        { path: 'app/services/bar.rb', category: 'service' },
        { path: 'app/forms/baz.rb', category: 'form' },
        { path: 'app/queries/q.rb', category: 'query' },
      ]
      const result = extractTier2(mockProvider({}), entries, { gems: {} })
      expect(result.design_patterns.services).toBe(2)
      expect(result.design_patterns.forms).toBe(1)
      expect(result.design_patterns.queries).toBe(1)
    })
  })

  describe('state machines', () => {
    it('detects aasm', () => {
      const result = extractTier2(mockProvider({}), [], { gems: { aasm: {} } })
      expect(result.state_machines.library).toBe('aasm')
    })
  })

  describe('i18n', () => {
    it('extracts locales from config/locales', () => {
      const provider = mockProvider({
        'config/application.rb': 'config.i18n.default_locale = :ja',
      })
      const entries = [
        { path: 'config/locales/en.yml', category: 'i18n' },
        { path: 'config/locales/ja.yml', category: 'i18n' },
        { path: 'config/locales/devise.en.yml', category: 'i18n' },
      ]
      const result = extractTier2(provider, entries, { gems: {} })
      expect(result.i18n.default_locale).toBe('ja')
      expect(result.i18n.locales).toContain('en')
      expect(result.i18n.locales).toContain('ja')
    })
  })

  describe('credentials', () => {
    it('detects encrypted credentials', () => {
      const provider = mockProvider({
        'config/credentials.yml.enc': 'enc',
        'config/credentials/production.yml.enc': 'enc',
        'config/secrets.yml': 'secrets',
      })
      const result = extractTier2(provider, [], {
        gems: { 'dotenv-rails': {} },
      })
      expect(result.credentials.encrypted).toBe(true)
      expect(result.credentials.per_environment).toBe(true)
      expect(result.credentials.dotenv).toBe(true)
      expect(result.credentials.legacy_secrets).toBe(true)
    })
  })

  describe('http clients', () => {
    it('detects faraday and httparty', () => {
      const result = extractTier2(mockProvider({}), [], {
        gems: { faraday: {}, httparty: {} },
      })
      expect(result.http_clients.clients).toContain('faraday')
      expect(result.http_clients.clients).toContain('httparty')
    })
  })

  describe('performance and database tooling', () => {
    it('detects tools from gems', () => {
      const result = extractTier2(mockProvider({}), [], {
        gems: {
          bullet: {},
          'rack-mini-profiler': {},
          annotate: {},
          strong_migrations: {},
        },
      })
      expect(result.performance.tools).toContain('bullet')
      expect(result.performance.tools).toContain('rack-mini-profiler')
      expect(result.database_tooling.tools).toContain('annotate')
      expect(result.database_tooling.tools).toContain('strong_migrations')
    })
  })

  describe('rich text', () => {
    it('detects markdown library', () => {
      const result = extractTier2(mockProvider({}), [], {
        gems: { redcarpet: {} },
      })
      expect(result.rich_text.markdown).toBe('redcarpet')
    })
  })

  describe('notifications', () => {
    it('detects noticed gem', () => {
      const result = extractTier2(mockProvider({}), [], {
        gems: { noticed: {} },
      })
      expect(result.notifications.framework).toBe('noticed')
    })
  })

  describe('webhooks', () => {
    it('detects webhook controllers', () => {
      const entries = [
        {
          path: 'app/controllers/webhooks_controller.rb',
          category: 'controller',
        },
      ]
      const result = extractTier2(mockProvider({}), entries, { gems: {} })
      expect(result.webhooks.detected).toBe(true)
      expect(result.webhooks.controllers).toBe(1)
    })
  })

  describe('scheduled tasks', () => {
    it('detects whenever gem', () => {
      const result = extractTier2(mockProvider({}), [], {
        gems: { whenever: {} },
      })
      expect(result.scheduled_tasks.scheduler).toBe('whenever')
    })

    it('detects solid queue recurring', () => {
      const provider = mockProvider({ 'config/recurring.yml': 'jobs:' })
      const result = extractTier2(provider, [], { gems: {} })
      expect(result.scheduled_tasks.scheduler).toBe('solid_queue')
      expect(result.scheduled_tasks.recurring_jobs).toBe(true)
    })
  })

  describe('empty project', () => {
    it('returns defaults for all categories', () => {
      const result = extractTier2(mockProvider({}), [], { gems: {} })
      expect(result.security.csp).toBe(false)
      expect(result.testing.framework).toBeNull()
      expect(result.search.engine).toBeNull()
      expect(result.payments.provider).toBeNull()
      expect(result.admin.framework).toBeNull()
      expect(result.design_patterns).toEqual({})
    })
  })

  describe('testing extended fields', () => {
    it('detects request spec style when more request specs exist', () => {
      const entries = [
        { path: 'spec/requests/users_spec.rb' },
        { path: 'spec/requests/posts_spec.rb' },
        { path: 'spec/requests/comments_spec.rb' },
        { path: 'spec/requests/orders_spec.rb' },
        { path: 'spec/requests/items_spec.rb' },
        { path: 'spec/controllers/admin_controller_spec.rb' },
        { path: 'spec/controllers/api_controller_spec.rb' },
      ]
      const result = extractTier2(mockProvider({}), entries, {
        gems: { 'rspec-rails': {} },
      })
      expect(result.testing.spec_style.primary).toBe('request')
      expect(result.testing.spec_style.request_count).toBe(5)
      expect(result.testing.spec_style.controller_count).toBe(2)
      expect(result.testing.spec_style.has_mixed).toBe(true)
    })

    it('detects controller spec style when only controller specs exist', () => {
      const entries = [
        { path: 'spec/controllers/users_controller_spec.rb' },
        { path: 'spec/controllers/posts_controller_spec.rb' },
      ]
      const result = extractTier2(mockProvider({}), entries, {
        gems: { 'rspec-rails': {} },
      })
      expect(result.testing.spec_style.primary).toBe('controller')
    })

    it('detects faker gem', () => {
      const result = extractTier2(mockProvider({}), [], {
        gems: { faker: {}, 'rspec-rails': {} },
      })
      expect(result.testing.faker).toBe(true)
    })

    it('detects factories_dir when spec/factories exists', () => {
      const provider = mockProvider({
        'spec/factories': '', // directory marker
      })
      const result = extractTier2(provider, [], { gems: { 'rspec-rails': {} } })
      expect(result.testing.factories_dir).toBe('spec/factories')
    })

    it('preserves existing testing fields unchanged', () => {
      const result = extractTier2(mockProvider({}), [], {
        gems: {
          'rspec-rails': {},
          factory_bot_rails: {},
          capybara: {},
          simplecov: {},
          parallel_tests: {},
        },
      })
      expect(result.testing.framework).toBe('rspec')
      expect(result.testing.factories).toBe(true)
      expect(result.testing.system_tests).toBe(true)
      expect(result.testing.coverage).toBe(true)
      expect(result.testing.parallel).toBe(true)
    })
  })
})
