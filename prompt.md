# RailsInsight v1.0.13 → v1.0.14 — Fix Remaining Evaluation Issues

You are working on **RailsInsight**, a Rails-aware MCP server written in Node.js (ES modules). The codebase uses **Vitest** for testing.

## Context

The latest evaluation against a Rails 6.1 application (72 models, 54 controllers, MySQL2, CanCanCan, Minitest, HAML+ERB, Devise, FriendlyId, Paperclip) scored F1=0.971 with 590 confirmed claims out of 629. There are 12 remaining issues. Most are edge cases and polish — the structural extraction is now solid.

## Ground Rules

1. **Run `npm test` before starting** to establish a baseline. Record how many tests pass.
2. **Fix one issue at a time.** After each fix, run the relevant test file to confirm.
3. **After completing all fixes**, run `npm test` (full suite) and confirm all tests pass.
4. **Do not change the MCP tool API surface.**
5. **Every fix must have at least one test.**
6. **Commit when done** with message: `fix: resolve 12 remaining eval issues (v1.0.13 → v1.0.14)`

---

## ISSUE A: Anonymous block callbacks not detected

**File:** `src/extractors/model.js` (callback extraction section)
**Severity:** HIGH

**Problem:** The callback extractor only captures named method callbacks (`before_save :method_name`). Anonymous block callbacks are missed entirely:

```ruby
before_validation { self.registration_url.clear if self.registration_url == "http://" }
after_save { |record| record.touch_related }
before_create do
  self.token = SecureRandom.hex(10)
end
```

**Root cause:** The callback regex in `src/core/patterns/model.js` requires a `:symbol` after the callback type. The `callbackType` pattern is:

```javascript
callbackType: /^\s*((?:before|after|around)_(?:save|create|update|destroy|validation|commit|rollback|initialize|find|touch))\s+:?(\w+)(?:,\s*(.+))?$/m
```

This requires a word character capture group after the callback type — `{ ... }` and `do ... end` blocks don't match.

**Fix:** After the existing named-callback extraction loop, add a second pass for block callbacks:

```javascript
// Block callbacks: before_save { ... } or before_save do ... end
const blockCbRe = /^\s*((?:before|after|around)_(?:save|create|update|destroy|validation|commit|rollback|initialize|find|touch))\s+(?:do|\{)/gm
let bcm
while ((bcm = blockCbRe.exec(content))) {
  // Check this callback type+line wasn't already captured as a named callback
  const alreadyCaptured = callbacks.some(
    cb => cb.type === bcm[1] && content.indexOf(bcm[0]) === bcm.index
  )
  if (!alreadyCaptured) {
    callbacks.push({ type: bcm[1], method: null, options: null })
  }
}
```

Also handle the case where the block is on the same line with `{ ... }` inline, and where `do...end` spans multiple lines. Since we're just detecting the callback exists (not extracting the body), matching the opening keyword is sufficient.

**Test:**

```javascript
it('extracts anonymous block callbacks', () => {
  const content = `class Activity < ApplicationRecord
  before_validation { self.url.clear if self.url == "http://" }
  after_save :notify_admin
  before_create do
    self.token = SecureRandom.hex(10)
  end
end`
  const result = extractModel(mockProvider(content), 'app/models/activity.rb', 'Activity')
  expect(result.callbacks).toHaveLength(3)

  const blockCb = result.callbacks.find(c => c.type === 'before_validation' && c.method === null)
  expect(blockCb).toBeDefined()

  const namedCb = result.callbacks.find(c => c.method === 'notify_admin')
  expect(namedCb).toBeDefined()

  const doCb = result.callbacks.find(c => c.type === 'before_create' && c.method === null)
  expect(doCb).toBeDefined()
})
```

---

## ISSUE B: `validates_presence_of` with multiple attributes only captures first

**File:** `src/extractors/model.js` (old-style validation extraction)
**Severity:** HIGH

**Problem:** When `validates_presence_of :name, :body, { message: "required" }` is called with multiple attributes, only `:name` is captured. The remaining symbols (`:body`) are placed into the `rules` string.

**Root cause:** The old-style validator regex captures only the first attribute:

```javascript
/^\s*validates_(\w+?)(?:_of)?\s+:(\w+)(?:,\s*(.+))?$/gm
```

Group 2 captures `:name` and group 3 captures `:body, { message: "required" }` as options.

**Fix:** Replace the single-attribute capture with a multi-attribute parser. After matching the validator type, split the remaining arguments into attribute symbols vs option hashes:

```javascript
// Old-style validators: validates_presence_of :name, :body, { message: "required" }
const oldStyleRe = /^\s*validates_(\w+?)(?:_of)?\s+(.+)$/gm
while ((m = oldStyleRe.exec(content))) {
  const validationType = m[1] // 'presence', 'length', 'uniqueness', etc.
  const argString = m[2].trim()

  // Split arguments: extract all :symbol tokens as attributes,
  // everything else is options/rules
  const tokens = argString.split(',').map(t => t.trim())
  const attrs = []
  const ruleParts = []

  for (const token of tokens) {
    if (/^:\w+$/.test(token)) {
      attrs.push(token.replace(/^:/, ''))
    } else if (/^\w+:/.test(token) || /^\{/.test(token)) {
      // Keyword argument or hash — this is an option, not an attribute
      ruleParts.push(token)
    } else {
      // Could be a bare symbol without colon prefix in some styles
      ruleParts.push(token)
    }
  }

  if (attrs.length > 0) {
    validations.push({
      attributes: attrs,
      rules: `${validationType}: true${ruleParts.length > 0 ? ', ' + ruleParts.join(', ') : ''}`,
    })
  }
}
```

**Test:**

```javascript
it('extracts validates_presence_of with multiple attributes', () => {
  const content = `class Article < ApplicationRecord
  validates_presence_of :title, :body
  validates_length_of :summary, maximum: 200
  validates_uniqueness_of :slug, :permalink
end`
  const result = extractModel(mockProvider(content), 'app/models/article.rb', 'Article')

  const presenceVal = result.validations.find(v => v.rules.includes('presence'))
  expect(presenceVal.attributes).toContain('title')
  expect(presenceVal.attributes).toContain('body')

  const uniqueVal = result.validations.find(v => v.rules.includes('uniqueness'))
  expect(uniqueVal.attributes).toContain('slug')
  expect(uniqueVal.attributes).toContain('permalink')
})
```

---

## ISSUE C: Custom Devise controllers severely undercounted (4 of 12 detected)

**File:** `src/extractors/auth.js` (custom Devise controller detection, approximately line 320)
**Severity:** HIGH

**Problem:** The authentication deep analysis finds only 4 of 12 custom Devise controllers. The detection regex looks for `class X < Devise::YController` but misses controllers in namespaced directories where the class declaration uses module nesting or where the superclass is specified differently.

**Root cause:** The current pattern in `AUTH_PATTERNS.deviseController` is:

```javascript
deviseController: /class\s+\w+::(\w+Controller)\s*<\s*Devise::(\w+Controller)/
```

This misses:

1. Controllers where the namespace comes from directory structure + module wrapping (not inline `::`)
2. Controllers that inherit from a project-specific base like `DeviseController` instead of `Devise::SessionsController`
3. Controllers in `admin_users/` and `members/` directories that follow Devise path conventions

**Fix:** In `src/extractors/auth.js`, expand the custom controller detection to also scan by file path convention. Devise sub-controllers live in directories named after the Devise scope (e.g., `app/controllers/admin_users/sessions_controller.rb`, `app/controllers/members/registrations_controller.rb`):

```javascript
// After the existing regex-based detection loop, add path-based detection:
if (result.devise?.models) {
  const deviseModelNames = Object.keys(result.devise.models)

  // Devise generates controllers under scope directories
  // e.g., devise_for :admin_users → app/controllers/admin_users/sessions_controller.rb
  const deviseControllerTypes = [
    'sessions', 'registrations', 'passwords', 'confirmations',
    'unlocks', 'omniauth_callbacks'
  ]

  for (const modelName of deviseModelNames) {
    // Convert model name to expected directory: AdminUser → admin_users, Member → members
    const scopeDir = modelName.replace(/([A-Z])/g, (m, l, i) =>
      i === 0 ? l.toLowerCase() : `_${l.toLowerCase()}`
    ) + 's' // pluralise: admin_user → admin_users

    for (const ctrlType of deviseControllerTypes) {
      const expectedPath = `app/controllers/${scopeDir}/${ctrlType}_controller.rb`
      const content = provider.readFile(expectedPath)
      if (content) {
        const classMatch = content.match(/class\s+(\w+(?:::\w+)*Controller)/)
        const name = classMatch ? classMatch[1] : `${scopeDir}/${ctrlType}`
        if (!result.devise.custom_controllers.includes(name)) {
          result.devise.custom_controllers.push(name)
        }
      }
    }
  }
}
```

Also try the singular form of the scope directory (`admin_user/` in addition to `admin_users/`), since Devise `devise_for` scope naming varies.

**Test:**

```javascript
it('detects Devise sub-controllers in scope directories', () => {
  const entries = [
    { path: 'app/controllers/admin_users/sessions_controller.rb', category: 8, categoryName: 'authentication', type: 'ruby' },
    { path: 'app/controllers/admin_users/passwords_controller.rb', category: 8, categoryName: 'authentication', type: 'ruby' },
    { path: 'app/controllers/members/registrations_controller.rb', category: 8, categoryName: 'authentication', type: 'ruby' },
  ]
  const provider = {
    readFile(path) {
      if (path === 'app/controllers/admin_users/sessions_controller.rb')
        return 'class AdminUsers::SessionsController < Devise::SessionsController\nend'
      if (path === 'app/controllers/admin_users/passwords_controller.rb')
        return 'class AdminUsers::PasswordsController < Devise::PasswordsController\nend'
      if (path === 'app/controllers/members/registrations_controller.rb')
        return 'class Members::RegistrationsController < Devise::RegistrationsController\nend'
      if (path === 'Gemfile') return "gem 'devise'"
      // Return model files with devise declarations
      if (path.includes('admin_user.rb'))
        return 'class AdminUser < ApplicationRecord\n  devise :database_authenticatable\nend'
      if (path.includes('member.rb'))
        return 'class Member < ApplicationRecord\n  devise :database_authenticatable, :registerable\nend'
      return null
    },
    fileExists() { return false },
    glob() { return [] }
  }
  const result = extractAuth(provider, entries, { gems: { devise: {} } })
  expect(result.devise.custom_controllers.length).toBeGreaterThanOrEqual(3)
})
```

---

## ISSUE D: Fragment cache calls in HAML views not detected

**File:** `src/extractors/caching.js`
**Severity:** HIGH

**Problem:** The fragment caching detector only looks for ERB-style cache syntax (`<% cache ... do %>`). HAML cache syntax (`- cache ... do`) is completely missed. This project has 8 HAML fragment cache calls that are invisible to the tool.

**Root cause:** The `CACHING_PATTERNS.fragmentCache` regex is ERB-specific:

```javascript
fragmentCache: /<%\s*cache\s+(.+?)\s*do\s*%>/g,
```

HAML uses different syntax:

```haml
- cache activity do
- cache ['v1', @user] do
= cache @article do
```

**Fix:** In `src/extractors/caching.js`, add HAML cache pattern matching alongside the ERB scan. In the view scanning loop (approximately line 35), add a second regex for HAML files:

```javascript
for (const entry of viewEntries) {
  const content = provider.readFile(entry.path)
  if (!content) continue

  // ERB fragment caching
  const fragRe = new RegExp(CACHING_PATTERNS.fragmentCache.source, 'g')
  let m
  while ((m = fragRe.exec(content))) {
    result.fragment_caching.usage_count++
  }

  // HAML fragment caching: - cache key do / = cache key do
  if (entry.path.endsWith('.haml')) {
    const hamlCacheRe = /^\s*[-=]\s*cache[\s(]+/gm
    while (hamlCacheRe.exec(content)) {
      result.fragment_caching.usage_count++
    }
  }

  // Ruby-style fragment caching (in .rb view helpers or components)
  const fragRubyRe = new RegExp(CACHING_PATTERNS.fragmentCacheRuby.source, 'g')
  while (fragRubyRe.exec(content)) {
    result.fragment_caching.usage_count++
  }

  // Russian doll detection (also check HAML)
  const rdRe = new RegExp(CACHING_PATTERNS.russianDoll.source, 'g')
  if (rdRe.test(content)) {
    result.fragment_caching.russian_doll_detected = true
  }
  // HAML Russian doll: - cache [parent, child] do
  if (entry.path.endsWith('.haml') && /^\s*[-=]\s*cache\s+\[/m.test(content)) {
    result.fragment_caching.russian_doll_detected = true
  }
}
```

**Test:**

```javascript
it('counts fragment cache calls in HAML views', () => {
  const entries = [
    { path: 'app/views/activities/show.html.haml', category: 7, categoryName: 'views', type: 'haml' },
    { path: 'app/views/articles/index.html.erb', category: 7, categoryName: 'views', type: 'erb' },
  ]
  const provider = {
    readFile(path) {
      if (path.endsWith('.haml')) return `%h1 Activity
- cache @activity do
  = render @activity
- cache ['v2', @sidebar] do
  = render 'sidebar'`
      if (path.endsWith('.erb')) return `<% cache @article do %>
  <%= render @article %>
<% end %>`
      return null
    }
  }
  const result = extractCaching(provider, entries)
  expect(result.fragment_caching.usage_count).toBe(3) // 2 HAML + 1 ERB
})
```

---

## ISSUE E: `Rails.cache` usage count undercounted (1 vs 10)

**File:** `src/extractors/caching.js`
**Severity:** MEDIUM

**Problem:** The `rails_cache_fetch_count` only counts `.fetch` calls. Other `Rails.cache` operations (`.read`, `.write`, `.delete`, `.exist?`, `.delete_matched`) are not counted. The `CACHING_PATTERNS.railsCacheOps` regex exists but is not used in the extraction.

**Root cause:** Looking at `src/core/patterns/caching.js`, there are two patterns:

```javascript
railsCacheFetch: /Rails\.cache\.fetch\s*\((.+?)\)/g,
railsCacheOps: /Rails\.cache\.(?:read|write|delete|exist\?)\s*\((.+?)\)/g,
```

But in `src/extractors/caching.js`, only `railsCacheFetch` is used. `railsCacheOps` is defined but never applied.

**Fix:** In `src/extractors/caching.js`, after the `Rails.cache.fetch` counting loop, add a count for other operations. Also add a total counter:

```javascript
// After the existing railsCacheFetch loop:
let railsCacheOpsCount = 0
const opsRe = new RegExp(CACHING_PATTERNS.railsCacheOps.source, 'g')
while (opsRe.exec(content)) {
  railsCacheOpsCount++
}

// Also count Rails.cache.delete_matched which isn't in the standard ops pattern
const deleteMatchedRe = /Rails\.cache\.delete_matched\s*\(/g
while (deleteMatchedRe.exec(content)) {
  railsCacheOpsCount++
}
```

Then add to the result:

```javascript
result.low_level_caching.rails_cache_ops_count = 0
// ... inside the loop, accumulate:
result.low_level_caching.rails_cache_ops_count += railsCacheOpsCount
```

**Test:**

```javascript
it('counts all Rails.cache operations, not just fetch', () => {
  const entries = [
    { path: 'app/models/product.rb', category: 1, categoryName: 'models', type: 'ruby' },
  ]
  const provider = {
    readFile(path) {
      if (path === 'app/models/product.rb') return `class Product < ApplicationRecord
  def cached_price
    Rails.cache.fetch("price_\#{id}") { calculate }
  end
  def update_cache
    Rails.cache.write("price_\#{id}", price)
  end
  def clear_cache
    Rails.cache.delete("price_\#{id}")
    Rails.cache.delete_matched("products:*")
  end
  def cached?
    Rails.cache.exist?("price_\#{id}")
  end
end`
      return null
    }
  }
  const result = extractCaching(provider, entries)
  expect(result.low_level_caching.rails_cache_fetch_count).toBe(1)
  expect(result.low_level_caching.rails_cache_ops_count).toBeGreaterThanOrEqual(3)
})
```

---

## ISSUE F: Paperclip not detected as image processing library

**File:** `src/extractors/storage.js`
**Severity:** MEDIUM

**Problem:** The storage extractor correctly identifies `has_attached_file` (Paperclip) attachment declarations but returns `image_processing: null`. It only checks for the `image_processing` gem. When Paperclip is used, the image processing is handled by Paperclip itself (with ImageMagick/MiniMagick backend).

**Fix:** In `src/extractors/storage.js`, after the existing `image_processing` gem check (approximately line 85), add Paperclip detection:

```javascript
// Image processing
if (gems.image_processing) {
  result.image_processing = { gem: 'image_processing', backend: 'mini_magick' }
  const envContent = provider.readFile('config/application.rb') || ''
  const vipsMatch = envContent.match(STORAGE_PATTERNS.variantProcessor)
  if (vipsMatch) {
    result.image_processing.backend = vipsMatch[1]
  }
} else if (gems.paperclip) {
  result.image_processing = { gem: 'paperclip', backend: 'imagemagick' }
  if (gems.mini_magick) {
    result.image_processing.backend = 'mini_magick'
  }
} else if (gems.mini_magick) {
  result.image_processing = { gem: 'mini_magick', backend: 'mini_magick' }
}
```

**Test:**

```javascript
it('detects Paperclip as image processing library', () => {
  const result = extractStorage(mockProvider({}), [], { gems: { paperclip: {} } })
  expect(result.image_processing).toBeDefined()
  expect(result.image_processing.gem).toBe('paperclip')
})
```

---

## ISSUE G: Blast radius `impactedTests` empty for Minitest projects

**File:** `src/core/blast-radius.js` (`collectImpactedTests`), `src/core/graph.js` (`buildGraph`)
**Severity:** MEDIUM

**Problem:** The blast radius `impactedTests` array is always empty for Minitest projects. The `collectImpactedTests` function looks for `tests` edge types in the graph, but `tests` edges are only created from `spec/**/*_spec.rb` entries (specCategory check in `buildGraph`). Minitest files (`test/**/*_test.rb`) never produce `tests` edges.

**Root cause:** In `src/core/graph.js`, the test edge creation block (approximately line 210) filters by:

```javascript
const specEntries = manifest.entries?.filter(
  e => e.category === 19 && e.specCategory && e.path.endsWith('_spec.rb')
) || []
```

The `_spec.rb` filter excludes all `_test.rb` files.

**Fix:** Extend the filter to include Minitest files:

```javascript
const specEntries = manifest.entries?.filter(
  e => e.category === 19 && (e.path.endsWith('_spec.rb') || e.path.endsWith('_test.rb'))
) || []
```

Then in the entity mapping logic below, add Minitest path conventions alongside the RSpec ones:

```javascript
for (const entry of specEntries) {
  const basename = entry.path.split('/').pop()
  let className = null
  let entityType = null

  if (basename.endsWith('_spec.rb')) {
    className = classify(basename.replace('_spec.rb', ''))
    // existing RSpec logic...
  } else if (basename.endsWith('_test.rb')) {
    className = classify(basename.replace('_test.rb', ''))

    if (entry.path.startsWith('test/models/') || entry.specCategory === 'model_tests') {
      if (extractions.models && extractions.models[className]) {
        graph.addNode(`test:${className}`, 'test', `${className} test`)
        graph.addEdge(`test:${className}`, className, 'tests')
        relationships.push({ from: `test:${className}`, to: className, type: 'tests' })
      }
    } else if (entry.path.startsWith('test/controllers/') || entry.specCategory === 'controller_tests') {
      const ctrlName = classify(basename.replace('_controller_test.rb', '').replace('_test.rb', '')) + 'Controller'
      if (extractions.controllers && extractions.controllers[ctrlName]) {
        graph.addNode(`test:${ctrlName}`, 'test', `${ctrlName} test`)
        graph.addEdge(`test:${ctrlName}`, ctrlName, 'tests')
        relationships.push({ from: `test:${ctrlName}`, to: ctrlName, type: 'tests' })
      }
    }
  }
}
```

**Test:**

```javascript
it('creates test edges for Minitest test files', () => {
  const extractions = {
    models: { User: { file: 'app/models/user.rb' } },
    controllers: {},
    test_conventions: {}
  }
  const manifest = {
    entries: [
      { path: 'test/models/user_test.rb', category: 19, categoryName: 'testing', specCategory: 'model_tests', type: 'ruby' }
    ]
  }
  const { graph, relationships } = buildGraph(extractions, manifest)
  const testEdge = relationships.find(r => r.type === 'tests' && r.to === 'User')
  expect(testEdge).toBeDefined()
})
```

---

## ISSUE H: Custom rate limiting not detected in `api_patterns`

**File:** `src/extractors/api.js`
**Severity:** MEDIUM

**Problem:** The API extractor detects `rack-attack` gem and Rails 8 native `rate_limit` macro, but misses custom rate limiting implementations. This project uses a custom `RateLimiter` class called via `before_action :check_rate_limit` in Devise controllers.

**Fix:** This is a detection scope issue — custom rate limiting is inherently hard to detect generically. Add a heuristic scan for common patterns:

```javascript
// Custom rate limiting heuristic: look for method names suggesting rate limiting
const customRateLimitPatterns = [
  /before_action\s+:(?:check_rate_limit|rate_limit|throttle)/,
  /class\s+RateLimiter/,
  /def\s+(?:check_rate_limit|rate_limit!|throttle!)/,
]

const customRateLimitFiles = []
for (const entry of controllerEntries) {
  const content = provider.readFile(entry.path)
  if (!content) continue
  for (const pattern of customRateLimitPatterns) {
    if (pattern.test(content)) {
      const ctrlMatch = content.match(/class\s+(\w+(?:::\w+)*)/)
      customRateLimitFiles.push({
        controller: ctrlMatch ? ctrlMatch[1] : entry.path,
        type: 'custom',
      })
      break
    }
  }
}

if (customRateLimitFiles.length > 0) {
  if (!result.rate_limiting) {
    result.rate_limiting = { gem: null, throttles: [], rails_native: null }
  }
  result.rate_limiting.custom = customRateLimitFiles
}
```

**Test:**

```javascript
it('detects custom rate limiting via before_action pattern', () => {
  const entries = [
    { path: 'app/controllers/sessions_controller.rb', category: 2, categoryName: 'controllers', type: 'ruby' }
  ]
  const provider = {
    readFile(path) {
      if (path === 'app/controllers/sessions_controller.rb') return `class SessionsController < Devise::SessionsController
  before_action :check_rate_limit, only: [:create]
end`
      if (path === 'config/application.rb') return ''
      return null
    }
  }
  const result = extractApi(provider, entries, {})
  expect(result.rate_limiting).toBeDefined()
  expect(result.rate_limiting.custom).toHaveLength(1)
})
```

---

## ISSUE I: Authentication subgraph ranks irrelevant legacy models highest

**File:** `src/tools/handlers/get-subgraph.js`
**Severity:** MEDIUM

**Problem:** The authentication subgraph correctly seeds from Devise models but the BFS expansion brings in high-PageRank legacy models (WpBase, WpPost — WordPress import models) that have no auth relevance. These rank #1 and #2 above the actual auth models.

**Root cause:** The BFS expansion traverses all edge types including `inherits`. If `WpPost < WpBase` and `WpBase` has an `includes_concern` edge to a concern that a Devise model also includes, the WordPress models get pulled in.

**Fix:** After the BFS expansion in `get-subgraph.js`, filter results to only include entities that are within a reasonable semantic distance of the seeds. Add a relevance filter:

```javascript
// After BFS expansion, filter to keep only relevant entities
if (skill === 'authentication') {
  const seedSet = new Set(seeds)
  const relevantEntities = new Set(seeds)

  // Keep BFS results that are directly connected to seeds or are auth-typed
  if (graph) {
    const bfsResults = graph.bfsFromSeeds([...seeds], 2, { excludeEdgeTypes: new Set(['tests', 'contains']) })
    for (const r of bfsResults) {
      // Only include if reached via auth-relevant edge types
      const authRelevantEdges = new Set([
        'convention_pair', 'routes_to', 'includes_concern', 'has_many',
        'belongs_to', 'has_one', 'authorizes_via'
      ])
      if (authRelevantEdges.has(r.edgeType) || seedSet.has(r.reachedVia)) {
        relevantEntities.add(r.entity)
      }
    }
  }

  // Use relevantEntities instead of allEntityIds for the response
}
```

Alternatively, reduce the BFS depth for authentication from 2 to 1, which keeps the results tightly scoped to direct neighbours of auth entities.

**Test:**

```javascript
it('authentication subgraph excludes unrelated models reached via inherited concerns', () => {
  // Mock a graph where User (devise) and WpPost both include the same concern
  // Verify WpPost is NOT in the authentication subgraph
})
```

---

## ISSUE J: Mailer superclass names truncated at first namespace component

**File:** `src/extractors/email.js` or `src/core/patterns/email.js`
**Severity:** LOW

**Problem:** `ActionMailer::Base` is captured as `ActionMailer` and `Devise::Mailer` as `Devise`. The mailer class regex only captures the first word of the superclass.

**Root cause:** The `EMAIL_PATTERNS.mailerClass` regex is:

```javascript
mailerClass: /class\s+(\w+Mailer)\s*<\s*(\w+)/
```

The superclass capture `(\w+)` stops at `::`. It should be `(\w+(?:::\w+)*)`.

**Fix:** In `src/core/patterns/email.js`:

```javascript
mailerClass: /class\s+(\w+(?:::\w+)*Mailer)\s*<\s*(\w+(?:::\w+)*)/,
```

This captures both `ApplicationMailer` and `ActionMailer::Base` as full strings.

**Test:**

```javascript
it('captures full superclass name including namespace', () => {
  const entries = [
    { path: 'app/mailers/notification_mailer.rb', category: 11, categoryName: 'email', type: 'ruby' }
  ]
  const provider = {
    readFile(path) {
      if (path === 'app/mailers/notification_mailer.rb')
        return 'class NotificationMailer < ActionMailer::Base\n  def welcome\n    mail(to: @user.email)\n  end\nend'
      return null
    }
  }
  const result = extractEmail(provider, entries)
  expect(result.mailers[0].superclass).toBe('ActionMailer::Base')
})
```

---

## ISSUE K: Model count inconsistency (statistics.models 69 vs manifest 72)

**File:** `src/core/indexer.js` (`computeStatistics`)
**Severity:** LOW

**Problem:** This has persisted across three evaluation rounds. `statistics.models` reports 69, `manifest.stats.models` and the filesystem both report 72. The 3-model gap is because some model files fail extraction (empty files, unconventional class definitions, or concern-classified files that appear in the manifest model count but are filtered out in statistics).

**Fix:** Investigate the gap. Add diagnostic logging then align the counts:

```javascript
function computeStatistics(manifest, extractions, relationships) {
  const entries = manifest.entries || []
  const manifestModelCount = (manifest.stats || {}).models || 0
  const extractedModels = Object.keys(extractions.models || {})
  const extractedModelCount = extractedModels.length

  // Find model files in manifest that weren't extracted
  const modelEntries = entries.filter(e => e.categoryName === 'models')
  const extractedSet = new Set(extractedModels.map(m => m.toLowerCase()))

  return {
    total_files: entries.length,
    models: extractedModelCount,
    models_file_count: manifestModelCount,
    controllers: Object.keys(extractions.controllers || {}).length,
    components: Object.keys(extractions.components || {}).length,
    relationships: relationships.length,
    gems: Array.isArray(extractions.gemfile?.gems)
      ? extractions.gemfile.gems.length
      : Object.keys(extractions.gemfile?.gems || {}).length,
    helpers: Object.keys(extractions.helpers || {}).length,
    workers: Object.keys(extractions.workers || {}).length,
    uploaders: Object.keys(extractions.uploaders?.uploaders || {}).length,
  }
}
```

The `models_file_count` field gives AI agents visibility into the gap. If the discrepancy is caused by extraction failures, the `extraction_errors` array already tracks those.

**Test:**

```javascript
it('statistics includes both extracted model count and file count', () => {
  const manifest = { entries: [], stats: { models: 10 } }
  const extractions = {
    models: { User: {}, Post: {}, Comment: {} }, // 3 extracted
    controllers: {}, components: {},
    gemfile: { gems: [] },
    helpers: {}, workers: {},
    uploaders: { uploaders: {} },
  }
  const stats = computeStatistics(manifest, extractions, [])
  expect(stats.models).toBe(3)
  expect(stats.models_file_count).toBe(10)
})
```

---

## ISSUE L: View template counts off by small amounts (ERB -5, HAML -1)

**File:** `src/core/scanner.js` or `src/extractors/views.js`
**Severity:** LOW

**Problem:** ERB count is 175 vs actual 180 (diff 5), HAML is 141 vs actual 142 (diff 1). The view discovery glob likely misses files in edge-case locations.

**Fix:** Check the scanner glob for views. It should be `app/views/**/*` but some files may be missed if they're in unusual subdirectories or have unusual extensions. Common misses:

1. Files in `app/views/layouts/mailer.text.erb` (text format alongside HTML)
2. Files in `app/views/devise/` (Devise template overrides)
3. Partial files starting with `_` in deeply nested directories

Verify the glob in `src/core/scanner.js` has a view rule that matches ALL files under `app/views/`:

```javascript
{ test: (p) => /^app\/views\/.*/.test(p), category: 7 },
```

This should already be broad enough. The issue may be that the glob in `src/providers/local-fs.js` doesn't include all template extensions. Check that the glob patterns in `scanStructure` include:

```javascript
...provider.glob('app/**/*.html.erb'),
...provider.glob('app/**/*.text.erb'),     // ← may be missing
...provider.glob('app/**/*.html.haml'),
...provider.glob('app/**/*.text.haml'),    // ← may be missing
```

Add any missing glob patterns for text format templates and other extensions like `.xml.erb`, `.json.erb`, `.js.erb`.

**Test:**

```javascript
it('counts text.erb templates alongside html.erb', () => {
  // Mock provider with both mailer.html.erb and mailer.text.erb in layouts
  // Verify both are counted
})
```

---

## Final Verification

After fixing all 12 issues:

```bash
npm test
```

All tests must pass. Then:

```bash
git add -A
git commit -m "fix: resolve 12 eval issues (v1.0.13 → v1.0.14)

- A: Anonymous block callbacks (before_save { ... } / before_create do...end)
- B: validates_presence_of multi-attribute parsing
- C: Devise sub-controllers in scope directories (4→12 detected)
- D: HAML fragment cache detection (- cache key do)
- E: Rails.cache.read/write/delete counting
- F: Paperclip as image processing library
- G: Blast radius test edges for Minitest files
- H: Custom rate limiting heuristic detection
- I: Auth subgraph filters irrelevant inherited models
- J: Mailer superclass full namespace capture
- K: Model count file_count alongside extracted count
- L: Text-format template glob coverage"

npm version patch
```

---

## Quick Reference

| Issue | File(s)                              | Summary                                |
| ----- | ------------------------------------ | -------------------------------------- |
| A     | `src/extractors/model.js`            | Block callback detection               |
| B     | `src/extractors/model.js`            | Multi-attribute old-style validators   |
| C     | `src/extractors/auth.js`             | Devise scope directory controller scan |
| D     | `src/extractors/caching.js`          | HAML `- cache` syntax                  |
| E     | `src/extractors/caching.js`          | Rails.cache.read/write/delete counting |
| F     | `src/extractors/storage.js`          | Paperclip image_processing detection   |
| G     | `src/core/graph.js`                  | Minitest test edges in graph           |
| H     | `src/extractors/api.js`              | Custom rate limiting heuristic         |
| I     | `src/tools/handlers/get-subgraph.js` | Auth subgraph relevance filter         |
| J     | `src/core/patterns/email.js`         | Mailer superclass namespace capture    |
| K     | `src/core/indexer.js`                | models_file_count in statistics        |
| L     | `src/core/scanner.js`                | Text-format template glob patterns     |
