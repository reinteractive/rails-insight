# Contributing to RailsInsight

Thank you for your interest in contributing! This guide will help you get started.

## Getting Started

1. Fork the repository and clone your fork
2. Install dependencies:

```bash
npm install
```

3. Run the test suite to verify your setup:

```bash
npm test
```

## Development Workflow

### Running Tests

```bash
npm test                    # Run all tests
npm run test:watch          # Watch mode
npm run test:core           # Core layer only
npm run test:extractors     # Extractor tests
npm run test:patterns       # Rails pattern regex tests
npm run test:edge           # Edge case tests
npm run test:perf           # Performance benchmarks
npm run test:cross-version  # Cross-version Rails matrix
npm run test:mcp            # MCP protocol tests
npm run test:coverage       # Run with coverage report
```

### Project Structure

```
src/
  server.js              # MCP server bootstrap
  core/                  # Indexer, graph, scanner, formatter
  extractors/            # 19 domain-specific extractors
  git/                   # Git diff parsing
  providers/             # File system abstraction
  tools/                 # MCP tool handlers
  utils/                 # Shared utilities
test/
  core/                  # Unit tests for core modules
  extractors/            # Unit tests for each extractor
  patterns/              # Regex pattern validation tests
  fixtures/              # Rails app fixtures (6.1, 7.0, 8.1)
  edge-cases/            # Edge case scenarios
  performance/           # Benchmark tests
  integration/           # Full pipeline tests
```

## Adding a New Extractor

1. Create `src/extractors/your-domain.js` exporting an extraction function:

```js
/**
 * @param {Map<string, Array<{path: string}>>} filesByCategory
 * @param {import('../providers/interface.js').FileProvider} provider
 * @param {Object} context - { versions, gemInfo, ... }
 * @returns {Object}
 */
export function extractYourDomain(filesByCategory, provider, context) {
  const files = filesByCategory.get('your_category') || []
  const results = {}

  for (const entry of files) {
    const content = provider.readFile(entry.path)
    if (!content) continue
    // Parse content and build results...
  }

  return results
}
```

2. Add a classification rule in `src/core/scanner.js`:

```js
{ test: (p) => p.includes('app/your_domain/'), category: NEW_CATEGORY_NUMBER },
```

3. Wire it into the indexer in `src/core/indexer.js`.

4. Add tests in `test/extractors/your-domain.test.js` using `createMemoryProvider()` from `test/helpers/mock-provider.js`.

## Tool Tiers

MCP tools are organised into three modules:

| Module                 | File                              | Description                                                                                                                                                                                                         |
| ---------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Free tools**         | `src/tools/free-tools.js`         | 15 core tools (overview, model, controller, routes, schema, subgraph, patterns, deep analysis, coverage gaps, test conventions, domain clusters, factory registry, well-tested examples, full index, index project) |
| **Blast radius tools** | `src/tools/blast-radius-tools.js` | 2 tools for change-impact analysis (`get_blast_radius`, `get_review_context`)                                                                                                                                       |
| **Pro tools**          | `src/tools/pro-tools.js`          | Reserved for future premium features                                                                                                                                                                                |

Each tool handler lives in its own file under `src/tools/handlers/` and exports a `register(server, state)` function.

## Code Style

- **No semicolons**, single quotes, 2-space indent (enforced by Prettier defaults)
- **ESM modules** — use `import`/`export`, not `require()`
- **No TypeScript** — pure JavaScript with JSDoc type annotations
- **Naming**: `camelCase` for functions and variables, `PascalCase` for classes, `UPPER_SNAKE_CASE` for constants
- All exported functions should have JSDoc with `@param` and `@returns`
- Use `zod` schemas for MCP tool input validation

## Error Handling Patterns

- **MCP tool handlers**: Return errors as JSON via `respond({ error: '...' })` — never throw from a tool handler
- **Core functions**: Throw `Error` for programmer mistakes; return error objects for expected failures
- **Index not built**: Every tool handler should check `state.index` and return `noIndex()` if missing
- Use the shared helpers from `src/tools/handlers/helpers.js`: `respond()`, `noIndex()`, `toTableName()`, `pathToClassName()`

## Test Coverage

- All new code must include tests in the corresponding `test/` subdirectory
- Run `npm run test:coverage` to check your coverage — aim for the existing baseline or better
- Use `createMemoryProvider()` from `test/helpers/mock-provider.js` to create in-memory file system fixtures
- Test fixtures for different Rails versions live in `test/fixtures/` (6.1-classic, 7.0-hotwire, 8.1-full)

## Submitting Changes

1. Create a feature branch from `main`
2. Make your changes with clear, focused commits
3. Ensure all tests pass: `npm test`
4. Open a pull request with a clear description of what changed and why

### Pull Request Guidelines

- Keep PRs focused on a single concern
- Include tests for new functionality
- Update documentation if adding new tools or extractors
- Follow existing code style (no semicolons, single quotes, 2-space indent)

## Reporting Issues

Use the [GitHub issue tracker](https://github.com/reinteractive/rails-insight/issues). For bugs, please include:

- RailsInsight version (`npx @reinteractive/railsinsight --help`)
- Node.js version (`node --version`)
- Rails version of the target project
- Steps to reproduce
- Expected vs actual behaviour

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.
