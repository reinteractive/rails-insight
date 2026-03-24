/**
 * Routes Extractor (#3)
 * Parses config/routes.rb with namespace/scope stack tracking.
 */

import { ROUTE_PATTERNS } from '../core/patterns.js'

/**
 * Extract route information from routes file(s).
 * @param {import('../providers/interface.js').FileProvider} provider
 * @returns {object}
 */
export function extractRoutes(provider) {
  const result = {
    root: null,
    resources: [],
    standalone_routes: [],
    mounted_engines: [],
    concerns: [],
    drawn_files: [],
    nested_relationships: [],
  }

  const content = provider.readFile('config/routes.rb')
  if (!content) return result

  parseRouteContent(content, result, provider, [])
  return result
}

/**
 * @param {string} content
 * @param {object} result
 * @param {import('../providers/interface.js').FileProvider} provider
 * @param {string[]} namespaceStack
 */
function parseRouteContent(content, result, provider, namespaceStack) {
  const lines = content.split('\n')
  const blockStack = [] // tracks do..end nesting for resources/member/collection
  const resourceStack = []
  let inMember = false
  let inCollection = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    // Skip comments and blanks
    if (!trimmed || trimmed.startsWith('#')) continue

    // Root
    const rootMatch = trimmed.match(ROUTE_PATTERNS.root)
    if (rootMatch) {
      result.root = { controller: rootMatch[1], action: rootMatch[2] || null }
      continue
    }

    // Draw (route splitting)
    const drawMatch = trimmed.match(ROUTE_PATTERNS.draw)
    if (drawMatch) {
      const drawFile = drawMatch[1]
      result.drawn_files.push(drawFile)
      const drawContent = provider.readFile('config/routes/' + drawFile + '.rb')
      if (drawContent) {
        parseRouteContent(drawContent, result, provider, [...namespaceStack])
      }
      continue
    }

    // Mount
    const mountMatch = trimmed.match(ROUTE_PATTERNS.mount)
    if (mountMatch) {
      result.mounted_engines.push({
        engine: mountMatch[1],
        path: mountMatch[2],
      })
      continue
    }

    // Concern definition
    const concernMatch = trimmed.match(ROUTE_PATTERNS.concern)
    if (concernMatch) {
      result.concerns.push(concernMatch[1])
      blockStack.push('concern')
      continue
    }

    // Namespace
    const nsMatch = trimmed.match(ROUTE_PATTERNS.namespace)
    if (nsMatch) {
      namespaceStack.push(nsMatch[1])
      blockStack.push('namespace')
      continue
    }

    // Scope
    const scopeMatch = trimmed.match(ROUTE_PATTERNS.scope)
    if (scopeMatch) {
      const scopeName = scopeMatch[1] || scopeMatch[2] || ''
      namespaceStack.push(scopeName)
      blockStack.push('scope')
      continue
    }

    // Resource (singular) - check before resources since resources? matches both
    const resourceMatch = trimmed.match(ROUTE_PATTERNS.resource)
    if (resourceMatch && /^\s*resource\s/.test(trimmed)) {
      const name = resourceMatch[1]
      const options = resourceMatch[2] || ''
      const ns = namespaceStack.length > 0 ? namespaceStack.join('/') : null

      let actions = ['show', 'new', 'create', 'edit', 'update', 'destroy']
      const onlyMatch = options.match(ROUTE_PATTERNS.only)
      if (onlyMatch) {
        const raw = onlyMatch[1] ?? `:${onlyMatch[2]}`
        actions = raw.match(/:(\w+)/g)?.map((a) => a.slice(1)) || []
      }

      const entry = {
        name,
        namespace: ns,
        controller: ns ? `${ns}/${name}` : name,
        actions,
        singular: true,
        member_routes: [],
        collection_routes: [],
      }

      if (trimmed.includes('do')) {
        blockStack.push('resource')
        resourceStack.push(entry)
      }

      result.resources.push(entry)
      continue
    }

    // Resources (plural)
    const resourcesMatch = trimmed.match(ROUTE_PATTERNS.resources)
    if (resourcesMatch) {
      const name = resourcesMatch[1]
      const options = resourcesMatch[2] || ''
      const ns = namespaceStack.length > 0 ? namespaceStack.join('/') : null

      // Determine actions
      let actions = [
        'index',
        'show',
        'new',
        'create',
        'edit',
        'update',
        'destroy',
      ]
      const onlyMatch = options.match(ROUTE_PATTERNS.only)
      if (onlyMatch) {
        const raw = onlyMatch[1] ?? `:${onlyMatch[2]}`
        actions = raw.match(/:(\w+)/g)?.map((a) => a.slice(1)) || []
      }
      const exceptMatch = options.match(ROUTE_PATTERNS.except)
      if (exceptMatch) {
        const raw = exceptMatch[1] ?? `:${exceptMatch[2]}`
        const except = raw.match(/:(\w+)/g)?.map((a) => a.slice(1)) || []
        actions = actions.filter((a) => !except.includes(a))
      }

      const entry = {
        name,
        namespace: ns,
        controller: ns ? `${ns}/${name}` : name,
        actions,
        member_routes: [],
        collection_routes: [],
        nested: [],
      }

      // Track nesting relationship
      const parentResource = resourceStack[resourceStack.length - 1] || null
      if (parentResource) {
        result.nested_relationships.push({
          parent: parentResource.name,
          child: name,
          parent_controller: parentResource.controller,
          child_controller: ns ? `${ns}/${name}` : name,
        })
        entry.parent_resource = parentResource.name
        if (parentResource.nested) {
          parentResource.nested.push(name)
        }
      }

      if (trimmed.includes('do')) {
        blockStack.push('resources')
        resourceStack.push(entry)
      }

      result.resources.push(entry)
      continue
    }

    // Member block
    if (ROUTE_PATTERNS.member.test(trimmed)) {
      inMember = true
      blockStack.push('member')
      continue
    }

    // Collection block
    if (ROUTE_PATTERNS.collection.test(trimmed)) {
      inCollection = true
      blockStack.push('collection')
      continue
    }

    // Symbol-form verb routes inside member/collection blocks: `get :action_name`
    if (inMember || inCollection) {
      const symbolVerbMatch = trimmed.match(ROUTE_PATTERNS.httpVerbSymbol)
      if (symbolVerbMatch) {
        const action = symbolVerbMatch[1]
        const currentResource = resourceStack[resourceStack.length - 1]
        if (currentResource) {
          if (inMember) currentResource.member_routes.push(action)
          else currentResource.collection_routes.push(action)
        }
        continue
      }
    }

    // HTTP verb routes
    const verbMatch = trimmed.match(ROUTE_PATTERNS.httpVerb)
    if (verbMatch) {
      const path = verbMatch[1]
      const controller = verbMatch[2] || null
      const action = verbMatch[3] || null
      const method =
        trimmed
          .match(/^\s*(get|post|put|patch|delete)\s/)?.[1]
          ?.toUpperCase() || 'GET'

      if (inMember && resourceStack.length > 0) {
        // Extract action name from path
        const currentResource = resourceStack[resourceStack.length - 1]
        const memberAction = path.replace(/^\//, '').split('/')[0]
        currentResource.member_routes.push(memberAction)
      } else if (inCollection && resourceStack.length > 0) {
        const currentResource = resourceStack[resourceStack.length - 1]
        const collAction = path.replace(/^\//, '').split('/')[0]
        currentResource.collection_routes.push(collAction)
      } else {
        result.standalone_routes.push({ method, path, controller, action })
      }
      continue
    }

    // End
    if (/^\s*end\b/.test(trimmed)) {
      const popped = blockStack.pop()
      if (popped === 'namespace' || popped === 'scope') {
        namespaceStack.pop()
      } else if (popped === 'member') {
        inMember = false
      } else if (popped === 'collection') {
        inCollection = false
      } else if (popped === 'resources' || popped === 'resource') {
        resourceStack.pop()
      }
    }
  }
}
