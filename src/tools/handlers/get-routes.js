import { noIndex, respond } from './helpers.js'

/**
 * Register the get_routes tool.
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 * @param {Object} state - Mutable state with { index, provider, verbose }
 */
export function register(server, state) {
  server.tool(
    'get_routes',
    'Complete route map with namespaces, nested resources, member/collection routes.',
    {},
    async () => {
      if (!state.index) return noIndex()
      return respond(state.index.extractions?.routes || {})
    },
  )
}
