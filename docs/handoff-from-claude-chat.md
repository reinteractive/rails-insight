# RailsInsight — Evaluation & Fix Handoff

## What You're Working On

RailsInsight (`@reinteractive/rails-insight`) is an MCP server that gives AI coding agents deep structural understanding of Rails applications. It indexes models, controllers, routes, schema, authentication, jobs, mailers, components, and 56 total file categories — then exposes that knowledge through 17 MCP tools. When an AI agent is working on a Rails app, RailsInsight tells it what exists, how things connect, and what would break if something changed.

This is Kane's product, built at reinteractive (Australia's longest-running Rails consultancy). It's going public. It needs to be bulletproof — not "good enough", not "works on our apps" — it needs to produce accurate, hallucination-free output on ANY Rails application from Rails 6.0 to 8.1+. Kane's professional reputation is attached to this.

## What You're Trying to Achieve

**The quality bar:**

- Weighted F1 ≥ 0.95 across all 17 tools
- Hallucination rate < 1% (currently 2.4%)
- Zero tools below F1 0.80
- Consistent, correct results across multiple real Rails applications (not just one test app)

**The current state (v1.0.20):**

- Weighted F1: 0.84
- Hallucination rate: 2.4%
- 9 of 17 tools at F1 ≥ 0.95
- 3 tools below F1 0.80
- Tested against one Rails 6.1 app (ellaslist — 780 files, 69 models, 57 controllers)

## The 17 Tools

Every tool is registered via `McpServer.tool()` in `src/tools/`. Here's the full list with current scores:

| Tool                       | F1   | Weight | Status                                                       |
| -------------------------- | ---- | ------ | ------------------------------------------------------------ |
| `index_project`            | 0.98 | 1      | ✅ Good                                                      |
| `get_overview`             | 0.93 | 2      | ⚠️ Needs work (roles empty, factories wrong)                 |
| `get_model`                | 0.92 | 3      | ⚠️ Needs work (enumerize invisible, AdminAbility superclass) |
| `get_controller`           | 0.95 | 3      | ✅ Good                                                      |
| `get_routes`               | 0.91 | 3      | ⚠️ Needs work (duplicate resources, interpolation)           |
| `get_schema`               | 1.00 | 3      | ✅ Perfect                                                   |
| `get_full_index`           | 1.00 | 1      | ✅ Perfect                                                   |
| `get_subgraph`             | 0.72 | 2      | ❌ Needs work (email empty, auth polluted)                   |
| `search_patterns`          | 0.69 | 2      | ❌ Needs work (validates/scope/devise return 0)              |
| `get_deep_analysis`        | 0.92 | 2      | ⚠️ Needs work (factories false, roles not listed)            |
| `get_coverage_gaps`        | 1.00 | 1      | ✅ Perfect                                                   |
| `get_test_conventions`     | 0.85 | 1      | ⚠️ Needs work (factory_tool null)                            |
| `get_domain_clusters`      | 0.95 | 1      | ✅ Good                                                      |
| `get_factory_registry`     | 1.00 | 1      | ✅ Perfect                                                   |
| `get_well_tested_examples` | 1.00 | 1      | ✅ Perfect                                                   |
| `get_blast_radius`         | 0.95 | 3      | ✅ Good                                                      |
| `get_review_context`       | 0.94 | 2      | ⚠️ Needs work (token budget ignored)                         |

Weights reflect importance to AI coding agent workflows: 3 = critical, 2 = important, 1 = supporting.

## The Strategy: One Tool at a Time

Previous attempts to fix everything in one batch caused regressions and partial applications across four eval rounds. The agreed strategy is:

1. **Pick the tool with the highest weighted F1 impact**
2. **Write tests FIRST** for the specific fix (TDD — commit tests before implementation)
3. **Implement the fix** in the minimum number of files
4. **Run the full test suite** — zero regressions
5. **Re-run the eval for that tool** — confirm F1 improved
6. **Re-run the eval for ALL tools** — confirm nothing regressed
7. **Ship it, move to the next tool**

**Never fix two tools simultaneously.** One tool, one branch, one eval cycle.

## The Fix Priority Queue

Ordered by weighted F1 impact (weight × F1 improvement):

| Priority | Tool                  | Current F1 | Target F1 | Root Cause                                                   | Files to Touch                  |
| -------- | --------------------- | ---------- | --------- | ------------------------------------------------------------ | ------------------------------- |
| 1        | `get_model`           | 0.92       | 0.98      | Enumerize gem not detected (27 FN)                           | `patterns/model.js`, `model.js` |
| 2        | `search_patterns`     | 0.69       | 0.92      | Doesn't search validations, scopes, devise                   | `search-patterns.js`            |
| 3        | `get_subgraph`        | 0.72       | 0.90      | Mailers not in graph; auth filter too broad                  | `graph.js`, `get-subgraph.js`   |
| 4        | `get_overview`        | 0.93       | 0.97      | Roles empty; factories flag wrong                            | `get-overview.js`, `tier2.js`   |
| 5        | `get_routes`          | 0.91       | 0.95      | Duplicate resources from drawn files                         | `routes.js`                     |
| 6        | `get_review_context`  | 0.94       | 0.97      | Token budget parameter ignored                               | `blast-radius.js`               |
| 7        | `get_model` (round 2) | —          | —         | AdminAbility superclass; Page collision; PORO classification | `indexer.js`, `helpers.js`      |

**Priority 1 (enumerize) has a fix prompt already written.** It's at `docs/agent-tasks/` or can be found in the git history. Two tasks: 10 test cases in `test/extractors/enumerize.test.js`, then ~15 lines of detection code. Check if it's already been applied — if `grep -r "enumEnumerize" src/` returns results, it's done.

## How to Evaluate

### The Evaluation Methodology

For each tool, you compare RailsInsight's output against ground truth from the actual source code. For every countable field (associations, validations, scopes, enums, callbacks, actions, filters, etc.):

- **True Positive (TP):** Item returned by RI that exists in source
- **False Positive (FP):** Item returned by RI that does NOT exist in source (hallucination)
- **False Negative (FN):** Item in source that RI did NOT return (miss)
- **Precision:** TP / (TP + FP)
- **Recall:** TP / (TP + FN)
- **F1:** 2 × P × R / (P + R)

**Critical rule:** Establish ground truth from the actual source code BEFORE calling the RailsInsight tool. Don't accept RI output as truth and then "confirm" it.

### Hallucination Categories

- **PHANTOM_ENTITY:** An entity returned that doesn't exist
- **WRONG_VALUE:** A field value that contradicts source (e.g., wrong superclass)
- **FABRICATED_FIELD:** A field populated with invented data

### How to Evaluate a Single Tool

Use `get_model` as the example:

1. Read every model source file: `find app/models -name '*.rb' | sort`
2. For each model, record ground truth: association count, validation count, scope count, enum count (including enumerize), callback count, superclass, type
3. Call `get_model` for each model
4. Compare RI output to ground truth, count TP/FP/FN per field
5. Aggregate across all models for the tool-level F1
6. Log every hallucination individually

### What to Produce

Two files per eval run:

**`railsinsight-eval-scorecard.md`** — quantitative scores:

- Overall weighted F1, hallucination rate, coverage rate
- Per-tool P/R/F1 table
- Per-model detail tables (for get_model)
- Hallucination log with every FP catalogued

**`railsinsight-eval-issues.md`** — structured issues:

- Each issue: severity, tool, category, precision/recall impact, input/expected/actual, source files, suggested fix

### Testing Against Multiple Apps

The eval MUST eventually run against multiple Rails apps to ensure generalisability:

- A Rails 6.x app (ellaslist — already done)
- A Rails 7.x app
- A Rails 8.x app
- An API-only app
- An app with ViewComponents and Stimulus

A tool isn't "done" until it scores F1 ≥ 0.95 on at least 2 different apps.

## Architecture Reference

### Codebase Structure

```
bin/railsinsight.js          — CLI entry point
src/server.js                — MCP server setup, startLocal/startRemote
src/core/
  indexer.js                 — Main pipeline: context → versions → scan → extract → graph
  scanner.js                 — Layer 3: classifies files into 56 categories (zero file reads)
  graph.js                   — Layer 5: builds directed weighted graph + PageRank
  blast-radius.js            — BFS impact analysis from changed files
  formatter.js               — Token-budgeted JSON output
  constants.js               — Shared constants
  patterns/                  — 21 regex pattern files (model.js, controller.js, etc.)
  patterns/model.js          — MODEL_PATTERNS object with all model regex patterns
src/extractors/
  model.js                   — Extracts associations, validations, scopes, enums, callbacks
  controller.js              — Extracts actions, filters, strong params, rescue handlers
  routes.js                  — Parses config/routes.rb with namespace/scope tracking
  schema.js                  — Parses db/schema.rb for tables, columns, indexes, FKs
  auth.js                    — Devise, native Rails 8, JWT detection
  authorization.js           — Pundit, CanCanCan, custom RBAC
  [18 more extractors]
src/tools/
  handlers/
    get-model.js             — MCP tool handler: enriches model with schema columns
    get-controller.js        — MCP tool handler: enriches controller with route mapping
    search-patterns.js       — MCP tool handler: searches across extractions
    get-subgraph.js          — MCP tool handler: skill-scoped graph subsets
    [12 more handlers]
src/introspection/
  bridge.js                  — Executes Ruby script for runtime data (optional)
  merger.js                  — Merges regex + runtime extractions
  introspect.rb              — Ruby script for live Rails metadata
src/utils/
  inflector.js               — Ruby-compatible pluralize/singularize/classify
  ruby-class-resolver.js     — Resolves FQN from module wrappers
  token-counter.js           — Content-aware token estimation
```

### Key Patterns

- **FileProvider interface** (`src/providers/interface.js`): `readFile()`, `fileExists()`, `glob()`, `listDir()`, `execCommand()`
- **Error boundary**: `safeExtract(name, fn, fallback, verbose, errors)` in indexer.js
- **Tool handlers**: return `respond(data)` or `respondError(message)` — never throw
- **Graph edges**: `EDGE_WEIGHTS` object in graph.js, `graph.addEdge(from, to, type)`
- **Tests**: Vitest, inline mock providers, `describe/it/expect`

### The Pipeline

```
1. Context Loader   → parses CLAUDE.md for declared conventions
2. Version Detector → Rails/Ruby version, gem stack from Gemfile.lock
3. Scanner          → classifies all files into 56 categories (zero file reads)
4. Deep Extractors  → 19 extractors parse file content (models, controllers, etc.)
4.5. Introspection  → optional Ruby runtime data merged on top
5. Graph Builder    → directed weighted graph + PageRank rankings
6. Drift Detector   → compares declared vs actual conventions
```

## Known Persistent Issues (v1.0.20)

These are the issues that have appeared across multiple eval rounds. They are the priority fixes:

### Extraction Layer (model.js, patterns/model.js)

1. **Enumerize not detected** — `enumerize :field, in: [...]` produces `enums: {}`. 27 false negatives across 10+ models. This is the single highest-impact fix. A fix prompt with tests exists.

2. **Block callbacks show method: null** — `before_save { self.name = name.strip }` produces `method: null` instead of `method: "[block]"`. Cosmetic but confusing.

3. **after_save_commit not reliably detected** — The callback regex alternation has `save|...|save_commit`. Regex alternation is left-to-right; `save` may match before `save_commit` gets tried. Reorder to put compound types first.

### Indexer Layer (indexer.js)

4. **Non-AR models get superclass: ApplicationRecord** — Classes in `app/models/` without `< Superclass` (like CanCanCan's `AdminAbility`) are classified as `type: "model"` with fabricated `superclass: "ApplicationRecord"`.

5. **Namespace not derived from directory path** — `app/models/wordpress/page.rb` containing `class Page < WpPost` (no module wrapper) is indexed as `Page` instead of `Wordpress::Page`. Causes name collisions.

### Tool Handler Layer

6. **search_patterns doesn't search validations, scopes, or devise** — Only searches associations, callbacks, and enum names. Three of the most important patterns return 0 results.

7. **Email subgraph returns 0 entities** — Mailer classes are never added as graph nodes, so the email subgraph can't find them.

8. **Auth subgraph includes unrelated models** — BFS from auth seeds follows `belongs_to :author` into Activity, Event, etc. Needs post-filtering.

9. **review_context ignores token_budget** — The parameter is accepted but doesn't trim output. Budget 2000 returns same 28 entities as budget 8000.

10. **testing.factories = false when factory files exist** — Only checks Gemfile for `factory_bot` gem; doesn't scan `test/factories/` for `FactoryBot.define`.

11. **Authorization roles not extracted** — Detects rolify/cancancan but doesn't parse `has_role?(:name)` calls to get actual role names.

12. **model_list defaults superclass to ApplicationRecord** — Uses `m.superclass || 'ApplicationRecord'` instead of `m.superclass || null`.

## What "Done" Looks Like

RailsInsight is ready for public release when:

1. **Weighted F1 ≥ 0.95** on at least 2 different Rails apps
2. **Hallucination rate < 1%** — AI agents must be able to trust RI output
3. **Zero tools below F1 0.80** — every tool adds value
4. **Zero CRITICAL issues** in any eval
5. **Full test coverage** for every fix (tests committed before implementation)
6. **No regressions** between versions — the eval scorecard only goes up, never down
7. **Works on Rails 6.0–8.1+** — not just one app or one version

This is Kane's professional product. Every hallucination is a lie an AI agent might act on. Every false negative is context an agent doesn't have. Both damage trust. Precision and recall both matter.

## Your Workflow

```
1. Check current state: npm test (all green?)
2. Pick the next tool from the priority queue
3. Write failing tests for the specific fix
4. Commit the tests
5. Implement the fix in minimum files
6. npm test — full suite green, new tests pass
7. Run the eval against the test app
8. Confirm: F1 improved for target tool, no regressions on others
9. Commit, tag, move to next tool
```

When you're unsure about a fix, write more tests. When a test is hard to write, the fix is probably too broad. Keep it tight.
