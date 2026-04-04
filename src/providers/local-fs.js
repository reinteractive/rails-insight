import {
  readFileSync,
  readdirSync,
  existsSync,
  statSync,
  realpathSync,
} from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { EXEC_MAX_BUFFER, EXEC_TIMEOUT_MS } from '../core/constants.js'

const execPromise = promisify(exec)

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'tmp',
  'log',
  '.bundle',
  'coverage',
  '.yarn',
])

const SKIP_PATHS = new Set([
  'public/assets',
  'public/packs',
  'vendor/bundle',
  'vendor/cache',
])

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
   * Resolve a relative path safely within the project root.
   * Returns null if the path would escape the project root (path traversal).
   * @param {string} relativePath
   * @returns {string|null} Absolute path or null if unsafe
   */
  _safePath(relativePath) {
    const full = resolve(join(this._root, relativePath))
    const root = resolve(this._root)
    if (full !== root && !full.startsWith(root + sep)) {
      return null
    }
    return full
  }

  /**
   * Read a file's contents as UTF-8.
   * @param {string} relativePath
   * @returns {string|null} File contents or null on error
   */
  readFile(relativePath) {
    try {
      const full = this._safePath(relativePath)
      if (!full) return null
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
      const full = this._safePath(relativePath)
      if (!full) return false
      return existsSync(full)
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
    const visited = new Set()
    this._globWalk('', parts, results, visited)
    return results.sort()
  }

  /**
   * List directory contents.
   * @param {string} relativePath
   * @returns {string[]} Sorted list of entry names
   */
  listDir(relativePath) {
    try {
      const full = this._safePath(relativePath)
      if (!full) return []
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
   * @param {Set<string>} visited - Visited real paths for circular symlink protection
   */
  _globWalk(currentRel, patternParts, results, visited) {
    if (patternParts.length === 0) return

    const currentAbs = join(this._root, currentRel)
    const segment = patternParts[0]
    const remaining = patternParts.slice(1)

    if (segment === '**') {
      // Match zero or more directories
      // Try matching remaining pattern at current level (zero dirs)
      this._globWalk(currentRel, remaining, results, visited)

      // Also recurse into all subdirectories with ** still active
      let entries
      try {
        entries = readdirSync(currentAbs, { withFileTypes: true })
      } catch {
        return
      }

      for (const entry of entries) {
        if (this._shouldSkip(currentRel, entry.name)) continue
        const isDir =
          entry.isDirectory() ||
          (entry.isSymbolicLink() &&
            this._isDirectoryLink(currentRel, entry.name))
        if (isDir) {
          const childRel = currentRel
            ? `${currentRel}/${entry.name}`
            : entry.name
          const childAbs = join(this._root, childRel)
          const childReal = this._realPath(childAbs)
          if (childReal && visited.has(childReal)) continue
          if (childReal) visited.add(childReal)
          this._globWalk(childRel, patternParts, results, visited)
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
        const isDir =
          entry.isDirectory() ||
          (entry.isSymbolicLink() &&
            this._isDirectoryLink(currentRel, entry.name))
        if (!isDir) continue
        if (this._shouldSkip(currentRel, entry.name)) continue
        if (this._matchSegment(entry.name, segment)) {
          const childRel = currentRel
            ? `${currentRel}/${entry.name}`
            : entry.name
          this._globWalk(childRel, remaining, results, visited)
        }
      }
    }
  }

  /**
   * Check if a symbolic link points to a directory.
   * @param {string} currentRel - Current relative directory
   * @param {string} entryName - Entry name
   * @returns {boolean}
   */
  _isDirectoryLink(currentRel, entryName) {
    try {
      const full = join(this._root, currentRel, entryName)
      const stat = statSync(full)
      return stat.isDirectory()
    } catch {
      return false
    }
  }

  /**
   * Resolve the real path for circular symlink detection.
   * @param {string} absPath
   * @returns {string|null}
   */
  _realPath(absPath) {
    try {
      return realpathSync(absPath)
    } catch {
      return null
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

  /**
   * Execute a shell command in the project root.
   * @param {string} command
   * @returns {Promise<{stdout: string, stderr: string, exitCode: number}>}
   */
  async execCommand(command) {
    try {
      const { stdout, stderr } = await execPromise(command, {
        cwd: this._root,
        maxBuffer: EXEC_MAX_BUFFER,
        timeout: EXEC_TIMEOUT_MS,
      })
      return { stdout: stdout || '', stderr: stderr || '', exitCode: 0 }
    } catch (err) {
      const isTimeout = err.killed && err.signal === 'SIGTERM'
      return {
        stdout: err.stdout || '',
        stderr: isTimeout
          ? `Command timed out after ${EXEC_TIMEOUT_MS}ms: ${command}`
          : err.stderr || '',
        exitCode: err.code || 1,
      }
    }
  }
}
