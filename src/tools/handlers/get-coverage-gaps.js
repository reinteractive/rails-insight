import { z } from 'zod'
import { noIndex, respond } from './helpers.js'

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

      const gaps = []
      const entries = manifest.entries || []

      for (const [name, model] of Object.entries(models)) {
        if (!model.file) continue
        const fileCov = coverageSnapshot.per_file?.[model.file]
        const coverage = fileCov ? fileCov.line_coverage : 0
        const gap = 100 - (coverage || 0)

        if (gap < min_gap) continue
        if (category && category !== 'model_specs') continue

        gaps.push({
          file: model.file,
          entity: name,
          entity_type: 'model',
          coverage: coverage || 0,
          gap,
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

        if (gap < min_gap) continue
        if (
          category &&
          category !== 'request_specs' &&
          category !== 'controller_specs'
        )
          continue

        gaps.push({
          file: ctrl.file,
          entity: name,
          entity_type: 'controller',
          coverage: coverage || 0,
          gap,
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
