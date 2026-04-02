/**
 * Tier 2 Extractor (#18-40)
 * Lightweight extraction for secondary categories, primarily
 * using Gemfile detection and file existence checks.
 */

import { detectSpecStyle } from '../utils/spec-style-detector.js'

/**
 * Extract Tier 2 information across categories #18-40.
 * @param {import('../providers/interface.js').FileProvider} provider
 * @param {Array<{path: string, category: string}>} entries
 * @param {{gems?: object}} gemInfo
 * @returns {object}
 */
export function extractTier2(provider, entries, gemInfo = {}) {
  const gems = gemInfo.gems || {}

  return {
    security: extractSecurity(provider, gems),
    testing: extractTesting(provider, entries, gems),
    code_quality: extractCodeQuality(provider, gems),
    deployment: extractDeployment(provider, gems),
    search: extractSearch(entries, gems),
    payments: extractPayments(gems),
    multi_tenancy: extractMultiTenancy(entries, gems),
    admin: extractAdmin(entries, gems),
    design_patterns: extractDesignPatterns(entries),
    state_machines: extractStateMachines(gems),
    i18n: extractI18n(provider, entries),
    pdf: extractPdf(gems),
    csv: extractCsv(gems),
    webhooks: extractWebhooks(entries),
    scheduled_tasks: extractScheduledTasks(provider, gems),
    middleware: extractMiddleware(entries),
    engines: extractEngines(entries),
    credentials: extractCredentials(provider, gems),
    http_clients: extractHttpClients(gems),
    performance: extractPerformance(gems),
    database_tooling: extractDatabaseTooling(gems),
    rich_text: extractRichText(gems),
    notifications: extractNotifications(entries, gems),
  }
}

/** #18 Security */
function extractSecurity(provider, gems) {
  const result = {
    csp: false,
    cors: false,
    force_ssl: false,
    filter_parameters: false,
    credentials_encrypted: false,
    brakeman: !!gems.brakeman,
    bundler_audit: !!gems['bundler-audit'],
  }

  result.csp =
    provider.readFile('config/initializers/content_security_policy.rb') !== null
  result.cors = provider.readFile('config/initializers/cors.rb') !== null

  const prodContent = provider.readFile('config/environments/production.rb')
  if (prodContent && /config\.force_ssl\s*=\s*true/.test(prodContent)) {
    result.force_ssl = true
  }

  const filterContent = provider.readFile(
    'config/initializers/filter_parameter_logging.rb',
  )
  if (filterContent) result.filter_parameters = true

  if (provider.readFile('config/credentials.yml.enc') !== null) {
    result.credentials_encrypted = true
  }

  return result
}

/** #19 Testing */
function extractTesting(provider, entries, gems) {
  const result = {
    framework: null,
    factories: !!(gems.factory_bot_rails || gems.factory_bot || detectFactoriesDir(provider)),
    system_tests: !!gems.capybara,
    coverage: !!gems.simplecov,
    mocking: [],
    parallel: !!gems.parallel_tests,
    faker: !!gems.faker,
    spec_style: detectSpecStyle(entries),
    factories_dir: detectFactoriesDir(provider),
    fixtures_dir: detectFixturesDir(provider),
  }

  if (gems['rspec-rails']) {
    result.framework = 'rspec'
  } else if (entries.some((e) => e.path.startsWith('test/'))) {
    result.framework = 'minitest'
  }

  if (gems.webmock) result.mocking.push('webmock')
  if (gems.vcr) result.mocking.push('vcr')

  return result
}

/**
 * Detect the factories directory.
 * @param {import('../providers/interface.js').FileProvider} provider
 * @returns {string|null}
 */
function detectFactoriesDir(provider) {
  if (provider.fileExists('spec/factories')) return 'spec/factories'
  if (provider.fileExists('test/factories')) return 'test/factories'
  return null
}

/**
 * Detect the fixtures directory.
 * @param {import('../providers/interface.js').FileProvider} provider
 * @returns {string|null}
 */
function detectFixturesDir(provider) {
  if (provider.fileExists('spec/fixtures')) return 'spec/fixtures'
  if (provider.fileExists('test/fixtures')) return 'test/fixtures'
  return null
}

/** #20 Code Quality */
function extractCodeQuality(provider, gems) {
  const result = {
    rubocop: false,
    rubocop_preset: null,
    erb_lint: !!gems.erb_lint,
    eslint: false,
    brakeman: !!gems.brakeman,
  }

  if (provider.readFile('.rubocop.yml') !== null) {
    result.rubocop = true
    if (gems['rubocop-rails-omakase']) result.rubocop_preset = 'omakase'
    else if (gems.standard) result.rubocop_preset = 'standard'
  }

  // ESLint detection
  const eslintFiles = [
    '.eslintrc.js',
    '.eslintrc.json',
    '.eslintrc.yml',
    'eslint.config.js',
    'eslint.config.mjs',
  ]
  for (const f of eslintFiles) {
    if (provider.readFile(f) !== null) {
      result.eslint = true
      break
    }
  }

  return result
}

/** #21 Deployment */
function extractDeployment(provider, gems) {
  const result = {
    kamal: false,
    capistrano: false,
    heroku: false,
    docker: false,
    ci: [],
  }

  if (provider.readFile('config/deploy.yml') !== null) result.kamal = true
  if (provider.readFile('Capfile') !== null) result.capistrano = true
  if (provider.readFile('Procfile') !== null) result.heroku = true
  if (provider.readFile('Dockerfile') !== null) result.docker = true

  // CI detection
  if (
    provider.readFile('.github/workflows') !== null ||
    provider.readFile('.github') !== null
  ) {
    // Check if any workflow files exist via entries
    result.ci.push('github_actions')
  }
  if (provider.readFile('.circleci/config.yml') !== null)
    result.ci.push('circleci')
  if (provider.readFile('.gitlab-ci.yml') !== null) result.ci.push('gitlab')

  return result
}

/** #22 Search */
function extractSearch(entries, gems) {
  const result = {
    engine: null,
  }

  if (gems.searchkick) result.engine = 'searchkick'
  else if (gems.pg_search) result.engine = 'pg_search'
  else if (gems['meilisearch-rails']) result.engine = 'meilisearch'
  else if (gems.chewy) result.engine = 'chewy'
  else if (gems['elasticsearch-rails']) result.engine = 'elasticsearch'

  return result
}

/** #23 Payments */
function extractPayments(gems) {
  const result = { provider: null }
  if (gems.pay) result.provider = 'pay'
  else if (gems.stripe) result.provider = 'stripe'
  return result
}

/** #24 Multi-tenancy */
function extractMultiTenancy(entries, gems) {
  const result = { strategy: null }
  if (gems.acts_as_tenant) result.strategy = 'acts_as_tenant'
  else if (gems.apartment) result.strategy = 'apartment'
  return result
}

/** #25 Admin */
function extractAdmin(entries, gems) {
  const result = { framework: null }
  if (gems.activeadmin) result.framework = 'activeadmin'
  else if (gems.administrate) result.framework = 'administrate'
  else if (gems.avo) result.framework = 'avo'
  else if (gems.rails_admin) result.framework = 'rails_admin'
  else if (entries.some((e) => e.path.startsWith('app/controllers/admin/'))) {
    result.framework = 'custom'
  }
  return result
}

/** #26 Design Patterns */
function extractDesignPatterns(entries) {
  const patterns = {}
  const dirs = {
    services: 'app/services/',
    forms: 'app/forms/',
    queries: 'app/queries/',
    decorators: 'app/decorators/',
    presenters: 'app/presenters/',
    interactors: 'app/interactors/',
    validators: 'app/validators/',
    notifiers: 'app/notifiers/',
  }
  for (const [name, dir] of Object.entries(dirs)) {
    const count = entries.filter((e) => e.path.startsWith(dir)).length
    if (count > 0) patterns[name] = count
  }
  return patterns
}

/** #27 State Machines */
function extractStateMachines(gems) {
  const result = { library: null }
  if (gems.aasm) result.library = 'aasm'
  else if (gems.statesman) result.library = 'statesman'
  else if (gems['state_machines-activerecord'])
    result.library = 'state_machines'
  return result
}

/** #28 I18n */
function extractI18n(provider, entries) {
  const result = {
    default_locale: null,
    locales: [],
  }

  const appContent = provider.readFile('config/application.rb')
  if (appContent) {
    const dlMatch = appContent.match(
      /config\.i18n\.default_locale\s*=\s*:(\w+)/,
    )
    if (dlMatch) result.default_locale = dlMatch[1]
  }

  const localeEntries = entries.filter(
    (e) => e.path.startsWith('config/locales/') && e.path.endsWith('.yml'),
  )
  const localeSet = new Set()
  for (const entry of localeEntries) {
    // Extract locale from filename: en.yml, devise.en.yml, etc.
    const match = entry.path.match(/\.?(\w{2}(?:-\w{2})?)\.yml$/)
    if (match) localeSet.add(match[1])
  }
  result.locales = [...localeSet].sort()

  return result
}

/** #29 PDF */
function extractPdf(gems) {
  const result = { library: null }
  if (gems.wicked_pdf) result.library = 'wicked_pdf'
  else if (gems.prawn) result.library = 'prawn'
  else if (gems.grover) result.library = 'grover'
  return result
}

/** #30 CSV / Spreadsheet */
function extractCsv(gems) {
  const result = { library: null }
  if (gems.caxlsx || gems.axlsx_rails) result.library = 'caxlsx'
  else if (gems.roo) result.library = 'roo'
  return result
}

/** #31 Webhooks */
function extractWebhooks(entries) {
  const controllers = entries.filter(
    (e) => e.path.includes('webhook') && e.category === 'controller',
  )
  return { detected: controllers.length > 0, controllers: controllers.length }
}

/** #32 Scheduled Tasks */
function extractScheduledTasks(provider, gems) {
  const result = { scheduler: null }
  if (gems.whenever) result.scheduler = 'whenever'
  else if (gems['sidekiq-cron']) result.scheduler = 'sidekiq-cron'
  else if (gems['sidekiq-scheduler']) result.scheduler = 'sidekiq-scheduler'

  if (provider.readFile('config/recurring.yml') !== null) {
    result.scheduler = result.scheduler || 'solid_queue'
    result.recurring_jobs = true
  }

  return result
}

/** #33 Middleware */
function extractMiddleware(entries) {
  const custom = entries.filter((e) => e.path.startsWith('app/middleware/'))
  return { custom_count: custom.length }
}

/** #34 Engines */
function extractEngines(entries) {
  const engineEntries = entries.filter(
    (e) => e.path.startsWith('engines/') || e.path.startsWith('lib/engines/'),
  )
  return { count: engineEntries.length }
}

/** #35 Credentials */
function extractCredentials(provider, gems) {
  const result = {
    encrypted: false,
    per_environment: false,
    dotenv: !!gems['dotenv-rails'],
    legacy_secrets: false,
  }

  if (provider.readFile('config/credentials.yml.enc') !== null) {
    result.encrypted = true
  }
  if (provider.readFile('config/credentials/production.yml.enc') !== null) {
    result.per_environment = true
  }
  if (provider.readFile('config/secrets.yml') !== null) {
    result.legacy_secrets = true
  }

  return result
}

/** #36 HTTP Clients */
function extractHttpClients(gems) {
  const clients = []
  if (gems.faraday) clients.push('faraday')
  if (gems.httparty) clients.push('httparty')
  return { clients }
}

/** #37 Performance */
function extractPerformance(gems) {
  const tools = []
  if (gems.bullet) tools.push('bullet')
  if (gems['rack-mini-profiler']) tools.push('rack-mini-profiler')
  if (gems.pghero) tools.push('pghero')
  if (gems.prosopite) tools.push('prosopite')
  return { tools }
}

/** #38 Database Tooling */
function extractDatabaseTooling(gems) {
  const tools = []
  if (gems.annotate) tools.push('annotate')
  if (gems.strong_migrations) tools.push('strong_migrations')
  if (gems.database_cleaner) tools.push('database_cleaner')
  if (gems.active_record_doctor) tools.push('active_record_doctor')
  return { tools }
}

/** #39 Rich Text */
function extractRichText(gems) {
  const result = { action_text: false, markdown: null }
  if (gems.actiontext || gems['actiontext']) result.action_text = true
  if (gems.redcarpet) result.markdown = 'redcarpet'
  else if (gems.kramdown) result.markdown = 'kramdown'
  else if (gems.commonmarker) result.markdown = 'commonmarker'
  return result
}

/** #40 Notifications */
function extractNotifications(entries, gems) {
  const result = { framework: null }
  if (gems.noticed) result.framework = 'noticed'
  else if (entries.some((e) => e.path.startsWith('app/notifications/'))) {
    result.framework = 'custom'
  }
  return result
}
