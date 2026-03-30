import { z } from 'zod'
import { buildIndex } from '../../core/indexer.js'
import { respond } from './helpers.js'

/**
 * Register the index_project tool.
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 * @param {Object} state - Mutable state with { index, provider, verbose }
 */
export function register(server, state) {
  server.tool(
    'index_project',
    'Re-index the Rails project. In local mode, re-scans the project root. Returns statistics and duration.',
    {
      force: z
        .boolean()
        .optional()
        .describe('Force full re-index even if cached'),
    },
    async ({ force }) => {
      if (!state.provider) {
        return respond({
          error: 'No project root configured. Start with --project-root.',
        })
      }
      const start = Date.now()
      state.index = null
      state.index = await buildIndex(state.provider, { verbose: state.verbose })
      const duration_ms = Date.now() - start
      return respond({
        status: 'success',
        statistics: state.index.statistics,
        duration_ms,
      })
    },
  )
}
