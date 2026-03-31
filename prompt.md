# RailsInsight v1.0.14 → v1.0.15 — Fix Remaining Evaluation Issues

You are working on **RailsInsight**, a Rails-aware MCP server written in Node.js (ES modules). The codebase uses **Vitest** for testing.

## Context

The latest evaluation against a Rails 6.1 application scored F1=0.916 with 473 confirmed claims, 0.99 recall, but precision dropped to 0.852 due to **one critical bug**: the route extractor hallucinating actions by ignoring `:only` and `:except` constraints. That single issue accounts for 50 of 55 total hallucinations. Fix it and precision returns above 0.97. There are 8 issues total.

## Ground Rules

1. **Run `npm test` before starting.** Record baseline.
2. **Fix one issue at a time.** Run relevant tests after each.
3. **After all fixes**, run `npm test` and confirm zero failures.
4. **Do not change the MCP tool API surface.**
5. **Every fix must have at least one test.**
6. **Commit when done:** `fix: resolve 8 eval issues — route only/except, phantom nodes, view dirs (v1.0.14 → v1.0.15)`

---

## ISSUE A: Route extractor ignores `:only` and `:except` — hallucinating non-existent actions

**File:** `src/extractors/routes.js`
**Severity:** CRITICAL — causes 50 hallucinated claims, drops precision from ~0.97 to 0.85

**Problem:** Every `resources` declaration reports all 7 CRUD actions (`index, show, new, create, edit, update, destroy`) regardless of `:only` or `:except` constraints. The regex captures these options into the `options` string but the action filtering logic that processes them is not working.

**Evidence:**

- `resources :events, except: [:show]` → tool reports all 7 actions including `show`
- `resources :articles, only: [:index, :show]` → tool reports all 7 actions
- 50 hallucinated actions across all resources in the evaluation

**Root cause:** In `src/extractors/routes.js`, look at the `resources` parsing block (approximately line 95-130). The `:only` and `:except` options are extracted from the options string using `ROUTE_PATTERNS.only` and `ROUTE_PATTERNS.except`. Check whether:

1. The options string is captured correctly from the regex match — it should be in `resourcesMatch[2]`
2. The `:only`/`:except` regex patterns actually match the content

The likely issue is that the options regex fails to match **old-style hash rocket syntax**. The current patterns in `src/core/patterns/route.js` are:

```javascript
only: /only:\s*(?:\[([^\]]+)\]|:([\w]+))/,
except: /except:\s*(?:\[([^\]]+)\]|:([\w]+))/,
```

These match `only: [:index, :show]` and `only: :index` but do NOT match:

- `:only => [:index, :show]` (hash rocket)
- `:except => [:show]` (hash rocket)
- `only: %i[index show]` (percent-i array)

**Fix:** Update both patterns in `src/core/patterns/route.js`:

```javascript
only: /(?:only:|:only\s*=>)\s*(?:\[([^\]]+)\]|%i\[([^\]]+)\]|%w\[([^\]]+)\]|:([\w]+))/,
except: /(?:except:|:except\s*=>)\s*(?:\[([^\]]+)\]|%i\[([^\]]+)\]|%w\[([^\]]+)\]|:([\w]+))/,
```

Then in `src/extractors/routes.js`, update the action filtering to handle all capture groups:

```javascript
// Determine actions
let actions = ['index', 'show', 'new', 'create', 'edit', 'update', 'destroy']

const onlyMatch = options.match(ROUTE_PATTERNS.only)
if (onlyMatch) {
  // Groups: 1=bracket array, 2=%i array, 3=%w array, 4=single symbol
  const raw = onlyMatch[1] || onlyMatch[2] || onlyMatch[3] || (onlyMatch[4] ? `:${onlyMatch[4]}` : '')
  actions = raw.match(/\w+/g)?.filter(a => !['true', 'false'].includes(a)) || []
}

const exceptMatch = options.match(ROUTE_PATTERNS.except)
if (exceptMatch) {
  const raw = exceptMatch[1] || exceptMatch[2] || exceptMatch[3] || (exceptMatch[4] ? `:${exceptMatch[4]}` : '')
  const excluded = raw.match(/\w+/g)?.filter(a => !['true', 'false'].includes(a)) || []
  actions = actions.filter(a => !excluded.includes(a))
}
```

**Important:** Also check the `resource` (singular) handling — it uses the same patterns and has the same default actions list (`show, new, create, edit, update, destroy` — no `index`).

**Tests:**

```javascript
import { describe, it, expect } from 'vitest'
import { extractRoutes } from '../../src/extractors/routes.js'

function mockProvider(routesContent) {
  return {
    readFile(path) {
      if (path === 'config/routes.rb') return routesContent
      return null
    }
  }
}

describe('route only/except filtering', () => {
  it('respects :only with modern syntax', () => {
    const result = extractRoutes(mockProvider(`Rails.application.routes.draw do
  resources :articles, only: [:index, :show]
end`))
    const articles = result.resources.find(r => r.name === 'articles')
    expect(articles.actions).toEqual(['index', 'show'])
    expect(articles.actions).not.toContain('create')
    expect(articles.actions).not.toContain('destroy')
  })

  it('respects :except with modern syntax', () => {
    const result = extractRoutes(mockProvider(`Rails.application.routes.draw do
  resources :events, except: [:show, :destroy]
end`))
    const events = result.resources.find(r => r.name === 'events')
    expect(events.actions).toContain('index')
    expect(events.actions).toContain('create')
    expect(events.actions).not.toContain('show')
    expect(events.actions).not.toContain('destroy')
  })

  it('respects :only with hash rocket syntax', () => {
    const result = extractRoutes(mockProvider(`Rails.application.routes.draw do
  resources :articles, :only => [:index, :show]
end`))
    const articles = result.resources.find(r => r.name === 'articles')
    expect(articles.actions).toEqual(['index', 'show'])
  })

  it('respects :except with hash rocket syntax', () => {
    const result = extractRoutes(mockProvider(`Rails.application.routes.draw do
  resources :events, :except => [:show]
end`))
    const events = result.resources.find(r => r.name === 'events')
    expect(events.actions).not.toContain('show')
    expect(events.actions).toHaveLength(6)
  })

  it('respects :only with %i[] syntax', () => {
    const result = extractRoutes(mockProvider(`Rails.application.routes.draw do
  resources :posts, only: %i[index show]
end`))
    const posts = result.resources.find(r => r.name === 'posts')
    expect(posts.actions).toEqual(['index', 'show'])
  })

  it('respects :only with single symbol', () => {
    const result = extractRoutes(mockProvider(`Rails.application.routes.draw do
  resources :sessions, only: :create
end`))
    const sessions = result.resources.find(r => r.name === 'sessions')
    expect(sessions.actions).toEqual(['create'])
  })

  it('reports all 7 actions when no only/except given', () => {
    const result = extractRoutes(mockProvider(`Rails.application.routes.draw do
  resources :users
end`))
    const users = result.resources.find(r => r.name === 'users')
    expect(users.actions).toHaveLength(7)
  })
})
```

---

## ISSUE B: `model_table_map` includes non-AR classes that have no database tables

**File:** `src/tools/handlers/get-schema.js`
**Severity:** MEDIUM

**Problem:** The `model_table_map` in `get_schema` output maps every model to a table name, including classes that are not backed by database tables: `AdminAbility` (CanCan), `ApplicationRecord` (abstract), `WpBase` (abstract STI base), and STI subclasses like `Place` that share a parent table. This misleads AI agents into thinking tables like `admin_abilities` and `application_records` exist.

**Fix:** In `src/tools/handlers/get-schema.js`, the `model_table_map` builder already filters out concerns. Extend it to also filter abstract classes, ability classes, and STI subclasses:

```javascript
const modelTableMap = {}
for (const [modelName, modelData] of Object.entries(models)) {
  // Skip non-AR entities
  if (modelData.type === 'concern') continue
  if (modelData.abstract) continue
  if (modelData.sti_parent) continue // STI subclass — shares parent table

  // Skip known non-AR patterns
  if (/Ability$/.test(modelName)) continue // CanCan ability classes
  if (modelName === 'ApplicationRecord') continue

  const tableName = modelData.table_name || toTableName(modelName)

  // Only include if the table actually exists in the schema
  const tableExists = (schema.tables || []).some(t => t.name === tableName)
  if (tableExists) {
    modelTableMap[modelName] = tableName
  }
}
```

The key addition is the `tableExists` check — this is the most reliable filter because it only maps models to tables that actually appear in `db/schema.rb`.

**Test:**

```javascript
it('model_table_map excludes abstract classes and ability classes', () => {
  const state = {
    index: {
      extractions: {
        models: {
          User: { type: 'model', file: 'app/models/user.rb' },
          ApplicationRecord: { type: 'model', abstract: true },
          AdminAbility: { type: 'model', file: 'app/models/admin_ability.rb' },
          Place: { type: 'model', sti_parent: 'Venue' },
        },
        schema: {
          tables: [
            { name: 'users', columns: [], indexes: [] },
            { name: 'venues', columns: [], indexes: [] },
          ],
          foreign_keys: [],
        },
      },
    },
  }
  // Call get_schema handler, verify modelTableMap
  // User → 'users' should be present
  // ApplicationRecord, AdminAbility, Place should be absent
})
```

---

## ISSUE C: Blast radius creates phantom entity from association alias when `class_name:` override exists

**File:** `src/core/graph.js` (`buildGraph`, association edge creation)
**Severity:** MEDIUM

**Problem:** When a model has `belongs_to :author, class_name: 'AdminUser'`, the graph builder creates a node for `Author` (from the association name) in addition to the correct `AdminUser` node. The `class_name:` override is supposed to redirect the edge target, but the `classify(assoc.name)` fallback still creates the phantom node.

**Root cause:** In `src/core/graph.js`, the association edge creation block (approximately line 170) does:

```javascript
const classNameOverride = extractClassName(assoc.options)
const target = classNameOverride || classify(assoc.name)
graph.addNode(target, 'model', target)
```

This correctly computes `target = 'AdminUser'` when `class_name:` is present. But look at `extractClassName` — verify it actually parses the options string correctly. The issue may be that `assoc.options` contains the raw options string and `extractClassName` fails to match, causing `classify('author')` → `Author` to be used as fallback.

**Fix:** Check `extractClassName` in `src/core/graph.js`:

```javascript
function extractClassName(options) {
  if (!options) return null
  const match = options.match(/class_name:\s*['"](\w+(?:::\w+)*)['"]/)
  return match ? match[1] : null
}
```

This handles `class_name: 'AdminUser'` and `class_name: "AdminUser"`. But it does NOT handle:

- `class_name: AdminUser` (no quotes — valid in older Rails)
- `:class_name => 'AdminUser'` (hash rocket syntax)
- `class_name: "Admin::User"` (already handled via `::`)

Update to handle hash rockets and unquoted class names:

```javascript
function extractClassName(options) {
  if (!options) return null
  // Modern syntax: class_name: 'AdminUser' or class_name: "AdminUser"
  const modern = options.match(/class_name:\s*['"](\w+(?:::\w+)*)['"]/)
  if (modern) return modern[1]
  // Hash rocket: :class_name => 'AdminUser'
  const rocket = options.match(/:?class_name\s*=>\s*['"](\w+(?:::\w+)*)['"]/)
  if (rocket) return rocket[1]
  // Unquoted (rare but valid): class_name: AdminUser
  const unquoted = options.match(/class_name:\s*([A-Z]\w+(?:::\w+)*)/)
  if (unquoted) return unquoted[1]
  return null
}
```

**Test:**

```javascript
it('uses class_name override for association edge target, no phantom node', () => {
  const extractions = {
    models: {
      Article: {
        associations: [
          { type: 'belongs_to', name: 'author', options: "class_name: 'AdminUser'" },
        ],
        concerns: [],
      },
      AdminUser: { associations: [], concerns: [] },
    },
    controllers: {},
    test_conventions: null,
  }
  const manifest = { entries: [] }
  const { graph } = buildGraph(extractions, manifest)

  // AdminUser should be a node
  expect(graph.nodes.has('AdminUser')).toBe(true)
  // Author should NOT be a node — the edge should go directly to AdminUser
  expect(graph.nodes.has('Author')).toBe(false)
  // Edge from Article to AdminUser should exist
  const edges = graph.edges.filter(e => e.from === 'Article' && e.to === 'AdminUser')
  expect(edges.length).toBeGreaterThan(0)
})

it('handles class_name with hash rocket syntax', () => {
  const extractions = {
    models: {
      Comment: {
        associations: [
          { type: 'belongs_to', name: 'creator', options: ":class_name => 'User'" },
        ],
        concerns: [],
      },
      User: { associations: [], concerns: [] },
    },
    controllers: {},
    test_conventions: null,
  }
  const manifest = { entries: [] }
  const { graph } = buildGraph(extractions, manifest)

  expect(graph.nodes.has('User')).toBe(true)
  expect(graph.nodes.has('Creator')).toBe(false)
})
```

---

## ISSUE D: Authentication features flat-concatenated with duplicates instead of per-model

**File:** `src/tools/handlers/get-overview.js`
**Severity:** MEDIUM

**Problem:** The `authentication.features` array in `get_overview` concatenates Devise modules from all models into a single flat array. When `AdminUser` and `Member` both use `:database_authenticatable`, it appears twice. The per-model context is lost.

**Fix:** In `src/tools/handlers/get-overview.js`, change the features builder to deduplicate:

```javascript
// Current (broken):
if (auth.devise) {
  authSummary.models = Object.keys(auth.devise.models || {})
  authSummary.features = Object.values(auth.devise.models || {}).flatMap(m => m.modules || [])
}

// Fixed — deduplicate and optionally keep per-model detail:
if (auth.devise) {
  authSummary.models = Object.keys(auth.devise.models || {})

  // Deduplicated flat list for backward compat
  const allModules = Object.values(auth.devise.models || {}).flatMap(m => m.modules || [])
  authSummary.features = [...new Set(allModules)]

  // Per-model detail for richer context
  authSummary.features_by_model = {}
  for (const [modelName, modelData] of Object.entries(auth.devise.models || {})) {
    authSummary.features_by_model[modelName] = modelData.modules || []
  }
}
```

**Test:**

```javascript
it('deduplicates Devise features across models', () => {
  const state = {
    index: {
      versions: {},
      extractions: {
        auth: {
          primary_strategy: 'devise',
          devise: {
            models: {
              AdminUser: { modules: ['database_authenticatable', 'recoverable', 'trackable'] },
              Member: { modules: ['database_authenticatable', 'registerable', 'confirmable'] },
            }
          }
        },
        models: {}, controllers: {},
        authorization: {}, caching: {}, jobs: {},
        tier2: {}, tier3: {},
      },
      statistics: {},
    }
  }
  // Call get_overview, verify features has no duplicates
  // 'database_authenticatable' should appear exactly once
})
```

---

## ISSUE E: Authorization `roles.model` reports 'User' instead of 'AdminUser'

**File:** `src/extractors/authorization.js`
**Severity:** MEDIUM

**Problem:** The authorization extractor reports `roles.model: 'User'` when the actual model with `rolify` is `AdminUser`. This has persisted across multiple eval rounds.

**Root cause:** The role detection loop in `src/extractors/authorization.js` iterates model entries and checks for `AUTHORIZATION_PATTERNS.enumRole`. The first model matching `enum :role` or `rolify` is used. If `User` is iterated before `AdminUser`, and `User` has any role-like field, it wins.

Alternatively, the extractor may be inferring the model from the CanCan ability class parameter name (`def initialize(user)` → assumes model is `User`).

**Fix:** When `rolify` is the role source, extract the model name from the file where `rolify` is declared, not from the ability initializer parameter:

```javascript
// Role detection from models — check for rolify declaration specifically
for (const entry of modelEntries) {
  const content = provider.readFile(entry.path)
  if (!content) continue

  // Check for rolify gem declaration
  if (/^\s*rolify\b/m.test(content)) {
    const classMatch = content.match(/class\s+(\w+(?:::\w+)*)/)
    if (classMatch) {
      result.roles = { source: 'rolify', model: classMatch[1] }
      break
    }
  }

  // Check for enum role (only if rolify not found)
  if (!result.roles && AUTHORIZATION_PATTERNS.enumRole.test(content)) {
    const className = entry.path.split('/').pop().replace('.rb', '')
      .split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')
    result.roles = { source: 'enum', model: className }
    break
  }
}
```

The key change: check for `rolify` declaration first (it's the strongest signal), extract the class name from the same file, and use that as the model.

**Test:**

```javascript
it('reports rolify model as AdminUser, not User', () => {
  const entries = [
    { path: 'app/models/user.rb', category: 1, categoryName: 'models', type: 'ruby' },
    { path: 'app/models/admin_user.rb', category: 1, categoryName: 'models', type: 'ruby' },
  ]
  const provider = {
    readFile(path) {
      if (path === 'app/models/user.rb') return 'class User < ApplicationRecord\n  has_many :posts\nend'
      if (path === 'app/models/admin_user.rb') return "class AdminUser < ApplicationRecord\n  rolify :role_cname => 'AdminRole'\n  devise :database_authenticatable\nend"
      return null
    }
  }
  const result = extractAuthorization(provider, entries, { gems: { rolify: {} } })
  expect(result.roles.model).toBe('AdminUser')
})
```

---

## ISSUE F: Cache store extractor picks first conditional branch instead of default

**File:** `src/extractors/caching.js` or `src/core/version-detector.js`
**Severity:** LOW

**Problem:** Rails development environment commonly uses a caching toggle:

```ruby
if Rails.root.join('tmp/caching-dev.txt').exist?
  config.cache_store = :memory_store
else
  config.cache_store = :null_store
end
```

The extractor matches the first `config.cache_store` line and reports `:memory_store`, but the default (when the toggle file doesn't exist) is `:null_store`.

**Fix:** This is fundamentally hard to solve with regex — you'd need to understand Ruby control flow. A pragmatic fix: when multiple `cache_store` assignments exist in the same environment file, report all of them or report the last one (which is more likely to be the unconditional/default):

```javascript
// In the cache store extraction:
const content = provider.readFile(`config/environments/${env}.rb`)
if (content) {
  const activeContent = content.split('\n').filter(l => !l.trim().startsWith('#')).join('\n')
  const allStoreMatches = [...activeContent.matchAll(/config\.cache_store\s*=\s*:(\w+)/g)]
  if (allStoreMatches.length === 1) {
    result.store[env] = allStoreMatches[0][1]
  } else if (allStoreMatches.length > 1) {
    // Multiple assignments — likely conditional; report as conditional
    result.store[env] = {
      values: allStoreMatches.map(m => m[1]),
      note: 'conditional — multiple cache_store assignments detected'
    }
  }
}
```

Alternatively, for simplicity, just report the last match (most likely to be the fallback/else branch):

```javascript
if (allStoreMatches.length > 0) {
  result.store[env] = allStoreMatches[allStoreMatches.length - 1][1]
}
```

**Test:**

```javascript
it('handles conditional cache_store assignments in development', () => {
  const provider = {
    readFile(path) {
      if (path === 'config/environments/development.rb') return `Rails.application.configure do
  if Rails.root.join('tmp/caching-dev.txt').exist?
    config.cache_store = :memory_store
  else
    config.cache_store = :null_store
  end
end`
      return null
    }
  }
  const result = extractCaching(provider, [])
  // Should not just pick :memory_store — either pick last, pick both, or note it's conditional
  expect(result.store.development).not.toBe('memory_store')
})
```

---

## ISSUE G: Views analysis does not scan non-standard view directories

**File:** `src/core/scanner.js`, `src/extractors/views.js`
**Severity:** MEDIUM

**Problem:** This project uses `app/views_mobile/` (191 files) and `app/views_shared/` (63 files) in addition to `app/views/`. The scanner and views extractor only scan `app/views/`, undercounting templates by ~254 files.

**Fix:** This is an edge case — most Rails apps only use `app/views/`. Rather than hardcoding extra directories, detect them dynamically. In `src/extractors/views.js`, before the main view scan, check for additional view directories:

```javascript
export function extractViews(provider, entries) {
  // ... existing result setup ...

  // Standard view entries from scanner
  const viewEntries = entries.filter(
    e => e.path.startsWith('app/views/') || e.category === 7 || e.categoryName === 'views'
  )

  // Also check for non-standard view directories
  const additionalViewDirs = []
  const appContents = provider.listDir('app') || []
  for (const name of appContents) {
    if (name.startsWith('views_') && name !== 'views') {
      additionalViewDirs.push(`app/${name}`)
    }
  }

  // If additional view dirs exist, scan them too
  if (additionalViewDirs.length > 0) {
    for (const dir of additionalViewDirs) {
      const files = provider.glob(`${dir}/**/*.{erb,haml,slim}`) || []
      for (const path of files) {
        viewEntries.push({ path, category: 7, categoryName: 'views', type: detectType(path) })
      }
    }
    result.additional_view_directories = additionalViewDirs
  }

  // ... rest of existing extraction logic using viewEntries ...
}
```

Note: The `provider.glob` may not support brace expansion `{erb,haml,slim}`. If not, run three separate globs:

```javascript
const files = [
  ...(provider.glob(`${dir}/**/*.erb`) || []),
  ...(provider.glob(`${dir}/**/*.haml`) || []),
  ...(provider.glob(`${dir}/**/*.slim`) || []),
]
```

Also add the additional view directories to the `get_overview` output so AI agents know they exist.

**Test:**

```javascript
it('scans app/views_mobile and app/views_shared directories', () => {
  const entries = [
    { path: 'app/views/articles/index.html.erb', category: 7, categoryName: 'views', type: 'erb' },
  ]
  const provider = {
    readFile(path) {
      if (path.endsWith('.erb')) return '<h1>Content</h1>'
      if (path.endsWith('.haml')) return '%h1 Content'
      return null
    },
    listDir(path) {
      if (path === 'app') return ['views', 'views_mobile', 'views_shared', 'models', 'controllers']
      return []
    },
    glob(pattern) {
      if (pattern.includes('views_mobile')) return ['app/views_mobile/articles/index.html.erb']
      if (pattern.includes('views_shared')) return ['app/views_shared/footer.html.haml']
      return []
    }
  }
  const result = extractViews(provider, entries)
  expect(result.additional_view_directories).toContain('app/views_mobile')
  expect(result.additional_view_directories).toContain('app/views_shared')
})
```

---

## ISSUE H: Convention_pair blast radius entities resolve file to view instead of controller

**File:** `src/core/indexer.js` (`buildReverseEntityFileMap`) or `src/core/blast-radius.js`
**Severity:** LOW

**Problem:** In blast radius results, controller entities reached via `convention_pair` edges have their `file` field set to a view file path (e.g., `app/views/articles/show.html.haml`) instead of the controller file (`app/controllers/articles_controller.rb`). This was flagged in the original master report as part of ISSUE-06 and partially fixed, but it still occurs.

**Root cause:** The `buildReverseEntityFileMap` in `src/core/indexer.js` iterates `fileEntityMap` entries. Both `app/controllers/articles_controller.rb` and `app/views/articles/show.html.haml` map to the entity `ArticlesController`. The last one written wins, and if view files are iterated after controller files, the view path overwrites the controller path.

**Fix:** The previous fix attempt added a preference for `.rb` files. But view files also end in `.rb` (if they're `.rb` view files) — the check needs to be more specific. Prioritise files in `app/controllers/`:

```javascript
function buildReverseEntityFileMap(fileEntityMap) {
  const reverse = {}
  for (const [path, mapping] of Object.entries(fileEntityMap)) {
    const existing = reverse[mapping.entity]
    if (!existing) {
      reverse[mapping.entity] = path
    } else {
      // Prefer controller/model/job files over view/template files
      const isSourceFile = path.startsWith('app/controllers/') ||
                           path.startsWith('app/models/') ||
                           path.startsWith('app/jobs/') ||
                           path.startsWith('app/mailers/') ||
                           path.startsWith('app/services/')
      const existingIsSource = existing.startsWith('app/controllers/') ||
                               existing.startsWith('app/models/') ||
                               existing.startsWith('app/jobs/') ||
                               existing.startsWith('app/mailers/') ||
                               existing.startsWith('app/services/')
      if (isSourceFile && !existingIsSource) {
        reverse[mapping.entity] = path
      }
    }
  }
  return reverse
}
```

**Test:**

```javascript
it('reverse entity file map prefers controller file over view file', () => {
  const fileEntityMap = {
    'app/controllers/articles_controller.rb': { entity: 'ArticlesController', type: 'controller' },
    'app/views/articles/show.html.haml': { entity: 'ArticlesController', type: 'view' },
    'app/views/articles/index.html.erb': { entity: 'ArticlesController', type: 'view' },
  }
  const reverse = buildReverseEntityFileMap(fileEntityMap)
  expect(reverse['ArticlesController']).toBe('app/controllers/articles_controller.rb')
})
```

Note: `buildReverseEntityFileMap` is currently a private function inside `src/core/blast-radius.js`. You may need to export it for testing, or test it indirectly through `computeBlastRadius`.

---

## Final Verification

After fixing all 8 issues:

```bash
npm test
```

All tests must pass. Then:

```bash
git add -A
git commit -m "fix: resolve 8 eval issues (v1.0.14 → v1.0.15)

- A: Route :only/:except with hash rockets and %i[] syntax (CRITICAL — fixes 50 hallucinations)
- B: model_table_map excludes non-AR classes, validates against schema
- C: class_name: override prevents phantom graph nodes (hash rocket support)
- D: Devise features deduplicated with per-model breakdown
- E: Authorization roles.model from rolify declaration, not ability parameter
- F: Conditional cache_store detection (if/else branches)
- G: Non-standard view directories (app/views_mobile, app/views_shared)
- H: Reverse entity file map prioritises source files over views"

npm version patch
```

---

## Quick Reference

| Issue | File(s)                                                  | Impact                           |
| ----- | -------------------------------------------------------- | -------------------------------- |
| A     | `src/core/patterns/route.js`, `src/extractors/routes.js` | **50 hallucinations eliminated** |
| B     | `src/tools/handlers/get-schema.js`                       | Phantom tables removed           |
| C     | `src/core/graph.js`                                      | Phantom graph nodes removed      |
| D     | `src/tools/handlers/get-overview.js`                     | Clean feature list               |
| E     | `src/extractors/authorization.js`                        | Correct rolify model             |
| F     | `src/extractors/caching.js`                              | Conditional config handling      |
| G     | `src/extractors/views.js`                                | +254 view files counted          |
| H     | `src/core/indexer.js` or `src/core/blast-radius.js`      | Correct file paths               |
