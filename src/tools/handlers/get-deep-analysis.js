import { z } from 'zod'
import {
  noIndex,
  respond,
  toTableName,
  pathToClassName,
  SIGNIFICANT_CATEGORIES,
  DROP_GEMS,
  NOTABLE_ABSENT_CANDIDATES,
} from './helpers.js'

/**
 * Register the get_deep_analysis tool.
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 * @param {Object} state - Mutable state with { index, provider, verbose }
 */
export function register(server, state) {
  server.tool(
    'get_deep_analysis',
    'Get deep analysis for a specific category. Categories: authentication, authorization, jobs, email, storage, caching, realtime, api_patterns, dependencies, components, stimulus, views, convention_drift, manifest, detected_stack, related, model_list, controller_list, component_list, testing, design_patterns, test_conventions, factory_registry, coverage_snapshot',
    {
      category: z.string().describe('The category to analyze'),
      name: z
        .string()
        .optional()
        .describe(
          'Entity name for categories that accept it (e.g. model name, component name)',
        ),
      depth: z
        .number()
        .optional()
        .describe('Depth for related queries (default: 2)'),
    },
    async ({ category, name, depth = 2 }) => {
      if (!state.index) return noIndex()
      const index = state.index
      const extractions = index.extractions || {}

      switch (category) {
        case 'authentication':
          return respond(extractions.auth || {})

        case 'authorization':
          return respond(extractions.authorization || {})

        case 'jobs':
          return respond(extractions.jobs || {})

        case 'email':
          return respond(extractions.email || {})

        case 'storage': {
          const storage = extractions.storage || {}
          const uploaders = extractions.uploaders || {}
          return respond({
            ...storage,
            carrierwave_uploaders: uploaders.uploaders
              ? Object.entries(uploaders.uploaders).map(([name, u]) => ({
                  name,
                  ...u,
                }))
              : [],
          })
        }

        case 'caching':
          return respond(extractions.caching || {})

        case 'realtime':
          return respond(extractions.realtime || {})

        case 'api_patterns':
          return respond(extractions.api || {})

        case 'dependencies': {
          const gemfile = extractions.gemfile || {}
          const allGems = Array.isArray(gemfile.gems) ? gemfile.gems : []
          const gemNames = new Set(allGems.map((g) => g.name))
          const significant = {}
          for (const gem of allGems) {
            if (!SIGNIFICANT_CATEGORIES.has(gem.category)) continue
            if (DROP_GEMS.has(gem.name)) continue
            if (!significant[gem.category]) significant[gem.category] = {}
            significant[gem.category][gem.name] =
              gem.resolved || gem.version || 'unknown'
          }
          if (significant.testing) {
            const testingEntries = Object.entries(significant.testing).slice(
              0,
              3,
            )
            significant.testing = Object.fromEntries(testingEntries)
          }
          const notableAbsent = NOTABLE_ABSENT_CANDIDATES.filter(
            (g) => !gemNames.has(g),
          )
          return respond({
            ...significant,
            total_gem_count: allGems.length,
            notable_absent: notableAbsent,
            ruby_version: gemfile.rubyVersion || null,
          })
        }

        case 'components': {
          const components = extractions.components || {}
          if (name) {
            const comp = components[name]
            if (!comp)
              return respond({
                error: `Component '${name}' not found`,
                available: Object.keys(components),
              })
            return respond(comp)
          }
          return respond(
            Object.entries(components).map(([n, c]) => ({
              name: n,
              tier: c.tier,
              slot_count: (c.slots || []).length,
              has_preview: c.has_preview || false,
              file: c.file,
            })),
          )
        }

        case 'stimulus': {
          const stimulusControllers = extractions.stimulus_controllers || []
          if (name) {
            const sc = stimulusControllers.find(
              (s) => s.identifier === name || s.class === name,
            )
            if (!sc)
              return respond({
                error: `Stimulus controller '${name}' not found`,
              })
            return respond(sc)
          }
          return respond(stimulusControllers)
        }

        case 'views':
          return respond(extractions.views || {})

        case 'convention_drift':
          return respond({
            drift: index.drift || [],
            total: (index.drift || []).length,
          })

        case 'manifest': {
          const manifest = index.manifest || {}
          if (name) {
            const entries = manifest.byCategory?.[name] || []
            return respond({
              category: name,
              count: entries.length,
              files: entries.map((e) => e.path),
            })
          }
          return respond({
            total_files: manifest.total_files,
            categories: manifest.stats,
          })
        }

        case 'detected_stack':
          return respond(index.versions || {})

        case 'related': {
          if (!name)
            return respond({
              error: 'name parameter required for related category',
            })
          const allRels = index.relationships || []
          const rankings = index.rankings || {}
          const visited = new Set([name])
          let frontier = [name]
          const connected = []
          for (let d = 0; d < depth && frontier.length > 0; d++) {
            const nextFrontier = []
            for (const current of frontier) {
              for (const rel of allRels) {
                let neighbor = null,
                  direction = null
                if (rel.from === current && !visited.has(rel.to)) {
                  neighbor = rel.to
                  direction = 'outgoing'
                } else if (rel.to === current && !visited.has(rel.from)) {
                  neighbor = rel.from
                  direction = 'incoming'
                }
                if (neighbor) {
                  visited.add(neighbor)
                  nextFrontier.push(neighbor)
                  connected.push({
                    entity: neighbor,
                    relationship: rel.type,
                    direction,
                    distance: d + 1,
                    rank: rankings[neighbor] || 0,
                  })
                }
              }
            }
            frontier = nextFrontier
          }
          connected.sort((a, b) => a.distance - b.distance || b.rank - a.rank)
          return respond({
            source: name,
            depth,
            connected,
            total: connected.length,
          })
        }

        case 'model_list': {
          const models = extractions.models || {}
          return respond(
            Object.entries(models)
              .filter(
                ([, m]) =>
                  m.type !== 'concern' &&
                  m.type !== 'module' &&
                  m.type !== 'poro',
              )
              .map(([n, m]) => ({
                name: n,
                superclass: m.superclass || null,
                type: m.type || 'model',
                association_count: (m.associations || []).length,
                scope_count: (m.scopes || []).length,
                has_secure_password: m.has_secure_password || false,
                file: m.file,
              })),
          )
        }

        case 'controller_list': {
          const controllers = extractions.controllers || {}
          return respond(
            Object.entries(controllers).map(([n, c]) => ({
              name: n,
              superclass: c.superclass || 'ApplicationController',
              action_count: (c.actions || []).length,
              namespace: c.namespace || null,
              file: c.file,
            })),
          )
        }

        case 'component_list': {
          const components = extractions.components || {}
          return respond(
            Object.entries(components).map(([n, c]) => ({
              name: n,
              tier: c.tier,
              slot_count: (c.slots || []).length,
              has_preview: c.has_preview || false,
              file: c.file,
            })),
          )
        }

        case 'testing':
          return respond(extractions.tier2?.testing || {})

        case 'design_patterns':
          return respond(extractions.tier2?.design_patterns || {})

        case 'test_conventions':
          return respond(extractions.test_conventions || {})

        case 'factory_registry':
          return respond(extractions.factory_registry || {})

        case 'coverage_snapshot':
          return respond(extractions.coverage_snapshot || {})

        default:
          return respond({
            error: `Unknown category: ${category}`,
            available: [
              'authentication',
              'authorization',
              'jobs',
              'email',
              'storage',
              'caching',
              'realtime',
              'api_patterns',
              'dependencies',
              'components',
              'stimulus',
              'views',
              'convention_drift',
              'manifest',
              'detected_stack',
              'related',
              'model_list',
              'controller_list',
              'component_list',
              'testing',
              'design_patterns',
              'test_conventions',
              'factory_registry',
              'coverage_snapshot',
            ],
          })
      }
    },
  )
}
