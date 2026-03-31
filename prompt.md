# RailsInsight v1.0.16 → v1.0.17 — Fix Issues from kollaras v1.0.16 Evaluation

You are working on **RailsInsight**, a Rails-aware MCP server written in Node.js (ES modules). The codebase uses **Vitest** for testing.

## Context

This is the second evaluation against **kollaras** (Rails 7.0.8, Ruby 3.2.2, 40 controllers, 23 models excl concerns, RSpec, Rolify, Devise+OmniAuth SAML, ViewComponent, Sidekiq, Turbo, API/Backend/Dashboard namespaces). v1.0.16 scored F1=0.855 with 4 tools failing. Several of these issues were identified in v1.0.15 and fix-attempted, but the fixes either didn't land or didn't cover all edge cases. This prompt is explicit about what's still broken and why.

There are **10 issues** grouped into **8 fix tasks** across **4 sprints**. Issues 2, 3, and 4 share a single root cause (missing module-wrapping detection) and must be fixed together.

## Ground Rules

1. **Run `npm test` before starting.** Record baseline pass count.
2. **Fix one sprint at a time.** Run relevant tests after each issue within a sprint.
3. **After all fixes**, run `npm test` and confirm zero failures.
4. **Do not change the MCP tool API surface** — no new tools, no changed parameter names.
5. **Every fix must have at least one test.**
6. **Bump version** in `package.json` to `1.0.17`.
7. **Commit when done:** `fix: resolve 10 eval issues from kollaras v1.0.16 (v1.0.16 → v1.0.17)`

---

## Sprint 1 — Namespace Resolution (3 eval issues → 1 combined fix task)

This sprint fixes the **single biggest accuracy problem** in v1.0.16. Three eval issues — namespace detection (eval issue #2), model name collision (eval issue #3), and controller deduplication (eval issue #4) — share one root cause: RailsInsight does not detect `module` wrapping in Ruby files, so all entities are registered under their short class name. When two files define the same short name under different namespaces (e.g., `Contact` vs `Setups::Contact`), one silently overwrites the other.

This was attempted in v1.0.15 → v1.0.16 (fix prompt v5, Issues B and C) but the fix didn't fully land. The module wrapping detection either wasn't implemented or doesn't work.

### ISSUE A: Module wrapping detection + fully-qualified name registration for models AND controllers

**Files:** `src/extractors/model.js`, `src/extractors/controller.js`, `src/core/indexer.js`
**Severity:** CRITICAL — causes 70+ MISSING claims across get_model, get_controller, get_overview, get_blast_radius, get_domain_clusters, get_subgraph
**Eval issues covered:** #2 (controller namespace null), #3 (model name collision), #4 (controller dedup drops 8 of 40)

**Problem — what's broken:**

1. **All controllers return `namespace: null`** regardless of module wrapping. `Backend::AiTrainingController` reports as `AiTrainingController` with `namespace: null`.
2. **Model `Setups::Contact` overwrites `Contact`** in the model index. `get_model({ name: 'Contact' })` returns the wrong file (`app/models/setups/contact.rb`, 0 associations) instead of the real `Contact` model (`app/models/contact.rb`, 10+ associations). Same collision for `Offer`, `Product`.
3. **8 of 40 controllers are missing** because `EmailsController` (root) and `Webhook::V1::EmailsController` share the same short key. Only one survives.

**Root cause:**

Both extractors use `classDeclaration` regex to get the class name. For a file like:

```ruby
module Backend
  class AiTrainingController < ApplicationController
    # ...
  end
end
```

The regex matches `class AiTrainingController < ApplicationController` but ignores the wrapping `module Backend`. The extracted class name is `AiTrainingController` (unqualified). When this is used as the registry key, it collides with any other `AiTrainingController`.

**Fix — step by step:**

**Step 1: Create a shared `resolveFullyQualifiedName` utility.**

Create or add to a shared utility file (e.g., `src/utils/ruby-class-resolver.js`):

```javascript
/**
 * Resolve the fully-qualified class name from a Ruby file by detecting
 * wrapping module declarations around the class definition.
 *
 * @param {string} content — full file content
 * @param {string} shortClassName — the class name extracted by classDeclaration regex
 * @param {number} classMatchIndex — the character index where the class declaration was found
 * @returns {{ fqn: string, namespace: string|null }}
 */
export function resolveFullyQualifiedName(content, shortClassName, classMatchIndex) {
  // If class name already contains ::, it's inline-namespaced — use as-is
  if (shortClassName.includes('::')) {
    const parts = shortClassName.split('::')
    const namespace = parts.slice(0, -1).join('::')
    return { fqn: shortClassName, namespace: namespace || null }
  }

  // Scan content BEFORE the class declaration for module ... end blocks
  const preClassContent = content.slice(0, classMatchIndex)
  const lines = preClassContent.split('\n')

  // Track module nesting depth with a stack
  const moduleStack = []
  let depth = 0

  for (const line of lines) {
    const trimmed = line.trim()

    // Match module declarations (including nested like `module Api::V1`)
    const moduleMatch = trimmed.match(/^module\s+(\w+(?:::\w+)*)/)
    if (moduleMatch) {
      moduleStack.push({ name: moduleMatch[1], depth })
      depth++
      continue
    }

    // Match standalone `end` that closes a module (not inline method/block ends)
    // Heuristic: a line that is ONLY `end` (possibly with comment) closes a block
    if (/^end\b/.test(trimmed)) {
      if (depth > 0) {
        depth--
        // Remove modules at this depth
        while (moduleStack.length > 0 && moduleStack[moduleStack.length - 1].depth >= depth) {
          moduleStack.pop()
        }
      }
    }
  }

  // Remaining modules in the stack are the ones wrapping the class
  if (moduleStack.length === 0) {
    return { fqn: shortClassName, namespace: null }
  }

  // Build namespace from remaining module stack
  // Each module name might itself be nested (module Api::V1 → ['Api', 'V1'])
  const namespaceParts = moduleStack.flatMap(m => m.name.split('::'))
  const namespace = namespaceParts.join('::')
  const fqn = `${namespace}::${shortClassName}`

  return { fqn, namespace }
}
```

**Step 2: Integrate into the controller extractor.**

In `src/extractors/controller.js`, after extracting the class name via `classDeclaration`:

```javascript
import { resolveFullyQualifiedName } from '../utils/ruby-class-resolver.js'

// After classMatch:
const classMatch = content.match(CONTROLLER_PATTERNS.classDeclaration)
if (classMatch) {
  const shortName = classMatch[1]

  // Resolve FQN from module wrapping
  const { fqn, namespace } = resolveFullyQualifiedName(content, shortName, classMatch.index)

  // Use fqn as the registry key, store namespace
  result.class = fqn
  result.namespace = namespace
  // ...
}
```

**Step 3: Integrate into the model extractor.**

Same pattern in `src/extractors/model.js`:

```javascript
import { resolveFullyQualifiedName } from '../utils/ruby-class-resolver.js'

// After classMatch:
const classMatch = content.match(MODEL_PATTERNS.classDeclaration)
if (classMatch) {
  const shortName = classMatch[1]
  const { fqn, namespace } = resolveFullyQualifiedName(content, shortName, classMatch.index)

  result.class = fqn
  result.namespace = namespace
}
```

**Step 4: Ensure the indexer uses `fqn` as the registry key.**

In `src/core/indexer.js` (or wherever models/controllers are stored in the index), verify the key is `result.class` (which is now the FQN), not a path-derived short name. If there's a `pathToClassName` helper that strips namespaces — stop using it for the registry key. Keep it only as a fallback display name.

**Step 5: Update convention_pair logic.**

After FQN keys are in place, the `convention_pair` edge (linking `Email` model to `EmailsController`) should prefer the non-namespaced controller when multiple exist. In the graph builder, when creating convention_pair edges:

```javascript
// When looking up the controller for a model's convention pair:
const controllerName = `${modelName.replace(/::.*/, '')}sController` // naive pluralisation
const candidates = Object.keys(controllers).filter(k => k.endsWith(controllerName))

// Prefer the non-namespaced one (shortest FQN)
const preferred = candidates.sort((a, b) => a.split('::').length - b.split('::').length)[0]
```

**Tests:**

```javascript
// Test 1: Module wrapping produces correct FQN
import { resolveFullyQualifiedName } from '../src/utils/ruby-class-resolver.js'

describe('resolveFullyQualifiedName', () => {
  it('detects single module wrapping', () => {
    const content = `module Backend\n  class AiTrainingController < ApplicationController\n  end\nend`
    const classIndex = content.indexOf('class AiTrainingController')
    const result = resolveFullyQualifiedName(content, 'AiTrainingController', classIndex)
    expect(result.fqn).toBe('Backend::AiTrainingController')
    expect(result.namespace).toBe('Backend')
  })

  it('detects deeply nested module wrapping', () => {
    const content = `module Dashboard\n  module Settings\n    class SetupsController < ApplicationController\n    end\n  end\nend`
    const classIndex = content.indexOf('class SetupsController')
    const result = resolveFullyQualifiedName(content, 'SetupsController', classIndex)
    expect(result.fqn).toBe('Dashboard::Settings::SetupsController')
    expect(result.namespace).toBe('Dashboard::Settings')
  })

  it('detects compact module::module wrapping', () => {
    const content = `module Api::V1\n  class ProductsController < ApplicationController\n  end\nend`
    const classIndex = content.indexOf('class ProductsController')
    const result = resolveFullyQualifiedName(content, 'ProductsController', classIndex)
    expect(result.fqn).toBe('Api::V1::ProductsController')
    expect(result.namespace).toBe('Api::V1')
  })

  it('returns null namespace for unwrapped class', () => {
    const content = `class ApplicationController < ActionController::Base\nend`
    const classIndex = content.indexOf('class ApplicationController')
    const result = resolveFullyQualifiedName(content, 'ApplicationController', classIndex)
    expect(result.fqn).toBe('ApplicationController')
    expect(result.namespace).toBeNull()
  })

  it('handles inline :: namespace in class name', () => {
    const content = `class Api::V1::WidgetsController < ApplicationController\nend`
    const classIndex = content.indexOf('class Api::V1::WidgetsController')
    const result = resolveFullyQualifiedName(content, 'Api::V1::WidgetsController', classIndex)
    expect(result.fqn).toBe('Api::V1::WidgetsController')
    expect(result.namespace).toBe('Api::V1')
  })

  it('detects module wrapping for models', () => {
    const content = `module Setups\n  class Contact < Setup\n    # no associations\n  end\nend`
    const classIndex = content.indexOf('class Contact')
    const result = resolveFullyQualifiedName(content, 'Contact', classIndex)
    expect(result.fqn).toBe('Setups::Contact')
    expect(result.namespace).toBe('Setups')
  })
})

// Test 2: Controller registry keeps both namespaced and root controllers
it('does not deduplicate controllers with same short name but different namespaces', () => {
  // Mock two files: app/controllers/emails_controller.rb and
  // app/controllers/webhook/v1/emails_controller.rb
  // After extraction, both should be in the index under different keys
  // 'EmailsController' and 'Webhook::V1::EmailsController'
})

// Test 3: Model registry keeps both namespaced and root models
it('does not shadow root Contact with Setups::Contact', () => {
  // Mock two files: app/models/contact.rb (class Contact < ApplicationRecord, 10 associations)
  // and app/models/setups/contact.rb (module Setups; class Contact < Setup; end; end)
  // get_model({ name: 'Contact' }) should return the root one
  // get_model({ name: 'Setups::Contact' }) should return the namespaced one
})
```

**Verification after fix:**

- `get_controller({ name: 'AiTrainingController' })` → should return with `namespace: "Backend"`
- `get_model({ name: 'Contact' })` → should return `app/models/contact.rb` with 10+ associations
- `get_model({ name: 'Setups::Contact' })` → should return `app/models/setups/contact.rb`
- `get_deep_analysis({ category: 'controller_list' })` → should list 40 controllers, not 32
- `get_deep_analysis({ category: 'model_list' })` → should show all models without shadowing

---

## Sprint 2 — Route & Config Hallucinations (2 eval issues → 2 fix tasks)

### ISSUE B: `resources` with `only: []` still reports all 7 CRUD actions

**File:** `src/extractors/routes.js`
**Severity:** CRITICAL — 14 hallucinated route actions (7 per resource × 2 resources)
**Eval issue:** #5
**History:** This was attempted in v4 (hash rocket + %i[] syntax) and v5 (empty array guard). **The fix is not working.** Either it didn't land, or there's a code path that bypasses it.

**Problem:** `resources :emails, only: []` and `resources :history, only: []` both report `actions: ["index","show","new","create","edit","update","destroy"]`. The empty array should produce `actions: []`.

**Root cause — why the v5 fix may not have worked:**

The likely issue is that the `only:` matching regex uses `[^\]]+` (one-or-more) inside the bracket capture which requires at least one character, so `only: []` never matches and falls through to the default 7-action set. Or the match happens on the wrong portion of the line. Or the guard was added but the code path branches before reaching it.

**Debugging approach — do this FIRST before writing the fix:**

1. Find the route extractor file (likely `src/extractors/routes.js`)
2. Search for the `only` pattern regex — print it
3. Search for where `actions` is assigned its default value (the 7 CRUD actions)
4. Trace the logic: when `only:` is matched, does it actually short-circuit the default assignment?
5. Test manually with this exact input string: `resources :emails, only: [] do`

**Fix:**

After identifying the exact code path, ensure this logic applies:

```javascript
// When parsing a resources/resource declaration:
// 1. Extract the options portion (everything after the resource name, before do/end)
// 2. Check for only: pattern
const onlyMatch = optionsStr.match(/(?:only:|:only\s*=>)\s*\[([^\]]*)\]/)
if (onlyMatch) {
  const inner = (onlyMatch[1] || '').trim()
  if (inner === '') {
    // only: [] — explicitly no CRUD actions
    actions = []
  } else {
    // only: [:index, :show] or only: %i[index show]
    actions = inner.match(/\w+/g) || []
  }
}
```

**Critical detail:** The regex MUST capture `only: []` where the bracket content is empty. The previous regex `(?:\[([^\]]+)\]|%i\[([^\]]+)\]|...)` uses `[^\]]+` (one or more non-bracket chars) which requires at least one character inside the brackets. **Change `+` to `*`**: `[^\]]*` (zero or more).

**Test:**

```javascript
it('resources with only: [] produces zero actions', () => {
  const result = extractRoutes(mockProvider(`Rails.application.routes.draw do
  resources :emails, only: [] do
    member do
      post :assign_contact
    end
  end
end`))
  const emails = result.resources.find(r => r.name === 'emails')
  expect(emails).toBeDefined()
  expect(emails.actions).toEqual([])
  // Member routes should still be present
  expect(emails.member_routes).toContain('assign_contact')
})

it('resources with only: [] and hash rocket produces zero actions', () => {
  const result = extractRoutes(mockProvider(`Rails.application.routes.draw do
  resources :webhooks, :only => []
end`))
  const webhooks = result.resources.find(r => r.name === 'webhooks')
  expect(webhooks.actions).toEqual([])
})
```

---

### ISSUE C: `database.multi_db` hallucinated — YAML config keys parsed as database names

**File:** `src/extractors/database.js` or `src/analysis/overview.js`
**Severity:** CRITICAL — reports `multi_db: true, databases: ["pool", "password"]` for a single-database app
**Eval issue:** #8
**History:** This was attempted in v5 (Issue D). **The fix is not working.**

**Problem:** The multi-database detector parses `config/database.yml` and interprets YAML keys under the `default:` anchor (like `pool`, `password`, `encoding`) as database names. It reports `multi_db: true` with `databases: ["pool", "password"]`.

**Root cause:** The detector likely looks for keys under the environment block (e.g., `production:`) and treats any key that isn't a known config key as a "database name". But when a `default: &default` anchor is used, the merged keys include `pool`, `password`, `encoding`, `host`, etc. — none of which are database names.

**Debugging approach:**

1. Find the multi-db detection code
2. Print the exact logic: what makes it decide multi_db is true?
3. Is it counting keys under the environment block? Or looking for `connects_to`?

**Fix:**

Rails multi-database is configured using `connects_to` in models and named database blocks under environments:

```yaml
# Single database (NOT multi-db):
default: &default
  adapter: postgresql
  pool: 5
  password: secret

development:
  <<: *default
  database: myapp_development

# Multi-database (IS multi-db):
development:
  primary:
    <<: *default
    database: myapp_development
  replica:
    <<: *default
    database: myapp_development
    replica: true
```

The correct detection:

```javascript
function detectMultiDb(databaseYml) {
  // Multi-db requires named sub-blocks under an environment key
  // where each sub-block contains its own `database:` key
  // OR the presence of `connects_to` in any model file

  const envBlock = parsed[env] // e.g., parsed['development']
  if (!envBlock || typeof envBlock !== 'object') return { multi_db: false, databases: [] }

  // If the env block directly contains 'database' key, it's single-db
  if (envBlock.database) return { multi_db: false, databases: [] }

  // If the env block contains sub-objects that each have a 'database' key, it's multi-db
  const dbNames = Object.keys(envBlock).filter(key => {
    const sub = envBlock[key]
    return typeof sub === 'object' && sub !== null && sub.database
  })

  if (dbNames.length > 1) {
    return { multi_db: true, databases: dbNames }
  }

  return { multi_db: false, databases: [] }
}
```

**Key rule:** A YAML key is only a "database name" if it's a sub-block that itself contains a `database:` key. Keys like `pool`, `password`, `encoding`, `adapter`, `host`, `port`, `timeout`, `username`, `socket`, `reconnect` are configuration properties, not database names.

If the current code doesn't actually parse YAML and instead uses regex: add an explicit deny-list of known config keys that must never be treated as database names:

```javascript
const YAML_CONFIG_KEYS = new Set([
  'adapter', 'pool', 'timeout', 'database', 'username', 'password',
  'host', 'port', 'encoding', 'socket', 'reconnect', 'prepared_statements',
  'advisory_locks', 'schema_search_path', 'variables', 'connect_timeout',
  'read_timeout', 'write_timeout', 'checkout_timeout', 'reaping_frequency',
  'idle_timeout', 'url', 'sslmode', 'sslcert', 'sslkey', 'sslrootcert',
])

// Filter out config keys
databases = candidateKeys.filter(k => !YAML_CONFIG_KEYS.has(k))
```

**Test:**

```javascript
it('single database config does not hallucinate multi_db', () => {
  const result = extractDatabase(mockProvider({
    'config/database.yml': `
default: &default
  adapter: postgresql
  encoding: unicode
  pool: 5
  password: secret123

development:
  <<: *default
  database: kollaras_development

production:
  <<: *default
  database: kollaras_production
`
  }))
  expect(result.multi_db).toBe(false)
  expect(result.databases).toEqual([])
})

it('actual multi-db config correctly detected', () => {
  const result = extractDatabase(mockProvider({
    'config/database.yml': `
default: &default
  adapter: postgresql

development:
  primary:
    <<: *default
    database: myapp_dev
  animals:
    <<: *default
    database: myapp_animals_dev
`
  }))
  expect(result.multi_db).toBe(true)
  expect(result.databases).toContain('primary')
  expect(result.databases).toContain('animals')
})
```

---

## Sprint 3 — Missing Extractors & Wrong Globs (3 eval issues → 3 fix tasks)

### ISSUE D: Component extractor misses `component.rb` files in subdirectories

**File:** `src/extractors/component.js` (or the scanner glob that feeds it)
**Severity:** CRITICAL — 6 of 8 components missed (F1=0.25 on components)
**Eval issue:** #1
**History:** Attempted in v5 (Issue B) but the fix addressed sidecar directory recursion, not the filename pattern. The problem is that the **glob only matches `*_component.rb`** but ViewComponent supports a second naming convention: **`component.rb`** inside a namespaced directory.

**Problem:** These 6 files are completely missed:

```
app/components/offers_summary_widget/component.rb  → OffersSummaryWidget::Component
app/components/notification/component.rb           → Notification::Component
app/components/spinner/component.rb                → Spinner::Component
app/components/search/component.rb                 → Search::Component
app/components/counter_widget/component.rb         → CounterWidget::Component
app/components/modal_form/component.rb             → ModalForm::Component
```

Only these 2 are found (because they match `*_component.rb`):

```
app/components/application_component.rb            → ApplicationComponent ✓
app/components/modal_form/offer_component.rb       → OfferComponent ✓
```

**Root cause:** The component file classification rule or glob uses a pattern like `app/components/**/*_component.rb` which requires the filename to end in `_component.rb`. The ViewComponent convention also allows `component.rb` inside a namespace directory (e.g., `search/component.rb` defines `Search::Component < ViewComponent::Base`).

**Fix:**

In the scanner or component extractor, change the glob/classification to also match `component.rb`:

```javascript
// Old pattern (misses component.rb):
const isComponent = filePath.match(/app\/components\/.*_component\.rb$/)

// New pattern (matches both conventions):
const isComponent = filePath.match(/app\/components\/.*(?:_component|\/component)\.rb$/)
```

Or if using a glob:

```javascript
// Old:
'app/components/**/*_component.rb'

// New (two patterns):
'app/components/**/*_component.rb'
'app/components/**/component.rb'
```

After finding the file, the class name resolution must use ISSUE A's `resolveFullyQualifiedName` to get the correct FQN (`Search::Component`, not just `Component`).

**Test:**

```javascript
it('discovers component.rb files in subdirectories', () => {
  const files = [
    'app/components/application_component.rb',
    'app/components/search/component.rb',
    'app/components/spinner/component.rb',
    'app/components/modal_form/offer_component.rb',
  ]
  // After scan, all 4 should be classified as components
  // search/component.rb → Search::Component
  // spinner/component.rb → Spinner::Component
  // modal_form/offer_component.rb → OfferComponent (or ModalForm::OfferComponent)
})
```

---

### ISSUE E: Turbo stream templates reported as 0 — wrong file extension glob

**File:** `src/extractors/views.js` or `src/analysis/deep/views.js`
**Severity:** CRITICAL — 33 turbo stream templates exist, tool reports 0
**Eval issue:** #6

**Problem:** `get_deep_analysis({ category: 'views' })` reports `turbo_stream_templates: 0` but `find app/views -name '*.turbo_stream.erb'` returns 33 files.

**Root cause:** The glob pattern is likely looking for `*.turbo_stream.html.erb` (double extension with html) or `*.html.turbo_stream` (wrong order). In Rails 7 with Turbo, the correct filename format is:

```
action.turbo_stream.erb
```

Examples from kollaras:

```
app/views/offers/update.turbo_stream.erb
app/views/targets/update_statuses.turbo_stream.erb
app/views/contacts/show.turbo_stream.erb
```

**Fix:**

Find the turbo stream counting code and change the glob:

```javascript
// Wrong patterns (any of these would produce 0):
'**/*.turbo_stream.html.erb'
'**/*.html.turbo_stream'
'**/*.turbo_stream.html'

// Correct pattern:
'**/*.turbo_stream.erb'
// Or more broadly to also catch .turbo_stream.haml, .turbo_stream.slim:
'**/*.turbo_stream.*'
```

**Test:**

```javascript
it('counts turbo stream templates correctly', () => {
  const files = [
    'app/views/offers/update.turbo_stream.erb',
    'app/views/targets/update_statuses.turbo_stream.erb',
    'app/views/contacts/show.turbo_stream.erb',
    'app/views/contacts/index.html.erb',  // NOT a turbo stream
  ]
  const result = analyzeViews(mockProvider(files))
  expect(result.turbo_stream_templates).toBe(3)
})
```

---

### ISSUE F: Jobs deep analysis omits Sidekiq native workers and cron jobs

**File:** `src/extractors/jobs.js` or `src/analysis/deep/jobs.js`
**Severity:** HIGH — 9 workers and 2 cron jobs completely missing
**Eval issue:** #7

**Problem:** `get_deep_analysis({ category: 'jobs' })` returns only `ApplicationJob`. The 9 Sidekiq workers in `app/workers/` and 2 `Sidekiq::Cron::Job.create` definitions in initializers are all missing.

**Root cause:** The job extractor only scans for ActiveJob classes (`< ApplicationJob` or `< ActiveJob::Base`). Sidekiq native workers use a different pattern:

```ruby
# app/workers/cleanup_stuck_processing_emails_worker.rb
class CleanupStuckProcessingEmailsWorker
  include Sidekiq::Worker
  sidekiq_options queue: :low, retry: 3

  def perform
    # ...
  end
end
```

These are NOT ActiveJob subclasses — they include `Sidekiq::Worker` (or `Sidekiq::Job` in newer versions) as a module.

Cron jobs are defined in initializers:

```ruby
# config/initializers/sidekiq.rb
Sidekiq::Cron::Job.create(
  name: 'cleanup_emails - every hour',
  cron: '0 * * * *',
  class: 'CleanupStuckProcessingEmailsWorker'
)
```

**Fix — Part 1: Scan `app/workers/` for Sidekiq workers:**

```javascript
// Add to the job extractor:
// 1. Glob app/workers/**/*.rb
// 2. For each file, check for `include Sidekiq::Worker` or `include Sidekiq::Job`
// 3. Extract class name, sidekiq_options (queue, retry), perform method arity

const SIDEKIQ_PATTERNS = {
  includeWorker: /include\s+Sidekiq::(?:Worker|Job)/,
  sidekiqOptions: /sidekiq_options\s+(.+)/,
  queueOption: /queue:\s*[:'"](\w+)/,
  retryOption: /retry:\s*(\w+)/,
}

for (const file of workerFiles) {
  const content = provider.readFile(file)
  if (SIDEKIQ_PATTERNS.includeWorker.test(content)) {
    const classMatch = content.match(/class\s+(\w+)/)
    const optionsMatch = content.match(SIDEKIQ_PATTERNS.sidekiqOptions)
    const queue = optionsMatch ? (content.match(SIDEKIQ_PATTERNS.queueOption)?.[1] || 'default') : 'default'
    const retry_ = optionsMatch ? content.match(SIDEKIQ_PATTERNS.retryOption)?.[1] : null

    jobs.push({
      class: classMatch?.[1],
      file,
      type: 'sidekiq_worker',
      queue,
      retry: retry_,
    })
  }
}
```

**Fix — Part 2: Scan initializers for `Sidekiq::Cron::Job.create`:**

```javascript
// Scan config/initializers/*.rb for cron job definitions
const CRON_PATTERN = /Sidekiq::Cron::Job\.create\s*\(\s*\n?\s*name:\s*['"]([^'"]+)['"]\s*,\s*\n?\s*cron:\s*['"]([^'"]+)['"]\s*,\s*\n?\s*class:\s*['"]([^'"]+)['"]/g

const initializerFiles = provider.glob('config/initializers/*.rb')
for (const file of initializerFiles) {
  const content = provider.readFile(file)
  let cronMatch
  while ((cronMatch = CRON_PATTERN.exec(content))) {
    recurringJobs.push({
      name: cronMatch[1],
      cron: cronMatch[2],
      class: cronMatch[3],
    })
  }
}
```

Also ensure the `queues_detected` list includes queues from Sidekiq workers, not just ActiveJob.

**Test:**

```javascript
it('extracts Sidekiq native workers from app/workers/', () => {
  const result = extractJobs(mockProvider({
    'app/workers/cleanup_worker.rb': `
class CleanupWorker
  include Sidekiq::Worker
  sidekiq_options queue: :low, retry: 3

  def perform
  end
end`,
  }))
  const worker = result.jobs.find(j => j.class === 'CleanupWorker')
  expect(worker).toBeDefined()
  expect(worker.type).toBe('sidekiq_worker')
  expect(worker.queue).toBe('low')
})

it('extracts Sidekiq::Cron::Job definitions from initializers', () => {
  const result = extractJobs(mockProvider({
    'config/initializers/sidekiq.rb': `
Sidekiq::Cron::Job.create(
  name: 'cleanup - hourly',
  cron: '0 * * * *',
  class: 'CleanupWorker'
)`,
  }))
  expect(result.recurring_jobs).toHaveLength(1)
  expect(result.recurring_jobs[0].name).toBe('cleanup - hourly')
  expect(result.recurring_jobs[0].cron).toBe('0 * * * *')
  expect(result.recurring_jobs[0].class).toBe('CleanupWorker')
})
```

---

## Sprint 4 — Parser Accuracy (2 eval issues → 2 fix tasks)

### ISSUE G: Devise `:saml` included as module instead of omniauth provider

**File:** `src/extractors/model.js` — devise module parser
**Severity:** HIGH — misleads AI agents about auth configuration
**Eval issue:** #9
**History:** Attempted in v5 (not a separate issue, related to devise over-capture fixes). Still broken.

**Problem:** `get_model({ name: 'User' })` returns `devise_modules: [..., "omniauthable", "saml"]`. The `saml` is not a Devise module — it's the value of the `omniauth_providers:` keyword argument:

```ruby
devise :database_authenticatable, :registerable, :recoverable,
       :rememberable, :validatable, :omniauthable,
       omniauth_providers: [:saml]
```

**Root cause:** The devise module extraction regex collects ALL `:symbol` tokens after `devise` on the same logical statement, including keyword argument values. It does not stop at keyword arguments (tokens matching `\w+:`).

**Fix:**

The devise parser should stop collecting module names when it encounters a keyword argument:

```javascript
// Parse the devise call
const deviseMatch = content.match(/devise\s+([\s\S]*?)(?:\n\s*\n|\n\s*(?:validates|has_|belongs_|scope|enum|include|extend|def\s))/m)
if (deviseMatch) {
  const deviseArgs = deviseMatch[1]

  // Better approach: split the devise args at the first keyword argument
  const keywordSplit = deviseArgs.split(/\b(\w+):\s*/)
  const modulesPart = keywordSplit[0]  // Everything before first keyword
  const modules = (modulesPart.match(/:(\w+)/g) || []).map(m => m.slice(1))

  // Extract omniauth_providers separately
  const providerMatch = deviseArgs.match(/omniauth_providers:\s*\[([^\]]*)\]/)
  let omniauth_providers = []
  if (providerMatch) {
    omniauth_providers = (providerMatch[1].match(/:(\w+)/g) || []).map(m => m.slice(1))
  }
}
```

The key logic: after encountering a token that ends with `:` (like `omniauth_providers:`), stop adding to the modules list. Everything after a keyword arg is a value, not a module name.

**Test:**

```javascript
it('does not include omniauth provider as devise module', () => {
  const result = extractModel(mockProvider(`
class User < ApplicationRecord
  devise :database_authenticatable, :registerable, :recoverable,
         :rememberable, :validatable, :omniauthable,
         omniauth_providers: [:saml]
end`))
  expect(result.devise_modules).toContain('omniauthable')
  expect(result.devise_modules).not.toContain('saml')
})

it('extracts omniauth providers separately', () => {
  const result = extractModel(mockProvider(`
class User < ApplicationRecord
  devise :database_authenticatable, :omniauthable,
         omniauth_providers: [:google_oauth2, :saml]
end`))
  expect(result.devise_modules).not.toContain('google_oauth2')
  expect(result.devise_modules).not.toContain('saml')
  // If there's an omniauth_providers field:
  // expect(result.omniauth_providers).toEqual(['google_oauth2', 'saml'])
})
```

---

### ISSUE H: Component render counter undercounts namespaced ViewComponent renders

**File:** `src/analysis/deep/views.js`
**Severity:** MEDIUM — reports 8 renders, actual is 34
**Eval issue:** #10

**Problem:** The component render counter misses namespaced component renders like:

```erb
<%= render Search::Component.new(query: @query) %>
<%= render ModalForm::Component.new(offer: @offer) %>
<%= render CounterWidget::Component.new(count: 5) %>
```

It only catches simple renders like:

```erb
<%= render OfferComponent.new(...) %>
```

**Root cause:** The render counting regex likely uses `/render\s+(\w+Component)\b/` or similar, which doesn't handle `::` in the class name. Also, the namespaced convention (`Search::Component` vs `SearchComponent`) uses `Component` as the class name, which the regex won't match because it expects the name to END in `Component` after word characters.

**Fix:**

Update the component render regex to handle both conventions:

```javascript
// Old (misses namespaced):
const COMPONENT_RENDER = /render\s+(\w+Component)\b/g

// New (handles both conventions):
const COMPONENT_RENDER = /render\s*\(?\s*((?:[A-Z]\w*::)*(?:[A-Z]\w*Component|Component))(?:\.(?:new|with_collection|with_content))/g
```

This matches:

- `render OfferComponent.new(...)` → `OfferComponent` ✓
- `render Search::Component.new(...)` → `Search::Component` ✓
- `render ModalForm::Component.new(...)` → `ModalForm::Component` ✓
- `render CounterWidget::Component.new(...)` → `CounterWidget::Component` ✓
- `render(Search::Component.new(...))` → `Search::Component` ✓ (parenthesised form)

Also handles `with_collection` and `with_content` class methods:

```ruby
render Search::Component.with_collection(@results)
```

**Test:**

```javascript
it('counts namespaced ViewComponent renders', () => {
  const viewContent = `
<%= render Search::Component.new(query: @query) %>
<%= render ModalForm::Component.new(offer: @offer) %>
<%= render OfferComponent.new(offer: @offer) %>
<%= render CounterWidget::Component.new(count: 5) %>
<%= render partial: "shared/header" %>
`
  // Should count 4 component renders (not the partial)
  const result = countComponentRenders([viewContent])
  expect(result).toBe(4)
})
```

---

## Summary

| Sprint | Issue | Severity | Eval #     | What's Fixed                                                                                                             |
| ------ | ----- | -------- | ---------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1      | A     | CRITICAL | #2, #3, #4 | Module wrapping detection → FQN keys for models & controllers. Fixes namespace: null, model shadowing, controller dedup. |
| 2      | B     | CRITICAL | #5         | `only: []` empty array → zero actions (regex `+` → `*`)                                                                  |
| 2      | C     | CRITICAL | #8         | Multi-DB hallucination → deny-list config keys or check for `database:` sub-key                                          |
| 3      | D     | CRITICAL | #1         | Component glob matches `component.rb` not just `*_component.rb`                                                          |
| 3      | E     | CRITICAL | #6         | Turbo stream glob: `*.turbo_stream.erb` not `*.turbo_stream.html.erb`                                                    |
| 3      | F     | HIGH     | #7         | Sidekiq workers from `app/workers/` + cron jobs from initializers                                                        |
| 4      | G     | HIGH     | #9         | Devise parser stops at keyword args — `:saml` is provider not module                                                     |
| 4      | H     | MEDIUM   | #10        | Component render regex handles `Namespace::Component.new(...)`                                                           |

**After all fixes:** Run `npm test`, confirm zero failures, then re-eval kollaras with the eval protocol to confirm improvements.
