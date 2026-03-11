/**
 * Gemfile Extractor (#16)
 * Parses Gemfile and Gemfile.lock, categorises gems.
 */

import { GEMFILE_PATTERNS } from '../core/patterns.js'

/** @type {Record<string, string[]>} */
const GEM_CATEGORIES = {
  core: [
    'rails',
    'railties',
    'activesupport',
    'activerecord',
    'actionpack',
    'actionview',
    'actionmailer',
    'activejob',
    'actioncable',
    'activestorage',
    'actiontext',
    'actionmailbox',
    'puma',
    'unicorn',
    'bootsnap',
    'tzinfo-data',
    'sprockets',
    'sprockets-rails',
  ],
  frontend: [
    'importmap-rails',
    'jsbundling-rails',
    'cssbundling-rails',
    'tailwindcss-rails',
    'sass-rails',
    'webpacker',
    'shakapacker',
    'turbo-rails',
    'stimulus-rails',
    'hotwire-rails',
    'propshaft',
    'dartsass-rails',
    'vite_rails',
    'esbuild',
    'rollup',
  ],
  auth: [
    'devise',
    'devise-jwt',
    'devise_invitable',
    'omniauth',
    'omniauth-rails_csrf_protection',
    'sorcery',
    'clearance',
    'rodauth-rails',
    'doorkeeper',
    'jwt',
    'bcrypt',
    'has_secure_password',
    'warden',
    'rack-attack',
  ],
  authorization: [
    'pundit',
    'cancancan',
    'action_policy',
    'rolify',
    'authority',
  ],
  background: [
    'sidekiq',
    'sidekiq-pro',
    'sidekiq-enterprise',
    'resque',
    'delayed_job',
    'good_job',
    'solid_queue',
    'que',
    'sneakers',
    'shoryuken',
    'mission_control-jobs',
  ],
  caching: [
    'redis',
    'redis-rails',
    'redis-actionpack',
    'hiredis',
    'solid_cache',
    'dalli',
    'identity_cache',
    'readthis',
  ],
  search: [
    'searchkick',
    'pg_search',
    'meilisearch-rails',
    'elasticsearch-rails',
    'chewy',
    'ransack',
    'thinking-sphinx',
  ],
  payments: [
    'pay',
    'stripe',
    'stripe-rails',
    'braintree',
    'shopify_api',
    'solidus',
    'spree',
  ],
  uploads: [
    'image_processing',
    'mini_magick',
    'shrine',
    'carrierwave',
    'paperclip',
    'aws-sdk-s3',
    'google-cloud-storage',
    'azure-storage-blob',
  ],
  monitoring: [
    'sentry-ruby',
    'sentry-rails',
    'newrelic_rpm',
    'honeybadger',
    'bugsnag',
    'rollbar',
    'airbrake',
    'scout_apm',
    'skylight',
    'datadog',
    'lograge',
    'ahoy_matey',
  ],
  deployment: [
    'kamal',
    'capistrano',
    'capistrano-rails',
    'capistrano-bundler',
    'capistrano-rbenv',
    'thruster',
    'mina',
    'sshkit',
  ],
  code_quality: [
    'rubocop',
    'rubocop-rails',
    'rubocop-rspec',
    'rubocop-performance',
    'rubocop-minitest',
    'rubocop-rails-omakase',
    'standard',
    'erb_lint',
    'brakeman',
    'bundler-audit',
    'overcommit',
    'annotate',
    'reek',
    'flog',
    'flay',
  ],
  testing: [
    'rspec-rails',
    'factory_bot_rails',
    'faker',
    'capybara',
    'selenium-webdriver',
    'cuprite',
    'capybara-playwright-driver',
    'shoulda-matchers',
    'simplecov',
    'webmock',
    'vcr',
    'timecop',
    'database_cleaner',
    'parallel_tests',
    'minitest',
    'mocha',
    'rspec-mocks',
  ],
  data: [
    'pg',
    'mysql2',
    'sqlite3',
    'trilogy',
    'activerecord-import',
    'scenic',
    'strong_migrations',
    'active_record_doctor',
    'paranoia',
    'discard',
    'acts_as_paranoid',
    'paper_trail',
    'audited',
    'aasm',
    'statesman',
    'state_machines-activerecord',
    'friendly_id',
    'acts_as_list',
    'acts_as_tree',
    'ancestry',
    'closure_tree',
  ],
  admin: [
    'activeadmin',
    'administrate',
    'avo',
    'rails_admin',
    'trestle',
    'motor-admin',
  ],
  api: [
    'grape',
    'graphql',
    'graphql-ruby',
    'graphiql-rails',
    'jbuilder',
    'jsonapi-serializer',
    'active_model_serializers',
    'blueprinter',
    'alba',
    'fast_jsonapi',
    'rack-cors',
    'versionist',
    'apipie-rails',
    'rswag',
  ],
  realtime: ['actioncable', 'anycable-rails', 'hotwire-rails'],
  mail: [
    'letter_opener',
    'letter_opener_web',
    'premailer-rails',
    'mailgun-ruby',
    'postmark-rails',
    'sendgrid-ruby',
    'aws-sdk-ses',
  ],
  pdf: [
    'wicked_pdf',
    'grover',
    'prawn',
    'prawn-table',
    'hexapdf',
    'wkhtmltopdf-binary',
  ],
  spreadsheet: [
    'caxlsx',
    'axlsx_rails',
    'roo',
    'spreadsheet',
    'rubyXL',
    'creek',
    'csv',
  ],
  image: ['ruby-vips', 'fastimage'],
  i18n: ['i18n-tasks', 'rails-i18n', 'mobility', 'globalize', 'i18n-js'],
  multi_tenancy: ['acts_as_tenant', 'apartment', 'ros-apartment', 'milia'],
  dev_tools: [
    'pry',
    'pry-rails',
    'pry-byebug',
    'byebug',
    'debug',
    'better_errors',
    'binding_of_caller',
    'web-console',
    'rack-mini-profiler',
    'bullet',
    'prosopite',
    'pghero',
    'spring',
    'listen',
    'foreman',
  ],
}

/** Build reverse lookup: gem name → category */
const GEM_TO_CATEGORY = {}
for (const [category, gems] of Object.entries(GEM_CATEGORIES)) {
  for (const gem of gems) {
    GEM_TO_CATEGORY[gem] = category
  }
}

/**
 * Categorize a gem name.
 * @param {string} name
 * @returns {string}
 */
function categorizeGem(name) {
  return GEM_TO_CATEGORY[name] || 'other'
}

/**
 * Parse resolved versions from Gemfile.lock content.
 * @param {string|null} lockContent
 * @returns {Map<string, string>}
 */
function parseLockVersions(lockContent) {
  const versions = new Map()
  if (!lockContent) return versions

  let inSpecs = false
  for (const line of lockContent.split('\n')) {
    const trimmed = line.trimEnd()
    if (trimmed === '  specs:' || trimmed === '    specs:') {
      inSpecs = true
      continue
    }
    if (inSpecs && /^\S/.test(trimmed)) {
      inSpecs = false
      continue
    }
    if (inSpecs) {
      // Lines like "    rails (7.1.3)" or "      activesupport (= 7.1.3)"
      const match = trimmed.match(/^\s{4}(\S+)\s+\(([^)]+)\)/)
      if (match) {
        versions.set(match[1], match[2])
      }
    }
  }
  return versions
}

/**
 * Parse Gemfile content into structured gem entries.
 * @param {string|null} gemfileContent
 * @param {Map<string, string>} lockVersions
 * @returns {{ gems: Array<{name: string, version: string|null, resolved: string|null, category: string, group: string}>, source: string|null, rubyVersion: string|null, groups: string[] }}
 */
function parseGemfile(gemfileContent, lockVersions) {
  const result = {
    gems: [],
    source: null,
    rubyVersion: null,
    groups: [],
  }

  if (!gemfileContent) return result

  // Extract source
  const sourceMatch = gemfileContent.match(GEMFILE_PATTERNS.source)
  if (sourceMatch) {
    result.source = sourceMatch[1]
  }

  // Extract ruby version
  const rubyMatch = gemfileContent.match(GEMFILE_PATTERNS.ruby)
  if (rubyMatch) {
    result.rubyVersion = rubyMatch[1]
  }

  // Parse line by line, tracking group context
  const lines = gemfileContent.split('\n')
  const groupStack = []
  const seenGroups = new Set()

  for (const line of lines) {
    // Detect group blocks
    const groupMatch = line.match(GEMFILE_PATTERNS.group)
    if (groupMatch) {
      // Parse group symbols: :development, :test or :development, :test
      const groupSymbols = groupMatch[1].match(/:(\w+)/g)
      if (groupSymbols) {
        const groups = groupSymbols.map((g) => g.slice(1))
        groupStack.push(groups)
        for (const g of groups) seenGroups.add(g)
      }
      continue
    }

    // Detect end of group block
    if (/^\s*end\b/.test(line) && groupStack.length > 0) {
      groupStack.pop()
      continue
    }

    // Parse gem declarations
    const gemMatch = line.match(GEMFILE_PATTERNS.gem)
    if (gemMatch) {
      const name = gemMatch[1]
      const version = gemMatch[2] || null

      // Determine group from context or inline group option
      let group = 'default'
      if (groupStack.length > 0) {
        group = groupStack[groupStack.length - 1].join(', ')
      } else if (gemMatch[3]) {
        // Check for inline group: option
        const inlineGroup = gemMatch[3].match(
          /group:\s*(?::(\w+)|\[([^\]]+)\])/,
        )
        if (inlineGroup) {
          group =
            inlineGroup[1] ||
            inlineGroup[2]
              .replace(/:/g, '')
              .replace(/\s/g, '')
              .split(',')
              .join(', ')
        }
      }

      result.gems.push({
        name,
        version,
        resolved: lockVersions.get(name) || null,
        category: categorizeGem(name),
        group,
      })
    }
  }

  result.groups = [...seenGroups]
  return result
}

/**
 * Extract Gemfile data from the project.
 * @param {import('../providers/interface.js').FileProvider} provider
 * @returns {{ gems: Array<{name: string, version: string|null, resolved: string|null, category: string, group: string}>, source: string|null, rubyVersion: string|null, groups: string[], byCategory: Record<string, Array<{name: string, version: string|null, resolved: string|null, category: string, group: string}>> }}
 */
export function extractGemfile(provider) {
  const gemfileContent = provider.readFile('Gemfile')
  const lockContent = provider.readFile('Gemfile.lock')

  const lockVersions = parseLockVersions(lockContent)
  const result = parseGemfile(gemfileContent, lockVersions)

  // Build byCategory index
  const byCategory = {}
  for (const gem of result.gems) {
    if (!byCategory[gem.category]) {
      byCategory[gem.category] = []
    }
    byCategory[gem.category].push(gem)
  }

  return { ...result, byCategory }
}
