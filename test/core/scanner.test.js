import { describe, it, expect } from 'vitest'
import {
  scanStructure,
  classifyFile,
  classifySpecFile,
  CATEGORIES,
} from '../../src/core/scanner.js'

function createMockProvider(files = []) {
  const fileSet = new Set(files)
  return {
    readFile() {
      return null
    },
    readLines() {
      return []
    },
    fileExists(path) {
      return fileSet.has(path)
    },
    glob(pattern) {
      // Simple glob mock: match files by prefix and extension
      const prefix = pattern.split('**')[0] || ''
      const extMatch = pattern.match(/\*(\.\S+)$/)
      const ext = extMatch ? extMatch[1] : null
      return files.filter((f) => {
        const matchesPrefix = f.startsWith(prefix)
        const matchesExt = ext ? f.endsWith(ext) : true
        return matchesPrefix && matchesExt
      })
    },
    listDir() {
      return []
    },
    getProjectRoot() {
      return '/mock'
    },
  }
}

describe('Scanner', () => {
  describe('classifyFile', () => {
    it('classifies model files', () => {
      const entry = classifyFile('app/models/user.rb')
      expect(entry.category).toBe(1)
      expect(entry.categoryName).toBe('models')
    })

    it('classifies nested model files', () => {
      const entry = classifyFile('app/models/concerns/searchable.rb')
      expect(entry.category).toBe(1)
      expect(entry.categoryName).toBe('models')
    })

    it('classifies controller files', () => {
      const entry = classifyFile('app/controllers/users_controller.rb')
      expect(entry.category).toBe(2)
      expect(entry.categoryName).toBe('controllers')
    })

    it('classifies namespaced controller files', () => {
      const entry = classifyFile('app/controllers/api/v1/users_controller.rb')
      expect(entry.category).toBe(2)
    })

    it('classifies routes', () => {
      expect(classifyFile('config/routes.rb').category).toBe(3)
      expect(classifyFile('config/routes/api.rb').category).toBe(3)
    })

    it('classifies schema', () => {
      expect(classifyFile('db/schema.rb').category).toBe(4)
      expect(classifyFile('db/structure.sql').category).toBe(4)
    })

    it('classifies migrations', () => {
      expect(classifyFile('db/migrate/20240101_create_users.rb').category).toBe(
        4,
      )
    })

    it('classifies components', () => {
      expect(classifyFile('app/components/header_component.rb').category).toBe(
        5,
      )
    })

    it('classifies stimulus controllers', () => {
      expect(
        classifyFile('app/javascript/controllers/dropdown_controller.js')
          .category,
      ).toBe(6)
    })

    it('classifies views', () => {
      expect(classifyFile('app/views/users/index.html.erb').category).toBe(7)
    })

    it('classifies jobs', () => {
      expect(classifyFile('app/jobs/import_job.rb').category).toBe(10)
    })

    it('classifies mailers', () => {
      expect(classifyFile('app/mailers/user_mailer.rb').category).toBe(11)
    })

    it('classifies channels', () => {
      expect(classifyFile('app/channels/chat_channel.rb').category).toBe(14)
    })

    it('classifies Gemfile', () => {
      expect(classifyFile('Gemfile').category).toBe(16)
      expect(classifyFile('Gemfile.lock').category).toBe(16)
    })

    it('classifies config files', () => {
      expect(classifyFile('config/application.rb').category).toBe(17)
      expect(classifyFile('config/environments/production.rb').category).toBe(
        17,
      )
      expect(classifyFile('config/database.yml').category).toBe(17)
    })

    it('classifies devise initializer as auth', () => {
      expect(classifyFile('config/initializers/devise.rb').category).toBe(8)
    })

    it('classifies session model as auth', () => {
      expect(classifyFile('app/models/session.rb').category).toBe(8)
    })

    it('classifies policies as authorization', () => {
      expect(classifyFile('app/policies/post_policy.rb').category).toBe(9)
    })

    it('classifies design pattern directories', () => {
      expect(classifyFile('app/services/payment_service.rb').category).toBe(26)
      expect(classifyFile('app/forms/registration_form.rb').category).toBe(26)
      expect(classifyFile('app/queries/user_search_query.rb').category).toBe(26)
      expect(classifyFile('app/decorators/user_decorator.rb').category).toBe(26)
    })

    it('classifies serializers as API', () => {
      expect(classifyFile('app/serializers/user_serializer.rb').category).toBe(
        15,
      )
    })

    it('classifies specs as testing', () => {
      expect(classifyFile('spec/models/user_spec.rb').category).toBe(19)
      expect(classifyFile('test/models/user_test.rb').category).toBe(19)
    })

    it('classifies deployment files', () => {
      expect(classifyFile('Dockerfile').category).toBe(21)
      expect(classifyFile('config/deploy.yml').category).toBe(21)
    })

    it('classifies i18n locales', () => {
      expect(classifyFile('config/locales/en.yml').category).toBe(28)
    })

    it('classifies credentials', () => {
      expect(
        classifyFile('config/credentials/production.yml.enc').category,
      ).toBe(35)
    })

    it('classifies graphql files', () => {
      expect(classifyFile('app/graphql/types/user_type.rb').category).toBe(56)
    })

    it('classifies storage config', () => {
      expect(classifyFile('config/storage.yml').category).toBe(12)
    })

    it('returns null for unrecognized files', () => {
      expect(classifyFile('README.md')).toBeNull()
    })

    it('detects file types correctly', () => {
      expect(classifyFile('app/models/user.rb').type).toBe('ruby')
      expect(
        classifyFile('app/javascript/controllers/dropdown_controller.js').type,
      ).toBe('javascript')
      expect(classifyFile('config/database.yml').type).toBe('yaml')
    })
  })

  describe('scanStructure', () => {
    it('returns a manifest with entries grouped by category', () => {
      const provider = createMockProvider([
        'app/models/user.rb',
        'app/models/post.rb',
        'app/controllers/users_controller.rb',
        'app/views/users/index.html.erb',
        'config/routes.rb',
      ])
      const manifest = scanStructure(provider)
      expect(manifest.entries.length).toBe(5)
      expect(manifest.byCategory.models.length).toBe(2)
      expect(manifest.byCategory.controllers.length).toBe(1)
      expect(manifest.byCategory.routes.length).toBe(1)
    })

    it('tracks unclassified files', () => {
      const provider = createMockProvider(['app/assets/stylesheets/main.css'])
      // This file won't match any glob pattern in the scanner, so it won't be discovered
      const manifest = scanStructure(provider)
      // The scanner only finds files via glob patterns, so CSS files won't be in entries
      expect(manifest.entries.length).toBe(0)
    })

    it('provides stats per category', () => {
      const provider = createMockProvider([
        'app/models/user.rb',
        'app/models/post.rb',
        'app/controllers/users_controller.rb',
      ])
      const manifest = scanStructure(provider)
      expect(manifest.stats.models).toBe(2)
      expect(manifest.stats.controllers).toBe(1)
    })

    it('handles empty project', () => {
      const provider = createMockProvider([])
      const manifest = scanStructure(provider)
      expect(manifest.entries.length).toBe(0)
    })

    it('deduplicates files found via multiple globs', () => {
      const provider = createMockProvider(['app/models/user.rb'])
      const manifest = scanStructure(provider)
      const userEntries = manifest.entries.filter(
        (e) => e.path === 'app/models/user.rb',
      )
      expect(userEntries.length).toBe(1)
    })
  })

  describe('specCategory', () => {
    it('assigns model_specs to spec/models/ files', () => {
      const entry = classifyFile('spec/models/user_spec.rb')
      expect(entry.category).toBe(19)
      expect(entry.specCategory).toBe('model_specs')
    })

    it('assigns request_specs to spec/requests/ files', () => {
      const entry = classifyFile('spec/requests/orders_spec.rb')
      expect(entry.specCategory).toBe('request_specs')
    })

    it('assigns factories to spec/factories/ files', () => {
      const entry = classifyFile('spec/factories/users.rb')
      expect(entry.specCategory).toBe('factories')
    })

    it('assigns support to spec/support/ files', () => {
      const entry = classifyFile('spec/support/auth_helper.rb')
      expect(entry.specCategory).toBe('support')
    })

    it('does not add specCategory to non-test files', () => {
      const entry = classifyFile('app/models/user.rb')
      expect(entry.specCategory).toBeUndefined()
    })

    it('returns null specCategory for unrecognized spec paths', () => {
      const entry = classifyFile('spec/some_random_spec.rb')
      expect(entry.category).toBe(19)
      expect(entry.specCategory).toBeNull()
    })
  })

  describe('classifySpecFile', () => {
    it('classifies service specs', () => {
      expect(classifySpecFile('spec/services/foo_spec.rb')).toBe(
        'service_specs',
      )
    })

    it('classifies job specs', () => {
      expect(classifySpecFile('spec/jobs/import_job_spec.rb')).toBe('job_specs')
    })

    it('classifies controller specs', () => {
      expect(
        classifySpecFile('spec/controllers/users_controller_spec.rb'),
      ).toBe('controller_specs')
    })

    it('classifies test/ paths', () => {
      expect(classifySpecFile('test/models/user_test.rb')).toBe('model_tests')
      expect(classifySpecFile('test/controllers/users_test.rb')).toBe(
        'controller_tests',
      )
      expect(classifySpecFile('test/integration/signup_test.rb')).toBe(
        'integration_tests',
      )
    })

    it('returns null for unrecognized paths', () => {
      expect(classifySpecFile('spec/random/foo_spec.rb')).toBeNull()
    })
  })

  describe('new category rules', () => {
    it('classifies worker file', () => {
      const entry = classifyFile('app/workers/bulk_index_worker.rb')
      expect(entry.category).toBe(10)
      expect(entry.categoryName).toBe('jobs')
    })

    it('classifies sidekiq directory worker', () => {
      const entry = classifyFile('app/sidekiq/send_email_job.rb')
      expect(entry.category).toBe(10)
      expect(entry.categoryName).toBe('jobs')
    })

    it('classifies helper file', () => {
      const entry = classifyFile('app/helpers/posts_helper.rb')
      expect(entry.category).toBe(7)
      expect(entry.categoryName).toBe('views')
    })

    it('classifies application helper', () => {
      const entry = classifyFile('app/helpers/application_helper.rb')
      expect(entry.category).toBe(7)
      expect(entry.categoryName).toBe('views')
    })

    it('classifies validator file', () => {
      const entry = classifyFile('app/validators/email_format_validator.rb')
      expect(entry.category).toBe(26)
      expect(entry.categoryName).toBe('design_patterns')
    })

    it('classifies uploader file', () => {
      const entry = classifyFile('app/uploaders/avatar_uploader.rb')
      expect(entry.category).toBe(12)
      expect(entry.categoryName).toBe('storage')
    })

    it('classifies notifier file', () => {
      const entry = classifyFile('app/notifiers/post_notifier.rb')
      expect(entry.category).toBe(40)
      expect(entry.categoryName).toBe('notifications')
    })

    it('classifies PWA manifest with pwaFile flag', () => {
      const entry = classifyFile('app/views/pwa/manifest.json.erb')
      expect(entry.category).toBe(7)
      expect(entry.categoryName).toBe('views')
      expect(entry.pwaFile).toBe(true)
    })

    it('marks worker as sidekiq_native', () => {
      const entry = classifyFile('app/workers/my_worker.rb')
      expect(entry.workerType).toBe('sidekiq_native')
    })

    it('marks sidekiq dir worker as sidekiq_native', () => {
      const entry = classifyFile('app/sidekiq/my_worker.rb')
      expect(entry.workerType).toBe('sidekiq_native')
    })

    it('does not mark regular job as sidekiq_native', () => {
      const entry = classifyFile('app/jobs/my_job.rb')
      expect(entry.workerType).toBeUndefined()
    })

    it('detects json_erb file type', () => {
      const entry = classifyFile('app/views/pwa/manifest.json.erb')
      expect(entry.type).toBe('json_erb')
    })
  })

  describe('ISSUE-L: Text-format template detection', () => {
    it('detects text.erb as erb type', () => {
      const entry = classifyFile('app/views/layouts/mailer.text.erb')
      expect(entry).not.toBeNull()
      expect(entry.type).toBe('erb')
      expect(entry.category).toBe(7)
    })

    it('detects text.haml as haml type', () => {
      const entry = classifyFile('app/views/layouts/mailer.text.haml')
      expect(entry).not.toBeNull()
      expect(entry.type).toBe('haml')
      expect(entry.category).toBe(7)
    })

    it('counts text.erb templates via scanStructure', () => {
      const provider = {
        glob(pattern) {
          if (pattern === 'app/**/*.text.erb')
            return [
              'app/views/layouts/mailer.text.erb',
              'app/views/user_mailer/welcome.text.erb',
            ]
          return []
        },
        listDir() {
          return []
        },
        fileExists() {
          return false
        },
        readFile() {
          return null
        },
      }
      const result = scanStructure(provider)
      const textErbEntries = result.entries.filter(
        (e) => e.type === 'erb' && e.path.endsWith('.text.erb'),
      )
      expect(textErbEntries.length).toBeGreaterThanOrEqual(2)
    })
  })
})
