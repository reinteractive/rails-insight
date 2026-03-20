# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-03-20

### Added

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
