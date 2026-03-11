/**
 * Graph Builder + Personalized PageRank
 * Builds a relationship graph from extractions and computes
 * skill-personalized PageRank rankings.
 */

/** Edge type weights */
const EDGE_WEIGHTS = {
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
}

export class Graph {
  constructor() {
    /** @type {Map<string, {id: string, type: string, label: string}>} */
    this.nodes = new Map()
    /** @type {Array<{from: string, to: string, type: string, weight: number}>} */
    this.edges = []
    /** @type {Map<string, Array<{to: string, weight: number}>>} */
    this.adjacency = new Map()
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
    this.adjacency.get(from).push({ to, weight })
  }

  /**
   * Personalized PageRank via power iteration.
   * @param {Object} [personalization] - Map of node id → bias weight
   * @param {number} [damping=0.85]
   * @param {number} [maxIter=50]
   * @param {number} [tolerance=1e-6]
   * @returns {Map<string, number>}
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

      // Teleport component
      for (let i = 0; i < n; i++) {
        newRanks[i] = (1 - damping) * pVec[i]
      }

      // Link component
      for (const id of nodeIds) {
        const idx = idxMap.get(id)
        const outEdges = this.adjacency.get(id)
        if (outEdges.length === 0) {
          // Dangling node: distribute rank to all nodes via personalization
          for (let i = 0; i < n; i++) {
            newRanks[i] += damping * ranks[idx] * pVec[i]
          }
        } else {
          const totalWeight = outEdges.reduce((s, e) => s + e.weight, 0)
          for (const edge of outEdges) {
            const toIdx = idxMap.get(edge.to)
            newRanks[toIdx] +=
              damping * ranks[idx] * (edge.weight / totalWeight)
          }
        }
      }

      // Check convergence
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
          const target = classify(assoc.name)
          graph.addNode(target, 'model', target)
          const type = assoc.type.replace(':', '')
          if (EDGE_WEIGHTS[type]) {
            graph.addEdge(name, target, type)
            relationships.push({ from: name, to: target, type })
          }
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
      // Convention: PostsController → Post model
      const modelName = name.replace(/Controller$/, '').replace(/s$/, '')
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

  // Compute PageRank
  const rankMap = graph.personalizedPageRank(personalization)
  const rankings = {}
  for (const [id, score] of rankMap) {
    rankings[id] = Math.round(score * 10000) / 10000
  }

  return { graph, relationships, rankings }
}

/**
 * Convert a snake_case string to CamelCase.
 * @param {string} str
 * @returns {string}
 */
function classify(str) {
  return str
    .split(/[_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('')
}
