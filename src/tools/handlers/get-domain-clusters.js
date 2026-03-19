import { z } from 'zod'
import { noIndex, respond, pathToClassName } from './helpers.js'
import { WELL_COVERED_THRESHOLD } from '../../core/constants.js'

/**
 * Register the get_domain_clusters tool.
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 * @param {Object} state - Mutable state with { index, provider, verbose }
 */
export function register(server, state) {
  server.tool(
    'get_domain_clusters',
    'Returns domain-clustered file groups for parallel test generation. Files in the same cluster share associations and factories. Files in different clusters can be worked on simultaneously without conflict.',
    {
      max_cluster_size: z
        .number()
        .optional()
        .describe('Maximum files per cluster (default: 8)'),
      include_covered: z
        .boolean()
        .optional()
        .describe('Include files that already have coverage (default: false)'),
    },
    async ({ max_cluster_size = 8, include_covered = false }) => {
      if (!state.index) return noIndex()
      const extractions = state.index.extractions || {}
      const models = extractions.models || {}
      const coverageSnapshot = extractions.coverage_snapshot || {}
      const factoryRegistry = extractions.factory_registry || {}
      const relationships = state.index.relationships || []

      const clusters = []
      const assigned = new Set()

      const sortedModels = Object.entries(models)
        .filter(([, m]) => m.type !== 'concern' && !m.abstract)
        .sort(
          (a, b) =>
            (b[1].associations?.length || 0) - (a[1].associations?.length || 0),
        )

      for (const [name, model] of sortedModels) {
        if (assigned.has(name)) continue

        if (!include_covered) {
          const fileCov = coverageSnapshot.per_file?.[model.file]
          if (fileCov && fileCov.line_coverage >= WELL_COVERED_THRESHOLD)
            continue
        }

        const cluster = {
          anchor: name,
          models: [name],
          files: model.file ? [model.file] : [],
          factories_available: [],
          shared_associations: [],
        }
        assigned.add(name)

        const relatedModels = (model.associations || [])
          .map((a) => pathToClassName(a.name))
          .filter((n) => models[n] && !assigned.has(n))

        for (const related of relatedModels) {
          if (cluster.models.length >= max_cluster_size) break

          if (!include_covered) {
            const relModel = models[related]
            const fileCov = relModel?.file
              ? coverageSnapshot.per_file?.[relModel.file]
              : null
            if (fileCov && fileCov.line_coverage >= WELL_COVERED_THRESHOLD)
              continue
          }

          cluster.models.push(related)
          assigned.add(related)
          if (models[related]?.file) cluster.files.push(models[related].file)
          cluster.shared_associations.push({
            from: name,
            to: related,
            type:
              (model.associations || []).find(
                (a) => pathToClassName(a.name) === related,
              )?.type || 'association',
          })
        }

        for (const modelName of cluster.models) {
          const factoryName = modelName.replace(/([A-Z])/g, (m, l, i) =>
            i === 0 ? l.toLowerCase() : `_${l.toLowerCase()}`,
          )
          if (factoryRegistry.factories?.[factoryName]) {
            cluster.factories_available.push(factoryName)
          }
        }

        clusters.push(cluster)
      }

      return respond({
        clusters,
        total_clusters: clusters.length,
        unassigned_models: Object.keys(models).filter(
          (n) =>
            !assigned.has(n) &&
            models[n].type !== 'concern' &&
            !models[n].abstract,
        ).length,
      })
    },
  )
}
