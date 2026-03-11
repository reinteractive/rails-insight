# RailsInsight

A Rails-aware codebase indexer that runs as an MCP (Model Context Protocol) server, giving AI coding agents deep structural understanding of your Rails application — models, associations, routes, schema, authentication, jobs, components, and 56 total file categories — without reading every file.

## Quick Start (Local)

```bash
npx @reinteractive/railsinsight
```

This starts a local MCP server over stdio using the current working directory as the Rails project root. The indexer scans your project structure, extracts Rails conventions, builds a relationship graph, and exposes everything through MCP tools.

If you need to point at a different Rails app, override the root explicitly:

```bash
npx @reinteractive/railsinsight --project-root /path/to/your/rails/app
```

## GitHub Packages Setup

RailsInsight is published as a private GitHub Packages package under the `@reinteractive` scope.

1. Create a GitHub Personal Access Token from your personal GitHub account.
2. Grant it `read:packages`, `write:packages`, and `repo` access.
3. If your organization uses SSO, authorize the token for `reinteractive`.
4. Add this to your `~/.npmrc`:

```ini
@reinteractive:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=YOUR_GITHUB_PAT
```

Verify access with:

```bash
npm whoami --registry=https://npm.pkg.github.com
```

### CLI Options

| Flag                    | Description                                      |
| ----------------------- | ------------------------------------------------ |
| `--project-root <path>` | Path to the Rails project (defaults to cwd)      |
| `--claude-md <path>`    | Path to a `claude.md` / `CLAUDE.md` context file |
| `--mode local\|remote`  | Transport mode (default: `local`)                |
| `--port <number>`       | Port for remote mode (default: `3000`)           |
| `--verbose`             | Enable verbose logging to stderr                 |
| `--help`                | Show help                                        |

## Claude Code Integration

Add to your Claude Code MCP configuration:

```json
{
  "mcpServers": {
    "railsinsight": {
      "command": "npx",
      "args": ["@reinteractive/railsinsight"]
    }
  }
}
```

## Cursor / VS Code Integration

In your `.cursor/mcp.json` or VS Code MCP settings:

```json
{
  "mcpServers": {
    "railsinsight": {
      "command": "npx",
      "args": ["@reinteractive/railsinsight"]
    }
  }
}
```

The server uses the workspace directory as the project root automatically, so no path argument is needed for normal project-local use.

## Available Tools

All 10 tools are available with no tier restrictions.

| Tool                | Description                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `index_project`     | Re-index the Rails project. In local mode, re-scans the project root. Accepts `force` (boolean) to bypass cache. Returns statistics and duration.                                                                                                                                                                                                                                                                                                      |
| `get_overview`      | Project summary: Rails/Ruby versions, database, auth strategy, key models and controllers, frontend stack, file counts. Call this first.                                                                                                                                                                                                                                                                                                               |
| `get_full_index`    | Complete index JSON trimmed to fit a specified token budget (default: 12,000 tokens).                                                                                                                                                                                                                                                                                                                                                                  |
| `get_model`         | Deep extraction for a specific model: associations, validations, scopes with queries, enums with values, callbacks, public methods, database columns. Requires `name`.                                                                                                                                                                                                                                                                                 |
| `get_controller`    | Deep extraction for a specific controller: actions with routes, filters, rate limiting, strong params, rescue handlers. Requires `name`.                                                                                                                                                                                                                                                                                                               |
| `get_routes`        | Complete route map with namespaces, nested resources, member/collection routes.                                                                                                                                                                                                                                                                                                                                                                        |
| `get_schema`        | Database schema with tables, columns, indexes, foreign keys, and model-to-table mapping.                                                                                                                                                                                                                                                                                                                                                               |
| `get_subgraph`      | Skill-scoped relationship subgraph with ranked files. Skills: `authentication`, `database`, `frontend`, `api`, `jobs`, `email`.                                                                                                                                                                                                                                                                                                                        |
| `search_patterns`   | Search across all extractions for a specific Rails pattern type (e.g. `has_many_through`, `before_action`, `turbo_broadcast`).                                                                                                                                                                                                                                                                                                                         |
| `get_deep_analysis` | Deep analysis for a specific category. Categories: `authentication`, `authorization`, `jobs`, `email`, `storage`, `caching`, `realtime`, `api_patterns`, `dependencies`, `components`, `stimulus`, `views`, `convention_drift`, `manifest`, `detected_stack`, `related`, `model_list`, `controller_list`, `component_list`. Accepts optional `name` (entity name), `depth` (BFS hops for `related`, default 2), and `token_budget` (for `full_index`). |

## What It Detects

RailsInsight classifies files across **56 categories** using pure path-based analysis:

| #   | Category       | #   | Category         | #   | Category           |
| --- | -------------- | --- | ---------------- | --- | ------------------ |
| 1   | Models         | 20  | Code Quality     | 39  | Rich Text          |
| 2   | Controllers    | 21  | Deployment       | 40  | Notifications      |
| 3   | Routes         | 22  | Search           | 41  | Feature Flags      |
| 4   | Schema         | 23  | Payments         | 42  | Audit              |
| 5   | Components     | 24  | Multi-tenancy    | 43  | Soft Delete        |
| 6   | Stimulus       | 25  | Admin            | 44  | Pagination         |
| 7   | Views          | 26  | Design Patterns  | 45  | Friendly URLs      |
| 8   | Authentication | 27  | State Machines   | 46  | Tagging            |
| 9   | Authorization  | 28  | i18n             | 47  | SEO                |
| 10  | Jobs           | 29  | PDF              | 48  | Geolocation        |
| 11  | Email          | 30  | CSV              | 49  | SMS / Push         |
| 12  | Storage        | 31  | Webhooks         | 50  | Activity Tracking  |
| 13  | Caching        | 32  | Scheduled Tasks  | 51  | Data Import/Export |
| 14  | Realtime       | 33  | Middleware       | 52  | Event Sourcing     |
| 15  | API            | 34  | Engines          | 53  | dry-rb             |
| 16  | Gemfile        | 35  | Credentials      | 54  | Markdown           |
| 17  | Config         | 36  | HTTP Client      | 55  | Rate Limiting      |
| 18  | Security       | 37  | Performance      | 56  | GraphQL            |
| 19  | Testing        | 38  | Database Tooling |     |                    |

Beyond classification, deep extractors analyze file content to extract:

- **Models**: Associations, validations, scopes, enums, callbacks, concerns, Devise modules, broadcasts
- **Controllers**: Actions, before/after/around filters, strong params, rescue handlers, caching
- **Routes**: Resources, namespaces, nesting, member/collection routes, constraints, mounts
- **Schema**: Tables, columns with types, indexes (unique/composite), foreign keys
- **Components**: ViewComponent params, slots, Stimulus connections, sidecar files, previews
- **Auth**: Devise strategy, modules per model, custom controllers, OAuth providers
- **Authorization**: Pundit/CanCanCan policies, roles, permission structures
- **Jobs**: Queue names, retry strategies, callbacks, scheduling, Sidekiq/GoodJob config
- **Email**: Mailer actions, layouts, delivery config, Action Mailbox routing
- **Storage**: Active Storage services, model attachments, variants, direct upload config
- **Caching**: Cache store, fragment caching, Russian doll patterns, counter caches
- **Realtime**: ActionCable channels, Turbo Stream broadcasts, CableReady operations
- **API**: Versioning strategy, serializers, pagination, rate limiting, authentication

## Rails Version Support

| Rails Version | Support Level                                             |
| ------------- | --------------------------------------------------------- |
| 8.0 – 8.1+    | Full support (Solid Queue, Solid Cache, Kamal, Propshaft) |
| 7.0 – 7.2     | Full support (Hotwire, import maps, Turbo)                |
| 6.0 – 6.1     | Full support (Webpacker, Sprockets, legacy enum syntax)   |
| < 6.0         | Basic structural scanning only                            |

## How It Works

RailsInsight processes your Rails project through a 6-layer pipeline:

1. **Context Loader** — Parses `claude.md` / `CLAUDE.md` for declared conventions and project context
2. **Version Detector** — Identifies Rails/Ruby versions, database adapter, asset pipeline, frontend stack, and all gems from `Gemfile.lock`
3. **Structural Scanner** — Classifies every file into 1 of 56 categories using path patterns (zero file reads)
4. **Deep Extractors** — 19 specialized extractors parse file content for models, controllers, routes, schema, components, Stimulus controllers, auth, authorization, jobs, email, storage, caching, realtime, API patterns, views, config, and tier 2/3 patterns
5. **Relationship Graph** — Builds a directed weighted graph with 22 edge types (model→association, controller→model, route→controller, etc.) and computes Personalized PageRank to rank entities by importance
6. **Convention Drift Detector** — Compares declared conventions (from `claude.md`) against actual extracted patterns, reporting mismatches with severity levels

The entire index is built in a single pass, typically under 2 seconds for large projects, and the result is served through MCP tools with token-budget-aware formatting.

## Contributing

### Adding a New Extractor

1. Create `src/extractors/your-domain.js` exporting an async function:

```js
/**
 * @param {Map<string, Array<{path: string}>>} filesByCategory
 * @param {import('../providers/interface.js').FileProvider} provider
 * @param {Object} context - { versions, gemInfo, ... }
 * @returns {Promise<Object>}
 */
export async function extractYourDomain(filesByCategory, provider, context) {
  const files = filesByCategory.get('your_category') || [];
  const results = {};

  for (const entry of files) {
    const content = await provider.readFile(entry.path);
    // Parse content and build results...
  }

  return results;
}
```

2. Add a classification rule in `src/core/scanner.js`:

```js
{ test: (p) => p.includes('app/your_domain/'), category: NEW_CATEGORY_NUMBER },
```

3. Wire it into the indexer in `src/core/indexer.js` by calling your extractor and assigning the result to `extractions.your_domain`.

4. Add tests in `test/extractors/your-domain.test.js` using `createMemoryProvider()` from `test/helpers/mock-provider.js`.

### Running Tests

```bash
npm test                   # Run all tests
npm run test:watch         # Watch mode
npm run test:core          # Core layer tests only
npm run test:extractors    # Extractor tests
npm run test:patterns      # Rails pattern tests
npm run test:contracts     # Contract tests
```

## License

ISC
