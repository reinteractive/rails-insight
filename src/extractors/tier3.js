/**
 * Tier 3 Extractor (#41-56)
 * Detection-only extraction for tertiary categories,
 * primarily Gemfile-based gem presence checks.
 */

/**
 * Extract Tier 3 detection across categories #41-56.
 * @param {import('../providers/interface.js').FileProvider} provider
 * @param {Array<{path: string, category: string}>} entries
 * @param {{gems?: object}} gemInfo
 * @returns {object}
 */
export function extractTier3(provider, entries, gemInfo = {}) {
  const gems = gemInfo.gems || {}

  return {
    feature_flags: extractFeatureFlags(gems),
    audit: extractAudit(gems),
    soft_delete: extractSoftDelete(gems),
    pagination: extractPagination(gems),
    friendly_urls: extractFriendlyUrls(gems),
    tagging: extractTagging(gems),
    seo: extractSeo(gems),
    geolocation: extractGeolocation(gems),
    sms_push: extractSmsPush(gems),
    activity_tracking: extractActivityTracking(gems),
    data_import_export: extractDataImportExport(entries),
    event_sourcing: extractEventSourcing(gems),
    dry_rb: extractDryRb(gems),
    markdown: extractMarkdown(gems),
    rate_limiting: extractRateLimiting(gems),
    graphql: extractGraphql(entries, gems),
  }
}

/** #41 */
function extractFeatureFlags(gems) {
  if (gems.flipper) return { gem: 'flipper' }
  if (gems.unleash) return { gem: 'unleash' }
  return null
}

/** #42 */
function extractAudit(gems) {
  if (gems.paper_trail) return { gem: 'paper_trail' }
  if (gems.audited) return { gem: 'audited' }
  if (gems.logidze) return { gem: 'logidze' }
  return null
}

/** #43 */
function extractSoftDelete(gems) {
  if (gems.discard) return { gem: 'discard' }
  if (gems.paranoia) return { gem: 'paranoia' }
  return null
}

/** #44 */
function extractPagination(gems) {
  if (gems.pagy) return { gem: 'pagy' }
  if (gems.kaminari) return { gem: 'kaminari' }
  if (gems.will_paginate) return { gem: 'will_paginate' }
  return null
}

/** #45 */
function extractFriendlyUrls(gems) {
  if (gems.friendly_id) return { gem: 'friendly_id' }
  return null
}

/** #46 */
function extractTagging(gems) {
  if (gems['acts-as-taggable-on']) return { gem: 'acts-as-taggable-on' }
  return null
}

/** #47 */
function extractSeo(gems) {
  const found = []
  if (gems['meta-tags']) found.push('meta-tags')
  if (gems.sitemap_generator) found.push('sitemap_generator')
  return found.length > 0 ? { gems: found } : null
}

/** #48 */
function extractGeolocation(gems) {
  if (gems.geocoder) return { gem: 'geocoder' }
  if (gems.rgeo) return { gem: 'rgeo' }
  return null
}

/** #49 */
function extractSmsPush(gems) {
  const found = []
  if (gems['twilio-ruby']) found.push('twilio-ruby')
  if (gems['web-push']) found.push('web-push')
  return found.length > 0 ? { gems: found } : null
}

/** #50 */
function extractActivityTracking(gems) {
  if (gems.public_activity) return { gem: 'public_activity' }
  return null
}

/** #51 */
function extractDataImportExport(entries) {
  const detected = entries.some(
    (e) =>
      /import|export/i.test(e.path) &&
      (e.path.startsWith('app/services/') || e.path.startsWith('app/jobs/')),
  )
  return { detected }
}

/** #52 */
function extractEventSourcing(gems) {
  if (gems.rails_event_store) return { gem: 'rails_event_store' }
  if (gems.sequent) return { gem: 'sequent' }
  return null
}

/** #53 */
function extractDryRb(gems) {
  const found = []
  if (gems['dry-validation']) found.push('dry-validation')
  if (gems['dry-monads']) found.push('dry-monads')
  if (gems['dry-types']) found.push('dry-types')
  if (gems['dry-struct']) found.push('dry-struct')
  return found.length > 0 ? { gems: found } : null
}

/** #54 */
function extractMarkdown(gems) {
  if (gems.redcarpet) return { gem: 'redcarpet' }
  if (gems.kramdown) return { gem: 'kramdown' }
  if (gems.commonmarker) return { gem: 'commonmarker' }
  return null
}

/** #55 */
function extractRateLimiting(gems) {
  if (gems['rack-attack']) return { gem: 'rack-attack' }
  return null
}

/** #56 */
function extractGraphql(entries, gems) {
  if (!gems.graphql) return null
  const schema = entries.some(
    (e) => e.path.startsWith('app/graphql/') && e.path.includes('schema'),
  )
  return { gem: 'graphql', schema }
}
