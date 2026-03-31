/**
 * Blast Radius Engine
 * Computes impact analysis for code changes using BFS traversal
 * through RailsInsight's relationship graph.
 */

/**
 * @typedef {Object} BlastRadiusSeed
 * @property {string} file - Changed file path
 * @property {string} entity - Mapped graph entity name
 * @property {string} type - Entity type (model, controller, etc.)
 * @property {string} status - Git change status (added, modified, deleted)
 */

/**
 * @typedef {Object} BlastRadiusImpact
 * @property {string} entity - Impacted entity name
 * @property {string} type - Entity type
 * @property {'CRITICAL'|'HIGH'|'MEDIUM'|'LOW'} risk - Risk classification
 * @property {number} distance - BFS hops from nearest seed
 * @property {string} reachedVia - Entity that led to this one
 * @property {string} edgeType - Graph edge type traversed
 */

/**
 * @typedef {Object} BlastRadiusResult
 * @property {BlastRadiusSeed[]} seeds - Changed file → entity mappings
 * @property {BlastRadiusImpact[]} impacted - Entities affected by the change
 * @property {BlastRadiusImpact[]} impactedTests - Test files affected
 * @property {Object} summary - Counts per risk level
 * @property {string[]} warnings - Unmapped files or other notes
 */

import { EDGE_WEIGHTS } from './graph.js'
import {
  estimateTokens,
  estimateTokensForObject,
} from '../utils/token-counter.js'
import { DEFAULT_TOKEN_BUDGET } from './constants.js'

const RISK_LEVELS = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
const STRONG_EDGE_THRESHOLD = 2.0
const AUTH_ENTITY_PATTERNS = /devise|authenticat|authorization|pundit|cancan/i

/**
 * Compute the blast radius for a set of changed files.
 * @param {Object} index - Full RailsInsight index
 * @param {Array<{path: string, status: string}>} changedFiles
 * @param {Object} [options]
 * @param {number} [options.maxDepth] - BFS depth limit (default: 3)
 * @param {number} [options.tokenBudget] - Token budget for response (default: 8000)
 * @returns {BlastRadiusResult}
 */
export function computeBlastRadius(index, changedFiles, options = {}) {
  const { maxDepth = 3 } = options

  if (!changedFiles || changedFiles.length === 0) {
    return emptyResult('No changes detected')
  }

  const fileEntityMap = index.fileEntityMap || {}
  const seeds = mapFilesToSeeds(changedFiles, fileEntityMap)
  const warnings = collectUnmappedWarnings(changedFiles, fileEntityMap)

  if (seeds.length === 0) {
    return {
      seeds: [],
      impacted: [],
      impactedTests: [],
      summary: buildSummary([]),
      warnings,
    }
  }

  const graph = index.graph
  if (!graph) {
    return emptyResult('No graph available — re-index required')
  }
  const seedIds = extractSeedIds(seeds, index)
  const bfsResults = graph.bfsFromSeeds(seedIds, maxDepth, {
    excludeEdgeTypes: new Set(['contains', 'tests']),
  })

  const impacted = buildImpactedEntities(bfsResults, seeds, index)
  const escalated = escalateRailsSpecificRisks(impacted, seeds, index)
  const deduplicated = deduplicateByHighestRisk(escalated)
  const sorted = sortByRisk(deduplicated)
  const impactedTests = collectImpactedTests(sorted, seeds, graph, index)

  return {
    seeds,
    impacted: sorted,
    impactedTests,
    summary: buildSummary(sorted),
    warnings,
  }
}

/**
 * Classify risk level for an impacted entity based on graph distance,
 * edge strength, and Rails-specific security heuristics.
 *
 * Risk escalation rules (evaluated top-to-bottom, first match wins):
 * - Distance 0 (the changed entity itself) → always CRITICAL
 * - Auth-related entities at distance ≤1 → HIGH (security-sensitive)
 * - Schema changes propagating to distance ≤1 → CRITICAL (column/table changes break dependents)
 * - Distance 1 via strong edge (weight ≥ 2.0, e.g. has_many, belongs_to, inherits) → HIGH
 * - Distance 1 via weak edge → MEDIUM
 * - Distance 2 via strong edge → MEDIUM
 * - Everything else ≤2 → LOW
 * - Distance 3+ → LOW
 *
 * @param {Object} entity - BFS result entity with { distance, edgeType }
 * @param {Object} seedInfo - Information about the seed (changed) entity
 * @param {Object} index - Full RailsInsight index for entity lookups
 * @returns {'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'}
 */
export function classifyRisk(entity, seedInfo, index) {
  // The changed entity itself is always critical
  if (entity.distance === 0) return 'CRITICAL'

  // Auth/authorization entities are security-sensitive — escalate direct neighbours
  if (isAuthRelated(entity, index) && entity.distance <= 1) return 'HIGH'
  // Schema changes (columns, tables) break all direct dependents
  if (isSchemaChange(seedInfo) && entity.distance <= 1) return 'CRITICAL'

  const edgeWeight = EDGE_WEIGHTS[entity.edgeType] || 1.0
  // Strong edges (≥2.0) are structural relationships like associations and inheritance
  const isStrongEdge = edgeWeight >= STRONG_EDGE_THRESHOLD

  if (entity.distance === 1 && isStrongEdge) return 'HIGH'
  if (entity.distance === 1) return 'MEDIUM'
  if (entity.distance === 2 && isStrongEdge) return 'MEDIUM'
  if (entity.distance <= 2) return 'LOW'
  return 'LOW'
}

/**
 * Build a review context summary within a token budget.
 * @param {Object} index - Full RailsInsight index
 * @param {BlastRadiusResult} blastResult - Output of computeBlastRadius
 * @param {number} [tokenBudget=8000]
 * @returns {Object}
 */
export function buildReviewContext(
  index,
  blastResult,
  tokenBudget = DEFAULT_TOKEN_BUDGET,
) {
  const context = {
    seeds: blastResult.seeds,
    summary: blastResult.summary,
    warnings: blastResult.warnings,
    entities: [],
  }

  const headerTokens = estimateTokensForObject({
    seeds: context.seeds,
    summary: context.summary,
    warnings: context.warnings,
  })
  let remainingBudget = tokenBudget - headerTokens

  const grouped = groupByRisk(blastResult.impacted)

  for (const risk of RISK_LEVELS) {
    const entities = grouped[risk] || []
    for (const entity of entities) {
      const summary = buildEntitySummary(entity, index)
      const tokens = estimateTokensForObject(summary)

      if (tokens <= remainingBudget) {
        context.entities.push(summary)
        remainingBudget -= tokens
      } else {
        const compact = compactEntitySummary(entity)
        const compactTokens = estimateTokensForObject(compact)
        if (compactTokens <= remainingBudget) {
          context.entities.push(compact)
          remainingBudget -= compactTokens
        }
      }
    }
  }

  return context
}

// --- Private helpers ---

function emptyResult(message) {
  return {
    seeds: [],
    impacted: [],
    impactedTests: [],
    summary: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, total: 0 },
    warnings: [],
    message,
  }
}

function mapFilesToSeeds(changedFiles, fileEntityMap) {
  const seeds = []
  for (const file of changedFiles) {
    const mapping = fileEntityMap[file.path]
    if (mapping) {
      seeds.push({
        path: file.path,
        entity: mapping.entity,
        type: mapping.type,
        status: file.status,
      })
    }
  }
  return seeds
}

function collectUnmappedWarnings(changedFiles, fileEntityMap) {
  const warnings = []
  for (const file of changedFiles) {
    if (!fileEntityMap[file.path]) {
      warnings.push(`Unmapped file: ${file.path}`)
    } else if (fileEntityMap[file.path]?.entity === '__gemfile__') {
      warnings.push('Gemfile change — dependency blast radius unknown')
    }
  }
  return warnings
}

function extractSeedIds(seeds, index) {
  const ids = []
  for (const seed of seeds) {
    if (seed.entity === '__schema__') {
      addSchemaSeeds(ids, index)
    } else if (seed.entity === '__routes__') {
      addRouteSeeds(ids, index)
    } else if (seed.entity === '__gemfile__') {
      continue
    } else {
      ids.push(seed.entity)
    }
  }
  return [...new Set(ids)]
}

function addSchemaSeeds(ids, index) {
  const models = index.extractions?.models || {}
  for (const name of Object.keys(models)) {
    ids.push(name)
  }
}

function addRouteSeeds(ids, index) {
  const controllers = index.extractions?.controllers || {}
  for (const name of Object.keys(controllers)) {
    ids.push(name)
  }
}

function buildImpactedEntities(bfsResults, seeds, index) {
  const fileEntityMap = index.fileEntityMap || {}
  const reverseMap = buildReverseEntityFileMap(fileEntityMap)

  return bfsResults.map((result) => {
    const nodeInfo = findEntityInfo(result.entity, index)
    const seedInfo = findSeedForEntity(result.reachedVia, seeds, index)
    const risk = classifyRisk(result, seedInfo, index)

    return {
      entity: result.entity,
      type: nodeInfo?.type || 'unknown',
      risk,
      distance: result.distance,
      reachedVia: result.reachedVia,
      edgeType: result.edgeType,
      file: reverseMap[result.entity] || null,
      reason: buildReason(result, risk),
    }
  })
}

export function buildReverseEntityFileMap(fileEntityMap) {
  const reverse = {}
  for (const [path, mapping] of Object.entries(fileEntityMap)) {
    const existing = reverse[mapping.entity]
    if (!existing) {
      reverse[mapping.entity] = path
    } else {
      // Prefer source files (controllers/models/jobs/etc.) over view/template files
      const isSourceFile =
        path.startsWith('app/controllers/') ||
        path.startsWith('app/models/') ||
        path.startsWith('app/jobs/') ||
        path.startsWith('app/mailers/') ||
        path.startsWith('app/services/')
      const existingIsSource =
        existing.startsWith('app/controllers/') ||
        existing.startsWith('app/models/') ||
        existing.startsWith('app/jobs/') ||
        existing.startsWith('app/mailers/') ||
        existing.startsWith('app/services/')
      if (isSourceFile && !existingIsSource) {
        reverse[mapping.entity] = path
      }
    }
  }
  return reverse
}

function findEntityInfo(entityId, index) {
  const models = index.extractions?.models || {}
  if (models[entityId]) return { type: 'model', data: models[entityId] }

  const controllers = index.extractions?.controllers || {}
  if (controllers[entityId])
    return { type: 'controller', data: controllers[entityId] }

  const components = index.extractions?.components || {}
  if (components[entityId])
    return { type: 'component', data: components[entityId] }

  if (entityId.startsWith('spec:')) return { type: 'spec', data: null }
  return null
}

function findSeedForEntity(reachedVia, seeds, index) {
  const seed = seeds.find((s) => s.entity === reachedVia)
  if (seed) return seed
  return seeds[0] || {}
}

function isAuthRelated(entity, index) {
  if (AUTH_ENTITY_PATTERNS.test(entity.entity)) return true
  const models = index.extractions?.models || {}
  const model = models[entity.entity]
  if (model?.concerns?.some((c) => AUTH_ENTITY_PATTERNS.test(c))) return true
  return false
}

function isSchemaChange(seedInfo) {
  return seedInfo?.type === 'schema' || seedInfo?.entity === '__schema__'
}

function buildReason(result, risk) {
  if (result.distance === 0) return 'Direct change'
  return `Reachable from ${result.reachedVia} via ${result.edgeType} (distance ${result.distance})`
}

function escalateRailsSpecificRisks(impacted, seeds, index) {
  const hasConcernSeed = seeds.some((s) => s.type === 'concern')
  const hasSchemaChange = seeds.some((s) => s.type === 'schema')
  const hasAuthChange = seeds.some((s) => isAuthRelatedSeed(s, index))

  return impacted.map((entity) => {
    let risk = entity.risk

    if (
      hasConcernSeed &&
      entity.distance <= 1 &&
      RISK_LEVELS.indexOf(risk) > RISK_LEVELS.indexOf('HIGH')
    ) {
      risk = 'HIGH'
    }

    if (hasSchemaChange && entity.type === 'model' && entity.distance <= 1) {
      risk = 'CRITICAL'
    }

    if (hasAuthChange && isAuthRelated(entity, index) && entity.distance <= 1) {
      risk = 'HIGH'
    }

    return { ...entity, risk }
  })
}

function isAuthRelatedSeed(seed, index) {
  if (AUTH_ENTITY_PATTERNS.test(seed.entity)) return true
  const models = index.extractions?.models || {}
  const model = models[seed.entity]
  if (model?.devise_modules?.length > 0) return true
  return false
}

function deduplicateByHighestRisk(entities) {
  const byEntity = new Map()
  for (const entity of entities) {
    const existing = byEntity.get(entity.entity)
    if (
      !existing ||
      RISK_LEVELS.indexOf(entity.risk) < RISK_LEVELS.indexOf(existing.risk)
    ) {
      byEntity.set(entity.entity, entity)
    }
  }
  return [...byEntity.values()]
}

function sortByRisk(entities) {
  return entities.sort((a, b) => {
    const riskDiff = RISK_LEVELS.indexOf(a.risk) - RISK_LEVELS.indexOf(b.risk)
    if (riskDiff !== 0) return riskDiff
    return a.distance - b.distance
  })
}

function collectImpactedTests(impacted, seeds, graph, index) {
  const tests = []
  const seen = new Set()
  const allEntityIds = [
    ...seeds.map((s) => s.entity),
    ...impacted.map((e) => e.entity),
  ]

  for (const edge of graph.edges) {
    if (edge.type !== 'tests') continue
    if (allEntityIds.includes(edge.to) && !seen.has(edge.from)) {
      seen.add(edge.from)
      const fileEntityMap = index.fileEntityMap || {}
      const reverseMap = buildReverseEntityFileMap(fileEntityMap)
      tests.push({
        path: reverseMap[edge.from] || edge.from,
        entity: edge.from,
        covers: edge.to,
      })
    }
  }

  return tests
}

function buildSummary(impacted) {
  const summary = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, total: 0 }
  for (const entity of impacted) {
    summary[entity.risk] = (summary[entity.risk] || 0) + 1
    summary.total++
  }
  return summary
}

function groupByRisk(impacted) {
  const grouped = {}
  for (const entity of impacted) {
    if (!grouped[entity.risk]) grouped[entity.risk] = []
    grouped[entity.risk].push(entity)
  }
  return grouped
}

function buildEntitySummary(entity, index) {
  const extractions = index.extractions || {}
  const detail = lookupEntityDetail(entity.entity, entity.type, extractions)

  return {
    entity: entity.entity,
    type: entity.type,
    risk: entity.risk,
    distance: entity.distance,
    reason: entity.reason,
    file: entity.file,
    summary: formatStructuralSummary(entity.entity, entity.type, detail),
  }
}

function compactEntitySummary(entity) {
  return {
    entity: entity.entity,
    type: entity.type,
    risk: entity.risk,
  }
}

function lookupEntityDetail(entityName, entityType, extractions) {
  if (entityType === 'model') return extractions.models?.[entityName]
  if (entityType === 'controller') return extractions.controllers?.[entityName]
  if (entityType === 'component') return extractions.components?.[entityName]
  return null
}

function formatStructuralSummary(name, type, detail) {
  if (!detail) return `${name} (${type})`

  if (type === 'model') return formatModelSummary(name, detail)
  if (type === 'controller') return formatControllerSummary(name, detail)
  if (type === 'component') return formatComponentSummary(name, detail)
  return `${name} (${type})`
}

function formatModelSummary(name, model) {
  const parts = [name]
  const assocCount = (model.associations || []).length
  if (assocCount > 0) parts.push(`${assocCount} associations`)
  if (model.has_secure_password) parts.push('has_secure_password')
  const scopeCount = (model.scopes || []).length
  if (scopeCount > 0) parts.push(`${scopeCount} scopes`)
  const callbackCount = (model.callbacks || []).length
  if (callbackCount > 0) parts.push(`${callbackCount} callbacks`)
  return parts.join(' — ')
}

function formatControllerSummary(name, controller) {
  const parts = [name]
  const actionCount = (controller.actions || []).length
  if (actionCount > 0) parts.push(`${actionCount} actions`)
  const filters = controller.before_actions || controller.filters || []
  if (filters.length > 0) parts.push(filters.map((f) => f.method || f.name || JSON.stringify(f)).join(', '))
  return parts.join(' — ')
}

function formatComponentSummary(name, component) {
  const parts = [name]
  const slotCount = (component.slots || []).length
  if (slotCount > 0) parts.push(`${slotCount} slots`)
  if (component.has_preview) parts.push('has preview')
  return parts.join(' — ')
}
