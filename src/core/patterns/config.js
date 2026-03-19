/**
 * Regex patterns for Rails configuration extraction (Section 7.2).
 */
export const CONFIG_PATTERNS = {
  loadDefaults: /config\.load_defaults\s+(\d+\.\d+)/,
  apiOnly: /config\.api_only\s*=\s*true/,
  timeZone: /config\.time_zone\s*=\s*['"]([^'"]+)['"]/,
  queueAdapter: /config\.active_job\.queue_adapter\s*=\s*:(\w+)/,
  cacheStore: /config\.cache_store\s*=\s*:(\w+)/,
  forceSSL: /config\.force_ssl\s*=\s*true/,
  filterParameters: /config\.filter_parameters\s*\+=\s*\[([^\]]+)\]/,
  railsConfigure: /Rails\.application\.configure\s+do/,
  configSetting: /config\.\w+(?:\.\w+)*\s*=/g,
  initializer: /initializer\s+['"]([^'"]+)['"]/g,
}
