# RailsInsight [Experimental Beta version]

[![npm version](https://img.shields.io/npm/v/@reinteractive/rails-insight.svg)](https://www.npmjs.com/package/@reinteractive/rails-insight)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](LICENSE)

A Rails-aware codebase indexer that runs as an MCP (Model Context Protocol) server, giving AI coding agents deep structural understanding of your Rails application — models, associations, routes, schema, authentication, jobs, components, and 56 total file categories — without reading every file.

## Why RailsInsight?

Generic code-analysis tools treat Ruby files as plain text. RailsInsight understands **Rails conventions**: `has_many :through`, `before_action` filters, Devise modules, Pundit policies, Turbo Stream broadcasts, Solid Queue jobs, and more. It builds a directed weighted graph of your entire app and exposes it through MCP tools so your AI agent can reason about impact, dependencies, and architecture — without consuming your entire codebase in tokens.

## Installation

First insall the package globally, which will install the MCP server locally, allowing your AI agents to run the indexing tooling.

```bash
npm install -g @reinteractive/rails-insight
```

## Claude Code Integration

Add to your Claude Code MCP configuration:

```json
{
  "mcpServers": {
    "railsinsight": {
      "command": "node",
      "args": ["/opt/homebrew/lib/node_modules/@reinteractive/rails-insight/bin/railsinsight.js", "-p", "."]
    }
  }
}
```

## Cursor Integration

In your `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "railsinsight": {
      "command": "node",
      "args": ["/opt/homebrew/lib/node_modules/@reinteractive/rails-insight/bin/railsinsight.js", "-p", "."]
    }
  }
}
```

## VS Code Integration

In your VS Code `.mcp.json` file (or `.vscode/mcp.json`):

```json
{
  "servers": {
    "railsinsight": {
      "type": "stdio",
      "command": "node",
      "args": ["/opt/homebrew/lib/node_modules/@reinteractive/rails-insight/bin/railsinsight.js"]
    }
  }
}
```

## Available Tools

All 17 tools are available with no tier restrictions.

### Core Tools

| Tool                | Description                                                                                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index_project`     | Re-index the Rails project. In local mode, re-scans the project root. Accepts `force` (boolean) to bypass cache. Returns statistics and duration.                               |
| `get_overview`      | Project summary: Rails/Ruby versions, database, auth strategy, key models and controllers, frontend stack, file counts. Call this first.                                        |
| `get_full_index`    | Complete index JSON trimmed to fit a specified token budget (default: 12,000 tokens).                                                                                           |
| `get_model`         | Deep extraction for a specific model: associations, validations, scopes with queries, enums with values, callbacks, public methods, database columns. Requires `name`.          |
| `get_controller`    | Deep extraction for a specific controller: actions with routes, filters, rate limiting, strong params, rescue handlers. Requires `name`.                                        |
| `get_routes`        | Complete route map with namespaces, nested resources, member/collection routes.                                                                                                 |
| `get_schema`        | Database schema with tables, columns, indexes, foreign keys, and model-to-table mapping.                                                                                        |
| `get_subgraph`      | Skill-scoped relationship subgraph with ranked files. Skills: `authentication`, `database`, `frontend`, `api`, `jobs`, `email`.                                                 |
| `search_patterns`   | Search across all extractions for a specific Rails pattern type (e.g. `has_many_through`, `before_action`, `turbo_broadcast`).                                                  |
| `get_deep_analysis` | Deep analysis for a specific category. Categories: `authentication`, `authorization`, `jobs`, `email`, `storage`, `caching`, `realtime`, `api_patterns`, `dependencies`, `cela` |

### Test Intelligence Tools

| Tool                       | Description                                                                                                                                                             |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_coverage_gaps`        | Prioritised list of files needing test coverage, with structural context and per-method coverage data from SimpleCov. Accepts optional `category`, `min_gap`, and `l... |
| `get_test_conventions`     | Detected test patterns and conventions: spec style (request vs controller), let style, auth helper, factories, shared examples, custom matchers, and pattern referen... |
| `get_domain_clusters`      | Domain-clustered file groups for parallel test generation. Files in the same cluster share associations and factories; different clusters can be worked on simultane... |
| `get_factory_registry`     | Parsed FactoryBot factory definitions including attributes, traits, sequences, and associations. Accepts optional `model` to filter by factory name.                    |
| `get_well_tested_examples` | High-quality existing spec files suitable as pattern references for test generation agents. Selected by structural complexity per spec category. Accepts `category` ... |

### Blast Radius Tools

| Tool                 | Description                                                                                                                                                                   |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_blast_radius`   | Analyse the impact of code changes. Accepts explicit file paths or auto-detects from git diff. Returns impacted entities classified by risk level (CRITICAL/HIGH/MEDIUM/LO... |
| `get_review_context` | Build a token-budget-aware review summary for changed files. Combines blast radius analysis with relevant code context for AI-assisted code review. Accepts `files`, `base... |

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

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Running Tests

```bash
npm test                   # Run all tests
npm run test:watch         # Watch mode
npm run test:core          # Core layer tests only
npm run test:extractors    # Extractor tests
npm run test:patterns      # Rails pattern tests
npm run test:coverage      # Run with coverage
```

## Limitations

RailsInsight uses regex-based extraction rather than a full Ruby AST parser. This handles the vast majority of real-world Rails code, but may miss unconventional patterns such as:

- Multi-line method calls split across 3+ lines
- Metaprogrammed associations or validations
- Dynamic class definitions

If you encounter a pattern that isn't detected, please [open an issue](https://github.com/reinteractive/rails-insight/issues).

## License

ISC — see [LICENSE](LICENSE) for details.
