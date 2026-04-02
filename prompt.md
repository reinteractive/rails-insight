# RailsInsight v1.0.18 Eval Fixes — Agent Task Sequence

## Project Context

**Module system:** ESM (`"type": "module"`)  
**Test framework:** Vitest (`vitest` v3.0.0)  
**Test command:** `npm test` (runs `vitest run`)  
**Import convention:** Relative paths with `.js` extension  
**Naming:** kebab-case files, camelCase functions, PascalCase classes, SCREAMING_SNAKE constants

This sequence fixes 18 issues from the ellaslist evaluation against RailsInsight v1.0.18. Tasks are ordered by severity and grouped by file to avoid conflicts.

---

## Prerequisites

- [ ] All existing tests passing: `npm test`
- [ ] Branch created: `fix/eval-v1.0.18`

---

## Phase 1: Callback Regex Bug & Model Patterns (CRITICAL + HIGH)

### Task 1: Fix callback type regex alternation ordering

**Fixes:** ISSUE-04 (after_save_commit not detected), ISSUE-15 (multi-method callbacks not expanded — downstream of same bug)

**Goal:** The callback type regex has `save|create|update|destroy|...|save_commit|create_commit|update_commit|destroy_commit` — but regex alternation is left-to-right greedy, so `save` matches before `save_commit` can be tried. This means `after_save_commit :method` is parsed as type `after_save` with leftover `_commit :method` that fails to match. Fix by reordering the alternation so longer variants come first.

**Read first:**

- `src/core/patterns/model.js` — the `callback` and `callbackType` patterns

**Modify:** `src/core/patterns/model.js`

#### What to do

1. Find the `callback` pattern. Its alternation currently reads:

```
save|create|update|destroy|validation|commit|rollback|initialize|find|touch|save_commit|create_commit|update_commit|destroy_commit
```

2. Reorder so the `_commit` compound variants come BEFORE their shorter prefixes:

```
save_commit|create_commit|update_commit|destroy_commit|save|create|update|destroy|validation|commit|rollback|initialize|find|touch
```

3. Apply the same reordering to the `callbackType` pattern (identical alternation).

4. Apply the same reordering to the block callback regex in `src/extractors/model.js` — search for `blockCbRe` which has the same alternation inline.

**Modify:** `src/core/patterns/model.js` AND `src/extractors/model.js` (the `blockCbRe` variable only)

#### Acceptance criteria

- [ ] `after_save_commit :method_a, :method_b` is detected as type `after_save_commit` with method `method_a`
- [ ] The multi-method expansion produces two separate callback entries
- [ ] `before_save`, `after_create`, etc. still work (shorter variants still match when no `_commit` suffix)
- [ ] All existing tests pass

#### Constraints

- In `src/core/patterns/model.js`, modify ONLY the `callback` and `callbackType` regex alternation ordering
- In `src/extractors/model.js`, modify ONLY the `blockCbRe` regex alternation ordering
- Do NOT change any other patterns or extraction logic

#### Verify

```bash
npm test
```

```bash
git add -A && git commit -m "fix: reorder callback regex alternation so _commit variants match first (ISSUE-04/15)"
```

---

### Task 2: Add Enumerize gem detection

**Fixes:** ISSUE-02 (enumerize fields not captured)

**Goal:** Detect `enumerize :field_name, in: [...]` declarations and include them in the model's `enums` field with `syntax: "enumerize"`.

**Read first:**

- `src/extractors/model.js` — the enum extraction section (search for `enumModernHashRe`)
- `src/core/patterns/model.js` — existing patterns

**Modify:** `src/core/patterns/model.js` AND `src/extractors/model.js`

#### What to do

1. In `src/core/patterns/model.js`, add after the existing enum patterns:

```javascript
  // === ENUMERIZE GEM ===
  enumerize: /^\s*enumerize\s+:(\w+),\s*in:\s*(?:\[([^\]]+)\]|%w\[([^\]]+)\])/m,
```

2. In `src/extractors/model.js`, after the `enumArrayPatterns` loop (after the comment `// Array syntax: enum :role, [ :a, :b ]`), add:

```javascript
  // Enumerize gem: enumerize :field, in: [:val1, :val2, ...]
  const enumerizeRe = /^\s*enumerize\s+:(\w+),\s*in:\s*(?:\[([^\]]+)\]|%w\[([^\]]+)\])/gm
  while ((m = enumerizeRe.exec(content))) {
    const name = m[1]
    if (enums[name]) continue // native enum takes priority
    const rawValues = m[2] || m[3] || ''
    const values = rawValues
      .split(',')
      .map(v => v.trim().replace(/^:/, '').replace(/['"]/g, ''))
      .filter(v => v.length > 0)
    enums[name] = { values, syntax: 'enumerize' }
  }
```

#### Acceptance criteria

- [ ] Models with `enumerize :status, in: [:draft, :published]` show `enums.status.values: ["draft", "published"]`
- [ ] `syntax` field is `"enumerize"` for enumerize-detected enums
- [ ] Native Rails `enum` declarations still detected (not overwritten by enumerize)
- [ ] Both symbol-style (`[:a, :b]`) and string-style (`['a', 'b']`) and %w-style (`%w[a b]`) values are captured
- [ ] All existing tests pass

#### Constraints

- Do NOT remove or modify existing enum detection code
- Place enumerize detection AFTER native enum detection so native takes priority
- Do NOT modify any other patterns or fields

#### Verify

```bash
npm test
```

```bash
git add -A && git commit -m "fix: detect Enumerize gem declarations as enums (ISSUE-02)"
```

---

### Task 3: Detect Rolify macro and synthesise implicit association

**Fixes:** ISSUE-03 (rolify associations not detected on AdminUser)

**Goal:** The `rolify` macro implicitly creates a `has_and_belongs_to_many` association. Detect it and add the synthetic association.

**Read first:**

- `src/extractors/model.js` — the associations extraction section

**Modify:** `src/extractors/model.js`

#### What to do

1. After the existing association extraction loops (after the `assocTypes` for-loop), add detection for the `rolify` macro:

```javascript
  // Rolify gem: rolify :role_cname => 'ClassName' or rolify role_cname: 'ClassName'
  const rolifyRe = /^\s*rolify(?:\s+(.+))?$/m
  const rolifyMatch = content.match(rolifyRe)
  if (rolifyMatch) {
    // Extract the role class name from options
    const rolifyOpts = rolifyMatch[1] || ''
    const cnameMatch = rolifyOpts.match(
      /(?::role_cname\s*=>|role_cname:)\s*['"](\w+(?:::\w+)*)['"]/
    )
    const roleClassName = cnameMatch ? cnameMatch[1] : 'Role'

    // Synthesise the implicit HABTM association
    associations.push({
      type: 'has_and_belongs_to_many',
      name: roleClassName.replace(/::/g, '').replace(/([A-Z])/g, (m, l, i) =>
        i === 0 ? l.toLowerCase() : `_${l.toLowerCase()}`
      ) + 's',
      options: `class_name: '${roleClassName}'`,
      rolify: true,
    })
  }
```

#### Acceptance criteria

- [ ] `AdminUser` with `rolify :role_cname => 'AdminRole'` shows a `has_and_belongs_to_many` association to `AdminRole`
- [ ] The association is tagged with `rolify: true` so consumers know it's synthetic
- [ ] Models without `rolify` are unaffected
- [ ] All existing tests pass

#### Constraints

- Do NOT modify any files other than `src/extractors/model.js`
- Place the detection after existing association extraction, not inside the existing loops
- Do NOT modify the `rolify` detection that already exists in `src/core/indexer.js` for STI (that's a different `rolify` check in the authorization section)

#### Verify

```bash
npm test
```

```bash
git add -A && git commit -m "fix: detect rolify macro and synthesise HABTM association (ISSUE-03)"
```

---

### Task 4: Fix model name collision — Page overwritten by Wordpress::Page

**Fixes:** ISSUE-01 (non-WordPress Page model missing)

**Goal:** When two model files produce the same class name key, the second overwrites the first. Fix the indexer to detect collisions and disambiguate using file-path-derived namespacing.

**Read first:**

- `src/core/indexer.js` — the model indexing block (search for `categoryName === 'models'`)
- `src/utils/ruby-class-resolver.js` — `resolveFullyQualifiedName`

**Modify:** `src/core/indexer.js`

#### What to do

1. In the model indexing block, after computing `key`, add collision detection:

```javascript
    if (model) {
      let key = model.class || pathToClassName(entry.path)

      // Handle name collisions: if key already exists from a different file,
      // derive namespace from the new file's path to disambiguate
      if (extractions.models[key] && extractions.models[key].file !== entry.path) {
        // Derive namespace from directory structure:
        // app/models/wordpress/page.rb → Wordpress::Page
        const relativePath = entry.path
          .replace(/^app\/models\//, '')
          .replace(/\.rb$/, '')
        const pathSegments = relativePath.split('/')
        if (pathSegments.length > 1) {
          // File is in a subdirectory — namespace it
          const namespacedKey = pathSegments
            .map(seg => seg.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(''))
            .join('::')
          key = namespacedKey
          if (model.class) model.class = namespacedKey
          if (!model.namespace) {
            model.namespace = pathSegments.slice(0, -1)
              .map(seg => seg.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(''))
              .join('::')
          }
        }
      }

      extractions.models[key] = model
    }
```

2. This ensures the first model (e.g., `Page` from `app/models/page.rb`) keeps its key, and the second (from `app/models/wordpress/page.rb`) gets namespaced to `Wordpress::Page`.

#### Acceptance criteria

- [ ] Both `Page` and `Wordpress::Page` appear in the model list
- [ ] `get_model({ name: "Page" })` returns the `app/models/page.rb` model
- [ ] `get_model({ name: "Wordpress::Page" })` returns the `app/models/wordpress/page.rb` model
- [ ] All existing tests pass

#### Constraints

- Do NOT modify `src/extractors/model.js` or `src/utils/ruby-class-resolver.js`
- Only modify the model indexing block in `src/core/indexer.js`
- The first model indexed keeps its original key — only the collider gets namespaced

#### Verify

```bash
npm test
```

```bash
git add -A && git commit -m "fix: disambiguate model name collisions via file-path namespace (ISSUE-01)"
```

---

### Task 5: Expand search_patterns to cover all extraction fields

**Fixes:** ISSUE-07 (search misses validations, scopes, devise modules)

**Goal:** The `search_patterns` tool only searches associations, callbacks, concerns, and partially enums/devise. Expand it to search validations, scopes, devise_modules, delegations, and has_secure_password.

**Read first:**

- `src/tools/handlers/search-patterns.js` — the entire handler

**Modify:** `src/tools/handlers/search-patterns.js`

#### What to do

1. Inside the model iteration loop (`for (const [name, model] of Object.entries(extractions.models || {}))`), after the existing matching blocks, add these new matching blocks. Remove the old `enums` and `devise` blocks first (they're inside conditionals that are too narrow), then add comprehensive replacements:

```javascript
      // Validations
      if (model.validations) {
        for (const val of model.validations) {
          const attrStr = (val.attributes || []).join(' ').toLowerCase()
          const rulesStr = (val.rules || '').toLowerCase()
          if (lowerPattern === 'validates' || lowerPattern === 'validation' ||
              attrStr.includes(lowerPattern) || rulesStr.includes(lowerPattern)) {
            matches.push({ type: 'validation', detail: val })
          }
        }
      }
      if (model.custom_validators) {
        for (const cv of model.custom_validators) {
          if (cv.toLowerCase().includes(lowerPattern) ||
              lowerPattern === 'validates' || lowerPattern === 'validate') {
            matches.push({ type: 'custom_validator', detail: cv })
          }
        }
      }

      // Scopes
      if (model.scopes) {
        for (const scopeName of model.scopes) {
          if (lowerPattern === 'scope' ||
              scopeName.toLowerCase().includes(lowerPattern)) {
            matches.push({
              type: 'scope',
              detail: { name: scopeName, query: model.scope_queries?.[scopeName] || null }
            })
          }
        }
      }

      // Enums (replaces old enum block)
      if (model.enums && Object.keys(model.enums).length > 0) {
        for (const [enumName, enumData] of Object.entries(model.enums)) {
          if (lowerPattern === 'enum' || lowerPattern === 'enumerize' ||
              lowerPattern.includes('enum') ||
              enumName.toLowerCase().includes(lowerPattern)) {
            matches.push({ type: 'enum', detail: { name: enumName, ...enumData } })
          }
        }
      }

      // Devise modules (replaces old devise block)
      if (model.devise_modules && model.devise_modules.length > 0) {
        for (const mod of model.devise_modules) {
          if (lowerPattern === 'devise' ||
              mod.toLowerCase().includes(lowerPattern) ||
              `devise_${mod}`.includes(lowerPattern)) {
            matches.push({ type: 'devise_module', detail: mod })
          }
        }
      }

      // Delegations
      if (model.delegations) {
        for (const del of model.delegations) {
          if (lowerPattern === 'delegate' || lowerPattern === 'delegation' ||
              (del.to && del.to.toLowerCase().includes(lowerPattern))) {
            matches.push({ type: 'delegation', detail: del })
          }
        }
      }

      // has_secure_password
      if (model.has_secure_password &&
          (lowerPattern === 'has_secure_password' || lowerPattern === 'secure_password')) {
        matches.push({ type: 'has_secure_password', detail: true })
      }
```

2. **Remove** the existing `if (model.enums && lowerPattern.includes('enum'))` block and the `if (lowerPattern.startsWith('devise') && model.devise_modules)` block — the new code above replaces them with broader matching.

#### Acceptance criteria

- [ ] `search_patterns({ pattern: "validates" })` returns matches for all models with validations
- [ ] `search_patterns({ pattern: "scope" })` returns scope declarations, not just callback methods named "scope"
- [ ] `search_patterns({ pattern: "devise" })` returns devise module matches
- [ ] `search_patterns({ pattern: "enum" })` returns both native enum and enumerize matches
- [ ] `search_patterns({ pattern: "has_many" })` still works (existing functionality preserved)
- [ ] All existing tests pass

#### Constraints

- Do NOT modify any files other than `src/tools/handlers/search-patterns.js`
- Remove the old enum/devise blocks before adding new ones to avoid duplicate matches

#### Verify

```bash
npm test
```

```bash
git add -A && git commit -m "fix: expand search_patterns to cover validations, scopes, enums, devise, delegations (ISSUE-07)"
```

---

### Task 6: Extract authorization role names from has_role? calls

**Fixes:** ISSUE-05 (authorization roles not extracted)

**Goal:** Parse `has_role?(:role_name)` calls in ability files to populate the roles list with actual role names.

**Read first:**

- `src/extractors/authorization.js` — the CanCanCan section

**Modify:** `src/extractors/authorization.js`

#### What to do

1. In the CanCanCan section, find the block that extracts roles from `has_role?` calls. Currently it uses this regex:

```javascript
const roleRe = /has_role\?\s*\(:?['"]?(\w+)['"]?\)/g
```

This should be working. The issue might be that the regex doesn't match the Ruby symbol syntax `has_role?(:admin)` — the `'?` before the `\(` is optional but the colon prefix on the symbol might not be captured.

2. Fix the regex to handle all common patterns:

```javascript
      // Extract role names from has_role? calls in the ability file
      const roleRe = /has_role\?\s*\(\s*:(\w+)\s*\)/g
      const roles = new Set()
      let roleM
      while ((roleM = roleRe.exec(abilityContent))) {
        roles.add(roleM[1])
      }
      // Also try string syntax: has_role?('admin') or has_role?("admin")
      const roleStrRe = /has_role\?\s*\(\s*['"](\w+)['"]\s*\)/g
      while ((roleM = roleStrRe.exec(abilityContent))) {
        roles.add(roleM[1])
      }
      if (roles.size > 0) {
        result.roles = {
          source: 'ability_class',
          model: 'User',
          roles: [...roles],
          file: abilityFile,
        }
      }
```

3. Also add role-grouped abilities. After the flat `abilities` array is built, parse the conditional structure:

```javascript
      // Group abilities by role from conditional blocks
      const roleAbilities = {}
      const roleBlockRe = /(?:if|elsif)\s+.*?has_role\?\s*\(\s*:(\w+)\s*\)/g
      let rbMatch
      const rolePositions = []
      while ((rbMatch = roleBlockRe.exec(abilityContent))) {
        rolePositions.push({ role: rbMatch[1], index: rbMatch.index })
      }

      for (let i = 0; i < rolePositions.length; i++) {
        const start = rolePositions[i].index
        const end = i + 1 < rolePositions.length
          ? rolePositions[i + 1].index
          : abilityContent.length
        const block = abilityContent.slice(start, end)

        const blockAbilities = []
        const blockCanRe = /^\s*(can(?:not)?)\s+(.+)/gm
        let bm
        while ((bm = blockCanRe.exec(block))) {
          blockAbilities.push({ type: bm[1], definition: bm[2].trim() })
        }
        if (blockAbilities.length > 0) {
          roleAbilities[rolePositions[i].role] = blockAbilities
        }
      }

      if (Object.keys(roleAbilities).length > 0) {
        result.abilities_by_role = roleAbilities
      }
```

#### Acceptance criteria

- [ ] `roles.roles` contains actual role names (e.g., `["admin", "editor", "sales", "producer", "contributer", "explorer"]`)
- [ ] `abilities_by_role` groups abilities under each role key
- [ ] The flat `abilities` array is preserved for backward compatibility
- [ ] All existing tests pass

#### Constraints

- Do NOT modify any files other than `src/extractors/authorization.js`
- Do NOT modify the Pundit or custom RBAC sections
- Add `abilities_by_role` as a NEW field — do not replace `abilities`

#### Verify

```bash
npm test
```

```bash
git add -A && git commit -m "fix: extract role names from has_role? and group abilities by role (ISSUE-05)"
```

---

### Task 7: Checkpoint — Phase 1

**This is a manual verification step. Do not send this to the AI agent.**

```bash
npm test
git diff HEAD~6..HEAD --stat
git tag checkpoint-phase1
```

---

## Phase 2: Graph, Subgraph & Tool Fixes (HIGH + MEDIUM)

### Task 8: Register mailer classes as graph nodes with edges

**Fixes:** ISSUE-18 (mailers not in graph), ISSUE-06 (email subgraph empty — downstream of same root cause)

**Goal:** Mailer classes are extracted by the email extractor but never added to the relationship graph. Add them as nodes with inheritance edges so they're discoverable via subgraphs and blast radius.

**Read first:**

- `src/core/graph.js` — the `buildGraph` function (see how controllers and helpers are added)
- `src/extractors/email.js` — the email extraction output shape (mailers have `class`, `superclass`, `file`)

**Modify:** `src/core/graph.js`

#### What to do

1. After the existing helper and worker sections in `buildGraph`, add mailer nodes:

```javascript
  // Mailers — add as graph nodes with inheritance edges
  if (extractions.email?.mailers) {
    for (const mailer of extractions.email.mailers) {
      if (!mailer.class) continue
      graph.addNode(mailer.class, 'mailer', mailer.class)

      // Inheritance edge (e.g., ContactMessageMailer → ApplicationMailer)
      if (mailer.superclass && mailer.superclass !== 'ActionMailer::Base') {
        graph.addNode(mailer.superclass, 'mailer', mailer.superclass)
        graph.addEdge(mailer.class, mailer.superclass, 'inherits')
        relationships.push({ from: mailer.class, to: mailer.superclass, type: 'inherits' })
      }
    }
  }
```

2. Also add `sends_mail` edges from controllers that call mailer methods. This is a heuristic — look for controllers that reference mailer classes by name:

```javascript
  // Controller → Mailer edges (convention: if controller file references a mailer class)
  if (extractions.email?.mailers && extractions.controllers) {
    const mailerNames = new Set(
      extractions.email.mailers.map(m => m.class).filter(Boolean)
    )
    // This is done via convention_pair-style matching;
    // actual file content scanning would be too expensive here.
    // The mailer nodes are sufficient for subgraph discovery.
  }
```

(Skip the controller→mailer edge for now — the mailer nodes themselves are sufficient to fix the email subgraph.)

#### Acceptance criteria

- [ ] Mailer classes appear as nodes in the graph
- [ ] Mailer inheritance edges exist (e.g., ContactMessageMailer → ApplicationMailer)
- [ ] `get_subgraph({ skill: "email" })` returns non-zero entities
- [ ] All existing tests pass

#### Constraints

- Do NOT modify any files other than `src/core/graph.js`
- Place the mailer section after the existing worker/helper sections
- Do NOT scan file contents in the graph builder — only use extraction data

#### Verify

```bash
npm test
```

```bash
git add -A && git commit -m "fix: register mailer classes as graph nodes with inheritance edges (ISSUE-06/18)"
```

---

### Task 9: Fix authentication subgraph to filter irrelevant entities

**Fixes:** ISSUE-13 (auth subgraph polluted with Activity, Event, etc.)

**Goal:** The auth subgraph uses BFS from auth seeds, which spreads to highly-connected models through `belongs_to :author` associations. Add post-filtering to keep only auth-relevant entities.

**Read first:**

- `src/tools/handlers/get-subgraph.js` — the handler function

**Modify:** `src/tools/handlers/get-subgraph.js`

#### What to do

1. In the handler function, just before the final `return respond(...)`, add a filter for the `authentication` skill:

```javascript
      // Authentication: post-filter to remove entities that aren't auth-relevant.
      // BFS from auth seeds leaks into high-connectivity models (e.g., Activity
      // via belongs_to :author), polluting the subgraph.
      if (skill === 'authentication') {
        const authEntityPatterns = /auth|session|user|admin|devise|password|registration|confirmation|login|signup|member|ability|role|current|warden|omniauth/i

        const authFiltered = rankedFiles.filter(e =>
          seeds.has(e.entity) || authEntityPatterns.test(e.entity)
        )
        const authEntitySet = new Set(authFiltered.map(e => e.entity))
        const authRels = subgraphRels.filter(
          r => authEntitySet.has(r.from) && authEntitySet.has(r.to)
        )

        return respond({
          skill,
          entities: authFiltered,
          relationships: authRels,
          total_entities: authFiltered.length,
          total_relationships: authRels.length,
        })
      }
```

2. Place this block immediately before the existing `return respond(...)` at the end of the handler.

#### Acceptance criteria

- [ ] `get_subgraph({ skill: "authentication" })` returns only auth-relevant entities
- [ ] Activity, Event, WpPost etc. are excluded
- [ ] AdminUser, Member, auth controllers remain
- [ ] Other skills (database, frontend, api, jobs, email) are unaffected
- [ ] All existing tests pass

#### Constraints

- Do NOT modify any files other than `src/tools/handlers/get-subgraph.js`
- Only filter the `authentication` skill — no changes to other skills

#### Verify

```bash
npm test
```

```bash
git add -A && git commit -m "fix: filter auth subgraph to auth-relevant entities only (ISSUE-13)"
```

---

### Task 10: Fix model_list superclass inconsistency

**Fixes:** ISSUE-08 (AdminAbility shows ApplicationRecord in model_list), ISSUE-10 (Sluggable shows ApplicationRecord in model_list)

**Goal:** The `model_list` category in `get_deep_analysis` uses `m.superclass || 'ApplicationRecord'` which fabricates a superclass for classes that don't have one. Fix it to use the actual detected superclass.

**Read first:**

- `src/tools/handlers/get-deep-analysis.js` — the `model_list` case

**Modify:** `src/tools/handlers/get-deep-analysis.js`

#### What to do

1. Find the `case 'model_list':` block. It currently has:

```javascript
return respond(
  Object.entries(models).map(([n, m]) => ({
    name: n,
    superclass: m.superclass || 'ApplicationRecord',
    association_count: (m.associations || []).length,
    ...
  })),
)
```

2. Change `m.superclass || 'ApplicationRecord'` to `m.superclass || null`:

```javascript
    superclass: m.superclass || null,
    type: m.type || 'model',
```

3. Also add the `type` field so consumers can distinguish models from concerns and POROs.

#### Acceptance criteria

- [ ] `model_list` shows `superclass: null` for classes without AR inheritance (AdminAbility, Sluggable)
- [ ] `model_list` shows `type: "concern"` for concerns
- [ ] Normal models still show their correct superclass
- [ ] All existing tests pass

#### Constraints

- Do NOT modify any files other than `src/tools/handlers/get-deep-analysis.js`
- Only change the `model_list` case — do not modify other cases

#### Verify

```bash
npm test
```

```bash
git add -A && git commit -m "fix: model_list uses actual superclass instead of defaulting to ApplicationRecord (ISSUE-08/10)"
```

---

### Task 11: Tag block callbacks with [block] label

**Fixes:** ISSUE-09 (block callbacks show method: null)

**Goal:** Block-style callbacks like `before_save { self.name = name.strip }` produce `method: null`. Change to `method: "[block]"`.

**Read first:**

- `src/extractors/model.js` — the block callback section (search for `blockCbRe`)

**Modify:** `src/extractors/model.js`

#### What to do

1. Find the block callback push statement:

```javascript
rawCallbacks.push({ type: m[1], method: null, options: null })
```

2. Replace with:

```javascript
rawCallbacks.push({ type: m[1], method: '[block]', options: null })
```

#### Acceptance criteria

- [ ] Block callbacks show `method: "[block]"` instead of `null`
- [ ] Named method callbacks are unchanged
- [ ] All existing tests pass

#### Constraints

- Do NOT modify any files other than `src/extractors/model.js`
- One-line change only

#### Verify

```bash
npm test
```

```bash
git add -A && git commit -m "fix: tag block callbacks with [block] label (ISSUE-09)"
```

---

### Task 12: Fix factory detection when gem is missing but files exist

**Fixes:** ISSUE-12 (factories: false despite factory files existing)

**Goal:** The factory detection checks only the Gemfile for `factory_bot`. When the gem is a transitive dependency (not directly in Gemfile) but factory files exist, it reports false. Fix by also checking for factory file existence.

**Read first:**

- `src/extractors/test-conventions.js` — `factory_tool` field
- `src/extractors/tier2.js` — `extractTesting` function, `factories` field

**Modify:** `src/extractors/test-conventions.js` AND `src/extractors/tier2.js`

#### What to do

1. In `src/extractors/test-conventions.js`, replace the `factory_tool` line:

```javascript
    // Factory tool — check gems first, then fall back to scanning factory files
    factory_tool:
      gems.factory_bot_rails || gems.factory_bot
        ? 'factory_bot'
        : gems.fabrication
          ? 'fabrication'
          : detectFactoryToolFromFiles(provider, entries),
```

Add the helper function at the bottom of the file (before the final export or after the last function):

```javascript
/**
 * Detect factory tool by scanning factory files when gem detection fails.
 * @param {import('../providers/interface.js').FileProvider} provider
 * @param {Array<{path: string}>} entries
 * @returns {string|null}
 */
function detectFactoryToolFromFiles(provider, entries) {
  const factoryEntries = entries.filter(
    e => e.path.includes('factories/') && e.path.endsWith('.rb')
  )
  for (const entry of factoryEntries) {
    const content = provider.readFile(entry.path)
    if (content && /FactoryBot\.define/.test(content)) return 'factory_bot'
    if (content && /Fabricator\(/.test(content)) return 'fabrication'
  }
  return null
}
```

2. In `src/extractors/tier2.js`, in the `extractTesting` function, change the `factories` line from:

```javascript
factories: !!gems.factory_bot_rails,
```

to:

```javascript
factories: !!(gems.factory_bot_rails || gems.factory_bot || detectFactoriesDir(provider)),
```

#### Acceptance criteria

- [ ] `factory_tool: "factory_bot"` when factory files contain `FactoryBot.define` even if gem isn't in Gemfile
- [ ] `factories: true` when `test/factories/` or `spec/factories/` directory exists with `.rb` files
- [ ] All existing tests pass

#### Constraints

- Do NOT modify any files other than `src/extractors/test-conventions.js` and `src/extractors/tier2.js`

#### Verify

```bash
npm test
```

```bash
git add -A && git commit -m "fix: detect factories from files when gem not in Gemfile (ISSUE-12)"
```

---

### Task 13: Fix review_context token budget enforcement

**Fixes:** ISSUE-14 (token_budget has minimal effect)

**Goal:** The `buildReviewContext` function doesn't effectively trim output. Add a final verification pass that removes entities when total output exceeds budget.

**Read first:**

- `src/core/blast-radius.js` — the `buildReviewContext` function

**Modify:** `src/core/blast-radius.js`

#### What to do

1. At the end of `buildReviewContext`, after the entity-building loop and before `return context`, add:

```javascript
  // Final enforcement: verify total fits within budget, trim if not
  let totalTokens = estimateTokensForObject(context)
  while (totalTokens > tokenBudget && context.entities.length > 0) {
    // Drop lowest-risk entity (last in list, since sorted by risk)
    context.entities.pop()
    totalTokens = estimateTokensForObject(context)
  }
```

2. Also add a safety margin to `remainingBudget` calculation. Find the line:

```javascript
  let remainingBudget = tokenBudget - headerTokens
```

Change to:

```javascript
  let remainingBudget = tokenBudget - headerTokens - 200 // safety margin for JSON structure
```

#### Acceptance criteria

- [ ] `get_review_context` with `token_budget: 2000` returns meaningfully fewer entities than default
- [ ] HIGH/CRITICAL entities are preserved when LOW entities are dropped
- [ ] All existing tests pass

#### Constraints

- Do NOT modify any files other than `src/core/blast-radius.js`
- Do NOT change the function signature

#### Verify

```bash
npm test
```

```bash
git add -A && git commit -m "fix: enforce token budget in review context with final trim pass (ISSUE-14)"
```

---

### Task 14: Checkpoint — Phase 2

**This is a manual verification step. Do not send this to the AI agent.**

```bash
npm test
git diff checkpoint-phase1..HEAD --stat
git tag checkpoint-phase2
```

---

## Phase 3: LOW Priority & Polish

### Task 15: Deduplicate factory attributes

**Fixes:** ISSUE-16 (factory attributes contain duplicates from trait overrides)

**Goal:** The factory parser adds the same attribute multiple times when traits override base attributes. Deduplicate.

**Read first:**

- `src/extractors/factory-registry.js` — the `parseFactoryFile` function

**Modify:** `src/extractors/factory-registry.js`

#### What to do

1. In `parseFactoryFile`, after a factory is fully parsed and pushed to `factories`, deduplicate its attributes:

Find the line `factories.push(currentFactory)` (it appears twice — once for nested factory closure and once for end-of-block closure). Before each push, add:

```javascript
        // Deduplicate attributes
        currentFactory.attributes = [...new Set(currentFactory.attributes)]
```

Also add it before the "Handle unclosed factory" push at the end.

#### Acceptance criteria

- [ ] Factory attributes array contains no duplicates
- [ ] Trait-specific overrides don't add to the base attribute list
- [ ] All existing tests pass

#### Constraints

- Do NOT modify any files other than `src/extractors/factory-registry.js`

#### Verify

```bash
npm test
```

```bash
git add -A && git commit -m "fix: deduplicate factory attributes (ISSUE-16)"
```

---

### Task 16: Include HTTP method for member/collection routes

**Fixes:** ISSUE-17 (duplicate restore member routes without method differentiation)

**Goal:** Member and collection routes are stored as bare action names. When the same action has multiple HTTP methods (e.g., PUT and POST), duplicates appear. Store structured objects instead.

**Read first:**

- `src/extractors/routes.js` — the member/collection route handling

**Modify:** `src/extractors/routes.js`

#### What to do

1. Find the section that handles HTTP verb routes inside member/collection blocks. Currently:

```javascript
if (inMember && resourceStack.length > 0) {
  const currentResource = resourceStack[resourceStack.length - 1]
  const memberAction = path.replace(/^\//, '').split('/')[0]
  currentResource.member_routes.push(memberAction)
}
```

2. Change to store objects with method:

```javascript
if (inMember && resourceStack.length > 0) {
  const currentResource = resourceStack[resourceStack.length - 1]
  const memberAction = path.replace(/^\//, '').split('/')[0]
  currentResource.member_routes.push({ action: memberAction, method })
}
```

3. Apply the same change for collection routes:

```javascript
} else if (inCollection && resourceStack.length > 0) {
  const currentResource = resourceStack[resourceStack.length - 1]
  const collAction = path.replace(/^\//, '').split('/')[0]
  currentResource.collection_routes.push({ action: collAction, method })
}
```

4. Also update the symbol-form verb routes section (inside `if (inMember || inCollection)`):

```javascript
if (symbolVerbMatch) {
  const action = symbolVerbMatch[1]
  const symbolMethod = trimmed.match(/^\s*(get|post|put|patch|delete)\s/)?.[1]?.toUpperCase() || 'GET'
  const currentResource = resourceStack[resourceStack.length - 1]
  if (currentResource) {
    if (inMember) currentResource.member_routes.push({ action, method: symbolMethod })
    else currentResource.collection_routes.push({ action, method: symbolMethod })
  }
  continue
}
```

#### Acceptance criteria

- [ ] Member/collection routes are objects with `action` and `method` fields
- [ ] `restore` with PUT and POST shows as two distinct entries with different methods
- [ ] All existing tests pass

#### Constraints

- Do NOT modify any files other than `src/extractors/routes.js`
- This is a breaking change for consumers expecting string arrays — but since this is pre-1.0 API, it's acceptable

#### Verify

```bash
npm test
```

```bash
git add -A && git commit -m "fix: include HTTP method in member/collection routes (ISSUE-17)"
```

---

### Task 17: Report default cache_store when production has no explicit config

**Fixes:** ISSUE-11 (production cache_store missing)

**Goal:** When production.rb has no uncommented `config.cache_store` line, the caching extractor returns no entry for production. Report the Rails default.

**Read first:**

- `src/extractors/caching.js` — the per-environment cache store detection

**Modify:** `src/extractors/caching.js`

#### What to do

1. After the per-environment loop that reads cache store config, add a fallback for production if it wasn't explicitly set:

```javascript
  // If production has no explicit cache_store, note the Rails default
  if (!result.store.production) {
    result.store.production = 'file_store (Rails default — not explicitly configured)'
  }
```

2. Place this after the `for (const env of ['production', 'development', 'test'])` loop.

#### Acceptance criteria

- [ ] When production.rb has no active `config.cache_store`, the store reports the default
- [ ] When production.rb HAS an explicit config, that value is used (no change)
- [ ] All existing tests pass

#### Constraints

- Do NOT modify any files other than `src/extractors/caching.js`
- Do NOT try to determine the exact Rails default version-by-version — a descriptive string is sufficient

#### Verify

```bash
npm test
```

```bash
git add -A && git commit -m "fix: report default cache_store when production has no explicit config (ISSUE-11)"
```

---

### Task 18: Final Checkpoint

**This is a manual verification step. Do not send this to the AI agent.**

#### Verify

1. Full test suite:

```bash
npm test
```

2. Verify modified files:

```bash
git diff fix/eval-v1.0.18 --name-only | sort
```

Expected files:

```
src/core/blast-radius.js
src/core/graph.js
src/core/indexer.js
src/core/patterns/model.js
src/extractors/authorization.js
src/extractors/caching.js
src/extractors/factory-registry.js
src/extractors/model.js
src/extractors/routes.js
src/extractors/test-conventions.js
src/extractors/tier2.js
src/tools/handlers/get-deep-analysis.js
src/tools/handlers/get-subgraph.js
src/tools/handlers/search-patterns.js
```

3. Run targeted test suites:

```bash
npm run test:core
npm run test:extractors
npm run test:mcp
```

```bash
git tag v1.0.19-eval-fixes
```

---

## Summary

| Task | File(s)                           | Issues Fixed | Change                                        |
| ---- | --------------------------------- | ------------ | --------------------------------------------- |
| 1    | `patterns/model.js`, `model.js`   | 04, 15       | Reorder callback regex alternation            |
| 2    | `patterns/model.js`, `model.js`   | 02           | Add enumerize detection                       |
| 3    | `model.js`                        | 03           | Detect rolify macro, synthesise HABTM         |
| 4    | `indexer.js`                      | 01           | Model name collision disambiguation           |
| 5    | `search-patterns.js`              | 07           | Add validation/scope/devise/delegation search |
| 6    | `authorization.js`                | 05           | Extract role names, group abilities by role   |
| 8    | `graph.js`                        | 06, 18       | Register mailer nodes with edges              |
| 9    | `get-subgraph.js`                 | 13           | Post-filter auth subgraph                     |
| 10   | `get-deep-analysis.js`            | 08, 10       | Fix model_list superclass default             |
| 11   | `model.js`                        | 09           | Tag block callbacks `[block]`                 |
| 12   | `test-conventions.js`, `tier2.js` | 12           | Detect factories from files                   |
| 13   | `blast-radius.js`                 | 14           | Token budget final trim pass                  |
| 15   | `factory-registry.js`             | 16           | Deduplicate factory attributes                |
| 16   | `routes.js`                       | 17           | HTTP method on member/collection routes       |
| 17   | `caching.js`                      | 11           | Default cache_store fallback                  |
