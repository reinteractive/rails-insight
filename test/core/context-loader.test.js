import { describe, it, expect } from 'vitest'
import { loadProjectContext } from '../../src/core/context-loader.js'

/**
 * Simple mock FileProvider for testing.
 */
function createMockProvider(files = {}) {
  return {
    readFile(path) {
      return files[path] ?? null
    },
    readLines(path) {
      const content = files[path]
      return content ? content.split('\n') : []
    },
    fileExists(path) {
      return path in files
    },
    glob() {
      return []
    },
    listDir() {
      return []
    },
    getProjectRoot() {
      return '/mock'
    },
  }
}

describe('Context Loader', () => {
  describe('loadProjectContext', () => {
    it('returns found: false when no claude.md exists', () => {
      const provider = createMockProvider({})
      const result = loadProjectContext(provider)
      expect(result.found).toBe(false)
      expect(result.raw).toBeNull()
      expect(result.warnings.length).toBeGreaterThan(0)
    })

    it('returns found: true when claude.md exists', () => {
      const provider = createMockProvider({ 'claude.md': '# Hello' })
      const result = loadProjectContext(provider)
      expect(result.found).toBe(true)
      expect(result.raw).toBe('# Hello')
    })

    it('uses custom path when provided', () => {
      const provider = createMockProvider({
        'docs/instructions.md': '# Custom',
      })
      const result = loadProjectContext(provider, 'docs/instructions.md')
      expect(result.found).toBe(true)
    })

    it('extracts stack items from content', () => {
      const provider = createMockProvider({
        'claude.md': `# Stack
- Rails 7.1
- PostgreSQL
- Redis
- Sidekiq
- Hotwire (Turbo + Stimulus)
- Tailwind CSS`,
      })
      const result = loadProjectContext(provider)
      expect(result.declared.stack).toContain('rails')
      expect(result.declared.stack).toContain('redis')
      expect(result.declared.stack).toContain('sidekiq')
      expect(result.declared.stack).toContain('turbo')
      expect(result.declared.stack).toContain('stimulus')
      expect(result.declared.stack).toContain('tailwind')
    })

    it('extracts Ruby version', () => {
      const provider = createMockProvider({
        'claude.md': '- Ruby 3.2.2',
      })
      const result = loadProjectContext(provider)
      expect(result.declared.rubyVersion).toBe('3.2.2')
    })

    it('extracts Rails version', () => {
      const provider = createMockProvider({
        'claude.md': '- Rails 7.1.3',
      })
      const result = loadProjectContext(provider)
      expect(result.declared.railsVersion).toBe('7.1.3')
    })

    it('extracts gem names', () => {
      const provider = createMockProvider({
        'claude.md': `## Gems
- devise for authentication
- pundit for authorization
- pagy for pagination`,
      })
      const result = loadProjectContext(provider)
      expect(result.declared.gems).toContain('devise')
      expect(result.declared.gems).toContain('pundit')
      expect(result.declared.gems).toContain('pagy')
    })

    it('extracts conventions', () => {
      const provider = createMockProvider({
        'claude.md': `## Conventions
- Always use service objects for business logic
- Never put business logic in controllers`,
      })
      const result = loadProjectContext(provider)
      expect(result.declared.conventions.length).toBeGreaterThanOrEqual(2)
      expect(
        result.declared.conventions.some((c) => c.includes('service objects')),
      ).toBe(true)
    })

    it('extracts testing context', () => {
      const provider = createMockProvider({
        'claude.md': `## Testing
- RSpec for all tests
- Factory Bot for test data
- Capybara for system tests`,
      })
      const result = loadProjectContext(provider)
      expect(result.declared.testing.length).toBeGreaterThanOrEqual(2)
    })

    it('extracts deployment context', () => {
      const provider = createMockProvider({
        'claude.md': `## Deployment
- Deploy with Kamal 2
- Docker containers
- GitHub Actions CI/CD`,
      })
      const result = loadProjectContext(provider)
      expect(result.declared.deployment.length).toBeGreaterThanOrEqual(2)
    })

    it('extracts pattern mentions', () => {
      const provider = createMockProvider({
        'claude.md': `## Patterns
- Use service object for complex operations
- Apply decorator pattern for view helpers`,
      })
      const result = loadProjectContext(provider)
      expect(result.declared.patterns.length).toBeGreaterThanOrEqual(1)
    })

    it('deduplicates stack items', () => {
      const provider = createMockProvider({
        'claude.md': `- Rails
- Also uses Rails`,
      })
      const result = loadProjectContext(provider)
      const railsCount = result.declared.stack.filter(
        (s) => s === 'rails',
      ).length
      expect(railsCount).toBe(1)
    })

    it('handles empty file gracefully', () => {
      const provider = createMockProvider({ 'claude.md': '' })
      const result = loadProjectContext(provider)
      expect(result.found).toBe(true)
      expect(result.declared.stack).toEqual([])
    })

    it('handles file with only headings', () => {
      const provider = createMockProvider({
        'claude.md': '# Title\n## Section\n### Subsection',
      })
      const result = loadProjectContext(provider)
      expect(result.found).toBe(true)
    })

    it('extracts from numbered lists', () => {
      const provider = createMockProvider({
        'claude.md': `## Stack
1. Rails 7.1
2. PostgreSQL
3. Redis`,
      })
      const result = loadProjectContext(provider)
      expect(result.declared.stack).toContain('rails')
      expect(result.declared.stack).toContain('redis')
    })
  })
})
