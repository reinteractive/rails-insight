# Fix: Add Enumerize Detection to Model Extractor

## Context

The `get_model` tool has F1=0.92. Without the enumerize gap, it's 0.98. This single fix is the highest-impact change possible: 27 false negatives across 10+ models eliminated by adding one regex pattern.

**Scope:** Two source files, one test file. Nothing else touched.

**Files modified:**

- `src/core/patterns/model.js` (add 1 pattern)
- `src/extractors/model.js` (add ~15 lines of detection code)

**Files created:**

- `test/extractors/enumerize.test.js` (regression tests)

---

## Prerequisites

```bash
npm test
```

All existing tests must pass before starting.

```bash
git checkout -b fix/enumerize-detection
```

---

## Task 1: Write regression tests for enumerize detection

**Goal:** Create a test file that verifies the model extractor correctly detects `enumerize` declarations in all common syntaxes. These tests will FAIL initially, then pass after Task 2.

**Read first (do not modify):**

- `src/extractors/model.js` — the `extractModel` function signature and return shape
- `src/core/patterns/model.js` — existing `MODEL_PATTERNS` to understand the pattern convention

**Create:** `test/extractors/enumerize.test.js`

### What to do

Create the test file with the content below. Each test case exercises a specific enumerize syntax pattern found in real Rails apps.

```javascript
import { describe, it, expect } from 'vitest'
import { extractModel } from '../../src/extractors/model.js'

/**
 * Create a minimal mock provider that returns the given content
 * for any readFile call.
 */
function mockProvider(content) {
  return {
    readFile: () => content,
    fileExists: () => true,
    glob: () => [],
    listDir: () => [],
  }
}

describe('extractModel — enumerize detection', () => {
  it('detects enumerize with symbol array values', () => {
    const content = `
class Activity < ApplicationRecord
  enumerize :status, in: [:submitted, :draft, :pending, :publish]
end
`
    const result = extractModel(mockProvider(content), 'app/models/activity.rb')
    expect(result.enums).toBeDefined()
    expect(result.enums.status).toBeDefined()
    expect(result.enums.status.values).toEqual(['submitted', 'draft', 'pending', 'publish'])
    expect(result.enums.status.syntax).toBe('enumerize')
  })

  it('detects enumerize with string array values', () => {
    const content = `
class Activity < ApplicationRecord
  enumerize :state, in: ["NSW", "VIC", "QLD"]
end
`
    const result = extractModel(mockProvider(content), 'app/models/activity.rb')
    expect(result.enums.state).toBeDefined()
    expect(result.enums.state.values).toEqual(['NSW', 'VIC', 'QLD'])
    expect(result.enums.state.syntax).toBe('enumerize')
  })

  it('detects enumerize with %w[] syntax', () => {
    const content = `
class Article < ApplicationRecord
  enumerize :format, in: %w[news review guide video]
end
`
    const result = extractModel(mockProvider(content), 'app/models/article.rb')
    expect(result.enums.format).toBeDefined()
    expect(result.enums.format.values).toEqual(['news', 'review', 'guide', 'video'])
    expect(result.enums.format.syntax).toBe('enumerize')
  })

  it('detects multiple enumerize declarations in one model', () => {
    const content = `
class Activity < ApplicationRecord
  enumerize :status, in: [:draft, :published]
  enumerize :priority, in: [:low, :medium, :high]
  enumerize :season, in: [:spring, :summer, :autumn, :winter]
end
`
    const result = extractModel(mockProvider(content), 'app/models/activity.rb')
    expect(Object.keys(result.enums)).toHaveLength(3)
    expect(result.enums.status.values).toEqual(['draft', 'published'])
    expect(result.enums.priority.values).toEqual(['low', 'medium', 'high'])
    expect(result.enums.season.values).toEqual(['spring', 'summer', 'autumn', 'winter'])
  })

  it('detects enumerize with additional options (default, scope, predicates)', () => {
    const content = `
class Member < ApplicationRecord
  enumerize :city, in: [:sydney, :melbourne, :brisbane], default: :melbourne, scope: true
end
`
    const result = extractModel(mockProvider(content), 'app/models/member.rb')
    expect(result.enums.city).toBeDefined()
    expect(result.enums.city.values).toEqual(['sydney', 'melbourne', 'brisbane'])
    expect(result.enums.city.syntax).toBe('enumerize')
  })

  it('does not overwrite native Rails enum with enumerize of same name', () => {
    const content = `
class Organiser < ApplicationRecord
  enum :priority, { low: 0, medium: 1, high: 2 }
  enumerize :priority, in: [:low, :medium, :high]
end
`
    const result = extractModel(mockProvider(content), 'app/models/organiser.rb')
    expect(result.enums.priority).toBeDefined()
    // Native enum should take priority — syntax should NOT be 'enumerize'
    expect(result.enums.priority.syntax).not.toBe('enumerize')
  })

  it('coexists with native Rails enum on different fields', () => {
    const content = `
class Product < ApplicationRecord
  enum :status, { active: 0, archived: 1 }
  enumerize :category, in: [:electronics, :clothing, :food]
end
`
    const result = extractModel(mockProvider(content), 'app/models/product.rb')
    expect(Object.keys(result.enums)).toHaveLength(2)
    expect(result.enums.status.syntax).not.toBe('enumerize')
    expect(result.enums.category.syntax).toBe('enumerize')
    expect(result.enums.category.values).toEqual(['electronics', 'clothing', 'food'])
  })

  it('handles enumerize with single-quoted string values', () => {
    const content = `
class Activity < ApplicationRecord
  enumerize :offers_availability, in: ['InStock', 'SoldOut', 'PreOrder']
end
`
    const result = extractModel(mockProvider(content), 'app/models/activity.rb')
    expect(result.enums.offers_availability).toBeDefined()
    expect(result.enums.offers_availability.values).toEqual(['InStock', 'SoldOut', 'PreOrder'])
  })

  it('returns empty enums when no enum or enumerize declarations exist', () => {
    const content = `
class Simple < ApplicationRecord
  validates :name, presence: true
end
`
    const result = extractModel(mockProvider(content), 'app/models/simple.rb')
    expect(result.enums).toEqual({})
  })

  it('does not detect enumerize outside of model context (e.g., in comments)', () => {
    const content = `
class Post < ApplicationRecord
  # enumerize :old_status, in: [:draft, :published]
  validates :title, presence: true
end
`
    const result = extractModel(mockProvider(content), 'app/models/post.rb')
    expect(result.enums.old_status).toBeUndefined()
  })
})
```

### Acceptance criteria

- [ ] Test file exists at `test/extractors/enumerize.test.js`
- [ ] Tests import `extractModel` from the correct path with `.js` extension
- [ ] All 10 tests FAIL (because enumerize detection doesn't exist yet)
- [ ] Failures are assertion errors ("expected undefined to be defined"), NOT import errors
- [ ] Existing tests still pass: `npm test` passes (enumerize tests fail, others pass)

### Constraints

- Do NOT modify any source files
- Do NOT create any other files
- Use inline mock providers (matching existing test patterns)

### Verify

```bash
npx vitest run test/extractors/enumerize.test.js
```

Expected: 10 tests, at least 8 failures (the "empty enums" and "not in comments" tests may pass since they test the absence of detection).

```bash
npm test
```

Expected: existing tests pass; new enumerize tests fail.

```bash
git add -A && git commit -m "test: add enumerize detection regression tests (10 cases)"
```

---

## Task 2: Implement enumerize detection in model extractor

**Goal:** Add enumerize pattern and extraction code so all 10 tests pass. Two files modified, ~15 lines total.

**Read first (do not modify):**

- `test/extractors/enumerize.test.js` (the tests to satisfy — just committed)
- `src/extractors/model.js` — find the enum section by searching for `enumArrayPatterns`. The new code goes immediately AFTER the `for (const { re, syntax } of enumArrayPatterns)` loop.
- `src/core/patterns/model.js` — find the `// === ENUMS ===` section. The new pattern goes at the end of that section.

**Modify:** `src/core/patterns/model.js` AND `src/extractors/model.js`

### What to do

**Step 1:** In `src/core/patterns/model.js`, add one pattern at the end of the `// === ENUMS ===` section (after `enumLegacyArray`):

```javascript
  enumEnumerize: /^\s*enumerize\s+:(\w+),\s*in:\s*(?:\[([^\]]+)\]|%w\[([^\]]+)\])/m,
```

**Step 2:** In `src/extractors/model.js`, find the `enumArrayPatterns` for-loop. It ends with:

```javascript
    for (const { re, syntax } of enumArrayPatterns) {
      const gre = new RegExp(re.source, 'gm')
      while ((m = gre.exec(content))) {
        const name = m[1]
        if (enums[name]) continue // already captured from hash syntax
        const values = (m[2].match(/\w+/g) || []).filter((v) => !/^\d+$/.test(v))
        enums[name] = { values, syntax }
      }
    }
```

Immediately AFTER that closing brace, add:

```javascript
    // Enumerize gem: enumerize :field, in: [:val1, :val2] or in: %w[val1 val2]
    const enumerizeRe = new RegExp(MODEL_PATTERNS.enumEnumerize.source, 'gm')
    while ((m = enumerizeRe.exec(content))) {
      const name = m[1]
      if (enums[name]) continue // native Rails enum takes priority
      const rawValues = m[2] || m[3] || ''
      const values = rawValues
        .split(/[,\s]+/)
        .map((v) => v.trim().replace(/^:/, '').replace(/['"]/g, ''))
        .filter((v) => v.length > 0)
      enums[name] = { values, syntax: 'enumerize' }
    }
```

That's it. Two insertions, no deletions, no modifications to existing code.

### Acceptance criteria

- [ ] All 10 enumerize tests pass
- [ ] ALL existing tests still pass (`npm test` — full suite green)
- [ ] Symbol values `[:a, :b]` are captured as `["a", "b"]` (colon stripped)
- [ ] String values `["A", "B"]` are captured as `["A", "B"]` (quotes stripped)
- [ ] `%w[a b c]` values are captured as `["a", "b", "c"]`
- [ ] Native Rails `enum` on the same field name takes priority over enumerize
- [ ] Enumerize entries have `syntax: "enumerize"`
- [ ] Commented-out enumerize lines are NOT detected (regex requires `^\s*` start-of-line)

### Constraints

- Do NOT modify any files other than `src/core/patterns/model.js` and `src/extractors/model.js`
- Do NOT modify any existing patterns or extraction code — only ADD
- Do NOT modify any test files
- Place the enumerize regex AFTER all native enum extraction (so `if (enums[name]) continue` correctly skips conflicts)
- Use `MODEL_PATTERNS.enumEnumerize` (not an inline regex) to follow the project pattern convention

### Verify

```bash
npx vitest run test/extractors/enumerize.test.js
```

Expected: 10 tests, 10 passes.

```bash
npm test
```

Expected: full suite passes (0 failures).

```bash
npm run test:extractors
```

Expected: all extractor tests pass (regression check).

```bash
git add -A && git commit -m "feat: detect Enumerize gem declarations in model enum extraction"
```

---

## Post-Fix Verification

After both tasks are complete, run these checks:

### 1. Full test suite

```bash
npm test
```

Zero failures.

### 2. Verify only expected files changed

```bash
git diff main --name-only
```

Expected exactly 3 files:

```
src/core/patterns/model.js
src/extractors/model.js
test/extractors/enumerize.test.js
```

If ANY other file was modified, something went wrong — revert and redo.

### 3. Verify the pattern was added in the right place

```bash
grep -n "enumEnumerize" src/core/patterns/model.js
```

Should show exactly 1 line in the ENUMS section.

```bash
grep -n "enumerize" src/extractors/model.js
```

Should show the detection block (2-3 lines with "enumerize" in them) — all AFTER the `enumArrayPatterns` loop.

### 4. Quick smoke test with node

```bash
node -e "
import { extractModel } from './src/extractors/model.js';
const provider = { readFile: () => 'class Foo < ApplicationRecord\n  enumerize :status, in: [:active, :draft]\nend', fileExists: () => true, glob: () => [], listDir: () => [] };
const result = extractModel(provider, 'app/models/foo.rb');
console.log('enums:', JSON.stringify(result.enums));
console.log('status values:', result.enums.status?.values);
console.log('syntax:', result.enums.status?.syntax);
"
```

Expected output:

```
enums: {"status":{"values":["active","draft"],"syntax":"enumerize"}}
status values: [ 'active', 'draft' ]
syntax: enumerize
```

### 5. Tag and publish

```bash
git tag fix-enumerize-verified
```

Now re-run the eval. Expected impact:

- `get_model` F1: 0.92 → ~0.98
- `get_model` weighted F1 (incl enumerize): 0.73 → ~0.98
- 27 false negatives eliminated
- 0 new hallucinations introduced
- All other tools unchanged (no regressions)
