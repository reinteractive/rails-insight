/**
 * Graph Builder + Personalized PageRank
 * Builds a relationship graph from extractions and computes
 * skill-personalized PageRank rankings.
 */

import { RANK_PRECISION } from './constants.js'
import { classify as inflectorClassify } from '../utils/inflector.js'

/** Edge type weights */
export const EDGE_WEIGHTS = {
  inherits: 3.0,
  includes_concern: 2.5,
  has_many: 2.0,
  belongs_to: 2.0,
  has_one: 2.0,
  has_many_through: 1.8,
  polymorphic: 1.5,
  schema_fk: 2.0,
  routes_to: 1.5,
  convention_pair: 1.5,
  renders_component: 1.5,
  attaches_stimulus: 1.0,
  manages_attachment: 1.0,
  sends_mail: 1.0,
  enqueues_job: 1.0,
  broadcasts_to: 1.5,
  authorizes_via: 1.5,
  serializes: 1.5,
  validates_with: 0.5,
  delegates_to: 1.0,
  contains: 0.5,
  references: 1.0,
  tests: 1.0,
  helps_view: 0.5,
  manages_upload: 1.0,
  inherited_dependency: 1.5,
}

export class Graph {
  constructor() {
    /** @type {Map<string, {id: string, type: string, label: string}>} */
    this.nodes = new Map()
    /** @type {Array<{from: string, to: string, type: string, weight: number}>} */
    this.edges = []
    /** @type {Map<string, Array<{to: string, weight: number, type: string}>>} */
    this.adjacency = new Map()
    /** @type {Map<string, Array<{from: string, weight: number, type: string}>>} */
    this.reverseAdjacency = new Map()
  }

  /**
   * Add a node to the graph.
   * @param {string} id
   * @param {string} type - e.g. 'model', 'controller', 'view'
   * @param {string} [label]
   */
  addNode(id, type, label) {
    if (!this.nodes.has(id)) {
      this.nodes.set(id, { id, type, label: label || id })
      this.adjacency.set(id, [])
      this.reverseAdjacency.set(id, [])
    }
  }

  /**
   * Add a directed edge between nodes.
   * @param {string} from
   * @param {string} to
   * @param {string} type - One of EDGE_WEIGHTS keys
   */
  addEdge(from, to, type) {
    const weight = EDGE_WEIGHTS[type] || 1.0
    // Ensure nodes exist
    if (!this.nodes.has(from)) this.addNode(from, 'unknown')
    if (!this.nodes.has(to)) this.addNode(to, 'unknown')

    this.edges.push({ from, to, type, weight })
    this.adjacency.get(from).push({ to, weight, type })
    if (!this.reverseAdjacency.has(to)) this.reverseAdjacency.set(to, [])
    this.reverseAdjacency.get(to).push({ from, weight, type })
  }

  /**
   * BFS traversal from seed nodes through forward and reverse adjacency.
   * @param {string[]} seedIds - Starting entity IDs
   * @param {number} [maxDepth=3] - Maximum BFS hops
   * @param {Object} [options]
   * @param {Set<string>} [options.excludeEdgeTypes] - Edge types to skip
   * @param {number} [options.minEdgeWeight] - Minimum edge weight to traverse (default 0)
   * @returns {Array<{entity: string, distance: number, reachedVia: string, edgeType: string, direction: string}>}
   */
  bfsFromSeeds(seedIds, maxDepth = 3, options = {}) {
    const { excludeEdgeTypes = new Set(), minEdgeWeight = 0 } = options
    const visited = new Set()
    const results = []
    const queue = []

    for (const id of seedIds) {
      if (this.nodes.has(id)) {
        visited.add(id)
        queue.push({
          entity: id,
          distance: 0,
          reachedVia: null,
          edgeType: null,
          direction: null,
        })
      }
    }

    while (queue.length > 0) {
      const current = queue.shift()
      if (current.distance > 0) {
        results.push(current)
      }
      if (current.distance >= maxDepth) continue

      this._enqueueNeighbours(
        current,
        'forward',
        visited,
        queue,
        excludeEdgeTypes,
        minEdgeWeight,
      )
      this._enqueueNeighbours(
        current,
        'reverse',
        visited,
        queue,
        excludeEdgeTypes,
        minEdgeWeight,
      )
    }

    return results
  }

  /** @private */
  _enqueueNeighbours(
    current,
    direction,
    visited,
    queue,
    excludeEdgeTypes,
    minEdgeWeight,
  ) {
    const neighbours =
      direction === 'forward'
        ? this.adjacency.get(current.entity) || []
        : this.reverseAdjacency.get(current.entity) || []

    for (const edge of neighbours) {
      const neighbour = direction === 'forward' ? edge.to : edge.from
      const edgeType = edge.type
      if (visited.has(neighbour)) continue
      if (excludeEdgeTypes.has(edgeType)) continue
      if (edge.weight < minEdgeWeight) continue

      visited.add(neighbour)
      queue.push({
        entity: neighbour,
        distance: current.distance + 1,
        reachedVia: current.entity,
        edgeType,
        direction,
      })
    }
  }

  /**
   * Personalized PageRank via power iteration.
   *
   * Computes the importance of each node in the graph using an iterative
   * algorithm. The personalization map biases the "random surfer" toward
   * specific nodes (e.g. skill-relevant entities), so results are scoped
   * to a domain rather than purely structural.
   *
   * Algorithm:
   *   rank(v) = (1 - d) * p(v) + d * Σ [rank(u) * w(u→v) / Σw(u→*)]
   * where d = damping factor, p(v) = personalization weight (normalized).
   *
   * @param {Object} [personalization] - Map of node id → bias weight (default: uniform)
   * @param {number} [damping=0.85] - Probability of following a link (vs teleporting)
   * @param {number} [maxIter=50] - Maximum power-iteration rounds
   * @param {number} [tolerance=1e-6] - L1-norm convergence threshold
   * @returns {Map<string, number>} Node id → rank score
   */
  personalizedPageRank(
    personalization = {},
    damping = 0.85,
    maxIter = 50,
    tolerance = 1e-6,
  ) {
    const n = this.nodes.size
    if (n === 0) return new Map()

    const nodeIds = [...this.nodes.keys()]
    const idxMap = new Map(nodeIds.map((id, i) => [id, i]))

    // Build personalization vector
    const pVec = new Float64Array(n)
    let pSum = 0
    for (const id of nodeIds) {
      const val = personalization[id] || 1.0
      pVec[idxMap.get(id)] = val
      pSum += val
    }
    // Normalize
    for (let i = 0; i < n; i++) pVec[i] /= pSum

    // Initialize ranks uniformly
    let ranks = new Float64Array(n).fill(1 / n)

    for (let iter = 0; iter < maxIter; iter++) {
      const newRanks = new Float64Array(n)

      // Teleport component: with probability (1-d), jump to a random node
      // weighted by the personalization vector instead of following links
      for (let i = 0; i < n; i++) {
        newRanks[i] = (1 - damping) * pVec[i]
      }

      // Link component: propagate rank along weighted edges
      for (const id of nodeIds) {
        const idx = idxMap.get(id)
        const outEdges = this.adjacency.get(id)
        if (outEdges.length === 0) {
          // Dangling node (no outgoing edges): redistribute its rank to all
          // nodes proportionally to the personalization vector, preventing
          // rank from being "trapped" in dead-end nodes
          for (let i = 0; i < n; i++) {
            newRanks[i] += damping * ranks[idx] * pVec[i]
          }
        } else {
          // Distribute rank to neighbours weighted by edge strength
          const totalWeight = outEdges.reduce((s, e) => s + e.weight, 0)
          for (const edge of outEdges) {
            const toIdx = idxMap.get(edge.to)
            newRanks[toIdx] +=
              damping * ranks[idx] * (edge.weight / totalWeight)
          }
        }
      }

      // Convergence check: stop early if L1-norm change is below tolerance
      let diff = 0
      for (let i = 0; i < n; i++) diff += Math.abs(newRanks[i] - ranks[i])
      ranks = newRanks
      if (diff < tolerance) break
    }

    // Convert to Map
    const result = new Map()
    for (const id of nodeIds) {
      result.set(id, ranks[idxMap.get(id)])
    }
    return result
  }
}

/**
 * Extract class_name override from association options string.
 * @param {string|null} options - Raw options string from extractor
 * @returns {string|null} Class name or null
 */
function extractClassName(options) {
  if (!options || typeof options !== 'string') return null
  // Modern syntax: class_name: 'AdminUser' or class_name: "AdminUser"
  const modern = options.match(/class_name:\s*['"](\w+(?:::\w+)*)['"]/)
  if (modern) return modern[1]
  // Hash rocket: :class_name => 'AdminUser' or class_name => 'AdminUser'
  const rocket = options.match(/:?class_name\s*=>\s*['"](\w+(?:::\w+)*)['"]/)
  if (rocket) return rocket[1]
  // Unquoted (rare but valid): class_name: AdminUser
  const unquoted = options.match(/class_name:\s*([A-Z]\w+(?:::\w+)*)/)
  if (unquoted) return unquoted[1]
  return null
}

/**
 * Build a graph from index extractions.
 * @param {object} extractions - All extraction results
 * @param {object} manifest - Scanner manifest with entries
 * @param {string[]} [skills] - Skill-relevant file patterns for personalization
 * @returns {{graph: Graph, relationships: Array, rankings: object}}
 */
export function buildGraph(extractions, manifest, skills = []) {
  const graph = new Graph()
  const relationships = []

  // Add model nodes and relationships
  if (extractions.models) {
    for (const [name, model] of Object.entries(extractions.models)) {
      graph.addNode(name, 'model', name)

      // Inheritance
      if (model.superclass && model.superclass !== 'ApplicationRecord') {
        graph.addEdge(name, model.superclass, 'inherits')
        relationships.push({
          from: name,
          to: model.superclass,
          type: 'inherits',
        })
      }

      // Associations
      if (model.associations) {
        for (const assoc of model.associations) {
          const type = (assoc.type || assoc.macro || '').replace(':', '')
          if (!type) continue

          // Skip phantom edges for polymorphic belongs_to
          if (type === 'belongs_to' && assoc.polymorphic) continue

          const classNameOverride = extractClassName(assoc.options)
          const runtimeClassName = assoc.class_name
          const target =
            runtimeClassName || classNameOverride || classify(assoc.name)
          graph.addNode(target, 'model', target)
          if (EDGE_WEIGHTS[type]) {
            graph.addEdge(name, target, type)
            relationships.push({ from: name, to: target, type })
          }

          // Add join model edge for through associations
          if (assoc.through) {
            const joinModel = classify(assoc.through)
            graph.addNode(joinModel, 'model', joinModel)
            graph.addEdge(name, joinModel, 'has_many')
            relationships.push({ from: name, to: joinModel, type: 'has_many' })
          }
          // Note: polymorphic has_many with `as:` option creates a valid edge
          // to the target model (e.g. has_many :comments, as: :commentable)
        }
      }

      // Concerns
      if (model.concerns) {
        for (const concern of model.concerns) {
          graph.addNode(concern, 'concern', concern)
          graph.addEdge(name, concern, 'includes_concern')
          relationships.push({
            from: name,
            to: concern,
            type: 'includes_concern',
          })
        }
      }

      // Delegations
      if (model.delegations) {
        for (const del of model.delegations) {
          if (del.to) {
            const target = classify(del.to)
            graph.addEdge(name, target, 'delegates_to')
            relationships.push({ from: name, to: target, type: 'delegates_to' })
          }
        }
      }
    }
  }

  // Controller → Model convention pairs
  if (extractions.controllers) {
    for (const [name, ctrl] of Object.entries(extractions.controllers)) {
      graph.addNode(name, 'controller', name)
      // Convention: PostsController → Post model (use base name, ignoring namespace prefix)
      const baseName = name.split('::').pop()
      const modelName = baseName.replace(/Controller$/, '').replace(/s$/, '')

      // Skip convention_pair for namespaced controllers if an un-namespaced version exists
      if (name.includes('::') && extractions.controllers[baseName]) {
        continue
      }

      if (extractions.models && extractions.models[modelName]) {
        graph.addEdge(name, modelName, 'convention_pair')
        relationships.push({
          from: name,
          to: modelName,
          type: 'convention_pair',
        })
      }
    }
  }

  // Inherited callback dependencies
  if (extractions.controllers) {
    for (const [name, ctrl] of Object.entries(extractions.controllers)) {
      const callbacks = ctrl.filters || ctrl.callbacks || []
      for (const cb of callbacks) {
        if (!cb.inherited) continue
        const filter = cb.filter || cb.method || ''
        // authenticate_user! → User model convention
        const modelMatch = filter.match(/^(?:authenticate|require)_(\w+?)!?$/)
        if (modelMatch) {
          const modelName = classify(modelMatch[1])
          if (extractions.models && extractions.models[modelName]) {
            graph.addEdge(name, modelName, 'inherited_dependency')
            relationships.push({
              from: name,
              to: modelName,
              type: 'inherited_dependency',
            })
          }
        }
      }
    }
  }

  // Routes → Controller
  if (extractions.routes && extractions.routes.routes) {
    for (const route of extractions.routes.routes) {
      if (route.controller) {
        const ctrlName = classify(route.controller) + 'Controller'
        graph.addEdge('routes', ctrlName, 'routes_to')
        relationships.push({ from: 'routes', to: ctrlName, type: 'routes_to' })
      }
    }
  }

  // Schema foreign keys
  if (extractions.schema && extractions.schema.foreign_keys) {
    for (const fk of extractions.schema.foreign_keys) {
      graph.addEdge(fk.from_table, fk.to_table, 'schema_fk')
      relationships.push({
        from: fk.from_table,
        to: fk.to_table,
        type: 'schema_fk',
      })
    }
  }

  // Spec → Source relationships (test files → tested entities)
  if (extractions.test_conventions) {
    const specEntries =
      manifest.entries?.filter(
        (e) =>
          e.category === 19 &&
          (e.path.endsWith('_spec.rb') ||
            (e.specCategory && e.path.endsWith('_test.rb'))),
      ) || []

    for (const entry of specEntries) {
      // Derive the model/controller name from the spec path
      const isTest = entry.path.endsWith('_test.rb')
      const basename = entry.path
        .split('/')
        .pop()
        .replace(isTest ? '_test.rb' : '_spec.rb', '')
      const className = classify(basename)

      if (
        entry.specCategory === 'model_specs' ||
        entry.specCategory === 'model_tests'
      ) {
        if (extractions.models && extractions.models[className]) {
          const nodePrefix = isTest ? 'test' : 'spec'
          graph.addNode(
            `${nodePrefix}:${className}`,
            nodePrefix,
            `${className} ${nodePrefix}`,
          )
          graph.addEdge(`${nodePrefix}:${className}`, className, 'tests')
          relationships.push({
            from: `${nodePrefix}:${className}`,
            to: className,
            type: 'tests',
          })
        }
      } else if (
        entry.specCategory === 'request_specs' ||
        entry.specCategory === 'controller_specs' ||
        entry.specCategory === 'controller_tests'
      ) {
        const nodePrefix = isTest ? 'test' : 'spec'
        // Controller names are plural (UsersController), so don't singularize
        const ctrlBaseName = basename
          .replace('_controller', '')
          .split('_')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join('')
        const ctrlName = ctrlBaseName + 'Controller'
        if (extractions.controllers && extractions.controllers[ctrlName]) {
          graph.addNode(
            `${nodePrefix}:${ctrlName}`,
            nodePrefix,
            `${ctrlName} ${nodePrefix}`,
          )
          graph.addEdge(`${nodePrefix}:${ctrlName}`, ctrlName, 'tests')
          relationships.push({
            from: `${nodePrefix}:${ctrlName}`,
            to: ctrlName,
            type: 'tests',
          })
        }
      } else if (!isTest) {
        // Legacy RSpec path (no specCategory but ends in _spec.rb)
        if (
          entry.specCategory === 'request_specs' ||
          entry.specCategory === 'controller_specs'
        ) {
          const ctrlBaseName = basename
            .split('_')
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join('')
          const ctrlName = ctrlBaseName + 'Controller'
          if (extractions.controllers && extractions.controllers[ctrlName]) {
            graph.addNode(`spec:${ctrlName}`, 'spec', `${ctrlName} spec`)
            graph.addEdge(`spec:${ctrlName}`, ctrlName, 'tests')
            relationships.push({
              from: `spec:${ctrlName}`,
              to: ctrlName,
              type: 'tests',
            })
          }
        }
      }
    }
  }

  // Build personalization from skills
  const personalization = {}
  if (skills.length > 0 && manifest && manifest.entries) {
    for (const entry of manifest.entries) {
      for (const skill of skills) {
        if (entry.path.includes(skill)) {
          personalization[entry.path] = 3.0
        }
      }
    }
  }

  // Helpers → Controllers (by naming convention)
  if (extractions.helpers) {
    for (const [name, helper] of Object.entries(extractions.helpers)) {
      graph.addNode(name, 'helper', name)
      if (
        helper.controller &&
        extractions.controllers &&
        extractions.controllers[helper.controller]
      ) {
        graph.addEdge(name, helper.controller, 'helps_view')
        relationships.push({
          from: name,
          to: helper.controller,
          type: 'helps_view',
        })
      }
    }
  }

  // Workers — add as nodes (same category as jobs)
  if (extractions.workers) {
    for (const [name, worker] of Object.entries(extractions.workers)) {
      graph.addNode(name, 'worker', name)
    }
  }

  // Uploaders → Models (via mount_uploader cross-reference)
  if (extractions.uploaders?.mounted) {
    for (const mount of extractions.uploaders.mounted) {
      const uploaderClass = mount.uploader
      if (extractions.uploaders.uploaders?.[uploaderClass]) {
        graph.addNode(uploaderClass, 'uploader', uploaderClass)
        graph.addEdge(mount.model, uploaderClass, 'manages_upload')
        relationships.push({
          from: mount.model,
          to: uploaderClass,
          type: 'manages_upload',
        })
      }
    }
  }

  // Compute PageRank
  const rankMap = graph.personalizedPageRank(personalization)
  const rankings = {}
  for (const [id, score] of rankMap) {
    rankings[id] = Math.round(score * RANK_PRECISION) / RANK_PRECISION
  }

  return { graph, relationships, rankings }
}

/**
 * Convert a snake_case or plural string to a PascalCase singular class name.
 * @param {string} str
 * @returns {string}
 */
export function classify(str) {
  return inflectorClassify(str)
}
