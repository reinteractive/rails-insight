import { z } from 'zod'
import { noIndex, respond } from './helpers.js'
import { MAX_EXAMPLE_CONTENT_LENGTH } from '../../core/constants.js'

/**
 * Register the get_well_tested_examples tool.
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 * @param {Object} state - Mutable state with { index, provider, verbose }
 */
export function register(server, state) {
  server.tool(
    'get_well_tested_examples',
    'Returns high-quality existing spec files suitable as pattern references for test generation agents. Selected by structural complexity (most describe/context blocks) per spec category.',
    {
      category: z
        .string()
        .optional()
        .describe(
          'Filter by spec category (e.g. "model_specs", "request_specs")',
        ),
      limit: z
        .number()
        .optional()
        .describe('Maximum results to return (default: 3)'),
    },
    async ({ category, limit = 3 }) => {
      if (!state.index) return noIndex()
      const conventions = state.index.extractions?.test_conventions || {}
      let refs = conventions.pattern_reference_files || []

      if (category) {
        refs = refs.filter((r) => r.category === category)
      }

      const results = refs.slice(0, limit).map((ref) => {
        const content = state.provider?.readFile(ref.path) || null
        return {
          ...ref,
          content: content
            ? content.slice(0, MAX_EXAMPLE_CONTENT_LENGTH)
            : null,
        }
      })

      return respond({
        examples: results,
        total_available: refs.length,
      })
    },
  )
}
