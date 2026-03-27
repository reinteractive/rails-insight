# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.10] - 2026-03-27

### Fixed

- Update Claude Code and Cursor integration examples to use direct `node` path instead of `npx` (avoids PATH resolution issues on macOS with Homebrew)
- Add `-p .` flag to set project root explicitly
- Add `npm root -g` instructions to help users find the correct path

## [1.0.9] - 2026-03-26

### Fixed

- Update VS Code `mcp.json` example to use direct `node` path instead of `npx` to avoid `npx` resolving to a different Node.js installation than expected
- Fix corrupted README heading

## [1.0.8] - 2026-03-26

### Fixed

- Resume `process.stdin` after connecting the stdio transport so Node.js doesn't exit when the event loop goes idle
- Yield to the event loop (via `setImmediate`) between connecting the transport and running `buildIndex`, so the MCP SDK can process VS Code's initialize handshake before the synchronous file-scanning pipeline blocks the thread

## [1.0.7] - 2026-03-26

### Fixed

- Connect MCP stdio transport before building the index so VS Code's initialization handshake completes immediately instead of timing out
- Correct package name in VS Code `mcp.json` documentation (`@reinteractive/rails-insight`, not `railsinsight`)
- Add required `"type": "stdio"` field to VS Code MCP config example
- Add `-y` flag to all `npx` invocations to skip interactive install prompts

## [0.3.0] - 2026-03-20

### Added

- `src/utils/inflector.js` — Ruby-compatible inflector with pluralize, singularize, classify, tableize, and underscore
- `src/utils/spec-style-detector.js` — Shared spec-style detection utility (RSpec vs Minitest)
- Scanner rule for `app/workers/*.rb` and `app/sidekiq/*.rb` → category 10 (jobs) with `workerType: 'sidekiq_native'` flag
- Scanner rule for `app/helpers/*.rb` → category 7 (views)
- Scanner rule for `app/validators/*.rb` → category 26 (design_patterns)
- Scanner rule for `app/uploaders/*.rb` → category 12 (storage)
- Scanner rule for `app/notifiers/*.rb` → category 40 (notifications)
- Glob expansion for `app/**/*.json.erb` capturing Rails 8 PWA manifest templates
- `pwaFile: true` flag on entries under `app/views/pwa/`
- `json_erb` file type detection
- `src/extractors/worker.js` — Sidekiq native worker extractor (class, queue, retry, perform args)
- `src/extractors/helper.js` — Helper extractor (module name, public methods, controller association by convention)
- `src/extractors/uploader.js` — CarrierWave and Shrine uploader extractor with `detectMountedUploaders` cross-reference
- `src/core/patterns/worker.js`, `helper.js`, `uploader.js` — domain-specific regex pattern files
- Two new graph edge types: `helps_view` (weight 0.5, helper → controller) and `manages_upload` (weight 1.0, model → uploader)
- Worker, helper, and uploader nodes and relationships in `buildGraph`
- `helpers`, `workers`, and `uploaders` extraction containers in indexer
- `pwa: { detected: boolean }` field in index output
- `helpers`, `workers`, `uploaders` counts in `computeStatistics`
- Helper and worker file-to-entity mappings in `buildFileEntityMap`
- `workers`, `helpers`, `uploaders`, and `pwa` sections in `get_overview` tool response
- Forward adjacency now stores `{ to, weight, type }` objects for typed edge traversal
- O(out-degree) `_enqueueNeighbours` in graph BFS replacing full-edge scan
- `class_name:` override support in model associations for graph edge targets
- `through:` and `polymorphic:` association handling in graph builder
- Expanded `fileEntityMap` to cover jobs, mailers, policies, services, channels, and migrations
- `tests` edge type excluded from blast-radius BFS to prevent test fan-out
- Method-level `method_line_ranges` with depth-tracking for nested `def`/`end` blocks in model extractor
- Coverage-path conventions for Minitest and RSpec via `deriveTestCoverageMapping`
- Shared `detectSpecStyle` in test-conventions extractor (delegates to `spec-style-detector`)
- `description` field in `list_tools` output for every registered tool
- Namespace-aware view-to-controller mapping via `deriveControllerClassName`
- `safeExtract` error boundary wrapping for all extractors in the indexer
- `extraction_errors` array in index output capturing extractor failures with file path, error name, and message
- `isError` flag on scan entries for files that fail to read
- `timeoutMs` option in local filesystem provider with per-file read timeout support
- Model-level `strict_loading` detection (`self.strict_loading_by_default = true`)
- Association-level `strict_loading: true` extraction
- Enum `validate: true` option detection (modern and legacy hash syntax)
- `turbo_refreshes_with` (method and scroll) extraction in model extractor
- `generates_token_for` extraction in auth extractor with security features cross-reference
- STI (Single Table Inheritance) detection post-pass in indexer: `sti_base`, `sti_subclasses`, `sti_parent`
- Content-aware token estimation: prose (4.0), JSON (3.0), and code (3.5) chars-per-token ratios
- YAML anchor (`&`), alias (`*`), and merge key (`<<:`) support in YAML parser
- Composite primary key detection in schema extractor (`primary_key: [:col1, :col2]`)
- Route nesting tracking with `nested_relationships` array and `parent_resource` fields
- `extraction_errors` count and details in `get_overview` tool response
- Circular symlink protection in local filesystem provider glob via visited-set tracking

### Fixed

- `search_patterns` handler: `cb.name` → `cb.method` for callback matching
- `search_patterns` handler: removed dead `ctrl.before_actions` reference, now uses `ctrl.filters || []`
- Factory registry extractor: skip `FactoryBot.define do` wrapper line to avoid false depth tracking
- Graph `classify` for controller/request spec names no longer singularizes (preserves `UsersController`)

### Changed

- Graph adjacency internals refactored from flat edge list to forward/reverse adjacency maps
- Blast radius uses `index.graph` directly instead of rebuilding graph
- `normalizes` extraction returns `Array<{ attribute, expression }>` instead of `string[]`
- Token estimation uses content-detection heuristics instead of flat 4.0 ratio

## [0.2.1] - 2026-03-19

### Fixed

- Path traversal protection in local filesystem provider
- Git ref validation to prevent command injection in blast radius tools
- Dependency vulnerability in `hono` (prototype pollution)

### Changed

- Server version now read dynamically from `package.json`
- Package published to public npm registry instead of GitHub Packages
- README rewritten for public release

## [0.2.0] - 2026-03-18

### Added

- Blast radius analysis: `get_blast_radius` and `get_review_context` MCP tools
- Git diff detection with automatic changed-file discovery
- Reverse adjacency map and BFS traversal in relationship graph
- Risk classification (CRITICAL / HIGH / MEDIUM / LOW) for impacted entities
- File-to-entity mapping for blast radius seed resolution

## [0.1.0] - 2026-03-01

### Added

- Initial release as MCP server over stdio
- 56-category file classification via path-based scanning
- 19 deep extractors: models, controllers, routes, schema, components, Stimulus, auth, authorization, jobs, email, storage, caching, realtime, API, views, config, tier 2, tier 3, test conventions
- Directed weighted graph with 22 edge types and Personalized PageRank
- Convention drift detection from `claude.md` / `CLAUDE.md`
- Token-budget-aware JSON formatting
- Rails 6.0–8.1+ version support
- 10 MCP tools: `index_project`, `get_overview`, `get_full_index`, `get_model`, `get_controller`, `get_routes`, `get_schema`, `get_subgraph`, `search_patterns`, `get_deep_analysis`
