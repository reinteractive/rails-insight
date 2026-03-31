# RailsInsight v1.0.15 → v1.0.16 — Fix Issues from kollaras-ai Evaluation

You are working on **RailsInsight**, a Rails-aware MCP server written in Node.js (ES modules). The codebase uses **Vitest** for testing.

## Context

The first evaluation against a completely new application — kollaras-ai (Rails 7.0.8, Ruby 3.2.2, 40 controllers, RSpec, Rolify, Devise, ViewComponent, API namespaces) — scored F1=0.912. This is a solid generalisation result from fixes developed against a different app (ellas-list, Rails 6.1). There are 10 genuine issues to fix. One reported issue (#8, blast_radius parameter error) was an evaluator mistake, not a RailsInsight bug — skip it.

## Ground Rules

1. **Run `npm test` before starting.** Record baseline.
2. **Fix one issue at a time.** Run relevant tests after each.
3. **After all fixes**, run `npm test` and confirm zero failures.
4. **Do not change the MCP tool API surface.**
5. **Every fix must have at least one test.**
6. **Commit when done:** `fix: resolve 10 eval issues from kollaras-ai (v1.0.15 → v1.0.16)`

---

## ISSUE A: `auth_relevance` heuristic hallucinates "domain model" for Rolify Role model

**File:** `src/tools/handlers/get-model.js`
**Severity:** HIGH

**Problem:** The `get_model` handler has a hardcoded heuristic that assumes any model named `Role` is a domain model for job positions and not related to access control. In this project, `Role` is a Rolify RBAC model — the heuristic produces a factually wrong `auth_relevance` field that would actively mislead an AI agent.

**Root cause:** In `src/tools/handlers/get-model.js`, approximately line 55:

```javascript
if (/^role$/i.test(name) && authzData.roles?.model && authzData.roles.model !== name) {
  auth_relevance = `none — this is a domain model for job positions, not related to access control...`
}
```

This fires whenever the model is named `Role` and the authorization roles are attributed to a different model. But it assumes `Role` is never an auth model — which is wrong for Rolify, where the `Role` model IS the RBAC model.

**Fix:** Remove this hardcoded heuristic entirely, or make it aware of Rolify. The safest fix:

```javascript
// Only add auth_relevance disambiguation if the Role model does NOT
// include Rolify patterns and does NOT have a roles table in schema
let auth_relevance = undefined
if (/^role$/i.test(name)) {
  const roleModel = model
  const isRolifyRole = roleModel.superclass === 'ApplicationRecord' && (
    // Check if this model is referenced by rolify
    (roleModel.associations || []).some(a => a.name === 'users_and_roles' || a.name === 'resource') ||
    // Check if the roles table has resource_type/resource_id columns (polymorphic — Rolify pattern)
    (columns && columns.some(c => c.name === 'resource_type' || c.name === 'resource_id'))
  )

  if (isRolifyRole) {
    auth_relevance = 'Rolify RBAC model — this IS the authorization role model'
  } else if (authzData.roles?.model && authzData.roles.model !== name) {
    // Only claim it's a domain model if we're confident it's not auth-related
    auth_relevance = `Potentially a domain model — authorization roles are defined on ${authzData.roles.model}`
  }
}
```

The key change: check for Rolify's telltale schema pattern (polymorphic `resource_type`/`resource_id` columns) before claiming the model is unrelated to auth.

**Test:**

```javascript
it('does not hallucinate "domain model" for Rolify Role model', () => {
  const state = {
    index: {
      extractions: {
        models: {
          Role: {
            class: 'Role',
            file: 'app/models/role.rb',
            superclass: 'ApplicationRecord',
            associations: [
              { type: 'has_and_belongs_to_many', name: 'users' },
              { type: 'belongs_to', name: 'resource', options: 'polymorphic: true' },
            ],
            scopes: [], callbacks: [], validations: [],
          },
        },
        schema: {
          tables: [{
            name: 'roles',
            columns: [
              { name: 'name', type: 'string' },
              { name: 'resource_type', type: 'string' },
              { name: 'resource_id', type: 'bigint' },
            ],
            indexes: [],
          }],
          foreign_keys: [],
        },
        authorization: { roles: { model: 'User', source: 'rolify' } },
      },
    },
  }
  // Call get_model handler with name: 'Role'
  // Verify auth_relevance does NOT contain "domain model" or "job positions"
  // Verify auth_relevance mentions Rolify or RBAC
})
```

---

## ISSUE B: Component count undercounts nested/sidecar components

**File:** `src/core/scanner.js` (component glob pattern)
**Severity:** MEDIUM

**Problem:** The tool reports 2 components but 8 exist. ViewComponent sidecar files in nested directories (e.g., `app/components/counter_widget/counter_widget_component.rb`) are missed. Only top-level component files directly under `app/components/` are found.

**Root cause:** The scanner glob for components may not recurse into subdirectories, or the classification rule requires the file to match a specific pattern that excludes nested paths.

Check the component rule in `src/core/scanner.js`:

```javascript
{ test: (p) => /^app\/components\/.*\.(rb|html\.\w+)$/.test(p), category: 5 },
```

This regex should match nested paths. The issue is likely in the glob — check that `provider.glob('app/**/*.rb')` actually returns files from `app/components/counter_widget/`. The `SKIP_DIRS` set in `src/providers/local-fs.js` should not contain `components`.

**Fix:** Verify the glob returns component files from nested directories. If it does, the issue may be in `computeStatistics` — it might count from `extractions.components` which only includes successfully extracted components, not all classified component files. Check if the component extractor (`src/extractors/component.js`) requires a `class ... < ViewComponent::Base` declaration and fails for components with different superclasses.

Add a broader component class pattern:

```javascript
// In src/core/patterns/component.js:
classDeclaration: /class\s+(\w+(?:::\w+)*Component)\s*<\s*(\w+(?:::\w+)*)/,
```

This already matches any superclass. But sidecar component directories contain multiple files — `.rb`, `.html.erb`, `.css`, `.js`. Ensure the scanner counts the `.rb` files, not the templates. Add a diagnostic log if verbose mode is on.

**Test:**

```javascript
it('counts components in nested sidecar directories', () => {
  const provider = {
    glob(pattern) {
      if (pattern === 'app/**/*.rb') return [
        'app/components/alert_component.rb',
        'app/components/counter_widget/counter_widget_component.rb',
        'app/components/dashboard/stats_component.rb',
      ]
      return []
    },
    // ... other methods
  }
  // Run scanStructure, verify 3 entries with categoryName 'components'
})
```

---

## ISSUE C: Controller count undercounts namespaced controllers (32 vs 40)

**File:** `src/core/indexer.js`, `src/core/scanner.js`
**Severity:** MEDIUM

**Problem:** 40 controller files exist but only 32 are reported. Controllers in `api/`, `backend/`, `dashboard/`, `users/`, `webhook/` subdirectories are being missed or deduplicated.

This is the same class of issue as the original ISSUE-10 (controller namespace deduplication). The previous fix used `ctrl.class` as the key instead of `pathToClassName`, but the controller extractor may fail to extract the full qualified class name for controllers that use `module` wrapping instead of inline `::` namespacing.

**Root cause:** Check controllers that use this pattern:

```ruby
module Backend
  class AiTrainingController < ApplicationController
  end
end
```

The `CONTROLLER_PATTERNS.classDeclaration` regex matches `class AiTrainingController < ApplicationController` but does NOT capture the wrapping `module Backend`. So `ctrl.class` returns `AiTrainingController` (unqualified), causing collision with any top-level controller of the same name.

**Fix:** In `src/extractors/controller.js`, after extracting the class name from `classDeclaration`, scan backwards through the file for enclosing `module` declarations:

```javascript
// After classMatch extraction:
let className = classMatch ? classMatch[1] : null

// If class name doesn't contain ::, check for wrapping module declarations
if (className && !className.includes('::')) {
  const moduleStack = []
  const preClassContent = content.slice(0, classMatch.index)
  const moduleRe = /^\s*module\s+(\w+(?:::\w+)*)/gm
  let mm
  while ((mm = moduleRe.exec(preClassContent))) {
    moduleStack.push(mm[1])
  }
  // Check that module isn't closed before the class
  // Simple heuristic: count module opens vs end keywords before class
  const preLines = preClassContent.split('\n')
  let moduleDepth = 0
  const activeModules = []
  for (const line of preLines) {
    const modMatch = line.match(/^\s*module\s+(\w+(?:::\w+)*)/)
    if (modMatch) {
      moduleDepth++
      activeModules.push(modMatch[1])
    }
    if (/^\s*end\b/.test(line) && moduleDepth > 0) {
      moduleDepth--
      activeModules.pop()
    }
  }
  if (activeModules.length > 0) {
    className = activeModules.join('::') + '::' + className
  }
}
```

Also ensure the namespace field is set from the same module stack:

```javascript
let namespace = null
if (className && className.includes('::')) {
  const parts = className.split('::')
  parts.pop()
  namespace = parts.join('/').toLowerCase()
}
```

**Test:**

```javascript
it('extracts fully qualified class name from module-wrapped controller', () => {
  const content = `module Backend
  class AiTrainingController < ApplicationController
    def index
    end
  end
end`
  const result = extractController(mockProvider(content), 'app/controllers/backend/ai_training_controller.rb')
  expect(result.class).toBe('Backend::AiTrainingController')
  expect(result.namespace).toBe('backend')
})

it('handles deeply nested module wrapping', () => {
  const content = `module Api
  module V1
    class UsersController < ApplicationController
      def index; end
    end
  end
end`
  const result = extractController(mockProvider(content), 'app/controllers/api/v1/users_controller.rb')
  expect(result.class).toBe('Api::V1::UsersController')
  expect(result.namespace).toBe('api/v1')
})
```

---

## ISSUE D: Multi-DB detection hallucinates config keys as database names

**File:** `src/extractors/config.js` or `src/core/version-detector.js`
**Severity:** MEDIUM

**Problem:** `get_overview` returns `database.databases: ['pool', 'password']`. These are YAML config keys (`pool: 5`, `password: secret`), not database names. The multi-DB detection logic parses nested YAML keys under the production section as sub-database names.

**Root cause:** In `src/extractors/config.js`, the multi-DB detection checks:

```javascript
const prodSection = parsed.production || {}
const prodKeys = Object.keys(prodSection)
const subDbs = prodKeys.filter(k => typeof prodSection[k] === 'object' && prodSection[k] !== null)
if (subDbs.length > 1) {
  result.database.multi_db = true
  result.database.databases = subDbs
}
```

This treats ANY nested object under `production:` as a sub-database. But standard config keys like `pool: 5` are scalar (not objects), so they shouldn't match. The issue is that the YAML parser may be returning some scalar values as objects, OR the actual YAML has nested sections that aren't databases.

Check what `parsed.production` actually looks like. In a standard `database.yml`:

```yaml
production:
  adapter: postgresql
  pool: 5
  password: <%= ENV['DB_PASSWORD'] %>
```

After ERB tag stripping, `password` might become an empty string or null, and the YAML parser might represent it as an object.

**Fix:** The multi-DB detection needs a stronger signal than "has nested objects". Real multi-DB configs look like:

```yaml
production:
  primary:
    adapter: postgresql
    database: myapp_production
  secondary:
    adapter: postgresql
    database: myapp_secondary
```

The key difference: real sub-databases have an `adapter` key. Check for that:

```javascript
const prodSection = parsed.production || {}
const prodKeys = Object.keys(prodSection)
const subDbs = prodKeys.filter(k => {
  const val = prodSection[k]
  return typeof val === 'object' && val !== null && val.adapter
})
if (subDbs.length > 1) {
  result.database.multi_db = true
  result.database.databases = subDbs
}
```

By requiring `val.adapter`, we only detect actual database configurations, not stray config keys.

**Test:**

```javascript
it('does not report pool/password as database names in single-DB config', () => {
  const provider = {
    readFile(path) {
      if (path === 'config/database.yml') return `production:
  adapter: postgresql
  database: kollaras_production
  pool: 5
  username: app
  password: secret`
      return null
    }
  }
  const result = extractConfig(provider)
  expect(result.database.multi_db).toBeFalsy()
  expect(result.database.databases).toBeUndefined()
  expect(result.database.adapter).toBe('postgresql')
})

it('correctly detects multi-DB when sub-sections have adapter keys', () => {
  const provider = {
    readFile(path) {
      if (path === 'config/database.yml') return `production:
  primary:
    adapter: postgresql
    database: app_primary
  secondary:
    adapter: postgresql
    database: app_secondary`
      return null
    }
  }
  const result = extractConfig(provider)
  expect(result.database.multi_db).toBe(true)
  expect(result.database.databases).toEqual(['primary', 'secondary'])
})
```

---

## ISSUE E: `resources :emails, only: []` still reports all 7 CRUD actions

**File:** `src/extractors/routes.js`
**Severity:** HIGH — this is a regression from the v4 `:only`/`:except` fix

**Problem:** `resources :emails, only: []` defines a resource with NO standard CRUD actions (used as a namespace for custom member/collection routes). The tool reports all 7 actions. The v4 fix correctly handles `only: [:index, :show]` but not `only: []` (empty array).

**Root cause:** The `:only` matching regex captures the content inside brackets. For `only: []`, the capture group is an empty string. The `raw.match(/\w+/g)` call on an empty string returns `null`, and the fallback logic likely defaults to the full 7-action set instead of an empty array.

**Fix:** In `src/extractors/routes.js`, in the `:only` processing block, add an explicit check for empty arrays:

```javascript
const onlyMatch = options.match(ROUTE_PATTERNS.only)
if (onlyMatch) {
  const raw = onlyMatch[1] || onlyMatch[2] || onlyMatch[3] || (onlyMatch[4] ? `:${onlyMatch[4]}` : '')
  if (raw.trim() === '') {
    // only: [] — explicitly no actions
    actions = []
  } else {
    actions = raw.match(/\w+/g)?.filter(a => !['true', 'false'].includes(a)) || []
  }
}
```

The key addition is the `if (raw.trim() === '')` guard that returns an empty actions array instead of falling through.

**Test:**

```javascript
it('resources with only: [] produces zero actions', () => {
  const result = extractRoutes(mockProvider(`Rails.application.routes.draw do
  resources :emails, only: [] do
    member do
      post :deliver
    end
  end
end`))
  const emails = result.resources.find(r => r.name === 'emails')
  expect(emails).toBeDefined()
  expect(emails.actions).toEqual([])
  expect(emails.member_routes).toContain('deliver')
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

## ISSUE F: Email subgraph returns zero entities

**File:** `src/tools/handlers/get-subgraph.js`
**Severity:** MEDIUM

**Problem:** `get_subgraph({ skill: 'email' })` returns empty entities despite `Email` model, `EmailsController`, email specs, and email factories all existing.

**Root cause:** The email skill seeding in `get-subgraph.js` looks for mailer classes from `extractions.email.mailers`. If the app doesn't use ActionMailer (no `app/mailers/` files) but has an `Email` model and controller for managing email records, the seeding finds nothing.

**Fix:** Expand the email skill seeding to also include models and controllers with "email" or "mail" in their name:

```javascript
case 'email': {
  // Mailer classes
  const mailers = extractions.email?.mailers || []
  for (const mailer of mailers) {
    if (mailer.class) seeds.add(mailer.class)
  }
  // Mailbox classes
  if (extractions.email?.mailbox?.mailboxes) {
    for (const mb of extractions.email.mailbox.mailboxes) {
      seeds.add(mb)
    }
  }
  // Models and controllers with email/mail in the name
  for (const [name] of Object.entries(models)) {
    if (/email|mail/i.test(name)) seeds.add(name)
  }
  for (const [name] of Object.entries(controllers)) {
    if (/email|mail/i.test(name)) seeds.add(name)
  }
  break
}
```

**Test:**

```javascript
it('email subgraph includes Email model and EmailsController', () => {
  const index = {
    extractions: {
      models: { Email: { file: 'app/models/email.rb', associations: [] } },
      controllers: { EmailsController: { file: 'app/controllers/emails_controller.rb', actions: ['index'] } },
      email: { mailers: [] },
    },
    relationships: [],
    rankings: { Email: 0.05, EmailsController: 0.03 },
    graph: { nodes: new Map(), bfsFromSeeds: () => [] },
  }
  // Call get_subgraph with skill: 'email'
  // Verify Email and EmailsController appear in entities
})
```

---

## ISSUE G: `after_save_commit` and other compound commit callbacks not extracted

**File:** `src/core/patterns/model.js` (callback pattern)
**Severity:** MEDIUM

**Problem:** The callback regex matches `after_commit` but not the compound forms added in Rails 5+: `after_save_commit`, `after_create_commit`, `after_update_commit`, `after_destroy_commit`. The User model has `after_save_commit :unassign_role!, :assign_role!` which is not captured.

**Root cause:** The callback pattern in `src/core/patterns/model.js`:

```javascript
callbackType: /^\s*((?:before|after|around)_(?:save|create|update|destroy|validation|commit|rollback|initialize|find|touch))\s+:?(\w+)(?:,\s*(.+))?$/m
```

This matches `after_commit` but NOT `after_save_commit` because the pattern requires `(before|after|around)_` followed by exactly one of the listed words. `save_commit` is not in the list.

**Fix:** Add the compound commit callback types to the pattern. The cleanest approach is to add them as explicit alternatives:

```javascript
callbackType: /^\s*((?:before|after|around)_(?:save|create|update|destroy|validation|commit|rollback|initialize|find|touch|save_commit|create_commit|update_commit|destroy_commit))\s+:?(\w+!?)(?:,\s*(.+))?$/m
```

Note the `!?` after `\w+` — callback methods like `:assign_role!` have a bang that needs to be captured.

Also update the corresponding `callback` pattern if it exists separately:

```javascript
callback: /^\s*(?:before|after|around)_(?:save|create|update|destroy|validation|commit|rollback|initialize|find|touch|save_commit|create_commit|update_commit|destroy_commit)\s+:?(\w+!?)(?:,\s*(.+))?$/m
```

Additionally, this callback has **multiple method symbols** on one line: `after_save_commit :unassign_role!, :assign_role!`. The same multi-method expansion from ISSUE I of the v3 prompt applies here. After extracting the first method, check if the remaining content has additional `:symbol` tokens and create separate callback entries for each.

**Test:**

```javascript
it('extracts after_save_commit callbacks', () => {
  const content = `class User < ApplicationRecord
  after_save_commit :unassign_role!, :assign_role!
  after_create_commit :send_welcome
  after_destroy_commit :cleanup_data
end`
  const result = extractModel(mockProvider(content), 'app/models/user.rb', 'User')
  const commitCallbacks = result.callbacks.filter(c => c.type.includes('commit'))
  expect(commitCallbacks.length).toBeGreaterThanOrEqual(4)
  expect(commitCallbacks.some(c => c.type === 'after_save_commit' && c.method === 'unassign_role!')).toBe(true)
  expect(commitCallbacks.some(c => c.type === 'after_save_commit' && c.method === 'assign_role!')).toBe(true)
  expect(commitCallbacks.some(c => c.type === 'after_create_commit' && c.method === 'send_welcome')).toBe(true)
  expect(commitCallbacks.some(c => c.type === 'after_destroy_commit' && c.method === 'cleanup_data')).toBe(true)
})
```

---

## ISSUE H: Filter options value truncated — `only: [` with no content

**File:** `src/extractors/controller.js` (filter extraction)
**Severity:** MEDIUM

**Problem:** The `TargetsController` has a `before_action :target_query_params` filter with options `only: [:index, :show, ...]` but the tool reports options as `only: [` — truncated mid-array. The options capture group in the filter regex appears to stop at the end of the line, but multi-line options continue on the next line.

**Root cause:** The filter regex in `src/core/patterns/controller.js`:

```javascript
filterType: /^\s*((?:before|after|around|skip_before|skip_after|skip_around)_action)\s+:?(\w+!?)(?:,\s*(.+))?$/m
```

The `(.+)?$` captures everything to end of line. But if the options span multiple lines:

```ruby
before_action :target_query_params, only: [
  :index, :show, :edit, :update
]
```

Only `only: [` is captured (first line), the continuation is lost.

**Fix:** After capturing the filter, check if the options string contains an unclosed bracket. If so, read continuation lines:

```javascript
// After filter extraction:
for (const filter of filters) {
  if (filter.options && filter.options.includes('[') && !filter.options.includes(']')) {
    // Options has unclosed bracket — find the closing bracket in subsequent lines
    const filterLineIdx = lines.findIndex(l => l.includes(filter.method) && l.includes(filter.options))
    if (filterLineIdx >= 0) {
      let fullOptions = filter.options
      for (let j = filterLineIdx + 1; j < lines.length; j++) {
        fullOptions += ' ' + lines[j].trim()
        if (lines[j].includes(']')) break
      }
      filter.options = fullOptions.replace(/\s+/g, ' ').trim()
    }
  }
}
```

Alternatively, use the same `joinContinuationLines` approach from the model extractor — pre-process the content to join lines where a `[` is opened but not closed on the same line.

**Test:**

```javascript
it('captures multi-line filter options with continuation', () => {
  const content = `class TargetsController < ApplicationController
  before_action :target_query_params, only: [
    :index, :show, :edit, :update
  ]
  before_action :authenticate!
end`
  const result = extractController(mockProvider(content), 'app/controllers/targets_controller.rb')
  const tqp = result.filters.find(f => f.method === 'target_query_params')
  expect(tqp.options).toContain('index')
  expect(tqp.options).toContain('update')
  expect(tqp.options).toContain(']')
})
```

---

## ISSUE I: Convention pair resolves to webhook controller instead of primary controller

**File:** `src/core/indexer.js` (`buildReverseEntityFileMap` or `buildFileEntityMap`)
**Severity:** LOW

**Problem:** When multiple controllers map to the same entity name (e.g., `EmailsController` at `app/controllers/emails_controller.rb` and `Webhook::V1::EmailsController` at `app/controllers/webhook/v1/emails_controller.rb`), the reverse map may pick the wrong one. The review context then reports the webhook variant as the file for the `EmailsController` entity.

**Root cause:** After fixing ISSUE C (full namespace extraction), `Webhook::V1::EmailsController` and `EmailsController` should be different keys. But the `convention_pair` edge in the graph connects the `Email` model to `EmailsController` (singular convention), and if the graph has an edge to the wrong controller, the resolution follows.

**Fix:** The convention_pair builder in `src/core/graph.js` does:

```javascript
const modelName = name.replace(/Controller$/, '').replace(/s$/, '')
```

This strips the namespace. `Webhook::V1::EmailsController` → strip `Controller` → `Webhook::V1::Emails` → strip trailing `s` → `Webhook::V1::Email`. Then it checks if `models[modelName]` exists — it won't, because the model is just `Email`.

After fixing ISSUE C so that controllers have their full namespaced names, the convention_pair logic should prefer the non-namespaced controller. Add a preference:

```javascript
// Convention: PostsController → Post model
// For namespaced controllers, only create convention_pair if no un-namespaced controller exists
if (extractions.controllers) {
  // First pass: collect all base controller names (without namespace)
  const baseControllerNames = new Set()
  for (const name of Object.keys(extractions.controllers)) {
    const baseName = name.split('::').pop()
    baseControllerNames.add(baseName)
  }

  for (const [name, ctrl] of Object.entries(extractions.controllers)) {
    graph.addNode(name, 'controller', name)
    const baseName = name.split('::').pop()
    const modelName = baseName.replace(/Controller$/, '').replace(/s$/, '')

    // Skip convention_pair for namespaced controllers if an un-namespaced version exists
    if (name.includes('::') && baseControllerNames.has(baseName) &&
        extractions.controllers[baseName]) {
      continue // Let the un-namespaced controller own the convention_pair
    }

    if (extractions.models && extractions.models[modelName]) {
      graph.addEdge(name, modelName, 'convention_pair')
      relationships.push({ from: name, to: modelName, type: 'convention_pair' })
    }
  }
}
```

**Test:**

```javascript
it('convention_pair prefers un-namespaced controller over namespaced variant', () => {
  const extractions = {
    models: { Email: { associations: [], concerns: [] } },
    controllers: {
      EmailsController: { class: 'EmailsController', actions: ['index'] },
      'Webhook::V1::EmailsController': { class: 'Webhook::V1::EmailsController', actions: ['create'] },
    },
    test_conventions: null,
  }
  const manifest = { entries: [] }
  const { relationships } = buildGraph(extractions, manifest)

  const conventionPairs = relationships.filter(r => r.type === 'convention_pair' && r.to === 'Email')
  expect(conventionPairs).toHaveLength(1)
  expect(conventionPairs[0].from).toBe('EmailsController')
})
```

---

## ISSUE J: `after_save_commit` with multiple method symbols — multi-callback expansion

**File:** `src/extractors/model.js` (callback extraction)
**Severity:** MEDIUM

**Problem:** `after_save_commit :unassign_role!, :assign_role!` has two method symbols on one line. The extractor captures only the first (`:unassign_role!`) and treats `:assign_role!` as options. This is the same class of issue as the controller `before_action` multi-method problem.

**Note:** This is closely related to ISSUE G (which adds `after_save_commit` to the pattern). This issue addresses the multi-method expansion specifically for callbacks.

**Fix:** In `src/extractors/model.js`, after the callback extraction loop, add multi-method expansion:

```javascript
// Expand callbacks with multiple method symbols
const expandedCallbacks = []
for (const cb of callbacks) {
  if (!cb.options) {
    expandedCallbacks.push(cb)
    continue
  }

  // Check if options contains additional :method symbols
  const parts = cb.options.split(',').map(p => p.trim())
  const additionalMethods = []
  const realOptions = []

  for (const part of parts) {
    if (/^:(\w+[!?]?)$/.test(part)) {
      additionalMethods.push(part.replace(/^:/, ''))
    } else {
      realOptions.push(part)
    }
  }

  expandedCallbacks.push({
    ...cb,
    options: realOptions.length > 0 ? realOptions.join(', ') : null,
  })

  for (const method of additionalMethods) {
    expandedCallbacks.push({
      type: cb.type,
      method,
      options: realOptions.length > 0 ? realOptions.join(', ') : null,
    })
  }
}
```

Replace the `callbacks` array with `expandedCallbacks` before returning.

**Test:**

```javascript
it('expands callbacks with multiple method symbols', () => {
  const content = `class User < ApplicationRecord
  after_save_commit :unassign_role!, :assign_role!
  before_save :normalize_name, :set_defaults, if: :active?
end`
  const result = extractModel(mockProvider(content), 'app/models/user.rb', 'User')

  const commitCbs = result.callbacks.filter(c => c.type === 'after_save_commit')
  expect(commitCbs).toHaveLength(2)
  expect(commitCbs.map(c => c.method)).toContain('unassign_role!')
  expect(commitCbs.map(c => c.method)).toContain('assign_role!')

  const saveCbs = result.callbacks.filter(c => c.type === 'before_save')
  expect(saveCbs).toHaveLength(2)
  expect(saveCbs.map(c => c.method)).toContain('normalize_name')
  expect(saveCbs.map(c => c.method)).toContain('set_defaults')
  // Both should have the if: condition
  expect(saveCbs.every(c => c.options && c.options.includes('if:'))).toBe(true)
})
```

---

## Final Verification

After fixing all 10 issues:

```bash
npm test
```

All tests must pass. Then:

```bash
git add -A
git commit -m "fix: resolve 10 eval issues from kollaras-ai (v1.0.15 → v1.0.16)

- A: Remove hardcoded Role=domain-model heuristic; detect Rolify via schema
- B: Component count includes nested sidecar directories
- C: Controller namespace from module wrapping (module Backend class X end end)
- D: Multi-DB detection requires adapter key, not just nested YAML objects
- E: resources only: [] produces zero actions (regression fix)
- F: Email subgraph seeds from models/controllers with email/mail in name
- G: after_save_commit/after_create_commit/after_destroy_commit callbacks
- H: Multi-line filter options with bracket continuation
- I: Convention pair prefers un-namespaced controller
- J: Multi-method callback expansion (after_save_commit :a, :b)"

npm version patch
```

---

## Quick Reference

| Issue | File(s)                              | Impact                                      |
| ----- | ------------------------------------ | ------------------------------------------- |
| A     | `src/tools/handlers/get-model.js`    | Removes auth_relevance hallucination        |
| B     | `src/core/scanner.js`                | +6 components detected                      |
| C     | `src/extractors/controller.js`       | +8 controllers detected, correct namespaces |
| D     | `src/extractors/config.js`           | Removes databases hallucination             |
| E     | `src/extractors/routes.js`           | Fixes `only: []` regression (CRITICAL)      |
| F     | `src/tools/handlers/get-subgraph.js` | Email subgraph populated                    |
| G     | `src/core/patterns/model.js`         | after_save_commit callbacks detected        |
| H     | `src/extractors/controller.js`       | Multi-line filter options captured          |
| I     | `src/core/graph.js`                  | Convention pair picks correct controller    |
| J     | `src/extractors/model.js`            | Multi-method callbacks expanded             |
