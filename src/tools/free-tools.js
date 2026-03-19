/**
 * Primary MCP tools — always registered regardless of tier.
 * Each tool handler lives in its own file under ./handlers/.
 * This barrel imports all handlers and wires them up.
 */

import { register as indexProject } from './handlers/index-project.js'
import { register as getOverview } from './handlers/get-overview.js'
import { register as getFullIndex } from './handlers/get-full-index.js'
import { register as getModel } from './handlers/get-model.js'
import { register as getController } from './handlers/get-controller.js'
import { register as getRoutes } from './handlers/get-routes.js'
import { register as getSchema } from './handlers/get-schema.js'
import { register as getSubgraph } from './handlers/get-subgraph.js'
import { register as searchPatterns } from './handlers/search-patterns.js'
import { register as getDeepAnalysis } from './handlers/get-deep-analysis.js'
import { register as getCoverageGaps } from './handlers/get-coverage-gaps.js'
import { register as getTestConventions } from './handlers/get-test-conventions.js'
import { register as getDomainClusters } from './handlers/get-domain-clusters.js'
import { register as getFactoryRegistry } from './handlers/get-factory-registry.js'
import { register as getWellTestedExamples } from './handlers/get-well-tested-examples.js'

/**
 * Register all primary tools on the MCP server.
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 * @param {Object} state - Mutable state object with { index, provider, verbose }
 */
export function registerFreeTools(server, state) {
  indexProject(server, state)
  getOverview(server, state)
  getFullIndex(server, state)
  getModel(server, state)
  getController(server, state)
  getRoutes(server, state)
  getSchema(server, state)
  getSubgraph(server, state)
  searchPatterns(server, state)
  getDeepAnalysis(server, state)
  getCoverageGaps(server, state)
  getTestConventions(server, state)
  getDomainClusters(server, state)
  getFactoryRegistry(server, state)
  getWellTestedExamples(server, state)
}
