/**
 * Model Extractor (#1)
 * Extracts all ActiveRecord model patterns from Ruby model files.
 */

import { MODEL_PATTERNS } from '../core/patterns.js'
import { resolveFullyQualifiedName } from '../utils/ruby-class-resolver.js'

/**
 * Join lines where a declaration continues on the next line (ends with comma).
 * This handles multi-line belongs_to, has_many, etc. options.
 * @param {string} content
 * @returns {string}
 */
const STATEMENT_START =
  /^(?:belongs_to|has_many|has_one|has_and_belongs_to_many|has_and_belongs|scope\s|validates?\s|def\s|class\s|module\s|end\b|include\s|extend\s|enum\s|before_|after_|around_|delegate\s|attr_|#|private\b|protected\b|accepts_nested)/

function joinContinuationLines(content) {
  const lines = content.split('\n')
  const joined = []
  for (let i = 0; i < lines.length; i++) {
    if (
      joined.length > 0 &&
      joined[joined.length - 1].trimEnd().endsWith(',')
    ) {
      const nextTrimmed = lines[i].trim()
      if (nextTrimmed && !STATEMENT_START.test(nextTrimmed)) {
        joined[joined.length - 1] =
          joined[joined.length - 1].trimEnd() + ' ' + nextTrimmed
        continue
      }
    }
    joined.push(lines[i])
  }
  return joined.join('\n')
}

/**
 * Extract scope body using brace-balanced scanning (handles nested braces and
 * multi-line lambda/proc bodies).
 * @param {string} content
 * @returns {Record<string, string>} map of scope name → body string
 */
function extractScopeBodies(content) {
  const result = {}
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const declMatch = lines[i].match(/^\s*scope\s+:(\w+),\s*(?:->|lambda|proc)/)
    if (!declMatch) continue
    const name = declMatch[1]
    // Scan forward to find brace-balanced body
    let depth = 0
    let started = false
    const bodyChars = []
    outer: for (let j = i; j < lines.length; j++) {
      const line = j === i ? lines[j] : lines[j]
      for (const ch of line) {
        if (ch === '{') {
          depth++
          if (depth === 1) {
            started = true
            continue // skip the opening brace itself
          }
        }
        if (ch === '}') {
          depth--
          if (depth === 0 && started) break outer
        }
        if (started) bodyChars.push(ch)
      }
      if (started && depth > 0) bodyChars.push(' ')
    }
    if (bodyChars.length > 0) {
      result[name] = bodyChars.join('').replace(/\s+/g, ' ').trim()
    }
  }
  return result
}

/**
 * Extract all model information from a single model file.
 * @param {import('../providers/interface.js').FileProvider} provider
 * @param {string} filePath
 * @param {string} [className]
 * @returns {object|null}
 */
export function extractModel(provider, filePath, className) {
  const content = provider.readFile(filePath)
  if (!content) return null

  const isConcern =
    /module\s+\w+/.test(content) &&
    /extend\s+ActiveSupport::Concern/.test(content)

  // Class/module declaration
  let detectedClass = className || null
  let superclass = null
  let detectedNamespace = null
  const classMatch = content.match(MODEL_PATTERNS.classDeclaration)
  if (classMatch) {
    const { fqn, namespace } = resolveFullyQualifiedName(
      content,
      classMatch[1],
      classMatch.index,
    )
    detectedClass = fqn
    detectedNamespace = namespace
    superclass = classMatch[2]
  } else if (isConcern) {
    const moduleMatch = content.match(/module\s+(\w+(?:::\w+)*)/)
    if (moduleMatch) detectedClass = moduleMatch[1]
  }

  // Concerns (include/extend)
  const concerns = []
  const extends_ = []
  const includeRe = new RegExp(MODEL_PATTERNS.include.source, 'gm')
  const extendRe = new RegExp(MODEL_PATTERNS.extend.source, 'gm')
  let m
  while ((m = includeRe.exec(content))) {
    const mod = m[1]
    if (
      mod !== 'ActiveSupport::Concern' &&
      mod !== 'Discard::Model' &&
      mod !== 'AASM' &&
      mod !== 'PgSearch::Model'
    ) {
      concerns.push(mod)
    }
  }
  while ((m = extendRe.exec(content))) {
    const mod = m[1]
    if (mod !== 'ActiveSupport::Concern') {
      extends_.push(mod)
    }
  }

  // Associations (join continuation lines first so multi-line options are captured)
  const associations = []
  const assocContent = joinContinuationLines(content)
  const assocTypes = [
    { key: 'belongsTo', type: 'belongs_to' },
    { key: 'hasMany', type: 'has_many' },
    { key: 'hasOne', type: 'has_one' },
    { key: 'habtm', type: 'has_and_belongs_to_many' },
  ]
  for (const { key, type } of assocTypes) {
    const re = new RegExp(MODEL_PATTERNS[key].source, 'gm')
    while ((m = re.exec(assocContent))) {
      const entry = { type, name: m[1], options: m[2] || null }
      // Check for through
      if (entry.options) {
        const throughMatch = entry.options.match(MODEL_PATTERNS.through)
        if (throughMatch) entry.through = throughMatch[1]
        // Check for counter_cache
        const ccMatch = entry.options.match(MODEL_PATTERNS.counterCache)
        if (ccMatch) entry.counter_cache = true
        // Check for polymorphic
        if (MODEL_PATTERNS.polymorphic.test(entry.options))
          entry.polymorphic = true
        // Check for strict_loading
        if (MODEL_PATTERNS.strictLoadingAssoc.test(entry.options))
          entry.strict_loading = true
      }
      associations.push(entry)
    }
  }

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

  // Validations
  const validations = []
  const custom_validators = []
  const validatesRe = new RegExp(MODEL_PATTERNS.validates.source, 'gm')
  while ((m = validatesRe.exec(content))) {
    const attrs = m[1].split(/,\s*:?/).map((a) => a.trim().replace(/^:/, ''))
    validations.push({ attributes: attrs, rules: m[2] || '' })
  }
  const validateRe = new RegExp(MODEL_PATTERNS.validate.source, 'gm')
  while ((m = validateRe.exec(content))) {
    custom_validators.push(m[1])
  }
  const vwRe = new RegExp(MODEL_PATTERNS.validatesWithValidator.source, 'gm')
  while ((m = vwRe.exec(content))) {
    custom_validators.push(`validates_with:${m[1]}`)
  }
  // Old-style validators: validates_presence_of :name, :body, { message: "required" }
  const oldStyleRe = /^\s*validates_(\w+?)(?:_of)?\s+(.+)$/gm
  while ((m = oldStyleRe.exec(content))) {
    const validationType = m[1]
    const argString = m[2].trim()
    const tokens = argString.split(',').map((t) => t.trim())
    const attrs = []
    const ruleParts = []
    for (const token of tokens) {
      if (/^:\w+$/.test(token)) {
        attrs.push(token.replace(/^:/, ''))
      } else if (/^\w+:/.test(token) || /^\{/.test(token)) {
        ruleParts.push(token)
      } else {
        ruleParts.push(token)
      }
    }
    if (attrs.length > 0) {
      validations.push({
        attributes: attrs,
        rules: `${validationType}: true${ruleParts.length > 0 ? ', ' + ruleParts.join(', ') : ''}`,
      })
    }
  }

  // Scopes — names array (backward-compat) + scope_queries dict with bodies
  const scopes = []
  const scope_queries = {}
  const scopeNamesFound = new Set()
  // Use brace-balanced extractor for scope bodies (handles multi-line and nested braces)
  const extractedBodies = extractScopeBodies(content)
  for (const [name, body] of Object.entries(extractedBodies)) {
    scopes.push(name)
    scope_queries[name] = body
    scopeNamesFound.add(name)
  }
  // Fall back to name-only for scopes we couldn't extract a body from
  const scopeSimpleRe = new RegExp(MODEL_PATTERNS.scope.source, 'gm')
  while ((m = scopeSimpleRe.exec(content))) {
    if (!scopeNamesFound.has(m[1])) scopes.push(m[1])
  }

  // Enums — values is always array of key names; value_map has int mapping
  const enums = {}
  // Modern hash syntax: enum :status, { key: 0, ... } (Rails 7+)
  const enumModernHashRe = /^\s*enum\s+:(\w+),\s*\{([^}]+)\}/gm
  while ((m = enumModernHashRe.exec(content))) {
    const name = m[1]
    const valStr = m[2]
    const value_map = {}
    const keys = []
    const pairRe = /(\w+):\s*(\d+)/g
    let pm
    while ((pm = pairRe.exec(valStr))) {
      value_map[pm[1]] = parseInt(pm[2], 10)
      keys.push(pm[1])
    }
    if (keys.length > 0) {
      enums[name] = { values: keys, value_map, syntax: 'hash' }
    } else {
      const symKeys =
        valStr.match(/\w+/g)?.filter((v) => !/^\d+$/.test(v)) || []
      enums[name] = { values: symKeys, syntax: 'hash' }
    }
    // Check for validate: true after the closing brace
    const afterEnum = content.slice(
      m.index + m[0].length,
      m.index + m[0].length + 50,
    )
    if (/validate:\s*true/.test(m[0] + afterEnum)) {
      enums[name].validate = true
    }
  }
  // Legacy hash syntax: enum status: { draft: 0, ... } (Rails 4-6)
  const enumLegacyHashRe = /^\s*enum\s+(\w+):\s*\{([^}]+)\}/gm
  while ((m = enumLegacyHashRe.exec(content))) {
    const name = m[1]
    if (enums[name]) continue
    const valStr = m[2]
    const value_map = {}
    const keys = []
    const pairRe = /(\w+):\s*(\d+)/g
    let pm
    while ((pm = pairRe.exec(valStr))) {
      value_map[pm[1]] = parseInt(pm[2], 10)
      keys.push(pm[1])
    }
    if (keys.length > 0) {
      enums[name] = { values: keys, value_map, syntax: 'legacy' }
    } else {
      const symKeys =
        valStr.match(/\w+/g)?.filter((v) => !/^\d+$/.test(v)) || []
      enums[name] = { values: symKeys, syntax: 'legacy' }
    }
    // Check for validate: true after the closing brace
    const afterEnum = content.slice(
      m.index + m[0].length,
      m.index + m[0].length + 50,
    )
    if (/validate:\s*true/.test(m[0] + afterEnum)) {
      enums[name].validate = true
    }
  }
  // Array syntax: enum :role, [ :a, :b ] — only add if not already captured
  const enumArrayPatterns = [
    { re: MODEL_PATTERNS.enumPositionalArray, syntax: 'positional_array' },
    { re: MODEL_PATTERNS.enumLegacyArray, syntax: 'legacy_array' },
  ]
  for (const { re, syntax } of enumArrayPatterns) {
    const gre = new RegExp(re.source, 'gm')
    while ((m = gre.exec(content))) {
      const name = m[1]
      if (enums[name]) continue // already captured from hash syntax
      const values = (m[2].match(/\w+/g) || []).filter((v) => !/^\d+$/.test(v))
      enums[name] = { values, syntax }
    }
  }

  // Enumerize gem: enumerize :field, in: [:val1, :val2, ...]
  const enumerizeRe = /^\s*enumerize\s+:(\w+),\s*in:\s*(?:\[([^\]]+)\]|%w\[([^\]]+)\])/gm
  while ((m = enumerizeRe.exec(content))) {
    const name = m[1]
    if (enums[name]) continue // native enum takes priority
    const rawValues = m[2] || m[3] || ''
    const values = rawValues
      .split(/[,\s]+/)
      .map((v) => v.trim().replace(/^:/, '').replace(/['"]/g, ''))
      .filter((v) => v.length > 0)
    enums[name] = { values, syntax: 'enumerize' }
  }

  // Callbacks — strip inline comments before matching; skip block-only callbacks
  const cbLines = content
    .split('\n')
    .map((l) => l.replace(/#[^{].*$/, '').trimEnd())
    .join('\n')
  const rawCallbacks = []
  const cbRe = new RegExp(MODEL_PATTERNS.callbackType.source, 'gm')
  while ((m = cbRe.exec(cbLines))) {
    const method = m[2]
    if (method === 'do' || method === '{') continue
    rawCallbacks.push({ type: m[1], method, options: m[3] || null })
  }

  // Block callbacks: before_save { ... } or before_save do ... end
  const blockCbRe =
    /^\s*((?:before|after|around)_(?:save_commit|create_commit|update_commit|destroy_commit|save|create|update|destroy|validation|commit|rollback|initialize|find|touch))\s+(?:do|\{)/gm
  while ((m = blockCbRe.exec(cbLines))) {
    rawCallbacks.push({ type: m[1], method: '[block]', options: null })
  }

  // Expand callbacks with multiple method symbols: after_save_commit :a, :b → 2 entries
  const callbacks = []
  for (const cb of rawCallbacks) {
    if (!cb.options) {
      callbacks.push(cb)
      continue
    }

    const parts = cb.options.split(',').map((p) => p.trim())
    const additionalMethods = []
    const realOptions = []

    for (const part of parts) {
      if (/^:(\w+[!?]?)$/.test(part)) {
        additionalMethods.push(part.replace(/^:/, ''))
      } else {
        realOptions.push(part)
      }
    }

    callbacks.push({
      ...cb,
      options: realOptions.length > 0 ? realOptions.join(', ') : null,
    })

    for (const method of additionalMethods) {
      callbacks.push({
        type: cb.type,
        method,
        options: realOptions.length > 0 ? realOptions.join(', ') : null,
      })
    }
  }

  // Delegations
  const delegations = []
  const delRe = new RegExp(MODEL_PATTERNS.delegate.source, 'gm')
  while ((m = delRe.exec(content))) {
    delegations.push({ methods: m[1].trim(), to: m[2] })
  }

  // Encrypts
  const encrypts = []
  const encRe = new RegExp(MODEL_PATTERNS.encrypts.source, 'gm')
  while ((m = encRe.exec(content))) {
    const attrs = m[1].match(/:(\w+)/g)
    if (attrs) encrypts.push(...attrs.map((a) => a.slice(1)))
  }

  // Normalizes
  const normalizes = []
  const normRe = new RegExp(MODEL_PATTERNS.normalizes.source, 'gm')
  while ((m = normRe.exec(content))) {
    const fullDecl = m[1]
    const attrs = fullDecl.match(/:(\w+)/g)?.map((a) => a.slice(1)) || []
    const withMatch = fullDecl.match(
      /with:\s*->\s*(?:\([^)]*\)\s*)?\{([^}]+)\}/,
    )
    const normExpression = withMatch ? withMatch[1].trim() : null
    for (const attr of attrs) {
      normalizes.push({ attribute: attr, expression: normExpression })
    }
  }

  // Token generators
  const token_generators = []
  const tokenRe = new RegExp(MODEL_PATTERNS.generatesTokenFor.source, 'gm')
  while ((m = tokenRe.exec(content))) {
    token_generators.push(m[1])
  }

  // Secure password
  const has_secure_password = MODEL_PATTERNS.hasSecurePassword.test(content)

  // Attachments
  const attachments = []
  const attachPatterns = [
    { re: MODEL_PATTERNS.hasOneAttached, type: 'has_one_attached' },
    { re: MODEL_PATTERNS.hasManyAttached, type: 'has_many_attached' },
  ]
  for (const { re, type } of attachPatterns) {
    const gre = new RegExp(re.source, 'gm')
    while ((m = gre.exec(content))) {
      attachments.push({ type, name: m[1] })
    }
  }

  // Rich text
  const rich_text = []
  const rtRe = new RegExp(MODEL_PATTERNS.hasRichText.source, 'gm')
  while ((m = rtRe.exec(content))) {
    rich_text.push(m[1])
  }

  // Store accessors
  const store_accessors = {}
  const storeRe = new RegExp(MODEL_PATTERNS.store.source, 'gm')
  while ((m = storeRe.exec(content))) {
    store_accessors[m[1]] = m[2].match(/:(\w+)/g)?.map((a) => a.slice(1)) || []
  }
  const saRe = new RegExp(MODEL_PATTERNS.storeAccessor.source, 'gm')
  while ((m = saRe.exec(content))) {
    const storeName = m[1]
    const accessors = m[2].match(/:(\w+)/g)?.map((a) => a.slice(1)) || []
    store_accessors[storeName] = [
      ...(store_accessors[storeName] || []),
      ...accessors,
    ]
  }

  // Table name override
  const tableMatch = content.match(MODEL_PATTERNS.tableName)
  const table_name = tableMatch ? tableMatch[1] : null

  // Abstract class
  const abstract = MODEL_PATTERNS.abstractClass.test(content)

  // Default scope
  const default_scope = MODEL_PATTERNS.defaultScope.test(content)

  // Broadcasts
  const broadcasts =
    MODEL_PATTERNS.broadcastsTo.test(content) ||
    MODEL_PATTERNS.broadcasts.test(content)

  // Strict loading
  const strict_loading = MODEL_PATTERNS.strictLoading.test(content)

  // Turbo 8 morphing
  const turboRefreshesMatch = content.match(MODEL_PATTERNS.turboRefreshes)
  const turbo_refreshes_with = turboRefreshesMatch
    ? turboRefreshesMatch[1]
    : null

  // Devise modules — use matchAll to handle multiple devise() calls
  let devise_modules = []
  const deviseGlobalRe = /^\s*devise\s+(.+)/gm
  let deviseMatch
  while ((deviseMatch = deviseGlobalRe.exec(content))) {
    let deviseStr = deviseMatch[1]
    // Only continue if line ends with comma (argument list continues)
    const afterMatch = content.slice(deviseMatch.index + deviseMatch[0].length)
    if (deviseMatch[0].trimEnd().endsWith(',')) {
      const continuationLines = afterMatch.split('\n')
      for (const line of continuationLines) {
        const trimmed = line.trim()
        if (trimmed.length === 0) continue
        if (/^:/.test(trimmed) || /^,\s*:/.test(trimmed)) {
          deviseStr += ' ' + trimmed
        } else {
          break
        }
      }
    }
    // Split at first keyword argument (e.g. `omniauth_providers:`) — everything
    // before it is module symbols, everything after is configuration values
    const keywordArgSplit = deviseStr.split(/\b\w+:\s*/)
    const modulesPart = keywordArgSplit[0]
    const modules = (modulesPart.match(/:(\w+)/g) || []).map((s) => s.slice(1))
    devise_modules.push(...modules)
  }

  // Searchable
  let searchable = null
  if (MODEL_PATTERNS.searchkick.test(content)) {
    searchable = { gem: 'searchkick', scopes: [] }
  } else if (MODEL_PATTERNS.pgSearchModel.test(content)) {
    const pgScopes = []
    const pgRe = new RegExp(MODEL_PATTERNS.pgSearchScope.source, 'gm')
    while ((m = pgRe.exec(content))) {
      pgScopes.push(m[1])
    }
    searchable = { gem: 'pg_search', scopes: pgScopes }
  }

  // Friendly ID
  let friendly_id = null
  if (MODEL_PATTERNS.extendFriendlyId.test(content)) {
    const fidMatch = content.match(MODEL_PATTERNS.friendlyId)
    friendly_id = { attribute: fidMatch ? fidMatch[1] : null }
  }

  // Soft delete
  let soft_delete = null
  if (MODEL_PATTERNS.discardModel.test(content)) {
    soft_delete = { strategy: 'discard' }
  } else if (MODEL_PATTERNS.paranoid.test(content)) {
    soft_delete = { strategy: 'paranoid' }
  }

  // State machine
  let state_machine = null
  if (
    MODEL_PATTERNS.includeAASM.test(content) ||
    MODEL_PATTERNS.aasm.test(content)
  ) {
    state_machine = { gem: 'aasm', detected: true }
  } else if (MODEL_PATTERNS.stateMachine.test(content)) {
    state_machine = { gem: 'state_machines', detected: true }
  }

  // Paper trail
  const paper_trail = MODEL_PATTERNS.hasPaperTrail.test(content)

  // Audited
  const audited = MODEL_PATTERNS.audited.test(content)
  const has_associated_audits = /^\s*has_associated_audits/m.test(content)

  // accepts_nested_attributes_for
  const nested_attributes = []
  const nestedAttrsRe =
    /^\s*accepts_nested_attributes_for\s+:(\w+)(?:,\s*(.+))?$/gm
  while ((m = nestedAttrsRe.exec(content))) {
    nested_attributes.push({ name: m[1], options: m[2]?.trim() || null })
  }

  // STI base detection (has subclasses inheriting from this, detected elsewhere)
  const sti_base = false

  // Public instance method names (before first private/protected marker) with line ranges
  const public_methods = []
  const method_line_ranges = {}
  {
    const methodLines = content.split('\n')
    let inPrivate = false
    let currentMethodName = null
    let currentMethodStart = null
    let methodDepth = 0
    for (let i = 0; i < methodLines.length; i++) {
      const line = methodLines[i]
      const lineNumber = i + 1

      if (/^\s*(private|protected)\s*$/.test(line)) {
        if (currentMethodName && !inPrivate) {
          method_line_ranges[currentMethodName] = {
            start: currentMethodStart,
            end: lineNumber - 1,
          }
        }
        inPrivate = true
        currentMethodName = null
        methodDepth = 0
        continue
      }

      const mm = line.match(/^\s*def\s+((?:self\.)?\w+[?!=]?)/)
      if (mm) {
        // Close previous method
        if (currentMethodName && !inPrivate) {
          method_line_ranges[currentMethodName] = {
            start: currentMethodStart,
            end: lineNumber - 1,
          }
        }

        if (!inPrivate && mm[1] !== 'initialize') {
          public_methods.push(mm[1])
          currentMethodName = mm[1]
          currentMethodStart = lineNumber
          methodDepth = 1
        } else {
          currentMethodName = null
        }
        continue
      }

      if (currentMethodName && !inPrivate) {
        if (
          /\bdo\b|\bif\b(?!.*\bthen\b.*\bend\b)|\bcase\b|\bbegin\b/.test(
            line,
          ) &&
          !/\bend\b/.test(line)
        ) {
          methodDepth++
        }
        if (/^\s*end\b/.test(line)) {
          methodDepth--
          if (methodDepth <= 0) {
            method_line_ranges[currentMethodName] = {
              start: currentMethodStart,
              end: lineNumber,
            }
            currentMethodName = null
            methodDepth = 0
          }
        }
      }
    }

    // Close final method
    if (currentMethodName && !inPrivate) {
      method_line_ranges[currentMethodName] = {
        start: currentMethodStart,
        end: methodLines.length,
      }
    }
  }

  return {
    class: detectedClass,
    file: filePath,
    type: isConcern ? 'concern' : 'model',
    superclass,
    namespace: detectedNamespace,
    abstract,
    sti_base,
    concerns,
    extends: extends_,
    associations,
    validations,
    custom_validators,
    scopes,
    scope_queries,
    enums,
    callbacks,
    delegations,
    encrypts,
    normalizes,
    token_generators,
    has_secure_password,
    attachments,
    rich_text,
    store_accessors,
    table_name,
    default_scope,
    broadcasts,
    strict_loading,
    turbo_refreshes_with,
    devise_modules,
    searchable,
    friendly_id,
    soft_delete,
    state_machine,
    paper_trail,
    audited,
    has_associated_audits,
    nested_attributes,
    public_methods,
    method_line_ranges,
  }
}

/**
 * Extract all models from a manifest.
 * @param {import('../providers/interface.js').FileProvider} provider
 * @param {Array<{path: string}>} modelEntries
 * @returns {Array<object>}
 */
export function extractModels(provider, modelEntries) {
  const results = []
  for (const entry of modelEntries) {
    const model = extractModel(provider, entry.path)
    if (model) results.push(model)
  }
  return results
}
