/**
 * MockFileProvider for tests — reads from a fixture directory on disk.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { globSync } from 'node:fs'

/**
 * Create a FileProvider backed by a fixture directory.
 * @param {string} fixtureDir - Absolute path to fixture directory
 * @returns {import('../../src/providers/interface.js').FileProvider}
 */
export function createFixtureProvider(fixtureDir) {
  return {
    readFile(path) {
      const fullPath = join(fixtureDir, path)
      if (!existsSync(fullPath)) return null
      try {
        return readFileSync(fullPath, 'utf-8')
      } catch {
        return null
      }
    },

    readLines(path, startLine, endLine) {
      const content = this.readFile(path)
      if (!content) return null
      const lines = content.split('\n')
      return lines.slice(startLine - 1, endLine).join('\n')
    },

    fileExists(path) {
      return existsSync(join(fixtureDir, path))
    },

    glob(pattern) {
      return walkAndMatch(fixtureDir, pattern)
    },

    listDir(path) {
      const fullPath = join(fixtureDir, path)
      if (!existsSync(fullPath)) return []
      try {
        const entries = readdirSync(fullPath)
        return entries.map((e) => {
          const stat = statSync(join(fullPath, e))
          return stat.isDirectory() ? e + '/' : e
        })
      } catch {
        return []
      }
    },
  }
}

/**
 * Walk dir and match files against glob pattern.
 */
function walkAndMatch(root, pattern) {
  const results = []
  walkDir(root, root, pattern, results)
  return results
}

function walkDir(base, dir, pattern, results) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry)
    const relPath = relative(base, fullPath)
    let stat
    try {
      stat = statSync(fullPath)
    } catch {
      continue
    }
    if (stat.isDirectory()) {
      walkDir(base, fullPath, pattern, results)
    } else {
      if (matchGlob(pattern, relPath)) {
        results.push(relPath)
      }
    }
  }
}

function matchGlob(pattern, path) {
  if (pattern.includes('**')) {
    const parts = pattern.split('**')
    const prefix = parts[0].replace(/\/$/, '')
    const suffix = (parts[1] || '').replace(/^\//, '')
    if (prefix && !path.startsWith(prefix)) return false
    if (suffix) {
      const ext = suffix.replace('*', '')
      return path.endsWith(ext)
    }
    return true
  }
  const regex = pattern.replace(/\./g, '\\.').replace(/\*/g, '[^/]*')
  return new RegExp(`^${regex}$`).test(path)
}

/**
 * Create a mock provider from an in-memory file map.
 * @param {Object<string, string>} files - Map of path → content
 * @returns {import('../../src/providers/interface.js').FileProvider}
 */
export function createMemoryProvider(files) {
  return {
    readFile(path) {
      return files[path] || null
    },
    readLines(path, startLine, endLine) {
      const content = this.readFile(path)
      if (!content) return null
      return content
        .split('\n')
        .slice(startLine - 1, endLine)
        .join('\n')
    },
    fileExists(path) {
      return path in files
    },
    glob(pattern) {
      return Object.keys(files).filter((p) => matchGlob(pattern, p))
    },
    listDir(path) {
      const prefix = path.endsWith('/') ? path : path + '/'
      const items = new Set()
      for (const p of Object.keys(files)) {
        if (p.startsWith(prefix)) {
          const rest = p.slice(prefix.length)
          const parts = rest.split('/')
          items.add(parts[0] + (parts.length > 1 ? '/' : ''))
        }
      }
      return [...items]
    },
  }
}
