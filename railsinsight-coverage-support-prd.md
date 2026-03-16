# RailsInsight Coverage Orchestrator Support — Implementation PRD

## Agent Instruction Prompt

You are implementing a set of extensions to RailsInsight, a Rails-aware codebase indexer that runs as an MCP server. RailsInsight analyses Rails applications and exposes structural data through MCP tools. You are adding support for a test coverage orchestrator that will use RailsInsight's data to systematically generate RSpec test coverage.

This is a multi-file implementation across 3 new extractors, 7 modifications to existing files, 5 new MCP tools, and full test coverage for everything you build.

**Read the entire PRD below before writing any code.** Understand the dependencies between components — some extractors depend on others, and the MCP tools depend on all extractors being complete.

**Implementation order:**

1. Add `FACTORY_PATTERNS` to `src/core/patterns.js`
2. Extend `src/core/scanner.js` with `specCategory` field
3. Extend `src/extractors/model.js` with `method_line_ranges`
4. Extend `src/extractors/controller.js` with action line ranges
5. Extend `src/extractors/tier2.js` testing section
6. Create `src/extractors/test-conventions.js`
7. Create `src/extractors/factory-registry.js`
8. Create `src/extractors/coverage-snapshot.js`
9. Extend `src/core/graph.js` with `tests` edge type
10. Extend `src/core/indexer.js` to call new extractors
11. Register 5 new MCP tools in `src/tools/free-tools.js`
12. Write tests for all new extractors and modified functions

**Rules:**

- Follow the existing code patterns exactly. Study how existing extractors are structured before writing new ones. Every extractor in `src/extractors/` follows the same pattern: import patterns from `src/core/patterns.js`, export a function that takes `provider` and `entries`, use regex to parse file content, return a structured object.
- Every regex pattern goes in `src/core/patterns.js` in its own named block. Extractors import patterns — they do not define their own regex inline.
- New MCP tools follow the same pattern as existing tools in `src/tools/free-tools.js`: use zod for input validation, return via the `respond()` helper, handle the missing-index case with `noIndex()`.
- All new extractors must have corresponding test files using `createMemoryProvider()` from `test/helpers/mock-provider.js`. Look at existing tests in `test/extractors/` for the pattern.
- Do not change any existing test expectations. Your changes must be backward-compatible — existing tools and extractors must return the same data they currently return, with your additions as new fields.
- Use JSDoc comments on all exported functions, matching the style of existing extractors.

**Do not:**
- Rename any existing fields or functions
- Change the signature of any existing exported function
- Remove any existing functionality
- Add any new npm dependencies — everything is regex-based and uses the existing provider interface

---

## 1. Patterns: Add FACTORY_PATTERNS to `src/core/patterns.js`

### Location

Add a new block after the existing `CONFIG_PATTERNS` section (around line 340), before the closing of the file.

### Specification

```javascript
// ============================================================
// FACTORY PATTERNS (FactoryBot)
// ============================================================
export const FACTORY_PATTERNS = {
  // Factory definition: factory :name or factory :name, class: "ClassName"
  factoryDef: /^\s*factory\s+:(\w+)(?:,\s*class:\s*['"]?:?(\w+(?:::\w+)*)['"]?)?\s*do/m,

  // Trait definition
  trait: /^\s*trait\s+:(\w+)\s*do/m,

  // Sequence definition
  sequence: /^\s*sequence\s*\(:(\w+)\)/m,
  sequenceBlock: /^\s*sequence\s+:(\w+)\s/m,

  // Association reference inside factory
  association: /^\s*association\s+:(\w+)(?:,\s*(.+))?/m,

  // Transient block
  transient: /^\s*transient\s+do/m,

  // After callbacks
  afterCreate: /^\s*after\s*\(:create\)/m,
  afterBuild: /^\s*after\s*\(:build\)/m,

  // Attribute with block: name { value }
  attributeBlock: /^\s*(\w+)\s*\{([^}]*)\}/m,

  // Attribute with static value (less common)
  attributeStatic: /^\s*(\w+)\s+['"]([^'"]+)['"]/m,
}
```

### Test

Add a basic pattern match test in `test/core/patterns.test.js` (if it exists) or verify patterns work within the factory-registry extractor tests.

---

## 2. Scanner: Add `specCategory` field to `src/core/scanner.js`

### Location

Modify the `classifyFile` function.

### What to change

After a file is classified as category 19 (`testing`), add a `specCategory` field based on the path prefix. This is a non-breaking addition — existing code that reads `ManifestEntry` objects without checking `specCategory` is unaffected.

### Specification

Update the `ManifestEntry` typedef at the top of the file:

```javascript
/**
 * @typedef {Object} ManifestEntry
 * @property {string} path - Relative file path
 * @property {number} category - Category number (1-56)
 * @property {string} categoryName - Human-readable category name
 * @property {string} type - File type (ruby, js, erb, yml, etc.)
 * @property {string|null} [specCategory] - Sub-category for test files (category 19 only)
 */
```

In the `classifyFile` function, after the entry is created and before it's returned, add the specCategory assignment:

```javascript
function classifyFile(path) {
  for (const rule of RULES) {
    if (rule.test(path)) {
      const entry = {
        path,
        category: rule.category,
        categoryName: CATEGORIES[rule.category],
        type: detectType(path),
      }

      // Sub-categorise test files for coverage orchestrator support
      if (entry.category === 19) {
        entry.specCategory = classifySpecFile(path)
      }

      return entry
    }
  }
  return null
}
```

Add the helper function:

```javascript
/**
 * Sub-classify a spec/test file by its directory.
 * @param {string} path
 * @returns {string|null}
 */
function classifySpecFile(path) {
  if (path.startsWith('spec/models/')) return 'model_specs'
  if (path.startsWith('spec/requests/')) return 'request_specs'
  if (path.startsWith('spec/controllers/')) return 'controller_specs'
  if (path.startsWith('spec/services/')) return 'service_specs'
  if (path.startsWith('spec/jobs/')) return 'job_specs'
  if (path.startsWith('spec/mailers/')) return 'mailer_specs'
  if (path.startsWith('spec/policies/')) return 'policy_specs'
  if (path.startsWith('spec/components/')) return 'component_specs'
  if (path.startsWith('spec/forms/')) return 'form_specs'
  if (path.startsWith('spec/factories/')) return 'factories'
  if (path.startsWith('spec/support/')) return 'support'
  if (path.startsWith('spec/shared_examples/')) return 'shared_examples'
  if (path.startsWith('spec/shared_contexts/')) return 'shared_contexts'
  if (path.startsWith('test/models/')) return 'model_tests'
  if (path.startsWith('test/controllers/')) return 'controller_tests'
  if (path.startsWith('test/integration/')) return 'integration_tests'
  if (path.startsWith('test/factories/')) return 'factories'
  return null
}
```

Export `classifySpecFile` alongside the existing exports for testing.

### Test

Add tests to the scanner test file verifying:
- `spec/models/user_spec.rb` gets `specCategory: 'model_specs'`
- `spec/requests/orders_spec.rb` gets `specCategory: 'request_specs'`
- `spec/factories/users.rb` gets `specCategory: 'factories'`
- `spec/support/auth_helper.rb` gets `specCategory: 'support'`
- `app/models/user.rb` (not a test file) does NOT get a `specCategory` field
- `spec/some_random_spec.rb` gets `specCategory: null`

---

## 3. Model Extractor: Add `method_line_ranges` to `src/extractors/model.js`

### Location

Modify the `extractModel` function, specifically the public methods extraction block near the end of the function (the block that builds the `public_methods` array).

### What to change

In addition to collecting method names, track the start and end line numbers (1-indexed) for each public method. Add a `method_line_ranges` field to the returned object.

### Specification

Replace the existing public methods extraction block with one that also tracks line ranges:

```javascript
// Public instance method names with line ranges
const public_methods = []
const method_line_ranges = {}
{
  const methodLines = content.split('\n')
  let inPrivate = false
  let currentMethodName = null
  let currentMethodStart = null

  for (let i = 0; i < methodLines.length; i++) {
    const line = methodLines[i]
    const lineNumber = i + 1 // 1-indexed for SimpleCov compatibility

    if (/^\s*(private|protected)\s*$/.test(line)) {
      // Close current method if open
      if (currentMethodName && !inPrivate) {
        method_line_ranges[currentMethodName] = {
          start: currentMethodStart,
          end: lineNumber - 1,
        }
      }
      inPrivate = true
      currentMethodName = null
      continue
    }

    const mm = line.match(/^\s*def\s+(\w+[?!=]?)/)
    if (mm) {
      // Close previous method
      if (currentMethodName && !inPrivate) {
        method_line_ranges[currentMethodName] = {
          start: currentMethodStart,
          end: lineNumber - 1,
        }
      }

      currentMethodName = mm[1]
      currentMethodStart = lineNumber

      if (!inPrivate && mm[1] !== 'initialize') {
        public_methods.push(mm[1])
      }
    }
  }

  // Close final method
  if (currentMethodName && !inPrivate) {
    method_line_ranges[currentMethodName] = {
      start: currentMethodStart,
      end: methodLines.length,
    }
  }
}
```

Add `method_line_ranges` to the return object, immediately after `public_methods`:

```javascript
return {
  // ... all existing fields unchanged ...
  public_methods,
  method_line_ranges,  // NEW
}
```

### Backward compatibility

The existing `public_methods` array is unchanged. `method_line_ranges` is a new additive field. No existing consumers break.

### Test

Add tests to the model extractor test file verifying:
- A model with 2 public methods returns correct line ranges for each
- Line ranges are 1-indexed
- Methods after `private` keyword are excluded from `method_line_ranges`
- The `initialize` method is excluded
- A model with no public methods returns an empty `method_line_ranges` object

---

## 4. Controller Extractor: Add action line ranges to `src/extractors/controller.js`

### Location

Modify the `extractController` function, specifically the actions extraction block.

### What to change

Same concept as the model extractor change. Track line ranges for each action (public method). Add `action_line_ranges` to the returned object.

### Specification

Replace the existing actions extraction block:

```javascript
// Actions (public methods before private/protected) with line ranges
const actions = []
const action_line_ranges = {}
const lines = content.split('\n')
let inPublic = true
let currentActionName = null
let currentActionStart = null
const visRe = /^\s*(private|protected)\s*$/
const methodRe = /^\s*def\s+(\w+)/

for (let i = 0; i < lines.length; i++) {
  const line = lines[i]
  const lineNumber = i + 1

  if (visRe.test(line)) {
    // Close current action if open
    if (currentActionName && inPublic) {
      action_line_ranges[currentActionName] = {
        start: currentActionStart,
        end: lineNumber - 1,
      }
    }
    inPublic = false
    currentActionName = null
    continue
  }

  const mm = line.match(methodRe)
  if (mm) {
    // Close previous action
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
    } else {
      currentActionName = null
    }
  }
}

// Close final action
if (currentActionName && inPublic) {
  action_line_ranges[currentActionName] = {
    start: currentActionStart,
    end: lines.length,
  }
}
```

Add `action_line_ranges` to the return object, immediately after `actions`:

```javascript
return {
  // ... all existing fields unchanged ...
  actions,
  action_line_ranges,  // NEW
  // ... remaining fields ...
}
```

### Test

Verify:
- A controller with `index`, `show`, `create` actions returns correct line ranges
- Actions after `private` are excluded from `action_line_ranges`
- Existing `actions` array is identical to before

---

## 5. Tier 2 Extractor: Extend testing section in `src/extractors/tier2.js`

### Location

Modify the `extractTesting` function.

### What to change

Add `spec_style`, `factories_dir`, `fixtures_dir`, and `faker` fields to the testing result.

### Specification

```javascript
function extractTesting(provider, entries, gems) {
  const result = {
    framework: null,
    factories: !!gems.factory_bot_rails,
    system_tests: !!gems.capybara,
    coverage: !!gems.simplecov,
    mocking: [],
    parallel: !!gems.parallel_tests,
    // NEW fields below
    faker: !!gems.faker,
    spec_style: detectSpecStyle(entries),
    factories_dir: detectFactoriesDir(provider),
    fixtures_dir: detectFixturesDir(provider),
  }

  if (gems['rspec-rails']) {
    result.framework = 'rspec'
  } else if (entries.some((e) => e.path.startsWith('test/'))) {
    result.framework = 'minitest'
  }

  if (gems.webmock) result.mocking.push('webmock')
  if (gems.vcr) result.mocking.push('vcr')

  return result
}

/**
 * Detect whether the project uses request specs or controller specs.
 * @param {Array<{path: string}>} entries
 * @returns {{primary: string, request_count: number, controller_count: number}}
 */
function detectSpecStyle(entries) {
  const requestCount = entries.filter(
    (e) => e.path.startsWith('spec/requests/')
  ).length
  const controllerCount = entries.filter(
    (e) => e.path.startsWith('spec/controllers/')
  ).length

  return {
    primary: requestCount >= controllerCount ? 'request' : 'controller',
    request_count: requestCount,
    controller_count: controllerCount,
    has_mixed: requestCount > 0 && controllerCount > 0,
  }
}

/**
 * Detect the factories directory.
 * @param {import('../providers/interface.js').FileProvider} provider
 * @returns {string|null}
 */
function detectFactoriesDir(provider) {
  if (provider.fileExists('spec/factories')) return 'spec/factories'
  if (provider.fileExists('test/factories')) return 'test/factories'
  return null
}

/**
 * Detect the fixtures directory.
 * @param {import('../providers/interface.js').FileProvider} provider
 * @returns {string|null}
 */
function detectFixturesDir(provider) {
  if (provider.fileExists('spec/fixtures')) return 'spec/fixtures'
  if (provider.fileExists('test/fixtures')) return 'test/fixtures'
  return null
}
```

### Test

Verify:
- Project with 5 request specs and 2 controller specs returns `primary: 'request'`
- Project with only controller specs returns `primary: 'controller'`
- `faker` is true when faker gem is present
- `factories_dir` detects `spec/factories` when it exists
- Existing fields (`framework`, `factories`, `system_tests`, etc.) are unchanged

---

## 6. New Extractor: `src/extractors/test-conventions.js`

### Purpose

Deep analysis of how the project writes its tests. The coverage orchestrator uses this to generate specs that match the project's existing style.

### File location

`src/extractors/test-conventions.js`

### Specification

```javascript
/**
 * Test Conventions Extractor
 * Analyses existing spec files to detect testing patterns, styles,
 * and conventions used by the project.
 *
 * @module test-conventions
 */

/**
 * Extract test conventions from existing spec files.
 * @param {import('../providers/interface.js').FileProvider} provider
 * @param {Array<{path: string, category: number, categoryName: string, specCategory?: string}>} entries
 * @param {{gems?: object}} gemInfo
 * @returns {object}
 */
export function extractTestConventions(provider, entries, gemInfo = {}) {
  const gems = gemInfo.gems || {}

  const result = {
    // Spec file style
    spec_style: detectSpecStyle(entries),

    // Let style preference
    let_style: null,          // 'lazy' | 'eager' | 'mixed'
    let_count: 0,
    let_bang_count: 0,

    // Subject usage
    subject_usage: false,
    subject_count: 0,

    // described_class usage
    described_class_usage: false,

    // Shared examples
    shared_examples: [],      // names of defined shared examples
    shared_examples_count: 0,

    // Shared contexts
    shared_contexts: [],      // names of defined shared contexts
    shared_contexts_count: 0,

    // Custom matchers
    custom_matchers: [],

    // Authentication helper
    auth_helper: detectAuthHelper(provider, entries, gems),

    // Database strategy
    database_strategy: detectDatabaseStrategy(provider, gems),

    // Factory tool
    factory_tool: gems.factory_bot_rails || gems.factory_bot
      ? 'factory_bot' : gems.fabrication ? 'fabrication' : null,

    // Spec file counts by category
    spec_counts: {},

    // Well-tested files (candidates for pattern reference)
    pattern_reference_files: [],
  }

  // Scan spec files for convention patterns
  const specEntries = entries.filter(
    (e) => e.category === 19 && e.path.endsWith('_spec.rb')
  )

  // Count spec files by specCategory
  for (const entry of specEntries) {
    const cat = entry.specCategory || 'other'
    result.spec_counts[cat] = (result.spec_counts[cat] || 0) + 1
  }

  // Sample up to 20 spec files to detect conventions (avoid reading hundreds)
  const sampleSize = Math.min(specEntries.length, 20)
  const sampledEntries = specEntries.slice(0, sampleSize)

  for (const entry of sampledEntries) {
    const content = provider.readFile(entry.path)
    if (!content) continue

    // Let style detection
    const letMatches = (content.match(/^\s*let\s*\(/gm) || []).length
    const letBangMatches = (content.match(/^\s*let!\s*\(/gm) || []).length
    result.let_count += letMatches
    result.let_bang_count += letBangMatches

    // Subject usage
    if (/^\s*subject\s*[\s{(]/m.test(content)) {
      result.subject_usage = true
      result.subject_count++
    }

    // described_class usage
    if (/described_class/.test(content)) {
      result.described_class_usage = true
    }
  }

  // Determine let style
  if (result.let_count > 0 || result.let_bang_count > 0) {
    const ratio = result.let_bang_count / (result.let_count + result.let_bang_count)
    if (ratio > 0.7) result.let_style = 'eager'
    else if (ratio < 0.3) result.let_style = 'lazy'
    else result.let_style = 'mixed'
  }

  // Scan spec/support/ for shared examples, shared contexts, and custom matchers
  const supportEntries = entries.filter(
    (e) => e.path.startsWith('spec/support/') && e.path.endsWith('.rb')
  )

  for (const entry of supportEntries) {
    const content = provider.readFile(entry.path)
    if (!content) continue

    // Shared examples
    const sharedExRe = /(?:shared_examples_for|shared_examples|RSpec\.shared_examples)\s+['"]([^'"]+)['"]/g
    let m
    while ((m = sharedExRe.exec(content))) {
      result.shared_examples.push(m[1])
    }

    // Shared contexts
    const sharedCtxRe = /(?:shared_context|RSpec\.shared_context)\s+['"]([^'"]+)['"]/g
    while ((m = sharedCtxRe.exec(content))) {
      result.shared_contexts.push(m[1])
    }

    // Custom matchers
    const matcherRe = /RSpec::Matchers\.define\s+:(\w+)/g
    while ((m = matcherRe.exec(content))) {
      result.custom_matchers.push(m[1])
    }

    // Also check for define_negated_matcher
    const negatedRe = /define_negated_matcher\s+:(\w+)/g
    while ((m = negatedRe.exec(content))) {
      result.custom_matchers.push(m[1])
    }
  }

  // Also check spec/shared_examples/ and spec/shared_contexts/ directories
  const sharedExampleEntries = entries.filter(
    (e) => e.path.startsWith('spec/shared_examples/') && e.path.endsWith('.rb')
  )
  for (const entry of sharedExampleEntries) {
    const content = provider.readFile(entry.path)
    if (!content) continue
    const re = /(?:shared_examples_for|shared_examples)\s+['"]([^'"]+)['"]/g
    let m
    while ((m = re.exec(content))) {
      result.shared_examples.push(m[1])
    }
  }

  result.shared_examples_count = result.shared_examples.length
  result.shared_contexts_count = result.shared_contexts.length

  // Find well-tested files as pattern references
  // Select the largest (most examples) spec file per specCategory
  result.pattern_reference_files = findPatternReferences(provider, specEntries)

  return result
}
```

### Helper functions to include in the same file

```javascript
/**
 * Detect spec style (request vs controller specs).
 * @param {Array<{path: string}>} entries
 * @returns {{primary: string, request_count: number, controller_count: number, has_mixed: boolean}}
 */
function detectSpecStyle(entries) {
  const requestCount = entries.filter(
    (e) => e.path.startsWith('spec/requests/')
  ).length
  const controllerCount = entries.filter(
    (e) => e.path.startsWith('spec/controllers/')
  ).length

  return {
    primary: requestCount >= controllerCount ? 'request' : 'controller',
    request_count: requestCount,
    controller_count: controllerCount,
    has_mixed: requestCount > 0 && controllerCount > 0,
  }
}

/**
 * Detect authentication test helper.
 * @param {import('../providers/interface.js').FileProvider} provider
 * @param {Array<{path: string}>} entries
 * @param {object} gems
 * @returns {{strategy: string, helper_method: string|null, helper_file: string|null, setup_location: string|null}}
 */
function detectAuthHelper(provider, entries, gems) {
  const result = {
    strategy: null,
    helper_method: null,
    helper_file: null,
    setup_location: null,
  }

  // Check rails_helper.rb for Devise test helpers
  const railsHelper = provider.readFile('spec/rails_helper.rb')
  if (railsHelper) {
    if (/Devise::Test::IntegrationHelpers/.test(railsHelper)) {
      result.strategy = 'devise'
      result.helper_method = 'sign_in'
      result.setup_location = 'spec/rails_helper.rb'
      return result
    }
    if (/Devise::Test::ControllerHelpers/.test(railsHelper)) {
      result.strategy = 'devise_controller'
      result.helper_method = 'sign_in'
      result.setup_location = 'spec/rails_helper.rb'
      return result
    }
    if (/Warden::Test::Helpers/.test(railsHelper)) {
      result.strategy = 'warden'
      result.helper_method = 'login_as'
      result.setup_location = 'spec/rails_helper.rb'
      return result
    }
  }

  // Check spec/support/ for custom auth helpers
  const supportEntries = entries.filter(
    (e) => e.path.startsWith('spec/support/') &&
           e.path.endsWith('.rb') &&
           /auth/i.test(e.path)
  )

  for (const entry of supportEntries) {
    const content = provider.readFile(entry.path)
    if (!content) continue

    // Look for sign_in method definition
    const signInMatch = content.match(/def\s+(sign_in|log_in|login|authenticate)/)
    if (signInMatch) {
      result.strategy = 'custom'
      result.helper_method = signInMatch[1]
      result.helper_file = entry.path
      return result
    }
  }

  // Check for JWT/token auth patterns in support files
  for (const entry of supportEntries) {
    const content = provider.readFile(entry.path)
    if (!content) continue

    if (/auth.*header|bearer|jwt|token/i.test(content)) {
      result.strategy = 'token'
      result.helper_file = entry.path

      const methodMatch = content.match(/def\s+(\w+)/)
      if (methodMatch) result.helper_method = methodMatch[1]
      return result
    }
  }

  return result
}

/**
 * Detect database cleaning/transaction strategy.
 * @param {import('../providers/interface.js').FileProvider} provider
 * @param {object} gems
 * @returns {{strategy: string|null, config_file: string|null}}
 */
function detectDatabaseStrategy(provider, gems) {
  const result = {
    strategy: null,
    config_file: null,
  }

  // Check rails_helper for use_transactional_fixtures
  const railsHelper = provider.readFile('spec/rails_helper.rb') || ''
  if (/use_transactional_fixtures\s*=\s*true/.test(railsHelper)) {
    result.strategy = 'transactional_fixtures'
    result.config_file = 'spec/rails_helper.rb'
    return result
  }

  // Check for database_cleaner
  if (gems.database_cleaner || gems['database_cleaner-active_record']) {
    result.strategy = 'database_cleaner'

    // Detect strategy type
    const supportFiles = [
      'spec/support/database_cleaner.rb',
      'spec/support/database_cleaner_config.rb',
    ]
    for (const path of supportFiles) {
      const content = provider.readFile(path)
      if (!content) continue

      result.config_file = path
      if (/strategy\s*=?\s*:truncation/.test(content)) {
        result.strategy = 'database_cleaner_truncation'
      } else if (/strategy\s*=?\s*:transaction/.test(content)) {
        result.strategy = 'database_cleaner_transaction'
      } else if (/strategy\s*=?\s*:deletion/.test(content)) {
        result.strategy = 'database_cleaner_deletion'
      }
      break
    }
    return result
  }

  return result
}

/**
 * Find well-structured spec files as pattern references for each category.
 * Selects the spec file with the most describe/context blocks per category.
 * @param {import('../providers/interface.js').FileProvider} provider
 * @param {Array<{path: string, specCategory?: string}>} specEntries
 * @returns {Array<{path: string, category: string, describe_count: number, example_count: number}>}
 */
function findPatternReferences(provider, specEntries) {
  const byCategory = {}

  for (const entry of specEntries) {
    const cat = entry.specCategory
    if (!cat || cat === 'factories' || cat === 'support') continue

    const content = provider.readFile(entry.path)
    if (!content) continue

    const describeCount = (content.match(/^\s*(?:describe|context)\s/gm) || []).length
    const exampleCount = (content.match(/^\s*it\s/gm) || []).length

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

### Test

Create `test/extractors/test-conventions.test.js`:

Test cases:
- Project with mostly `let` calls returns `let_style: 'lazy'`
- Project with mostly `let!` calls returns `let_style: 'eager'`
- Shared examples in `spec/support/` are discovered
- Shared contexts in `spec/support/` are discovered
- Custom matchers with `RSpec::Matchers.define` are found
- Devise auth helper is detected from rails_helper.rb
- Custom auth helper is detected from `spec/support/authentication.rb`
- Database strategy detection works for transactional_fixtures
- `spec_counts` correctly counts specs per category
- Pattern reference files are selected (largest per category)
- A project with no spec files returns sensible empty defaults

---

## 7. New Extractor: `src/extractors/factory-registry.js`

### Purpose

Parse all FactoryBot factory files and build a registry of defined factories, their attributes, traits, sequences, and associations.

### File location

`src/extractors/factory-registry.js`

### Specification

```javascript
/**
 * Factory Registry Extractor
 * Parses FactoryBot factory definitions from spec/factories/ or test/factories/.
 *
 * @module factory-registry
 */

import { FACTORY_PATTERNS } from '../core/patterns.js'

/**
 * Extract factory definitions from factory files.
 * @param {import('../providers/interface.js').FileProvider} provider
 * @param {Array<{path: string, specCategory?: string}>} entries
 * @returns {object}
 */
export function extractFactoryRegistry(provider, entries) {
  const result = {
    factories: {},
    total_factories: 0,
    total_traits: 0,
    factory_files: [],
    missing_factories: [],   // models with no factory (populated by cross-ref)
  }

  // Find factory files
  const factoryEntries = entries.filter(
    (e) => e.specCategory === 'factories' ||
           e.path.includes('factories/') && e.path.endsWith('.rb')
  )

  for (const entry of factoryEntries) {
    const content = provider.readFile(entry.path)
    if (!content) continue

    result.factory_files.push(entry.path)
    const factories = parseFactoryFile(content, entry.path)

    for (const factory of factories) {
      result.factories[factory.name] = factory
      result.total_factories++
      result.total_traits += factory.traits.length
    }
  }

  return result
}

/**
 * Parse a single factory file for factory definitions.
 * Handles nested factories and multiple factories per file.
 * @param {string} content
 * @param {string} filePath
 * @returns {Array<object>}
 */
function parseFactoryFile(content, filePath) {
  const factories = []
  const lines = content.split('\n')

  let currentFactory = null
  let inTransient = false
  let depth = 0       // track do...end nesting within a factory
  let factoryDepth = 0 // depth at which current factory was opened

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    // Skip comments and blanks
    if (!trimmed || trimmed.startsWith('#')) continue

    // Factory definition
    const factoryMatch = trimmed.match(FACTORY_PATTERNS.factoryDef)
    if (factoryMatch) {
      // If we're already in a factory, this is a nested factory
      if (currentFactory) {
        factories.push(currentFactory)
      }

      currentFactory = {
        name: factoryMatch[1],
        model_class: factoryMatch[2] || classify(factoryMatch[1]),
        file: filePath,
        attributes: [],
        traits: [],
        sequences: [],
        associations: [],
        has_transient: false,
        has_after_create: false,
      }
      factoryDepth = depth
      depth++
      inTransient = false
      continue
    }

    if (!currentFactory) {
      if (/\bdo\b/.test(trimmed)) depth++
      if (/^\s*end\b/.test(trimmed)) depth--
      continue
    }

    // Trait definition
    const traitMatch = trimmed.match(FACTORY_PATTERNS.trait)
    if (traitMatch) {
      currentFactory.traits.push(traitMatch[1])
      depth++
      continue
    }

    // Transient block
    if (FACTORY_PATTERNS.transient.test(trimmed)) {
      inTransient = true
      currentFactory.has_transient = true
      depth++
      continue
    }

    // After create callback
    if (FACTORY_PATTERNS.afterCreate.test(trimmed) ||
        FACTORY_PATTERNS.afterBuild.test(trimmed)) {
      currentFactory.has_after_create = true
      if (/\bdo\b/.test(trimmed)) depth++
      continue
    }

    // Association
    const assocMatch = trimmed.match(FACTORY_PATTERNS.association)
    if (assocMatch) {
      currentFactory.associations.push({
        name: assocMatch[1],
        options: assocMatch[2] || null,
      })
      continue
    }

    // Sequence
    const seqMatch = trimmed.match(FACTORY_PATTERNS.sequence) ||
                     trimmed.match(FACTORY_PATTERNS.sequenceBlock)
    if (seqMatch) {
      currentFactory.sequences.push(seqMatch[1])
      if (/\bdo\b/.test(trimmed)) depth++
      continue
    }

    // Attribute with block (only at factory level, not inside trait/transient)
    // This is a simplified detection — we capture attribute names, not values
    if (depth === factoryDepth + 1 && !inTransient) {
      const attrMatch = trimmed.match(/^(\w+)\s*\{/)
      if (attrMatch && !['trait', 'factory', 'sequence', 'transient',
                          'after', 'before'].includes(attrMatch[1])) {
        currentFactory.attributes.push(attrMatch[1])
      }
    }

    // Track do...end depth
    if (/\bdo\b/.test(trimmed) && !factoryMatch && !traitMatch) {
      depth++
    }
    if (/^\s*end\b/.test(trimmed)) {
      depth--
      if (depth <= factoryDepth) {
        // Factory closed
        factories.push(currentFactory)
        currentFactory = null
        inTransient = false
      }
      if (inTransient && depth === factoryDepth + 1) {
        inTransient = false
      }
    }
  }

  // Handle unclosed factory (shouldn't happen in valid code, but be safe)
  if (currentFactory) {
    factories.push(currentFactory)
  }

  return factories
}

/**
 * Convert a snake_case factory name to a PascalCase class name.
 * @param {string} str
 * @returns {string}
 */
function classify(str) {
  return str
    .split(/[_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('')
}
```

### Test

Create `test/extractors/factory-registry.test.js`:

Test cases:
- Simple factory with 3 attributes is parsed correctly
- Factory with `class:` option maps to correct model
- Traits are discovered
- Sequences are discovered
- Associations are discovered
- Multiple factories in one file are all parsed
- Factory with transient block sets `has_transient: true`
- Factory with `after(:create)` sets `has_after_create: true`
- Empty factory file returns empty results
- File path is stored on each factory

---

## 8. New Extractor: `src/extractors/coverage-snapshot.js`

### Purpose

Parse SimpleCov's `coverage/coverage.json` output and cross-reference with RailsInsight structural data to produce per-file, per-method coverage gap analysis.

### File location

`src/extractors/coverage-snapshot.js`

### Important note

This extractor depends on `coverage/coverage.json` existing, which it will not on first run. The extractor must handle this gracefully and return `{ available: false }`.

### Specification

```javascript
/**
 * Coverage Snapshot Extractor
 * Parses SimpleCov JSON output and cross-references with structural
 * data to produce per-file, per-method coverage analysis.
 *
 * @module coverage-snapshot
 */

/**
 * Extract coverage snapshot from SimpleCov output.
 * @param {import('../providers/interface.js').FileProvider} provider
 * @param {object} [modelExtractions] - Pre-extracted model data (for method line mapping)
 * @param {object} [controllerExtractions] - Pre-extracted controller data
 * @returns {object}
 */
export function extractCoverageSnapshot(provider, modelExtractions = {}, controllerExtractions = {}) {
  const result = {
    available: false,
    tool: null,
    overall: {
      line_coverage: null,
      branch_coverage: null,
      files_tracked: 0,
    },
    per_file: {},
    uncovered_methods: [],
    timestamp: null,
  }

  // Try to read SimpleCov JSON output
  const coverageRaw = provider.readFile('coverage/coverage.json')
  if (!coverageRaw) {
    // Also try .resultset.json (older SimpleCov format)
    const resultsetRaw = provider.readFile('coverage/.resultset.json')
    if (!resultsetRaw) return result

    return parseResultSet(resultsetRaw, result, modelExtractions, controllerExtractions)
  }

  let coverageData
  try {
    coverageData = JSON.parse(coverageRaw)
  } catch {
    return result
  }

  result.available = true
  result.tool = 'simplecov'
  result.timestamp = coverageData.timestamp || null

  // SimpleCov coverage.json structure varies by version
  // Modern: { "coverage": { "file_path": { "lines": [...], "branches": {...} } } }
  // Legacy: { "RSpec": { "coverage": { "file_path": { "lines": [...] } } } }
  let fileCoverage = {}

  if (coverageData.coverage) {
    fileCoverage = coverageData.coverage
  } else {
    // Legacy format: find first test suite key
    const suiteKey = Object.keys(coverageData).find(
      (k) => coverageData[k]?.coverage
    )
    if (suiteKey) {
      fileCoverage = coverageData[suiteKey].coverage
    }
  }

  let totalLines = 0
  let coveredLines = 0
  let totalBranches = 0
  let coveredBranches = 0

  for (const [filePath, fileData] of Object.entries(fileCoverage)) {
    // Normalise path: SimpleCov uses absolute paths, we want relative
    const relativePath = normaliseToRelative(filePath)
    if (!relativePath) continue

    // Skip non-app files
    if (!relativePath.startsWith('app/') && !relativePath.startsWith('lib/')) {
      continue
    }

    const lines = fileData.lines || fileData
    if (!Array.isArray(lines)) continue

    // Calculate per-file metrics
    const relevantLines = lines.filter((l) => l !== null)
    const fileCoveredLines = relevantLines.filter((l) => l > 0).length
    const fileUncoveredLineNumbers = []

    for (let i = 0; i < lines.length; i++) {
      if (lines[i] === 0) {
        fileUncoveredLineNumbers.push(i + 1) // 1-indexed
      }
    }

    // Branch coverage if available
    let fileBranchTotal = 0
    let fileBranchCovered = 0
    const uncoveredBranchDetails = []

    if (fileData.branches) {
      for (const [conditionKey, branches] of Object.entries(fileData.branches)) {
        for (const [branchId, hitCount] of Object.entries(branches)) {
          fileBranchTotal++
          if (hitCount > 0) {
            fileBranchCovered++
          } else {
            // Parse branch details from key
            // Format varies: "[:if, 0, 32, 6, 32, 20]" or similar
            const lineMatch = branchId.match(/(\d+)/)
            uncoveredBranchDetails.push({
              condition: conditionKey,
              branch: branchId,
              line: lineMatch ? parseInt(lineMatch[1], 10) : null,
            })
          }
        }
      }
    }

    const fileLineCoverage = relevantLines.length > 0
      ? (fileCoveredLines / relevantLines.length) * 100
      : 100

    const fileBranchCoverage = fileBranchTotal > 0
      ? (fileBranchCovered / fileBranchTotal) * 100
      : null

    result.per_file[relativePath] = {
      line_coverage: Math.round(fileLineCoverage * 10) / 10,
      branch_coverage: fileBranchCoverage !== null
        ? Math.round(fileBranchCoverage * 10) / 10 : null,
      total_lines: relevantLines.length,
      covered_lines: fileCoveredLines,
      uncovered_line_numbers: fileUncoveredLineNumbers,
      total_branches: fileBranchTotal,
      covered_branches: fileBranchCovered,
      uncovered_branches: uncoveredBranchDetails,
    }

    totalLines += relevantLines.length
    coveredLines += fileCoveredLines
    totalBranches += fileBranchTotal
    coveredBranches += fileBranchCovered

    // Cross-reference uncovered lines with method line ranges
    mapUncoveredMethods(
      relativePath,
      fileUncoveredLineNumbers,
      modelExtractions,
      controllerExtractions,
      result.uncovered_methods
    )
  }

  result.overall.line_coverage = totalLines > 0
    ? Math.round((coveredLines / totalLines) * 1000) / 10
    : null
  result.overall.branch_coverage = totalBranches > 0
    ? Math.round((coveredBranches / totalBranches) * 1000) / 10
    : null
  result.overall.files_tracked = Object.keys(result.per_file).length

  return result
}

/**
 * Map uncovered line numbers to specific methods using extractor data.
 * @param {string} filePath
 * @param {number[]} uncoveredLines
 * @param {object} modelExtractions
 * @param {object} controllerExtractions
 * @param {Array} outputArray - mutated, results pushed here
 */
function mapUncoveredMethods(
  filePath,
  uncoveredLines,
  modelExtractions,
  controllerExtractions,
  outputArray
) {
  if (uncoveredLines.length === 0) return

  // Find the extraction for this file
  let methodRanges = null
  let entityName = null
  let entityType = null

  // Check models
  for (const [name, model] of Object.entries(modelExtractions)) {
    if (model.file === filePath && model.method_line_ranges) {
      methodRanges = model.method_line_ranges
      entityName = name
      entityType = 'model'
      break
    }
  }

  // Check controllers
  if (!methodRanges) {
    for (const [name, ctrl] of Object.entries(controllerExtractions)) {
      if (ctrl.file === filePath && ctrl.action_line_ranges) {
        methodRanges = ctrl.action_line_ranges
        entityName = name
        entityType = 'controller'
        break
      }
    }
  }

  if (!methodRanges) return

  for (const [methodName, range] of Object.entries(methodRanges)) {
    const uncoveredInMethod = uncoveredLines.filter(
      (line) => line >= range.start && line <= range.end
    )

    if (uncoveredInMethod.length > 0) {
      const totalMethodLines = range.end - range.start + 1
      const coveredMethodLines = totalMethodLines - uncoveredInMethod.length
      const methodCoverage = totalMethodLines > 0
        ? Math.round((coveredMethodLines / totalMethodLines) * 1000) / 10
        : 0

      outputArray.push({
        file: filePath,
        entity: entityName,
        entity_type: entityType,
        method: methodName,
        line_range: range,
        coverage_pct: methodCoverage,
        uncovered_lines: uncoveredInMethod,
        uncovered_line_count: uncoveredInMethod.length,
      })
    }
  }
}

/**
 * Normalise an absolute file path to a project-relative path.
 * @param {string} filePath
 * @returns {string|null}
 */
function normaliseToRelative(filePath) {
  // SimpleCov uses absolute paths. Find the app/ or lib/ prefix.
  const appIdx = filePath.indexOf('/app/')
  if (appIdx !== -1) return filePath.slice(appIdx + 1)

  const libIdx = filePath.indexOf('/lib/')
  if (libIdx !== -1) return filePath.slice(libIdx + 1)

  // Already relative?
  if (filePath.startsWith('app/') || filePath.startsWith('lib/')) {
    return filePath
  }

  return null
}

/**
 * Parse legacy .resultset.json format.
 * @param {string} raw
 * @param {object} result
 * @param {object} modelExtractions
 * @param {object} controllerExtractions
 * @returns {object}
 */
function parseResultSet(raw, result, modelExtractions, controllerExtractions) {
  // .resultset.json has a different structure — attempt to parse and delegate
  try {
    const data = JSON.parse(raw)
    // Find any suite with coverage data
    for (const suite of Object.values(data)) {
      if (suite.coverage) {
        const wrapper = { coverage: suite.coverage, timestamp: suite.timestamp }
        return extractCoverageSnapshot(
          { readFile: (path) => path === 'coverage/coverage.json' ? JSON.stringify(wrapper) : null },
          modelExtractions,
          controllerExtractions
        )
      }
    }
  } catch {
    // Fall through
  }
  return result
}
```

### Test

Create `test/extractors/coverage-snapshot.test.js`:

Test cases:
- Returns `{ available: false }` when no coverage file exists
- Parses modern SimpleCov JSON format correctly
- Calculates overall line coverage percentage accurately
- Calculates per-file coverage correctly
- Identifies uncovered line numbers (0-values in the lines array)
- Handles `null` entries in lines array (non-relevant lines) correctly
- Parses branch coverage when available
- Cross-references uncovered lines with model `method_line_ranges` to produce `uncovered_methods`
- Cross-references uncovered lines with controller `action_line_ranges`
- Normalises absolute file paths to relative
- Skips non-app files (e.g., gem files that appear in SimpleCov output)
- Handles malformed JSON gracefully

---

## 9. Graph Builder: Add `tests` edge type to `src/core/graph.js`

### Location

Two changes in `src/core/graph.js`:

1. Add `tests` to `EDGE_WEIGHTS`
2. Add spec-to-source edges in `buildGraph`

### Specification

Add to `EDGE_WEIGHTS`:

```javascript
tests: 1.0,
```

Add to `buildGraph`, after the existing schema foreign keys section and before the personalization section:

```javascript
// Spec → Source relationships (test files → tested entities)
if (extractions.test_conventions) {
  const specEntries = manifest.entries?.filter(
    (e) => e.category === 19 && e.specCategory && e.path.endsWith('_spec.rb')
  ) || []

  for (const entry of specEntries) {
    // Derive the model/controller name from the spec path
    // spec/models/user_spec.rb → User
    // spec/requests/orders_spec.rb → Orders (controller)
    const basename = entry.path.split('/').pop().replace('_spec.rb', '')
    const className = basename
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join('')

    if (extractions.models && extractions.models[className]) {
      graph.addNode(entry.path, 'spec', `${className} spec`)
      graph.addEdge(entry.path, className, 'tests')
      relationships.push({
        from: entry.path,
        to: className,
        type: 'tests',
      })
    } else if (
      extractions.controllers &&
      extractions.controllers[className + 'Controller']
    ) {
      graph.addNode(entry.path, 'spec', `${className}Controller spec`)
      graph.addEdge(entry.path, className + 'Controller', 'tests')
      relationships.push({
        from: entry.path,
        to: className + 'Controller',
        type: 'tests',
      })
    }
  }
}
```

### Test

Verify:
- A model spec creates a `tests` edge to its model
- A request spec creates a `tests` edge to its controller
- Specs for models that don't exist in extractions are silently skipped
- The `tests` edge type appears in EDGE_WEIGHTS

---

## 10. Indexer: Wire new extractors into `src/core/indexer.js`

### Location

Modify the `buildIndex` function.

### What to change

Import the three new extractors and call them during the extraction phase. The coverage snapshot extractor needs to receive model and controller extractions for cross-referencing, so it must be called after those are complete.

### Specification

Add imports:

```javascript
import { extractTestConventions } from '../extractors/test-conventions.js'
import { extractFactoryRegistry } from '../extractors/factory-registry.js'
import { extractCoverageSnapshot } from '../extractors/coverage-snapshot.js'
```

After the existing per-file extractors loop (after the `for (const entry of entries)` block that populates `extractions.models`, `extractions.controllers`, etc.), add:

```javascript
// Test convention and factory analysis
extractions.test_conventions = extractTestConventions(provider, entries, { gems })
extractions.factory_registry = extractFactoryRegistry(provider, entries)

// Coverage snapshot (depends on models and controllers being extracted first
// for method line range cross-referencing)
extractions.coverage_snapshot = extractCoverageSnapshot(
  provider,
  extractions.models,
  extractions.controllers
)
```

### Backward compatibility

These are three new keys on the `extractions` object. No existing keys are modified. The `computeStatistics` function at the bottom of indexer.js does not need to change unless you want to add coverage stats to the summary (optional enhancement).

---

## 11. MCP Tools: Register 5 new tools in `src/tools/free-tools.js`

### Location

Add inside the `registerFreeTools` function, after the existing `get_deep_analysis` tool registration.

### Specification

Add these 5 new tool registrations:

```javascript
// 11. get_coverage_gaps
server.tool(
  'get_coverage_gaps',
  'Returns prioritised list of files needing test coverage, with structural context from RailsInsight and per-method coverage data from SimpleCov.',
  {
    category: z
      .string()
      .optional()
      .describe('Filter by file category: models, controllers, services, jobs, mailers'),
    min_gap: z
      .number()
      .optional()
      .default(0)
      .describe('Minimum coverage gap percentage to include (e.g., 20 means files below 80% coverage)'),
    limit: z
      .number()
      .optional()
      .default(20)
      .describe('Maximum number of results'),
  },
  async ({ category, min_gap = 0, limit = 20 }) => {
    if (!state.index) return noIndex()
    const coverage = state.index.extractions?.coverage_snapshot || {}
    if (!coverage.available) {
      return respond({
        error: 'No coverage data available. Run your test suite with SimpleCov enabled first.',
        hint: 'Ensure coverage/coverage.json exists, then call index_project to refresh.',
      })
    }

    const models = state.index.extractions?.models || {}
    const controllers = state.index.extractions?.controllers || {}
    const rankings = state.index.rankings || {}
    const manifest = state.index.manifest || {}
    const entries = manifest.entries || []

    // Build gap list
    const gaps = []
    for (const [filePath, fileCov] of Object.entries(coverage.per_file)) {
      if (fileCov.line_coverage >= (100 - min_gap) && min_gap > 0) continue

      // Determine category from manifest
      const entry = entries.find((e) => e.path === filePath)
      const fileCategory = entry?.categoryName || 'unknown'

      if (category && fileCategory !== category) continue

      // Find structural context
      const className = pathToClassName(filePath)
      const model = models[className]
      const controller = controllers[className] || controllers[className + 'Controller']

      // Find uncovered methods for this file
      const uncoveredMethods = (coverage.uncovered_methods || []).filter(
        (m) => m.file === filePath
      )

      gaps.push({
        file: filePath,
        category: fileCategory,
        class_name: className,
        line_coverage: fileCov.line_coverage,
        branch_coverage: fileCov.branch_coverage,
        uncovered_line_count: fileCov.uncovered_line_numbers.length,
        uncovered_methods: uncoveredMethods.map((m) => ({
          name: m.method,
          coverage_pct: m.coverage_pct,
          uncovered_lines: m.uncovered_line_count,
        })),
        total_public_methods: model?.public_methods?.length ||
          controller?.actions?.length || null,
        associations: model?.associations?.length || null,
        validations: model?.validations?.length || null,
        pagerank: rankings[className] || rankings[className + 'Controller'] || 0,
      })
    }

    // Sort by pagerank descending (most important files first),
    // then by coverage ascending (worst coverage first)
    gaps.sort((a, b) => b.pagerank - a.pagerank || a.line_coverage - b.line_coverage)

    return respond({
      total_gaps: gaps.length,
      gaps: gaps.slice(0, limit),
      overall_coverage: coverage.overall,
    })
  },
)

// 12. get_test_conventions
server.tool(
  'get_test_conventions',
  'Returns detected test patterns and conventions: spec style (request vs controller), let style, auth helper, factories, shared examples, custom matchers, and pattern reference files.',
  {},
  async () => {
    if (!state.index) return noIndex()
    return respond(state.index.extractions?.test_conventions || {})
  },
)

// 13. get_domain_clusters
server.tool(
  'get_domain_clusters',
  'Returns domain-clustered file groups for parallel test generation. Files in the same cluster share associations and factories. Files in different clusters can be worked on simultaneously without conflict.',
  {
    max_cluster_size: z
      .number()
      .optional()
      .default(8)
      .describe('Maximum files per cluster before splitting'),
    include_covered: z
      .boolean()
      .optional()
      .default(false)
      .describe('Include files that already have coverage above target'),
  },
  async ({ max_cluster_size = 8, include_covered = false }) => {
    if (!state.index) return noIndex()

    const models = state.index.extractions?.models || {}
    const controllers = state.index.extractions?.controllers || {}
    const coverage = state.index.extractions?.coverage_snapshot || {}
    const rankings = state.index.rankings || {}
    const manifest = state.index.manifest || {}
    const entries = manifest.entries || []

    // Build adjacency graph from associations
    const graph = new Map()
    for (const [name, model] of Object.entries(models)) {
      if (!graph.has(name)) graph.set(name, new Set())
      for (const assoc of model.associations || []) {
        const target = assoc.name
          .split('_')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join('')
        if (!graph.has(target)) graph.set(target, new Set())
        graph.get(name).add(target)
        graph.get(target).add(name)
      }
    }

    // Connected components via BFS
    const visited = new Set()
    const clusters = []

    for (const node of graph.keys()) {
      if (visited.has(node)) continue
      const component = new Set()
      const queue = [node]
      while (queue.length > 0) {
        const current = queue.shift()
        if (visited.has(current)) continue
        visited.add(current)
        component.add(current)
        for (const neighbor of graph.get(current) || []) {
          if (!visited.has(neighbor)) queue.push(neighbor)
        }
      }

      // Map component to source files needing coverage
      const clusterFiles = []
      for (const entity of component) {
        // Model file
        const model = models[entity]
        if (model?.file) {
          const cov = coverage.per_file?.[model.file]
          if (include_covered || !cov || cov.line_coverage < 90) {
            clusterFiles.push({
              file: model.file,
              entity,
              type: 'model',
              coverage: cov?.line_coverage ?? null,
            })
          }
        }
        // Controller file
        const ctrlName = entity + 'Controller'
        const ctrl = controllers[ctrlName]
        if (ctrl?.file) {
          const cov = coverage.per_file?.[ctrl.file]
          if (include_covered || !cov || cov.line_coverage < 90) {
            clusterFiles.push({
              file: ctrl.file,
              entity: ctrlName,
              type: 'controller',
              coverage: cov?.line_coverage ?? null,
            })
          }
        }
      }

      if (clusterFiles.length === 0) continue

      clusters.push({
        id: Array.from(component).sort().slice(0, 3).join('-').toLowerCase(),
        entities: Array.from(component).sort(),
        files: clusterFiles,
        file_count: clusterFiles.length,
        avg_coverage: clusterFiles.reduce(
          (sum, f) => sum + (f.coverage || 0), 0
        ) / clusterFiles.length,
        priority: Math.max(
          ...Array.from(component).map((e) => rankings[e] || 0)
        ),
      })
    }

    // Split oversized clusters
    const finalClusters = []
    for (const cluster of clusters) {
      if (cluster.file_count <= max_cluster_size) {
        finalClusters.push(cluster)
      } else {
        // Split by file type
        const byType = {}
        for (const file of cluster.files) {
          if (!byType[file.type]) byType[file.type] = []
          byType[file.type].push(file)
        }
        let subIdx = 0
        for (const [type, files] of Object.entries(byType)) {
          finalClusters.push({
            ...cluster,
            id: `${cluster.id}-${type}-${subIdx++}`,
            files,
            file_count: files.length,
          })
        }
      }
    }

    // Sort by priority descending
    finalClusters.sort((a, b) => b.priority - a.priority)

    return respond({
      total_clusters: finalClusters.length,
      total_files: finalClusters.reduce((sum, c) => sum + c.file_count, 0),
      clusters: finalClusters,
    })
  },
)

// 14. get_factory_registry
server.tool(
  'get_factory_registry',
  'Returns parsed FactoryBot factory definitions including attributes, traits, sequences, and associations. Use to understand what test data factories are available.',
  {
    model: z
      .string()
      .optional()
      .describe('Filter by model/factory name (e.g., "user")'),
  },
  async ({ model }) => {
    if (!state.index) return noIndex()
    const registry = state.index.extractions?.factory_registry || {}

    if (model) {
      const factory = registry.factories?.[model] ||
        registry.factories?.[model.toLowerCase()]
      if (!factory) {
        return respond({
          error: `Factory '${model}' not found`,
          available: Object.keys(registry.factories || {}),
        })
      }
      return respond(factory)
    }

    return respond(registry)
  },
)

// 15. get_well_tested_examples
server.tool(
  'get_well_tested_examples',
  'Returns high-quality existing spec files suitable as pattern references for test generation agents. Selected by structural complexity (most describe/context blocks) per spec category.',
  {
    category: z
      .string()
      .optional()
      .describe('Spec category to filter: model_specs, request_specs, service_specs, job_specs, mailer_specs'),
    limit: z
      .number()
      .optional()
      .default(3)
      .describe('Maximum number of reference files to return'),
  },
  async ({ category, limit = 3 }) => {
    if (!state.index) return noIndex()
    const conventions = state.index.extractions?.test_conventions || {}
    let references = conventions.pattern_reference_files || []

    if (category) {
      references = references.filter((r) => r.category === category)
    }

    // Return file contents for pattern matching
    const results = []
    for (const ref of references.slice(0, limit)) {
      const content = state.provider?.readFile(ref.path)
      results.push({
        ...ref,
        content: content || null,
        content_truncated: content && content.length > 8000
          ? content.slice(0, 8000) + '\n# ... truncated ...'
          : null,
      })
    }

    return respond({
      total: results.length,
      references: results,
    })
  },
)
```

Also add the `pathToClassName` helper if it doesn't already exist as a module-level function (the existing code has it in `indexer.js` but not in `free-tools.js`):

```javascript
function pathToClassName(path) {
  const basename = path.split('/').pop().replace('.rb', '')
  return basename
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('')
}
```

### Update the `get_deep_analysis` tool's available categories list

In the `default` case of the `get_deep_analysis` switch statement, add the new categories to the `available` array:

```javascript
'test_conventions',
'factory_registry',
'coverage_snapshot',
```

And add corresponding cases:

```javascript
case 'test_conventions':
  return respond(extractions.test_conventions || {})

case 'factory_registry':
  return respond(extractions.factory_registry || {})

case 'coverage_snapshot':
  return respond(extractions.coverage_snapshot || {})
```

---

## 12. Tests

### New test files to create

| File | Tests |
|---|---|
| `test/extractors/test-conventions.test.js` | 11+ test cases as specified in Section 6 |
| `test/extractors/factory-registry.test.js` | 10+ test cases as specified in Section 7 |
| `test/extractors/coverage-snapshot.test.js` | 12+ test cases as specified in Section 8 |

### Existing test files to extend

| File | Additional Tests |
|---|---|
| `test/core/scanner.test.js` | 6 tests for `specCategory` field |
| `test/extractors/model.test.js` | 5 tests for `method_line_ranges` |
| `test/extractors/controller.test.js` | 3 tests for `action_line_ranges` |
| `test/extractors/tier2.test.js` | 5 tests for extended testing section |
| `test/core/graph.test.js` | 2 tests for `tests` edge type |

### Test data approach

Use `createMemoryProvider()` with inline file content for all tests. Study existing test files for the exact pattern. Example from the codebase:

```javascript
import { createMemoryProvider } from '../helpers/mock-provider.js'

describe('extractTestConventions', () => {
  it('detects lazy let style', () => {
    const provider = createMemoryProvider({
      'spec/models/user_spec.rb': `
        RSpec.describe User, type: :model do
          let(:user) { create(:user) }
          let(:other_user) { create(:user) }
          it 'does something' do
            expect(user).to be_valid
          end
        end
      `,
    })
    const entries = [
      { path: 'spec/models/user_spec.rb', category: 19, categoryName: 'testing', specCategory: 'model_specs' },
    ]
    const result = extractTestConventions(provider, entries, {})
    expect(result.let_style).toBe('lazy')
  })
})
```

### Running tests

After implementation, all tests must pass:

```bash
npm test                    # Full suite
npm run test:extractors     # Just extractor tests
npm run test:core           # Just core tests
```

No existing tests should break.
