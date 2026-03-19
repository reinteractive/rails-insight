/**
 * Tier 3 Extractor (#41-56)
 * Detection-only extraction for tertiary categories,
 * primarily Gemfile-based gem presence checks.
 */

/**
 * Detect the first matching gem from the given names.
 * @param {object} gems - Gem lookup object
 * @param {...string} names - Gem names to check in priority order
 * @returns {{gem: string}|null}
 */
function detectGem(gems, ...names) {
  for (const n of names) {
    if (gems[n]) return { gem: n }
  }
  return null
}

/**
 * Detect all matching gems from the given names.
 * @param {object} gems - Gem lookup object
 * @param {...string} names - Gem names to check
 * @returns {{gems: string[]}|null}
 */
function detectGems(gems, ...names) {
  const found = names.filter((n) => gems[n])
  return found.length > 0 ? { gems: found } : null
}

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
    feature_flags: detectGem(gems, 'flipper', 'unleash'),
    audit: detectGem(gems, 'paper_trail', 'audited', 'logidze'),
    soft_delete: detectGem(gems, 'discard', 'paranoia'),
    pagination: detectGem(gems, 'pagy', 'kaminari', 'will_paginate'),
    friendly_urls: detectGem(gems, 'friendly_id'),
    tagging: detectGem(gems, 'acts-as-taggable-on'),
    seo: detectGems(gems, 'meta-tags', 'sitemap_generator'),
    geolocation: detectGem(gems, 'geocoder', 'rgeo'),
    sms_push: detectGems(gems, 'twilio-ruby', 'web-push'),
    activity_tracking: detectGem(gems, 'public_activity'),
    data_import_export: extractDataImportExport(entries),
    event_sourcing: detectGem(gems, 'rails_event_store', 'sequent'),
    dry_rb: detectGems(
      gems,
      'dry-validation',
      'dry-monads',
      'dry-types',
      'dry-struct',
    ),
    markdown: detectGem(gems, 'redcarpet', 'kramdown', 'commonmarker'),
    rate_limiting: detectGem(gems, 'rack-attack'),
    graphql: extractGraphql(entries, gems),
  }
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

/** #56 */
function extractGraphql(entries, gems) {
  if (!gems.graphql) return null
  const schema = entries.some(
    (e) => e.path.startsWith('app/graphql/') && e.path.includes('schema'),
  )
  return { gem: 'graphql', schema }
}
