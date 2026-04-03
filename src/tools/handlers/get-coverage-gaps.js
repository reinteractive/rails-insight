import { z } from 'zod'
import { noIndex, respond } from './helpers.js'
import { classify } from '../../utils/inflector.js'

/**
 * Build a set of entity names that have matching test/spec files.
 * Scans manifest entries with specCategory to find test→entity matches.
 * Handles namespaced models by falling back to short-name lookup.
 *
 * @param {object} manifest - Index manifest with entries
 * @param {object} models - Extracted models keyed by FQN
 * @param {object} controllers - Extracted controllers keyed by FQN
 * @returns {{ testedModels: Set<string>, testedControllers: Set<string> }}
 */
function buildTestedEntitySets(manifest, models, controllers) {
  const testedModels = new Set()
  const testedControllers = new Set()
  const entries = manifest.entries || []

  for (const entry of entries) {
    if (entry.category !== 19) continue
    const isTest = entry.path.endsWith('_test.rb')
    const isSpec = entry.path.endsWith('_spec.rb')
    if (!isTest && !isSpec) continue

    const basename = entry.path
      .split('/')
      .pop()
      .replace(isTest ? '_test.rb' : '_spec.rb', '')

    if (
      entry.specCategory === 'model_specs' ||
      entry.specCategory === 'model_tests'
    ) {
      const className = classify(basename)
      const match = resolveModelName(className, models)
      if (match) testedModels.add(match)
    } else if (
      entry.specCategory === 'request_specs' ||
      entry.specCategory === 'controller_specs' ||
      entry.specCategory === 'controller_tests'
    ) {
      // Derive controller name, respecting subdirectory namespaces
      const pathParts = entry.path.split('/')
      // e.g. test/controllers/admin/articles_controller_test.rb
      // → parts after 'controllers' before the file: ['admin']
      const ctrlDirIdx = pathParts.indexOf('controllers')
      const namespaceParts = ctrlDirIdx >= 0
        ? pathParts.slice(ctrlDirIdx + 1, -1)
        : []

      const ctrlBaseName = basename
        .replace('_controller', '')
        .split('_')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join('')
      const ctrlShortName = ctrlBaseName + 'Controller'

      // Build FQN with namespace: Admin::ArticlesController
      const ns = namespaceParts
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join('::')
      const ctrlFQN = ns ? `${ns}::${ctrlShortName}` : ctrlShortName

      if (controllers[ctrlFQN]) {
        testedControllers.add(ctrlFQN)
      } else if (controllers[ctrlShortName]) {
        testedControllers.add(ctrlShortName)
      }
    }
  }

  return { testedModels, testedControllers }
}

/**
 * Resolve a short class name to an FQN model key, with namespace fallback.
 * @param {string} shortName - e.g. 'Activity'
 * @param {object} models - Model extractions keyed by FQN
 * @returns {string|null} - The matching key, or null
 */
function resolveModelName(shortName, models) {
  if (models[shortName]) return shortName
  // Fallback: find a model key ending with ::ShortName
  const suffix = '::' + shortName
  for (const key of Object.keys(models)) {
    if (key.endsWith(suffix)) return key
  }
  return null
}

/**
 * Register the get_coverage_gaps tool.
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 * @param {Object} state - Mutable state with { index, provider, verbose }
 */
export function register(server, state) {
  server.tool(
    'get_coverage_gaps',
    'Returns prioritised list of files needing test coverage, with structural context from RailsInsight and per-method coverage data from SimpleCov.',
    {
      category: z
        .string()
        .optional()
        .describe(
          'Filter by spec category (e.g. "model_specs", "request_specs")',
        ),
      min_gap: z
        .number()
        .optional()
        .describe('Minimum coverage gap percentage to include (default: 0)'),
      limit: z
        .number()
        .optional()
        .describe('Maximum results to return (default: 20)'),
    },
    async ({ category, min_gap = 0, limit = 20 }) => {
      if (!state.index) return noIndex()
      const extractions = state.index.extractions || {}
      const coverageSnapshot = extractions.coverage_snapshot || {}
      const models = extractions.models || {}
      const controllers = extractions.controllers || {}
      const manifest = state.index.manifest || {}
      const hasCoverage = coverageSnapshot.available === true

      // Build set of entities that have matching test files
      const { testedModels, testedControllers } = buildTestedEntitySets(
        manifest,
        models,
        controllers,
      )

      const gaps = []
      const entries = manifest.entries || []

      for (const [name, model] of Object.entries(models)) {
        if (!model.file) continue
        const fileCov = coverageSnapshot.per_file?.[model.file]
        const coverage = fileCov ? fileCov.line_coverage : 0
        const gap = 100 - (coverage || 0)
        const hasTest = testedModels.has(name)

        if (gap < min_gap) continue
        if (category && category !== 'model_specs') continue
        // When no SimpleCov, skip entities that have test files
        if (!hasCoverage && hasTest) continue

        gaps.push({
          file: model.file,
          entity: name,
          entity_type: 'model',
          coverage: coverage || 0,
          gap,
          has_test: hasTest,
          public_methods: model.public_methods?.length || 0,
          associations: model.associations?.length || 0,
          uncovered_methods: (coverageSnapshot.uncovered_methods || [])
            .filter((m) => m.entity === name)
            .map((m) => ({ method: m.method, coverage: m.coverage })),
        })
      }

      for (const [name, ctrl] of Object.entries(controllers)) {
        if (!ctrl.file) continue
        const fileCov = coverageSnapshot.per_file?.[ctrl.file]
        const coverage = fileCov ? fileCov.line_coverage : 0
        const gap = 100 - (coverage || 0)
        const hasTest = testedControllers.has(name)

        if (gap < min_gap) continue
        if (
          category &&
          category !== 'request_specs' &&
          category !== 'controller_specs'
        )
          continue
        // When no SimpleCov, skip entities that have test files
        if (!hasCoverage && hasTest) continue

        gaps.push({
          file: ctrl.file,
          entity: name,
          entity_type: 'controller',
          coverage: coverage || 0,
          gap,
          has_test: hasTest,
          actions: ctrl.actions?.length || 0,
          uncovered_methods: (coverageSnapshot.uncovered_methods || [])
            .filter((m) => m.entity === name)
            .map((m) => ({ method: m.method, coverage: m.coverage })),
        })
      }

      gaps.sort((a, b) => b.gap - a.gap)

      return respond({
        coverage_available: coverageSnapshot.available || false,
        overall: coverageSnapshot.overall || null,
        gaps: gaps.slice(0, limit),
        total_gaps: gaps.length,
      })
    },
  )
}
