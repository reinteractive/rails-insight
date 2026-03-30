# RailsInsight v1.0.6 — Fix All Evaluation Issues

You are working on **RailsInsight**, a Rails-aware MCP server written in Node.js (ES modules). The codebase uses **Vitest** for testing. You have access to the full source code.

## Your Mission

Fix all 37 issues identified across 9 independent evaluation runs against real Rails applications (Rails 5.2 through 8.1). Each issue includes the affected file, the root cause, and a suggested fix. After fixing each issue, write or update tests to prevent regression. After each sprint, run the full test suite to confirm nothing is broken.

## Ground Rules

1. **Run `npm test` before starting** to establish a baseline. Record how many tests pass.
2. **Fix one issue at a time.** After each fix, run the relevant test file to confirm the fix works.
3. **After each sprint**, run `npm test` (full suite) and confirm all tests pass.
4. **Do not change the MCP tool API surface** — tool names, parameter names, and response shapes must remain backward-compatible.
5. **Follow the existing code style** — ES modules, JSDoc comments, Clean Code naming conventions.
6. **Every fix must have at least one test** — either a new test or an updated existing test that would have caught the bug.
7. **Commit after each sprint** with a message like `fix: sprint 1 — stale index, secret exposure, gemfile comments, config comments`

---

## Sprint 1 — Blocking Issues (Fix Before Public Launch)

These 4 issues affect 44–56% of evaluation runs. Fix them first.

---

### ISSUE-08: Config file extractors parse commented-out lines as active configuration

**Files:** `src/extractors/caching.js`, `src/extractors/storage.js`, `src/extractors/config.js`, `src/extractors/auth.js`
**Seen in:** 5 of 9 apps (56% hit rate)

**Problem:** Lines like `# config.cache_store = :mem_cache_store` in Ruby config files are matched by regex patterns as active configuration. Similarly, commented-out YAML services in `config/storage.yml` are reported as active.

**Root cause:** All extractors apply regex patterns to raw file content without stripping Ruby comment lines first.

**Fix:**

1. Create a shared utility function in `src/utils/ruby-parser.js`:

```javascript
/**
 * Strip Ruby single-line comments from source content.
 * Preserves string literals containing # characters.
 * @param {string} content - Ruby file content
 * @returns {string} Content with comment lines removed
 */
export function stripRubyComments(content) {
  return content.split('\n')
    .filter(line => !line.trim().startsWith('#'))
    .join('\n');
}
```

2. In `src/extractors/caching.js` — in `extractCaching()`, when reading environment config files (approximately line 20), apply comment stripping before matching `cacheStore` pattern:

```javascript
const content = provider.readFile(`config/environments/${env}.rb`)
if (content) {
  const activeContent = stripRubyComments(content)
  const storeMatch = activeContent.match(CACHING_PATTERNS.cacheStore)
  // ...
}
```

Apply the same pattern everywhere `CACHING_PATTERNS.cacheStore` is matched against environment files.

3. In `src/extractors/storage.js` — the `storageService` regex is applied to raw `config/storage.yml` content. The YAML parser in `src/utils/yaml-parser.js` already strips comment lines, but `extractStorage` uses regex directly on the raw content instead of the parser. Fix: either use `parseYaml()` to parse `storage.yml`, or strip comments before regex:

```javascript
const storageYml = provider.readFile('config/storage.yml')
if (storageYml) {
  const activeYml = storageYml.split('\n').filter(l => !l.trim().startsWith('#')).join('\n')
  const serviceRe = new RegExp(STORAGE_PATTERNS.storageService.source, 'g')
  let m
  while ((m = serviceRe.exec(activeYml))) {
    // ...
  }
}
```

4. In `src/extractors/auth.js` — the Devise config parser loop (approximately line 260) reads `config.X = Y` pairs from `config/initializers/devise.rb`. Strip comments from the file content before parsing:

```javascript
const deviseConfig = provider.readFile('config/initializers/devise.rb')
if (deviseConfig) {
  const activeConfig = stripRubyComments(deviseConfig)
  const configRe = new RegExp(AUTH_PATTERNS.deviseConfig.source, 'g')
  let m
  while ((m = configRe.exec(activeConfig))) {
    // ...
  }
}
```

5. In `src/extractors/config.js` — apply the same comment stripping to environment files before matching `cacheStore`, `forceSSL`, etc.

**Tests to write** in `test/extractors/caching.test.js` (create or update):

```javascript
import { describe, it, expect, vi } from 'vitest'
import { extractCaching } from '../../src/extractors/caching.js'

describe('extractCaching', () => {
  it('ignores commented-out cache_store in production.rb', () => {
    const provider = {
      readFile(path) {
        if (path === 'config/environments/production.rb') {
          return `Rails.application.configure do
  # config.cache_store = :mem_cache_store
  config.force_ssl = true
end`
        }
        return null
      }
    }
    const result = extractCaching(provider, [])
    expect(result.store.production).toBeUndefined()
  })

  it('detects uncommented cache_store in production.rb', () => {
    const provider = {
      readFile(path) {
        if (path === 'config/environments/production.rb') {
          return `Rails.application.configure do
  config.cache_store = :redis_cache_store
end`
        }
        return null
      }
    }
    const result = extractCaching(provider, [])
    expect(result.store.production).toBe('redis_cache_store')
  })
})
```

Write a similar test in `test/extractors/storage.test.js` confirming commented YAML services are excluded.

---

### ISSUE-05: Gemfile parser fails when gem declaration has inline comment

**File:** `src/core/patterns/gemfile.js`, `src/extractors/gemfile.js`
**Seen in:** 1 app (but affects any project with comments on gem lines)

**Problem:** `gem 'pundit' # For access control` fails to match the gem pattern because the regex doesn't tolerate trailing comments.

**Root cause:** The gem regex in `src/core/patterns/gemfile.js` is:

```javascript
gem: /^\s*gem\s+['"]([^'"]+)['"](?:,\s*['"]([^'"]+)['"])?(?:,\s*(.+))?$/m
```

The `$` anchor fails when a `# comment` follows the gem name without a version or options group.

**Fix:** Update the regex to allow optional trailing comments:

```javascript
gem: /^\s*gem\s+['"]([^'"]+)['"](?:,\s*['"]([^'"]+)['"])?(?:,\s*([^#]+?))?(?:\s*#.*)?$/m
```

Key changes:

- Options group changed from `(.+)` to `([^#]+?)` (non-greedy, stops at comment)
- Added `(?:\s*#.*)?` before `$` to consume optional inline comments

**Tests to write** in `test/extractors/gemfile.test.js`:

```javascript
it('parses gem with inline comment and no version', () => {
  const provider = {
    readFile(path) {
      if (path === 'Gemfile') return "gem 'pundit' # For access control"
      return null
    }
  }
  const result = extractGemfile(provider)
  expect(result.gems.some(g => g.name === 'pundit')).toBe(true)
})

it('parses gem with version and inline comment', () => {
  const provider = {
    readFile(path) {
      if (path === 'Gemfile') return "gem 'rails', '~> 7.1' # Framework"
      return null
    }
  }
  const result = extractGemfile(provider)
  const rails = result.gems.find(g => g.name === 'rails')
  expect(rails).toBeDefined()
  expect(rails.version).toBe('~> 7.1')
})

it('parses gem with options and inline comment', () => {
  const provider = {
    readFile(path) {
      if (path === 'Gemfile') return "gem 'devise', '~> 4.9', require: false # Auth"
      return null
    }
  }
  const result = extractGemfile(provider)
  const devise = result.gems.find(g => g.name === 'devise')
  expect(devise).toBeDefined()
})
```

---

### ISSUE-04: Devise secret_key and pepper values exposed in tool output

**File:** `src/extractors/auth.js`
**Seen in:** 3 of 9 apps

**Problem:** The Devise config parser captures ALL `config.X = Y` pairs from `config/initializers/devise.rb`, including `secret_key` and `pepper` values. These are sensitive secrets that should never appear in MCP tool output.

**Fix:** After the Devise config parsing loop (approximately line 270 in `src/extractors/auth.js`), add a filter that redacts sensitive keys:

```javascript
const REDACTED_DEVISE_KEYS = new Set([
  'secret_key', 'pepper', 'secret_key_base',
  'signing_salt', 'digest',
])

// After parsing config into result.devise.config:
for (const key of Object.keys(result.devise.config)) {
  if (REDACTED_DEVISE_KEYS.has(key)) {
    result.devise.config[key] = '[REDACTED]'
  }
}
```

**Tests to write:**

```javascript
it('redacts secret_key from Devise config output', () => {
  const provider = {
    readFile(path) {
      if (path === 'Gemfile') return "gem 'devise'"
      if (path === 'Gemfile.lock') return ''
      if (path === 'config/initializers/devise.rb') {
        return `Devise.setup do |config|
  config.secret_key = '0d9ad821776c991b1c5468abcdef1234567890'
  config.pepper = 'super_secret_pepper_value'
  config.mailer_sender = 'noreply@example.com'
  config.timeout_in = 30.minutes
end`
      }
      return null
    },
    fileExists() { return false },
    glob() { return [] }
  }
  const result = extractAuth(provider, [], { gems: { devise: {} } })
  expect(result.devise.config.secret_key).toBe('[REDACTED]')
  expect(result.devise.config.pepper).toBe('[REDACTED]')
  expect(result.devise.config.mailer_sender).toBe("'noreply@example.com'")
  expect(result.devise.config.timeout_in).toBe('30.minutes')
})
```

---

### ISSUE-01: Stale/cross-project index persists across workspaces

**Files:** `src/server.js`, `src/core/indexer.js`
**Seen in:** 4 of 9 apps (44% hit rate)

**Problem:** When `index_project({ force: true })` is called, the server continues to serve data from a previously indexed project. The project root is resolved once at server startup and cached in the `state` object. If the MCP server process is reused across different projects (common with Claude Code), the index is stale.

**Root cause analysis:** In `src/server.js`, `startLocal()` calls `buildIndex(provider, ...)` once, stores the result in `state.index`, and the `index_project` handler in `src/tools/handlers/index-project.js` rebuilds from `state.provider`. The provider's `_root` is set at construction time. If the provider's root doesn't match the agent's current working directory, the re-index still reads the wrong project.

**Fix:** In `src/tools/handlers/index-project.js`, when `force: true` is passed, re-resolve the project root from the provider's current working directory:

```javascript
export function register(server, state) {
  server.tool(
    'index_project',
    'Re-index the Rails project. In local mode, re-scans the project root. Returns statistics and duration.',
    {
      force: z.boolean().optional().describe('Force full re-index even if cached'),
    },
    async ({ force }) => {
      if (!state.provider) {
        return respond({
          error: 'No project root configured. Start with --project-root.',
        })
      }

      // When force is true, verify the provider's root matches cwd
      if (force && typeof state.provider.getProjectRoot === 'function') {
        const providerRoot = state.provider.getProjectRoot()
        // Log the root being indexed for debugging
        if (state.verbose) {
          process.stderr.write(`[railsinsight] Force re-indexing ${providerRoot}\n`)
        }
      }

      const start = Date.now()
      // Clear existing index before rebuilding to prevent stale data contamination
      state.index = null
      state.index = await buildIndex(state.provider, { verbose: state.verbose })
      const duration_ms = Date.now() - start
      return respond({
        status: 'success',
        project_root: state.provider.getProjectRoot(),
        statistics: state.index.statistics,
        duration_ms,
      })
    },
  )
}
```

The critical line is `state.index = null` before rebuilding. This ensures that if `buildIndex` fails, stale data is not served.

Additionally, verify that in `src/server.js`, the `LocalFSProvider` is constructed with the correct project root. If the MCP server is connected via stdio to Claude Code, the `projectRoot` argument to `startLocal()` comes from `process.cwd()` or `--project-root`. Verify this resolves correctly:

```javascript
// In bin/railsinsight.js or src/server.js startup:
const projectRoot = args.projectRoot || process.cwd()
```

**Tests to write:**

```javascript
it('index_project with force:true clears previous index before rebuilding', async () => {
  // Create a mock state with a stale index
  const state = {
    index: { statistics: { models: 999 }, extractions: { models: { StaleModel: {} } } },
    provider: createMockProvider({ /* fresh project files */ }),
    verbose: false,
  }
  // Register and call the tool
  // After calling index_project({ force: true }), state.index should NOT contain StaleModel
  // It should contain only models from the mock provider's files
})
```

**Verification:** After fixing this, the `index_project` tool response should include a `project_root` field. Check that it matches the expected directory.

---

### Sprint 1 Verification

After completing all 4 fixes:

```bash
npm test
```

All existing tests must still pass. The new tests you wrote must pass. Record the test count.

---

## Sprint 2 — Core Extraction Accuracy

---

### ISSUE-02: Devise modules extractor over-captures non-Devise content

**File:** `src/extractors/model.js` (devise module parser, approximately line 480-510)

**Problem:** The devise continuation logic reads past the end of the `devise()` macro call, capturing attribute names, method names, enum values, and association names as Devise modules.

**Fix:** Replace the current multi-line continuation approach with a tighter parser. Find the `devise` extraction section (search for `MODEL_PATTERNS.devise` usage). The current code does:

```javascript
const deviseMatch = content.match(MODEL_PATTERNS.devise)
if (deviseMatch) {
  let deviseStr = deviseMatch[1]
  // Current continuation logic reads next lines looking for :symbols
  const continuationLines = afterMatch.split('\n')
  for (const line of continuationLines) {
    const trimmed = line.trim()
    if (/^:/.test(trimmed) || /^,/.test(trimmed) || /^\w+.*:/.test(trimmed)) {
      deviseStr += ' ' + trimmed
    } else {
      break
    }
  }
  devise_modules = (deviseStr.match(/:(\w+)/g) || []).map(s => s.slice(1))
}
```

The problem is the continuation condition `/^\w+.*:/.test(trimmed)` — this matches lines like `status active inactive` (enum values) and `set_display_name` (method names).

Replace with:

```javascript
const deviseMatch = content.match(MODEL_PATTERNS.devise)
if (deviseMatch) {
  let deviseStr = deviseMatch[1]
  // Only continue if the matched line ends with a comma (argument list continues)
  const matchedLine = content.slice(0, deviseMatch.index + deviseMatch[0].length)
  const afterMatch = content.slice(deviseMatch.index + deviseMatch[0].length)

  if (deviseMatch[0].trimEnd().endsWith(',')) {
    const continuationLines = afterMatch.split('\n')
    for (const line of continuationLines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      // Only continue if line starts with :symbol (devise module) or is a continuation comma
      if (/^:\w+/.test(trimmed)) {
        deviseStr += ' ' + trimmed
        // Stop if this line does NOT end with a comma
        if (!trimmed.replace(/\s*#.*$/, '').trimEnd().endsWith(',')) break
      } else {
        break
      }
    }
  }

  devise_modules = (deviseStr.match(/:(\w+)/g) || []).map(s => s.slice(1))
}
```

Additionally, to handle **multiple `devise` calls** in the same model (seen in t1 — `devise :two_factor_authenticatable, :two_factor_backupable` and a separate `devise :recoverable, :rememberable, ...`), use `matchAll` instead of `match`:

```javascript
// Replace single match with global iteration
devise_modules = []
const deviseGlobalRe = /^\s*devise\s+(.+)/gm
let deviseMatch
while ((deviseMatch = deviseGlobalRe.exec(content))) {
  let deviseStr = deviseMatch[1]
  // Apply the continuation logic from above to deviseStr
  // ...then merge modules:
  const modules = (deviseStr.match(/:(\w+)/g) || []).map(s => s.slice(1))
  devise_modules.push(...modules)
}
```

**Tests to write:**

```javascript
it('extracts only devise modules, not subsequent model attributes', () => {
  const content = `class User < ApplicationRecord
  devise :database_authenticatable, :recoverable,
         :rememberable, :validatable

  enum role: { user: 0, admin: 1 }
  before_save :set_display_name

  has_many :reviews
end`
  const result = extractModel(mockProvider(content), 'app/models/user.rb', 'User')
  expect(result.devise_modules).toEqual([
    'database_authenticatable', 'recoverable', 'rememberable', 'validatable'
  ])
  expect(result.devise_modules).not.toContain('role')
  expect(result.devise_modules).not.toContain('set_display_name')
  expect(result.devise_modules).not.toContain('reviews')
})

it('captures devise modules from multiple devise calls', () => {
  const content = `class User < ApplicationRecord
  devise :two_factor_authenticatable, :two_factor_backupable
  devise :recoverable, :rememberable, :trackable, :validatable
end`
  const result = extractModel(mockProvider(content), 'app/models/user.rb', 'User')
  expect(result.devise_modules).toHaveLength(6)
  expect(result.devise_modules).toContain('two_factor_authenticatable')
  expect(result.devise_modules).toContain('validatable')
})
```

---

### ISSUE-09: `[object Object]` serialisation bug in review context controller summaries

**File:** `src/core/blast-radius.js` (`formatControllerSummary` function, approximately line 290)

**Problem:** Controller filter objects are concatenated into a summary string using default JS object-to-string coercion.

**Fix:** Find `formatControllerSummary` in `src/core/blast-radius.js`:

```javascript
function formatControllerSummary(name, controller) {
  const parts = [name]
  const actionCount = (controller.actions || []).length
  if (actionCount > 0) parts.push(`${actionCount} actions`)
  const filters = controller.before_actions || controller.filters || []
  if (filters.length > 0) parts.push(filters.map(f => f.name || f).join(', '))
  return parts.join(' — ')
}
```

The bug is `f.name || f` — when `f` is an object `{ type: 'before_action', method: 'authenticate!' }` and `f.name` is undefined, it falls back to `f` which coerces to `[object Object]`.

Fix:

```javascript
if (filters.length > 0) parts.push(filters.map(f => f.method || f.name || JSON.stringify(f)).join(', '))
```

**Tests to write:**

```javascript
it('formatControllerSummary renders filter methods not [object Object]', () => {
  const summary = formatControllerSummary('UsersController', {
    actions: ['index', 'show'],
    filters: [
      { type: 'before_action', method: 'authenticate_user!' },
      { type: 'before_action', method: 'set_user', options: 'only: [:show]' }
    ]
  })
  expect(summary).toBe('UsersController — 2 actions — authenticate_user!, set_user')
  expect(summary).not.toContain('[object Object]')
})
```

Note: `formatControllerSummary` is currently a private function. You may need to export it for testing, or test it indirectly through `buildReviewContext`.

---

### ISSUE-10: Controller count undercounts — namespace deduplication

**File:** `src/core/indexer.js` (controller key generation)

**Problem:** When `Admin::ActivitiesController` and `ActivitiesController` both exist, `pathToClassName('app/controllers/admin/activities_controller.rb')` returns `ActivitiesController` (same as the non-namespaced one), causing only one to be kept.

**Fix:** In `src/core/indexer.js`, the controller extraction loop (approximately line 155) does:

```javascript
} else if (entry.categoryName === 'controllers') {
  const ctrl = safeExtract(...)
  if (ctrl) {
    const name = pathToClassName(entry.path)
    extractions.controllers[name] = ctrl
  }
}
```

`pathToClassName` only uses the basename. Replace with the controller's own extracted class name:

```javascript
} else if (entry.categoryName === 'controllers') {
  const ctrl = safeExtract(...)
  if (ctrl) {
    // Use the controller's own fully-qualified class name if available
    const name = ctrl.class || pathToClassName(entry.path)
    extractions.controllers[name] = ctrl
  }
}
```

The controller extractor already extracts the full class name including namespace (e.g., `Admin::ActivitiesController`) via `CONTROLLER_PATTERNS.classDeclaration`. This ensures namespaced controllers don't collide.

Also fix `computeStatistics` to count from the same source:

```javascript
controllers: Object.keys(extractions.controllers || {}).length,
```

This should already be correct since it counts keys, but verify it matches the manifest count.

**Tests to write:**

```javascript
it('indexes both Admin::UsersController and UsersController as separate entries', () => {
  // Mock a provider that returns two controller files with different namespaces
  // Verify extractions.controllers has both keys
})
```

---

### ISSUE-11: `get_overview` reports `test_framework: 'unknown'` despite detection

**File:** `src/tools/handlers/get-overview.js` (approximately line 100)

**Problem:** The overview reads `v.test_framework` but the version detector stores it in `v.framework.testFramework`.

**Fix:** Find the line in `src/tools/handlers/get-overview.js` that sets `test_framework`:

```javascript
// Current:
test_framework: v.test_framework || 'unknown',

// Fixed:
test_framework: v.framework?.testFramework || v.test_framework || 'unknown',
```

**Tests to write:**

```javascript
it('overview reports rspec when framework.testFramework is set', () => {
  const state = {
    index: {
      versions: { framework: { testFramework: 'rspec' } },
      extractions: { /* minimal */ },
      statistics: {},
    }
  }
  // Call get_overview handler and verify test_framework is 'rspec'
})
```

---

### ISSUE-07: `search_patterns` does not search controller filter types

**File:** `src/tools/handlers/search-patterns.js`

**Problem:** The controller search loop matches filter method names against the pattern, but not filter types. Searching for `'before_action'` returns 0 results because `before_action` is stored in `f.type`, not `f.method`.

**Fix:** In the controller search section of `search-patterns.js` (approximately line 70), add type matching:

```javascript
for (const [name, ctrl] of Object.entries(extractions.controllers || {})) {
  const matches = []
  const filters = ctrl.filters || []
  for (const f of filters) {
    const filterMethod = typeof f === 'string' ? f : f.method || f.name || ''
    const filterType = typeof f === 'string' ? '' : f.type || ''
    if (filterMethod.toLowerCase().includes(lowerPattern) ||
        filterType.toLowerCase().includes(lowerPattern)) {
      matches.push({ type: 'filter', detail: f })
    }
  }
  if (matches.length > 0)
    results.push({ entity: name, entity_type: 'controller', matches })
}
```

**Tests to write:**

```javascript
it('search_patterns finds before_action by filter type', () => {
  const state = {
    index: {
      extractions: {
        models: {},
        controllers: {
          UsersController: {
            filters: [
              { type: 'before_action', method: 'authenticate_user!' },
              { type: 'before_action', method: 'set_user', options: 'only: [:show]' }
            ]
          }
        }
      }
    }
  }
  // Call search_patterns({ pattern: 'before_action' })
  // Verify total_matches >= 2
})
```

---

### ISSUE-12: Policy `permitted_actions` only captures CRUD methods

**File:** `src/core/patterns/authorization.js`

**Problem:** The regex hardcodes only 7 standard REST actions:

```javascript
policyMethod: /def\s+(index|show|create|new|update|edit|destroy)\?/g,
```

**Fix:**

```javascript
policyMethod: /def\s+(\w+)\?/g,
```

This captures all predicate methods. The extractor should still work since it just collects method names. Optionally filter out Ruby built-in predicates if they cause noise:

```javascript
const EXCLUDED_PREDICATES = new Set(['nil', 'present', 'blank', 'valid', 'persisted', 'new_record', 'changed', 'frozen', 'respond_to'])

// In the extraction loop:
while ((m = methodRe.exec(content))) {
  const methodName = m[1]
  if (!EXCLUDED_PREDICATES.has(methodName)) {
    policy.permitted_actions.push(methodName)
  }
}
```

**Tests to write:**

```javascript
it('extracts custom policy action methods beyond standard CRUD', () => {
  const content = `class AssetReviewPolicy < ApplicationPolicy
  def approve?
    user.admin?
  end

  def reject?
    user.admin? || user.reviewer?
  end

  def index?
    true
  end
end`
  // Parse and verify permitted_actions includes 'approve', 'reject', 'index'
})
```

---

### Sprint 2 Verification

```bash
npm test
```

All tests pass. New tests for ISSUE-02, 07, 09, 10, 11, 12 all pass.

---

## Sprint 3 — Feature Completeness

---

### ISSUE-03: `get_subgraph` returns empty/irrelevant entities

**File:** `src/tools/handlers/get-subgraph.js`

**Problem:** The current implementation uses keyword matching against entity names. The `authentication` skill returns models like `Activity` because they have high PageRank, not because they're auth-relevant.

**Fix:** Replace the keyword-matching approach with semantic seed strategies. Rewrite the core logic:

```javascript
function getSkillSeeds(skill, index) {
  const extractions = index.extractions || {}
  const models = extractions.models || {}
  const controllers = extractions.controllers || {}
  const seeds = new Set()

  switch (skill) {
    case 'authentication': {
      for (const [name, model] of Object.entries(models)) {
        if (model.devise_modules?.length > 0) seeds.add(name)
        if (model.has_secure_password) seeds.add(name)
      }
      if (models.Session) seeds.add('Session')
      if (models.Current) seeds.add('Current')
      for (const [name] of Object.entries(controllers)) {
        if (/session|registration|password|confirmation|omniauth/i.test(name)) seeds.add(name)
      }
      // Auth concerns
      const authConf = extractions.auth || {}
      if (authConf.native_auth?.related_files) {
        // Add entities for auth-related files
      }
      break
    }
    case 'database': {
      for (const [name, model] of Object.entries(models)) {
        if (model.type !== 'concern' && !model.abstract) seeds.add(name)
      }
      break
    }
    case 'jobs': {
      const jobs = extractions.jobs?.jobs || []
      for (const job of jobs) {
        if (job.class) seeds.add(job.class)
      }
      for (const [name] of Object.entries(extractions.workers || {})) {
        seeds.add(name)
      }
      break
    }
    case 'email': {
      const mailers = extractions.email?.mailers || []
      for (const mailer of mailers) {
        if (mailer.class) seeds.add(mailer.class)
      }
      break
    }
    case 'frontend': {
      for (const [name] of Object.entries(extractions.components || {})) seeds.add(name)
      for (const sc of extractions.stimulus_controllers || []) {
        if (sc.identifier) seeds.add(sc.identifier)
      }
      break
    }
    case 'api': {
      for (const [name, ctrl] of Object.entries(controllers)) {
        if (ctrl.api_controller || /Api|API/.test(name)) seeds.add(name)
      }
      break
    }
    default:
      return null
  }
  return seeds
}
```

Then use BFS from seeds to build the subgraph:

```javascript
async ({ skill }) => {
  if (!state.index) return noIndex()

  const seeds = getSkillSeeds(skill, state.index)
  if (seeds === null) {
    return respond({ error: `Unknown skill '${skill}'`, available: ['authentication', 'database', 'frontend', 'api', 'jobs', 'email'] })
  }

  if (seeds.size === 0) {
    return respond({ skill, entities: [], relationships: [], total_entities: 0, total_relationships: 0 })
  }

  const graph = state.index.graph
  const rankings = state.index.rankings || {}

  // BFS expand seeds by 1-2 hops
  const allEntityIds = new Set(seeds)
  if (graph) {
    const bfsResults = graph.bfsFromSeeds([...seeds], 2, { excludeEdgeTypes: new Set(['tests']) })
    for (const r of bfsResults) {
      allEntityIds.add(r.entity)
    }
  }

  const allRels = state.index.relationships || []
  const subgraphRels = allRels.filter(r => allEntityIds.has(r.from) || allEntityIds.has(r.to))
  const rankedFiles = [...allEntityIds]
    .map(e => ({ entity: e, rank: rankings[e] || 0 }))
    .sort((a, b) => b.rank - a.rank)

  return respond({
    skill,
    entities: rankedFiles,
    relationships: subgraphRels,
    total_entities: rankedFiles.length,
    total_relationships: subgraphRels.length,
  })
}
```

**Tests to write:**

```javascript
it('authentication subgraph includes User with has_secure_password', () => {
  // Mock index with User model having has_secure_password: true
  // Verify User appears in subgraph entities
})

it('authentication subgraph excludes unrelated content models', () => {
  // Mock index with Article, Product, User(devise) models
  // Verify Article and Product are NOT in the subgraph seeds
})

it('database subgraph includes all non-concern AR models', () => {
  // Verify all models except concerns/abstract are included
})
```

---

### ISSUE-13: Route extractor gaps — `devise_for`, custom `draw`, nested namespaces

**File:** `src/extractors/routes.js`

**Fix three sub-issues:**

1. **Add `devise_for` parsing** — find the main parse loop and add before the `end` handler:

```javascript
// devise_for
const deviseForMatch = trimmed.match(/^\s*devise_for\s+:(\w+)(?:,\s*(.+))?/)
if (deviseForMatch) {
  if (!result.devise_routes) result.devise_routes = []
  result.devise_routes.push({
    model: deviseForMatch[1],
    options: deviseForMatch[2] || null,
  })
  continue
}
```

2. **Handle `draw_routes` custom helper** — find the existing `draw` handler and extend:

```javascript
// Current:
const drawMatch = trimmed.match(ROUTE_PATTERNS.draw)

// Replace with:
const drawMatch = trimmed.match(/^\s*(?:draw_routes|draw)\s*\(?:?(\w+)\)?/)
```

Also construct the file path to check both `config/routes/${name}.rb` and `config/routes/${name}_routes.rb`:

```javascript
if (drawMatch) {
  const drawFile = drawMatch[1]
  result.drawn_files.push(drawFile)
  const candidates = [
    `config/routes/${drawFile}.rb`,
    `config/routes/${drawFile}_routes.rb`,
  ]
  for (const path of candidates) {
    const drawContent = provider.readFile(path)
    if (drawContent) {
      parseRouteContent(drawContent, result, provider, [...namespaceStack])
      break
    }
  }
  continue
}
```

3. **Nested namespaces** — the existing `do...end` nesting logic should already handle this. Verify by writing a test with triple-nested namespaces. If it fails, the issue is that `blockStack` tracking loses count when multiple `do` keywords appear on the same line.

**Tests to write:**

```javascript
it('extracts devise_for declarations', () => {
  const content = `Rails.application.routes.draw do
  devise_for :users, controllers: { sessions: 'users/sessions' }
  devise_for :admins
end`
  const result = extractRoutes(mockProvider(content))
  expect(result.devise_routes).toHaveLength(2)
  expect(result.devise_routes[0].model).toBe('users')
})

it('parses draw_routes helper files', () => {
  const provider = {
    readFile(path) {
      if (path === 'config/routes.rb') return `Rails.application.routes.draw do
  draw_routes :admin
end`
      if (path === 'config/routes/admin_routes.rb') return `resources :users`
      if (path === 'config/routes/admin.rb') return null
      return null
    }
  }
  const result = extractRoutes(provider)
  expect(result.resources.some(r => r.name === 'users')).toBe(true)
})

it('extracts nested API namespace resources', () => {
  const content = `Rails.application.routes.draw do
  namespace :api do
    namespace :v1 do
      resources :users
      resources :posts
    end
  end
end`
  const result = extractRoutes(mockProvider(content))
  const users = result.resources.find(r => r.name === 'users')
  expect(users).toBeDefined()
  expect(users.namespace).toBe('api/v1')
})
```

---

### ISSUE-14: `Rails.cache.fetch` count reported as 0

**File:** `src/extractors/caching.js`

**Problem:** The `rbEntries` filter or the scan loop scope may incorrectly limit the search to view files only.

**Fix:** Verify the `rbEntries` filter at approximately line 55. It should be:

```javascript
const rbEntries = entries.filter(e => e.path.endsWith('.rb'))
```

If the issue is that `entries` only contains certain categories, the fix is to scan all Ruby files. The entries array comes from the scanner and should include all `.rb` files. But the `Rails.cache.fetch` regex is applied inside a loop that may have an early `continue` or conditional that skips non-view entries. Check for any such condition and remove it.

If the scan loop looks correct, the issue may be that the `railsCacheFetch` regex `new RegExp(CACHING_PATTERNS.railsCacheFetch.source, 'g')` has an issue with the global flag being shared. Ensure a new RegExp is created for each file (regex with `/g` flag is stateful — `lastIndex` must be reset):

```javascript
for (const entry of rbEntries) {
  const content = provider.readFile(entry.path)
  if (!content) continue

  // Create new regex per file to reset lastIndex
  const fetchRe = new RegExp(CACHING_PATTERNS.railsCacheFetch.source, 'g')
  while (fetchRe.exec(content)) {
    result.low_level_caching.rails_cache_fetch_count++
  }
  // ... same for stale, freshWhen, expiresIn
}
```

**Test:**

```javascript
it('counts Rails.cache.fetch in model files', () => {
  const entries = [
    { path: 'app/models/product.rb', category: 1, categoryName: 'models', type: 'ruby' },
  ]
  const provider = {
    readFile(path) {
      if (path === 'app/models/product.rb') return `
class Product < ApplicationRecord
  def cached_price
    Rails.cache.fetch("product_\#{id}_price", expires_in: 1.hour) { calculate_price }
  end
  def clear_cache
    Rails.cache.delete("product_\#{id}_price")
  end
end`
      return null
    }
  }
  const result = extractCaching(provider, entries)
  expect(result.low_level_caching.rails_cache_fetch_count).toBe(1)
})
```

---

### ISSUE-15: ActiveStorage attachments not detected

**File:** `src/extractors/storage.js`

**Problem:** The model entries filter uses `e.category === 'model'` but the scanner stores the category as a number (1), not a string.

**Fix:** Change the filter at approximately line 50:

```javascript
// Current:
const modelEntries = entries.filter(e => e.category === 'model')

// Fixed:
const modelEntries = entries.filter(e => e.category === 1 || e.categoryName === 'models')
```

**Test:**

```javascript
it('detects has_one_attached in models with numeric category', () => {
  const entries = [
    { path: 'app/models/user.rb', category: 1, categoryName: 'models', type: 'ruby' },
  ]
  const provider = {
    readFile(path) {
      if (path === 'app/models/user.rb') return `class User < ApplicationRecord
  has_one_attached :avatar
  has_many_attached :documents
end`
      return null
    }
  }
  const result = extractStorage(provider, entries, {})
  expect(result.attachments).toHaveLength(2)
  expect(result.attachments[0].name).toBe('avatar')
})
```

---

### ISSUE-06: Blast radius edge type misattribution and convention_pair file resolution

**File:** `src/core/blast-radius.js`, `src/core/indexer.js`

**Fix two sub-issues:**

1. **Edge direction** — In `buildImpactedEntities`, when building the result, include the BFS direction:

```javascript
return {
  entity: result.entity,
  type: nodeInfo?.type || 'unknown',
  risk,
  distance: result.distance,
  reachedVia: result.reachedVia,
  edgeType: result.edgeType,
  direction: result.direction || null, // 'forward' or 'reverse'
  file: reverseMap[result.entity] || null,
  reason: buildReason(result, risk),
}
```

Update `buildReason` to include direction context:

```javascript
function buildReason(result, risk) {
  if (result.distance === 0) return 'Direct change'
  const dirLabel = result.direction === 'reverse' ? ' (incoming)' : ''
  return `Reachable from ${result.reachedVia} via ${result.edgeType}${dirLabel} (distance ${result.distance})`
}
```

2. **Convention pair file resolution** — In `src/core/indexer.js`, the `buildReverseEntityFileMap` function iterates `fileEntityMap` and the last write wins. Since both controller files and view files may map to the same controller entity, ensure the controller file takes priority:

```javascript
function buildReverseEntityFileMap(fileEntityMap) {
  const reverse = {}
  for (const [path, mapping] of Object.entries(fileEntityMap)) {
    const existing = reverse[mapping.entity]
    // Prefer controller/model files over view files
    if (!existing || path.endsWith('.rb')) {
      reverse[mapping.entity] = path
    }
  }
  return reverse
}
```

---

### ISSUE-16: Custom patterns always report 0 in overview

**File:** `src/tools/handlers/get-overview.js`

**Problem:** The overview reads from `tier2.services?.length` but `tier2.design_patterns` returns an object with integer counts, not arrays.

**Fix:**

```javascript
// Current (broken):
const customPatterns = {
  services: tier2.services?.length || tier2.service_objects?.length || 0,
  concerns: Object.values(models).filter(m => m.type === 'concern').length,
  form_objects: tier2.form_objects?.length || 0,
  presenters: tier2.presenters?.length || 0,
  policies: tier3.policies?.count || 0,
}

// Fixed:
const dp = tier2.design_patterns || {}
const customPatterns = {
  services: dp.services || 0,
  concerns: Object.values(models).filter(m => m.type === 'concern').length,
  form_objects: dp.forms || 0,
  presenters: dp.presenters || 0,
  policies: (index.extractions?.authorization?.policies || []).length || 0,
}
```

---

### ISSUE-19: Model count includes concern files

**File:** `src/core/indexer.js` (`computeStatistics`)

**Fix:**

```javascript
models: Object.values(extractions.models || {}).filter(m => m.type !== 'concern' && !m.abstract).length,
```

---

### ISSUE-20: CanCan/CanCanCan detection for non-standard ability files

**File:** `src/extractors/authorization.js`

**Fix:** After the existing `app/models/ability.rb` check, add a fallback scan:

```javascript
// After checking app/models/ability.rb:
if (!result.abilities || result.abilities.length === 0) {
  // Scan all model files for CanCan::Ability
  const modelEntries = entries.filter(e => e.categoryName === 'models' || e.category === 1)
  for (const entry of modelEntries) {
    if (!/ability/i.test(entry.path)) continue
    const content = provider.readFile(entry.path)
    if (!content) continue
    if (/include\s+CanCan::Ability/.test(content) || /class\s+\w+.*<.*Ability/.test(content)) {
      if (!result.strategy) result.strategy = 'cancancan'
      // Parse abilities from this file
      const abilities = []
      const canRe = new RegExp(AUTHORIZATION_PATTERNS.canDef.source, 'gm')
      let m
      while ((m = canRe.exec(content))) {
        abilities.push({ type: 'can', definition: m[1].trim() })
      }
      if (!result.abilities) result.abilities = abilities
      else result.abilities.push(...abilities)
    }
  }
}
```

---

### Sprint 3 Verification

```bash
npm test
```

---

## Sprint 4 — Polish and Edge Cases

Fix the remaining 17 MEDIUM issues. For each one the fix is relatively small:

### ISSUE-17: Turbo stream templates not counted

**File:** `src/extractors/views.js`

Verify the turbo stream detection at line ~45. The check `path.includes('.turbo_stream.')` should work. Check whether `.turbo_stream.erb` files are classified as category 7 (views) by the scanner. If not, add a scanner rule in `src/core/scanner.js` for `app/views/**/*.turbo_stream.*`.

### ISSUE-18: cable.yml adapter parsing

**File:** `src/extractors/realtime.js`

Replace the regex-based cable.yml parser with `parseYaml()`:

```javascript
import { parseYaml } from '../utils/yaml-parser.js'

const cableYml = provider.readFile('config/cable.yml')
if (cableYml) {
  const cableConfig = parseYaml(cableYml)
  for (const [env, config] of Object.entries(cableConfig)) {
    if (config && typeof config === 'object' && config.adapter) {
      result.adapter[env] = config.adapter
    }
  }
}
```

### ISSUE-21: Callback extraction — comments and block syntax

**File:** `src/extractors/model.js`

Two fixes:

1. Before callback regex matching, strip inline comments from each line
2. After capturing method name, check for `'do'` or `'{'`:

```javascript
// In the callback extraction loop:
const cbLines = content.split('\n').map(l => l.replace(/#[^{].*$/, '').trimEnd()).join('\n')
// Use cbLines for callback matching instead of content

// After capturing:
if (method === 'do' || method === '{') method = null
```

### ISSUE-22: Form helper undercounting

**File:** `src/extractors/views.js`

Ensure the view scan iterates ALL view entries including subdirectories. The existing filter should be fine — the issue is likely that some view files in deep subdirectories are not in the `entries` array. Verify the scanner glob includes `app/views/**/*`.

### ISSUE-23: HAML/Slim not reported alongside ERB

**File:** `src/extractors/views.js` (`detectEngine`)

Change to report all engines:

```javascript
function detectEngine(entries) {
  const counts = { erb: 0, haml: 0, slim: 0 }
  for (const e of entries) {
    if (e.path.endsWith('.erb')) counts.erb++
    else if (e.path.endsWith('.haml')) counts.haml++
    else if (e.path.endsWith('.slim')) counts.slim++
  }
  const found = Object.entries(counts).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1])
  if (found.length === 0) return 'erb'
  if (found.length === 1) return found[0][0]
  return found.map(([engine, count]) => `${engine}(${count})`).join(', ')
}
```

### ISSUE-24: `overview.asset_pipeline` reports `'unknown'`

**File:** `src/tools/handlers/get-overview.js`

```javascript
asset_pipeline: v.framework?.assetPipeline || v.asset_pipeline || 'unknown',
```

### ISSUE-25: `vite_rails` not recognised as JS bundling

**File:** `src/core/version-detector.js` (`detectFramework`)

Add before the existing jsBundling checks:

```javascript
if (hasGem('vite_rails') || hasGem('vite_ruby')) jsBundling = 'vite'
else if (hasGem('webpacker')) jsBundling = 'webpacker'
// ...existing checks
```

### ISSUE-26: Blast radius synthetic test identifiers

**File:** `src/core/blast-radius.js` (`collectImpactedTests`)

Use the `reverseMap` to resolve actual file paths:

```javascript
tests.push({
  path: reverseMap[edge.from] || edge.from.replace(/^spec:/, 'spec/models/').replace(/([A-Z])/g, (m, l, i) => i === 0 ? l.toLowerCase() : `_${l.toLowerCase()}`) + '_spec.rb',
  entity: edge.from,
  covers: edge.to,
})
```

### ISSUE-27: `validates_with` not detected

**File:** `src/core/patterns/model.js`, `src/extractors/model.js`

Add to patterns:

```javascript
validatesWithValidator: /^\s*validates_with\s+(\S+)(?:,\s*(.+))?$/m,
```

In model extractor, add after the custom_validators section:

```javascript
const vwRe = new RegExp(MODEL_PATTERNS.validatesWithValidator.source, 'gm')
while ((m = vwRe.exec(content))) {
  custom_validators.push(`validates_with:${m[1]}`)
}
```

### ISSUE-28: `stream_from` greedy capture

**File:** `src/core/patterns/realtime.js`

```javascript
// Current:
streamFrom: /stream_from\s+['"]?([^'"]+)['"]?/g,

// Fixed — capture string literal or single method token:
streamFrom: /stream_from\s+(?:['"]([^'"]+)['"]|(\w+(?:\.\w+)*))/g,
```

Update the extractor to use the correct capture group.

### ISSUE-29: `before_validation` block callbacks

Already handled by ISSUE-21 fix (block syntax handling).

### ISSUE-30: Paperclip `has_attached_file`

**File:** `src/extractors/storage.js`

After the ActiveStorage attachment scan, add:

```javascript
// Paperclip attachments
for (const entry of modelEntries) {
  const content = provider.readFile(entry.path)
  if (!content) continue
  const paperclipRe = /^\s*has_attached_file\s+:(\w+)/gm
  let m
  while ((m = paperclipRe.exec(content))) {
    const className = entry.path.split('/').pop().replace('.rb', '').split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')
    result.attachments.push({ model: className, name: m[1], type: 'has_attached_file' })
  }
}
```

### ISSUE-31: `transactional_fixtures = false` parsed as true

**File:** `src/extractors/test-conventions.js`

Verify the regex checks for `= true` specifically:

```javascript
/use_transactional_fixtures\s*=\s*true/.test(railsHelper)
```

If this is correct, the bug may be that the match is happening elsewhere. Search for any other place `transactional_fixtures` is checked without the `= true` value check.

### ISSUE-32: Layout hallucination

**File:** `src/extractors/views.js`

Verify layouts are populated only from files found in `app/views/layouts/`, not inferred. The existing code at approximately line 25 checks `path.startsWith('app/views/layouts/')` which should be correct. The hallucinated `'login'` layout likely comes from the stale index (ISSUE-01). After fixing ISSUE-01, re-verify.

### ISSUE-33: `spec_style_detector` Minitest fallback

**File:** `src/utils/spec-style-detector.js`

```javascript
export function detectSpecStyle(entries) {
  const requestCount = entries.filter(e => e.path.startsWith('spec/requests/')).length
  const controllerCount = entries.filter(e => e.path.startsWith('spec/controllers/')).length

  // Guard: if no RSpec spec files exist at all, check for Minitest
  if (requestCount === 0 && controllerCount === 0) {
    const hasAnySpec = entries.some(e => e.path.startsWith('spec/') && e.path.endsWith('_spec.rb'))
    const hasAnyTest = entries.some(e => e.path.startsWith('test/') && e.path.endsWith('_test.rb'))
    if (!hasAnySpec && hasAnyTest) {
      return { primary: 'minitest', request_count: 0, controller_count: 0, has_mixed: false }
    }
    if (!hasAnySpec && !hasAnyTest) {
      return { primary: 'none', request_count: 0, controller_count: 0, has_mixed: false }
    }
  }

  return {
    primary: requestCount >= controllerCount ? 'request' : 'controller',
    request_count: requestCount,
    controller_count: controllerCount,
    has_mixed: requestCount > 0 && controllerCount > 0,
  }
}
```

### ISSUE-34: `.ruby-version` prefix stripping

**File:** `src/core/version-detector.js` (`extractRubyVersion`, approximately line 87)

```javascript
const rubyVersion = provider.readFile('.ruby-version')
if (rubyVersion) {
  const cleaned = rubyVersion.trim().replace(/^ruby-/, '')
  const ver = cleaned.match(/^(\d+\.\d+\.\d+)/)
  if (ver) return ver[1]
}
```

### ISSUE-35: Custom JWT in `lib/` not detected

**File:** `src/extractors/auth.js` (`scanForApiAuthPatterns`)

Extend the content scan to include `lib/` files:

```javascript
// Add lib files to the scan
const libEntries = entries.filter(e => e.path.startsWith('lib/') && e.path.endsWith('.rb'))
for (const entry of libEntries) {
  const c = provider.readFile(entry.path)
  if (c) contents.push(c)
}
```

If `entries` doesn't include `lib/` files, use `provider.glob('lib/**/*.rb')` directly.

### ISSUE-36: Inline rescue handlers

**File:** `src/extractors/controller.js`

After extracting actions and action_line_ranges, add a pass to detect inline rescue:

```javascript
// Inline rescue detection
const inline_rescue_handlers = []
for (const action of actions) {
  const range = action_line_ranges[action]
  if (!range) continue
  const actionLines = lines.slice(range.start - 1, range.end)
  for (const line of actionLines) {
    const rescueMatch = line.match(/^\s*rescue\s+(\w+(?:::\w+)*)/)
    if (rescueMatch) {
      inline_rescue_handlers.push({
        exception: rescueMatch[1],
        action,
        type: 'inline',
      })
    }
  }
}

// Merge into rescue_handlers
rescue_handlers.push(...inline_rescue_handlers)
```

### ISSUE-37: CarrierWave data in storage deep analysis

**File:** `src/tools/handlers/get-deep-analysis.js`

In the `storage` case:

```javascript
case 'storage': {
  const storage = extractions.storage || {}
  const uploaders = extractions.uploaders || { uploaders: {}, mounted: [] }
  return respond({
    ...storage,
    carrierwave: {
      uploaders: Object.keys(uploaders.uploaders || {}).length > 0 ? uploaders.uploaders : undefined,
      mounted: uploaders.mounted?.length > 0 ? uploaders.mounted : undefined,
    },
  })
}
```

---

### Sprint 4 Verification

```bash
npm test
```

All tests pass. Total test count should be significantly higher than baseline.

---

## Final Verification Loop

After all 4 sprints are complete:

1. **Run the full test suite:**

```bash
npm test
```

Record: X tests passing, 0 failures.

2. **Run the test suite with coverage:**

```bash
npm run test:coverage
```

Record coverage percentages for key modules.

3. **Verify no regressions in core extractors:**

```bash
npm run test:core
npm run test:extractors
npm run test:mcp
```

4. **Smoke test — index a Rails project** (if one is available in the workspace):

```bash
npx @reinteractive/rails-insight --verbose
```

Call `index_project({ force: true })` and verify the output includes the correct project root and plausible statistics.

5. **Commit the complete fix set:**

```bash
git add -A
git commit -m "fix: resolve all 37 evaluation issues from master eval report

Sprint 1: stale index, secret exposure, gemfile comments, config comments
Sprint 2: devise modules, [object Object], controller namespaces, test_framework, search_patterns, policy methods
Sprint 3: subgraph seeding, routes (devise_for/draw/nested), cache scan, ActiveStorage, blast radius, overview custom_patterns, model counts, CanCan detection
Sprint 4: turbo streams, cable.yml, callbacks, forms, HAML, asset_pipeline, vite_rails, test identifiers, validates_with, stream_from, paperclip, transactional_fixtures, layouts, spec_style, ruby-version, JWT, rescue handlers, CarrierWave storage"
```

6. **Bump the version:**

```bash
npm version patch
```

---

## Reference: Issue-to-File Quick Index

| Issue | File(s)                                                           | Sprint |
| ----- | ----------------------------------------------------------------- | ------ |
| 01    | `src/tools/handlers/index-project.js`, `src/server.js`            | 1      |
| 02    | `src/extractors/model.js`                                         | 2      |
| 03    | `src/tools/handlers/get-subgraph.js`                              | 3      |
| 04    | `src/extractors/auth.js`                                          | 1      |
| 05    | `src/core/patterns/gemfile.js`                                    | 1      |
| 06    | `src/core/blast-radius.js`, `src/core/indexer.js`                 | 3      |
| 07    | `src/tools/handlers/search-patterns.js`                           | 2      |
| 08    | `src/extractors/caching.js`, `storage.js`, `auth.js`, `config.js` | 1      |
| 09    | `src/core/blast-radius.js`                                        | 2      |
| 10    | `src/core/indexer.js`                                             | 2      |
| 11    | `src/tools/handlers/get-overview.js`                              | 2      |
| 12    | `src/core/patterns/authorization.js`                              | 2      |
| 13    | `src/extractors/routes.js`                                        | 3      |
| 14    | `src/extractors/caching.js`                                       | 3      |
| 15    | `src/extractors/storage.js`                                       | 3      |
| 16    | `src/tools/handlers/get-overview.js`                              | 3      |
| 17    | `src/extractors/views.js`                                         | 4      |
| 18    | `src/extractors/realtime.js`                                      | 4      |
| 19    | `src/core/indexer.js`                                             | 3      |
| 20    | `src/extractors/authorization.js`                                 | 3      |
| 21    | `src/extractors/model.js`                                         | 4      |
| 22    | `src/extractors/views.js`                                         | 4      |
| 23    | `src/extractors/views.js`                                         | 4      |
| 24    | `src/tools/handlers/get-overview.js`                              | 4      |
| 25    | `src/core/version-detector.js`                                    | 4      |
| 26    | `src/core/blast-radius.js`                                        | 4      |
| 27    | `src/core/patterns/model.js`, `src/extractors/model.js`           | 4      |
| 28    | `src/core/patterns/realtime.js`                                   | 4      |
| 29    | `src/extractors/model.js`                                         | 4      |
| 30    | `src/extractors/storage.js`                                       | 4      |
| 31    | `src/extractors/test-conventions.js`                              | 4      |
| 32    | `src/extractors/views.js`                                         | 4      |
| 33    | `src/utils/spec-style-detector.js`                                | 4      |
| 34    | `src/core/version-detector.js`                                    | 4      |
| 35    | `src/extractors/auth.js`                                          | 4      |
| 36    | `src/extractors/controller.js`                                    | 4      |
| 37    | `src/tools/handlers/get-deep-analysis.js`                         | 4      |
