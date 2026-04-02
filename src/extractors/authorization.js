/**
 * Authorization Extractor (#9)
 * Detects authorization strategy (Pundit, CanCanCan, Action Policy, custom RBAC)
 * and extracts a comprehensive RBAC analysis including guard methods,
 * role predicates, controller enforcement map, and domain role disambiguation.
 */

import { AUTHORIZATION_PATTERNS } from '../core/patterns.js'

// Common authorization gem names to search for and report
const SEARCHED_LIBRARIES = [
  'pundit',
  'cancancan',
  'cancan',
  'rolify',
  'action_policy',
  'access-granted',
]

// -------------------------------------------------------
// Helpers for deep custom RBAC extraction
// -------------------------------------------------------

/** Extract method bodies from Ruby source as { name → body }. */
function extractMethodBodies(content) {
  const bodies = {}
  const lines = content.split('\n')
  let currentMethod = null
  let depth = 0
  const bodyLines = []

  for (const line of lines) {
    const defMatch = line.match(/^\s*def\s+(\w+[?!]?)/)
    if (defMatch && depth === 0) {
      if (currentMethod) bodies[currentMethod] = bodyLines.join('\n').trim()
      currentMethod = defMatch[1]
      bodyLines.length = 0
      depth = 0
      continue
    }
    if (currentMethod) {
      if (/\bdo\b|\bif\b|\bcase\b|\bbegin\b|\bdef\b/.test(line)) depth++
      if (/^\s*end\b/.test(line)) {
        if (depth === 0) {
          bodies[currentMethod] = bodyLines.join('\n').trim()
          currentMethod = null
          bodyLines.length = 0
          continue
        }
        depth--
      }
      bodyLines.push(line)
    }
  }
  if (currentMethod) bodies[currentMethod] = bodyLines.join('\n').trim()
  return bodies
}

/** Parse the authorization concern for guard methods, helpers, error handling. */
function parseConcern(content, filePath) {
  if (!content) return null

  const concern = {
    file: filePath,
    included_in: null,
    error_class: null,
    helper_methods_exposed_to_views: [],
    guard_methods: {},
    error_handling: null,
  }

  // Detect error class
  const errorClassMatch = content.match(
    /class\s+(\w+(?:::\w+)*Error)\s*<\s*(StandardError|RuntimeError)/,
  )
  if (errorClassMatch) concern.error_class = errorClassMatch[1]

  // Detect helper_method declarations
  const helperMatch = content.match(/helper_method\s+([^\n]+)/)
  if (helperMatch) {
    concern.helper_methods_exposed_to_views = helperMatch[1]
      .split(',')
      .map((s) => s.trim().replace(/^:/, ''))
      .filter(Boolean)
  }

  // Extract guard methods (require_*! pattern)
  const bodies = extractMethodBodies(content)
  for (const [name, body] of Object.entries(bodies)) {
    if (/^require_\w+!$/.test(name)) {
      const guard = { requirement: null, raises: null }
      // Look for the predicate check
      const predicateMatch =
        body.match(/unless\s+(?:Current\.user\.)?(\w+\?)/) ||
        body.match(/raise.*unless.*?(\w+\?)/) ||
        body.match(/if\s+(?:!|not\s)(?:Current\.user\.)?(\w+\?)/)
      if (predicateMatch) {
        guard.requirement = predicateMatch[1]
      } else {
        // Try to extract multi-predicate: "a? || b?"
        const multiMatch = body.match(
          /unless\s+(?:Current\.user\.)?(\w+\?(?:\s*\|\|\s*(?:Current\.user\.)?\w+\?)*)/,
        )
        if (multiMatch)
          guard.requirement = multiMatch[1].replace(/Current\.user\./g, '')
      }
      // Detect what error is raised
      const raiseMatch = body.match(/raise\s+(\w+(?:::\w+)*)/)
      if (raiseMatch) guard.raises = raiseMatch[1]
      concern.guard_methods[name] = guard
    }
  }

  // Error handling: rescue_from
  const rescueMatch = content.match(
    /rescue_from\s+(\w+(?:::\w+)*),\s*with:\s*:(\w+)/,
  )
  if (rescueMatch) {
    const handlerName = rescueMatch[2]
    const handlerBody = bodies[handlerName] || ''
    const errorHandling = {
      rescue_from: rescueMatch[1],
      handler: handlerName,
    }
    // Detect response logic
    if (/redirect/.test(handlerBody)) {
      const redirectMatch = handlerBody.match(/redirect_to\s+([^\n,]+)/)
      errorHandling.html_response = redirectMatch
        ? `redirect with flash — ${redirectMatch[1].trim()}`
        : 'redirect with flash alert'
    }
    if (/head\s*:forbidden|head\s*403/.test(handlerBody)) {
      errorHandling.non_html_response = 'head :forbidden (HTTP 403)'
    }
    concern.error_handling = errorHandling
  }

  return concern
}

/** Extract role predicates from User model content. */
function extractRolePredicates(content) {
  if (!content) return null

  const bodies = extractMethodBodies(content)
  const atomic = {}
  const composite = {}
  const legacy_aliases = {}

  for (const [name, body] of Object.entries(bodies)) {
    if (!name.endsWith('?')) continue
    const trimmedBody = body.trim().replace(/\s+/g, ' ')

    // Detect if this is a simple role check (atomic)
    const singleRoleMatch = trimmedBody.match(/^role\s*==\s*['"](\w+)['"]$/)
    if (singleRoleMatch) {
      atomic[name] = `role == '${singleRoleMatch[1]}'`
      continue
    }

    // Detect composite predicates (using || or &&)
    if (/\w+\?\s*(\|\||&&)\s*\w+\?/.test(trimmedBody)) {
      composite[name] = trimmedBody
      continue
    }

    // Detect alias/delegate (method simply calls another predicate)
    const aliasMatch = trimmedBody.match(/^(\w+\?)$/)
    if (aliasMatch && bodies[aliasMatch[1]] !== undefined) {
      legacy_aliases[name] = aliasMatch[1]
      continue
    }

    // Check for send(:method_name) pattern used by aliases
    const sendMatch = trimmedBody.match(/^send\s*\(\s*:(\w+\?)\s*\)$/)
    if (sendMatch) {
      legacy_aliases[name] = sendMatch[1]
      continue
    }

    // Simple delegation: method_name → another_method?
    if (/^\w+\?$/.test(trimmedBody)) {
      legacy_aliases[name] = trimmedBody
    }
  }

  if (
    Object.keys(atomic).length === 0 &&
    Object.keys(composite).length === 0 &&
    Object.keys(legacy_aliases).length === 0
  ) {
    return null
  }

  return {
    source_file: 'app/models/user.rb',
    atomic,
    composite,
    legacy_aliases:
      Object.keys(legacy_aliases).length > 0 ? legacy_aliases : undefined,
  }
}

/** Extract role definition from User model content. */
function extractRoleDefinition(content, schemaData) {
  if (!content) return null

  // Try multiple enum patterns
  const enumPatterns = [
    // Modern: enum :role, { key: 0, ... }
    /enum\s+:role,\s*\{([^}]+)\}/,
    // Legacy: enum role: { key: 0, ... }
    /enum\s+role:\s*\{([^}]+)\}/,
    // Array: enum :role, [ :a, :b ]
    /enum\s+:role,\s*\[([^\]]+)\]/,
    // Legacy array: enum role: [ :a, :b ]
    /enum\s+role:\s*\[([^\]]+)\]/,
  ]

  let enumBody = null
  let enumType = 'string'
  for (const re of enumPatterns) {
    const m = content.match(re)
    if (m) {
      enumBody = m[1]
      break
    }
  }

  if (!enumBody) return null

  // Parse roles from enum body
  const roles = {}
  const pairRe = /(\w+):\s*(\d+)/g
  let pm
  let hasIntValues = false
  while ((pm = pairRe.exec(enumBody))) {
    hasIntValues = true
    roles[pm[1]] = { value: pm[1], default: false }
  }

  if (!hasIntValues) {
    // Symbol-only enum (string type)
    const symbols =
      enumBody.match(/\w+/g)?.filter((v) => !/^\d+$/.test(v)) || []
    for (const s of symbols) {
      roles[s] = { value: s, default: false }
    }
  } else {
    enumType = 'integer'
  }

  // Check for default role
  const defaultMatch = content.match(
    /default:\s*['"](\w+)['"]|default.*role.*['"](\w+)['"]/,
  )
  if (defaultMatch) {
    const defaultRole = defaultMatch[1] || defaultMatch[2]
    if (roles[defaultRole]) roles[defaultRole].default = true
  }

  // Check schema for column details
  let storage = { model: 'User', column: 'role' }
  if (schemaData) {
    const usersTable = (schemaData.tables || []).find((t) => t.name === 'users')
    if (usersTable) {
      const roleCol = usersTable.columns?.find((c) => c.name === 'role')
      if (roleCol) {
        storage.column_type = roleCol.type || 'string'
        if (roleCol.constraints) {
          if (/default/.test(roleCol.constraints))
            storage.default = roleCol.constraints.match(
              /default:\s*['"]?(\w+)['"]?/,
            )?.[1]
          if (/null:\s*false/.test(roleCol.constraints)) storage.null = false
        }
      }
      const roleIndex = usersTable.indexes?.find((i) =>
        i.columns?.includes('role'),
      )
      if (roleIndex) storage.indexed = true
    }
  }

  // Detect role normalization callbacks
  let normalization = null
  const normMatch = content.match(/before_validation\s+:(\w+)(?:.*?#\s*(.+))?/)
  if (normMatch && /role|legacy/.test(normMatch[1])) {
    normalization = `before_validation :${normMatch[1]}${normMatch[2] ? ' — ' + normMatch[2].trim() : ''}`
  }

  // Detect legacy role aliases
  const legacy_aliases = {}
  const bodies = extractMethodBodies(content)
  // Look for normalization method that maps old values to new
  for (const [name, body] of Object.entries(bodies)) {
    if (/normalize|legacy|remap/.test(name) && /role/.test(body)) {
      const mappings = body.matchAll(/['"](\w+)['"]\s*=>\s*['"](\w+)['"]/g)
      for (const mapping of mappings) {
        legacy_aliases[mapping[1]] = mapping[2]
      }
      // Also check gsub/sub patterns
      const gsubMatch = body.match(/gsub.*['"](\w+)['"].*['"](\w+)['"]/)
      if (gsubMatch) legacy_aliases[gsubMatch[1]] = gsubMatch[2]
    }
  }

  return {
    storage,
    enum_type: enumType === 'integer' ? 'integer' : 'string',
    roles,
    legacy_aliases:
      Object.keys(legacy_aliases).length > 0 ? legacy_aliases : undefined,
    normalization,
  }
}

/** Build the controller enforcement map by scanning controller files. */
function buildEnforcementMap(provider, entries, guardMethodNames) {
  if (guardMethodNames.length === 0) return null

  const guardPattern = new RegExp(
    `(?:before_action|prepend_before_action)\\s+:?(${guardMethodNames.map((n) => n.replace(/[!?]/g, '\\$&')).join('|')})`,
  )

  const namespaces = {}
  const unguarded = []
  const controllerGuards = {} // className → { file, guard, superclass }

  const controllerEntries = entries.filter(
    (e) =>
      e.categoryName === 'controllers' ||
      e.category === 'controller' ||
      (e.path && e.path.includes('app/controllers/') && e.path.endsWith('.rb')),
  )

  for (const entry of controllerEntries) {
    const content = provider.readFile(entry.path)
    if (!content) continue

    const classMatch = content.match(
      /class\s+(\w+(?:::\w+)*)\s*<\s*(\w+(?:::\w+)*)/,
    )
    if (!classMatch) continue

    const className = classMatch[1]
    const superclass = classMatch[2]

    // Check for guard before_actions
    const guards = []
    const guardRe = new RegExp(guardPattern.source, 'g')
    let gm
    while ((gm = guardRe.exec(content))) {
      const guardName = gm[1]
      // Check for only/except options
      const afterGuard = content.slice(gm.index, gm.index + 200)
      const onlyMatch = afterGuard.match(
        /only:\s*(?:\[([^\]]+)\]|:(\w+)|%i\[([^\]]+)\])/,
      )
      const only = onlyMatch
        ? (onlyMatch[1] || onlyMatch[2] || onlyMatch[3] || '')
            .replace(/[:%]/g, ' ')
            .trim()
            .split(/[\s,]+/)
            .filter(Boolean)
        : null
      guards.push({ method: guardName, only })
    }

    // Check for allow_unauthenticated_access
    const unauthMatch = content.match(
      /allow_unauthenticated_access(?:\s+only:\s*(?:%i\[([^\]]+)\]|:(\w+)|\[([^\]]+)\]))?/,
    )

    controllerGuards[className] = {
      file: entry.path,
      guards,
      superclass,
      allow_unauthenticated: !!unauthMatch,
    }

    if (unauthMatch && guards.length === 0) {
      const only = (unauthMatch[1] || unauthMatch[2] || unauthMatch[3] || '')
        .replace(/[:%]/g, ' ')
        .trim()
      const label = only
        ? `${className} (allow_unauthenticated_access on ${only})`
        : `${className} (allow_unauthenticated_access)`
      unguarded.push(label)
    }
  }

  // Resolve inheritance: mark controllers that inherit guards
  for (const [className, info] of Object.entries(controllerGuards)) {
    if (info.guards.length === 0 && !info.allow_unauthenticated) {
      // Check if superclass has a guard
      const parent = controllerGuards[info.superclass]
      if (parent && parent.guards.length > 0) {
        info.inherited_guard = {
          from: info.superclass,
          guard: parent.guards[0].method,
        }
      }
    }
  }

  // Group by namespace
  for (const [className, info] of Object.entries(controllerGuards)) {
    if (info.guards.length === 0 && !info.inherited_guard) continue

    let ns = 'other'
    if (className.startsWith('Admin::')) ns = 'admin_namespace'
    else if (className.startsWith('Settings::')) ns = 'settings_namespace'
    else if (info.file?.includes('/admin/')) ns = 'admin_namespace'
    else if (info.file?.includes('/settings/')) ns = 'settings_namespace'
    else ns = 'customer_area'

    if (!namespaces[ns]) namespaces[ns] = { controllers: {} }

    const ctrlEntry = { file: info.file }
    if (info.guards.length > 0) {
      const primaryGuard = info.guards[0]
      ctrlEntry.guard = primaryGuard.method
      if (primaryGuard.only) ctrlEntry.only = primaryGuard.only.join(', ')
      // Additional guards beyond the first
      if (info.guards.length > 1) {
        ctrlEntry.additional_guards = info.guards.slice(1).map((g) => ({
          guard: g.method,
          only: g.only ? g.only.join(', ') : null,
        }))
      }
    } else if (info.inherited_guard) {
      ctrlEntry.guard = `inherited (${info.inherited_guard.guard})`
    }

    namespaces[ns].controllers[className] = ctrlEntry
  }

  // Add base_guard labels for namespaces
  for (const [ns, data] of Object.entries(namespaces)) {
    // Find the base controller for this namespace
    const baseNames = Object.keys(data.controllers).filter(
      (n) => n.endsWith('BaseController') || n === 'Admin::BaseController',
    )
    if (baseNames.length > 0) {
      const baseCtrl = controllerGuards[baseNames[0]]
      if (baseCtrl?.guards?.length > 0) {
        data.base_guard = `${baseCtrl.guards[0].method} (before_action on ${baseNames[0]})`
      }
    }
  }

  return {
    ...namespaces,
    unguarded_controllers: unguarded.length > 0 ? unguarded : undefined,
  }
}

/** Detect domain roles that are NOT part of the auth system. */
function detectDomainRoles(provider, entries, authRoleModel) {
  const domainRoles = []

  // Look for concerns or models with "role" in the name that aren't the auth role model
  for (const entry of entries) {
    if (entry.categoryName !== 'models' && entry.category !== 'model') continue
    if (!/role/i.test(entry.path)) continue
    // Skip the auth role model itself
    if (entry.path === 'app/models/user.rb') continue

    const content = provider.readFile(entry.path)
    if (!content) continue

    const isConcern =
      /module\s+\w+/.test(content) &&
      /extend\s+ActiveSupport::Concern/.test(content)
    const classMatch = content.match(/(?:module|class)\s+(\w+(?:::\w+)*)/)
    const name = classMatch ? classMatch[1] : entry.path

    // Determine purpose from content
    let purpose = 'unknown'
    if (isConcern) {
      // Look for constant arrays or hashes that suggest domain data
      const constMatch = content.match(/(\w+)\s*=\s*(?:\[|%w)/)
      if (constMatch)
        purpose = `Static list defined as ${constMatch[1]} constant`
      else purpose = 'Concern module'
    } else {
      // Check if it's an ActiveRecord model
      if (/class\s+\w+\s*<\s*(?:Application|Active)Record/.test(content)) {
        purpose = 'Domain model for business entities (not access control)'
      }
    }

    domainRoles.push({
      concern: `${name} (${entry.path})`,
      purpose,
      auth_relevance:
        'none — purely domain data, not related to access control',
    })
  }

  return domainRoles.length > 0 ? domainRoles[0] : null
}

/**
 * Extract authorization information.
 * @param {import('../providers/interface.js').FileProvider} provider
 * @param {Array<{path: string, category: string}>} entries
 * @param {{gems?: object}} gemInfo
 * @param {object|null} schemaData
 * @returns {object}
 */
export function extractAuthorization(
  provider,
  entries,
  gemInfo = {},
  schemaData = null,
) {
  const gems = gemInfo.gems || {}
  const result = {
    strategy: null,
    policies: [],
    abilities: null,
    roles: null,
  }

  const hasPundit = !!gems.pundit
  const hasCanCan = !!gems.cancancan || !!gems.cancan
  const hasActionPolicy = !!gems.action_policy
  const hasRolify = !!gems.rolify
  const hasAccessGranted = !!gems['access-granted']

  // Report which libraries were searched and not found
  const searchedNotFound = SEARCHED_LIBRARIES.filter((lib) => !gems[lib])

  // Pundit
  if (hasPundit) {
    result.strategy = 'pundit'
    const policyEntries = entries.filter(
      (e) =>
        e.path.startsWith('app/policies/') && e.path.endsWith('_policy.rb'),
    )

    for (const entry of policyEntries) {
      const content = provider.readFile(entry.path)
      if (!content) continue

      const classMatch = content.match(AUTHORIZATION_PATTERNS.policyClass)
      if (!classMatch) continue

      const policy = {
        class: classMatch[1] + 'Policy',
        resource: classMatch[1],
        permitted_actions: [],
        has_scope: false,
      }

      const methodRe = new RegExp(
        AUTHORIZATION_PATTERNS.policyMethod.source,
        'g',
      )
      let m
      while ((m = methodRe.exec(content))) {
        policy.permitted_actions.push(m[1])
      }

      if (AUTHORIZATION_PATTERNS.policyScopeClass.test(content)) {
        policy.has_scope = true
      }

      result.policies.push(policy)
    }
  }

  // CanCanCan
  if (hasCanCan) {
    if (!result.strategy) result.strategy = 'cancancan'
    let abilityContent = provider.readFile('app/models/ability.rb')
    let abilityFile = 'app/models/ability.rb'
    // Fallback: scan model and authorization files for CanCan::Ability
    if (
      !abilityContent ||
      !AUTHORIZATION_PATTERNS.abilityClass.test(abilityContent)
    ) {
      const abilityEntries = entries.filter(
        (e) =>
          (e.category === 'model' ||
            e.categoryName === 'models' ||
            e.category === 1 ||
            e.categoryName === 'authorization' ||
            e.category === 9) &&
          e.path.endsWith('.rb'),
      )
      for (const entry of abilityEntries) {
        const c = provider.readFile(entry.path)
        if (
          c &&
          (AUTHORIZATION_PATTERNS.abilityClass.test(c) ||
            AUTHORIZATION_PATTERNS.includeCanCan.test(c))
        ) {
          abilityContent = c
          abilityFile = entry.path
          break
        }
      }
    }
    if (
      abilityContent &&
      (AUTHORIZATION_PATTERNS.abilityClass.test(abilityContent) ||
        AUTHORIZATION_PATTERNS.includeCanCan.test(abilityContent))
    ) {
      const abilities = []
      const canRe = new RegExp(AUTHORIZATION_PATTERNS.canDef.source, 'gm')
      let m
      while ((m = canRe.exec(abilityContent))) {
        abilities.push({ type: 'can', definition: m[1].trim() })
      }
      const cannotRe = new RegExp(AUTHORIZATION_PATTERNS.cannotDef.source, 'gm')
      while ((m = cannotRe.exec(abilityContent))) {
        abilities.push({ type: 'cannot', definition: m[1].trim() })
      }
      result.abilities = abilities

      // Extract role names from has_role? calls in the ability file
      const roleRe = /has_role\?\s*\(\s*:(\w+)\s*\)/g
      const roles = new Set()
      let roleM
      while ((roleM = roleRe.exec(abilityContent))) {
        roles.add(roleM[1])
      }
      // Also try string syntax: has_role?('admin') or has_role?("admin")
      const roleStrRe = /has_role\?\s*\(\s*['"](\w+)['"]\s*\)/g
      while ((roleM = roleStrRe.exec(abilityContent))) {
        roles.add(roleM[1])
      }
      if (roles.size > 0) {
        result.roles = {
          source: 'ability_class',
          model: 'User',
          roles: [...roles],
          file: abilityFile,
        }
      }

      // Group abilities by role from conditional blocks
      const roleAbilities = {}
      const roleBlockRe = /(?:if|elsif)\s+.*?has_role\?\s*\(\s*:(\w+)\s*\)/g
      let rbMatch
      const rolePositions = []
      while ((rbMatch = roleBlockRe.exec(abilityContent))) {
        rolePositions.push({ role: rbMatch[1], index: rbMatch.index })
      }

      for (let i = 0; i < rolePositions.length; i++) {
        const start = rolePositions[i].index
        const end = i + 1 < rolePositions.length
          ? rolePositions[i + 1].index
          : abilityContent.length
        const block = abilityContent.slice(start, end)

        const blockAbilities = []
        const blockCanRe = /^\s*(can(?:not)?)\s+(.+)/gm
        let bm
        while ((bm = blockCanRe.exec(block))) {
          blockAbilities.push({ type: bm[1], definition: bm[2].trim() })
        }
        if (blockAbilities.length > 0) {
          roleAbilities[rolePositions[i].role] = blockAbilities
        }
      }

      if (Object.keys(roleAbilities).length > 0) {
        result.abilities_by_role = roleAbilities
      }
    }
  }

  // Action Policy
  if (hasActionPolicy) {
    if (!result.strategy) result.strategy = 'action_policy'
    const policyEntries = entries.filter(
      (e) =>
        e.path.startsWith('app/policies/') && e.path.endsWith('_policy.rb'),
    )
    for (const entry of policyEntries) {
      const content = provider.readFile(entry.path)
      if (!content) continue
      const classMatch = content.match(AUTHORIZATION_PATTERNS.policyClass)
      if (!classMatch) continue
      const policy = {
        class: classMatch[1] + 'Policy',
        resource: classMatch[1],
        permitted_actions: [],
        has_scope: false,
      }
      const methodRe = new RegExp(
        AUTHORIZATION_PATTERNS.policyMethod.source,
        'g',
      )
      let m
      while ((m = methodRe.exec(content))) {
        policy.permitted_actions.push(m[1])
      }
      result.policies.push(policy)
    }
  }

  // Rolify
  if (hasRolify) {
    if (!result.strategy) result.strategy = 'rolify'
  }

  // Custom policies (no gem but app/policies/ exists)
  if (!result.strategy) {
    const policyEntries = entries.filter(
      (e) =>
        e.path.startsWith('app/policies/') && e.path.endsWith('_policy.rb'),
    )
    if (policyEntries.length > 0) {
      result.strategy = 'custom'
      for (const entry of policyEntries) {
        const content = provider.readFile(entry.path)
        if (!content) continue
        const classMatch = content.match(AUTHORIZATION_PATTERNS.policyClass)
        if (classMatch) {
          result.policies.push({
            class: classMatch[1] + 'Policy',
            resource: classMatch[1],
            permitted_actions: [],
            has_scope: false,
          })
        }
      }
    }
  }

  // Role detection from models
  const modelEntries = entries.filter(
    (e) =>
      e.category === 'model' ||
      e.categoryName === 'models' ||
      e.category === 1 ||
      e.categoryName === 'models',
  )

  // First pass: check for rolify declaration (strongest signal)
  for (const entry of modelEntries) {
    const content = provider.readFile(entry.path)
    if (!content) continue
    if (/^\s*rolify\b/m.test(content)) {
      const classMatch = content.match(/class\s+(\w+(?:::\w+)*)/)
      if (classMatch) {
        result.roles = { source: 'rolify', model: classMatch[1] }
        break
      }
    }
  }

  // Second pass: fall back to enum role if rolify not found
  if (!result.roles) {
    for (const entry of modelEntries) {
      const content = provider.readFile(entry.path)
      if (!content) continue
      if (AUTHORIZATION_PATTERNS.enumRole.test(content)) {
        const className = entry.path
          .split('/')
          .pop()
          .replace('.rb', '')
          .split('_')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join('')
        result.roles = { source: 'enum', model: className }
        break
      }
    }
  }

  // -------------------------------------------------------
  // Deep custom RBAC extraction (when no standard library found)
  // -------------------------------------------------------
  // Detect authorization concern in controller concerns
  const authzConcernPaths = [
    'app/controllers/concerns/authorization.rb',
    'app/controllers/concerns/authorizable.rb',
  ]
  let authzConcernContent = null
  let authzConcernFile = null
  for (const p of authzConcernPaths) {
    const c = provider.readFile(p)
    if (c) {
      authzConcernContent = c
      authzConcernFile = p
      break
    }
  }
  // Fallback: search entries for a concern with "authorization" in path
  if (!authzConcernContent) {
    const concernEntry = entries.find(
      (e) =>
        (e.categoryName === 'controllers' || e.category === 'controller') &&
        e.path.includes('concerns') &&
        e.path.toLowerCase().includes('authoriz'),
    )
    if (concernEntry) {
      authzConcernContent = provider.readFile(concernEntry.path)
      authzConcernFile = concernEntry.path
    }
  }

  if (authzConcernContent) {
    if (!result.strategy) result.strategy = 'custom_rbac'

    // Parse the concern
    const concern = parseConcern(authzConcernContent, authzConcernFile)

    // Check where it's included
    const appCtrlContent = provider.readFile(
      'app/controllers/application_controller.rb',
    )
    if (appCtrlContent && /include\s+Authorization/.test(appCtrlContent)) {
      concern.included_in =
        'ApplicationController (via app/controllers/application_controller.rb)'
    }

    result.concern = concern

    // Extract role definition and predicates from User model
    const userContent = provider.readFile('app/models/user.rb')
    if (userContent) {
      const roleDefinition = extractRoleDefinition(userContent, schemaData)
      if (roleDefinition) result.role_definition = roleDefinition

      const predicates = extractRolePredicates(userContent)
      if (predicates) result.predicates = predicates
    }

    // Build controller enforcement map
    const guardMethodNames = Object.keys(concern.guard_methods || {})
    const enforcementMap = buildEnforcementMap(
      provider,
      entries,
      guardMethodNames,
    )
    if (enforcementMap) result.controller_enforcement_map = enforcementMap

    // Disambiguate domain roles
    const domainRoles = detectDomainRoles(
      provider,
      entries,
      result.roles?.model,
    )
    if (domainRoles) result.domain_roles_not_auth = domainRoles

    // Build related files list
    const relatedFiles = [authzConcernFile]
    if (appCtrlContent)
      relatedFiles.push('app/controllers/application_controller.rb')
    if (userContent) relatedFiles.push('app/models/user.rb')
    // Add admin base controller if it exists
    const adminBaseContent = provider.readFile(
      'app/controllers/admin/base_controller.rb',
    )
    if (adminBaseContent)
      relatedFiles.push('app/controllers/admin/base_controller.rb')
    // Add auth concern for cross-reference
    const authConcernContent = provider.readFile(
      'app/controllers/concerns/authentication.rb',
    )
    if (authConcernContent)
      relatedFiles.push('app/controllers/concerns/authentication.rb')
    result.related_files = [...new Set(relatedFiles)]

    // Add description
    if (!hasPundit && !hasCanCan && !hasActionPolicy && !hasRolify) {
      result.description =
        'Fully custom role-based access control via controller concerns. No Pundit, CanCanCan, or Rolify.'
      result.library = null
    }
  }

  // Always include searched-and-not-found
  if (searchedNotFound.length > 0) {
    result.searched_libraries_not_found = searchedNotFound
  }

  return result
}
