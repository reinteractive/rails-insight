# RailsInsight Hybrid Introspection — Agent Task Sequence

## Project Analysis Summary

**Module system:** ESM (`"type": "module"`)
**Test framework:** Vitest (`vitest` v3.0.0)
**Test command:** `npm test` (runs `vitest run`)
**Targeted test command:** `npx vitest run test/[path]`
**Test pattern reference:** `src/core/blast-radius.js` tests (mock provider with `execCommand`)
**Import convention:** Relative paths with `.js` extension (e.g., `import { EDGE_WEIGHTS } from './graph.js'`)
**Export convention:** Named exports (`export function`, `export const`)
**Naming:** kebab-case files, camelCase functions, PascalCase classes, SCREAMING_SNAKE constants
**Error pattern:** `safeExtract(name, fn, fallback, verbose, errors)` wrapper in `indexer.js`; try/catch with fallback returns in `blast-radius.js`
**DI pattern:** `FileProvider` objects passed as first parameter; `provider.readFile()`, `provider.execCommand()`, `provider.fileExists()`, `provider.glob()`
**Mock pattern:** Inline mock objects implementing `FileProvider` interface — no shared mock factory
**Graph edge pattern:** `EDGE_WEIGHTS` object in `graph.js`, `graph.addEdge(from, to, type)`, weight looked up from `EDGE_WEIGHTS[type]`
**Wiring points:**

- Indexer: `src/core/indexer.js` → `buildIndex()` (between Layer 4 extractors and Layer 5 graph)
- CLI: `bin/railsinsight.js` → `main()` options parsing
- Server: `src/server.js` → `startLocal()` options passthrough
- Overview tool: `src/tools/handlers/get-overview.js`
  **Key dependencies:** `@modelcontextprotocol/sdk`, `zod` (runtime); `vitest` (dev)
  **Node version:** >=18.0.0

---

## Prerequisites

- [ ] `.github/copilot-instructions.md` committed (Task 1)
- [ ] Branch created: `feature/hybrid-introspection`
- [ ] All existing tests passing: `npm test`

---

## Phase 1: Foundation

### Task 1: Create copilot-instructions.md

**Goal:** Create persistent project context file for VS Code Copilot agent mode.

**Create:** `.github/copilot-instructions.md`

#### What to do

1. Create the `.github/` directory if it doesn't exist.

2. Create `.github/copilot-instructions.md` with this content:

```markdown
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
```

#### Acceptance criteria

- [ ] File exists at `.github/copilot-instructions.md`
- [ ] Content covers architecture, commands, style, naming, imports, testing, and error handling
- [ ] No references to files or patterns that don't exist in the project

#### Constraints

- Do NOT modify any existing files
- Keep the file under 200 lines

#### Verify

```bash
cat .github/copilot-instructions.md | wc -l
```

Expected: file exists, under 200 lines.

```bash
git add -A && git commit -m "task 1: create copilot-instructions.md"
```

---

### Task 2: Add introspection constants

**Goal:** Add shared constants for the introspection subsystem to the existing constants file.

**Read first (do not modify):**

- #file:src/core/constants.js

**Modify:** `src/core/constants.js`

#### What to do

1. Add these constants at the end of the file, before any function exports:

```javascript
/** Timeout (ms) for Ruby introspection script execution. */
export const INTROSPECTION_TIMEOUT_MS = 30_000

/** Maximum associations per model to prevent runaway introspection output. */
export const INTROSPECTION_MAX_ASSOCIATIONS = 200

/** Maximum routes to include from runtime introspection. */
export const INTROSPECTION_MAX_ROUTES = 500
```

#### Acceptance criteria

- [ ] Three new constants exported from `src/core/constants.js`
- [ ] Constants use SCREAMING_SNAKE naming
- [ ] Each constant has a JSDoc comment
- [ ] Existing constants and functions are unchanged

#### Constraints

- Do NOT modify any existing constant values or functions
- Do NOT reorder existing exports
- Do NOT add any imports

#### Verify

```bash
node -e "import('./src/core/constants.js').then(m => console.log(m.INTROSPECTION_TIMEOUT_MS, m.INTROSPECTION_MAX_ASSOCIATIONS, m.INTROSPECTION_MAX_ROUTES))"
```

Expected: `30000 200 500`

```bash
npm test
```

Expected: all existing tests still pass.

```bash
git add -A && git commit -m "task 2: add introspection constants"
```

---

### Task 3: Create introspection test fixtures

**Goal:** Create realistic JSON fixtures representing Ruby runtime introspection output for use in bridge and merger tests.

**Read first (do not modify):**

- #file:src/core/graph.js (for association type names and edge weights)
- #file:src/extractors/model.js (for regex extraction output shape)
- #file:src/extractors/controller.js (for controller extraction output shape)

**Create:** `test/fixtures/introspection-fixtures.js`

#### What to do

1. Export a `RUNTIME_MODELS` constant — an object keyed by model class name, representing what `reflect_on_all_associations`, `validators`, `columns`, `defined_enums`, and `_callbacks` would return from a Rails runtime. Include three models:

   **User:** 5 associations (`has_many :posts`, `has_many :comments`, `has_one :profile`, `has_many :tags, through: :taggings`, `belongs_to :organization`), 3 validators (presence on email, uniqueness on email, length on password), 8 columns (id, email, password_digest, role, organization_id, created_at, updated_at, name), 1 enum (role: { user: 0, admin: 1, moderator: 2 }), devise_modules: ['database_authenticatable', 'recoverable'], 2 callbacks (before_save normalize_email, after_create send_welcome).

   **Post:** 3 associations (`belongs_to :user`, `has_many :comments`, `has_many :taggings`), 1 callback (after_save_commit broadcast_post). Include a `class_name` override: `has_many :authored_comments, class_name: 'Comment', foreign_key: 'author_id'` — this is the case regex might get wrong.

   **Comment:** 2 associations (`belongs_to :post`, `belongs_to :user`).

2. Export a `RUNTIME_CONTROLLERS` constant with two controllers:

   **UsersController:** actions: ['index', 'show', 'new', 'create', 'edit', 'update', 'destroy']. callbacks: 3 (before_action authenticate_user! inherited from ApplicationController, before_action set_user for show/edit/update/destroy, before_action require_admin! for destroy).

   **PostsController:** actions: ['index', 'show', 'create']. callbacks: 2 (before_action authenticate_user! inherited, before_action set_post for show).

3. Export a `RUNTIME_ROUTES` constant — an array of 8 route objects with verb, path, controller, action, name, constraints (empty object), engine (null).

4. Export a `RUNTIME_DATABASE` constant with adapter: 'postgresql', database_version: '16.2', tables: ['users', 'posts', 'comments', 'taggings', 'tags', 'organizations', 'profiles'], foreign_keys: 3 entries.

5. Export a `REGEX_MODELS` constant representing what RailsInsight's regex extractors would produce for the same User model — notably MISSING the `authored_comments` association (the one with `class_name` override defined via metaprogramming), and having `class_name` as null on the `tags` through association (regex couldn't resolve it).

6. Export a `REGEX_CONTROLLERS` constant for UsersController — notably MISSING the `authenticate_user!` callback (it's inherited from ApplicationController, not declared in the UsersController file).

#### Acceptance criteria

- [ ] File exports 6 named constants: RUNTIME_MODELS, RUNTIME_CONTROLLERS, RUNTIME_ROUTES, RUNTIME_DATABASE, REGEX_MODELS, REGEX_CONTROLLERS
- [ ] RUNTIME_MODELS.User has 5 associations including one with class_name override
- [ ] RUNTIME_MODELS.User has devise_modules, enums, columns, validators, callbacks
- [ ] REGEX_MODELS.User is missing the metaprogrammed association that RUNTIME_MODELS has
- [ ] REGEX_CONTROLLERS.UsersController is missing the inherited callback that RUNTIME_CONTROLLERS has
- [ ] All data uses realistic Rails naming (snake_case columns, PascalCase class names)
- [ ] No imports from src/ — fixtures are self-contained data

#### Constraints

- Do NOT add any runtime dependencies
- Do NOT import from src/ — these are pure data fixtures
- Association type names must match EDGE_WEIGHTS keys in graph.js: `has_many`, `belongs_to`, `has_one`, `has_many_through`
- Column types must be realistic Rails types: `string`, `integer`, `datetime`, `text`, `boolean`
- Use `macro` for association type in runtime data (matching Rails `reflect_on_all_associations` output)

#### Verify

```bash
node -e "import('./test/fixtures/introspection-fixtures.js').then(m => { console.log('exports:', Object.keys(m)); console.log('User assocs:', m.RUNTIME_MODELS.User.associations.length); console.log('Regex User assocs:', m.REGEX_MODELS.User.associations.length); })"
```

Expected: 6 exports, User assocs > REGEX User assocs.

```bash
git add -A && git commit -m "task 3: create introspection test fixtures"
```

---

### Task 4: Write failing tests for introspection bridge

**Goal:** Create test file with 7 test cases covering success, failure, timeout, and edge cases for the bridge module. Create a minimal stub so tests fail on assertions, not imports.

**Read first (do not modify):**

- #file:test/fixtures/introspection-fixtures.js (fixture data from Task 3)
- #file:src/git/diff-parser.js (reference for execCommand usage pattern)
- #file:src/providers/interface.js (FileProvider interface)
- #file:src/core/constants.js (for INTROSPECTION_TIMEOUT_MS)

**Create:** `src/introspection/bridge.js` (stub)
**Create:** `test/introspection/bridge.test.js`

#### What to do

1. Create the stub at `src/introspection/bridge.js`:

```javascript
/**
 * Ruby Introspection Bridge
 * Executes the introspect.rb script in the target project and parses results.
 */

export async function runIntrospection(provider, options = {}) {
  throw new Error('Not implemented')
}
```

2. Create the test file at `test/introspection/bridge.test.js` with these test cases:

   **describe('runIntrospection')**

   a. `'returns introspection data when Ruby script succeeds'` — Create a mock provider where `execCommand` returns `{ stdout: JSON.stringify({ models: RUNTIME_MODELS, controllers: RUNTIME_CONTROLLERS, routes: RUNTIME_ROUTES, database: RUNTIME_DATABASE }), stderr: '', exitCode: 0 }`. Also mock `fileExists` to return true for `'Gemfile'` and `'config/application.rb'`. Assert `result.available === true`, `result.models` is not null, `result.error` is null.

   b. `'returns available:false when provider has no execCommand'` — Mock provider without `execCommand` property. Assert `result.available === false` and `result.error` contains `'execCommand'`.

   c. `'returns available:false when not a Rails project'` — Mock provider where `fileExists('Gemfile')` returns false. Assert `result.available === false`.

   d. `'returns available:false when Ruby script exits non-zero'` — Mock `execCommand` returning `{ exitCode: 1, stderr: 'LoadError: cannot load such file', stdout: '' }`. Assert `result.available === false` and `result.error` contains `'LoadError'`.

   e. `'returns available:false when stdout is not valid JSON'` — Mock `execCommand` returning `{ exitCode: 0, stdout: 'Rails boot warning\n{broken json', stderr: '' }`. Assert `result.available === false`.

   f. `'returns available:false when not a git repository error'` — Mock `execCommand` returning `{ exitCode: 128, stderr: 'fatal: not a git repository', stdout: '' }`. Assert `result.available === false`.

   g. `'includes duration_ms in all responses'` — Test both success and failure cases. Assert `typeof result.duration_ms === 'number'` and `result.duration_ms >= 0`.

3. Each mock provider should be a plain object with only the methods needed for that test: `{ readFile: () => null, fileExists: (p) => ..., glob: () => [], execCommand: async (cmd) => ... }`.

#### Acceptance criteria

- [ ] Stub file exists at `src/introspection/bridge.js` exporting `runIntrospection`
- [ ] Test file has 7 test cases in a single `describe('runIntrospection')` block
- [ ] All 7 tests FAIL with assertion errors or "Not implemented" — NOT import errors
- [ ] Tests import from `'../../src/introspection/bridge.js'` with `.js` extension
- [ ] Tests import fixtures from `'../fixtures/introspection-fixtures.js'`
- [ ] Mock providers use inline objects, not shared factories

#### Constraints

- Do NOT implement bridge.js beyond the stub
- Do NOT modify any existing files
- Do NOT add dependencies
- Use `import { describe, it, expect } from 'vitest'`
- Use `async/await` for all test cases (runIntrospection is async)

#### Verify

```bash
npx vitest run test/introspection/bridge.test.js
```

Expected: 7 tests, 7 failures (assertion errors or "Not implemented", NOT import errors).

```bash
git add -A && git commit -m "task 4: failing tests for introspection bridge"
```

---

### Task 5: Implement introspection bridge

**Goal:** Implement `runIntrospection()` to make all 7 bridge tests pass.

**Read first (do not modify):**

- #file:test/introspection/bridge.test.js (tests to satisfy)
- #file:test/fixtures/introspection-fixtures.js (expected data shapes)
- #file:src/git/diff-parser.js (reference for execCommand usage and isValidGitRef pattern)
- #file:src/core/constants.js (for INTROSPECTION_TIMEOUT_MS)

**Modify:** `src/introspection/bridge.js`

#### What to do

1. Replace the stub with the full implementation. Function signature:

```javascript
export async function runIntrospection(provider, options = {})
```

2. Compute `duration_ms` using `Date.now()` at start and end.

3. Guard clause 1: if `typeof provider.execCommand !== 'function'`, return `{ available: false, models: null, controllers: null, routes: null, database: null, error: 'Provider does not support execCommand', duration_ms }`.

4. Guard clause 2: if `!provider.fileExists('Gemfile') || !provider.fileExists('config/application.rb')`, return `available: false` with descriptive error.

5. Resolve the path to `introspect.rb` using `import.meta.url`:

```javascript
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const __dirname = dirname(fileURLToPath(import.meta.url))
const INTROSPECT_SCRIPT = resolve(__dirname, 'introspect.rb')
```

6. Execute: `const result = await provider.execCommand(\`bundle exec ruby "${INTROSPECT_SCRIPT}"\`)`.

7. If `result.exitCode !== 0`, return `available: false` with `error` containing the first 200 characters of `result.stderr`.

8. Parse `result.stdout` as JSON inside a try/catch. On `SyntaxError`, return `available: false` with error message.

9. On success, return `{ available: true, models: data.models || null, controllers: data.controllers || null, routes: data.routes || null, database: data.database || null, error: null, duration_ms }`.

10. Wrap the entire function body in try/catch. The catch returns `available: false` with `err.message`.

#### Acceptance criteria

- [ ] All 7 tests in `test/introspection/bridge.test.js` pass
- [ ] Function never throws — always returns a result object
- [ ] `duration_ms` is always a non-negative number
- [ ] Uses `import.meta.url` for script path resolution
- [ ] Error messages are truncated to prevent token waste

#### Constraints

- Do NOT modify `test/introspection/bridge.test.js`
- Do NOT modify any other source files
- Do NOT add new dependencies to package.json
- Use ES module imports with `.js` extensions
- Import only from `node:path`, `node:url`, and `../core/constants.js`

#### Verify

```bash
npx vitest run test/introspection/bridge.test.js
```

Expected: 7 tests, 7 passes.

```bash
git add -A && git commit -m "task 5: implement introspection bridge"
```

---

### Task 6: Create Ruby introspection script

**Goal:** Create the self-contained Ruby script that ships with the npm package and collects runtime Rails data.

**Read first (do not modify):**

- #file:test/fixtures/introspection-fixtures.js (the output shape this script must produce)

**Create:** `src/introspection/introspect.rb`

#### What to do

1. Create a Ruby script that:
   - Requires `'json'` and boots the Rails app via `require_relative` of `config/environment.rb` relative to the working directory
   - Wraps the entire script in `begin/rescue` to handle boot failures gracefully
   - Outputs a single JSON object to `$stdout` with keys: `models`, `controllers`, `routes`, `database`
   - Uses `$stderr` for any diagnostic messages (never `$stdout` except the final JSON)

2. **Models collection:** Iterate `ActiveRecord::Base.descendants`, skip abstract classes. For each model collect:
   - `class_name` (via `.name`)
   - `table_name` (via `.table_name`)
   - `abstract_class` (via `.abstract_class?`)
   - `associations` — from `reflect_on_all_associations`, map each to `{ macro:, name:, class_name:, foreign_key:, through:, polymorphic:, options: }`. Cap at 200 per model.
   - `validators` — from `.validators`, map to `{ kind:, attributes:, options: }`
   - `columns` — from `.columns`, map to `{ name:, type:, sql_type:, null:, default:, limit: }`
   - `enums` — from `.defined_enums` (returns hash of hashes)
   - `callbacks` — from `._save_callbacks`, `._create_callbacks`, `._update_callbacks`, `._destroy_callbacks`, `._validation_callbacks`, map to `{ type:, filter:, kind: }`
   - `devise_modules` — from `.devise_modules` if the model responds to it

3. **Controllers collection:** Iterate `ActionController::Base.descendants`. For each collect:
   - `class_name`, `superclass` name
   - `actions` — from `.action_methods.to_a`
   - `callbacks` — from `._process_action_callbacks`, map to `{ kind:, filter:, options: }`

4. **Routes collection:** From `Rails.application.routes.routes`, collect `{ verb:, path:, controller:, action:, name:, engine: }`. Skip internal Rails routes (`/rails/`). Cap at 500 routes.

5. **Database collection:** `{ adapter:, database_version:, tables:, foreign_keys: }` from `ActiveRecord::Base.connection`.

6. Wrap each section in its own `begin/rescue` so a failure in (e.g.) controller introspection doesn't prevent model data from being returned. On section failure, set that key to `null` and add an `errors` array entry.

7. Add `#!/usr/bin/env ruby` shebang and `# frozen_string_literal: true` magic comment.

#### Acceptance criteria

- [ ] File exists at `src/introspection/introspect.rb`
- [ ] Script starts with `#!/usr/bin/env ruby` and `# frozen_string_literal: true`
- [ ] Output is a single JSON object on `$stdout`
- [ ] Each section (models, controllers, routes, database) has independent error handling
- [ ] Associations per model capped at 200
- [ ] Routes capped at 500
- [ ] Script requires only Ruby stdlib (`json`) and Rails itself
- [ ] All `$stderr.puts` for diagnostics, never `$stdout` except final JSON

#### Constraints

- Do NOT require any gems beyond what Rails provides
- Do NOT execute any write operations (no create/update/destroy/save calls)
- Do NOT access the network
- Script must work with Rails 6.0+ (avoid Rails 7/8 only APIs)
- Use `respond_to?` checks before calling optional APIs like `devise_modules`

#### Verify

```bash
ruby -c src/introspection/introspect.rb
```

Expected: `Syntax OK`

```bash
head -2 src/introspection/introspect.rb
```

Expected: shebang line and frozen_string_literal comment.

```bash
git add -A && git commit -m "task 6: create Ruby introspection script"
```

---

### Task 7: Checkpoint — Foundation Phase

**This is a manual verification step. Do not send this to the AI agent.**

#### Verify

1. Run the full test suite:

```bash
npm test
```

All tests must pass (existing + new bridge tests).

2. Verify new file structure:

```bash
ls -la src/introspection/
ls -la test/introspection/
ls -la test/fixtures/introspection-fixtures.js
ls -la .github/copilot-instructions.md
```

Expected: `bridge.js`, `introspect.rb` in src/introspection/; `bridge.test.js` in test/introspection/; fixtures file and instructions file exist.

3. Ruby script syntax check:

```bash
ruby -c src/introspection/introspect.rb
```

Expected: `Syntax OK`

4. Verify bridge tests are comprehensive:

```bash
npx vitest run test/introspection/bridge.test.js --reporter=verbose
```

Expected: 7 passing tests covering success, no-execCommand, no-Gemfile, non-zero exit, invalid JSON, git error, and duration_ms.

#### If issues found

Fix them manually or create a targeted fix task before continuing.

```bash
git tag checkpoint-foundation
```

---

## Phase 2: Merger — Model and Controller Merging

### Task 8: Create merger stub and failing tests for mergeModels

**Goal:** Create the merger module stub and write failing tests for model merging — the highest-value merge operation.

**Read first (do not modify):**

- #file:test/fixtures/introspection-fixtures.js (RUNTIME_MODELS, REGEX_MODELS fixtures)
- #file:src/extractors/model.js (regex model extraction output shape)
- #file:src/core/graph.js (classify function, for understanding entity naming)

**Create:** `src/introspection/merger.js` (stub with empty functions)
**Create:** `test/introspection/merger.test.js`

#### What to do

1. Create stub at `src/introspection/merger.js`:

```javascript
/**
 * Merge Engine
 * Reconciles regex extraction output with runtime introspection data.
 * Rule: runtime wins on facts, regex wins on structure.
 */

export function mergeModels(regexModels, runtimeModels) {
  throw new Error('Not implemented')
}

export function mergeControllers(regexControllers, runtimeControllers) {
  throw new Error('Not implemented')
}

export function mergeRoutes(regexRoutes, runtimeRoutes) {
  throw new Error('Not implemented')
}

export function mergeSchema(regexSchema, runtimeDatabase) {
  throw new Error('Not implemented')
}

export function mergeExtractions(regexExtractions, introspectionResult) {
  throw new Error('Not implemented')
}
```

2. Create `test/introspection/merger.test.js` with a `describe('mergeModels')` block containing these tests:

   a. `'replaces regex associations with runtime associations'` — Call `mergeModels(REGEX_MODELS, RUNTIME_MODELS)`. Assert merged User associations length matches RUNTIME_MODELS.User.associations.length (runtime has more because it includes metaprogrammed ones).

   b. `'uses runtime class_name instead of regex-guessed names'` — Assert that the merged User model's `tags` association has `class_name: 'Tag'` from runtime, not null from regex.

   c. `'preserves regex-only fields not available from runtime'` — Assert that merged User model still has `scope_queries`, `method_line_ranges`, `public_methods` from the regex extraction (runtime doesn't provide these).

   d. `'adds runtime-only models not found in regex'` — Add a model to RUNTIME_MODELS that doesn't exist in REGEX_MODELS (e.g., a metaprogrammed model `Auditable`). Assert it appears in merged output with `source: 'runtime_only'`.

   e. `'preserves regex-only models not in runtime'` — Concerns and abstract classes exist in regex but not in runtime descendants. Assert they're preserved.

   f. `'replaces regex enums with runtime defined_enums'` — Assert merged User enums match RUNTIME_MODELS values (runtime catches dynamic enums).

   g. `'supplements regex callbacks with runtime-only callbacks'` — Assert merged User callbacks include both regex-detected callbacks AND any runtime-only callbacks (inherited ones). Each callback should have a `source` field.

   h. `'replaces regex columns with runtime columns when available'` — Assert merged User columns come from runtime (include `sql_type`, `null`, `default`) not from regex schema parse.

#### Acceptance criteria

- [ ] Stub file exists at `src/introspection/merger.js` with 5 exported functions
- [ ] Test file has 8 tests in `describe('mergeModels')` block
- [ ] All 8 tests fail with assertion errors or "Not implemented", NOT import errors
- [ ] Tests use fixtures from `introspection-fixtures.js`
- [ ] Tests verify the core merge rule: runtime wins on facts, regex wins on structure

#### Constraints

- Do NOT implement merger.js beyond the stub
- Do NOT modify any existing files
- Do NOT modify the fixtures file — create inline test data if fixtures need augmentation
- Use `import { describe, it, expect } from 'vitest'`

#### Verify

```bash
npx vitest run test/introspection/merger.test.js
```

Expected: 8 tests, 8 failures.

```bash
git add -A && git commit -m "task 8: failing tests for mergeModels"
```

---

### Task 9: Implement mergeModels

**Goal:** Implement the `mergeModels` function to make all 8 model merge tests pass.

**Read first (do not modify):**

- #file:test/introspection/merger.test.js (tests to satisfy — mergeModels section only)
- #file:test/fixtures/introspection-fixtures.js (fixture data)
- #file:src/extractors/model.js (regex extraction output shape — see the return statement at the end)

**Modify:** `src/introspection/merger.js` (replace only the `mergeModels` function)

#### What to do

1. Implement `mergeModels(regexModels, runtimeModels)` that returns a new models object (deep clone of regexModels as the base).

2. For each model in `runtimeModels`:
   - If the model exists in `regexModels`, merge it:
     - **Replace** `associations` with runtime associations (map `macro` to `type` for consistency with regex output format)
     - **Replace** `enums` with runtime `defined_enums`
     - **Replace** columns (store as `runtime_columns` to avoid conflicting with schema-derived columns)
     - **Supplement** `callbacks` — add runtime-only callbacks with `source: 'runtime'`, mark existing regex callbacks with `source: 'regex'`, mark callbacks found in both with `source: 'both'`
     - **Replace** `devise_modules` if runtime provides them
     - **Preserve** all regex-only fields: `scope_queries`, `method_line_ranges`, `public_methods`, `file`, `type`, `concerns`, `delegations`, `normalizes`, `encrypts`, `store_accessors`, `attachments`, `rich_text`, etc.
   - If the model does NOT exist in `regexModels`, add it as a new entry with `source: 'runtime_only'`

3. Keep all regex-only models (concerns, abstract classes) unchanged.

4. Use `structuredClone` for deep cloning the base (available in Node 18+).

#### Acceptance criteria

- [ ] All 8 `mergeModels` tests pass
- [ ] Function returns a new object (does not mutate inputs)
- [ ] Runtime associations replace regex associations entirely
- [ ] Regex structural fields (scope_queries, method_line_ranges, etc.) are preserved
- [ ] Runtime-only models are tagged with `source: 'runtime_only'`
- [ ] Callback `source` field is set correctly: 'regex', 'runtime', or 'both'

#### Constraints

- Do NOT modify any test files
- Do NOT implement the other merger functions (mergeControllers, etc.) — leave them as stubs
- Do NOT add new dependencies — use `structuredClone` (Node 18+ built-in)
- Do NOT modify any files other than `src/introspection/merger.js`

#### Verify

```bash
npx vitest run test/introspection/merger.test.js
```

Expected: 8 mergeModels tests pass, other tests still fail.

```bash
git add -A && git commit -m "task 9: implement mergeModels"
```

---

### Task 10: Write failing tests for mergeControllers

**Goal:** Add controller merging tests to the existing merger test file.

**Read first (do not modify):**

- #file:test/fixtures/introspection-fixtures.js (RUNTIME_CONTROLLERS, REGEX_CONTROLLERS)
- #file:src/extractors/controller.js (regex controller extraction output shape)
- #file:test/introspection/merger.test.js (existing test file to add to)

**Modify:** `test/introspection/merger.test.js`

#### What to do

1. Add a new `describe('mergeControllers')` block after the existing `mergeModels` block.

2. Add these 5 test cases:

   a. `'adds inherited callbacks from runtime'` — Call `mergeControllers(REGEX_CONTROLLERS, RUNTIME_CONTROLLERS)`. Assert merged UsersController callbacks include `authenticate_user!` which was missing from regex (it's inherited from ApplicationController).

   b. `'marks inherited callbacks with inherited: true'` — Assert the `authenticate_user!` callback in merged output has `inherited: true`.

   c. `'replaces regex action list with runtime action_methods'` — Assert merged controller actions match runtime `actions` array.

   d. `'preserves regex-only fields'` — Assert `strong_params`, `action_summaries`, `action_line_ranges`, `rescue_handlers`, `file`, `namespace` from regex are preserved.

   e. `'handles controllers in runtime but not in regex'` — Add a mock controller only in runtime data. Assert it appears in merged output with `source: 'runtime_only'`.

#### Acceptance criteria

- [ ] 5 new tests added in `describe('mergeControllers')` block
- [ ] All 5 new tests fail with assertion errors or "Not implemented"
- [ ] Existing mergeModels tests still pass (no regressions)
- [ ] Tests verify the inherited callback detection

#### Constraints

- Do NOT implement mergeControllers — it's still a stub
- Do NOT modify the mergeModels tests
- Do NOT modify any src/ files
- Add the new describe block after the existing one, not nested inside it

#### Verify

```bash
npx vitest run test/introspection/merger.test.js
```

Expected: 8 mergeModels pass + 5 mergeControllers fail = 13 total tests.

```bash
git add -A && git commit -m "task 10: failing tests for mergeControllers"
```

---

### Task 11: Implement mergeControllers

**Goal:** Implement `mergeControllers` to make all 5 controller merge tests pass.

**Read first (do not modify):**

- #file:test/introspection/merger.test.js (tests to satisfy — mergeControllers section)
- #file:test/fixtures/introspection-fixtures.js (fixture data)
- #file:src/extractors/controller.js (regex controller output shape — see the return statement)

**Modify:** `src/introspection/merger.js` (replace only the `mergeControllers` function)

#### What to do

1. Implement `mergeControllers(regexControllers, runtimeControllers)`:

2. For each controller in `runtimeControllers`:
   - If it exists in `regexControllers`, merge:
     - **Replace** `actions` with runtime `actions` array
     - **Build** merged callback list: start with runtime callbacks. For each runtime callback, check if it exists in the regex callbacks (match by `filter`/`method` name). Mark matches as `source: 'both'`. Runtime-only callbacks (inherited) get `source: 'runtime'` and `inherited: true`. Regex-only callbacks get `source: 'regex'`.
     - **Preserve** all regex-only fields: `strong_params`, `action_summaries`, `action_line_ranges`, `rescue_handlers`, `file`, `namespace`, `concerns`, `layout`, `rate_limits`, `allow_unauthenticated_access`, `superclass`, `class`
   - If NOT in regex, add with `source: 'runtime_only'`

3. Keep all regex-only controllers unchanged.

#### Acceptance criteria

- [ ] All 5 mergeControllers tests pass
- [ ] All 8 mergeModels tests still pass
- [ ] Inherited callbacks are correctly tagged with `inherited: true`
- [ ] Regex structural fields are preserved

#### Constraints

- Do NOT modify any test files
- Do NOT implement mergeRoutes, mergeSchema, or mergeExtractions yet
- Do NOT modify any files other than `src/introspection/merger.js`

#### Verify

```bash
npx vitest run test/introspection/merger.test.js
```

Expected: 13 tests, 13 passes.

```bash
git add -A && git commit -m "task 11: implement mergeControllers"
```

---

### Task 12: Checkpoint — Model and Controller Merging

**This is a manual verification step. Do not send this to the AI agent.**

#### Verify

1. Run full test suite:

```bash
npm test
```

All tests must pass.

2. Run merger tests with verbose output:

```bash
npx vitest run test/introspection/merger.test.js --reporter=verbose
```

Verify: 13 passing tests (8 model + 5 controller).

3. Review the merger implementation:

```bash
wc -l src/introspection/merger.js
```

Verify: file is growing but still readable. Check that mergeRoutes/mergeSchema/mergeExtractions are still stubs.

4. Spot-check: open `src/introspection/merger.js` and verify that `mergeModels` does not mutate its inputs (uses `structuredClone`).

```bash
git tag checkpoint-model-controller-merging
```

---

## Phase 3: Merger — Schema, Routes, and Orchestrator

### Task 13: Write failing tests for mergeSchema

**Goal:** Add schema merging tests.

**Read first (do not modify):**

- #file:test/fixtures/introspection-fixtures.js (RUNTIME_DATABASE)
- #file:src/extractors/schema.js (regex schema output shape)
- #file:test/introspection/merger.test.js (existing test file)

**Modify:** `test/introspection/merger.test.js`

#### What to do

1. Add a `describe('mergeSchema')` block with 4 tests:

   a. `'enriches schema tables with runtime column data'` — Create a regex schema with tables and columns parsed from schema.rb. Call `mergeSchema(regexSchema, RUNTIME_DATABASE)`. Assert that tables matching runtime data now have `runtime_columns` with `sql_type`, `null`, `default` fields.

   b. `'adds runtime foreign keys not in regex schema'` — Add a foreign key in RUNTIME_DATABASE that isn't in the regex schema. Assert it appears in merged output.

   c. `'preserves regex schema structure'` — Assert `version`, `extensions`, `enums`, `indexes` from regex are unchanged.

   d. `'handles missing runtime database gracefully'` — Call `mergeSchema(regexSchema, null)`. Assert returns regexSchema unchanged.

#### Acceptance criteria

- [ ] 4 new tests in `describe('mergeSchema')` block
- [ ] All 4 fail with assertion errors
- [ ] Existing 13 tests still pass

#### Constraints

- Do NOT implement mergeSchema
- Do NOT modify existing test blocks
- Create inline regex schema fixture data within the test (don't modify fixtures file)

#### Verify

```bash
npx vitest run test/introspection/merger.test.js
```

Expected: 13 pass + 4 fail = 17 total.

```bash
git add -A && git commit -m "task 13: failing tests for mergeSchema"
```

---

### Task 14: Implement mergeSchema

**Goal:** Implement `mergeSchema` to make the 4 schema merge tests pass.

**Read first (do not modify):**

- #file:test/introspection/merger.test.js (mergeSchema tests)
- #file:src/extractors/schema.js (regex schema output shape)

**Modify:** `src/introspection/merger.js` (replace only the `mergeSchema` function)

#### What to do

1. If `runtimeDatabase` is null/undefined, return `regexSchema` unchanged.

2. Clone `regexSchema` via `structuredClone`.

3. For each table in runtime `tables` array, find the matching table in the regex schema. If found, add `runtime_columns` from the runtime database's model column data.

4. For each runtime `foreign_key` not already in the regex schema's `foreign_keys` array, add it with `source: 'runtime'`.

5. Add `runtime_adapter` and `runtime_database_version` to the merged schema root.

#### Acceptance criteria

- [ ] All 4 mergeSchema tests pass
- [ ] All 13 previous tests still pass (17 total passing)

#### Constraints

- Do NOT modify any test files
- Do NOT modify any files other than `src/introspection/merger.js`

#### Verify

```bash
npx vitest run test/introspection/merger.test.js
```

Expected: 17 passes.

```bash
git add -A && git commit -m "task 14: implement mergeSchema"
```

---

### Task 15: Write failing tests for mergeRoutes

**Goal:** Add route merging tests covering engine routes and regex validation.

**Read first (do not modify):**

- #file:test/fixtures/introspection-fixtures.js (RUNTIME_ROUTES)
- #file:src/extractors/routes.js (regex route output shape)
- #file:test/introspection/merger.test.js

**Modify:** `test/introspection/merger.test.js`

#### What to do

1. Add a `describe('mergeRoutes')` block with 4 tests:

   a. `'adds engine routes from runtime'` — Create runtime routes that include Devise engine routes (path starting with `/users/sign_in`, engine: 'Devise::Engine'). Create regex routes with no Devise routes. Assert merged output has an `engine_routes` array containing the Devise routes.

   b. `'preserves regex route structure (nested resources, member routes)'` — Assert `resources`, `nested_relationships`, `standalone_routes`, `mounted_engines`, `concerns` from regex are preserved.

   c. `'flags regex resources not found in runtime routes'` — Create a regex resource for `:widgets` that has no matching runtime route. Assert it's flagged with `unresolved: true`.

   d. `'handles null runtime routes gracefully'` — Call `mergeRoutes(regexRoutes, null)`. Assert returns regexRoutes unchanged.

#### Acceptance criteria

- [ ] 4 new tests in `describe('mergeRoutes')` block
- [ ] All 4 fail

#### Constraints

- Do NOT implement mergeRoutes
- Create inline route fixture data within the test block

#### Verify

```bash
npx vitest run test/introspection/merger.test.js
```

Expected: 17 pass + 4 fail = 21 total.

```bash
git add -A && git commit -m "task 15: failing tests for mergeRoutes"
```

---

### Task 16: Implement mergeRoutes

**Goal:** Implement `mergeRoutes` to make the 4 route merge tests pass.

**Read first (do not modify):**

- #file:test/introspection/merger.test.js (mergeRoutes tests)
- #file:src/extractors/routes.js (regex route output shape)

**Modify:** `src/introspection/merger.js` (replace only the `mergeRoutes` function)

#### What to do

1. If `runtimeRoutes` is null/undefined, return `regexRoutes` unchanged.

2. Clone `regexRoutes` via `structuredClone`.

3. Separate runtime routes into two groups: routes with a non-null `engine` field (engine routes) and regular routes.

4. Add engine routes as a new `engine_routes` array on the merged output.

5. Build a set of runtime route signatures (`"${verb} ${controller}#${action}"`). For each regex `resources` entry, check if its expected actions appear in the runtime set. If a resource has NO matching runtime routes, flag it with `unresolved: true`.

6. Preserve all regex route structure: `resources`, `standalone_routes`, `mounted_engines`, `concerns`, `drawn_files`, `nested_relationships`, `devise_routes`, `root`.

#### Acceptance criteria

- [ ] All 4 mergeRoutes tests pass
- [ ] All 17 previous tests still pass (21 total)

#### Constraints

- Do NOT modify any test files
- Do NOT modify any files other than `src/introspection/merger.js`

#### Verify

```bash
npx vitest run test/introspection/merger.test.js
```

Expected: 21 passes.

```bash
git add -A && git commit -m "task 16: implement mergeRoutes"
```

---

### Task 17: Write failing tests for mergeExtractions orchestrator

**Goal:** Add tests for the top-level merge orchestrator that calls all domain-specific merge functions.

**Read first (do not modify):**

- #file:test/fixtures/introspection-fixtures.js (all fixtures)
- #file:test/introspection/merger.test.js (existing test file)

**Modify:** `test/introspection/merger.test.js`

#### What to do

1. Add a `describe('mergeExtractions')` block with 5 tests:

   a. `'returns regexExtractions unchanged when introspection unavailable'` — Call `mergeExtractions(regexExtractions, { available: false })`. Assert returns a deep equal clone of regexExtractions with no `_introspection` key.

   b. `'merges all domains when introspection is available'` — Call with full runtime data. Assert `result.models` reflects merged model data, `result.controllers` reflects merged controller data, `result.routes` has `engine_routes`, `result.schema` has runtime enrichment.

   c. `'adds _introspection metadata'` — Assert `result._introspection.available === true` and `result._introspection.duration_ms` is a number and `result._introspection.models_introspected` is a count.

   d. `'does not mutate the input regexExtractions'` — Clone regexExtractions before calling, call mergeExtractions, assert original is unchanged.

   e. `'handles partial introspection (some domains null)'` — Call with introspection where `models` is populated but `controllers`, `routes`, `database` are null. Assert models are merged but controllers/routes/schema remain regex-only.

#### Acceptance criteria

- [ ] 5 new tests in `describe('mergeExtractions')` block
- [ ] All 5 fail

#### Constraints

- Do NOT implement mergeExtractions
- Build the `regexExtractions` test object inline using the imported fixtures

#### Verify

```bash
npx vitest run test/introspection/merger.test.js
```

Expected: 21 pass + 5 fail = 26 total.

```bash
git add -A && git commit -m "task 17: failing tests for mergeExtractions"
```

---

### Task 18: Implement mergeExtractions orchestrator

**Goal:** Implement `mergeExtractions` to make all 5 orchestrator tests pass.

**Read first (do not modify):**

- #file:test/introspection/merger.test.js (mergeExtractions tests)

**Modify:** `src/introspection/merger.js` (replace only the `mergeExtractions` function)

#### What to do

1. If `!introspectionResult.available`, return `structuredClone(regexExtractions)`.

2. Clone `regexExtractions`.

3. Call `mergeModels` if `introspectionResult.models` is not null.
4. Call `mergeControllers` if `introspectionResult.controllers` is not null.
5. Call `mergeRoutes` if `introspectionResult.routes` is not null.
6. Call `mergeSchema` if `introspectionResult.database` is not null.

7. Add `_introspection` metadata:

```javascript
merged._introspection = {
  available: true,
  duration_ms: introspectionResult.duration_ms || 0,
  models_introspected: Object.keys(introspectionResult.models || {}).length,
  controllers_introspected: Object.keys(introspectionResult.controllers || {}).length,
  routes_introspected: (introspectionResult.routes || []).length,
}
```

8. Return the merged extractions.

#### Acceptance criteria

- [ ] All 5 mergeExtractions tests pass
- [ ] All 21 previous tests still pass (26 total)
- [ ] Function delegates to domain-specific merge functions
- [ ] Does not mutate inputs

#### Constraints

- Do NOT modify any test files
- Do NOT modify any files other than `src/introspection/merger.js`

#### Verify

```bash
npx vitest run test/introspection/merger.test.js
```

Expected: 26 passes.

```bash
git add -A && git commit -m "task 18: implement mergeExtractions"
```

---

### Task 19: Checkpoint — Merger Complete

**This is a manual verification step. Do not send this to the AI agent.**

#### Verify

1. Run full test suite:

```bash
npm test
```

2. Run merger tests with coverage:

```bash
npx vitest run test/introspection/merger.test.js --coverage
```

Verify: `src/introspection/merger.js` has ≥80% line coverage.

3. Check merger module size:

```bash
wc -l src/introspection/merger.js
```

Verify: reasonable size. If over 200 lines, review for opportunities to extract helpers.

4. Review git diff:

```bash
git diff checkpoint-model-controller-merging..HEAD --stat
```

Verify: only merger-related files changed.

```bash
git tag checkpoint-merger-complete
```

---

## Phase 4: Indexer Integration

### Task 20: Add --no-introspection CLI flag

**Goal:** Add a CLI flag to disable Ruby introspection.

**Read first (do not modify):**

- #file:bin/railsinsight.js (existing CLI options parsing)

**Modify:** `bin/railsinsight.js`

#### What to do

1. Add to the `options` object:

```javascript
'no-introspection': { type: 'boolean', default: false },
```

2. Add to `HELP_TEXT`:

```
  --no-introspection        Skip Ruby runtime introspection (regex-only mode)
```

3. Pass the value to `startLocal`:

```javascript
await startLocal(projectRoot, {
  claudeMdPath,
  verbose,
  tier: 'pro',
  noIntrospection: values['no-introspection'] || false,
})
```

#### Acceptance criteria

- [ ] `--no-introspection` is a valid CLI flag
- [ ] Help text includes the new flag
- [ ] Value is passed through to `startLocal` as `noIntrospection`

#### Constraints

- Do NOT modify any files other than `bin/railsinsight.js`
- Do NOT change existing option names or defaults
- Keep changes to 3 locations: options object, help text, startLocal call

#### Verify

```bash
node bin/railsinsight.js --help | grep introspection
```

Expected: shows `--no-introspection` in help output.

```bash
git add -A && git commit -m "task 20: add --no-introspection CLI flag"
```

---

### Task 21: Wire introspection option through server.js

**Goal:** Pass the `noIntrospection` option from `startLocal` through to the `buildIndex` call.

**Read first (do not modify):**

- #file:src/server.js (startLocal function)
- #file:src/core/indexer.js (buildIndex function signature)

**Modify:** `src/server.js`

#### What to do

1. In `startLocal`, accept `noIntrospection` from options:

```javascript
const noIntrospection = options.noIntrospection || false
```

2. Pass it to `buildIndex`:

```javascript
const index = await buildIndex(provider, {
  claudeMdPath: options.claudeMdPath,
  verbose,
  noIntrospection,
})
```

#### Acceptance criteria

- [ ] `startLocal` reads `noIntrospection` from options
- [ ] `noIntrospection` is passed through to `buildIndex`

#### Constraints

- Do NOT modify any files other than `src/server.js`
- Do NOT change the MCP server setup or transport logic
- Keep changes minimal — just the option threading

#### Verify

```bash
npm test
```

Expected: all existing tests still pass (buildIndex accepts but ignores unknown options).

```bash
git add -A && git commit -m "task 21: wire introspection option through server.js"
```

---

### Task 22: Write failing tests for indexer introspection integration

**Goal:** Test that `buildIndex` calls `runIntrospection` and uses `mergeExtractions` when introspection is available.

**Read first (do not modify):**

- #file:src/core/indexer.js (existing buildIndex function)
- #file:src/introspection/bridge.js (runIntrospection signature)
- #file:src/introspection/merger.js (mergeExtractions signature)
- #file:test/fixtures/introspection-fixtures.js

**Create:** `test/introspection/indexer-integration.test.js`

#### What to do

1. Create a test file with `describe('buildIndex with introspection')` containing 4 tests:

   a. `'calls runIntrospection when provider supports execCommand'` — Create a mock provider that has all required methods (readFile returning basic Gemfile/routes/schema content, fileExists, glob returning minimal entries, listDir, getProjectRoot, and an `execCommand` that returns a successful introspection JSON). Call `buildIndex(provider)`. Assert `index._introspection` is not undefined (the merge happened) OR assert the index contains introspection metadata. Note: you may need to `vi.mock` the bridge module to verify it was called.

   b. `'skips introspection when noIntrospection option is true'` — Call `buildIndex(provider, { noIntrospection: true })`. Assert `index._introspection` is undefined or not present.

   c. `'falls back gracefully when introspection fails'` — Mock provider where execCommand returns exitCode: 1. Assert buildIndex completes without error and the index has standard regex-only data.

   d. `'falls back gracefully when provider has no execCommand'` — Provider without execCommand method. Assert buildIndex completes successfully with regex-only data.

2. The mock provider needs to return enough content for buildIndex to not error on the existing extractors — at minimum: a Gemfile, config/application.rb, config/routes.rb, db/schema.rb with at least one table.

#### Acceptance criteria

- [ ] 4 tests that cover the introspection integration path
- [ ] All 4 fail (because indexer.js doesn't call runIntrospection yet)
- [ ] Mock providers are comprehensive enough for buildIndex to complete the regex extraction phase

#### Constraints

- Do NOT modify `src/core/indexer.js` — the tests should fail because the introspection step doesn't exist yet
- Do NOT modify any other source files
- Use `vi.mock` if needed for verifying bridge function calls

#### Verify

```bash
npx vitest run test/introspection/indexer-integration.test.js
```

Expected: 4 failures.

```bash
git add -A && git commit -m "task 22: failing tests for indexer introspection integration"
```

---

### Task 23: Implement Layer 4.5 introspection step in indexer.js

**Goal:** Add the runtime introspection step between Layer 4 (extractors) and Layer 5 (graph construction) in `buildIndex`.

**Read first (do not modify):**

- #file:test/introspection/indexer-integration.test.js (tests to satisfy)
- #file:src/core/indexer.js (existing buildIndex — find the location between extractors and graph)
- #file:src/introspection/bridge.js (runIntrospection function)
- #file:src/introspection/merger.js (mergeExtractions function)

**Modify:** `src/core/indexer.js`

#### What to do

1. Add imports at the top of the file:

```javascript
import { runIntrospection } from '../introspection/bridge.js'
import { mergeExtractions } from '../introspection/merger.js'
```

2. After all extractors have run (after the coverage snapshot extraction and STI detection, just before the `// Layer 5: Graph + Rankings` comment), add:

```javascript
  // Layer 4.5: Runtime Introspection
  if (!options.noIntrospection && typeof provider.execCommand === 'function') {
    const introspectionResult = await runIntrospection(provider, {
      verbose: options.verbose,
    })

    if (introspectionResult.available) {
      const merged = mergeExtractions(extractions, introspectionResult)
      // Copy merged properties back onto extractions object
      Object.assign(extractions, merged)

      if (options.verbose) {
        process.stderr.write(
          `[railsinsight] Runtime introspection: ${introspectionResult._introspection?.models_introspected || 0} models, ${introspectionResult.duration_ms}ms\n`,
        )
      }
    } else if (options.verbose && introspectionResult.error) {
      process.stderr.write(
        `[railsinsight] Introspection skipped: ${introspectionResult.error}\n`,
      )
    }
  }
```

3. Include the `_introspection` metadata in the returned index object (it's already on `extractions` from the merge step, so it will propagate via `extractions`).

#### Acceptance criteria

- [ ] All 4 indexer integration tests pass
- [ ] All existing tests still pass (`npm test`)
- [ ] Introspection is skipped when `noIntrospection: true`
- [ ] Introspection is skipped when provider has no `execCommand`
- [ ] Failed introspection doesn't break the indexer

#### Constraints

- Do NOT modify any test files
- Do NOT modify any files other than `src/core/indexer.js`
- Do NOT add new dependencies
- Place the introspection step between extractors and graph construction — not before, not after
- Use `Object.assign` to merge back, not destructuring (preserves the extractions reference used by graph builder)

#### Verify

```bash
npx vitest run test/introspection/indexer-integration.test.js
```

Expected: 4 passes.

```bash
npm test
```

Expected: all tests pass.

```bash
git add -A && git commit -m "task 23: implement Layer 4.5 introspection step"
```

---

### Task 24: Update get_overview handler with introspection metadata

**Goal:** Add introspection status to the overview tool response.

**Read first (do not modify):**

- #file:src/tools/handlers/get-overview.js (existing overview handler)

**Modify:** `src/tools/handlers/get-overview.js`

#### What to do

1. In the overview object construction (before `return respond(overview)`), add:

```javascript
introspection: extractions._introspection ? {
  available: true,
  source: 'bundle exec ruby',
  models_introspected: extractions._introspection.models_introspected,
  controllers_introspected: extractions._introspection.controllers_introspected,
  routes_introspected: extractions._introspection.routes_introspected,
  duration_ms: extractions._introspection.duration_ms,
} : {
  available: false,
  reason: 'Runtime introspection not available (no execCommand or --no-introspection)',
},
```

2. Add `const extractions = index.extractions || {}` near the top if it's not already there (it is used for other extraction reads).

#### Acceptance criteria

- [ ] Overview response includes `introspection` field
- [ ] When introspection data exists, shows counts and duration
- [ ] When introspection data is absent, shows `available: false` with reason
- [ ] All existing tests still pass

#### Constraints

- Do NOT modify any test files
- Do NOT modify any files other than `src/tools/handlers/get-overview.js`
- Add the field in a logical position within the overview object (near `extraction_errors`)

#### Verify

```bash
npm test
```

Expected: all tests pass.

```bash
git add -A && git commit -m "task 24: add introspection metadata to get_overview"
```

---

### Task 25: Checkpoint — Indexer Integration

**This is a manual verification step. Do not send this to the AI agent.**

#### Verify

1. Run full test suite:

```bash
npm test
```

2. Run all introspection tests:

```bash
npx vitest run test/introspection/
```

Verify: all bridge, merger, and indexer integration tests pass.

3. Verify the CLI flag works:

```bash
node bin/railsinsight.js --help | grep introspection
```

4. Check that indexer.js imports are correct:

```bash
head -30 src/core/indexer.js
```

Verify: `runIntrospection` and `mergeExtractions` imports are present.

5. Check total test count:

```bash
npx vitest run --reporter=verbose 2>&1 | tail -5
```

Verify: total test count has increased by the new tests.

```bash
git tag checkpoint-indexer-integration
```

---

## Phase 5: Graph Accuracy Improvements

### Task 26: Write failing tests for runtime-sourced graph edges

**Goal:** Test that the graph builder uses runtime-resolved `class_name` values when available.

**Read first (do not modify):**

- #file:src/core/graph.js (buildGraph function, extractClassName helper)
- #file:test/fixtures/introspection-fixtures.js

**Create:** `test/introspection/graph-runtime.test.js`

#### What to do

1. Create a test file with `describe('buildGraph with runtime data')` containing 4 tests:

   a. `'uses runtime class_name for association edges'` — Build extractions where a model has an association with `class_name` resolved from runtime (the `authored_comments` → `Comment` case). Build the graph. Assert the edge target is `Comment`, not a phantom node like `AuthoredComment`.

   b. `'creates edges for runtime-only models'` — Include a model in extractions with `source: 'runtime_only'`. Build the graph. Assert the model appears as a node.

   c. `'creates inherited_dependency edges from runtime callbacks'` — Include a controller with a runtime callback tagged `inherited: true` with filter `authenticate_user!`. Build the graph. Assert an edge exists from the controller to the `User` model (convention: authenticate_user → User dependency).

   d. `'handles merged extractions identically to regex-only'` — Build a graph from regex-only extractions, build another from merged extractions. Assert the merged graph has a superset of the regex graph's nodes and edges (no edges lost, only gained).

#### Acceptance criteria

- [ ] 4 tests that verify graph accuracy improvements from runtime data
- [ ] Tests use `buildGraph` directly (not through MCP tools)
- [ ] Test c specifically verifies inherited callback → model edge creation
- [ ] All 4 tests fail (graph.js doesn't handle runtime data specially yet)

#### Constraints

- Do NOT modify any source files
- Build test extractions inline — minimal objects with just enough fields for buildGraph

#### Verify

```bash
npx vitest run test/introspection/graph-runtime.test.js
```

Expected: 4 failures.

```bash
git add -A && git commit -m "task 26: failing tests for runtime graph edges"
```

---

### Task 27: Implement runtime edge improvements in graph.js

**Goal:** Enhance `buildGraph` to handle runtime-sourced data for more accurate graph edges.

**Read first (do not modify):**

- #file:test/introspection/graph-runtime.test.js (tests to satisfy)
- #file:src/core/graph.js (existing buildGraph — focus on model association loop and controller loop)

**Modify:** `src/core/graph.js`

#### What to do

1. In the model association loop, after resolving the target via `extractClassName` or `classify`, check if the association has a `class_name` field from runtime introspection (runtime associations have `class_name` already resolved). Prefer the runtime `class_name` over the regex-guessed one:

```javascript
const classNameOverride = extractClassName(assoc.options)
const runtimeClassName = assoc.class_name // from runtime introspection
const target = runtimeClassName || classNameOverride || classify(assoc.name)
```

2. Add `'inherited_dependency'` to `EDGE_WEIGHTS`:

```javascript
inherited_dependency: 1.5,
```

3. After the existing controller → model convention pairs loop, add a new loop for inherited callbacks:

```javascript
// Inherited callback dependencies
if (extractions.controllers) {
  for (const [name, ctrl] of Object.entries(extractions.controllers)) {
    const callbacks = ctrl.filters || ctrl.callbacks || []
    for (const cb of callbacks) {
      if (!cb.inherited) continue
      const filter = cb.filter || cb.method || ''
      // authenticate_user! → User model convention
      const modelMatch = filter.match(/^(?:authenticate|require)_(\w+?)!?$/)
      if (modelMatch) {
        const modelName = classify(modelMatch[1])
        if (extractions.models && extractions.models[modelName]) {
          graph.addEdge(name, modelName, 'inherited_dependency')
          relationships.push({ from: name, to: modelName, type: 'inherited_dependency' })
        }
      }
    }
  }
}
```

4. Add runtime-only model nodes:

```javascript
if (extractions.models) {
  for (const [name, model] of Object.entries(extractions.models)) {
    if (model.source === 'runtime_only') {
      graph.addNode(name, 'model', name)
    }
  }
}
```

#### Acceptance criteria

- [ ] All 4 graph runtime tests pass
- [ ] All existing graph and indexer tests still pass
- [ ] `inherited_dependency` edge type is in EDGE_WEIGHTS
- [ ] Runtime `class_name` is preferred over regex-guessed names
- [ ] Runtime-only models appear as nodes in the graph

#### Constraints

- Do NOT modify any test files
- Do NOT modify any files other than `src/core/graph.js`
- Do NOT remove any existing edge types or change existing weights
- The new inherited_dependency logic must not break existing convention_pair edges

#### Verify

```bash
npx vitest run test/introspection/graph-runtime.test.js
```

Expected: 4 passes.

```bash
npm test
```

Expected: all tests pass.

```bash
git add -A && git commit -m "task 27: implement runtime graph edge improvements"
```

---

### Task 28: End-to-end integration test

**Goal:** Write a single comprehensive test that exercises the full pipeline: indexer calls bridge → bridge returns data → merger merges → graph builds with runtime edges → overview tool reports introspection.

**Read first (do not modify):**

- #file:src/core/indexer.js (buildIndex)
- #file:src/tools/handlers/get-overview.js (overview response shape)
- #file:test/fixtures/introspection-fixtures.js

**Create:** `test/introspection/e2e.test.js`

#### What to do

1. Create a comprehensive mock provider that:
   - Has `readFile` returning realistic content for: Gemfile (with devise, pg gems), config/application.rb, config/routes.rb (with `resources :users` and `resources :posts`), db/schema.rb (with users and posts tables), app/models/user.rb (with `has_many :posts`, `devise :database_authenticatable`), app/models/post.rb (with `belongs_to :user`), app/controllers/users_controller.rb, app/controllers/posts_controller.rb
   - Has `fileExists` returning true for the above files
   - Has `glob` returning paths for the above files
   - Has `listDir` returning directory listings
   - Has `getProjectRoot` returning `/test/project`
   - Has `execCommand` returning successful introspection JSON that includes a metaprogrammed association NOT in the model source files

2. Write a test `'full pipeline: regex + introspection → merged index with graph'`:
   - Call `buildIndex(provider)`
   - Assert `index.extractions._introspection.available === true`
   - Assert the metaprogrammed association appears in the model data
   - Assert the graph has nodes for all models
   - Assert `index.statistics.models` is correct

3. Write a test `'full pipeline: introspection disabled falls back cleanly'`:
   - Call `buildIndex(provider, { noIntrospection: true })`
   - Assert `index.extractions._introspection` is undefined
   - Assert the index still has all regex-extracted data
   - Assert the graph still builds correctly

#### Acceptance criteria

- [ ] 2 end-to-end tests pass
- [ ] Tests exercise the real buildIndex (not mocked internals)
- [ ] The mock provider is realistic enough to test the full pipeline
- [ ] Tests verify that runtime data actually flows through to the final index

#### Constraints

- Do NOT modify any source files
- Do NOT add new dependencies
- The mock provider must be self-contained within the test file
- Tests may be slow (full pipeline) — set `testTimeout: 15000` on the describe block

#### Verify

```bash
npx vitest run test/introspection/e2e.test.js
```

Expected: 2 passes.

```bash
npm test
```

Expected: all tests pass.

```bash
git add -A && git commit -m "task 28: end-to-end integration test"
```

---

### Task 29: Checkpoint — Final

**This is a manual verification step. Do not send this to the AI agent.**

#### Verify

1. Run full test suite:

```bash
npm test
```

All tests must pass.

2. Run all introspection tests with coverage:

```bash
npx vitest run test/introspection/ --coverage
```

Verify:

- `src/introspection/bridge.js` ≥ 80% line coverage
- `src/introspection/merger.js` ≥ 80% line coverage
- Graph changes in `src/core/graph.js` are covered by existing + new tests

3. Count new test cases:

```bash
npx vitest run test/introspection/ --reporter=verbose 2>&1 | grep -c '✓\|✗'
```

Target: 40+ test cases across bridge (7) + merger (26) + indexer integration (4) + graph runtime (4) + e2e (2) = 43 minimum.

4. Review total line diff:

```bash
git diff checkpoint-foundation..HEAD --stat
```

Verify: changes are confined to expected files.

5. Verify the npm package includes the Ruby script:

```bash
cat package.json | grep -A5 '"files"'
```

Verify: `"src/"` is in the files array (it is — introspect.rb lives in src/introspection/).

6. Manual smoke test against a real Rails app (optional but recommended):

```bash
cd /path/to/real/rails/app
node /path/to/rails-insight/bin/railsinsight.js -p . --verbose 2>&1 | head -20
```

Look for: `[railsinsight] Runtime introspection: N models, Xms` or `[railsinsight] Introspection skipped: <reason>`.

```bash
git tag checkpoint-final
```

---

## Manual Validation Checklist

After all tasks are complete, verify these items manually against a real Rails application:

- [ ] `npm install -g @reinteractive/rails-insight` installs successfully
- [ ] `introspect.rb` is included in the installed package (check `npm root -g`/@reinteractive/rails-insight/src/introspection/)
- [ ] Running against a Rails 7+ app with a running database shows introspection data in `get_overview`
- [ ] Running against a Rails app WITHOUT a database connection falls back gracefully to regex-only
- [ ] Running with `--no-introspection` produces identical output to pre-introspection versions
- [ ] Running against a non-Rails project (Node.js project, empty directory) doesn't error
- [ ] Metaprogrammed associations (if present in the test app) appear in `get_model` output
- [ ] Inherited controller callbacks appear in `get_controller` output
- [ ] Engine routes (Devise, ActiveAdmin) appear in `get_routes` output
- [ ] `get_blast_radius` works correctly with the merged graph (test by changing a model file)
- [ ] Total indexing time increase is under 5 seconds for the introspection step
