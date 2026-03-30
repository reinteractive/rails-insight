/**
 * Regex-based Ruby declaration extractor.
 * All functions accept string content (not file paths).
 */

/**
 * Extract class declaration from Ruby source.
 * @param {string} content - Ruby file content
 * @returns {{ name: string, superclass: string|null }|null}
 */
export function extractClassDeclaration(content) {
  const match = content.match(/class\s+(\w+(?:::\w+)*)\s*<\s*(\w+(?:::\w+)*)/)
  if (match) {
    return { name: match[1], superclass: match[2] }
  }
  // Class without superclass
  const basic = content.match(/class\s+(\w+(?:::\w+)*)\s*$/m)
  if (basic) {
    return { name: basic[1], superclass: null }
  }
  return null
}

/**
 * Extract module declaration from Ruby source.
 * @param {string} content
 * @returns {string|null} Module name
 */
export function extractModuleDeclaration(content) {
  const match = content.match(/module\s+(\w+(?:::\w+)*)/)
  return match ? match[1] : null
}

/**
 * Extract all method names from Ruby source.
 * @param {string} content
 * @returns {string[]}
 */
export function extractMethodNames(content) {
  const methods = []
  const regex = /^\s*def\s+(?:self\.)?(\w+[?!=]?)/gm
  let match
  while ((match = regex.exec(content)) !== null) {
    methods.push(match[1])
  }
  return methods
}

/**
 * Extract DSL calls (like has_many, validates, scope, etc).
 * @param {string} content
 * @param {RegExp} pattern - The DSL pattern to match
 * @returns {RegExpExecArray[]} All matches
 */
export function extractDSLCalls(content, pattern) {
  const results = []
  const regex = new RegExp(
    pattern.source,
    pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g',
  )
  let match
  while ((match = regex.exec(content)) !== null) {
    results.push(match)
  }
  return results
}

/**
 * Extract include and extend statements.
 * @param {string} content
 * @returns {{ includes: string[], extends: string[] }}
 */
export function extractIncludesExtends(content) {
  const includes = []
  const extends_ = []

  const includeRegex = /^\s*include\s+(\w+(?:::\w+)*)/gm
  let match
  while ((match = includeRegex.exec(content)) !== null) {
    includes.push(match[1])
  }

  const extendRegex = /^\s*extend\s+(\w+(?:::\w+)*)/gm
  while ((match = extendRegex.exec(content)) !== null) {
    extends_.push(match[1])
  }

  return { includes, extends: extends_ }
}

/**
 * Strip Ruby single-line comments from source content.
 * Preserves string literals containing # characters.
 * @param {string} content - Ruby file content
 * @returns {string} Content with comment lines removed
 */
export function stripRubyComments(content) {
  return content
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n')
}

/**
 * Extract the visibility sections (public/private/protected) from Ruby source.
 * Returns methods grouped by visibility.
 * @param {string} content
 * @returns {{ public: string[], private: string[], protected: string[] }}
 */
export function extractMethodsByVisibility(content) {
  const result = { public: [], private: [], protected: [] }
  let currentVisibility = 'public'
  const lines = content.split('\n')

  for (const line of lines) {
    const visMatch = line.match(/^\s*(private|protected)\s*$/)
    if (visMatch) {
      currentVisibility = visMatch[1]
      continue
    }
    const methodMatch = line.match(/^\s*def\s+(?:self\.)?(\w+[?!=]?)/)
    if (methodMatch) {
      result[currentVisibility].push(methodMatch[1])
    }
  }

  return result
}
