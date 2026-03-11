/**
 * Config Extractor (#17)
 * Extracts Rails application configuration from config files.
 */

import { CONFIG_PATTERNS } from '../core/patterns.js'
import { parseYaml } from '../utils/yaml-parser.js'

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
    const subDbs = prodKeys.filter(
      (k) => typeof prodSection[k] === 'object' && prodSection[k] !== null,
    )
    if (subDbs.length > 1) {
      result.database.multi_db = true
      result.database.databases = subDbs
    }
  }

  // config/environments/*.rb
  for (const env of ['production', 'development', 'test']) {
    const content = provider.readFile(`config/environments/${env}.rb`)
    if (!content) continue

    const envConfig = {}
    const csMatch = content.match(CONFIG_PATTERNS.cacheStore)
    if (csMatch) envConfig.cache_store = csMatch[1]

    if (CONFIG_PATTERNS.forceSSL.test(content)) envConfig.force_ssl = true

    if (Object.keys(envConfig).length > 0) {
      result.environments[env] = envConfig
    }
  }

  return result
}
