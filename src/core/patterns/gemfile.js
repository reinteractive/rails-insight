/**
 * Regex patterns for Gemfile extraction.
 */
export const GEMFILE_PATTERNS = {
  gem: /^\s*gem\s+['"]([^'"]+)['"](?:,\s*['"]([^'"]+)['"])?(?:,\s*(.+))?$/m,
  group: /^\s*group\s+(.+)\s+do/m,
  source: /^\s*source\s+['"]([^'"]+)['"]/m,
  ruby: /^\s*ruby\s+['"]([^'"]+)['"]/m,
}
