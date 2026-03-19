import { z } from 'zod'
import { formatOutput } from '../../core/formatter.js'
import { noIndex, respond } from './helpers.js'
import { DEFAULT_FULL_INDEX_BUDGET } from '../../core/constants.js'

/**
 * Register the get_full_index tool.
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 * @param {Object} state - Mutable state with { index, provider, verbose }
 */
export function register(server, state) {
  server.tool(
    'get_full_index',
    'Complete index JSON trimmed to fit a specified token budget.',
    {
      token_budget: z
        .number()
        .optional()
        .default(DEFAULT_FULL_INDEX_BUDGET)
        .describe('Maximum token budget (default: 12000)'),
    },
    async ({ token_budget = DEFAULT_FULL_INDEX_BUDGET }) => {
      if (!state.index) return noIndex()
      const trimmed = formatOutput(state.index, token_budget)
      return respond(trimmed)
    },
  )
}
