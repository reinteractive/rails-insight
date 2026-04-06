/**
 * Controller Extractor (#2)
 * Extracts all controller patterns from Ruby controller files.
 */

import { CONTROLLER_PATTERNS } from '../core/patterns.js'

/**
 * Extract all controller information from a single controller file.
 * @param {import('../providers/interface.js').FileProvider} provider
 * @param {string} filePath
 * @returns {object|null}
 */
export function extractController(provider, filePath) {
  const content = provider.readFile(filePath)
  if (!content) return null

  // Class declaration
  const classMatch = content.match(CONTROLLER_PATTERNS.classDeclaration)
  let className = classMatch ? classMatch[1] : null
  const superclass = classMatch ? classMatch[2] : null

  // If class name doesn't contain ::, check for wrapping module declarations
  if (className && !className.includes('::') && classMatch) {
    const preClassContent = content.slice(0, classMatch.index)
    const preLines = preClassContent.split('\n')
    let moduleDepth = 0
    const activeModules = []
    for (const line of preLines) {
      const modMatch = line.match(/^\s*module\s+(\w+(?:::\w+)*)/)
      if (modMatch) {
        moduleDepth++
        activeModules.push(modMatch[1])
      }
      if (/^\s*end\b/.test(line) && moduleDepth > 0) {
        moduleDepth--
        activeModules.pop()
      }
    }
    if (activeModules.length > 0) {
      className = activeModules.join('::') + '::' + className
    }
  }

  // Derive namespace from class name
  let namespace = null
  if (className && className.includes('::')) {
    const parts = className.split('::')
    parts.pop() // Remove controller name
    namespace = parts.join('/').toLowerCase().replace(/::/g, '/')
  }

  // Concerns
  const concerns = []
  const includeRe = new RegExp(CONTROLLER_PATTERNS.include.source, 'gm')
  let m
  while ((m = includeRe.exec(content))) {
    const mod = m[1]
    if (mod !== 'ActionController::Live') {
      concerns.push(mod)
    }
  }

  // Filters — tag authorization guards
  // Pre-process: join lines where [ is opened but not closed (multi-line options)
  const lines = content.split('\n')
  const joinedLines = []
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]
    while (
      (line.match(/\[/g) || []).length > (line.match(/\]/g) || []).length &&
      i + 1 < lines.length
    ) {
      i++
      line = line.trimEnd() + ' ' + lines[i].trim()
    }
    joinedLines.push(line)
  }
  // Strip inline Ruby comments before matching filters (prevents inline comments
  // like `before_action :auth # sets up auth` from breaking the regex end-anchor)
  const filterContent = joinedLines
    .map((l) => l.replace(/#[^{].*$/, '').trimEnd())
    .join('\n')

  const rawFilters = []
  const filterRe = new RegExp(CONTROLLER_PATTERNS.filterType.source, 'gm')
  while ((m = filterRe.exec(filterContent))) {
    const filterMethod = m[2]
    const isAuthzGuard = /^require_\w+!$/.test(filterMethod)
    rawFilters.push({
      type: m[1],
      method: filterMethod,
      ...(isAuthzGuard ? { authorization_guard: true } : {}),
      options: m[3] || null,
    })
  }

  // Expand multi-method filters: `before_action :a, :b, :c` → separate entries
  const filters = []
  for (const filter of rawFilters) {
    const opts = filter.options
    if (!opts) {
      filters.push(filter)
      continue
    }

    // Top-level comma split (ignores commas inside brackets)
    const parts = []
    let depth = 0
    let current = ''
    for (const ch of opts) {
      if (ch === '[' || ch === '(' || ch === '{') depth++
      else if (ch === ']' || ch === ')' || ch === '}') depth--
      if (ch === ',' && depth === 0) {
        parts.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
    if (current.trim()) parts.push(current.trim())

    const additionalMethods = []
    const realOptions = []

    for (const part of parts) {
      if (/^:(\w+!?)$/.test(part)) {
        // Bare symbol — another method, not a keyword option
        additionalMethods.push(part.replace(/^:/, ''))
      } else {
        // Keyword option like `only: [:show]`, `if: :condition`
        realOptions.push(part)
      }
    }

    filters.push({
      ...filter,
      options: realOptions.length > 0 ? realOptions.join(', ') : null,
    })

    for (const method of additionalMethods) {
      const isAuthz = /^require_\w+!$/.test(method)
      filters.push({
        type: filter.type,
        method,
        ...(isAuthz ? { authorization_guard: true } : {}),
        options: realOptions.length > 0 ? realOptions.join(', ') : null,
      })
    }
  }

  // Actions (public methods before private/protected) with line ranges
  const actions = []
  const action_line_ranges = {}
  const contentLines = content.split('\n')
  let inPublic = true
  let currentActionName = null
  let currentActionStart = null
  let methodDepth = 0
  const visRe = /^\s*(private|protected)\s*$/
  const methodRe = /^\s*def\s+(\w+)/
  for (let i = 0; i < contentLines.length; i++) {
    const line = contentLines[i]
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
      methodDepth = 0
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
        methodDepth = 1
      } else {
        currentActionName = null
      }
      continue
    }

    if (currentActionName && inPublic) {
      if (
        /\bdo\b|\bif\b(?!.*\bthen\b.*\bend\b)|\bcase\b|\bbegin\b/.test(line) &&
        !/\bend\b/.test(line)
      ) {
        methodDepth++
      }
      if (/^\s*end\b/.test(line)) {
        methodDepth--
        if (methodDepth <= 0) {
          action_line_ranges[currentActionName] = {
            start: currentActionStart,
            end: lineNumber,
          }
          currentActionName = null
          methodDepth = 0
        }
      }
    }
  }

  // Close final action
  if (currentActionName && inPublic) {
    action_line_ranges[currentActionName] = {
      start: currentActionStart,
      end: contentLines.length,
    }
  }

  // Strong params
  let strong_params = null
  const spMatch = content.match(CONTROLLER_PATTERNS.paramsRequire)
  if (spMatch) {
    const methodMatch = content.match(CONTROLLER_PATTERNS.strongParamsMethod)
    strong_params = {
      method: methodMatch ? methodMatch[1] : null,
      model: spMatch[1],
      permitted: spMatch[2].split(',').map((p) => p.trim()),
    }
  }

  // Rescue handlers
  const rescue_handlers = []
  const rescueRe = new RegExp(CONTROLLER_PATTERNS.rescueFrom.source, 'gm')
  while ((m = rescueRe.exec(content))) {
    rescue_handlers.push({
      exception: m[1],
      handler: m[2] || null,
    })
  }

  // Layout
  const layoutMatch = content.match(CONTROLLER_PATTERNS.layout)
  const layout = layoutMatch ? layoutMatch[1] : null

  // API controller detection
  const api_controller =
    CONTROLLER_PATTERNS.skipForgeryProtection.test(content) ||
    /protect_from_forgery\s+with:\s*:null_session/.test(content) ||
    (superclass && /Api|API/.test(superclass)) ||
    (className && /Api::/.test(className))

  // Streaming
  const streaming = CONTROLLER_PATTERNS.actionControllerLive.test(content)

  // Rails 8: rate_limit declarations
  const rate_limits = []
  const rateLimitRe =
    /rate_limit\s+to:\s*(\d+),\s*within:\s*([^,\n]+?)(?:,\s*only:\s*(?:%i\[([^\]]+)\]|:(\w+)|\[([^\]]+)\]))?$/gm
  let rl
  while ((rl = rateLimitRe.exec(content))) {
    rate_limits.push({
      to: parseInt(rl[1], 10),
      within: rl[2].trim(),
      only: rl[3] || rl[4] || rl[5] || null,
    })
  }

  // Rails 8: allow_unauthenticated_access
  const unauthedMatch = content.match(
    /allow_unauthenticated_access(?:\s+only:\s*(?:%i\[([^\]]+)\]|:(\w+)|\[([^\]]+)\]))?/,
  )
  const allow_unauthenticated_access = unauthedMatch
    ? {
        only: (unauthedMatch[1] || unauthedMatch[2] || unauthedMatch[3] || '')
          .replace(/[:%\s]/g, ' ')
          .trim()
          .split(/\s+/)
          .filter(Boolean),
      }
    : null

  // Action key logic summaries — connected flow chain per action
  const action_summaries = {}
  for (const action of actions) {
    const actionLines = content.split('\n')
    let inAction = false
    let depth = 0
    const keyCalls = []
    for (const line of actionLines) {
      if (new RegExp(`^\\s*def\\s+${action}\\b`).test(line)) {
        inAction = true
        depth = 0
        continue
      }
      if (!inAction) continue
      if (/^\s*def\s+\w+/.test(line) && depth === 0) break
      if (/\bdo\b|\bif\b|\bcase\b|\bbegin\b|\bblock\b/.test(line)) depth++
      if (/^\s*end\b/.test(line)) {
        if (depth === 0) break
        depth--
      }
      const trimmed = line.trim()
      // Capture all significant model calls, session helpers, and outcome calls
      if (
        /^(redirect_to|render\s|head\s|respond_to|@\w+\s*=\s*\w+[\.\w]+|User\.[a-z]|Session\.[a-z]|\w+\.(authenticate|find|create)|start_new_session|terminate_session|format\.)/.test(
          trimmed,
        )
      ) {
        // Collapse complex expressions to a short label
        const label = trimmed
          .replace(/\s+/g, ' ')
          .replace(
            /(redirect_to\s+)(root_path|after_authentication_url|new_session_path)\b.*/,
            '$1$2',
          )
          .slice(0, 80)
        keyCalls.push(label)
        if (keyCalls.length >= 4) break
      }
    }
    if (keyCalls.length > 0) action_summaries[action] = keyCalls.join(' → ')
  }

  return {
    class: className,
    file: filePath,
    superclass,
    namespace,
    concerns,
    filters,
    actions,
    action_line_ranges,
    action_summaries:
      Object.keys(action_summaries).length > 0 ? action_summaries : null,
    strong_params,
    rescue_handlers,
    layout,
    api_controller: !!api_controller,
    streaming,
    rate_limits: rate_limits.length > 0 ? rate_limits : null,
    allow_unauthenticated_access,
  }
}

/**
 * Extract all controllers from a manifest.
 * @param {import('../providers/interface.js').FileProvider} provider
 * @param {Array<{path: string}>} controllerEntries
 * @returns {Array<object>}
 */
export function extractControllers(provider, controllerEntries) {
  const results = []
  for (const entry of controllerEntries) {
    const ctrl = extractController(provider, entry.path)
    if (ctrl) results.push(ctrl)
  }
  return results
}
