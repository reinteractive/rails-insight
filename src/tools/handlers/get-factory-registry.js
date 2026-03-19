import { z } from 'zod'
import { noIndex, respond } from './helpers.js'

/**
 * Register the get_factory_registry tool.
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 * @param {Object} state - Mutable state with { index, provider, verbose }
 */
export function register(server, state) {
  server.tool(
    'get_factory_registry',
    'Returns parsed FactoryBot factory definitions including attributes, traits, sequences, and associations. Use to understand what test data factories are available.',
    {
      model: z
        .string()
        .optional()
        .describe('Filter to a specific model/factory name'),
    },
    async ({ model }) => {
      if (!state.index) return noIndex()
      const registry = state.index.extractions?.factory_registry || {}

      if (model) {
        const factory =
          registry.factories?.[model] ||
          registry.factories?.[
            model.replace(/([A-Z])/g, (m, l, i) =>
              i === 0 ? l.toLowerCase() : `_${l.toLowerCase()}`,
            )
          ]
        if (!factory) {
          return respond({
            error: `Factory for '${model}' not found`,
            available: Object.keys(registry.factories || {}),
          })
        }
        return respond(factory)
      }

      return respond(registry)
    },
  )
}
