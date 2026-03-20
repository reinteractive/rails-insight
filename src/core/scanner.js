/**
 * Layer 3: Structural Scanner
 *
 * Classifies all project files by path into the 56-category taxonomy.
 * Zero file content reads — pure path-based classification using
 * provider.glob() and provider.listDir().
 *
 * @module scanner
 */

/**
 * @typedef {Object} ManifestEntry
 * @property {string} path - Relative file path
 * @property {number} category - Category number (1-56)
 * @property {string} categoryName - Human-readable category name
 * @property {string} type - File type (ruby, js, erb, yml, etc.)
 * @property {string|null} [specCategory] - Sub-category for test files (category 19 only)
 */

/**
 * @typedef {Object} Manifest
 * @property {ManifestEntry[]} entries - All classified files
 * @property {Object<string, ManifestEntry[]>} byCategory - Entries grouped by category name
 * @property {Object} stats - File counts per category
 * @property {string[]} unclassified - Files that didn't match any rule
 */

/** Category name constants */
const CATEGORIES = {
  1: 'models',
  2: 'controllers',
  3: 'routes',
  4: 'schema',
  5: 'components',
  6: 'stimulus',
  7: 'views',
  8: 'authentication',
  9: 'authorization',
  10: 'jobs',
  11: 'email',
  12: 'storage',
  13: 'caching',
  14: 'realtime',
  15: 'api',
  16: 'gemfile',
  17: 'config',
  18: 'security',
  19: 'testing',
  20: 'code_quality',
  21: 'deployment',
  22: 'search',
  23: 'payments',
  24: 'multi_tenancy',
  25: 'admin',
  26: 'design_patterns',
  27: 'state_machines',
  28: 'i18n',
  29: 'pdf',
  30: 'csv',
  31: 'webhooks',
  32: 'scheduled_tasks',
  33: 'middleware',
  34: 'engines',
  35: 'credentials',
  36: 'http_client',
  37: 'performance',
  38: 'database_tooling',
  39: 'rich_text',
  40: 'notifications',
  41: 'feature_flags',
  42: 'audit',
  43: 'soft_delete',
  44: 'pagination',
  45: 'friendly_urls',
  46: 'tagging',
  47: 'seo',
  48: 'geolocation',
  49: 'sms_push',
  50: 'activity_tracking',
  51: 'data_import_export',
  52: 'event_sourcing',
  53: 'dry_rb',
  54: 'markdown',
  55: 'rate_limiting',
  56: 'graphql',
}

/**
 * Classification rules. Each rule maps a path pattern to a category.
 * Order matters — first match wins for ambiguous paths.
 *
 * The rules are ordered by specificity:
 * 1. Singleton files (routes.rb, schema.rb, Gemfile) — exact path matches
 * 2. Auth-specific controllers (sessions, registrations, passwords) — before
 *    general controllers so they land in category 8 instead of category 2
 * 3. Specialized app/ subdirectories (policies, serializers, services) —
 *    before general models/controllers to capture design-pattern files
 * 4. Core Tier 1 categories (models, controllers, views, jobs, etc.)
 * 5. Config and infrastructure files
 * 6. Catch-all patterns (lib/, migrations)
 *
 * @type {Array<{test: function(string): boolean, category: number}>}
 */
const RULES = [
  // --- Singleton files: exact path matches first ---
  { test: (p) => /^config\/routes(\.rb|\/.*\.rb)$/.test(p), category: 3 },
  { test: (p) => /^db\/(schema\.rb|structure\.sql)$/.test(p), category: 4 },
  { test: (p) => p === 'Gemfile' || p === 'Gemfile.lock', category: 16 },

  // --- Auth-specific files: must precede general controllers/models ---
  // Devise initializer is config but functionally auth
  { test: (p) => /^config\/initializers\/devise\.rb$/.test(p), category: 8 },
  // Rails 8 native auth uses Session/Current models
  { test: (p) => /^app\/models\/(session|current)\.rb$/.test(p), category: 8 },
  // Auth controllers: sessions, registrations, passwords, confirmations
  {
    test: (p) => /^app\/controllers\/.*sessions_controller\.rb$/.test(p),
    category: 8,
  },
  {
    test: (p) => /^app\/controllers\/.*registrations_controller\.rb$/.test(p),
    category: 8,
  },
  {
    test: (p) => /^app\/controllers\/.*passwords_controller\.rb$/.test(p),
    category: 8,
  },
  {
    test: (p) => /^app\/controllers\/.*confirmations_controller\.rb$/.test(p),
    category: 8,
  },

  // --- Authorization: policies and ability files ---
  { test: (p) => /^app\/policies\/.*\.rb$/.test(p), category: 9 },
  { test: (p) => /^app\/models\/ability\.rb$/.test(p), category: 9 },

  // --- API serializers/blueprints: before general models ---
  { test: (p) => /^app\/serializers\/.*\.rb$/.test(p), category: 15 },
  { test: (p) => /^app\/blueprints\/.*\.rb$/.test(p), category: 15 },

  // --- GraphQL: own directory under app/ ---
  { test: (p) => /^app\/graphql\/.*\.rb$/.test(p), category: 56 },

  // --- Design pattern directories: before general models ---
  { test: (p) => /^app\/services\/.*\.rb$/.test(p), category: 26 },
  { test: (p) => /^app\/forms\/.*\.rb$/.test(p), category: 26 },
  { test: (p) => /^app\/queries\/.*\.rb$/.test(p), category: 26 },
  { test: (p) => /^app\/decorators\/.*\.rb$/.test(p), category: 26 },
  { test: (p) => /^app\/presenters\/.*\.rb$/.test(p), category: 26 },
  { test: (p) => /^app\/interactors\/.*\.rb$/.test(p), category: 26 },

  // --- Admin namespace ---
  { test: (p) => /^app\/admin\/.*\.rb$/.test(p), category: 25 },

  // --- Workers: Sidekiq native workers (before general models) ---
  { test: (p) => /^app\/workers\/.*\.rb$/.test(p), category: 10 },
  { test: (p) => /^app\/sidekiq\/.*\.rb$/.test(p), category: 10 },

  // --- Uploaders: CarrierWave / Shrine (before general models) ---
  { test: (p) => /^app\/uploaders\/.*\.rb$/.test(p), category: 12 },

  // --- Validators: Custom validators (before general models) ---
  { test: (p) => /^app\/validators\/.*\.rb$/.test(p), category: 26 },

  // --- Notifiers: Action Notifier (future, before general models) ---
  { test: (p) => /^app\/notifiers\/.*\.rb$/.test(p), category: 40 },

  // --- Core Tier 1: broad app/ directory matches ---
  { test: (p) => /^app\/models\/.*\.rb$/.test(p), category: 1 },
  { test: (p) => /^app\/controllers\/.*\.rb$/.test(p), category: 2 },
  { test: (p) => /^app\/components\/.*\.(rb|html\.\w+)$/.test(p), category: 5 },
  {
    test: (p) => /^app\/javascript\/controllers\/.*\.js$/.test(p),
    category: 6,
  },
  { test: (p) => /^app\/views\/.*/.test(p), category: 7 },
  // --- Helpers: View helpers ---
  { test: (p) => /^app\/helpers\/.*\.rb$/.test(p), category: 7 },
  { test: (p) => /^app\/jobs\/.*\.rb$/.test(p), category: 10 },
  { test: (p) => /^app\/mailers\/.*\.rb$/.test(p), category: 11 },
  { test: (p) => /^app\/channels\/.*\.rb$/.test(p), category: 14 },
  { test: (p) => /^app\/mailboxes\/.*\.rb$/.test(p), category: 11 },

  // --- Infrastructure & Config ---
  { test: (p) => /^config\/storage\.yml$/.test(p), category: 12 },
  { test: (p) => /^config\/application\.rb$/.test(p), category: 17 },
  { test: (p) => /^config\/environments\/.*\.rb$/.test(p), category: 17 },
  { test: (p) => /^config\/database\.yml$/.test(p), category: 17 },
  { test: (p) => /^config\/cable\.yml$/.test(p), category: 14 },
  { test: (p) => /^config\/initializers\/.*\.rb$/.test(p), category: 17 },

  // Security-specific initializers (after general initializers to override)
  {
    test: (p) => /^config\/initializers\/content_security_policy\.rb$/.test(p),
    category: 18,
  },
  { test: (p) => /^config\/initializers\/cors\.rb$/.test(p), category: 18 },

  // --- Testing ---
  { test: (p) => /^spec\/.*\.rb$/.test(p), category: 19 },
  { test: (p) => /^test\/.*\.rb$/.test(p), category: 19 },
  { test: (p) => /^\.rspec$/.test(p), category: 19 },

  // --- Code quality & tooling ---
  { test: (p) => /^\.rubocop(\.yml|_todo\.yml)$/.test(p), category: 20 },
  { test: (p) => /^\.eslintrc/.test(p), category: 20 },

  // --- Deployment ---
  {
    test: (p) => /^(Dockerfile|docker-compose\.yml|\.dockerignore)$/.test(p),
    category: 21,
  },
  { test: (p) => /^config\/deploy\.yml$/.test(p), category: 21 },
  { test: (p) => /^\.kamal\/.*/.test(p), category: 21 },
  { test: (p) => /^config\/deploy\/.*\.rb$/.test(p), category: 21 },
  { test: (p) => /^Procfile/.test(p), category: 21 },
  { test: (p) => /^config\/puma\.rb$/.test(p), category: 21 },

  // --- i18n, credentials, middleware, engines, notifications ---
  { test: (p) => /^config\/locales\/.*\.yml$/.test(p), category: 28 },
  { test: (p) => /^config\/credentials/.test(p), category: 35 },
  { test: (p) => /^config\/master\.key$/.test(p), category: 35 },
  { test: (p) => /^\.env/.test(p), category: 35 },
  { test: (p) => /^app\/middleware\/.*\.rb$/.test(p), category: 33 },
  { test: (p) => /^engines\/.*/.test(p), category: 34 },
  { test: (p) => /^lib\/engines\/.*/.test(p), category: 34 },
  { test: (p) => /^app\/notifications\/.*\.rb$/.test(p), category: 40 },

  // --- Catch-all: lib and migrations ---
  { test: (p) => /^lib\/.*\.rb$/.test(p), category: 17 },
  { test: (p) => /^db\/migrate\/.*\.rb$/.test(p), category: 4 },
  { test: (p) => /^db\/seeds\.rb$/.test(p), category: 17 },
]

/**
 * Detect file type from extension.
 * @param {string} path
 * @returns {string}
 */
function detectType(path) {
  if (path.endsWith('.rb')) return 'ruby'
  if (path.endsWith('.js')) return 'javascript'
  if (path.endsWith('.ts')) return 'typescript'
  if (path.endsWith('.html.erb')) return 'erb'
  if (path.endsWith('.html.haml')) return 'haml'
  if (path.endsWith('.html.slim')) return 'slim'
  if (path.endsWith('.jbuilder')) return 'jbuilder'
  if (path.endsWith('.yml') || path.endsWith('.yaml')) return 'yaml'
  if (path.endsWith('.json.erb')) return 'json_erb'
  if (path.endsWith('.json')) return 'json'
  if (path.endsWith('.sql')) return 'sql'
  if (path.endsWith('.css')) return 'css'
  if (path.endsWith('.scss')) return 'scss'
  return 'other'
}

/**
 * Classify a single file path into a category.
 * @param {string} path - Relative file path
 * @returns {ManifestEntry|null}
 */
function classifyFile(path) {
  for (const rule of RULES) {
    if (rule.test(path)) {
      const entry = {
        path,
        category: rule.category,
        categoryName: CATEGORIES[rule.category],
        type: detectType(path),
      }
      if (entry.category === 19) {
        entry.specCategory = classifySpecFile(path)
      }
      if (entry.category === 7 && path.startsWith('app/views/pwa/')) {
        entry.pwaFile = true
      }
      if (
        entry.category === 10 &&
        (path.startsWith('app/workers/') || path.startsWith('app/sidekiq/'))
      ) {
        entry.workerType = 'sidekiq_native'
      }
      return entry
    }
  }
  return null
}

/**
 * Sub-classify a spec/test file by its directory.
 * @param {string} path
 * @returns {string|null}
 */
function classifySpecFile(path) {
  if (path.startsWith('spec/models/')) return 'model_specs'
  if (path.startsWith('spec/requests/')) return 'request_specs'
  if (path.startsWith('spec/controllers/')) return 'controller_specs'
  if (path.startsWith('spec/services/')) return 'service_specs'
  if (path.startsWith('spec/jobs/')) return 'job_specs'
  if (path.startsWith('spec/mailers/')) return 'mailer_specs'
  if (path.startsWith('spec/policies/')) return 'policy_specs'
  if (path.startsWith('spec/components/')) return 'component_specs'
  if (path.startsWith('spec/forms/')) return 'form_specs'
  if (path.startsWith('spec/factories/')) return 'factories'
  if (path.startsWith('spec/support/')) return 'support'
  if (path.startsWith('spec/shared_examples/')) return 'shared_examples'
  if (path.startsWith('spec/shared_contexts/')) return 'shared_contexts'
  if (path.startsWith('test/models/')) return 'model_tests'
  if (path.startsWith('test/controllers/')) return 'controller_tests'
  if (path.startsWith('test/integration/')) return 'integration_tests'
  if (path.startsWith('test/factories/')) return 'factories'
  return null
}

/**
 * Scan the project structure and classify all files.
 * Zero file content reads — uses only glob and listDir.
 *
 * @param {import('../providers/interface.js').FileProvider} provider
 * @returns {Manifest}
 */
export function scanStructure(provider) {
  const entries = []
  const unclassified = []
  const byCategory = {}
  const stats = {}

  // Initialize byCategory
  for (const [num, name] of Object.entries(CATEGORIES)) {
    byCategory[name] = []
    stats[name] = 0
  }

  // Get all relevant files
  const allFiles = [
    ...provider.glob('app/**/*.rb'),
    ...provider.glob('app/**/*.js'),
    ...provider.glob('app/**/*.ts'),
    ...provider.glob('app/**/*.html.erb'),
    ...provider.glob('app/**/*.json.erb'),
    ...provider.glob('app/**/*.html.haml'),
    ...provider.glob('app/**/*.html.slim'),
    ...provider.glob('app/**/*.jbuilder'),
    ...provider.glob('config/**/*.rb'),
    ...provider.glob('config/**/*.yml'),
    ...provider.glob('db/**/*.rb'),
    ...provider.glob('db/**/*.sql'),
    ...provider.glob('lib/**/*.rb'),
    ...provider.glob('spec/**/*.rb'),
    ...provider.glob('test/**/*.rb'),
    ...provider.glob('engines/**/*'),
  ]

  // Add specific files
  const specificFiles = [
    'Gemfile',
    'Gemfile.lock',
    'Dockerfile',
    'docker-compose.yml',
    '.dockerignore',
    'Procfile',
    '.rspec',
    '.rubocop.yml',
    '.rubocop_todo.yml',
    '.env',
    '.env.development',
    '.env.production',
  ]

  for (const file of specificFiles) {
    if (provider.fileExists(file)) {
      allFiles.push(file)
    }
  }

  // Deduplicate
  const uniqueFiles = [...new Set(allFiles)]

  // Classify each file
  for (const filePath of uniqueFiles) {
    const entry = classifyFile(filePath)
    if (entry) {
      entries.push(entry)
      byCategory[entry.categoryName].push(entry)
      stats[entry.categoryName]++
    } else {
      unclassified.push(filePath)
    }
  }

  return { entries, byCategory, stats, unclassified }
}

export { classifyFile, classifySpecFile, CATEGORIES }
