/**
 * Model Extractor (#1)
 * Extracts all ActiveRecord model patterns from Ruby model files.
 */

import { MODEL_PATTERNS } from '../core/patterns.js'

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
  const classMatch = content.match(MODEL_PATTERNS.classDeclaration)
  if (classMatch) {
    detectedClass = classMatch[1]
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
    if (mod !== 'ActiveSupport::Concern' && mod !== 'FriendlyId') {
      extends_.push(mod)
    }
  }

  // Associations
  const associations = []
  const assocTypes = [
    { key: 'belongsTo', type: 'belongs_to' },
    { key: 'hasMany', type: 'has_many' },
    { key: 'hasOne', type: 'has_one' },
    { key: 'habtm', type: 'has_and_belongs_to_many' },
  ]
  for (const { key, type } of assocTypes) {
    const re = new RegExp(MODEL_PATTERNS[key].source, 'gm')
    while ((m = re.exec(content))) {
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
      }
      associations.push(entry)
    }
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

  // Scopes — names array (backward-compat) + scope_queries dict with bodies
  const scopes = []
  const scope_queries = {}
  // Extended pattern: capture the body inside { } after ->
  const scopeBodyRe =
    /^\s*scope\s+:(\w+),\s*->\s*(?:\([^)]*\)\s*)?\{\s*([^}]+)\}/gm
  const scopeSimpleRe = new RegExp(MODEL_PATTERNS.scope.source, 'gm')
  const scopeNamesFound = new Set()
  while ((m = scopeBodyRe.exec(content))) {
    scopes.push(m[1])
    scope_queries[m[1]] = m[2].trim().replace(/\s+/g, ' ')
    scopeNamesFound.add(m[1])
  }
  // Fall back to name-only for scopes we couldn't extract a body from
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

  // Callbacks
  const callbacks = []
  const cbRe = new RegExp(MODEL_PATTERNS.callbackType.source, 'gm')
  while ((m = cbRe.exec(content))) {
    callbacks.push({ type: m[1], method: m[2], options: m[3] || null })
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
    const attrs = m[1].match(/:(\w+)/g)
    if (attrs) normalizes.push(...attrs.map((a) => a.slice(1)))
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

  // Devise modules
  let devise_modules = []
  const deviseMatch = content.match(MODEL_PATTERNS.devise)
  if (deviseMatch) {
    // Devise declaration can span multiple lines
    let deviseStr = deviseMatch[1]
    // Continue capturing if line ends with comma
    const deviseStartIdx = content.indexOf(deviseMatch[0])
    const afterMatch = content.slice(deviseStartIdx + deviseMatch[0].length)
    const continuationLines = afterMatch.split('\n')
    for (const line of continuationLines) {
      const trimmed = line.trim()
      if (trimmed.length === 0) continue
      if (/^:/.test(trimmed) || /^,/.test(trimmed) || /^\w+.*:/.test(trimmed)) {
        deviseStr += ' ' + trimmed
      } else {
        break
      }
    }
    devise_modules = (deviseStr.match(/:(\w+)/g) || []).map((s) => s.slice(1))
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

  // STI base detection (has subclasses inheriting from this, detected elsewhere)
  const sti_base = false

  // Public instance method names (before first private/protected marker)
  const public_methods = []
  {
    const methodLines = content.split('\n')
    let inPrivate = false
    for (const line of methodLines) {
      if (/^\s*(private|protected)\s*$/.test(line)) {
        inPrivate = true
        continue
      }
      if (!inPrivate) {
        const mm = line.match(/^\s*def\s+(\w+)/)
        if (mm && mm[1] !== 'initialize') public_methods.push(mm[1])
      }
    }
  }

  return {
    class: detectedClass,
    file: filePath,
    type: isConcern ? 'concern' : 'model',
    superclass,
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
    devise_modules,
    searchable,
    friendly_id,
    soft_delete,
    state_machine,
    paper_trail,
    audited,
    public_methods,
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
