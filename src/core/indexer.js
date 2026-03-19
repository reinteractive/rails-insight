/**
 * Core Indexer Orchestrator
 * Wires all 6 layers together into a complete index.
 */

import { loadProjectContext } from './context-loader.js'
import { detectVersions } from './version-detector.js'
import { scanStructure } from './scanner.js'
import { buildGraph } from './graph.js'
import { detectDrift } from './drift-detector.js'
import { extractGemfile } from '../extractors/gemfile.js'
import { extractModel } from '../extractors/model.js'
import { extractController } from '../extractors/controller.js'
import { extractRoutes } from '../extractors/routes.js'
import { extractSchema } from '../extractors/schema.js'
import { extractComponent } from '../extractors/component.js'
import { extractStimulusController } from '../extractors/stimulus.js'
import { extractViews } from '../extractors/views.js'
import { extractAuth } from '../extractors/auth.js'
import { extractAuthorization } from '../extractors/authorization.js'
import { extractJobs } from '../extractors/jobs.js'
import { extractEmail } from '../extractors/email.js'
import { extractStorage } from '../extractors/storage.js'
import { extractCaching } from '../extractors/caching.js'
import { extractRealtime } from '../extractors/realtime.js'
import { extractApi } from '../extractors/api.js'
import { extractConfig } from '../extractors/config.js'
import { extractTier2 } from '../extractors/tier2.js'
import { extractTier3 } from '../extractors/tier3.js'
import { extractTestConventions } from '../extractors/test-conventions.js'
import { extractFactoryRegistry } from '../extractors/factory-registry.js'
import { extractCoverageSnapshot } from '../extractors/coverage-snapshot.js'
import { pathToClassName } from '../tools/handlers/helpers.js'

/**
 * Build the complete index from a FileProvider.
 * @param {import('../providers/interface.js').FileProvider} provider
 * @param {Object} [options]
 * @param {string} [options.claudeMdPath]
 * @param {string[]} [options.skills]
 * @param {boolean} [options.verbose]
 * @returns {Object} Complete index object
 */
export async function buildIndex(provider, options = {}) {
  // Layer 1: Context
  const context = loadProjectContext(provider, options.claudeMdPath)

  // Layer 2: Versions
  const versions = detectVersions(provider)

  // Layer 3: Manifest
  const manifest = scanStructure(provider)
  const entries = manifest.entries || []

  // Layer 4: Extractors
  const gemInfo = extractGemfile(provider)
  // Convert gems array to object keyed by name for extractor lookups
  const gems = {}
  if (Array.isArray(gemInfo.gems)) {
    for (const g of gemInfo.gems) {
      gems[g.name] = g
    }
  }

  // Extract schema first so it can be passed to auth extractor for cross-referencing
  const schemaData = extractSchema(provider)

  const extractions = {
    gemfile: gemInfo,
    config: extractConfig(provider),
    schema: schemaData,
    routes: extractRoutes(provider),
    views: extractViews(provider, entries),
    auth: extractAuth(provider, entries, { gems }, schemaData),
    authorization: extractAuthorization(
      provider,
      entries,
      { gems },
      schemaData,
    ),
    jobs: extractJobs(provider, entries, { gems }),
    email: extractEmail(provider, entries),
    storage: extractStorage(provider, entries, { gems }),
    caching: extractCaching(provider, entries),
    realtime: extractRealtime(provider, entries, { gems }),
    api: extractApi(provider, entries, { gems }),
    tier2: extractTier2(provider, entries, { gems }),
    tier3: extractTier3(provider, entries, { gems }),
    models: {},
    controllers: {},
    components: {},
    stimulus_controllers: [],
  }

  // Per-file extractors (categoryName is the string label, category is the number)
  for (const entry of entries) {
    if (entry.categoryName === 'models') {
      const className = pathToClassName(entry.path)
      const model = extractModel(provider, entry.path, className)
      if (model) extractions.models[className] = model
    } else if (entry.categoryName === 'controllers') {
      const ctrl = extractController(provider, entry.path)
      if (ctrl) {
        const name = pathToClassName(entry.path)
        extractions.controllers[name] = ctrl
      }
    } else if (entry.categoryName === 'components') {
      const comp = extractComponent(provider, entry.path)
      if (comp) {
        const name = pathToClassName(entry.path)
        extractions.components[name] = comp
      }
    } else if (entry.categoryName === 'stimulus') {
      const sc = extractStimulusController(provider, entry.path)
      if (sc) extractions.stimulus_controllers.push(sc)
    }
  }

  // Test convention and factory analysis
  extractions.test_conventions = extractTestConventions(provider, entries, {
    gems,
  })
  extractions.factory_registry = extractFactoryRegistry(provider, entries)

  // Coverage snapshot (depends on models and controllers being extracted first
  // for method line range cross-referencing)
  extractions.coverage_snapshot = extractCoverageSnapshot(
    provider,
    extractions.models,
    extractions.controllers,
  )

  // Layer 5: Graph + Rankings
  const { relationships, rankings } = buildGraph(
    extractions,
    manifest,
    options.skills,
  )

  // Drift detection
  const drift = detectDrift(context, versions, extractions)

  // File-to-entity mapping for blast radius analysis
  const fileEntityMap = buildFileEntityMap(extractions, manifest)

  // Statistics
  const statistics = computeStatistics(manifest, extractions, relationships)

  return {
    version: '1.0.0',
    generated_at: new Date().toISOString(),
    context,
    versions,
    manifest: {
      entries,
      byCategory: manifest.byCategory,
      stats: manifest.stats,
      total_files: entries.length,
    },
    extractions,
    relationships,
    rankings,
    drift,
    statistics,
    fileEntityMap,
  }
}

/**
 * Build a reverse mapping from file paths to their graph entities.
 * @param {Object} extractions
 * @param {Object} manifest
 * @returns {Object<string, {entity: string, type: string}>}
 */
function buildFileEntityMap(extractions, manifest) {
  const map = {}

  mapEntities(map, extractions.models, 'model')
  mapEntities(map, extractions.controllers, 'controller')
  mapEntities(map, extractions.components, 'component')
  mapStimulusControllers(map, extractions.stimulus_controllers)
  mapConcernFiles(map, extractions, manifest)
  mapSpecialFiles(map, extractions)
  mapViewFiles(map, extractions.controllers, manifest)

  return map
}

/**
 * Map extracted entities (models, controllers, components) to their file paths.
 * @param {Object<string, Object>} map - Accumulator: file path → { entity, type }
 * @param {Object<string, {file?: string}>} entities - Extraction results keyed by name
 * @param {string} type - Entity type label (e.g. 'model', 'controller')
 */
function mapEntities(map, entities, type) {
  if (!entities) return
  for (const [name, entity] of Object.entries(entities)) {
    if (entity.file) map[entity.file] = { entity: name, type }
  }
}

/**
 * Map Stimulus controller files to their controller identifiers.
 * @param {Object<string, Object>} map - Accumulator
 * @param {Array<{file?: string, name?: string}>} controllers - Stimulus extraction results
 */
function mapStimulusControllers(map, controllers) {
  if (!Array.isArray(controllers)) return
  for (const sc of controllers) {
    if (sc.file && sc.name) {
      map[sc.file] = { entity: sc.name, type: 'stimulus_controller' }
    }
  }
}

/**
 * Map concern files from the manifest to their derived class names.
 * @param {Object<string, Object>} map - Accumulator
 * @param {Object} extractions - All extraction results (unused but kept for signature consistency)
 * @param {Object} manifest - Scanner manifest with classified entries
 */
function mapConcernFiles(map, extractions, manifest) {
  const entries = manifest?.entries || []
  for (const entry of entries) {
    if (entry.path.includes('/concerns/') && entry.path.endsWith('.rb')) {
      const className = pathToClassName(entry.path)
      map[entry.path] = { entity: className, type: 'concern' }
    }
  }
}

/** Map well-known singleton files (schema, routes, Gemfile) to fixed entity IDs. */
function mapSpecialFiles(map, extractions) {
  map['db/schema.rb'] = { entity: '__schema__', type: 'schema' }
  map['config/routes.rb'] = { entity: '__routes__', type: 'routes' }
  map['Gemfile'] = { entity: '__gemfile__', type: 'gemfile' }
}

/**
 * Map view templates to their owning controller using Rails directory conventions.
 * e.g. app/views/users/show.html.erb → UsersController
 * @param {Object<string, Object>} map - Accumulator
 * @param {Object<string, Object>} controllers - Extracted controllers keyed by class name
 * @param {Object} manifest - Scanner manifest with classified entries
 */
function mapViewFiles(map, controllers, manifest) {
  const entries = manifest?.entries || []
  for (const entry of entries) {
    if (!entry.path.startsWith('app/views/')) continue
    const parts = entry.path.replace('app/views/', '').split('/')
    if (parts.length < 2) continue
    const controllerSlug = parts[0]
    const className = pathToClassName(controllerSlug + '_controller.rb')
    if (controllers && controllers[className]) {
      map[entry.path] = { entity: className, type: 'view' }
    }
  }
}

/**
 * Compute summary statistics.
 */
function computeStatistics(manifest, extractions, relationships) {
  const entries = manifest.entries || []
  return {
    total_files: entries.length,
    models: Object.keys(extractions.models || {}).length,
    controllers: Object.keys(extractions.controllers || {}).length,
    components: Object.keys(extractions.components || {}).length,
    relationships: relationships.length,
    gems: Array.isArray(extractions.gemfile?.gems)
      ? extractions.gemfile.gems.length
      : Object.keys(extractions.gemfile?.gems || {}).length,
  }
}
