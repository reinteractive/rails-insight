/**
 * Central tool registration with tier gating.
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 * @param {Object} options
 * @param {Object} [options.index] - Pre-built index
 * @param {import('../providers/interface.js').FileProvider} [options.provider] - File provider
 * @param {string} [options.tier] - 'free' | 'pro' | 'team'
 * @param {boolean} [options.verbose] - Verbose logging
 */
import { registerFreeTools } from './free-tools.js'
import { registerProTools } from './pro-tools.js'

export function registerTools(server, options) {
  const tier = options.tier || 'free'

  // Mutable state shared between tools
  const state = {
    index: options.index || null,
    provider: options.provider || null,
    verbose: options.verbose || false,
  }

  // Always register all primary tools (they are all in free-tools now)
  registerFreeTools(server, state)

  // registerProTools is now a no-op stub kept for compatibility
  if (tier === 'pro' || tier === 'team') {
    registerProTools(server, state)
  }
}
