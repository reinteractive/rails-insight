/**
 * Caching Extractor (#13)
 * Extracts cache store config, fragment caching, HTTP caching usage.
 */

import { CACHING_PATTERNS } from '../core/patterns.js'
import { stripRubyComments } from '../utils/ruby-parser.js'

/**
 * Extract caching information.
 * @param {import('../providers/interface.js').FileProvider} provider
 * @param {Array<{path: string, category: string}>} entries
 * @returns {object}
 */
export function extractCaching(provider, entries) {
  const result = {
    store: {},
    fragment_caching: { usage_count: 0, russian_doll_detected: false },
    low_level_caching: { rails_cache_fetch_count: 0, rails_cache_ops_count: 0 },
    http_caching: { stale_usage: 0, fresh_when_usage: 0, expires_in_usage: 0 },
  }

  // Cache store per environment
  for (const env of ['production', 'development', 'test']) {
    const content = provider.readFile(`config/environments/${env}.rb`)
    if (content) {
      const activeContent = stripRubyComments(content)
      const storeMatch = activeContent.match(CACHING_PATTERNS.cacheStore)
      if (storeMatch) {
        result.store[env] = storeMatch[1]
      }
    }
  }

  // Scan views for fragment caching
  const viewEntries = entries.filter(
    (e) =>
      e.path.startsWith('app/views/') || e.path.startsWith('app/components/'),
  )
  for (const entry of viewEntries) {
    const content = provider.readFile(entry.path)
    if (!content) continue

    const fragRe = new RegExp(CACHING_PATTERNS.fragmentCache.source, 'g')
    let m
    while ((m = fragRe.exec(content))) {
      result.fragment_caching.usage_count++
    }

    // HAML fragment caching: - cache key do / = cache key do
    if (entry.path.endsWith('.haml')) {
      const hamlCacheRe = /^\s*[-=]\s*cache[\s(]+/gm
      while (hamlCacheRe.exec(content)) {
        result.fragment_caching.usage_count++
      }
    }

    // Russian doll detection
    const rdRe = new RegExp(CACHING_PATTERNS.russianDoll.source, 'g')
    if (rdRe.test(content)) {
      result.fragment_caching.russian_doll_detected = true
    }
    // HAML Russian doll: - cache [parent, child] do
    if (
      entry.path.endsWith('.haml') &&
      /^\s*[-=]\s*cache\s+\[/m.test(content)
    ) {
      result.fragment_caching.russian_doll_detected = true
    }
  }

  // Scan Ruby files for Rails.cache usage
  const rbEntries = entries.filter((e) => e.path.endsWith('.rb'))
  for (const entry of rbEntries) {
    const content = provider.readFile(entry.path)
    if (!content) continue

    const fetchRe = new RegExp(CACHING_PATTERNS.railsCacheFetch.source, 'g')
    while (fetchRe.exec(content)) {
      result.low_level_caching.rails_cache_fetch_count++
    }

    // Count other Rails.cache operations: read, write, delete, exist?
    const opsRe = new RegExp(CACHING_PATTERNS.railsCacheOps.source, 'g')
    while (opsRe.exec(content)) {
      result.low_level_caching.rails_cache_ops_count++
    }
    // Also count Rails.cache.delete_matched
    const deleteMatchedRe = /Rails\.cache\.delete_matched\s*\(/g
    while (deleteMatchedRe.exec(content)) {
      result.low_level_caching.rails_cache_ops_count++
    }

    // HTTP caching
    const staleRe = new RegExp(CACHING_PATTERNS.stale.source, 'g')
    while (staleRe.exec(content)) {
      result.http_caching.stale_usage++
    }

    const freshRe = new RegExp(CACHING_PATTERNS.freshWhen.source, 'g')
    while (freshRe.exec(content)) {
      result.http_caching.fresh_when_usage++
    }

    const expiresRe = new RegExp(CACHING_PATTERNS.expiresIn.source, 'g')
    while (expiresRe.exec(content)) {
      result.http_caching.expires_in_usage++
    }
  }

  return result
}
