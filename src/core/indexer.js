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
import { extractHelper } from '../extractors/helper.js'
import { extractWorker } from '../extractors/worker.js'
import {
  extractUploader,
  detectMountedUploaders,
} from '../extractors/uploader.js'
import { pathToClassName } from '../tools/handlers/helpers.js'

/**
 * Run an extractor with error boundary. Returns fallback value on failure.
 * @param {string} name - Extractor name for logging
 * @param {Function} extractorFn - Extractor function to call
 * @param {*} fallback - Value to return on error
 * @param {boolean} verbose - Whether to log errors
 * @param {string[]} errors - Array to push error names into
 * @returns {*} Extraction result or fallback
 */
function safeExtract(name, extractorFn, fallback, verbose, errors) {
  try {
    return extractorFn()
  } catch (err) {
    if (verbose) {
      process.stderr.write(
        `[railsinsight] Extractor '${name}' failed: ${err.message}\n`,
      )
    }
    errors.push(name)
    return fallback
  }
}

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
  const extractionErrors = []

  // Layer 1: Context
  const context = loadProjectContext(provider, options.claudeMdPath)

  // Layer 2: Versions
  const versions = detectVersions(provider)

  // Layer 3: Manifest
  const manifest = scanStructure(provider)
  const entries = manifest.entries || []

  // Layer 4: Extractors
  const gemInfo = safeExtract(
    'gemfile',
    () => extractGemfile(provider),
    { gems: [] },
    options.verbose,
    extractionErrors,
  )
  // Convert gems array to object keyed by name for extractor lookups
  const gems = {}
  if (Array.isArray(gemInfo.gems)) {
    for (const g of gemInfo.gems) {
      gems[g.name] = g
    }
  }

  // Extract schema first so it can be passed to auth extractor for cross-referencing
  const schemaData = safeExtract(
    'schema',
    () => extractSchema(provider),
    {},
    options.verbose,
    extractionErrors,
  )

  const extractions = {
    gemfile: gemInfo,
    config: safeExtract(
      'config',
      () => extractConfig(provider),
      {},
      options.verbose,
      extractionErrors,
    ),
    schema: schemaData,
    routes: safeExtract(
      'routes',
      () => extractRoutes(provider),
      {},
      options.verbose,
      extractionErrors,
    ),
    views: safeExtract(
      'views',
      () => extractViews(provider, entries),
      {},
      options.verbose,
      extractionErrors,
    ),
    auth: safeExtract(
      'auth',
      () => extractAuth(provider, entries, { gems }, schemaData),
      {},
      options.verbose,
      extractionErrors,
    ),
    authorization: safeExtract(
      'authorization',
      () => extractAuthorization(provider, entries, { gems }, schemaData),
      {},
      options.verbose,
      extractionErrors,
    ),
    jobs: safeExtract(
      'jobs',
      () => extractJobs(provider, entries, { gems }),
      {},
      options.verbose,
      extractionErrors,
    ),
    email: safeExtract(
      'email',
      () => extractEmail(provider, entries),
      { mailers: [] },
      options.verbose,
      extractionErrors,
    ),
    storage: safeExtract(
      'storage',
      () => extractStorage(provider, entries, { gems }),
      {},
      options.verbose,
      extractionErrors,
    ),
    caching: safeExtract(
      'caching',
      () => extractCaching(provider, entries),
      {},
      options.verbose,
      extractionErrors,
    ),
    realtime: safeExtract(
      'realtime',
      () => extractRealtime(provider, entries, { gems }),
      { channels: [] },
      options.verbose,
      extractionErrors,
    ),
    api: safeExtract(
      'api',
      () => extractApi(provider, entries, { gems }),
      {},
      options.verbose,
      extractionErrors,
    ),
    tier2: safeExtract(
      'tier2',
      () => extractTier2(provider, entries, { gems }),
      {},
      options.verbose,
      extractionErrors,
    ),
    tier3: safeExtract(
      'tier3',
      () => extractTier3(provider, entries, { gems }),
      {},
      options.verbose,
      extractionErrors,
    ),
    models: {},
    controllers: {},
    components: {},
    stimulus_controllers: [],
    helpers: {},
    workers: {},
    uploaders: { uploaders: {}, mounted: [] },
  }

  // Per-file extractors (categoryName is the string label, category is the number)
  for (const entry of entries) {
    if (entry.categoryName === 'models') {
      const model = safeExtract(
        `model:${entry.path}`,
        () => extractModel(provider, entry.path),
        null,
        options.verbose,
        extractionErrors,
      )
      if (model) {
        // Use FQN from the model itself; fall back to path-derived name only if
        // the extractor couldn't detect a class (e.g. concern without class decl)
        const key = model.class || pathToClassName(entry.path)
        extractions.models[key] = model
      }
    } else if (
      entry.categoryName === 'controllers' ||
      (entry.categoryName === 'authentication' &&
        entry.path.includes('_controller.rb'))
    ) {
      const ctrl = safeExtract(
        `controller:${entry.path}`,
        () => extractController(provider, entry.path),
        null,
        options.verbose,
        extractionErrors,
      )
      if (ctrl) {
        // Use the controller's own fully-qualified class name to avoid namespace collisions
        const name = ctrl.class || pathToClassName(entry.path)
        extractions.controllers[name] = ctrl
      }
    } else if (entry.categoryName === 'components') {
      const comp = extractComponent(provider, entry.path)
      if (comp) {
        const name = comp.class || pathToClassName(entry.path)
        extractions.components[name] = comp
      }
    } else if (entry.categoryName === 'stimulus') {
      const sc = extractStimulusController(provider, entry.path)
      if (sc) extractions.stimulus_controllers.push(sc)
    } else if (
      entry.categoryName === 'views' &&
      entry.path.startsWith('app/helpers/')
    ) {
      const helper = extractHelper(provider, entry.path)
      if (helper) extractions.helpers[helper.module] = helper
    } else if (
      entry.categoryName === 'jobs' &&
      entry.workerType === 'sidekiq_native'
    ) {
      const worker = extractWorker(provider, entry.path)
      if (worker) extractions.workers[worker.class] = worker
    } else if (
      entry.categoryName === 'storage' &&
      entry.path.startsWith('app/uploaders/')
    ) {
      const uploader = extractUploader(provider, entry.path)
      if (uploader) extractions.uploaders.uploaders[uploader.class] = uploader
    }
  }

  // Test convention and factory analysis
  extractions.test_conventions = extractTestConventions(provider, entries, {
    gems,
  })
  extractions.factory_registry = extractFactoryRegistry(provider, entries)

  // Cross-reference CarrierWave mount_uploader in models
  extractions.uploaders.mounted = detectMountedUploaders(
    provider,
    extractions.models,
  )

  // Coverage snapshot (depends on models and controllers being extracted first
  // for method line range cross-referencing)
  extractions.coverage_snapshot = extractCoverageSnapshot(
    provider,
    extractions.models,
    extractions.controllers,
  )

  // STI relationships detection
  detectSTIRelationships(extractions.models)

  // Layer 5: Graph + Rankings
  const { graph, relationships, rankings } = buildGraph(
    extractions,
    manifest,
    options.skills,
  )

  // Drift detection
  const drift = detectDrift(context, versions, extractions)

  // PWA detection
  const hasPwa = entries.some((e) => e.pwaFile === true)

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
    graph,
    drift,
    statistics,
    fileEntityMap,
    extraction_errors: extractionErrors,
    pwa: { detected: hasPwa },
  }
}

/**
 * Detect STI (Single Table Inheritance) relationships among extracted models.
 * Marks base classes with sti_base=true and sti_subclasses, and children with sti_parent.
 * @param {Object<string, Object>} models
 */
function detectSTIRelationships(models) {
  const stiSubclasses = {}
  for (const [name, model] of Object.entries(models)) {
    if (
      model.superclass &&
      model.superclass !== 'ApplicationRecord' &&
      models[model.superclass]
    ) {
      if (!stiSubclasses[model.superclass]) stiSubclasses[model.superclass] = []
      stiSubclasses[model.superclass].push(name)
    }
  }
  for (const [baseName, subclasses] of Object.entries(stiSubclasses)) {
    models[baseName].sti_base = true
    models[baseName].sti_subclasses = subclasses
    for (const sub of subclasses) {
      models[sub].sti_parent = baseName
    }
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
  mapEntities(map, extractions.helpers, 'helper')
  mapEntities(map, extractions.workers, 'worker')
  mapUploaderFiles(map, extractions.uploaders?.uploaders)
  mapStimulusControllers(map, extractions.stimulus_controllers)
  mapConcernFiles(map, extractions, manifest)
  mapSpecialFiles(map, extractions)
  mapViewFiles(map, extractions.controllers, manifest)
  mapJobFiles(map, extractions.jobs)
  mapMailerFiles(map, extractions.email)
  mapChannelFiles(map, extractions.realtime)
  mapPolicyFiles(map, manifest)
  mapServiceFiles(map, manifest)
  mapMigrationFiles(map, manifest)

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
 * Map uploader files to their class entities.
 * @param {Object<string, Object>} map - Accumulator
 * @param {Object<string, {file?: string}>} uploaders - Uploader extraction results
 */
function mapUploaderFiles(map, uploaders) {
  if (!uploaders) return
  for (const [name, uploader] of Object.entries(uploaders)) {
    if (uploader.file) map[uploader.file] = { entity: name, type: 'uploader' }
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
 * Derive a Rails controller class name from a view directory path.
 * 'admin/users' → 'Admin::UsersController', 'posts' → 'PostsController'
 * @param {string} viewDir
 * @returns {string}
 */
function deriveControllerClassName(viewDir) {
  const parts = viewDir.split('/')
  const classified = parts.map((segment) =>
    segment
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(''),
  )
  return classified.join('::') + 'Controller'
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
    const relativePath = entry.path.replace('app/views/', '')
    const segments = relativePath.split('/')
    if (segments.length < 2) continue

    const viewDir = segments.slice(0, -1).join('/')
    const ctrlClassName = deriveControllerClassName(viewDir)

    if (controllers && controllers[ctrlClassName]) {
      map[entry.path] = { entity: ctrlClassName, type: 'view' }
    }
  }
}

/**
 * Map job files to their class entities.
 * @param {Object<string, Object>} map - Accumulator
 * @param {Object} jobs - Jobs extraction results
 */
function mapJobFiles(map, jobs) {
  if (!jobs?.jobs) return
  for (const job of jobs.jobs) {
    if (job.file && job.class) {
      // Sidekiq native workers are already mapped as 'worker' via extractions.workers;
      // skip here to avoid overwriting with 'job'
      if (job.type === 'sidekiq_worker') continue
      map[job.file] = { entity: job.class, type: 'job' }
    }
  }
}

/**
 * Map mailer files to their class entities.
 * @param {Object<string, Object>} map - Accumulator
 * @param {Object} email - Email extraction results
 */
function mapMailerFiles(map, email) {
  if (!email?.mailers) return
  for (const mailer of email.mailers) {
    if (mailer.file && mailer.class) {
      map[mailer.file] = { entity: mailer.class, type: 'mailer' }
    }
  }
}

/**
 * Map channel files to their class entities.
 * @param {Object<string, Object>} map - Accumulator
 * @param {Object} realtime - Realtime extraction results
 */
function mapChannelFiles(map, realtime) {
  if (!realtime?.channels) return
  for (const channel of realtime.channels) {
    if (channel.file && channel.class) {
      map[channel.file] = { entity: channel.class, type: 'channel' }
    }
  }
}

/**
 * Map policy files from manifest entries.
 * @param {Object<string, Object>} map - Accumulator
 * @param {Object} manifest - Scanner manifest
 */
function mapPolicyFiles(map, manifest) {
  const entries = manifest?.entries || []
  for (const entry of entries) {
    if (entry.path.startsWith('app/policies/') && entry.path.endsWith('.rb')) {
      const className = pathToClassName(entry.path)
      map[entry.path] = { entity: className, type: 'policy' }
    }
  }
}

/**
 * Map service object files from manifest entries.
 * @param {Object<string, Object>} map - Accumulator
 * @param {Object} manifest - Scanner manifest
 */
function mapServiceFiles(map, manifest) {
  const entries = manifest?.entries || []
  for (const entry of entries) {
    if (entry.path.startsWith('app/services/') && entry.path.endsWith('.rb')) {
      const className = pathToClassName(entry.path)
      map[entry.path] = { entity: className, type: 'service' }
    }
  }
}

/**
 * Map migration files to the __schema__ entity.
 * @param {Object<string, Object>} map - Accumulator
 * @param {Object} manifest - Scanner manifest
 */
function mapMigrationFiles(map, manifest) {
  const entries = manifest?.entries || []
  for (const entry of entries) {
    if (entry.path.startsWith('db/migrate/') && entry.path.endsWith('.rb')) {
      map[entry.path] = { entity: '__schema__', type: 'migration' }
    }
  }
}

/**
 * Compute summary statistics.
 */
export function computeStatistics(manifest, extractions, relationships) {
  const entries = manifest.entries || []
  return {
    total_files: entries.length,
    models: Object.values(extractions.models || {}).filter(
      (m) => m.type !== 'concern' && !m.abstract,
    ).length,
    models_file_count: (manifest.stats || {}).models || 0,
    models_in_manifest: (manifest.stats || {}).models || 0,
    controllers: Object.keys(extractions.controllers || {}).length,
    components: entries.filter(
      (e) => e.categoryName === 'components' && e.type === 'ruby',
    ).length,
    relationships: relationships.length,
    gems: Array.isArray(extractions.gemfile?.gems)
      ? extractions.gemfile.gems.length
      : Object.keys(extractions.gemfile?.gems || {}).length,
    helpers: Object.keys(extractions.helpers || {}).length,
    workers: Object.keys(extractions.workers || {}).length,
    uploaders: Object.keys(extractions.uploaders?.uploaders || {}).length,
  }
}
