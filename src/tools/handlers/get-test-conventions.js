import { noIndex, respond } from './helpers.js'

/**
 * Register the get_test_conventions tool.
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 * @param {Object} state - Mutable state with { index, provider, verbose }
 */
export function register(server, state) {
  server.tool(
    'get_test_conventions',
    'Returns detected test patterns and conventions: spec style (request vs controller), let style, auth helper, factories, shared examples, custom matchers, and pattern reference files.',
    {},
    async () => {
      if (!state.index) return noIndex()
      return respond(state.index.extractions?.test_conventions || {})
    },
  )
}
