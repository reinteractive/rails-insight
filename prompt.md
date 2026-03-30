# RailsInsight v1.0.10 → v1.0.11 — Fix Remaining Evaluation Issues

You are working on **RailsInsight**, a Rails-aware MCP server written in Node.js (ES modules). The codebase uses **Vitest** for testing.

## Context

A comprehensive evaluation was run against a Rails 6.1 application (72 models, 54 controllers, MySQL2, CanCanCan, Minitest, HAML+ERB, Devise with AdminUser and Member models, FriendlyId, Enumerize, Paperclip). The evaluation found 10 remaining issues. The previous fix round (v1.0.0 → v1.0.10) improved F1 from 0.78 to 0.88 and dropped hallucinations from 20 to 3. This prompt fixes the final 10.

## Ground Rules

1. **Run `npm test` before starting** to establish a baseline. Record how many tests pass.
2. **Fix one issue at a time.** After each fix, run the relevant test file to confirm the fix works.
3. **After completing all fixes**, run `npm test` (full suite) and confirm all tests pass.
4. **Do not change the MCP tool API surface** — tool names, parameter names, and response shapes must remain backward-compatible.
5. **Every fix must have at least one test.**
6. **Commit when done** with message: `fix: resolve 10 remaining eval issues from ellas-list v1.0.10 evaluation`

---

## ISSUE A: Commented-out config still parsed in detected_stack / version-detector

**File:** `src/core/version-detector.js`
**Severity:** HIGH
**Previous fix:** ISSUE-08 was fixed in `src/extractors/caching.js` and `src/extractors/storage.js` — those extractors now correctly ignore comment lines. But the **same bug still exists** in `src/core/version-detector.js` where it reads environment config files to detect `cacheStore`, `forceSSL`, and other framework settings.

**Problem:** `detectFramework()` reads `config/environments/production.rb` and matches `config.cache_store = :mem_cache_store` from a commented-out line (`# config.cache_store = :mem_cache_store`). The result propagates into `get_deep_analysis({ category: 'detected_stack' })` and `get_full_index`.

**Evidence:** Eval reports `cacheStore: 'mem_cache_store'` in detected_stack. The actual production.rb has this line commented out.

**Fix:** In `src/core/version-detector.js`, find the `detectFramework()` function. It reads `config/environments/production.rb` and applies regex to the raw content. Strip comment lines before matching:

```javascript
// In detectFramework(), approximately where prodConfig is used:
const prodConfigRaw = provider.readFile('config/environments/production.rb') || ''
const prodConfig = prodConfigRaw.split('\n').filter(l => !l.trim().startsWith('#')).join('\n')
```

Apply the same treatment to any other environment file reads in this function. Check `config/application.rb` reads too — they should also strip comments.

**Test:**

```javascript
it('ignores commented-out cache_store when detecting framework', () => {
  const provider = {
    readFile(path) {
      if (path === 'Gemfile') return "gem 'rails'"
      if (path === 'Gemfile.lock') return '  specs:\n    rails (7.1.0)'
      if (path === 'config/application.rb') return ''
      if (path === 'config/environments/production.rb') return [
        'Rails.application.configure do',
        '  # config.cache_store = :mem_cache_store',
        '  config.force_ssl = true',
        'end'
      ].join('\n')
      return null
    },
    fileExists() { return false }
  }
  const result = detectVersions(provider)
  expect(result.framework.cacheStore).not.toBe('mem_cache_store')
})
```

---

## ISSUE B: Devise sub-controllers in nested directories not discovered

**File:** `src/core/scanner.js` (classification rules)
**Severity:** MEDIUM

**Problem:** Controllers in `app/controllers/admin_users/` and `app/controllers/members/` (Devise-namespaced sub-controllers like `admin_users/sessions_controller.rb`, `members/registrations_controller.rb`) are not being indexed. The scanner finds 46 controllers but the filesystem has 54 — the 8 missing are all Devise sub-controllers in these two directories.

**Root cause:** The scanner's glob `app/**/*.rb` should find these files. The issue is likely in the classification rules in `src/core/scanner.js`. Check whether the auth-specific controller rules (for `sessions_controller`, `registrations_controller`, `passwords_controller`, `confirmations_controller`) at approximately line 100-115 correctly match paths like `app/controllers/admin_users/sessions_controller.rb`. These rules classify to category 8 (authentication), not category 2 (controllers). The problem is that these files are classified as authentication but then NOT extracted as controllers — the indexer only extracts controllers from category 2 entries.

**Fix:** Two options:

**Option 1 (preferred):** In `src/core/indexer.js`, when iterating entries for controller extraction, also include entries classified as category 8 (authentication) that are controller files:

```javascript
} else if (entry.categoryName === 'controllers' ||
           (entry.categoryName === 'authentication' && entry.path.includes('_controller.rb'))) {
  const ctrl = safeExtract(...)
  if (ctrl) {
    const name = ctrl.class || pathToClassName(entry.path)
    extractions.controllers[name] = ctrl
  }
}
```

**Option 2:** Change the scanner rules so that Devise sub-controllers in custom namespaces (like `admin_users/`, `members/`) are classified as category 2 (controllers) instead of category 8. Keep category 8 only for the auth-related files that are NOT controllers (like `config/initializers/devise.rb` and `app/models/session.rb`).

Either way, verify the fix by checking that the controller count after indexing matches the filesystem count.

**Test:**

```javascript
it('includes Devise sub-controllers from custom namespace directories', () => {
  // Mock scanner entries that include admin_users/sessions_controller.rb classified as auth
  // Verify it appears in extractions.controllers
})
```

---

## ISSUE C: Old-style validators (`validates_presence_of`, `validates_length_of`) not extracted

**File:** `src/core/patterns/model.js`, `src/extractors/model.js`
**Severity:** HIGH

**Problem:** The model validation extractor only matches modern Rails 3+ syntax (`validates :attr, presence: true`). Older Rails 2/3 multi-word validators are missed: `validates_presence_of`, `validates_length_of`, `validates_numericality_of`, `validates_uniqueness_of`, `validates_format_of`, `validates_inclusion_of`, `validates_exclusion_of`, `validates_associated`, `validates_attachment_content_type` (Paperclip), `validates_email_format_of` (gem).

**Evidence:** Article model has `validates_presence_of :title` — not captured. Activity model has `validates_length_of :registration_url` — not captured.

**Fix:**

1. Add a new pattern to `src/core/patterns/model.js`:

```javascript
validatesOldStyle: /^\s*validates_(\w+?)(?:_of)?\s+:(\w+)(?:,\s*(.+))?$/m,
```

2. In `src/extractors/model.js`, add extraction after the existing validations section:

```javascript
// Old-style validators: validates_presence_of, validates_length_of, etc.
const oldStyleRe = /^\s*validates_(\w+?)(?:_of)?\s+:(\w+)(?:,\s*(.+))?$/gm
while ((m = oldStyleRe.exec(content))) {
  const validationType = m[1] // 'presence', 'length', 'uniqueness', etc.
  const attr = m[2]
  validations.push({
    attributes: [attr],
    rules: `${validationType}: true${m[3] ? ', ' + m[3] : ''}`,
  })
}
```

**Test:**

```javascript
it('extracts validates_presence_of old-style validators', () => {
  const content = `class Article < ApplicationRecord
  validates_presence_of :title
  validates_length_of :body, minimum: 10
  validates_uniqueness_of :slug
  validates :status, presence: true
end`
  const result = extractModel(mockProvider(content), 'app/models/article.rb', 'Article')
  expect(result.validations.length).toBe(4)
  expect(result.validations.some(v => v.attributes.includes('title'))).toBe(true)
  expect(result.validations.some(v => v.attributes.includes('body'))).toBe(true)
  expect(result.validations.some(v => v.attributes.includes('slug'))).toBe(true)
})
```

---

## ISSUE D: `extend FriendlyId` excluded from model extends array

**File:** `src/extractors/model.js` (extends extraction, approximately line 70)
**Severity:** MEDIUM

**Problem:** Models with `extend FriendlyId` only have `Enumerize` in their extends array. FriendlyId is silently dropped. The current code has an explicit exclusion:

```javascript
while ((m = extendRe.exec(content))) {
  const mod = m[1]
  if (mod !== 'ActiveSupport::Concern' && mod !== 'FriendlyId') {
    extends_.push(mod)
  }
}
```

The `mod !== 'FriendlyId'` exclusion was added because FriendlyId is also captured via the dedicated `friendly_id` field. However, dropping it from `extends` causes the eval to mark it as MISSING.

**Fix:** Remove the `FriendlyId` exclusion. The `extends` array should reflect all `extend` calls in the source — the `friendly_id` field provides additional detail, not a replacement:

```javascript
while ((m = extendRe.exec(content))) {
  const mod = m[1]
  if (mod !== 'ActiveSupport::Concern') {
    extends_.push(mod)
  }
}
```

**Test:**

```javascript
it('includes FriendlyId in extends array', () => {
  const content = `class Article < ApplicationRecord
  extend FriendlyId
  extend Enumerize
  friendly_id :title, use: :slugged
end`
  const result = extractModel(mockProvider(content), 'app/models/article.rb', 'Article')
  expect(result.extends).toContain('FriendlyId')
  expect(result.extends).toContain('Enumerize')
  expect(result.friendly_id).toBeDefined()
})
```

---

## ISSUE E: Database adapter not detected when `config/database.yml` is absent

**File:** `src/extractors/config.js`, `src/core/version-detector.js`
**Severity:** HIGH

**Problem:** Many projects gitignore `config/database.yml`. When the file is absent, the database adapter returns `null`/`{}`. No fallback exists to detect the adapter from the Gemfile (which always exists).

**Fix:** In `src/extractors/config.js`, in the `extractConfig()` function, after the `database.yml` parsing block, add a Gemfile fallback:

```javascript
// Gemfile-based adapter fallback when database.yml is absent
if (!result.database.adapter) {
  const gemfile = provider.readFile('Gemfile') || ''
  if (/gem\s+['"]mysql2['"]/.test(gemfile)) result.database.adapter = 'mysql2'
  else if (/gem\s+['"]pg['"]/.test(gemfile)) result.database.adapter = 'postgresql'
  else if (/gem\s+['"]sqlite3['"]/.test(gemfile)) result.database.adapter = 'sqlite3'
  else if (/gem\s+['"]trilogy['"]/.test(gemfile)) result.database.adapter = 'trilogy'
  if (result.database.adapter) result.database.source = 'gemfile'
}
```

Also add the same fallback in `src/core/version-detector.js` if the database adapter is used there for framework detection. Check whether `config/database.yml.example` exists as a secondary fallback before the Gemfile:

```javascript
// Try database.yml.example as fallback
if (!result.database.adapter) {
  const dbExample = provider.readFile('config/database.yml.example')
  if (dbExample) {
    const parsed = parseYaml(dbExample)
    const section = parsed.production || parsed.development || parsed.default || {}
    result.database.adapter = section.adapter || null
    if (result.database.adapter) result.database.source = 'database.yml.example'
  }
}
```

**Test:**

```javascript
it('detects mysql2 adapter from Gemfile when database.yml is absent', () => {
  const provider = {
    readFile(path) {
      if (path === 'Gemfile') return "gem 'rails'\ngem 'mysql2', '~> 0.5'"
      if (path === 'config/database.yml') return null
      if (path === 'config/database.yml.example') return null
      return null
    }
  }
  const result = extractConfig(provider)
  expect(result.database.adapter).toBe('mysql2')
})

it('detects adapter from database.yml.example when database.yml is absent', () => {
  const provider = {
    readFile(path) {
      if (path === 'config/database.yml') return null
      if (path === 'config/database.yml.example') return 'development:\n  adapter: postgresql\n  database: myapp_dev'
      return null
    }
  }
  const result = extractConfig(provider)
  expect(result.database.adapter).toBe('postgresql')
})
```

---

## ISSUE F: CanCan Ability class not found when using non-standard filename

**File:** `src/extractors/authorization.js`
**Severity:** HIGH

**Problem:** The CanCanCan extractor only checks `app/models/ability.rb`. This project uses `app/models/admin_ability.rb`. The fix prompt from the previous round specified this fix (ISSUE-20) but it was not applied.

**Fix:** In `src/extractors/authorization.js`, after the existing CanCanCan detection block (approximately where `abilityContent` is read), replace the hardcoded path lookup with a broader scan:

```javascript
// CanCanCan - find Ability class
if (hasCanCan) {
  if (!result.strategy) result.strategy = 'cancancan'

  // Try standard path first
  let abilityContent = provider.readFile('app/models/ability.rb')
  let abilityFile = 'app/models/ability.rb'

  // Fallback: scan model entries for files containing CanCan::Ability
  if (!abilityContent || !AUTHORIZATION_PATTERNS.abilityClass.test(abilityContent)) {
    const modelEntries = entries.filter(e =>
      (e.categoryName === 'models' || e.category === 1 || e.categoryName === 'authorization' || e.category === 9) &&
      e.path.endsWith('.rb')
    )
    for (const entry of modelEntries) {
      const content = provider.readFile(entry.path)
      if (!content) continue
      if (AUTHORIZATION_PATTERNS.includeCanCan.test(content) || AUTHORIZATION_PATTERNS.abilityClass.test(content)) {
        abilityContent = content
        abilityFile = entry.path
        break
      }
    }
  }

  if (abilityContent && (AUTHORIZATION_PATTERNS.abilityClass.test(abilityContent) || AUTHORIZATION_PATTERNS.includeCanCan.test(abilityContent))) {
    const abilities = []
    const canRe = new RegExp(AUTHORIZATION_PATTERNS.canDef.source, 'gm')
    let m
    while ((m = canRe.exec(abilityContent))) {
      abilities.push({ type: 'can', definition: m[1].trim() })
    }
    const cannotRe = new RegExp(AUTHORIZATION_PATTERNS.cannotDef.source, 'gm')
    while ((m = cannotRe.exec(abilityContent))) {
      abilities.push({ type: 'cannot', definition: m[1].trim() })
    }
    result.abilities = abilities.length > 0 ? abilities : null

    // Extract roles from has_role? calls
    const roleRe = /has_role\?\s*\(:?['"]?(\w+)['"]?\)/g
    const roles = new Set()
    while ((m = roleRe.exec(abilityContent))) {
      roles.add(m[1])
    }
    if (roles.size > 0) {
      result.roles = { source: 'ability_class', model: 'User', roles: [...roles], file: abilityFile }
    }
  }
}
```

**Test:**

```javascript
it('finds CanCan Ability in non-standard filename', () => {
  const entries = [
    { path: 'app/models/admin_ability.rb', category: 1, categoryName: 'models', type: 'ruby' }
  ]
  const provider = {
    readFile(path) {
      if (path === 'app/models/ability.rb') return null
      if (path === 'app/models/admin_ability.rb') return `class AdminAbility
  include CanCan::Ability
  def initialize(user)
    if user.has_role?(:admin)
      can :manage, :all
    elsif user.has_role?(:editor)
      can :read, Article
    end
  end
end`
      return null
    }
  }
  const result = extractAuthorization(provider, entries, { gems: { cancancan: {} } })
  expect(result.strategy).toBe('cancancan')
  expect(result.abilities).not.toBeNull()
  expect(result.abilities.length).toBeGreaterThan(0)
  expect(result.roles.roles).toContain('admin')
  expect(result.roles.roles).toContain('editor')
})
```

---

## ISSUE G: Root route not matched for `root :to => 'controller#action'` syntax

**File:** `src/core/patterns/route.js`, `src/extractors/routes.js`
**Severity:** HIGH

**Problem:** The root route regex in `src/core/patterns/route.js` is:

```javascript
root: /^\s*root\s+(?:to:\s*)?['"]([^'"#]+)#?([^'"]*)['"']/m,
```

This matches `root 'homepage#index'` and `root to: 'homepage#index'` but does NOT match the older hash rocket syntax: `root :to => 'homepage#index'`.

**Fix:** Update the root route pattern to also handle the hash rocket form:

```javascript
root: /^\s*root\s+(?:(?::to\s*=>|to:)\s*)?['"]([^'"#]+)#?([^'"]*)['"']/m,
```

This adds `:to\s*=>` as an alternative to `to:`.

**Test:**

```javascript
it('extracts root route with hash rocket syntax', () => {
  const provider = {
    readFile(path) {
      if (path === 'config/routes.rb') return `Rails.application.routes.draw do
  root :to => 'homepage#index'
end`
      return null
    }
  }
  const result = extractRoutes(provider)
  expect(result.root).toBeDefined()
  expect(result.root.controller).toBe('homepage')
  expect(result.root.action).toBe('index')
})

it('still extracts root route with modern to: syntax', () => {
  const provider = {
    readFile(path) {
      if (path === 'config/routes.rb') return `Rails.application.routes.draw do
  root to: 'pages#home'
end`
      return null
    }
  }
  const result = extractRoutes(provider)
  expect(result.root).toBeDefined()
  expect(result.root.controller).toBe('pages')
})

it('still extracts root route with bare string syntax', () => {
  const provider = {
    readFile(path) {
      if (path === 'config/routes.rb') return `Rails.application.routes.draw do
  root 'dashboard#show'
end`
      return null
    }
  }
  const result = extractRoutes(provider)
  expect(result.root).toBeDefined()
  expect(result.root.controller).toBe('dashboard')
})
```

---

## ISSUE H: `get_well_tested_examples` returns empty for Minitest projects

**File:** `src/tools/handlers/get-well-tested-examples.js`, `src/extractors/test-conventions.js`
**Severity:** HIGH

**Problem:** The `pattern_reference_files` array in test conventions is always populated from `spec/**/*_spec.rb` files. For Minitest projects with `test/**/*_test.rb` files, it's empty — so `get_well_tested_examples` returns nothing.

**Fix:** In `src/extractors/test-conventions.js`, the `findPatternReferences()` function filters for `_spec.rb` files only. Extend it to also handle `_test.rb` files:

```javascript
function findPatternReferences(provider, specEntries) {
  const byCategory = {}

  for (const entry of specEntries) {
    const cat = entry.specCategory
    if (!cat || cat === 'factories' || cat === 'support') continue

    const content = provider.readFile(entry.path)
    if (!content) continue

    // Count structural complexity — handle both RSpec and Minitest styles
    const describeCount = (content.match(/^\s*(?:describe|context|class\s+\w+Test)\s/gm) || []).length
    const exampleCount = (content.match(/^\s*(?:it\s|def\s+test_|test\s+['"])/gm) || []).length

    // Skip trivially small files
    if (exampleCount < 3) continue

    if (!byCategory[cat] || describeCount > byCategory[cat].describe_count) {
      byCategory[cat] = {
        path: entry.path,
        category: cat,
        describe_count: describeCount,
        example_count: exampleCount,
      }
    }
  }

  return Object.values(byCategory)
}
```

Also verify that the `specEntries` parameter includes Minitest files. The calling code filters by `e.categoryName === 'testing' && e.path.endsWith('_spec.rb')`. This needs to also include `_test.rb`:

```javascript
const specEntries = entries.filter(
  (e) => e.categoryName === 'testing' && (e.path.endsWith('_spec.rb') || e.path.endsWith('_test.rb')),
)
```

**Test:**

```javascript
it('finds well-tested examples from Minitest test files', () => {
  const entries = [
    { path: 'test/models/user_test.rb', category: 19, categoryName: 'testing', specCategory: 'model_tests', type: 'ruby' },
  ]
  const provider = {
    readFile(path) {
      if (path === 'test/models/user_test.rb') return `class UserTest < ActiveSupport::TestCase
  test "validates name presence" do
    user = User.new(name: nil)
    assert_not user.valid?
  end

  test "validates email format" do
    user = User.new(email: "bad")
    assert_not user.valid?
  end

  test "creates with valid attributes" do
    user = User.new(name: "Test", email: "test@example.com")
    assert user.valid?
  end

  test "has many posts" do
    assert_respond_to User.new, :posts
  end
end`
      return null
    }
  }
  // Call extractTestConventions or findPatternReferences
  // Verify pattern_reference_files is not empty
})
```

---

## ISSUE I: `before_action` with multiple method symbols parsed incorrectly

**File:** `src/extractors/controller.js` (filter extraction)
**Severity:** MEDIUM

**Problem:** When a `before_action` lists multiple bare symbols:

```ruby
before_action :set_current_city, :get_global_content, :add_additional_views
```

The extractor captures `:set_current_city` as the method and treats `:get_global_content, :add_additional_views` as `options`. Rails actually registers three separate filters.

**Root cause:** The filter regex in `src/core/patterns/controller.js` captures only the first symbol as the method and everything after the first comma as options:

```javascript
filterType: /^\s*((?:before|after|around|skip_before|skip_after|skip_around)_action)\s+:?(\w+!?)(?:,\s*(.+))?$/m,
```

**Fix:** In `src/extractors/controller.js`, after matching a filter line, check if the "options" portion contains additional bare symbols (`:word` not followed by `:`). If so, split them into separate filter entries:

```javascript
// After the filter matching loop, post-process to expand multi-method filters:
const expandedFilters = []
for (const filter of filters) {
  const opts = filter.options
  if (!opts) {
    expandedFilters.push(filter)
    continue
  }

  // Check if options starts with bare symbols (not keyword args)
  // Bare symbols: :word — Keyword args: word: value
  const parts = opts.split(',').map(p => p.trim())
  const additionalMethods = []
  const realOptions = []

  for (const part of parts) {
    if (/^:(\w+!?)$/.test(part)) {
      // This is another method symbol, not a keyword option
      additionalMethods.push(part.replace(/^:/, ''))
    } else {
      // This is a keyword option (like only: [:show], if: :condition)
      realOptions.push(part)
    }
  }

  // Keep the original filter with corrected options
  expandedFilters.push({
    ...filter,
    options: realOptions.length > 0 ? realOptions.join(', ') : null,
  })

  // Add separate filter entries for additional methods
  for (const method of additionalMethods) {
    expandedFilters.push({
      type: filter.type,
      method,
      options: realOptions.length > 0 ? realOptions.join(', ') : null,
    })
  }
}
```

Replace `filters` with `expandedFilters` before returning.

**Test:**

```javascript
it('expands before_action with multiple method symbols into separate filters', () => {
  const content = `class ApplicationController < ActionController::Base
  before_action :set_locale, :set_current_user, :track_visit
  before_action :authenticate!, only: [:create, :update]
end`
  const result = extractController(mockProvider(content), 'app/controllers/application_controller.rb')
  const baFilters = result.filters.filter(f => f.type === 'before_action')
  expect(baFilters.length).toBe(4) // set_locale, set_current_user, track_visit, authenticate!
  expect(baFilters.map(f => f.method)).toContain('set_locale')
  expect(baFilters.map(f => f.method)).toContain('set_current_user')
  expect(baFilters.map(f => f.method)).toContain('track_visit')
  expect(baFilters.map(f => f.method)).toContain('authenticate!')
  // authenticate! should have options, the other three should not
  const authFilter = baFilters.find(f => f.method === 'authenticate!')
  expect(authFilter.options).toContain('only')
})
```

---

## ISSUE J: Model count inconsistency — statistics.models vs manifest.stats.models

**File:** `src/core/indexer.js` (`computeStatistics`)
**Severity:** MEDIUM

**Problem:** `statistics.models` reports 69, `manifest.stats.models` reports 72. The filesystem has 72 model files. The statistics count is computed from `Object.keys(extractions.models).length` which only counts successfully extracted models — if 3 models fail extraction (e.g., empty files, parse errors, or concern misclassification), they're in the manifest but not in extractions.

**Fix:** Align the two counts. The manifest count (72) is the file-based truth. The statistics count should match. There are two approaches:

**Option 1 (show both):** Report both counts with clarity:

```javascript
models: Object.keys(extractions.models || {}).filter(
  (k) => (extractions.models[k]?.type || 'model') !== 'concern'
).length,
models_total_files: (manifest.stats || {}).models || 0,
```

**Option 2 (investigate the gap):** Check `extraction_errors` for the 3 missing models and fix the underlying extraction failures. The `extraction_errors` array in the index output already logs which extractors failed. If 3 model files failed extraction, the errors should be listed there. Check if the gap is caused by files that:

- Are empty or contain only comments
- Use unconventional class definitions the extractor can't parse
- Are concerns misclassified as models in the manifest but filtered out in statistics

For now, at minimum, add the file-based count alongside the extraction-based count:

```javascript
function computeStatistics(manifest, extractions, relationships) {
  const entries = manifest.entries || []
  const manifestModelCount = (manifest.stats || {}).models || 0
  const extractedModelCount = Object.keys(extractions.models || {}).length

  return {
    total_files: entries.length,
    models: extractedModelCount,
    models_in_manifest: manifestModelCount,
    // ... rest unchanged
  }
}
```

**Test:**

```javascript
it('statistics.models counts extracted models consistently', () => {
  // Build a mock manifest with 5 model entries and extractions with 5 models
  // Verify statistics.models === 5
  // Then add a 6th model entry with no extraction (simulating parse failure)
  // Verify statistics.models === 5 and statistics.models_in_manifest === 6
})
```

---

## Final Verification

After fixing all 10 issues:

```bash
npm test
```

All tests must pass. Then commit:

```bash
git add -A
git commit -m "fix: resolve 10 remaining eval issues from ellas-list v1.0.10 evaluation

- ISSUE A: Strip comments in version-detector before config matching
- ISSUE B: Include Devise sub-controllers from auth-classified entries
- ISSUE C: Extract old-style validates_presence_of validators
- ISSUE D: Remove FriendlyId exclusion from extends array
- ISSUE E: Gemfile and database.yml.example fallback for adapter detection
- ISSUE F: Scan all model files for CanCan::Ability class
- ISSUE G: Handle root :to => hash rocket route syntax
- ISSUE H: Include Minitest files in well-tested examples
- ISSUE I: Expand multi-method before_action into separate filters
- ISSUE J: Add models_in_manifest count alongside extracted count"

npm version patch
```

---

## Quick Reference

| Issue | File(s)                                                 | Summary                                          |
| ----- | ------------------------------------------------------- | ------------------------------------------------ |
| A     | `src/core/version-detector.js`                          | Strip comments before config matching            |
| B     | `src/core/indexer.js` or `src/core/scanner.js`          | Extract controllers from auth-classified entries |
| C     | `src/core/patterns/model.js`, `src/extractors/model.js` | Add validates_presence_of regex                  |
| D     | `src/extractors/model.js`                               | Remove FriendlyId from extends exclusion         |
| E     | `src/extractors/config.js`                              | Gemfile + database.yml.example fallback          |
| F     | `src/extractors/authorization.js`                       | Scan model files for CanCan::Ability             |
| G     | `src/core/patterns/route.js`                            | Add `:to =>` hash rocket syntax                  |
| H     | `src/extractors/test-conventions.js`                    | Include \_test.rb in pattern references          |
| I     | `src/extractors/controller.js`                          | Expand multi-symbol before_action                |
| J     | `src/core/indexer.js`                                   | Align model count with manifest                  |
