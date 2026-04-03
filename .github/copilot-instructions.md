# RailsInsight MCP Server

## What This Is

RailsInsight is a Rails-aware codebase indexer that runs as an MCP (Model Context Protocol) server. It gives AI coding agents deep structural understanding of Rails applications — models, associations, routes, schema, authentication, jobs, components, and 56 total file categories — without reading every file.

This is a public npm package (`@reinteractive/rails-insight`) published under reinteractive's name. Every output must be accurate. Every hallucination is a lie an AI agent might act on. Quality is non-negotiable.

## Quality Standard

These are the hard targets. Do not ship code that moves any metric backwards.

| Metric                              | Target    | Current (v1.0.20) |
| ----------------------------------- | --------- | ----------------- |
| Weighted F1 (all 17 tools)          | ≥ 0.95    | 0.84              |
| Hallucination rate (FP / (TP + FP)) | < 1%      | 2.4%              |
| Tools with F1 ≥ 0.95                | 17/17     | 9/17              |
| Tools with F1 < 0.80                | 0/17      | 3/17              |
| Test suite                          | 100% pass | ✓                 |

**Every change must improve or maintain these metrics. Never trade one tool's score for another's.**

## Architecture

```
bin/railsinsight.js              CLI entry point
src/server.js                    MCP server setup (stdio transport)
src/core/
  indexer.js                     Pipeline orchestrator: context → versions → scan → extract → graph
  scanner.js                     Layer 3: classifies files into 56 categories (zero file reads)
  graph.js                       Layer 5: directed weighted graph + Personalized PageRank
  blast-radius.js                BFS impact analysis for code changes
  formatter.js                   Token-budgeted JSON output
  constants.js                   Shared constants (no magic numbers)
  patterns/*.js                  21 domain-specific regex pattern files
src/extractors/
  model.js                       Associations, validations, scopes, enums, callbacks, methods
  controller.js                  Actions, filters, strong params, rescue handlers
  routes.js                      Resource/namespace/scope stack tracking
  schema.js                      Tables, columns, indexes, foreign keys from db/schema.rb
  auth.js                        Devise, native Rails 8, JWT detection
  authorization.js               Pundit, CanCanCan, custom RBAC
  [13 more extractors]
src/tools/
  handlers/*.js                  17 MCP tool handlers (one file per tool)
  index.js                       Tool registration with tier gating
src/introspection/
  bridge.js                      Ruby runtime introspection bridge
  merger.js                      Merge regex + runtime extraction results
  introspect.rb                  Ruby script for live Rails metadata
src/utils/
  inflector.js                   Ruby-compatible pluralize/singularize/classify
  ruby-class-resolver.js         FQN resolution from module wrappers
  token-counter.js               Content-aware token estimation
src/providers/
  interface.js                   FileProvider interface definition
  local-fs.js                    Node.js filesystem provider
```

## Commands

```bash
npm test                         # Full Vitest suite — MUST pass before any commit
npm run test:watch               # Watch mode for development
npm run test:core                # Core layer tests only
npm run test:extractors          # Extractor tests only
npm run test:mcp                 # MCP tool handler tests only
npm run test:coverage            # Run with coverage report
npx vitest run test/path/file    # Single test file
```

## Code Style

- **ES modules** — `import`/`export`, never CommonJS. Include `.js` extension on all relative imports.
- **No TypeScript** — plain JavaScript with JSDoc annotations for types.
- **Zod schemas** for MCP tool input validation.
- **Two-space indentation**, single quotes, no semicolons optional (follow existing file style).
- **Files:** kebab-case (`blast-radius.js`, `diff-parser.js`)
- **Functions:** camelCase (`computeBlastRadius`, `buildGraph`)
- **Classes:** PascalCase (`Graph`, `LocalFSProvider`)
- **Constants:** SCREAMING_SNAKE (`EDGE_WEIGHTS`, `DEFAULT_TOKEN_BUDGET`)
- **Named exports only** — no default exports anywhere.
- **Group imports:** node builtins first, then dependencies, then local modules.

## Testing Rules

Tests are the quality gate. They are not optional, not afterthoughts, and not negotiable.

1. **Write tests FIRST.** Commit them before the implementation. This prevents modifying tests to make them pass.
2. **Every fix needs a regression test.** If a bug was found, write a test that fails without the fix and passes with it.
3. **Mock providers are inline objects.** No shared mock factories. Each test builds its own mock implementing the FileProvider interface.
4. **Test pattern:** `describe('functionName')` → `it('does specific thing')` → arrange/act/assert.
5. **Run the full suite before committing.** Not just the file you changed. `npm test` — everything green.
6. **Never modify existing tests to make them pass.** Fix the implementation instead.
7. **Test edge cases:** empty inputs, null values, missing files, malformed content, commented-out code.
8. **Vitest imports:** `import { describe, it, expect, vi } from 'vitest'`

## Error Handling Patterns

- **Extractors:** wrapped in `safeExtract(name, fn, fallback, verbose, errors)` — never throw.
- **Tool handlers:** return `respond({ error: message })` — never throw. Include available alternatives in error responses.
- **Bridge/external:** try/catch, always return a result object with an `error` field.

## The Fix Workflow

**One tool at a time. One branch per fix. Never batch fixes across multiple tools.**

### Step 1: Identify the fix

Pick the tool with the highest weighted F1 impact from the priority queue. Understand the root cause by reading the source code, not guessing.

### Step 2: Write failing tests

Create test file(s) that exercise the exact fix. Tests must fail before the implementation exists.

```bash
npx vitest run test/path/to/new-test.test.js
# Expected: tests fail with assertion errors, NOT import errors
git add -A && git commit -m "test: [description of what's being tested]"
```

### Step 3: Implement the fix

Modify the minimum number of source files. Place new code in the correct location (after existing similar code, following established patterns).

```bash
npm test
# Expected: ALL tests pass — new ones AND existing ones
```

### Step 4: Update CHANGELOG.md

Add an entry under `## [Unreleased]` (or create the next version section). Follow Keep a Changelog format:

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Fixed
- **Description of what was fixed**: Brief explanation of the change and what it resolves

### Added
- **New feature/detection**: Brief explanation (only if new capability added)
```

**Changelog rules:**

- Use `### Fixed` for bug fixes and accuracy improvements
- Use `### Added` for new detection capabilities (e.g., Enumerize support)
- Use `### Changed` for behaviour changes
- Write entries from the USER's perspective — what changed in the tool's output, not internal implementation details
- Include the tool name and the pattern/feature affected
- Reference the eval issue if applicable

### Step 5: Update README.md (if applicable)

Update README.md ONLY when:

- A new tool is added or removed
- A new detection capability is added that users should know about (e.g., "Now detects Enumerize gem declarations")
- A CLI flag is added or changed
- Installation or integration instructions change
- The Rails version support matrix changes

Do NOT update README.md for internal bug fixes, refactors, or minor accuracy improvements.

### Step 6: Bump version

In `package.json`, increment the version following semver:

- **Patch** (1.0.X): bug fixes, accuracy improvements, new pattern detection
- **Minor** (1.X.0): new tools, new CLI flags, breaking output format changes
- **Major** (X.0.0): breaking API changes (not expected)

Most fixes are **patch** bumps.

### Step 7: Commit, PR, merge

```bash
# Stage all changes
git add -A

# Commit with conventional commit message
git commit -m "fix: [concise description]

- [bullet point explaining the change]
- [bullet point explaining what was wrong]
- Closes #XX (if applicable)"

# Push and create PR
git push -u origin fix/[branch-name]
gh pr create --title "fix: [concise description]" --body "## What

[Brief description of the fix]

## Why

[What was wrong — reference eval issue if applicable]

## Testing

- Added X test cases in \`test/path/file.test.js\`
- All existing tests pass (\`npm test\`)
- Eval score impact: [tool] F1 X.XX → X.XX

## Changelog

Updated CHANGELOG.md with entry under [version]"

# Merge the PR (after CI passes if configured)
gh pr merge --squash --delete-branch
```

### Step 8: Publish to npm

```bash
# Pull the merged main branch
git checkout main
git pull

# Verify tests pass on main
npm test

# Publish
npm publish

# Tag the release
git tag v$(node -p "require('./package.json').version")
git push --tags
```

### Step 9: Verify

Run the eval against the test app. Confirm:

- Target tool F1 improved
- No other tool F1 decreased
- Hallucination count did not increase
- Full test suite still passes

## What NOT to Do

- **Never fix multiple tools in one PR.** Regressions become untraceable.
- **Never modify existing tests to make them pass.** Fix the implementation.
- **Never add dependencies** to package.json without discussion. The package has only 2 runtime deps (`@modelcontextprotocol/sdk`, `zod`) — keep it minimal.
- **Never change the MCP tool signatures** (parameter names, types) without a minor version bump.
- **Never fabricate data.** If an extractor can't determine a value, return `null` — not a guess. `superclass: null` is correct. `superclass: "ApplicationRecord"` when we don't know is a hallucination.
- **Never scan file contents in the scanner** (`scanner.js`). The scanner does zero file reads — classification is pure path-based. Content reading happens in extractors only.
- **Never break the existing extraction for one pattern while adding another.** The `if (enums[name]) continue` pattern exists for a reason — new detections must not overwrite existing ones.

## Key Decisions Already Made

- **Regex over AST:** RailsInsight uses regex-based extraction, not a Ruby AST parser. This handles 95%+ of real-world Rails code and is orders of magnitude faster. The tradeoff is documented in README.md Limitations.
- **Runtime introspection is optional:** The `--no-introspection` flag disables Ruby runtime introspection. Regex extraction is the primary path; introspection enriches it.
- **All tools are free tier:** No paid tier gating. `registerProTools` is a no-op stub kept for compatibility.
- **Token budget is a target, not a guarantee:** `get_full_index` respects it well. `get_review_context` needs fixing.
- **Graph edge weights are tuned:** Don't change `EDGE_WEIGHTS` values without understanding the impact on PageRank, blast radius, and subgraph ranking.
- **The inflector handles English only:** Ruby-compatible but English-language singularize/pluralize. This is by design.
