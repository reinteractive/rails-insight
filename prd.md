# RailsInsight: Rails-Aware Blast Radius Analysis — Implementation Scope

## Agent Prompt

You are implementing the blast radius analysis feature for RailsInsight, a Rails-aware MCP server that gives AI coding agents deep structural understanding of Rails applications. RailsInsight already has a directed weighted graph with 22 edge types (model associations, controller filters, route mappings, schema foreign keys, concerns, etc.) built from 19 specialised extractors across 56 file categories. It uses Personalized PageRank for entity ranking and token-budgeted JSON formatting.

Your task is to add two new MCP tools — `get_blast_radius` and `get_review_context` — that perform BFS traversal through RailsInsight's existing graph to identify every file, entity, and test impacted by a code change, classify each by risk level, and return a token-budgeted summary suitable for AI agent consumption.

Follow Uncle Bob's Clean Code principles throughout: small focused functions with single responsibility, descriptive names that reveal intent, no comments that restate code, functions that do one thing at one level of abstraction, the Boy Scout Rule (leave code cleaner than you found it), and dependency inversion where appropriate. All new modules must have comprehensive test coverage.

Read this entire scope document before writing any code. The task list is sequenced with parallelism noted — respect the dependency ordering.

---

## 1. Feature Overview

### What It Does

Given a set of changed files (provided explicitly or detected from `git diff`), blast radius analysis:

1. Maps each changed file to its corresponding graph entity (model, controller, route, component, etc.)
2. Performs a bounded BFS traversal through RailsInsight's existing relationship graph
3. Classifies every impacted entity by risk level: `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`
4. Identifies tests (specs) that cover impacted entities
5. Returns a structured, token-budgeted response

### What Makes It Rails-Aware

Generic blast radius tools operate on import/require graphs. RailsInsight's graph encodes Rails-specific relationships invisible to generic tools:

- `has_many` / `belongs_to` / `has_many_through` — schema-level cascading dependencies
- `before_action` / `after_action` — controller filter chains that affect multiple actions
- `includes_concern` — shared behaviour modules where a change ripples to every includer
- `convention_pair` — Rails convention linking `PostsController` → `Post` model
- `routes_to` — route → controller mappings
- `schema_fk` — foreign key constraints that imply data integrity dependencies
- `validates_with` / `delegates_to` / `broadcasts_to` — semantic coupling

These edges carry weights (defined in `src/core/graph.js` `EDGE_WEIGHTS`) that determine propagation strength.

### Design Constraint: Compact Tool Surface

Per ecosystem research Finding 5 ("Too Many Tools"), new features are added as **2 new tools** with parameterised behaviour, not dozens of small tools. The total tool count will go from 15 to 17.

---

## 2. Architecture

### New Files

```
src/
  core/
    blast-radius.js          # Core BFS engine + risk classifier
  git/
    diff-parser.js           # Git diff detection and file parsing
  tools/
    blast-radius-tools.js    # MCP tool registration for get_blast_radius + get_review_context

test/
  core/
    blast-radius.test.js     # Unit tests for BFS engine + risk classification
  git/
    diff-parser.test.js      # Unit tests for git diff parsing
  tools/
    blast-radius-tools.test.js  # Integration tests for MCP tool handlers
```

### Modified Files

```
src/
  core/
    graph.js                 # Add reverse adjacency map + BFS helper method
    indexer.js               # Wire file-to-entity mapping into the index output
  providers/
    interface.js             # Add execCommand() to FileProvider interface
    local-fs.js              # Implement execCommand() for local filesystem
  tools/
    index.js                 # Register blast radius tools
    free-tools.js            # No changes (kept for reference)

test/
  core/
    graph.test.js            # Add tests for reverse adjacency + BFS
  helpers/
    mock-provider.js         # Add execCommand mock
```

### Data Flow

```
User calls get_blast_radius
  → diff-parser.js: detect changed files (git diff or explicit list)
  → indexer.js: fileEntityMap lookup (path → entity name)
  → blast-radius.js: BFS from seed entities through graph
  → blast-radius.js: classify risk per entity
  → blast-radius.js: identify impacted tests via graph 'tests' edges
  → formatter.js: token-budget the response (existing)
  → return structured JSON
```

---

## 3. Detailed Design

### 3.1 Graph Enhancements (`src/core/graph.js`)

The existing `Graph` class has an `adjacency` map (outgoing edges only). Blast radius needs bidirectional traversal — a change to a model must propagate to controllers that depend on it (reverse direction).

**Add a `reverseAdjacency` map** built alongside `adjacency`:

```js
// In constructor:
this.reverseAdjacency = new Map()

// In addEdge():
if (!this.reverseAdjacency.has(to)) this.reverseAdjacency.set(to, [])
this.reverseAdjacency.get(to).push({ from, weight })
```

**Add a `bfsFromSeeds(seedIds, maxDepth, options)` method** on the Graph class that:

- Accepts an array of seed entity IDs
- Traverses both forward and reverse adjacency
- Returns visited entities with their distance and the edge path that reached them
- Respects a configurable `maxDepth` (default: 3)
- Optionally filters by edge type (e.g., skip `contains` edges which are low-signal)

The method signature:

```js
/**
 * @param {string[]} seedIds - Starting entity IDs
 * @param {number} maxDepth - Maximum BFS hops (default 3)
 * @param {Object} [options]
 * @param {Set<string>} [options.excludeEdgeTypes] - Edge types to skip
 * @param {number} [options.minEdgeWeight] - Minimum edge weight to traverse (default 0)
 * @returns {Array<{entity: string, distance: number, reachedVia: string, edgeType: string, direction: string}>}
 */
bfsFromSeeds(seedIds, maxDepth = 3, options = {})
```

### 3.2 File-to-Entity Mapping (`src/core/indexer.js`)

The indexer already converts file paths to class names via `pathToClassName()`. The blast radius needs a reverse lookup: given a file path, which entity (or entities) does it represent?

**Add a `fileEntityMap` to the index output.** This is built after all extractors run, by iterating over the extractions and recording the `file` property on each entity:

```js
const fileEntityMap = {}

for (const [name, model] of Object.entries(extractions.models)) {
  if (model.file) fileEntityMap[model.file] = { entity: name, type: 'model' }
}
for (const [name, ctrl] of Object.entries(extractions.controllers)) {
  if (ctrl.file) fileEntityMap[ctrl.file] = { entity: name, type: 'controller' }
}
// ... components, stimulus_controllers, jobs, mailers, policies, services, etc.
```

Also map non-entity files to their nearest semantic entity:

- `db/schema.rb` → all models (flag as "schema change — wide blast radius")
- `config/routes.rb` → all controllers
- `app/views/users/*.erb` → `UsersController` (convention-based)
- `spec/models/user_spec.rb` → `User` (test → entity, already in graph as `tests` edge)
- `app/models/concerns/searchable.rb` → all models that include `Searchable`

The `fileEntityMap` is stored on the index at `index.fileEntityMap`.

### 3.3 Git Diff Parser (`src/git/diff-parser.js`)

A focused module that detects changed files via git.

**Exported functions:**

```js
/**
 * Detect changed files relative to a base ref.
 * @param {import('../providers/interface.js').FileProvider} provider
 * @param {string} baseRef - Git ref to diff against (default: 'HEAD')
 * @param {Object} [options]
 * @param {boolean} [options.staged] - Only staged changes (default: false)
 * @param {boolean} [options.includeUntracked] - Include untracked files (default: true)
 * @returns {Promise<{files: Array<{path: string, status: string}>, baseRef: string, error: string|null}>}
 */
export async function detectChangedFiles(provider, baseRef = 'HEAD', options = {})

/**
 * Parse a raw git diff --name-status output string into structured data.
 * @param {string} rawOutput
 * @returns {Array<{path: string, status: string}>}
 */
export function parseDiffOutput(rawOutput)
```

The `detectChangedFiles` function calls `provider.execCommand()` to run:

- `git diff --name-status <baseRef>` for unstaged changes
- `git diff --name-status --cached` for staged changes
- `git ls-files --others --exclude-standard` for untracked files

The `status` field is one of: `added`, `modified`, `deleted`, `renamed`.

**Important:** The function must handle the case where the project is not a git repository gracefully, returning `{ files: [], error: 'Not a git repository' }`.

### 3.4 Blast Radius Engine (`src/core/blast-radius.js`)

The core analysis module. Clean separation into small single-purpose functions.

**Exported functions:**

```js
/**
 * Compute the blast radius for a set of changed files.
 * @param {Object} index - Full RailsInsight index
 * @param {Array<{path: string, status: string}>} changedFiles
 * @param {Object} [options]
 * @param {number} [options.maxDepth] - BFS depth limit (default: 3)
 * @param {number} [options.tokenBudget] - Token budget for response (default: 8000)
 * @returns {BlastRadiusResult}
 */
export function computeBlastRadius(index, changedFiles, options = {})

/**
 * Classify risk level for an impacted entity based on distance, edge type, and entity type.
 * @param {Object} entity - BFS result entity
 * @param {Object} seedInfo - Information about the seed entity that triggered this
 * @param {Object} index - For looking up entity details
 * @returns {'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'}
 */
export function classifyRisk(entity, seedInfo, index)

/**
 * Build a review context summary for impacted entities, within a token budget.
 * @param {Object} index - Full RailsInsight index
 * @param {BlastRadiusResult} blastResult - Output of computeBlastRadius
 * @param {number} tokenBudget - Target token budget
 * @returns {Object} Token-budgeted review context
 */
export function buildReviewContext(index, blastResult, tokenBudget = 8000)
```

**Risk Classification Rules:**

| Risk Level | Criteria                                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `CRITICAL` | Direct change (distance 0); schema change affecting models; authentication/authorization file change                            |
| `HIGH`     | Distance 1 via strong edge (weight ≥ 2.0); concern change propagating to multiple includers; route change affecting controllers |
| `MEDIUM`   | Distance 1 via weak edge (weight < 2.0); distance 2 via strong edge; test files for impacted entities                           |
| `LOW`      | Distance 2+ via weak edges; view templates; configuration files                                                                 |

**Additional risk escalation rules specific to Rails:**

- If a model's `associations` change and the model has `has_many_through`, escalate the through-model to HIGH
- If a `before_action` filter is modified, all actions in that controller (and subclasses) are HIGH
- If a Devise model changes, escalate all auth-related controllers to HIGH
- If `db/schema.rb` changes, every model referencing affected tables is CRITICAL
- If a concern file changes, every entity that includes it inherits the concern's risk level

**BlastRadiusResult type:**

```js
/**
 * @typedef {Object} BlastRadiusResult
 * @property {Array<{path: string, entity: string, type: string, status: string}>} seeds - Directly changed entities
 * @property {Array<ImpactedEntity>} impacted - All impacted entities sorted by risk
 * @property {Array<{path: string, entity: string, covers: string}>} impactedTests - Tests that should be run
 * @property {Object} summary - Aggregate counts by risk level
 * @property {string[]} warnings - Any issues detected (e.g., unmapped files)
 */

/**
 * @typedef {Object} ImpactedEntity
 * @property {string} entity - Entity name
 * @property {string} type - Entity type (model, controller, etc.)
 * @property {string} risk - CRITICAL | HIGH | MEDIUM | LOW
 * @property {number} distance - BFS distance from nearest seed
 * @property {string} reachedVia - Entity that connected this one
 * @property {string} edgeType - The relationship type
 * @property {string} file - File path for the entity
 * @property {string|null} reason - Human-readable explanation of why this is impacted
 */
```

### 3.5 Review Context Builder (within `src/core/blast-radius.js`)

The `buildReviewContext` function creates a compact, token-budgeted summary of each impacted entity. It uses the same `estimateTokens` utility from `src/utils/token-counter.js`.

For each impacted entity, the review context includes a **compact structural summary**:

- **Models:** `"User — 5 associations, has_secure_password, 3 scopes, 2 callbacks"` (data already extracted)
- **Controllers:** `"PostsController — 5 actions, before_action :authenticate_user!, strong_params"` (data already extracted)
- **Components:** `"ButtonComponent — renders_one :icon, 2 slots, sidecar template"` (data already extracted)

Entities are included in priority order:

1. CRITICAL risk entities (always included)
2. HIGH risk entities (included if budget allows)
3. MEDIUM risk entities (included if budget allows)
4. LOW risk entities (truncated first)

Each entity summary is progressively trimmed if the budget is tight:

- Full summary first
- Drop method/action lists
- Drop to entity name + risk level only

### 3.6 MCP Tool Registration (`src/tools/blast-radius-tools.js`)

Two new tools registered via a `registerBlastRadiusTools(server, state)` function.

**Tool 1: `get_blast_radius`**

```
Name: get_blast_radius
Description: Analyse the impact of code changes. Accepts explicit file paths or auto-detects
             from git diff. Returns impacted entities classified by risk level (CRITICAL/HIGH/
             MEDIUM/LOW) with affected tests. Call this before making changes to understand
             what else might break, or after changes to identify what needs testing.

Parameters:
  files:     string[]  (optional) - Explicit list of changed file paths
  base_ref:  string    (optional) - Git ref to diff against (default: 'HEAD')
  staged:    boolean   (optional) - Only staged changes (default: false)
  max_depth: number    (optional) - BFS traversal depth limit (default: 3)

Returns: BlastRadiusResult (JSON)
```

**Behaviour:**

- If `files` is provided, use those directly
- If `files` is not provided, call `detectChangedFiles()` to get them from git
- If both are empty, return an error message
- Map files to entities via `index.fileEntityMap`
- Run `computeBlastRadius()`
- Return the result

**Tool 2: `get_review_context`**

```
Name: get_review_context
Description: Get a token-budgeted structural summary of entities impacted by code changes.
             Returns compact Rails-aware descriptions of each impacted model, controller,
             and component — enough context for an AI agent to review the change safely.
             Call get_blast_radius first, or provide files directly.

Parameters:
  files:        string[]  (optional) - Explicit list of changed file paths
  base_ref:     string    (optional) - Git ref to diff against (default: 'HEAD')
  token_budget: number    (optional) - Maximum tokens for the response (default: 8000)
  risk_filter:  string    (optional) - Minimum risk level to include (default: 'LOW')

Returns: Token-budgeted review context (JSON)
```

**Behaviour:**

- Detects files the same way as `get_blast_radius`
- Calls `computeBlastRadius()` internally
- Calls `buildReviewContext()` to produce the token-budgeted output
- Filters by `risk_filter` if provided

### 3.7 Provider Enhancement (`src/providers/interface.js` + `src/providers/local-fs.js`)

Add an `execCommand(command)` method to the FileProvider interface:

```js
/**
 * @typedef {Object} FileProvider
 * ...existing properties...
 * @property {function(string): Promise<{stdout: string, stderr: string, exitCode: number}>} execCommand
 *   Execute a shell command in the project root. Returns stdout, stderr, and exit code.
 */
```

In `LocalFSProvider`, implement it using `child_process.execSync` (or `exec` with promisify):

```js
async execCommand(command) {
  try {
    const { stdout, stderr } = await execPromise(command, {
      cwd: this._root,
      maxBuffer: 1024 * 1024,
      timeout: 10000,
    })
    return { stdout, stderr, exitCode: 0 }
  } catch (err) {
    return { stdout: err.stdout || '', stderr: err.stderr || '', exitCode: err.code || 1 }
  }
}
```

### 3.8 Wiring Into the Tool Registry (`src/tools/index.js`)

Import and call `registerBlastRadiusTools` after `registerFreeTools`:

```js
import { registerBlastRadiusTools } from './blast-radius-tools.js'

export function registerTools(server, options) {
  // ...existing...
  registerBlastRadiusTools(server, state)
}
```

---

## 4. Edge Cases and Error Handling

1. **File not in fileEntityMap:** Some changed files won't map to entities (e.g., `.rubocop.yml`, `README.md`, `Procfile`). These are added to `warnings` with a note that they couldn't be mapped. Config files that affect specific domains (e.g., `config/initializers/devise.rb`) should have special-case mappings.

2. **Schema file changes:** `db/schema.rb` and `db/migrate/*.rb` require special handling. Parse the migration/schema diff to identify which tables are affected, then map those tables to models via the existing `schema.tables` → `models` cross-reference.

3. **Concern fan-out:** A concern included by 20 models creates 20 CRITICAL/HIGH impacts. This is correct but may overwhelm the token budget. The review context builder handles this by progressive trimming.

4. **Circular dependencies:** The BFS must track visited nodes to avoid infinite loops. The `Graph.bfsFromSeeds` method uses a `visited` Set.

5. **Empty graph:** If the index hasn't been built or the graph is empty, return a clear error: `"Index not built. Call index_project first."`

6. **Git not available:** If `execCommand('git ...')` fails (not a git repo, git not installed), return `{ files: [], error: 'Git is not available or this is not a git repository' }` and fall back to requiring explicit `files` parameter.

7. **No changes detected:** If git diff returns empty and no explicit files are provided, return `{ seeds: [], impacted: [], summary: { total: 0 }, message: 'No changes detected' }`.

8. **Renamed files:** Git status `R` (renamed) should map both the old and new paths. The new path is the one that matters for entity mapping.

---

## 5. Test Plan

### 5.1 Unit Tests: Graph BFS (`test/core/graph.test.js` — additions)

| Test                                                 | Description                                                         |
| ---------------------------------------------------- | ------------------------------------------------------------------- |
| `bfsFromSeeds returns empty for empty graph`         | No nodes → empty result                                             |
| `bfsFromSeeds finds direct neighbours at distance 1` | A→B edge, seed A, expect B at distance 1                            |
| `bfsFromSeeds respects maxDepth`                     | A→B→C→D chain, maxDepth 2, expect D excluded                        |
| `bfsFromSeeds traverses reverse edges`               | A→B, seed B, expect A found via reverse traversal                   |
| `bfsFromSeeds handles multiple seeds`                | Seeds [A, C] in graph A→B→C→D, expect B and D found                 |
| `bfsFromSeeds excludes specified edge types`         | A→B (has_many), A→C (contains), exclude contains, expect C missing  |
| `bfsFromSeeds respects minEdgeWeight`                | A→B (weight 2.0), A→C (weight 0.5), minWeight 1.0, expect C missing |
| `bfsFromSeeds handles cycles without infinite loop`  | A→B→C→A cycle, seed A, terminates cleanly                           |
| `bfsFromSeeds records reachedVia and edgeType`       | A→B via has_many, check result metadata                             |
| `bfsFromSeeds handles disconnected nodes`            | A→B, C isolated, seed A, expect C not found                         |
| `reverseAdjacency is built correctly`                | Add A→B edge, check reverseAdjacency has B→[A]                      |

### 5.2 Unit Tests: Diff Parser (`test/git/diff-parser.test.js`)

| Test                                                            | Description                                                                    |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `parseDiffOutput parses M (modified) status`                    | `"M\tapp/models/user.rb"` → `{path: 'app/models/user.rb', status: 'modified'}` |
| `parseDiffOutput parses A (added) status`                       | `"A\tapp/models/post.rb"` → status 'added'                                     |
| `parseDiffOutput parses D (deleted) status`                     | `"D\tapp/models/old.rb"` → status 'deleted'                                    |
| `parseDiffOutput parses R (renamed) status`                     | `"R100\told.rb\tnew.rb"` → status 'renamed', both paths                        |
| `parseDiffOutput handles empty output`                          | Empty string → empty array                                                     |
| `parseDiffOutput handles multiple files`                        | Multi-line output → correct array                                              |
| `parseDiffOutput ignores blank lines`                           | Trailing newlines handled                                                      |
| `detectChangedFiles returns error for non-git repo`             | Mock provider with failing execCommand → error message                         |
| `detectChangedFiles calls correct git commands`                 | Verify the git diff command string                                             |
| `detectChangedFiles includes untracked files when option set`   | Mock ls-files output included                                                  |
| `detectChangedFiles excludes untracked files when option false` | Only diff output returned                                                      |

### 5.3 Unit Tests: Blast Radius Engine (`test/core/blast-radius.test.js`)

| Test                                                            | Description                                                              |
| --------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `computeBlastRadius maps files to seed entities`                | Changed `app/models/user.rb` → seed entity `User`                        |
| `computeBlastRadius finds impacted entities via graph`          | User model change → PostsController impacted via convention_pair reverse |
| `computeBlastRadius classifies direct changes as CRITICAL`      | Changed files are CRITICAL                                               |
| `computeBlastRadius classifies distance-1 strong edges as HIGH` | has_many/belongs_to at distance 1 → HIGH                                 |
| `computeBlastRadius classifies distance-2 as MEDIUM or LOW`     | Appropriate classification                                               |
| `computeBlastRadius identifies impacted tests`                  | Spec file connected via 'tests' edge appears in impactedTests            |
| `computeBlastRadius handles unmapped files gracefully`          | Unknown file → appears in warnings                                       |
| `computeBlastRadius escalates concern changes`                  | Concern change → all includers are HIGH                                  |
| `computeBlastRadius escalates schema changes`                   | db/schema.rb change → all models with affected tables CRITICAL           |
| `computeBlastRadius escalates auth changes`                     | Devise model change → auth controllers HIGH                              |
| `computeBlastRadius produces correct summary counts`            | summary.CRITICAL/HIGH/MEDIUM/LOW counts match                            |
| `computeBlastRadius respects maxDepth`                          | Deep graph, maxDepth 2, verify cutoff                                    |
| `computeBlastRadius handles empty changed files`                | Returns empty result with message                                        |
| `computeBlastRadius deduplicates impacted entities`             | Entity reachable via multiple paths appears once with highest risk       |
| `classifyRisk returns CRITICAL for distance 0`                  | Direct change                                                            |
| `classifyRisk returns HIGH for auth-related changes`            | Auth file at distance 1                                                  |
| `classifyRisk returns MEDIUM for distance 2`                    | Standard entity at distance 2                                            |
| `classifyRisk returns LOW for distance 3`                       | Far entity                                                               |
| `buildReviewContext fits within token budget`                   | Output token estimate ≤ budget                                           |
| `buildReviewContext prioritises CRITICAL entities`              | CRITICAL always included even at tight budget                            |
| `buildReviewContext includes model summaries`                   | Model with associations/scopes gets compact summary                      |
| `buildReviewContext includes controller summaries`              | Controller with actions/filters gets compact summary                     |
| `buildReviewContext progressively trims at tight budget`        | Very low budget → only names and risk levels                             |

### 5.4 Integration Tests: MCP Tool Handlers (`test/tools/blast-radius-tools.test.js`)

| Test                                                           | Description                                |
| -------------------------------------------------------------- | ------------------------------------------ |
| `get_blast_radius with explicit files returns impact analysis` | Provide files array, get structured result |
| `get_blast_radius with no files and no git returns error`      | No files, mock git failure → error message |
| `get_blast_radius returns seeds and impacted entities`         | Verify complete result structure           |
| `get_blast_radius returns impactedTests`                       | Tests are identified                       |
| `get_blast_radius handles unknown files in warnings`           | Non-entity files appear in warnings        |
| `get_blast_radius returns noIndex error when index is null`    | Standard no-index guard                    |
| `get_review_context returns token-budgeted output`             | Output within budget                       |
| `get_review_context filters by risk_filter`                    | risk_filter: 'HIGH' excludes MEDIUM/LOW    |
| `get_review_context includes structural summaries`             | Model/controller details present           |
| `get_review_context returns noIndex error when index is null`  | Standard no-index guard                    |

### 5.5 Edge Case Tests (within blast-radius.test.js)

| Test                                            | Description                                                 |
| ----------------------------------------------- | ----------------------------------------------------------- |
| `handles routes.rb change as wide-blast-radius` | Routes change impacts all controllers                       |
| `handles migration file change`                 | Maps to schema → affected models                            |
| `handles view file change`                      | Maps to corresponding controller via convention             |
| `handles concern with many includers`           | Fan-out produces correct risk levels                        |
| `handles Gemfile change`                        | Warning: "Gemfile change — dependency blast radius unknown" |
| `handles file in app/services/`                 | Maps to design_patterns entity                              |

---

## 6. Task List

### Phase 1: Foundation (No dependencies between tasks — all three can be done in parallel)

**Task 1.1: Graph BFS Enhancement**

- File: `src/core/graph.js`
- Add `reverseAdjacency` Map to constructor
- Populate `reverseAdjacency` in `addEdge()`
- Implement `bfsFromSeeds(seedIds, maxDepth, options)` method
- File: `test/core/graph.test.js`
- Add all 11 tests from section 5.1
- Estimated scope: ~120 lines production code, ~200 lines test code

**Task 1.2: Git Diff Parser**

- Create: `src/git/diff-parser.js`
- Implement `parseDiffOutput(rawOutput)` — pure function, no side effects
- Implement `detectChangedFiles(provider, baseRef, options)` — async, uses provider.execCommand
- Create: `test/git/diff-parser.test.js`
- Add all 11 tests from section 5.2
- Estimated scope: ~80 lines production code, ~180 lines test code

**Task 1.3: Provider Enhancement**

- File: `src/providers/interface.js` — add `execCommand` to JSDoc typedef
- File: `src/providers/local-fs.js` — implement `execCommand` using `child_process`
- File: `test/helpers/mock-provider.js` — add `execCommand` mock to `createMemoryProvider` and `createFixtureProvider`
- Estimated scope: ~30 lines production code, ~15 lines test helper updates

### Phase 2: Core Engine (Depends on Phase 1 completion)

**Task 2.1: File-to-Entity Mapping**

- File: `src/core/indexer.js`
- Add `buildFileEntityMap(extractions, manifest)` private function
- Call it after all extractors and store result on `index.fileEntityMap`
- Map models, controllers, components, stimulus controllers, jobs, mailers, policies, concerns, services
- Add special-case mappings for `db/schema.rb`, `config/routes.rb`, concern files, view files
- Add test in `test/core/indexer.test.js` for fileEntityMap presence and correctness
- Estimated scope: ~80 lines production code, ~40 lines test code

**Task 2.2: Blast Radius Engine**

- Create: `src/core/blast-radius.js`
- Implement `computeBlastRadius(index, changedFiles, options)`
- Implement `classifyRisk(entity, seedInfo, index)` — pure function
- Implement `buildReviewContext(index, blastResult, tokenBudget)` — uses `estimateTokens`
- Implement private helpers:
  - `mapFilesToSeeds(changedFiles, fileEntityMap)` — resolve files to graph entities
  - `buildEntitySummary(entityName, entityType, extractions)` — compact structural description
  - `escalateRailsSpecificRisks(impacted, seeds, index)` — apply Rails-specific escalation rules
  - `collectImpactedTests(impacted, seeds, graph)` — find tests via 'tests' edges
  - `deduplicateByHighestRisk(entities)` — when entity reachable via multiple paths
- Create: `test/core/blast-radius.test.js`
- Add all 24 tests from sections 5.3 and 5.5
- Estimated scope: ~300 lines production code, ~500 lines test code

### Phase 3: MCP Integration (Depends on Phase 2 completion)

**Task 3.1: Tool Registration**

- Create: `src/tools/blast-radius-tools.js`
- Implement `registerBlastRadiusTools(server, state)`
- Register `get_blast_radius` tool with Zod schema
- Register `get_review_context` tool with Zod schema
- Both tools follow existing pattern: `noIndex()` guard, `respond()` helper, JSON response
- File: `src/tools/index.js` — import and call `registerBlastRadiusTools`
- Create: `test/tools/blast-radius-tools.test.js`
- Add all 10 tests from section 5.4
- Uses the same `createMockServer()` pattern from `test/tools/free-tools.test.js`
- Estimated scope: ~120 lines production code, ~250 lines test code

**Task 3.2: MCP Protocol Test**

- File: `test/mcp/protocol.test.js` — add 2 tests:
  - `calls get_blast_radius with explicit files and gets valid response`
  - `calls get_review_context and gets token-budgeted output`
- Estimated scope: ~30 lines test code

### Phase 4: Validation (Depends on Phase 3 completion)

**Task 4.1: Cross-Version Regression**

- File: `test/cross-version/version-matrix.test.js`
- Add test: `all versions: fileEntityMap is populated`
- Add test: `8.1: blast radius from User model change includes PostsController`
- Estimated scope: ~20 lines test code

**Task 4.2: Performance Benchmark**

- File: `test/performance/benchmarks.test.js`
- Add test: `blast radius completes in under 50ms for Rails 8.1 fixture`
- Add test: `review context generation completes in under 100ms`
- Estimated scope: ~30 lines test code

---

## 7. Task Dependency Graph

```
Phase 1 (all parallel):
  Task 1.1 ─┐
  Task 1.2 ─┼─→ Phase 2
  Task 1.3 ─┘

Phase 2 (sequential within, parallel between 2.1 and initial parts of 2.2):
  Task 2.1 ──→ Task 2.2 (2.2 depends on 2.1 for fileEntityMap)

Phase 3 (sequential):
  Task 3.1 ──→ Task 3.2

Phase 4 (parallel, after Phase 3):
  Task 4.1 ─┐
  Task 4.2 ─┘
```

**Minimum critical path:** 1.1 → 2.1 → 2.2 → 3.1 → 3.2 → 4.x

**Parallelism opportunities:**

- All of Phase 1 (Tasks 1.1, 1.2, 1.3) can run simultaneously
- Task 2.1 can start as soon as Task 1.1 finishes (needs graph changes)
- Task 2.2 needs both 2.1 (fileEntityMap) and 1.1 (BFS) and 1.2 (diff parser)
- Tasks 4.1 and 4.2 can run simultaneously

---

## 8. Coding Standards

Per Uncle Bob's Clean Code principles:

1. **Function size:** No function exceeds 20 lines. Extract helper functions aggressively.
2. **Naming:** Function names are verbs (`computeBlastRadius`, `classifyRisk`, `mapFilesToSeeds`). Variable names reveal intent (`impactedEntities` not `results`, `seedEntityId` not `id`).
3. **Single Responsibility:** Each module has one reason to change. `diff-parser.js` only parses diffs. `blast-radius.js` only computes impact. `blast-radius-tools.js` only wires MCP.
4. **No side effects in pure functions:** `classifyRisk`, `parseDiffOutput`, `buildEntitySummary` are all pure — no I/O, no mutations of inputs.
5. **Error handling:** Use early returns, not nested try/catch. Errors are data (`{ error: '...' }`), not thrown exceptions, at the tool boundary.
6. **DRY:** Reuse `estimateTokens` from `src/utils/token-counter.js`. Reuse the `respond()` and `noIndex()` patterns from `free-tools.js`.
7. **Consistent JSDoc:** All exported functions have `@param` and `@returns` documentation matching the existing codebase style.
8. **Test names describe behaviour:** `"bfsFromSeeds respects maxDepth"` not `"test BFS depth"`.

---

## 9. Acceptance Criteria

The feature is complete when:

1. `get_blast_radius` returns correct impact analysis for explicitly provided files
2. `get_blast_radius` auto-detects changes from `git diff` when no files are provided
3. Risk classification correctly applies Rails-specific escalation rules
4. `get_review_context` produces output within the specified token budget
5. All 87+ tests pass (11 graph + 11 diff parser + 24 blast radius + 6 edge cases + 10 tool handlers + 2 MCP protocol + 3 cross-version + 2 performance)
6. The total tool count is exactly 17 (15 existing + 2 new)
7. `npm test` passes with zero failures
8. No existing tests are broken by the changes
9. The blast radius for the Rails 8.1 fixture completes in under 50ms
10. Code follows the existing project conventions (ESM imports, Vitest, JSDoc, no TypeScript)
