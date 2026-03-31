import { createRequire } from 'node:module'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { LocalFSProvider } from './providers/local-fs.js'
import { buildIndex } from './core/indexer.js'
import { registerTools } from './tools/index.js'

const require = createRequire(import.meta.url)
const { version: PKG_VERSION } = require('../package.json')

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
    version: PKG_VERSION,
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
  const noIntrospection = options.noIntrospection || false

  // Connect the transport immediately so VS Code's MCP handshake completes
  // without waiting for the index to be built. Tools return a "not ready"
  // response until state.index is populated below.
  const server = new McpServer({
    name: 'railsinsight',
    version: PKG_VERSION,
    capabilities: { tools: {} },
  })

  const state = registerTools(server, {
    index: null,
    provider,
    tier: options.tier || 'pro',
    verbose,
  })

  const transport = new StdioServerTransport()
  await server.connect(transport)

  // Keep the event loop alive so Node.js doesn't exit when startLocal returns.
  // StdioServerTransport adds a 'data' listener to stdin but does not call
  // resume(), so without this the process exits immediately on idle stdin.
  process.stdin.resume()

  // Yield to the event loop before running the synchronous buildIndex pipeline.
  // This lets the MCP SDK process the VS Code initialize handshake that arrived
  // on stdin while we were awaiting connect(), preventing a timeout on the
  // client side before any tools have been registered.
  await new Promise((resolve) => setImmediate(resolve))

  if (verbose) {
    process.stderr.write(`[railsinsight] Indexing ${projectRoot}...\n`)
  }

  const index = await buildIndex(provider, {
    claudeMdPath: options.claudeMdPath,
    verbose,
    noIntrospection,
  })

  state.index = index

  if (verbose) {
    process.stderr.write(`[railsinsight] Index built.\n`)
  }
}

/**
 * Start the server in remote mode with Streamable HTTP transport.
 * @param {Object} options
 */
export async function startRemote(options = {}) {
  throw new Error('Remote mode is not yet implemented. Use local mode.')
}
