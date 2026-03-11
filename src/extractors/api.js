/**
 * API Extractor (#15)
 * Extracts API configuration, serializers, pagination, rate limiting, CORS, GraphQL.
 * Also reports JSON endpoints and Rails-native rate limiting even without a formal API layer.
 */

import { API_PATTERNS } from '../core/patterns.js'

/**
 * Extract API information.
 * @param {import('../providers/interface.js').FileProvider} provider
 * @param {Array<{path: string, category: string}>} entries
 * @param {{gems?: object}} gemInfo
 * @returns {object}
 */
export function extractApi(provider, entries, gemInfo = {}) {
  const gems = gemInfo.gems || {}
  const result = {
    api_only: false,
    versioning: [],
    serialization: null,
    pagination: null,
    rate_limiting: null,
    cors: null,
    graphql: null,
    json_endpoints: [],
    summary: null,
  }

  // API-only mode
  const appContent = provider.readFile('config/application.rb')
  if (appContent && API_PATTERNS.apiOnly.test(appContent)) {
    result.api_only = true
  }

  // API version namespaces from paths
  const versionSet = new Set()
  for (const entry of entries) {
    const vMatch = entry.path.match(/\/api\/v(\d+)\//)
    if (vMatch) versionSet.add(`v${vMatch[1]}`)
  }
  result.versioning = [...versionSet].sort()

  // Serialization
  const serializerGem = gems['jsonapi-serializer']
    ? 'jsonapi-serializer'
    : gems.alba
      ? 'alba'
      : gems.blueprinter
        ? 'blueprinter'
        : gems.active_model_serializers
          ? 'active_model_serializers'
          : gems.jbuilder
            ? 'jbuilder'
            : null

  if (serializerGem) {
    result.serialization = { gem: serializerGem, serializers: [] }
    const serEntries = entries.filter(
      (e) => e.path.includes('serializer') || e.path.includes('blueprint'),
    )
    for (const entry of serEntries) {
      const content = provider.readFile(entry.path)
      if (!content) continue
      const classMatch =
        content.match(API_PATTERNS.serializerClass) ||
        content.match(API_PATTERNS.blueprintClass)
      if (classMatch) {
        const attrs = content.match(API_PATTERNS.serializerAttributes)
        result.serialization.serializers.push({
          class: classMatch[1],
          attributes: attrs ? attrs[1].trim() : null,
        })
      }
    }
  }

  // Pagination
  const paginationGem = gems.pagy
    ? 'pagy'
    : gems.kaminari
      ? 'kaminari'
      : gems.will_paginate
        ? 'will_paginate'
        : null
  if (paginationGem) {
    result.pagination = { gem: paginationGem }
  }

  // Rate limiting — rack-attack gem
  const rateLimitThrottles = []
  if (gems['rack-attack']) {
    const rackContent = provider.readFile('config/initializers/rack_attack.rb')
    if (rackContent) {
      const throttleRe = new RegExp(API_PATTERNS.rackAttackThrottle.source, 'g')
      let m
      while ((m = throttleRe.exec(rackContent))) {
        rateLimitThrottles.push(m[1].trim())
      }
    }
  }

  // Rate limiting — Rails 8 native rate_limit in controllers
  const nativeRateLimits = []
  const controllerEntries = entries.filter(
    (e) => e.categoryName === 'controllers' || e.category === 'controller',
  )
  for (const entry of controllerEntries) {
    const content = provider.readFile(entry.path)
    if (!content) continue
    const ctrlMatch = content.match(/class\s+(\w+(?:::\w+)*)/)
    const ctrlName = ctrlMatch
      ? ctrlMatch[1]
      : entry.path.split('/').pop().replace('.rb', '')
    const rlRe =
      /rate_limit\s+to:\s*(\d+),\s*within:\s*([^,\n]+?)(?:,\s*only:\s*(?:%i\[([^\]]+)\]|:(\w+)|\[([^\]]+)\]))?/gm
    let rl
    while ((rl = rlRe.exec(content))) {
      nativeRateLimits.push({
        controller: ctrlName,
        to: parseInt(rl[1], 10),
        within: rl[2].trim(),
        only: rl[3] || rl[4] || rl[5] || null,
      })
    }
  }

  if (
    gems['rack-attack'] ||
    nativeRateLimits.length > 0 ||
    rateLimitThrottles.length > 0
  ) {
    result.rate_limiting = {
      gem: gems['rack-attack'] ? 'rack-attack' : null,
      throttles: rateLimitThrottles,
      rails_native: nativeRateLimits.length > 0 ? nativeRateLimits : null,
    }
  } else {
    result.rate_limiting = null
  }

  // CORS
  const corsContent = provider.readFile('config/initializers/cors.rb')
  if (corsContent && API_PATTERNS.corsConfig.test(corsContent)) {
    result.cors = { origins: [] }
    const originsRe = new RegExp(API_PATTERNS.corsOrigins.source, 'g')
    let m
    while ((m = originsRe.exec(corsContent))) {
      const origins =
        m[1].match(/['"]([^'"]+)['"]/g)?.map((o) => o.replace(/['"]/g, '')) ||
        []
      result.cors.origins.push(...origins)
    }
  }

  // GraphQL
  if (gems['graphql']) {
    result.graphql = { schema: null, types: [], mutations: [] }
    const graphqlEntries = entries.filter(
      (e) => e.path.startsWith('app/graphql/') && e.path.endsWith('.rb'),
    )
    for (const entry of graphqlEntries) {
      const content = provider.readFile(entry.path)
      if (!content) continue
      const schemaMatch = content.match(API_PATTERNS.graphqlSchema)
      if (schemaMatch) result.graphql.schema = schemaMatch[1]
      const typeRe = new RegExp(API_PATTERNS.graphqlType.source, 'g')
      let m
      while ((m = typeRe.exec(content))) result.graphql.types.push(m[1])
      const mutRe = new RegExp(API_PATTERNS.graphqlMutation.source, 'g')
      while ((m = mutRe.exec(content))) result.graphql.mutations.push(m[1])
    }
  }

  // JSON endpoints — detect controllers responding to JSON / format.json
  for (const entry of controllerEntries) {
    const content = provider.readFile(entry.path)
    if (!content) continue
    if (
      /respond_to\s*(?:do)?\s*.*json|format\.json|render\s+json:|\.json\b/.test(
        content,
      )
    ) {
      const ctrlMatch = content.match(/class\s+(\w+(?:::\w+)*)/)
      if (ctrlMatch) {
        result.json_endpoints.push({
          controller: ctrlMatch[1],
          file: entry.path,
          note: 'responds to JSON',
        })
      }
    }
  }

  // Explicit absent flags for common API concerns
  result.api_absent = {
    api_only: !result.api_only,
    versioning: result.versioning.length === 0,
    serializers: !result.serialization,
    cors: !result.cors,
    graphql: !result.graphql,
    pagination: !result.pagination,
  }

  // Positive search for API authentication patterns — explicit found/not_found
  // Combine all already-read controller content into one string for pattern scanning
  const allControllerContent = controllerEntries
    .map((e) => provider.readFile(e.path) || '')
    .join('\n')
  const gemfileContent = provider.readFile('Gemfile') || ''
  const scanContent = allControllerContent + '\n' + gemfileContent
  const apiAuthPatternChecks = [
    {
      key: 'jwt',
      re: /\bjwt\b|json_web_token|JWT\./i,
      description: 'JWT tokens',
    },
    {
      key: 'api_key',
      re: /api[_\-]key|x-api-key/i,
      description: 'API key header auth',
    },
    {
      key: 'bearer_token',
      re: /\bbearer\b|authenticate_with_http_token/i,
      description: 'Bearer token / HTTP token auth',
    },
    {
      key: 'doorkeeper_oauth',
      re: /doorkeeper|::Doorkeeper/i,
      description: 'Doorkeeper OAuth',
    },
    {
      key: 'devise_jwt',
      re: /devise-jwt|devise\/jwt/i,
      description: 'Devise JWT',
    },
    {
      key: 'token_auth',
      re: /token_authenticatable|has_secure_token\s+:auth/i,
      description: 'Token authenticatable',
    },
  ]
  result.pattern_search_results = apiAuthPatternChecks.map(
    ({ key, re, description }) => ({
      key,
      description,
      found: re.test(scanContent),
    }),
  )
  const anyApiAuth = result.pattern_search_results.some((p) => p.found)
  result.api_auth_present = anyApiAuth
  if (!anyApiAuth) {
    result.api_auth_summary =
      'No API authentication patterns detected. App uses session-cookie auth only.'
  }

  // Human-readable summary
  const parts = []
  if (result.api_only) parts.push('API-only Rails app')
  if (result.versioning.length > 0)
    parts.push(`versioned API (${result.versioning.join(', ')})`)
  if (
    !result.api_only &&
    result.json_endpoints.length === 0 &&
    !result.versioning.length
  ) {
    parts.push('No formal API layer')
  }
  if (result.json_endpoints.length > 0) {
    parts.push(`${result.json_endpoints.length} JSON endpoint(s)`)
  }
  if (nativeRateLimits.length > 0) {
    parts.push(
      `Rails 8 native rate limiting on ${[...new Set(nativeRateLimits.map((r) => r.controller))].join(', ')}`,
    )
  }
  if (result.serialization)
    parts.push(`serialization via ${result.serialization.gem}`)
  if (result.graphql) parts.push('GraphQL API')
  result.summary = parts.join('. ') + '.'

  return result
}
