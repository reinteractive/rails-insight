/**
 * Regex patterns for Rails caching extraction.
 */
export const CACHING_PATTERNS = {
  cacheStore: /config\.cache_store\s*=\s*:(\w+)(?:,\s*(.+))?/,
  fragmentCache: /<%\s*cache\s+(.+?)\s*do\s*%>/g,
  fragmentCacheRuby: /cache\s+(.+?)\s+do/g,
  railsCacheFetch: /Rails\.cache\.fetch\s*\((.+?)\)/g,
  railsCacheOps: /Rails\.cache\.(?:read|write|delete|exist\?)\s*\((.+?)\)/g,
  touch: /touch:\s*true/,
  stale: /stale\?\s*\((.+?)\)/g,
  freshWhen: /fresh_when\s*\((.+?)\)/g,
  expiresIn: /expires_in\s+(.+)/g,
  httpCacheForever: /http_cache_forever/,
  railsCache: /Rails\.cache\./g,
  russianDoll: /<%\s*cache\s+\[(.+?)\]\s*do\s*%>/g,
  cacheKey: /cache_key/g,
  cachesAction: /caches_action\s+:(\w+)/g,
}
