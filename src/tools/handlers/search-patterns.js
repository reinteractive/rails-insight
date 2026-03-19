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
        if (model.callbacks) {
          for (const cb of model.callbacks) {
            if (
              cb.type?.toLowerCase().includes(lowerPattern) ||
              cb.name?.toLowerCase().includes(lowerPattern)
            ) {
              matches.push({ type: 'callback', detail: cb })
            }
          }
        }
        if (model.concerns) {
          for (const concern of model.concerns) {
            if (concern.toLowerCase().includes(lowerPattern))
              matches.push({ type: 'concern', detail: concern })
          }
        }
        if (lowerPattern.startsWith('devise') && model.devise_modules) {
          const moduleName = lowerPattern.replace('devise_', '')
          if (model.devise_modules.includes(moduleName))
            matches.push({ type: 'devise_module', detail: moduleName })
        }
        if (model.enums && lowerPattern.includes('enum')) {
          for (const [enumName, enumData] of Object.entries(model.enums)) {
            matches.push({
              type: 'enum',
              detail: { name: enumName, ...enumData },
            })
          }
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
        const filters = ctrl.before_actions || ctrl.filters || []
        for (const f of filters) {
          const filterStr = typeof f === 'string' ? f : f.name || f.method || ''
          if (filterStr.toLowerCase().includes(lowerPattern))
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
