import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { LocalFSProvider } from './providers/local-fs.js'
import { buildIndex } from './core/indexer.js'
import { registerTools } from './tools/index.js'

/**
 * Create an MCP server with tool registrations.
 * @param {Object} options
 * @param {Object} options.index - Pre-built index (null if not yet built)
 * @param {string} options.tier - 'free' | 'pro' | 'team'
 * @param {boolean} options.verbose - Enable verbose logging
 * @param {import('./providers/interface.js').FileProvider} [options.provider] - File provider for re-indexing
 * @returns {McpServer}
 */
export function createServer(options) {
  const server = new McpServer({
    name: 'railsinsight',
    version: '0.1.0',
    capabilities: { tools: {} },
  })

  registerTools(server, options)

  return server
}

/**
 * Start the server in local mode with stdio transport.
 * @param {string} projectRoot - Absolute path to Rails project
 * @param {Object} options
 */
export async function startLocal(projectRoot, options = {}) {
  const provider = new LocalFSProvider(projectRoot)
  const verbose = options.verbose || false

  if (verbose) {
    process.stderr.write(`[railsinsight] Indexing ${projectRoot}...\n`)
  }

  const index = await buildIndex(provider, {
    claudeMdPath: options.claudeMdPath,
    verbose,
  })

  if (verbose) {
    process.stderr.write(`[railsinsight] Index built. Starting MCP server...\n`)
  }

  const server = createServer({
    index,
    provider,
    tier: options.tier || 'pro',
    verbose,
  })

  const transport = new StdioServerTransport()
  await server.connect(transport)
}

/**
 * Start the server in remote mode with Streamable HTTP transport.
 * @param {Object} options
 */
export async function startRemote(options = {}) {
  // Remote mode is deferred to Phase 7
  console.error('Remote mode is not yet implemented. Use local mode.')
  process.exit(1)
}
