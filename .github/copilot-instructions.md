# RailsInsight MCP Server

## Architecture
Node.js MCP server using @modelcontextprotocol/sdk over stdio.
Regex-based Rails extraction across 21 pattern files in src/core/patterns/.
Directed weighted graph with Personalized PageRank in src/core/graph.js.
All tools registered via McpServer.tool() in src/tools/.

## Commands
- npm test: Vitest full suite
- npx vitest run test/[path]: Single test file
- npm run test:core: Core layer tests
- npm run test:extractors: Extractor tests
- npm run test:mcp: MCP tool handler tests

## Code style
- ES modules (import/export), never CommonJS
- No TypeScript — plain JavaScript with JSDoc annotations
- Zod schemas for MCP tool input validation
- Two-space indentation, single quotes for strings

## Naming
- Files: kebab-case (blast-radius.js, diff-parser.js)
- Functions: camelCase (computeBlastRadius, buildGraph)
- Classes: PascalCase (Graph, LocalFSProvider)
- Constants: SCREAMING_SNAKE (EDGE_WEIGHTS, DEFAULT_TOKEN_BUDGET)

## Import patterns
- Relative imports with .js extension: import { foo } from './bar.js'
- Named exports only, no default exports
- Group: node builtins first, then dependencies, then local modules

## Testing
- Vitest: import { describe, it, expect, vi } from 'vitest'
- Mock providers: inline objects implementing FileProvider interface
- Pattern: describe('functionName') → it('does specific thing') → arrange/act/assert
- Async tests: async/await directly in it() callbacks
- No shared test factories — each test builds its own mock inline

## Error handling
- Extractors: wrapped in safeExtract(name, fn, fallback, verbose, errors) — never throw
- Tool handlers: return respond({ error: message }) — never throw
- Bridge/external: try/catch, always return result shape with error field

## Key patterns to follow
- FileProvider interface: src/providers/interface.js
- execCommand usage: src/git/diff-parser.js
- Error boundary: safeExtract in src/core/indexer.js
- Graph edges: EDGE_WEIGHTS + graph.addEdge() in src/core/graph.js
- MCP tool handler: src/tools/handlers/get-model.js
- Token estimation: src/utils/token-counter.js
