/**
 * Layer 2: Version Detector
 *
 * Detects Rails version, Ruby version, and key framework versions from
 * Gemfile, Gemfile.lock, config/application.rb, and related config files.
 * Uses FileProvider for all reads.
 *
 * @module version-detector
 */

import { GEMFILE_PATTERNS, CONFIG_PATTERNS } from './patterns.js'

/**
 * @typedef {Object} VersionInfo
 * @property {string|null} rails - Rails version (e.g., "7.1.3")
 * @property {string|null} ruby - Ruby version (e.g., "3.2.2")
 * @property {string|null} loadDefaults - config.load_defaults value
 * @property {Object} framework - Detected framework stack
 * @property {string|null} framework.assetPipeline - "sprockets" | "propshaft" | null
 * @property {string|null} framework.jsBundling - "webpacker" | "importmap" | "esbuild" | "rollup" | "webpack" | null
 * @property {string|null} framework.cssBundling - "tailwind" | "bootstrap" | "sass" | "postcss" | null
 * @property {string|null} framework.auth - "devise" | "native" | null
 * @property {string|null} framework.jobAdapter - "sidekiq" | "solid_queue" | "good_job" | "delayed_job" | "async" | null
 * @property {string|null} framework.cacheStore - "redis" | "solid_cache" | "memcached" | "memory" | null
 * @property {string|null} framework.cableAdapter - "redis" | "solid_cable" | "async" | null
 * @property {string|null} framework.testFramework - "rspec" | "minitest" | null
 * @property {string|null} framework.deploy - "kamal" | "capistrano" | "heroku" | "docker" | null
 * @property {boolean} framework.hotwire - Whether Hotwire (Turbo + Stimulus) is present
 * @property {boolean} framework.apiOnly - Whether app is API-only
 * @property {Object} gems - Key gem versions keyed by name
 * @property {string[]} warnings - Detection warnings
 */

/**
 * Detect versions and framework stack from project files.
 *
 * @param {import('../providers/interface.js').FileProvider} provider - File access provider
 * @returns {VersionInfo}
 */
export function detectVersions(provider) {
  const warnings = []
  const gems = {}

  // Read key files
  const gemfile = provider.readFile('Gemfile') || ''
  const gemfileLock = provider.readFile('Gemfile.lock') || ''
  const appConfig = provider.readFile('config/application.rb') || ''

  // Extract Rails version
  const rails = extractRailsVersion(gemfile, gemfileLock)
  if (!rails) warnings.push('Could not determine Rails version')

  // Extract Ruby version
  const ruby = extractRubyVersion(gemfile, gemfileLock, provider)
  if (!ruby) warnings.push('Could not determine Ruby version')

  // Extract load_defaults
  const loadDefaults = extractLoadDefaults(appConfig)

  // Parse all gems from Gemfile
  parseGems(gemfile, gems)

  // Parse precise versions from Gemfile.lock
  parseLockfileVersions(gemfileLock, gems)

  // Detect framework stack
  const framework = detectFramework(gemfile, gems, appConfig, provider)

  return { rails, ruby, loadDefaults, framework, gems, warnings }
}

/**
 * Extract Rails version from Gemfile and Gemfile.lock.
 * @param {string} gemfile
 * @param {string} gemfileLock
 * @returns {string|null}
 */
function extractRailsVersion(gemfile, gemfileLock) {
  // Try Gemfile.lock first (most precise)
  const lockMatch = gemfileLock.match(
    /^\s+rails\s+\((\d+\.\d+\.\d+(?:\.\w+)?)\)/m,
  )
  if (lockMatch) return lockMatch[1]

  // Try Gemfile
  const gemMatch = gemfile.match(
    /gem\s+['"]rails['"],\s*['"]~?\s*>?\s*=?\s*(\d+\.\d+(?:\.\d+)?)['"]/,
  )
  if (gemMatch) return gemMatch[1]

  return null
}

/**
 * Extract Ruby version from Gemfile, Gemfile.lock, or .ruby-version.
 * @param {string} gemfile
 * @param {string} gemfileLock
 * @param {import('../providers/interface.js').FileProvider} provider
 * @returns {string|null}
 */
function extractRubyVersion(gemfile, gemfileLock, provider) {
  // Gemfile.lock RUBY VERSION section
  const lockMatch = gemfileLock.match(/RUBY VERSION\s+ruby\s+(\d+\.\d+\.\d+)/)
  if (lockMatch) return lockMatch[1]

  // Gemfile ruby declaration
  const gemMatch = gemfile.match(GEMFILE_PATTERNS.ruby)
  if (gemMatch) return gemMatch[1]

  // .ruby-version file
  const rubyVersion = provider.readFile('.ruby-version')
  if (rubyVersion) {
    const cleaned = rubyVersion.trim().replace(/^ruby-/, '')
    const ver = cleaned.match(/^(\d+\.\d+\.\d+)/)
    if (ver) return ver[1]
  }

  return null
}

/**
 * Extract config.load_defaults from application.rb.
 * @param {string} appConfig
 * @returns {string|null}
 */
function extractLoadDefaults(appConfig) {
  const m = appConfig.match(CONFIG_PATTERNS.loadDefaults)
  return m ? m[1] : null
}

/**
 * Parse gem names from Gemfile.
 * @param {string} gemfile
 * @param {Object} gems
 */
function parseGems(gemfile, gems) {
  const lines = gemfile.split('\n')
  for (const line of lines) {
    const m = line.match(GEMFILE_PATTERNS.gem)
    if (m) {
      const name = m[1]
      const version = m[2] || null
      gems[name] = { declared: version }
    }
  }
}

/**
 * Parse precise versions from Gemfile.lock.
 * @param {string} gemfileLock
 * @param {Object} gems
 */
function parseLockfileVersions(gemfileLock, gems) {
  const lines = gemfileLock.split('\n')
  let inSpecs = false

  for (const line of lines) {
    if (line.trim() === 'specs:') {
      inSpecs = true
      continue
    }
    if (inSpecs && /^\S/.test(line)) {
      inSpecs = false
      continue
    }
    if (!inSpecs) continue

    const m = line.match(/^\s{4}(\S+)\s+\((\d+\.\d+(?:\.\d+(?:\.\w+)?)?)\)/)
    if (m) {
      const name = m[1]
      const version = m[2]
      if (gems[name]) {
        gems[name].locked = version
      } else {
        gems[name] = { locked: version }
      }
    }
  }
}

/**
 * Detect framework stack from gem presence and config.
 * @param {string} gemfile
 * @param {Object} gems
 * @param {string} appConfig
 * @param {import('../providers/interface.js').FileProvider} provider
 * @returns {Object}
 */
function detectFramework(gemfile, gems, appConfig, provider) {
  const hasGem = (name) => name in gems

  // Asset pipeline
  let assetPipeline = null
  if (hasGem('propshaft')) assetPipeline = 'propshaft'
  else if (hasGem('sprockets') || hasGem('sprockets-rails'))
    assetPipeline = 'sprockets'

  // JS bundling
  let jsBundling = null
  if (hasGem('vite_rails') || hasGem('vite_ruby')) jsBundling = 'vite'
  else if (hasGem('webpacker')) jsBundling = 'webpacker'
  else if (hasGem('importmap-rails')) jsBundling = 'importmap'
  else if (hasGem('jsbundling-rails')) {
    // Check package.json for specific bundler
    const pkgJson = provider.readFile('package.json')
    if (pkgJson) {
      if (pkgJson.includes('"esbuild"')) jsBundling = 'esbuild'
      else if (pkgJson.includes('"rollup"')) jsBundling = 'rollup'
      else if (pkgJson.includes('"webpack"')) jsBundling = 'webpack'
      else jsBundling = 'jsbundling'
    } else {
      jsBundling = 'jsbundling'
    }
  }

  // CSS
  let cssBundling = null
  if (hasGem('tailwindcss-rails')) cssBundling = 'tailwind'
  else if (hasGem('cssbundling-rails')) cssBundling = 'cssbundling'
  else if (hasGem('bootstrap')) cssBundling = 'bootstrap'
  else if (hasGem('sassc-rails') || hasGem('sass-rails')) cssBundling = 'sass'

  // Auth
  let auth = null
  if (hasGem('devise')) auth = 'devise'
  else if (
    provider.fileExists('app/models/session.rb') ||
    provider.fileExists('app/models/current.rb')
  ) {
    auth = 'native'
  }

  // Job adapter
  let jobAdapter = null
  if (hasGem('solid_queue')) jobAdapter = 'solid_queue'
  else if (hasGem('sidekiq')) jobAdapter = 'sidekiq'
  else if (hasGem('good_job')) jobAdapter = 'good_job'
  else if (hasGem('delayed_job')) jobAdapter = 'delayed_job'
  else jobAdapter = 'async'

  // Cache store
  let cacheStore = null
  if (hasGem('solid_cache')) cacheStore = 'solid_cache'
  else if (hasGem('redis')) cacheStore = 'redis'
  // Also check config
  const prodConfig =
    provider.readFile('config/environments/production.rb') || ''
  const cacheStoreMatch = prodConfig.match(/config\.cache_store\s*=\s*:(\w+)/)
  if (cacheStoreMatch) cacheStore = cacheStoreMatch[1]

  // Cable adapter
  let cableAdapter = null
  if (hasGem('solid_cable')) cableAdapter = 'solid_cable'
  else {
    const cableYml = provider.readFile('config/cable.yml') || ''
    const adapterMatch = cableYml.match(/production:\s*\n\s*adapter:\s*(\w+)/)
    if (adapterMatch) cableAdapter = adapterMatch[1]
  }

  // Test framework
  let testFramework = null
  if (hasGem('rspec-rails') || hasGem('rspec')) testFramework = 'rspec'
  else if (hasGem('minitest') || provider.fileExists('test'))
    testFramework = 'minitest'

  // Deployment
  let deploy = null
  if (
    hasGem('kamal') ||
    provider.fileExists('config/deploy.yml') ||
    provider.fileExists('.kamal')
  )
    deploy = 'kamal'
  else if (hasGem('capistrano')) deploy = 'capistrano'
  else if (provider.fileExists('Procfile')) deploy = 'heroku'
  else if (provider.fileExists('Dockerfile')) deploy = 'docker'

  // Hotwire
  const hotwire = hasGem('turbo-rails') || hasGem('hotwire-rails')

  // API only
  const apiOnly = CONFIG_PATTERNS.apiOnly.test(appConfig)

  return {
    assetPipeline,
    jsBundling,
    cssBundling,
    auth,
    jobAdapter,
    cacheStore,
    cableAdapter,
    testFramework,
    deploy,
    hotwire,
    apiOnly,
  }
}
