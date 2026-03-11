import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const SKIP_DIRS = new Set([
  'node_modules',
  'vendor',
  '.git',
  'tmp',
  'log',
  '.bundle',
  'coverage',
  '.yarn',
])

const SKIP_PATHS = new Set(['public/assets', 'public/packs'])

/**
 * LocalFSProvider implements the FileProvider interface using Node.js fs.
 * All paths are relative to projectRoot.
 */
export class LocalFSProvider {
  /** @param {string} projectRoot - Absolute path to the Rails project root */
  constructor(projectRoot) {
    this._root = projectRoot
  }

  /** @returns {string} */
  getProjectRoot() {
    return this._root
  }

  /**
   * Read a file's contents as UTF-8.
   * @param {string} relativePath
   * @returns {string|null} File contents or null on error
   */
  readFile(relativePath) {
    try {
      const full = join(this._root, relativePath)
      return readFileSync(full, 'utf-8')
    } catch {
      return null
    }
  }

  /**
   * Read a file as an array of lines.
   * @param {string} relativePath
   * @returns {string[]}
   */
  readLines(relativePath) {
    const content = this.readFile(relativePath)
    if (content === null) return []
    return content.split('\n')
  }

  /**
   * Check if a file exists.
   * @param {string} relativePath
   * @returns {boolean}
   */
  fileExists(relativePath) {
    try {
      return existsSync(join(this._root, relativePath))
    } catch {
      return false
    }
  }

  /**
   * Recursive glob matching. Supports ** wildcards and * single-level wildcards.
   * @param {string} pattern - e.g. 'app/models/**\/*.rb'
   * @returns {string[]} Matching relative paths, sorted
   */
  glob(pattern) {
    const results = []
    const parts = pattern.split('/')
    this._globWalk('', parts, results)
    return results.sort()
  }

  /**
   * List directory contents.
   * @param {string} relativePath
   * @returns {string[]} Sorted list of entry names
   */
  listDir(relativePath) {
    try {
      const full = join(this._root, relativePath)
      return readdirSync(full).sort()
    } catch {
      return []
    }
  }

  /**
   * Internal recursive glob walker.
   * @param {string} currentRel - Current relative directory
   * @param {string[]} patternParts - Remaining pattern segments
   * @param {string[]} results - Accumulator
   */
  _globWalk(currentRel, patternParts, results) {
    if (patternParts.length === 0) return

    const currentAbs = join(this._root, currentRel)
    const segment = patternParts[0]
    const remaining = patternParts.slice(1)

    if (segment === '**') {
      // Match zero or more directories
      // Try matching remaining pattern at current level (zero dirs)
      this._globWalk(currentRel, remaining, results)

      // Also recurse into all subdirectories with ** still active
      let entries
      try {
        entries = readdirSync(currentAbs, { withFileTypes: true })
      } catch {
        return
      }

      for (const entry of entries) {
        if (this._shouldSkip(currentRel, entry.name)) continue
        if (entry.isDirectory()) {
          const childRel = currentRel
            ? `${currentRel}/${entry.name}`
            : entry.name
          this._globWalk(childRel, patternParts, results)
        }
      }
    } else if (remaining.length === 0) {
      // This is the final segment — match files/dirs
      let entries
      try {
        entries = readdirSync(currentAbs, { withFileTypes: true })
      } catch {
        return
      }

      for (const entry of entries) {
        if (this._matchSegment(entry.name, segment)) {
          const matchRel = currentRel
            ? `${currentRel}/${entry.name}`
            : entry.name
          results.push(matchRel)
        }
      }
    } else {
      // Intermediate segment — match directories only
      let entries
      try {
        entries = readdirSync(currentAbs, { withFileTypes: true })
      } catch {
        return
      }

      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        if (this._shouldSkip(currentRel, entry.name)) continue
        if (this._matchSegment(entry.name, segment)) {
          const childRel = currentRel
            ? `${currentRel}/${entry.name}`
            : entry.name
          this._globWalk(childRel, remaining, results)
        }
      }
    }
  }

  /**
   * Match a filename against a simple glob segment (supports * and ?).
   * @param {string} name
   * @param {string} pattern
   * @returns {boolean}
   */
  _matchSegment(name, pattern) {
    // Convert glob pattern to regex
    let regex = '^'
    for (let i = 0; i < pattern.length; i++) {
      const ch = pattern[i]
      if (ch === '*') {
        regex += '[^/]*'
      } else if (ch === '?') {
        regex += '[^/]'
      } else if (ch === '.') {
        regex += '\\.'
      } else if (ch === '{') {
        // Handle brace expansion: {a,b,c}
        const closeIdx = pattern.indexOf('}', i)
        if (closeIdx !== -1) {
          const alternatives = pattern.substring(i + 1, closeIdx).split(',')
          regex +=
            '(?:' +
            alternatives.map((a) => a.replace(/\./g, '\\.')).join('|') +
            ')'
          i = closeIdx
        } else {
          regex += '\\{'
        }
      } else {
        regex += ch.replace(/[[\]()\\+^$|]/g, '\\$&')
      }
    }
    regex += '$'
    return new RegExp(regex).test(name)
  }

  /**
   * Check if a directory entry should be skipped during glob traversal.
   * @param {string} currentRel
   * @param {string} entryName
   * @returns {boolean}
   */
  _shouldSkip(currentRel, entryName) {
    if (SKIP_DIRS.has(entryName)) return true
    const entryRel = currentRel ? `${currentRel}/${entryName}` : entryName
    if (SKIP_PATHS.has(entryRel)) return true
    return false
  }
}
