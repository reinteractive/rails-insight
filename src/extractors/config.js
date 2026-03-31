/**
 * Config Extractor (#17)
 * Extracts Rails application configuration from config files.
 */

import { CONFIG_PATTERNS } from '../core/patterns.js'
import { parseYaml } from '../utils/yaml-parser.js'
import { stripRubyComments } from '../utils/ruby-parser.js'

/**
 * Extract config information.
 * @param {import('../providers/interface.js').FileProvider} provider
 * @returns {object}
 */
export function extractConfig(provider) {
  const result = {
    load_defaults: null,
    api_only: false,
    time_zone: null,
    queue_adapter: null,
    database: {},
    environments: {},
  }

  // config/application.rb
  const appContent = provider.readFile('config/application.rb')
  if (appContent) {
    const ldMatch = appContent.match(CONFIG_PATTERNS.loadDefaults)
    if (ldMatch) result.load_defaults = ldMatch[1]

    if (CONFIG_PATTERNS.apiOnly.test(appContent)) result.api_only = true

    const tzMatch = appContent.match(CONFIG_PATTERNS.timeZone)
    if (tzMatch) result.time_zone = tzMatch[1]

    const qaMatch = appContent.match(CONFIG_PATTERNS.queueAdapter)
    if (qaMatch) result.queue_adapter = qaMatch[1]
  }

  // config/database.yml
  const dbContent = provider.readFile('config/database.yml')
  if (dbContent) {
    const parsed = parseYaml(dbContent)
    // Extract production adapter
    if (parsed.production) {
      result.database.adapter = parsed.production.adapter || null
      result.database.pool = parsed.production.pool || null
    } else if (parsed.default) {
      result.database.adapter = parsed.default.adapter || null
      result.database.pool = parsed.default.pool || null
    }

    // Multi-DB detection: check for primary/secondary or multiple named DBs under production
    const prodSection = parsed.production || {}
    const prodKeys = Object.keys(prodSection)
    const subDbs = prodKeys.filter((k) => {
      const val = prodSection[k]
      return typeof val === 'object' && val !== null && val.adapter
    })
    if (subDbs.length > 1) {
      result.database.multi_db = true
      result.database.databases = subDbs
    }
  }

  // Fallback: try config/database.yml.example
  if (!result.database.adapter) {
    const dbExample = provider.readFile('config/database.yml.example')
    if (dbExample) {
      const parsed = parseYaml(dbExample)
      const section =
        parsed.production || parsed.development || parsed.default || {}
      result.database.adapter = section.adapter || null
      if (result.database.adapter) result.database.source = 'database.yml.example'
    }
  }

  // Fallback: detect adapter from Gemfile when database.yml is absent
  if (!result.database.adapter) {
    const gemfile = provider.readFile('Gemfile') || ''
    if (/gem\s+['"]mysql2['"]/.test(gemfile)) result.database.adapter = 'mysql2'
    else if (/gem\s+['"]pg['"]/.test(gemfile))
      result.database.adapter = 'postgresql'
    else if (/gem\s+['"]sqlite3['"]/.test(gemfile))
      result.database.adapter = 'sqlite3'
    else if (/gem\s+['"]trilogy['"]/.test(gemfile))
      result.database.adapter = 'trilogy'
    if (result.database.adapter) result.database.source = 'gemfile'
  }

  // config/environments/*.rb
  for (const env of ['production', 'development', 'test']) {
    const content = provider.readFile(`config/environments/${env}.rb`)
    if (!content) continue

    const activeContent = stripRubyComments(content)
    const envConfig = {}
    const csMatch = activeContent.match(CONFIG_PATTERNS.cacheStore)
    if (csMatch) envConfig.cache_store = csMatch[1]

    if (CONFIG_PATTERNS.forceSSL.test(activeContent)) envConfig.force_ssl = true

    if (Object.keys(envConfig).length > 0) {
      result.environments[env] = envConfig
    }
  }

  return result
}
