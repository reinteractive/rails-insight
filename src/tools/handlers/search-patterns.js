import { z } from 'zod'
import { noIndex, respond } from './helpers.js'

/**
 * Register the search_patterns tool.
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 * @param {Object} state - Mutable state with { index, provider, verbose }
 */
export function register(server, state) {
  server.tool(
    'search_patterns',
    'Search across all extractions for a specific Rails pattern type (e.g. "has_many_through", "before_action", "turbo_broadcast").',
    {
      pattern: z
        .string()
        .describe(
          'Pattern type to search for (e.g. "has_many_through", "devise_confirmable")',
        ),
    },
    async ({ pattern }) => {
      if (!state.index) return noIndex()

      const results = []
      const extractions = state.index.extractions || {}
      const lowerPattern = pattern.toLowerCase()

      // Patterns that map to a dedicated extraction category.
      // These skip generic substring matching in unrelated sections
      // (callbacks, concerns, validation rules) to avoid false positives.
      const CATEGORY_ONLY = new Set([
        'scope', 'validates', 'validation', 'validate',
        'devise', 'enum', 'enumerize',
        'delegate', 'delegation',
        'has_secure_password', 'secure_password',
      ])
      const isCategoryOnly = CATEGORY_ONLY.has(lowerPattern)

      for (const [name, model] of Object.entries(extractions.models || {})) {
        const matches = []
        if (model.associations) {
          for (const assoc of model.associations) {
            const assocType = assoc.type?.replace(':', '') || ''
            if (
              assocType.includes(lowerPattern) ||
              `${assocType}_${assoc.through || ''}`.includes(lowerPattern)
            ) {
              matches.push({ type: 'association', detail: assoc })
            }
            if (
              lowerPattern === 'has_many_through' &&
              assocType === 'has_many' &&
              assoc.through
            ) {
              matches.push({ type: 'has_many_through', detail: assoc })
            }
          }
        }
        if (!isCategoryOnly && model.callbacks) {
          for (const cb of model.callbacks) {
            if (
              cb.type?.toLowerCase().includes(lowerPattern) ||
              cb.method?.toLowerCase().includes(lowerPattern)
            ) {
              matches.push({ type: 'callback', detail: cb })
            }
          }
        }
        if (!isCategoryOnly && model.concerns) {
          for (const concern of model.concerns) {
            if (concern.toLowerCase().includes(lowerPattern))
              matches.push({ type: 'concern', detail: concern })
          }
        }

        // Validations
        if (model.validations) {
          for (const val of model.validations) {
            const attrStr = (val.attributes || []).join(' ').toLowerCase()
            const rulesStr = (val.rules || '').toLowerCase()
            if (lowerPattern === 'validates' || lowerPattern === 'validation' ||
                (!isCategoryOnly && (attrStr.includes(lowerPattern) || rulesStr.includes(lowerPattern)))) {
              matches.push({ type: 'validation', detail: val })
            }
          }
        }
        if (model.custom_validators) {
          for (const cv of model.custom_validators) {
            if (cv.toLowerCase().includes(lowerPattern) ||
                lowerPattern === 'validates' || lowerPattern === 'validate') {
              matches.push({ type: 'custom_validator', detail: cv })
            }
          }
        }

        // Scopes
        if (model.scopes) {
          for (const scopeName of model.scopes) {
            if (lowerPattern === 'scope' ||
                scopeName.toLowerCase().includes(lowerPattern)) {
              matches.push({
                type: 'scope',
                detail: { name: scopeName, query: model.scope_queries?.[scopeName] || null }
              })
            }
          }
        }

        // Enums
        if (model.enums && Object.keys(model.enums).length > 0) {
          for (const [enumName, enumData] of Object.entries(model.enums)) {
            if (lowerPattern === 'enum' || lowerPattern === 'enumerize' ||
                lowerPattern.includes('enum') ||
                enumName.toLowerCase().includes(lowerPattern)) {
              matches.push({ type: 'enum', detail: { name: enumName, ...enumData } })
            }
          }
        }

        // Devise modules
        if (model.devise_modules && model.devise_modules.length > 0) {
          for (const mod of model.devise_modules) {
            if (lowerPattern === 'devise' ||
                mod.toLowerCase().includes(lowerPattern) ||
                `devise_${mod}`.includes(lowerPattern)) {
              matches.push({ type: 'devise_module', detail: mod })
            }
          }
        }

        // Delegations
        if (model.delegations) {
          for (const del of model.delegations) {
            if (lowerPattern === 'delegate' || lowerPattern === 'delegation' ||
                (del.to && del.to.toLowerCase().includes(lowerPattern))) {
              matches.push({ type: 'delegation', detail: del })
            }
          }
        }

        // has_secure_password
        if (model.has_secure_password &&
            (lowerPattern === 'has_secure_password' || lowerPattern === 'secure_password')) {
          matches.push({ type: 'has_secure_password', detail: true })
        }

        if (lowerPattern.includes('broadcast') && model.broadcasts) {
          matches.push({ type: 'broadcast', detail: model.broadcasts })
        }
        if (matches.length > 0)
          results.push({ entity: name, entity_type: 'model', matches })
      }

      for (const [name, ctrl] of Object.entries(
        extractions.controllers || {},
      )) {
        const matches = []
        const filters = ctrl.filters || []
        for (const f of filters) {
          const filterStr = typeof f === 'string' ? f : f.name || f.method || ''
          const filterType = typeof f === 'string' ? '' : f.type || ''
          if (
            filterStr.toLowerCase().includes(lowerPattern) ||
            filterType.toLowerCase().includes(lowerPattern)
          )
            matches.push({ type: 'filter', detail: f })
        }
        if (matches.length > 0)
          results.push({ entity: name, entity_type: 'controller', matches })
      }

      return respond({
        pattern,
        results,
        total_matches: results.reduce((sum, r) => sum + r.matches.length, 0),
      })
    },
  )
}
