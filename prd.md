# PRD: RailsInsight v0.3.0 — Correctness & Coverage Fixes

## Agent Prompt

You are implementing a set of correctness fixes, performance improvements, and coverage expansions for RailsInsight — a Rails-aware MCP server that gives AI coding agents deep structural understanding of Rails applications. The codebase is a Node.js ES module project using Vitest for testing.

This PRD contains 35 tasks organized into 8 phases. Each task has a description, the files to modify, the exact changes required, edge cases to handle, and named test cases. Implement each task in order within its phase. Tasks within the same phase are parallelizable unless noted otherwise.

**Coding standards (Robert C. Martin's Clean Code — enforced on every task):**

- Single Responsibility: Each function does one thing. If a function needs a comment explaining what it does, it's doing too much — extract.
- DRY: If you write the same logic twice, extract it into a named function.
- Small functions: No function exceeds 30 lines. Extract helpers aggressively.
- Meaningful names: Variable and function names describe intent. No `data`, `info`, `item`, `result` as standalone names — qualify them (`blastResult`, `modelInfo`, `coverageItem`).
- Dependency inversion: Modules depend on abstractions (function signatures, interfaces), not concretions. Pass dependencies as parameters.
- No magic numbers: Every literal gets a named constant.
- Fail fast: Validate inputs at function entry. Return early for error cases.
- No side effects in query functions: Functions that return data must not mutate state.
- Tests follow Arrange-Act-Assert pattern with descriptive test names.
- Every public function has a JSDoc comment with `@param` and `@returns`.

**Test requirements:**

- Every task includes named test cases. Implement ALL of them.
- Test files go in `test/` mirroring the `src/` structure (e.g., `src/utils/inflector.js` → `test/utils/inflector.test.js`).
- Use Vitest (`describe`, `it`, `expect`). No mocks unless the task explicitly requires them.
- Each test file must be runnable independently via `vitest run test/path/to/file.test.js`.

**File delivery:**

- All new files must include the standard module JSDoc header comment.
- All modified files must preserve existing JSDoc comments and add JSDoc to new functions.
- Run `npm test` after each phase to confirm zero regressions.

---

## Feature Overview

A comprehensive code review of RailsInsight v0.2.1 identified 35 issues across 8 categories: critical bugs in pluralization and graph construction, performance problems in BFS traversal, missing file type coverage in blast radius, extraction quality gaps, Rails pattern coverage holes, error handling weaknesses, and minor inconsistencies. This PRD addresses every identified issue.

The fixes are organized into 8 phases, sequenced so that foundational changes (inflection, graph correctness) land first, and downstream consumers (blast radius, tools) are updated afterward.

---

## Phase 1: Inflection Module (Foundation)

These two tasks create the shared inflection utility that fixes the root cause of bugs #1 and #2. All subsequent phases depend on this module.

**Phase 1 tasks are parallelizable with each other but must complete before Phase 2 begins.**

---

### Task 1: Create `src/utils/inflector.js` — English Pluralization and Singularization

**Problem:** `toTableName()` in `helpers.js` uses naive `+ 's'` pluralization, producing wrong table names for common English words (`Category` → `categorys`, `Person` → `persons`, `Address` → `addresss`). `classify()` in `graph.js` converts plural association names to PascalCase without singularizing, creating phantom graph nodes (`Comments` instead of `Comment`).

**Files to create:**

- `src/utils/inflector.js`

**Implementation:**

Create a standalone inflection module with four public functions: `pluralize(word)`, `singularize(word)`, `classify(snakeCaseString)` (singularize then PascalCase), and `tableize(ClassName)` (snake_case then pluralize).

The module must contain:

1. **An ordered array of pluralization rules** (applied last-to-first, first match wins). Minimum required rules (regex → replacement string):

```
/quiz$/i → 'quizzes'
/^(ox)$/i → '$1en'
/(matr|vert|append)ix$/i → '$1ices'
/(x|ch|ss|sh)$/i → '$1es'
/([^aeiouy])y$/i → '$1ies'
/(hive)$/i → '$1s'
/([lr])f$/i → '$1ves'
/(shea|lea|wol|cal)f$/i → '$1ves'
/sis$/i → 'ses'
/([ti])um$/i → '$1a'
/(buffal|tomat|volcan|potat|ech|her|vet)o$/i → '$1oes'
/(bu|mis|gas)s$/i → '$1ses'
/(alias|status)$/i → '$1es'
/(octop|vir)us$/i → '$1i'
/(ax|test)is$/i → '$1es'
/s$/i → 's'
/$/ → 's'
```

2. **An ordered array of singularization rules** (applied last-to-first, first match wins). Minimum required rules:

```
/(database)s$/i → '$1'
/(quiz)zes$/i → '$1'
/(matr)ices$/i → '$1ix'
/(vert|append)ices$/i → '$1ex'
/^(ox)en/i → '$1'
/(alias|status)es$/i → '$1'
/(octop|vir)i$/i → '$1us'
/(cris|ax|test)es$/i → '$1is'
/(shoe)s$/i → '$1'
/(o)es$/i → '$1'
/(bus)es$/i → '$1'
/([mlr])ives$/i → '$1ife'
/(x|ch|ss|sh)es$/i → '$1'
/(m)ovies$/i → '$1ovie'
/(s)eries$/i → '$1eries'
/([^aeiouy])ies$/i → '$1y'
/([lr])ves$/i → '$1f'
/(tive)s$/i → '$1'
/(hive)s$/i → '$1'
/([^f])ves$/i → '$1fe'
/(^analy)ses$/i → '$1sis'
/((a)naly|(b)a|(d)iagno|(p)arenthe|(p)rogno|(s)ynop|(t)he)ses$/i → '$1$2sis'
/([ti])a$/i → '$1um'
/(n)ews$/i → '$1ews'
/s$/i → ''
```

3. **An irregular words map** (bidirectional):

```
person ↔ people
man ↔ men
woman ↔ women
child ↔ children
sex ↔ sexes
move ↔ moves
zombie ↔ zombies
goose ↔ geese
mouse ↔ mice
tooth ↔ teeth
foot ↔ feet
```

4. **An uncountable words set:**

```
equipment, information, rice, money, species, series, fish, sheep, jeans, police, news, data, feedback, staff, advice, furniture, homework, knowledge, luggage, progress, research, software, weather
```

**Function signatures:**

```javascript
/**
 * Pluralize an English word.
 * @param {string} word - Singular English word
 * @returns {string} Plural form
 */
export function pluralize(word)

/**
 * Singularize an English word.
 * @param {string} word - Plural English word
 * @returns {string} Singular form
 */
export function singularize(word)

/**
 * Convert a snake_case or plural string to a PascalCase singular class name.
 * 'user_profiles' → 'UserProfile', 'comments' → 'Comment'
 * @param {string} str - snake_case or plural string
 * @returns {string} PascalCase singular class name
 */
export function classify(str)

/**
 * Convert a PascalCase class name to a snake_case plural table name.
 * 'UserProfile' → 'user_profiles', 'Person' → 'people'
 * @param {string} className - PascalCase class name
 * @returns {string} snake_case plural table name
 */
export function tableize(className)

/**
 * Convert a PascalCase string to snake_case.
 * 'UserProfile' → 'user_profile'
 * @param {string} str
 * @returns {string}
 */
export function underscore(str)
```

**Internal design:**

- `applyRules(word, rules)` — iterate rules array in reverse, return first match replacement
- `checkIrregular(word, direction)` — check irregular map in the specified direction
- `isUncountable(word)` — check uncountable set (case-insensitive)
- Each public function: check uncountable → check irregular → apply rules

**Edge cases:**

- Empty string → return empty string
- Already-plural words passed to `pluralize` (e.g., `'people'`) — rules should be idempotent where possible, but this is best-effort
- Uppercase input → preserve first-letter casing of output
- `classify('')` → return `''`
- `tableize('HTMLParser')` → `'html_parsers'` (consecutive uppercase)
- Words ending in 'ss' (e.g., `'address'`) → `'addresses'` (not `'addresss'`)
- Words ending in 's' that aren't plural (e.g., `'status'`) → `'statuses'`

**Test file:** `test/utils/inflector.test.js`

**Test cases:**

| Test Name                         | Input             | Function      | Expected          |
| --------------------------------- | ----------------- | ------------- | ----------------- |
| `pluralize: regular word`         | `'user'`          | `pluralize`   | `'users'`         |
| `pluralize: word ending in y`     | `'category'`      | `pluralize`   | `'categories'`    |
| `pluralize: word ending in s`     | `'status'`        | `pluralize`   | `'statuses'`      |
| `pluralize: word ending in ss`    | `'address'`       | `pluralize`   | `'addresses'`     |
| `pluralize: word ending in x`     | `'box'`           | `pluralize`   | `'boxes'`         |
| `pluralize: word ending in ch`    | `'match'`         | `pluralize`   | `'matches'`       |
| `pluralize: word ending in sh`    | `'wish'`          | `pluralize`   | `'wishes'`        |
| `pluralize: word ending in f`     | `'wolf'`          | `pluralize`   | `'wolves'`        |
| `pluralize: word ending in fe`    | `'wife'`          | `pluralize`   | `'wives'`         |
| `pluralize: word ending in o`     | `'potato'`        | `pluralize`   | `'potatoes'`      |
| `pluralize: word ending in is`    | `'analysis'`      | `pluralize`   | `'analyses'`      |
| `pluralize: word ending in um`    | `'medium'`        | `pluralize`   | `'media'`         |
| `pluralize: irregular person`     | `'person'`        | `pluralize`   | `'people'`        |
| `pluralize: irregular child`      | `'child'`         | `pluralize`   | `'children'`      |
| `pluralize: irregular man`        | `'man'`           | `pluralize`   | `'men'`           |
| `pluralize: uncountable`          | `'sheep'`         | `pluralize`   | `'sheep'`         |
| `pluralize: empty string`         | `''`              | `pluralize`   | `''`              |
| `singularize: regular word`       | `'users'`         | `singularize` | `'user'`          |
| `singularize: ies to y`           | `'categories'`    | `singularize` | `'category'`      |
| `singularize: ses to s`           | `'statuses'`      | `singularize` | `'status'`        |
| `singularize: sses to ss`         | `'addresses'`     | `singularize` | `'address'`       |
| `singularize: xes to x`           | `'boxes'`         | `singularize` | `'box'`           |
| `singularize: ves to f`           | `'wolves'`        | `singularize` | `'wolf'`          |
| `singularize: ves to fe`          | `'wives'`         | `singularize` | `'wife'`          |
| `singularize: irregular people`   | `'people'`        | `singularize` | `'person'`        |
| `singularize: irregular children` | `'children'`      | `singularize` | `'child'`         |
| `singularize: uncountable`        | `'sheep'`         | `singularize` | `'sheep'`         |
| `singularize: news`               | `'news'`          | `singularize` | `'news'`          |
| `singularize: empty string`       | `''`              | `singularize` | `''`              |
| `classify: snake_case plural`     | `'user_profiles'` | `classify`    | `'UserProfile'`   |
| `classify: simple plural`         | `'comments'`      | `classify`    | `'Comment'`       |
| `classify: irregular plural`      | `'people'`        | `classify`    | `'Person'`        |
| `classify: singular already`      | `'user'`          | `classify`    | `'User'`          |
| `classify: empty string`          | `''`              | `classify`    | `''`              |
| `classify: single word plural`    | `'categories'`    | `classify`    | `'Category'`      |
| `tableize: simple class`          | `'User'`          | `tableize`    | `'users'`         |
| `tableize: compound class`        | `'UserProfile'`   | `tableize`    | `'user_profiles'` |
| `tableize: irregular`             | `'Person'`        | `tableize`    | `'people'`        |
| `tableize: ending in y`           | `'Category'`      | `tableize`    | `'categories'`    |
| `tableize: ending in ss`          | `'Address'`       | `tableize`    | `'addresses'`     |
| `underscore: simple`              | `'User'`          | `underscore`  | `'user'`          |
| `underscore: compound`            | `'UserProfile'`   | `underscore`  | `'user_profile'`  |
| `underscore: consecutive caps`    | `'HTMLParser'`    | `underscore`  | `'html_parser'`   |

---

### Task 2: Replace `toTableName()` and `classify()` With Inflector

**Problem:** Both `toTableName()` in `helpers.js` and `classify()` in `graph.js` use broken naive implementations.

**Files to modify:**

- `src/tools/handlers/helpers.js` — replace `toTableName()` body
- `src/core/graph.js` — replace `classify()` body
- `src/extractors/factory-registry.js` — replace local `classify()` body

**Changes:**

1. In `src/tools/handlers/helpers.js`:
   - Add `import { tableize } from '../../utils/inflector.js'` at top
   - Replace `toTableName(name)` body with: `return tableize(name)`

2. In `src/core/graph.js`:
   - Add `import { classify as inflectorClassify } from '../utils/inflector.js'` at top
   - Replace the `classify(str)` function body with: `return inflectorClassify(str)`
   - Keep the export so existing importers aren't broken

3. In `src/extractors/factory-registry.js`:
   - Add `import { classify as inflectorClassify } from '../utils/inflector.js'` at top
   - Replace the local `classify(str)` function body with: `return inflectorClassify(str)`

**Test file:** `test/integration/inflector-integration.test.js`

**Test cases:**

| Test Name                                            | Description                                      |
| ---------------------------------------------------- | ------------------------------------------------ |
| `toTableName produces correct table for Person`      | `toTableName('Person')` → `'people'`             |
| `toTableName produces correct table for Category`    | `toTableName('Category')` → `'categories'`       |
| `toTableName produces correct table for Address`     | `toTableName('Address')` → `'addresses'`         |
| `toTableName produces correct table for UserProfile` | `toTableName('UserProfile')` → `'user_profiles'` |
| `graph classify singularizes association names`      | `classify('comments')` → `'Comment'`             |
| `graph classify singularizes irregular names`        | `classify('people')` → `'Person'`                |
| `graph classify handles snake_case plural`           | `classify('user_profiles')` → `'UserProfile'`    |
| `graph classify handles already-singular`            | `classify('user')` → `'User'`                    |

---

## Phase 2: Graph Correctness & Performance

These tasks fix the graph construction and traversal layer. Phase 2 depends on Phase 1 (inflector).

**Tasks 3, 4, and 5 are parallelizable.**

---

### Task 3: Add `type` to Forward Adjacency and Rewrite BFS to Use Adjacency Maps

**Problem:** BFS calls `_forwardEdgesFrom()` and `_reverseEdgesTo()` which do `this.edges.filter(...)` — O(E) per call, making BFS O(V×E). The graph already maintains adjacency maps but the forward map is missing `type`, forcing the fallback to linear scan.

**Files to modify:**

- `src/core/graph.js`

**Changes:**

1. In `addEdge()`, change the forward adjacency push from:

   ```javascript
   this.adjacency.get(from).push({ to, weight })
   ```

   to:

   ```javascript
   this.adjacency.get(from).push({ to, weight, type })
   ```

2. Rewrite `_enqueueNeighbours()` to use adjacency maps directly:

   ```javascript
   _enqueueNeighbours(current, direction, visited, queue, excludeEdgeTypes, minEdgeWeight) {
     const neighbours = direction === 'forward'
       ? this.adjacency.get(current.entity) || []
       : this.reverseAdjacency.get(current.entity) || []

     for (const edge of neighbours) {
       const neighbour = direction === 'forward' ? edge.to : edge.from
       const edgeType = edge.type
       if (visited.has(neighbour)) continue
       if (excludeEdgeTypes.has(edgeType)) continue
       if (edge.weight < minEdgeWeight) continue

       visited.add(neighbour)
       queue.push({
         entity: neighbour,
         distance: current.distance + 1,
         reachedVia: current.entity,
         edgeType,
         direction,
       })
     }
   }
   ```

3. Remove the now-unused `_forwardEdgesFrom()` and `_reverseEdgesTo()` methods.

4. Update `collectImpactedTests()` in `src/core/blast-radius.js` — it directly iterates `graph.edges` to find test edges. This is acceptable since it runs once per blast radius call, but note it in a comment.

**Edge cases:**

- Nodes with zero outgoing edges (dangling nodes) — adjacency map returns empty array, BFS correctly skips
- Nodes not in the graph — `this.adjacency.get()` returns undefined, the `|| []` fallback handles it
- Self-referencing edges — `visited` set prevents infinite loops

**Test file:** `test/core/graph-bfs-performance.test.js`

**Test cases:**

| Test Name                                 | Description                                                                                                 |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `BFS returns same results as linear scan` | Build a 10-node graph, run BFS, verify identical results to a reference implementation using edge filtering |
| `BFS respects excludeEdgeTypes`           | Build graph with mixed edge types, exclude one type, verify excluded edges are not traversed                |
| `BFS respects minEdgeWeight`              | Build graph with edges of weight 0.5 and 2.0, set minEdgeWeight=1.0, verify only heavy edges traversed      |
| `BFS handles disconnected nodes`          | Add nodes with no edges, verify they don't appear in results                                                |
| `BFS handles self-referencing edges`      | Add edge from A→A, verify no infinite loop and A appears at distance 0 only                                 |
| `forward adjacency entries include type`  | Add edge with type 'has_many', verify adjacency entry has type field                                        |
| `BFS traverses reverse edges`             | Build A→B edge, seed from B, verify A is found via reverse traversal                                        |
| `BFS maxDepth is respected`               | Build A→B→C→D chain, maxDepth=2, verify D is not in results                                                 |

---

### Task 4: Fix Association Target Resolution — `class_name` Override and Join Model Edges

**Problem:** (a) Associations with `class_name:` overrides point to wrong nodes. `has_many :active_users, class_name: 'User'` creates an edge to `ActiveUser` instead of `User`. (b) `has_many :through` associations don't create edges to the join model. (c) Polymorphic `belongs_to` creates phantom nodes.

**Files to modify:**

- `src/core/graph.js` — in `buildGraph()`, the model association edge creation block

**Changes:**

In the association processing loop inside `buildGraph()`:

1. **Extract `class_name` from options before classifying:**

   ```javascript
   const classNameOverride = extractClassName(assoc.options)
   const target = classNameOverride || classify(assoc.name)
   ```

   Add helper:

   ```javascript
   /**
    * Extract class_name override from association options string.
    * @param {string|null} options - Raw options string from extractor
    * @returns {string|null} Class name or null
    */
   function extractClassName(options) {
     if (!options) return null
     const match = options.match(/class_name:\s*['"](\w+(?:::\w+)*)['"']/)
     return match ? match[1] : null
   }
   ```

2. **Add join model edge for `through` associations:**
   After creating the `has_many_through` edge to the target, also create an edge to the join model:

   ```javascript
   if (assoc.through) {
     const joinModel = classify(assoc.through)
     graph.addNode(joinModel, 'model', joinModel)
     graph.addEdge(name, joinModel, 'has_many')
     relationships.push({ from: name, to: joinModel, type: 'has_many' })
   }
   ```

3. **Skip phantom edges for polymorphic `belongs_to`:**
   When processing `belongs_to` associations, check for `polymorphic: true` in options. If polymorphic, do NOT create an edge (the target is unknown at static analysis time):

   ```javascript
   if (type === 'belongs_to' && assoc.polymorphic) continue
   ```

4. **Handle polymorphic `has_many` with `as:` option:**
   When a `has_many` has an `as:` option (e.g., `has_many :comments, as: :commentable`), the edge is valid — it still points from the model to Comment. No change needed, but add a comment documenting this.

**Edge cases:**

- `class_name` with namespace: `class_name: 'Admin::User'` → target is `Admin::User`
- `class_name` with no quotes (shouldn't happen in valid Ruby, but defensive): return null
- Multiple `through` chains (A has_many B through C, B has_many D through E) — each creates its own join edge; no special handling needed
- `has_many :images, as: :imageable` — valid edge, not skipped

**Test file:** `test/core/graph-associations.test.js`

**Test cases:**

| Test Name                                     | Description                                                                                      |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `class_name override used as edge target`     | Association with `class_name: 'User'` creates edge to `User`, not to classified association name |
| `class_name with namespace`                   | `class_name: 'Admin::User'` creates edge to `Admin::User`                                        |
| `through association creates join model edge` | `has_many :roles, through: :user_roles` creates edges to both `Role` and `UserRole`              |
| `polymorphic belongs_to skipped`              | `belongs_to :commentable, polymorphic: true` creates no edge                                     |
| `polymorphic has_many creates edge`           | `has_many :comments, as: :commentable` creates edge to `Comment`                                 |
| `no class_name returns null`                  | Options string without class_name returns null from extractor                                    |
| `regular association uses classify`           | `has_many :comments` creates edge to `Comment` (singularized)                                    |

---

### Task 5: Store Graph Instance in Index and Eliminate Redundant Rebuild

**Problem:** `computeBlastRadius()` calls `rebuildGraph()` which reconstructs the entire graph (all nodes, edges, PageRank) from extractions. The graph was already built during indexing but only `relationships` and `rankings` are persisted — the `Graph` instance is discarded.

**Files to modify:**

- `src/core/indexer.js` — store graph in index
- `src/core/blast-radius.js` — use stored graph, remove rebuild

**Changes:**

1. In `indexer.js`, `buildIndex()`:
   - Change `const { relationships, rankings } = buildGraph(...)` to `const { graph, relationships, rankings } = buildGraph(...)`
   - Add `graph` to the returned index object

2. In `blast-radius.js`:
   - Remove `rebuildGraph()`, `requireBuildGraph()`, `rebuildGraphFromImport()`, `_buildGraphFn`, `_loadBuildGraph()`, `_syncBuildGraph()` — all dead code
   - Remove `import { buildGraph as _buildGraphDirect } from './graph.js'`
   - In `computeBlastRadius()`, change `const graph = rebuildGraph(index)` to `const graph = index.graph`
   - Add a guard: if `!index.graph`, return `emptyResult('No graph available — re-index required')`

**Edge cases:**

- Index built before this change (no `graph` property) — the guard handles it with a clear error message
- Thread safety — not applicable, Node.js is single-threaded

**Test file:** `test/core/blast-radius-graph-reuse.test.js`

**Test cases:**

| Test Name                                  | Description                                                                                               |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `index includes graph instance`            | After `buildIndex()`, verify `index.graph` is a Graph instance with nodes and edges                       |
| `blast radius uses index graph`            | Call `computeBlastRadius()` with an index containing a graph, verify it doesn't throw and returns results |
| `blast radius without graph returns error` | Call with index that has no `graph` property, verify it returns emptyResult                               |
| `no redundant graph build imports`         | Verify `blast-radius.js` does not import `buildGraph` from `graph.js`                                     |

---

## Phase 3: Blast Radius Coverage Expansion

Depends on Phase 2.

**Tasks 6 and 7 are parallelizable.**

---

### Task 6: Expand `fileEntityMap` to Cover All File Types

**Problem:** `buildFileEntityMap()` only maps models, controllers, components, stimulus controllers, concerns, views, and 3 special files. Jobs, mailers, policies, services, channels, and other file types are unmapped, causing blast radius to report them as warnings instead of tracing their impact.

**Files to modify:**

- `src/core/indexer.js` — `buildFileEntityMap()` function

**Changes:**

Add mapping functions after the existing `mapViewFiles` call:

1. **Job files:**

   ```javascript
   function mapJobFiles(map, jobs) {
     if (!jobs?.jobs) return
     for (const job of jobs.jobs) {
       if (job.file && job.class) {
         map[job.file] = { entity: job.class, type: 'job' }
       }
     }
   }
   ```

2. **Mailer files:**

   ```javascript
   function mapMailerFiles(map, email) {
     if (!email?.mailers) return
     for (const mailer of email.mailers) {
       if (mailer.file && mailer.class) {
         map[mailer.file] = { entity: mailer.class, type: 'mailer' }
       }
     }
   }
   ```

   Note: mailers don't currently have a `file` property in their extraction. The `extractEmail` function needs a one-line addition — see sub-task below.

3. **Policy files:**

   ```javascript
   function mapPolicyFiles(map, authorization, manifest) {
     const entries = manifest?.entries || []
     for (const entry of entries) {
       if (entry.path.startsWith('app/policies/') && entry.path.endsWith('.rb')) {
         const className = pathToClassName(entry.path)
         map[entry.path] = { entity: className, type: 'policy' }
       }
     }
   }
   ```

4. **Service object files:**

   ```javascript
   function mapServiceFiles(map, manifest) {
     const entries = manifest?.entries || []
     for (const entry of entries) {
       if (entry.path.startsWith('app/services/') && entry.path.endsWith('.rb')) {
         const className = pathToClassName(entry.path)
         map[entry.path] = { entity: className, type: 'service' }
       }
     }
   }
   ```

5. **Channel files:**

   ```javascript
   function mapChannelFiles(map, realtime) {
     if (!realtime?.channels) return
     for (const channel of realtime.channels) {
       if (channel.file && channel.class) {
         map[channel.file] = { entity: channel.class, type: 'channel' }
       }
     }
   }
   ```

   Note: channels don't currently have a `file` property. See sub-task below.

6. **Migration files:**
   ```javascript
   function mapMigrationFiles(map, manifest) {
     const entries = manifest?.entries || []
     for (const entry of entries) {
       if (entry.path.startsWith('db/migrate/') && entry.path.endsWith('.rb')) {
         map[entry.path] = { entity: '__schema__', type: 'migration' }
       }
     }
   }
   ```

**Sub-task: Add `file` property to mailer and channel extractions:**

In `src/extractors/email.js`, inside the mailer extraction loop, add `file: entry.path` to the mailer object.

In `src/extractors/realtime.js`, inside the channel extraction loop, add `file: entry.path` to the channel object.

Call all new mapping functions from `buildFileEntityMap()`.

**Test file:** `test/core/indexer-file-entity-map.test.js`

**Test cases:**

| Test Name                            | Description                                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `maps job files`                     | Job file at `app/jobs/send_email_job.rb` maps to `{ entity: 'SendEmailJob', type: 'job' }`        |
| `maps mailer files`                  | Mailer file maps to correct entity and type                                                       |
| `maps policy files`                  | Policy file at `app/policies/post_policy.rb` maps to `{ entity: 'PostPolicy', type: 'policy' }`   |
| `maps service files`                 | Service file at `app/services/create_user.rb` maps to `{ entity: 'CreateUser', type: 'service' }` |
| `maps channel files`                 | Channel file maps to correct entity and type                                                      |
| `maps migration files to __schema__` | Migration file maps to `{ entity: '__schema__', type: 'migration' }`                              |
| `existing mappings preserved`        | Models, controllers, and special files still map correctly                                        |

---

### Task 7: Fix `test` Edge Exclusion From Main BFS Results

**Problem:** Test edges (`type: 'tests'`) are traversed during regular BFS and appear in the main `impacted` array. They should only appear in `impactedTests`. The blast radius already collects impacted tests separately via `collectImpactedTests()`, but the BFS doesn't exclude test edges.

**Files to modify:**

- `src/core/blast-radius.js` — in `computeBlastRadius()`

**Changes:**

In the `bfsFromSeeds()` call, add `'tests'` to the `excludeEdgeTypes` set:

```javascript
const bfsResults = graph.bfsFromSeeds(seedIds, maxDepth, {
  excludeEdgeTypes: new Set(['contains', 'tests']),
})
```

This prevents spec nodes from appearing in the `impacted` array while `collectImpactedTests()` continues to find them by directly scanning `graph.edges`.

**Test file:** `test/core/blast-radius-test-exclusion.test.js`

**Test cases:**

| Test Name                               | Description                                                                   |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| `test entities not in impacted array`   | Spec entities reachable via test edges do not appear in `impacted`            |
| `test entities appear in impactedTests` | Spec entities correctly appear in `impactedTests`                             |
| `non-test entities still reachable`     | Models and controllers connected by non-test edges still appear in `impacted` |

---

## Phase 4: Extraction Quality Fixes

These tasks fix extraction accuracy issues. Can run in parallel with Phase 3 if inflector (Phase 1) is complete.

**All tasks in Phase 4 are parallelizable.**

---

### Task 8: Fix Controller Action Line Range Calculation

**Problem:** The controller extractor's `action_line_ranges` sets `end` to the line before the next `def` or `private`/`protected` marker, but doesn't track the actual `end` keyword. For methods with multi-line conditionals, the range extends too far.

**Files to modify:**

- `src/extractors/controller.js`

**Changes:**

Replace the line-range tracking logic with a proper depth-tracking approach:

```javascript
const actions = []
const action_line_ranges = {}
const lines = content.split('\n')
let inPublic = true
let currentActionName = null
let currentActionStart = null
let methodDepth = 0

for (let i = 0; i < lines.length; i++) {
  const line = lines[i]
  const lineNumber = i + 1

  if (visRe.test(line)) {
    if (currentActionName && inPublic) {
      action_line_ranges[currentActionName] = {
        start: currentActionStart,
        end: lineNumber - 1,
      }
    }
    inPublic = false
    currentActionName = null
    methodDepth = 0
    continue
  }

  const mm = line.match(methodRe)
  if (mm) {
    if (currentActionName && inPublic) {
      action_line_ranges[currentActionName] = {
        start: currentActionStart,
        end: lineNumber - 1,
      }
    }
    if (inPublic) {
      actions.push(mm[1])
      currentActionName = mm[1]
      currentActionStart = lineNumber
      methodDepth = 1
    } else {
      currentActionName = null
    }
    continue
  }

  if (currentActionName && inPublic) {
    if (/\bdo\b|\bif\b(?!.*\bthen\b.*\bend\b)|\bcase\b|\bbegin\b/.test(line) && !/\bend\b/.test(line)) {
      methodDepth++
    }
    if (/^\s*end\b/.test(line)) {
      methodDepth--
      if (methodDepth <= 0) {
        action_line_ranges[currentActionName] = {
          start: currentActionStart,
          end: lineNumber,
        }
        currentActionName = null
        methodDepth = 0
      }
    }
  }
}
```

Apply the same fix to the model extractor's `method_line_ranges` in `src/extractors/model.js`.

**Test file:** `test/extractors/controller-line-ranges.test.js`

**Test cases:**

| Test Name                 | Description                                                                    |
| ------------------------- | ------------------------------------------------------------------------------ | --- | -------------------------------- |
| `simple action range`     | `def show; @post = Post.find(params[:id]); end` → correct start/end            |
| `action with conditional` | `def create; if valid?; save; else; render; end; end` → end is the outer `end` |
| `action with block`       | `def index; @posts = Post.where {                                              | p   | p.active }; end` → correct range |
| `multiple actions`        | Two consecutive public methods → each has distinct non-overlapping ranges      |
| `action before private`   | Public method followed by `private` → range ends before private line           |

---

### Task 9: Fix Coverage Snapshot Path Normalization

**Problem:** `normaliseToRelative()` finds the first `/app/` in the path, which breaks if the project is under a directory containing `app` (e.g., `/home/user/my-app/app/models/user.rb` → `app/app/models/user.rb`).

**Files to modify:**

- `src/extractors/coverage-snapshot.js`

**Changes:**

Replace the function with a version that finds the _last_ `/app/` or `/lib/` match, since the Rails app directory is always the deepest one:

```javascript
function normaliseToRelative(filePath) {
  if (filePath.startsWith('app/') || filePath.startsWith('lib/')) {
    return filePath
  }

  const appIdx = filePath.lastIndexOf('/app/')
  if (appIdx !== -1) return filePath.slice(appIdx + 1)

  const libIdx = filePath.lastIndexOf('/lib/')
  if (libIdx !== -1 && !filePath.slice(libIdx).includes('/gems/')) {
    return filePath.slice(libIdx + 1)
  }

  return null
}
```

**Test file:** `test/extractors/coverage-snapshot-paths.test.js`

**Test cases:**

| Test Name                          | Description                                                        |
| ---------------------------------- | ------------------------------------------------------------------ |
| `already relative app path`        | `'app/models/user.rb'` → `'app/models/user.rb'`                    |
| `absolute path with single app`    | `'/home/user/project/app/models/user.rb'` → `'app/models/user.rb'` |
| `absolute path with app in parent` | `'/home/user/my-app/app/models/user.rb'` → `'app/models/user.rb'`  |
| `lib path without gems`            | `'/home/user/project/lib/tasks/seed.rb'` → `'lib/tasks/seed.rb'`   |
| `lib path inside gem ignored`      | `'/home/user/.rbenv/gems/devise/lib/devise.rb'` → `null`           |
| `unrecognized path`                | `'/etc/config.rb'` → `null`                                        |

---

### Task 10: Fix Duplicate `detectSpecStyle` Function

**Problem:** `detectSpecStyle` is implemented identically in both `test-conventions.js` and `tier2.js`.

**Files to modify:**

- `src/extractors/test-conventions.js` — extract to shared utility
- `src/extractors/tier2.js` — import from shared utility

**Changes:**

1. Create `src/utils/spec-style-detector.js`:

   ```javascript
   /**
    * Detect spec style (request vs controller specs).
    * @param {Array<{path: string}>} entries
    * @returns {{primary: string, request_count: number, controller_count: number, has_mixed: boolean}}
    */
   export function detectSpecStyle(entries) {
     const requestCount = entries.filter(e => e.path.startsWith('spec/requests/')).length
     const controllerCount = entries.filter(e => e.path.startsWith('spec/controllers/')).length
     return {
       primary: requestCount >= controllerCount ? 'request' : 'controller',
       request_count: requestCount,
       controller_count: controllerCount,
       has_mixed: requestCount > 0 && controllerCount > 0,
     }
   }
   ```

2. In both `test-conventions.js` and `tier2.js`, replace the local `detectSpecStyle` with an import from the shared module.

**Test file:** `test/utils/spec-style-detector.test.js`

**Test cases:**

| Test Name                 | Description                                                                  |
| ------------------------- | ---------------------------------------------------------------------------- |
| `request-only project`    | All specs in `spec/requests/` → primary is `'request'`, has_mixed is `false` |
| `controller-only project` | All specs in `spec/controllers/` → primary is `'controller'`                 |
| `mixed project`           | Both directories have specs → `has_mixed` is `true`                          |
| `no specs`                | Empty entries → `request_count` and `controller_count` are 0                 |

---

### Task 11: Fix `get_deep_analysis` Tool Description to List All Categories

**Problem:** The tool description lists 19 categories but the switch statement handles 24+.

**Files to modify:**

- `src/tools/handlers/get-deep-analysis.js`

**Changes:**

Update the description string to include ALL handled categories:

```
'Get deep analysis for a specific category. Categories: authentication, authorization, jobs, email, storage, caching, realtime, api_patterns, dependencies, components, stimulus, views, convention_drift, manifest, detected_stack, related, model_list, controller_list, component_list, testing, design_patterns, test_conventions, factory_registry, coverage_snapshot'
```

This matches the `default` case's `available` array exactly.

**Test:** No dedicated test file — this is a string update. Verified by the existing MCP contract tests.

---

### Task 12: Fix `mapViewFiles` Namespace Handling

**Problem:** `mapViewFiles` uses only the first path segment after `app/views/` as the controller slug. For `app/views/admin/users/index.html.erb`, it maps to `AdminController` instead of `Admin::UsersController`.

**Files to modify:**

- `src/core/indexer.js` — `mapViewFiles()` function

**Changes:**

Replace the single-segment extraction with multi-segment namespace support:

```javascript
function mapViewFiles(map, controllers, manifest) {
  const entries = manifest?.entries || []
  for (const entry of entries) {
    if (!entry.path.startsWith('app/views/')) continue
    const relativePath = entry.path.replace('app/views/', '')
    const segments = relativePath.split('/')
    if (segments.length < 2) continue

    // Try progressively longer namespace paths: admin/users, admin, users
    const viewSegments = segments.slice(0, -1) // Remove filename
    for (let depth = viewSegments.length; depth >= 1; depth--) {
      const controllerSlug = viewSegments.slice(0, depth).join('/') + '_controller.rb'
      const className = pathToClassName(controllerSlug)
      if (controllers && controllers[className]) {
        map[entry.path] = { entity: className, type: 'view' }
        break
      }
    }
  }
}
```

Wait — `pathToClassName` converts `admin/users_controller.rb` to `UsersController`, not `Admin::UsersController`. The function strips the path and only uses the basename. We need a namespace-aware version:

```javascript
function mapViewFiles(map, controllers, manifest) {
  const entries = manifest?.entries || []
  for (const entry of entries) {
    if (!entry.path.startsWith('app/views/')) continue
    const relativePath = entry.path.replace('app/views/', '')
    const segments = relativePath.split('/')
    if (segments.length < 2) continue

    const viewDir = segments.slice(0, -1).join('/')
    const ctrlPath = `app/controllers/${viewDir}_controller.rb`
    const ctrlClassName = deriveControllerClassName(viewDir)

    if (controllers && controllers[ctrlClassName]) {
      map[entry.path] = { entity: ctrlClassName, type: 'view' }
    }
  }
}

/**
 * Derive a Rails controller class name from a view directory path.
 * 'admin/users' → 'Admin::UsersController'
 * 'posts' → 'PostsController'
 * @param {string} viewDir
 * @returns {string}
 */
function deriveControllerClassName(viewDir) {
  const parts = viewDir.split('/')
  const classified = parts.map(segment =>
    segment.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')
  )
  return classified.join('::') + 'Controller'
}
```

Note: This approach tries the exact namespace match. If `Admin::UsersController` exists, it maps. It does NOT try `UsersController` as a fallback, because that would be incorrect — `app/views/admin/users/` belongs to the namespaced controller.

**Test file:** `test/core/indexer-view-mapping.test.js`

**Test cases:**

| Test Name                                       | Description                                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------------------------- |
| `simple view maps to controller`                | `app/views/posts/index.html.erb` → `PostsController`                                  |
| `namespaced view maps to namespaced controller` | `app/views/admin/users/show.html.erb` → `Admin::UsersController`                      |
| `deeply nested namespace`                       | `app/views/api/v1/posts/index.json.jbuilder` → `Api::V1::PostsController`             |
| `view with no matching controller`              | `app/views/shared/_header.html.erb` → not mapped                                      |
| `layout files not mapped`                       | `app/views/layouts/application.html.erb` → not mapped (layouts dir has no controller) |

---

## Phase 5: Error Handling & Robustness

**All tasks in Phase 5 are parallelizable.**

---

### Task 13: Add Error Boundaries Around All Extractors

**Problem:** In `buildIndex()`, all 19 extractors run sequentially with no try/catch. A single extractor throwing (malformed Ruby, unexpected encoding) crashes the entire index build.

**Files to modify:**

- `src/core/indexer.js`

**Changes:**

Create a helper function:

```javascript
/**
 * Run an extractor with error boundary. Returns fallback value on failure.
 * @param {string} name - Extractor name for logging
 * @param {Function} extractorFn - Extractor function to call
 * @param {*} fallback - Value to return on error
 * @param {boolean} verbose - Whether to log errors
 * @returns {*} Extraction result or fallback
 */
function safeExtract(name, extractorFn, fallback, verbose) {
  try {
    return extractorFn()
  } catch (err) {
    if (verbose) {
      process.stderr.write(`[railsinsight] Extractor '${name}' failed: ${err.message}\n`)
    }
    return fallback
  }
}
```

Wrap every extractor call in `buildIndex()`:

```javascript
const schemaData = safeExtract('schema', () => extractSchema(provider), {}, options.verbose)
const extractions = {
  gemfile: safeExtract('gemfile', () => extractGemfile(provider), { gems: [] }, options.verbose),
  config: safeExtract('config', () => extractConfig(provider), {}, options.verbose),
  schema: schemaData,
  routes: safeExtract('routes', () => extractRoutes(provider), {}, options.verbose),
  // ... etc for all extractors
}
```

Also wrap per-file extractors (model, controller, component, stimulus) in the for-loop:

```javascript
for (const entry of entries) {
  if (entry.categoryName === 'models') {
    const className = pathToClassName(entry.path)
    const model = safeExtract(`model:${className}`, () => extractModel(provider, entry.path, className), null, options.verbose)
    if (model) extractions.models[className] = model
  }
  // ... etc
}
```

Add an `extraction_errors` array to the returned index, populated by a modified `safeExtract` that pushes error names.

**Test file:** `test/core/indexer-error-boundaries.test.js`

**Test cases:**

| Test Name                                    | Description                                                                             |
| -------------------------------------------- | --------------------------------------------------------------------------------------- |
| `safeExtract returns result on success`      | Function returns value → safeExtract returns same value                                 |
| `safeExtract returns fallback on throw`      | Function throws → safeExtract returns fallback                                          |
| `index builds despite one failing extractor` | Mock provider that throws on schema reading → index still has models, controllers, etc. |
| `extraction_errors tracks failures`          | Failed extractor name appears in index.extraction_errors                                |
| `verbose logs error to stderr`               | With verbose=true, error message is written to stderr                                   |

---

### Task 14: Use MCP `isError` Flag for Error Responses

**Problem:** The `respond()` helper always returns a text content block, even for errors. MCP supports `isError: true` to distinguish errors from valid empty results.

**Files to modify:**

- `src/tools/handlers/helpers.js`

**Changes:**

Add a new `respondError()` function:

```javascript
/**
 * Wrap an error as an MCP error response.
 * @param {string} message - Error message
 * @param {Object} [details] - Additional details
 * @returns {Object} MCP response with isError flag
 */
export function respondError(message, details = {}) {
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: message, ...details }) }],
    isError: true,
  }
}
```

Update all tool handlers that return error objects to use `respondError()` instead of `respond()`:

- `get-model.js`: "Model not found" case
- `get-controller.js`: "Controller not found" case
- `get-deep-analysis.js`: "Unknown category" case and all "not found" cases
- `get-factory-registry.js`: "Factory not found" case
- `blast-radius-tools.js`: error cases
- `noIndex()` helper

**Test file:** `test/tools/helpers-error-response.test.js`

**Test cases:**

| Test Name                                  | Description                                                                  |
| ------------------------------------------ | ---------------------------------------------------------------------------- |
| `respondError includes isError flag`       | `respondError('not found')` returns `{ isError: true, ... }`                 |
| `respondError includes message in content` | JSON parsed from content text includes `{ error: 'not found' }`              |
| `respondError includes details`            | `respondError('fail', { available: ['a'] })` includes `available` in content |
| `respond does not include isError`         | Regular `respond({})` returns object without `isError` property              |
| `noIndex returns isError`                  | `noIndex()` response has `isError: true`                                     |

---

### Task 15: Add Timeout Context to `execCommand` Errors

**Problem:** `execCommand` timeout returns a generic error message without indicating the timeout cause.

**Files to modify:**

- `src/providers/local-fs.js`

**Changes:**

In the `execCommand` catch block, detect timeout:

```javascript
async execCommand(command) {
  try {
    const { stdout, stderr } = await execPromise(command, {
      cwd: this._root,
      maxBuffer: EXEC_MAX_BUFFER,
      timeout: EXEC_TIMEOUT_MS,
    })
    return { stdout: stdout || '', stderr: stderr || '', exitCode: 0 }
  } catch (err) {
    const isTimeout = err.killed && err.signal === 'SIGTERM'
    return {
      stdout: err.stdout || '',
      stderr: isTimeout
        ? `Command timed out after ${EXEC_TIMEOUT_MS}ms: ${command}`
        : (err.stderr || ''),
      exitCode: err.code || 1,
    }
  }
}
```

**Test file:** `test/providers/local-fs-exec.test.js`

**Test cases:**

| Test Name                             | Description                                               |
| ------------------------------------- | --------------------------------------------------------- |
| `successful command returns stdout`   | `echo hello` returns `{ stdout: 'hello\n', exitCode: 0 }` |
| `failed command returns stderr`       | `false` returns `{ exitCode: 1 }`                         |
| `timeout returns descriptive message` | Mock a long-running command → stderr contains "timed out" |

---

## Phase 6: Rails Pattern Coverage

**All tasks in Phase 6 are parallelizable. They only add new extraction logic, no cross-dependencies.**

---

### Task 16: Detect `strict_loading` on Models and Associations

**Files to modify:**

- `src/core/patterns/model.js` — add pattern
- `src/extractors/model.js` — extract `strict_loading`

**Changes:**

1. Add to `MODEL_PATTERNS`:

   ```javascript
   strictLoading: /^\s*self\.strict_loading_by_default\s*=\s*true/m,
   strictLoadingAssoc: /strict_loading:\s*true/,
   ```

2. In `extractModel()`, after the broadcasts detection:

   ```javascript
   const strict_loading = MODEL_PATTERNS.strictLoading.test(content)
   ```

3. In the association extraction loop, check for `strict_loading: true` in options:

   ```javascript
   if (entry.options && MODEL_PATTERNS.strictLoadingAssoc.test(entry.options)) {
     entry.strict_loading = true
   }
   ```

4. Add `strict_loading` to the returned model object.

**Test file:** `test/extractors/model-strict-loading.test.js`

**Test cases:**

| Test Name                                  | Description                                                                         |
| ------------------------------------------ | ----------------------------------------------------------------------------------- |
| `detects model-level strict_loading`       | `self.strict_loading_by_default = true` → `strict_loading: true`                    |
| `detects association-level strict_loading` | `has_many :comments, strict_loading: true` → association has `strict_loading: true` |
| `absent strict_loading defaults to false`  | No declaration → `strict_loading: false`                                            |

---

### Task 17: Detect Rails 7.1+ `enum` `validate:` Option

**Files to modify:**

- `src/extractors/model.js`

**Changes:**

In the enum extraction logic, after parsing enum values, check for `validate: true` in the surrounding text:

For both modern and legacy hash patterns, capture additional text after the closing brace to check for `validate:`:

```javascript
// After extracting enum values, check for validate option
const afterEnum = content.slice(m.index + m[0].length, m.index + m[0].length + 50)
const hasValidate = /validate:\s*true/.test(m[0] + afterEnum)
if (hasValidate) {
  enums[name].validate = true
}
```

**Test file:** `test/extractors/model-enum-validate.test.js`

**Test cases:**

| Test Name                     | Description                                                                   |
| ----------------------------- | ----------------------------------------------------------------------------- |
| `enum with validate true`     | `enum :status, { draft: 0, published: 1 }, validate: true` → `validate: true` |
| `enum without validate`       | `enum :status, { draft: 0, published: 1 }` → no `validate` property           |
| `modern syntax with validate` | `enum :role, { admin: 0 }, validate: true` → `validate: true`                 |

---

### Task 18: Detect Turbo 8 Morphing

**Files to modify:**

- `src/core/patterns/model.js` — add pattern
- `src/extractors/model.js` — extract

**Changes:**

1. Add to `MODEL_PATTERNS`:

   ```javascript
   turboRefreshes: /^\s*turbo_refreshes_with\s+:(\w+)/m,
   ```

2. In `extractModel()`:

   ```javascript
   const turboRefreshesMatch = content.match(MODEL_PATTERNS.turboRefreshes)
   const turbo_refreshes_with = turboRefreshesMatch ? turboRefreshesMatch[1] : null
   ```

3. Add `turbo_refreshes_with` to the returned model object.

Also detect in controllers via `src/core/patterns/controller.js`:

```javascript
turboRefreshes: /^\s*turbo_refreshes_with\s+:(\w+)/m,
```

**Test file:** `test/extractors/model-turbo-morphing.test.js`

**Test cases:**

| Test Name                              | Description                                                         |
| -------------------------------------- | ------------------------------------------------------------------- |
| `detects turbo_refreshes_with morph`   | `turbo_refreshes_with :morph` → `turbo_refreshes_with: 'morph'`     |
| `detects turbo_refreshes_with replace` | `turbo_refreshes_with :replace` → `turbo_refreshes_with: 'replace'` |
| `no turbo_refreshes`                   | No declaration → `turbo_refreshes_with: null`                       |

---

### Task 19: Cross-Reference `generates_token_for` With Auth Extraction

**Files to modify:**

- `src/extractors/auth.js`

**Changes:**

In the native Rails 8 auth section, after extracting User model auth features, check for token generators:

```javascript
// In the userContent processing block:
const userModel = extractions?.models?.['User'] || {}
if (userModel.token_generators?.length > 0) {
  userInfo.auth_features.token_generators = userModel.token_generators
}
```

Wait — the auth extractor runs before per-file model extraction in the indexer. The models haven't been extracted yet when `extractAuth()` is called. Two options:

**Option A (recommended):** Extract `generates_token_for` directly from userContent in the auth extractor:

```javascript
const tokenGenerators = []
const tokenRe = /generates_token_for\s+:(\w+)/g
let tm
while ((tm = tokenRe.exec(userContent))) {
  tokenGenerators.push(tm[1])
}
if (tokenGenerators.length > 0) {
  userInfo.auth_features.token_generators = tokenGenerators
  // Cross-reference with password reset
  if (tokenGenerators.includes('password_reset')) {
    native.security_features.password_reset_tokens = 'generates_token_for :password_reset'
  }
}
```

**Test file:** `test/extractors/auth-token-generators.test.js`

**Test cases:**

| Test Name                                   | Description                                                                           |
| ------------------------------------------- | ------------------------------------------------------------------------------------- |
| `detects password_reset token`              | User model with `generates_token_for :password_reset` → auth features include it      |
| `detects email_verification token`          | `generates_token_for :email_verification` → listed in auth features                   |
| `no token generators`                       | No declaration → `token_generators` not present                                       |
| `password_reset noted in security_features` | `generates_token_for :password_reset` → `security_features.password_reset_tokens` set |

---

### Task 20: Detect STI Base Classes and Subclasses

**Files to modify:**

- `src/core/indexer.js` — post-extraction STI detection pass
- `src/extractors/model.js` — the `sti_base` field already exists but is hardcoded to `false`

**Changes:**

After all models are extracted in `buildIndex()`, add a post-processing pass:

```javascript
function detectSTIRelationships(models) {
  const stiSubclasses = {}
  for (const [name, model] of Object.entries(models)) {
    if (model.superclass && model.superclass !== 'ApplicationRecord' && models[model.superclass]) {
      if (!stiSubclasses[model.superclass]) stiSubclasses[model.superclass] = []
      stiSubclasses[model.superclass].push(name)
    }
  }
  for (const [baseName, subclasses] of Object.entries(stiSubclasses)) {
    models[baseName].sti_base = true
    models[baseName].sti_subclasses = subclasses
    for (const sub of subclasses) {
      models[sub].sti_parent = baseName
    }
  }
}
```

Call this after the per-file extraction loop completes.

**Test file:** `test/core/indexer-sti-detection.test.js`

**Test cases:**

| Test Name                          | Description                                                                         |
| ---------------------------------- | ----------------------------------------------------------------------------------- |
| `detects STI base class`           | `Admin < User` where both are extracted models → `User.sti_base = true`             |
| `records STI subclasses`           | `Admin < User`, `Moderator < User` → `User.sti_subclasses = ['Admin', 'Moderator']` |
| `marks STI child`                  | `Admin < User` → `Admin.sti_parent = 'User'`                                        |
| `non-STI inheritance ignored`      | `Post < ApplicationRecord` → `Post.sti_base = false`                                |
| `superclass not in models ignored` | `Admin < User` but User not extracted → no STI marking                              |

---

## Phase 7: Token Estimation & YAML Parser

**Tasks 21 and 22 are parallelizable.**

---

### Task 21: Improve Token Estimation for JSON Content

**Problem:** The 4-chars-per-token heuristic underestimates tokens for JSON, causing budget overruns of ~25-33%.

**Files to modify:**

- `src/utils/token-counter.js`

**Changes:**

Replace the flat ratio with content-aware estimation:

```javascript
/** Characters-per-token ratio for different content types. */
const CHARS_PER_TOKEN_PROSE = 4.0
const CHARS_PER_TOKEN_JSON = 3.0
const CHARS_PER_TOKEN_CODE = 3.5

/**
 * Estimate tokens for a text string.
 * @param {string} text
 * @returns {number}
 */
export function estimateTokens(text) {
  if (!text) return 0
  const ratio = detectContentRatio(text)
  return Math.ceil(text.length / ratio)
}

/**
 * Detect content type and return appropriate chars-per-token ratio.
 * @param {string} text
 * @returns {number}
 */
function detectContentRatio(text) {
  if (text.length < 10) return CHARS_PER_TOKEN_PROSE
  const sample = text.slice(0, 200)
  const jsonIndicators = (sample.match(/[{}\[\]:,"]/g) || []).length
  const ratio = jsonIndicators / sample.length
  if (ratio > 0.15) return CHARS_PER_TOKEN_JSON
  if (ratio > 0.05) return CHARS_PER_TOKEN_CODE
  return CHARS_PER_TOKEN_PROSE
}
```

**Test file:** `test/utils/token-counter.test.js`

**Test cases:**

| Test Name                     | Description                                          |
| ----------------------------- | ---------------------------------------------------- |
| `prose uses 4.0 ratio`        | `'hello world text'` → ~4 chars per token            |
| `JSON uses 3.0 ratio`         | `'{"key":"value","arr":[1,2]}'` → ~3 chars per token |
| `empty string returns 0`      | `''` → `0`                                           |
| `null returns 0`              | `null` → `0`                                         |
| `short text uses prose ratio` | `'hi'` → uses 4.0 ratio                              |

---

### Task 22: Add YAML Anchor/Alias Support

**Problem:** The YAML parser ignores `&anchor` and `*alias` syntax, causing Rails' `database.yml` shared defaults to be invisible.

**Files to modify:**

- `src/utils/yaml-parser.js`

**Changes:**

Add anchor storage and alias resolution:

1. Maintain an `anchors` map during parsing.
2. When encountering `key: &anchor_name`, store the resolved value under that anchor name.
3. When encountering `<<: *anchor_name`, merge the anchored value into the current object.
4. When encountering `key: *anchor_name`, resolve to the stored value.

```javascript
export function parseYaml(content) {
  if (!content || typeof content !== 'string') return {}

  const lines = content.split('\n')
  const result = {}
  const anchors = {}
  const stack = [{ obj: result, indent: -1 }]

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s*$/.test(line) || /^\s*#/.test(line)) continue

    const cleanLine = line.replace(/<%.*?%>/g, '')
    if (/^\s*$/.test(cleanLine)) continue

    const indentMatch = cleanLine.match(/^(\s*)/)
    const indent = indentMatch ? indentMatch[1].length : 0

    // Pop stack
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop()
    }

    // Merge key: <<: *alias
    const mergeMatch = cleanLine.match(/^(\s*)<<:\s*\*(\w+)/)
    if (mergeMatch) {
      const aliasName = mergeMatch[2]
      const source = anchors[aliasName]
      if (source && typeof source === 'object') {
        const parent = stack[stack.length - 1].obj
        Object.assign(parent, structuredClone(source))
      }
      continue
    }

    // Key-value with anchor: key: &anchor value
    const kvAnchorMatch = cleanLine.match(/^(\s*)(\w[\w\s-]*):\s*&(\w+)\s*(.*)$/)
    if (kvAnchorMatch) {
      const key = kvAnchorMatch[2].trim()
      const anchorName = kvAnchorMatch[3]
      const value = kvAnchorMatch[4].trim()
      const parent = stack[stack.length - 1].obj

      if (value === '' || value === '|' || value === '>') {
        parent[key] = {}
        anchors[anchorName] = parent[key]
        stack.push({ obj: parent[key], indent, arrayKey: null })
      } else {
        parent[key] = parseYamlValue(value)
        anchors[anchorName] = parent[key]
      }
      continue
    }

    // Key-value with alias: key: *alias
    const kvAliasMatch = cleanLine.match(/^(\s*)(\w[\w\s-]*):\s*\*(\w+)/)
    if (kvAliasMatch) {
      const key = kvAliasMatch[2].trim()
      const aliasName = kvAliasMatch[3]
      const parent = stack[stack.length - 1].obj
      parent[key] = anchors[aliasName] !== undefined ? structuredClone(anchors[aliasName]) : null
      continue
    }

    // ... rest of existing parsing logic ...
  }

  return result
}
```

**Edge cases:**

- Anchor on a block (nested object) — must store reference after block is fully parsed. This is tricky because the block is parsed incrementally. Store a reference to the object; since JS objects are by reference, mutations during parsing will be reflected.
- `structuredClone` used for alias resolution to prevent shared-state mutations.
- Unknown alias references → resolve to `null`.

**Test file:** `test/utils/yaml-parser-anchors.test.js`

**Test cases:**

| Test Name                        | Description                                                                                          |
| -------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `anchor and alias on scalar`     | `default: &val postgres\nother: *val` → `other` is `'postgres'`                                      |
| `merge key`                      | `default: &d\n  adapter: pg\nproduction:\n  <<: *d` → production.adapter is `'pg'`                   |
| `merge with override`            | `default: &d\n  adapter: pg\n  pool: 5\nproduction:\n  <<: *d\n  pool: 10` → production.pool is `10` |
| `unknown alias resolves to null` | `key: *nonexistent` → `key` is `null`                                                                |
| `anchor on nested block`         | `default: &d\n  adapter: pg\n  host: localhost\ntest:\n  <<: *d` → test has both adapter and host    |

---

## Phase 8: Minor Fixes & Cleanup

**All tasks in Phase 8 are parallelizable.**

---

### Task 23: Fix `searchPatterns` Dead Code Path

**Problem:** The search tool checks `ctrl.before_actions || ctrl.filters` but controllers only have `filters`.

**Files to modify:**

- `src/tools/handlers/search-patterns.js`

**Changes:**

Replace:

```javascript
const filters = ctrl.before_actions || ctrl.filters || []
```

with:

```javascript
const filters = ctrl.filters || []
```

Remove the dead `before_actions` reference.

---

### Task 24: Add `file` Property to Mailer Extractions

**Problem:** Mailer extraction objects don't include the source file path, preventing file-entity mapping.

**Files to modify:**

- `src/extractors/email.js`

**Changes:**

In the mailer extraction loop, after creating the `mailer` object, add:

```javascript
const mailer = {
  class: classMatch[1],
  file: entry.path,  // ADD THIS LINE
  superclass: classMatch[2],
  // ...
}
```

**Test file:** `test/extractors/email-file-property.test.js`

**Test cases:**

| Test Name                       | Description                                          |
| ------------------------------- | ---------------------------------------------------- |
| `mailer includes file property` | Extracted mailer has `file` matching the source path |

---

### Task 25: Add `file` Property to Channel Extractions

**Problem:** Channel extraction objects don't include the source file path.

**Files to modify:**

- `src/extractors/realtime.js`

**Changes:**

In the channel extraction loop, add `file: entry.path` to the channel object.

**Test file:** `test/extractors/realtime-file-property.test.js`

**Test cases:**

| Test Name                        | Description                                           |
| -------------------------------- | ----------------------------------------------------- |
| `channel includes file property` | Extracted channel has `file` matching the source path |

---

### Task 26: Fix Factory Parser `FactoryBot.define` Depth Tracking

**Problem:** The factory parser's depth counter increments for `FactoryBot.define do` because the generic `do` detector fires before the factory pattern matcher. This can cause off-by-one errors in factory close detection.

**Files to modify:**

- `src/extractors/factory-registry.js`

**Changes:**

Add explicit detection for the `FactoryBot.define do` wrapper at the top of the line processing loop, before the generic depth tracking:

```javascript
// Skip FactoryBot.define wrapper — don't track its depth
if (/FactoryBot\.define\s+do/.test(trimmed)) continue
```

This ensures the `do` from `FactoryBot.define do` doesn't increment depth. The matching `end` at the bottom of the file will decrement depth to -1, which is harmless (no factory will have `factoryDepth === -1`).

**Test file:** `test/extractors/factory-registry-define.test.js`

**Test cases:**

| Test Name                                 | Description                                               |
| ----------------------------------------- | --------------------------------------------------------- |
| `single factory in FactoryBot.define`     | Standard factory file with one factory → correctly parsed |
| `multiple factories in FactoryBot.define` | Two factories in one define block → both extracted        |
| `factory with traits`                     | Factory containing traits → traits correctly captured     |
| `nested factory`                          | Factory with nested child factory → both extracted        |

---

### Task 27: Detect Composite Primary Keys (Rails 7.1+)

**Files to modify:**

- `src/core/patterns/schema.js` — add pattern
- `src/extractors/schema.js` — extract composite PK

**Changes:**

1. Add to `SCHEMA_PATTERNS`:

   ```javascript
   compositePrimaryKey: /primary_key:\s*\[([^\]]+)\]/,
   ```

2. In `extractSchema()`, when parsing `create_table`, check for composite PK in options:
   ```javascript
   const compositePkMatch = options.match(SCHEMA_PATTERNS.compositePrimaryKey)
   if (compositePkMatch) {
     const columns = compositePkMatch[1].match(/['":]\w+/g)?.map(c => c.replace(/['":]/, '')) || []
     currentTable.primary_key = { type: 'composite', columns }
   }
   ```

**Test file:** `test/extractors/schema-composite-pk.test.js`

**Test cases:**

| Test Name                        | Description                                                                         |
| -------------------------------- | ----------------------------------------------------------------------------------- |
| `composite primary key detected` | `create_table :routes, primary_key: [:origin, :destination]` → PK with both columns |
| `regular primary key unchanged`  | `create_table :users` → standard bigint PK                                          |
| `uuid primary key unchanged`     | `create_table :users, id: :uuid` → uuid PK                                          |

---

### Task 28: Detect Nested Route Relationships

**Files to modify:**

- `src/extractors/routes.js`

**Changes:**

Track parent resource context using a stack. When a `resources` block is nested inside another `resources do...end`, record the nesting relationship:

Add to the result object:

```javascript
nested_relationships: []
```

When a nested resources block is encountered (currentResource is not null and a new resources match fires):

```javascript
if (currentResource) {
  result.nested_relationships.push({
    parent: currentResource.name,
    child: name,
    parent_controller: currentResource.controller,
    child_controller: ns ? `${ns}/${name}` : name,
  })
  entry.parent_resource = currentResource.name
}
```

Also push to the parent resource's `nested` array:

```javascript
if (currentResource?.nested) {
  currentResource.nested.push(name)
}
```

Use a stack for currentResource instead of a single variable to handle multi-level nesting:

```javascript
const resourceStack = []
// When entering a resources do block:
resourceStack.push(entry)
// When leaving (end):
resourceStack.pop()
// currentResource = resourceStack[resourceStack.length - 1] || null
```

**Test file:** `test/extractors/routes-nesting.test.js`

**Test cases:**

| Test Name                   | Description                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `simple nesting detected`   | `resources :posts do; resources :comments; end` → nested_relationships includes `{ parent: 'posts', child: 'comments' }` |
| `deep nesting`              | Three levels → two nested_relationship entries                                                                           |
| `nested resource on parent` | Parent resource's `nested` array includes child name                                                                     |
| `non-nested resources`      | Two top-level resources → no nested_relationships                                                                        |

---

### Task 29: Detect `normalizes` Callback Semantics

**Files to modify:**

- `src/extractors/model.js`

**Changes:**

Currently, `normalizes` extraction only captures attribute names. Enhance to capture the normalization expression:

```javascript
const normalizes = []
const normRe = /^\s*normalizes\s+(.+)/gm
while ((m = normRe.exec(content))) {
  const fullDecl = m[1]
  const attrs = fullDecl.match(/:(\w+)/g)?.map(a => a.slice(1)) || []
  const withMatch = fullDecl.match(/with:\s*->\s*(?:\([^)]*\)\s*)?\{([^}]+)\}/)
  const normExpression = withMatch ? withMatch[1].trim() : null
  for (const attr of attrs) {
    normalizes.push({
      attribute: attr,
      expression: normExpression,
    })
  }
}
```

This changes the `normalizes` field from `string[]` to `Array<{attribute: string, expression: string|null}>`. Update consumers (model return value documentation).

**Test file:** `test/extractors/model-normalizes.test.js`

**Test cases:**

| Test Name                           | Description                                                                             |
| ----------------------------------- | --------------------------------------------------------------------------------------- |
| `captures normalization expression` | `normalizes :email, with: -> { _1.strip.downcase }` → `expression: '_1.strip.downcase'` |
| `multiple attributes`               | `normalizes :email, :name, with: -> { _1.strip }` → two entries, same expression        |
| `no with clause`                    | `normalizes :email` → `expression: null`                                                |

---

### Task 30: Detect `has_many :through` Join Model Implicit Dependency

This is covered by Task 4 (association target resolution). No separate task needed.

---

### Task 31: Fix `detectSpecStyle` Return From Shared Module

Already covered by Task 10. No separate task needed.

---

### Task 32: Handle Symlinks in Glob Traversal

**Files to modify:**

- `src/providers/local-fs.js` — `_globWalk()` method

**Changes:**

In the `_globWalk` method, when iterating directory entries, add symlink detection:

```javascript
for (const entry of entries) {
  if (this._shouldSkip(currentRel, entry.name)) continue
  const isDir = entry.isDirectory() || (entry.isSymbolicLink() && this._isDirectoryLink(currentRel, entry.name))
  if (isDir) {
    // ... existing recursion
  }
}
```

Add helper:

```javascript
/**
 * Check if a symbolic link points to a directory.
 * @param {string} currentRel - Current relative directory
 * @param {string} entryName - Entry name
 * @returns {boolean}
 */
_isDirectoryLink(currentRel, entryName) {
  try {
    const full = join(this._root, currentRel, entryName)
    const stat = statSync(full)
    return stat.isDirectory()
  } catch {
    return false
  }
}
```

Also add a `_visited` set to prevent infinite loops from circular symlinks:

```javascript
glob(pattern) {
  const results = []
  const parts = pattern.split('/')
  const visited = new Set()
  this._globWalk('', parts, results, visited)
  return results.sort()
}

_globWalk(currentRel, patternParts, results, visited) {
  const currentAbs = join(this._root, currentRel)
  const realPath = this._realPath(currentAbs)
  if (realPath && visited.has(realPath)) return
  if (realPath) visited.add(realPath)
  // ... rest of existing logic
}

_realPath(absPath) {
  try {
    return realpathSync(absPath)
  } catch {
    return null
  }
}
```

Add import: `import { realpathSync } from 'node:fs'`

**Test file:** `test/providers/local-fs-symlinks.test.js`

**Test cases:**

| Test Name                     | Description                                                      |
| ----------------------------- | ---------------------------------------------------------------- |
| `follows directory symlinks`  | Symlinked directory is traversed                                 |
| `circular symlink terminates` | Symlink pointing to parent directory doesn't cause infinite loop |
| `broken symlink skipped`      | Dangling symlink doesn't throw                                   |

---

### Task 33: Add `searchPatterns` Support for Callback Pattern Matching

**Problem:** The search tool checks `cb.name` for callbacks, but the callback object has `method` not `name`.

**Files to modify:**

- `src/tools/handlers/search-patterns.js`

**Changes:**

In the callback matching block:

```javascript
// Replace:
cb.name?.toLowerCase().includes(lowerPattern)
// With:
cb.method?.toLowerCase().includes(lowerPattern)
```

**Test:** Covered by existing search pattern tests. Add one case:

| Test Name                              | Description                                                          |
| -------------------------------------- | -------------------------------------------------------------------- |
| `search finds callback by method name` | Search for `'before_save'` finds callbacks with type `'before_save'` |

---

### Task 34: Document `normalizes` Return Type Change

**Problem:** Task 29 changes `normalizes` from `string[]` to `Array<{attribute, expression}>`. The model extractor's JSDoc and any downstream consumers need updating.

**Files to modify:**

- `src/extractors/model.js` — update JSDoc return type description
- `src/tools/handlers/get-model.js` — no code change needed, it passes through

This is a documentation-only task. No test file needed.

---

### Task 35: Add Extraction Error Count to `get_overview` Response

**Problem:** After Task 13 adds error boundaries, extraction failures are tracked but not surfaced in the overview tool.

**Files to modify:**

- `src/tools/handlers/get-overview.js`

**Changes:**

Add to the overview response object:

```javascript
extraction_errors: (index.extraction_errors || []).length,
```

If errors > 0, also add:

```javascript
extraction_error_details: index.extraction_errors,
```

**Test:** Covered by existing overview integration tests. Add one case:

| Test Name                                  | Description                                                           |
| ------------------------------------------ | --------------------------------------------------------------------- |
| `overview includes extraction error count` | Index with extraction_errors → overview response includes error count |

---

## Sequenced Task List

| Phase | Tasks                                      | Parallelizable     | Depends On       |
| ----- | ------------------------------------------ | ------------------ | ---------------- |
| 1     | 1, 2                                       | Yes (within phase) | —                |
| 2     | 3, 4, 5                                    | Yes (within phase) | Phase 1          |
| 3     | 6, 7                                       | Yes (within phase) | Phase 2          |
| 4     | 8, 9, 10, 11, 12                           | Yes (within phase) | Phase 1          |
| 5     | 13, 14, 15                                 | Yes (within phase) | —                |
| 6     | 16, 17, 18, 19, 20                         | Yes (within phase) | —                |
| 7     | 21, 22                                     | Yes (within phase) | —                |
| 8     | 23, 24, 25, 26, 27, 28, 29, 32, 33, 34, 35 | Yes (within phase) | Phase 5 (for 35) |

Phases 4, 5, 6, and 7 can run in parallel with each other (they don't share modified files). Phase 3 must wait for Phase 2. Phase 8 can start after Phase 5.

---

## Acceptance Criteria

1. **All 35 tasks are implemented** with the exact changes described.
2. **All named test cases pass** — `npm test` exits with 0.
3. **Zero regressions** — all pre-existing tests continue to pass.
4. **No function exceeds 30 lines** (excluding test files).
5. **Every public function has JSDoc** with `@param` and `@returns`.
6. **No duplicated logic** — shared utilities are extracted.
7. **No magic numbers** — all literals are named constants.
8. **`toTableName('Category')` returns `'categories'`** (not `'categorys'`).
9. **`classify('comments')` returns `'Comment'`** (not `'Comments'`).
10. **BFS uses adjacency maps** — `_forwardEdgesFrom` and `_reverseEdgesTo` are removed.
11. **Blast radius resolves jobs, mailers, policies, services, channels** — no "Unmapped file" warnings for these types.
12. **Index survives a failing extractor** — a broken `extractSchema` doesn't prevent model extraction.
13. **CHANGELOG.md updated** with a `[0.3.0]` entry listing all changes grouped by Added/Fixed/Changed.
14. **package.json version bumped** to `0.3.0`.
