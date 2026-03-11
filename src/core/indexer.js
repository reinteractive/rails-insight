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

  // Layer 5: Graph + Rankings
  const { relationships, rankings } = buildGraph(
    extractions,
    manifest,
    options.skills,
  )

  // Drift detection
  const drift = detectDrift(context, versions, extractions)

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
  }
}

/**
 * Convert a file path to a Ruby-style class name.
 * @param {string} path
 * @returns {string}
 */
function pathToClassName(path) {
  const basename = path.split('/').pop().replace('.rb', '')
  return basename
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('')
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
