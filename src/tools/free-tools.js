/**
 * Primary MCP tools — always registered regardless of tier.
 * Contains all 9 tools: index_project + 8 primary + get_deep_analysis.
 */

import { z } from 'zod'
import { buildIndex } from '../core/indexer.js'
import { formatOutput } from '../core/formatter.js'

/**
 * Convert a PascalCase model name to a snake_case plural table name.
 * @param {string} name e.g. "UserProfile"
 * @returns {string} e.g. "user_profiles"
 */
function toTableName(name) {
  const snake = name
    .replace(/([A-Z])/g, (m, l, i) => (i === 0 ? l : `_${l}`))
    .toLowerCase()
  // Very naive pluralisation — good enough for table inference
  return snake.endsWith('s') ? snake : `${snake}s`
}

// Architecturally significant gem categories (for slimmed dependencies output)
const SIGNIFICANT_CATEGORIES = new Set([
  'core',
  'frontend',
  'auth',
  'authorization',
  'background',
  'caching',
  'realtime',
  'testing',
  'deployment',
  'search',
  'admin',
  'payments',
  'monitoring',
  'api',
  'data',
])
// Gems to always drop even if in significant categories
const DROP_GEMS = new Set([
  'railties',
  'activesupport',
  'activerecord',
  'actionpack',
  'actionview',
  'actionmailer',
  'activejob',
  'actioncable',
  'activestorage',
  'actiontext',
  'actionmailbox',
  'tzinfo-data',
  'sprockets',
  'sprockets-rails',
])
// Well-known absent gems worth noting
const NOTABLE_ABSENT_CANDIDATES = [
  'devise',
  'pundit',
  'cancancan',
  'sidekiq',
  'redis',
  'activeadmin',
  'administrate',
  'jbuilder',
  'grape',
  'graphql',
  'elasticsearch-rails',
  'searchkick',
  'meilisearch-rails',
  'stripe',
  'pay',
  'sentry-rails',
  'newrelic_rpm',
  'rack-attack',
  'paper_trail',
  'audited',
]

/**
 * Register all primary tools on the MCP server.
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 * @param {Object} state - Mutable state object with { index, provider, verbose }
 */
export function registerFreeTools(server, state) {
  const noIndex = () => ({
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          error: 'Index not built. Call index_project first.',
        }),
      },
    ],
  })
  const respond = (data) => ({
    content: [{ type: 'text', text: JSON.stringify(data) }],
  })

  // 1. index_project
  server.tool(
    'index_project',
    'Re-index the Rails project. In local mode, re-scans the project root. Returns statistics and duration.',
    {
      force: z
        .boolean()
        .optional()
        .describe('Force full re-index even if cached'),
    },
    async ({ force }) => {
      if (!state.provider) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: 'No project root configured. Start with --project-root.',
              }),
            },
          ],
        }
      }
      const start = Date.now()
      state.index = await buildIndex(state.provider, { verbose: state.verbose })
      const duration_ms = Date.now() - start
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'success',
              statistics: state.index.statistics,
              duration_ms,
            }),
          },
        ],
      }
    },
  )

  // 2. get_overview (enriched with auth, authorization, key models/controllers, custom patterns)
  server.tool(
    'get_overview',
    'Project summary: Rails/Ruby versions, database, auth strategy, key models and controllers, frontend stack, file counts. Call this first.',
    {},
    async () => {
      const index = state.index
      if (!index) return noIndex()
      const v = index.versions || {}
      const config = index.extractions?.config || {}
      const auth = index.extractions?.auth || {}
      const authorization = index.extractions?.authorization || {}
      const caching = index.extractions?.caching || {}
      const models = index.extractions?.models || {}
      const controllers = index.extractions?.controllers || {}
      const tier2 = index.extractions?.tier2 || {}
      const tier3 = index.extractions?.tier3 || {}

      // Auth summary
      const authSummary = {
        strategy: auth.primary_strategy || auth.strategy || 'none',
        models: [],
        features: [],
      }
      if (auth.native_auth) {
        authSummary.models = ['User', 'Session', 'Current'].filter(
          (m) => models[m],
        )
        if (auth.has_secure_password)
          authSummary.features.push('has_secure_password')
        if (models['Session']) authSummary.features.push('database_sessions')
        if (auth.native_auth.password_reset)
          authSummary.features.push('password_reset')
      } else if (auth.devise) {
        authSummary.models = Object.keys(auth.devise.models || {})
        authSummary.features = Object.values(auth.devise.models || {}).flatMap(
          (m) => m.modules || [],
        )
      }

      // Authorization summary
      const authzSummary = {
        strategy:
          authorization.strategy || authorization.primary_strategy || 'none',
        library:
          authorization.library !== undefined ? authorization.library : null,
        roles: [],
        enforcement: null,
        admin_boundary: null,
      }
      // Pull roles from authorization extraction or User model enum
      if (authorization.role_definition?.roles) {
        authzSummary.roles = Object.keys(authorization.role_definition.roles)
      } else {
        const userModel = models['User']
        if (userModel?.enums?.role) {
          const roleEnum = userModel.enums.role
          authzSummary.roles = Array.isArray(roleEnum.values)
            ? roleEnum.values
            : Object.keys(roleEnum.values || {})
        }
      }
      // Enforcement summary from concern
      if (authorization.concern?.guard_methods) {
        const guardCount = Object.keys(
          authorization.concern.guard_methods,
        ).length
        authzSummary.enforcement = `before_action guard methods in Authorization concern (${guardCount} guards)`
      }
      // Admin boundary from enforcement map
      const adminNs = authorization.controller_enforcement_map?.admin_namespace
      if (adminNs?.base_guard) {
        authzSummary.admin_boundary = adminNs.base_guard
      }

      // Key models (prefer models with most associations)
      const keyModels = Object.entries(models)
        .filter(([n, m]) => m.type !== 'concern' && !m.abstract)
        .sort(
          (a, b) =>
            (b[1].associations?.length || 0) - (a[1].associations?.length || 0),
        )
        .slice(0, 8)
        .map(([n]) => n)

      // Key controllers (non-namespaced, most-actioned)
      const keyControllers = Object.entries(controllers)
        .sort(
          (a, b) => (b[1].actions?.length || 0) - (a[1].actions?.length || 0),
        )
        .slice(0, 8)
        .map(([n]) => n)

      // Custom pattern counts
      const customPatterns = {
        services: tier2.services?.length || tier2.service_objects?.length || 0,
        concerns: Object.values(models).filter((m) => m.type === 'concern')
          .length,
        form_objects: tier2.form_objects?.length || 0,
        presenters: tier2.presenters?.length || 0,
        policies: tier3.policies?.count || 0,
      }

      const overview = {
        rails_version: v.rails || 'unknown',
        ruby_version: v.ruby || 'unknown',
        database: config.database || v.database || 'unknown',
        asset_pipeline: v.asset_pipeline || 'unknown',
        frontend_stack: v.frontend || [],
        authentication: authSummary,
        authorization: authzSummary,
        job_adapter: config.queue_adapter || 'unknown',
        cache_store: caching.store || 'unknown',
        test_framework: v.test_framework || 'unknown',
        key_models: keyModels,
        key_controllers: keyControllers,
        custom_patterns: customPatterns,
        file_counts: index.statistics || {},
      }

      return respond(overview)
    },
  )

  // 3. get_full_index
  server.tool(
    'get_full_index',
    'Complete index JSON trimmed to fit a specified token budget.',
    {
      token_budget: z
        .number()
        .optional()
        .default(12000)
        .describe('Maximum token budget (default: 12000)'),
    },
    async ({ token_budget = 12000 }) => {
      if (!state.index) return noIndex()
      const trimmed = formatOutput(state.index, token_budget)
      return respond(trimmed)
    },
  )

  // 4. get_model
  server.tool(
    'get_model',
    'Deep extraction for a specific model: associations, validations, scopes with queries, enums with values, callbacks, public methods, database columns.',
    { name: z.string().describe('Model class name (e.g. "User")') },
    async ({ name }) => {
      if (!state.index) return noIndex()
      const models = state.index.extractions?.models || {}
      const model = models[name]
      if (!model) {
        return respond({
          error: `Model '${name}' not found`,
          available: Object.keys(models),
        })
      }

      // Enrich with schema columns
      const schema = state.index.extractions?.schema || {}
      const tables = schema.tables || []
      const tableName = model.table_name || toTableName(name)
      const tableData = tables.find((t) => t.name === tableName)
      const columns = tableData
        ? tableData.columns.map((c) => ({
            name: c.name,
            type: c.type,
            constraints: c.constraints || null,
            ...(tableData.indexes?.some(
              (i) => i.columns.includes(c.name) && i.unique,
            )
              ? { unique_index: true }
              : {}),
          }))
        : null

      // FK relationships from schema
      const schemaFks = schema.foreign_keys || []
      const foreign_keys = schemaFks
        .filter((fk) => fk.from_table === tableName)
        .map((fk) => ({
          column: fk.column,
          references: { table: fk.to_table, column: fk.primary_key || 'id' },
        }))

      // Indexes for this table
      const indexes = (tableData?.indexes || []).map((i) => ({
        columns: i.columns,
        unique: i.unique || false,
        name: i.name || null,
      }))

      // Inverse associations — other models that reference this model
      const allModels = state.index.extractions?.models || {}
      const nameLower = name.toLowerCase()
      const inverse_associations = Object.entries(allModels)
        .filter(([mName]) => mName !== name)
        .flatMap(([mName, m]) =>
          (m.associations || [])
            .filter((a) => {
              const assocName = a.name?.toLowerCase?.() || ''
              return (
                assocName === nameLower ||
                assocName === nameLower + 's' ||
                assocName === nameLower + 'es' ||
                (a.options &&
                  String(a.options)
                    .toLowerCase()
                    .includes(`class_name.*${nameLower}`))
              )
            })
            .map((a) => ({
              model: mName,
              type: a.type,
              name: a.name,
              options: a.options || null,
            })),
        )

      // Auth relevance disambiguation for models named "Role" or containing "role"
      let auth_relevance = undefined
      const authzData = state.index.extractions?.authorization || {}
      if (
        /^role$/i.test(name) &&
        authzData.roles?.model &&
        authzData.roles.model !== name
      ) {
        auth_relevance = `none — this is a domain model for job positions, not related to access control. Authorization roles are defined as an enum on the ${authzData.roles.model} model.`
      }

      return respond({
        ...model,
        columns,
        indexes: indexes.length > 0 ? indexes : null,
        foreign_keys: foreign_keys.length > 0 ? foreign_keys : null,
        inverse_associations:
          inverse_associations.length > 0 ? inverse_associations : null,
        ...(auth_relevance ? { auth_relevance } : {}),
      })
    },
  )

  // 5. get_controller
  server.tool(
    'get_controller',
    'Deep extraction for a specific controller: actions with routes, filters, rate limiting, strong params, rescue handlers.',
    {
      name: z
        .string()
        .describe('Controller class name (e.g. "SessionsController")'),
    },
    async ({ name }) => {
      if (!state.index) return noIndex()
      const controllers = state.index.extractions?.controllers || {}
      const ctrl = controllers[name]
      if (!ctrl) {
        return respond({
          error: `Controller '${name}' not found`,
          available: Object.keys(controllers),
        })
      }

      // Enrich with route mapping
      const routes = state.index.extractions?.routes || {}
      const allRoutes = routes.routes || []
      const ctrlBase = name
        .replace(/Controller$/, '')
        .toLowerCase()
        .replace(/::/g, '/')

      const actionRoutes = {}
      for (const action of ctrl.actions || []) {
        const match = allRoutes.find(
          (r) =>
            r.controller &&
            r.action &&
            (r.controller.toLowerCase() === ctrlBase ||
              r.controller.toLowerCase().endsWith(`/${ctrlBase}`) ||
              r.controller.toLowerCase() ===
                name.replace('Controller', '').toLowerCase()) &&
            r.action === action,
        )
        if (match) {
          actionRoutes[action] = {
            method: match.method || match.verb,
            path: match.path || match.pattern,
          }
        }
      }

      // Resolve inherited authorization from superclass
      let inherited_authorization = null
      if (ctrl.superclass && ctrl.superclass !== 'ApplicationController') {
        const parentCtrl = controllers[ctrl.superclass]
        if (parentCtrl) {
          const parentGuards = (parentCtrl.filters || []).filter(
            (f) => f.authorization_guard,
          )
          if (parentGuards.length > 0) {
            // Look up the requirement from the authorization extractor
            const authzData = state.index.extractions?.authorization || {}
            const guardMethods = authzData.concern?.guard_methods || {}
            const guardInfo = guardMethods[parentGuards[0].method]
            inherited_authorization = {
              from: ctrl.superclass,
              guard: parentGuards[0].method,
              requirement: guardInfo?.requirement || null,
            }
          }
        }
      }

      return respond({
        ...ctrl,
        ...(inherited_authorization ? { inherited_authorization } : {}),
        action_routes:
          Object.keys(actionRoutes).length > 0 ? actionRoutes : null,
        // Unified per-action view: route + key_logic chain
        actions_detail: (ctrl.actions || []).reduce((acc, action) => {
          acc[action] = {
            ...(actionRoutes[action] || {}),
            key_logic: ctrl.action_summaries?.[action] || null,
          }
          return acc
        }, {}),
      })
    },
  )

  // 6. get_routes
  server.tool(
    'get_routes',
    'Complete route map with namespaces, nested resources, member/collection routes.',
    {},
    async () => {
      if (!state.index) return noIndex()
      return respond(state.index.extractions?.routes || {})
    },
  )

  // 7. get_schema
  server.tool(
    'get_schema',
    'Database schema with tables, columns, indexes, foreign keys, and model-to-table mapping.',
    {},
    async () => {
      if (!state.index) return noIndex()
      const schema = state.index.extractions?.schema || {}
      const models = state.index.extractions?.models || {}

      // Add model ↔ table mapping
      const modelTableMap = {}
      for (const [modelName, modelData] of Object.entries(models)) {
        const tableName = modelData.table_name || toTableName(modelName)
        modelTableMap[modelName] = tableName
      }

      // Add FK relationship arrows
      const fkArrows = (schema.foreign_keys || []).map((fk) => {
        const col =
          fk.options?.match(/column:\s*['"]?(\w+)['"]?/)?.[1] ||
          `${fk.to_table.replace(/s$/, '')}_id`
        return `${fk.from_table}.${col} → ${fk.to_table}.id`
      })

      return respond({
        ...schema,
        model_table_map: modelTableMap,
        fk_arrows: fkArrows,
      })
    },
  )

  // 8. get_subgraph
  server.tool(
    'get_subgraph',
    'Skill-scoped relationship subgraph with ranked files. Skills: authentication, database, frontend, api, jobs, email.',
    {
      skill: z
        .string()
        .describe(
          'Skill domain (e.g. "authentication", "database", "frontend", "api")',
        ),
    },
    async ({ skill }) => {
      if (!state.index) return noIndex()

      const skillDomains = {
        authentication: [
          'auth',
          'devise',
          'session',
          'current',
          'password',
          'registration',
          'confirmation',
        ],
        database: ['model', 'schema', 'migration', 'concern'],
        frontend: ['component', 'stimulus', 'view', 'turbo', 'hotwire'],
        api: ['api', 'serializer', 'blueprint', 'graphql'],
        jobs: ['job', 'worker', 'sidekiq', 'queue'],
        email: ['mailer', 'mail', 'mailbox'],
      }

      const domains = skillDomains[skill]
      if (!domains) {
        return respond({
          error: `Unknown skill '${skill}'`,
          available: Object.keys(skillDomains),
        })
      }

      const allRels = state.index.relationships || []
      const rankings = state.index.rankings || {}
      const relevantEntities = new Set()
      for (const rel of allRels) {
        const fromMatch = domains.some((d) =>
          rel.from.toLowerCase().includes(d),
        )
        const toMatch = domains.some((d) => rel.to.toLowerCase().includes(d))
        if (fromMatch || toMatch) {
          relevantEntities.add(rel.from)
          relevantEntities.add(rel.to)
        }
      }
      for (const key of Object.keys(rankings)) {
        if (domains.some((d) => key.toLowerCase().includes(d)))
          relevantEntities.add(key)
      }

      const subgraphRels = allRels.filter(
        (r) => relevantEntities.has(r.from) || relevantEntities.has(r.to),
      )
      const rankedFiles = [...relevantEntities]
        .map((e) => ({ entity: e, rank: rankings[e] || 0 }))
        .sort((a, b) => b.rank - a.rank)

      return respond({
        skill,
        entities: rankedFiles,
        relationships: subgraphRels,
        total_entities: rankedFiles.length,
        total_relationships: subgraphRels.length,
      })
    },
  )

  // 9. search_patterns
  server.tool(
    'search_patterns',
    'Search across all extractions for a specific Rails pattern type (e.g. "has_many_through", "before_action", "turbo_broadcast").',
    {
      pattern: z
        .string()
        .describe(
          'Pattern type to search for (e.g. "has_many_through", "devise_confirmable")',
        ),
    },
    async ({ pattern }) => {
      if (!state.index) return noIndex()

      const results = []
      const extractions = state.index.extractions || {}
      const lowerPattern = pattern.toLowerCase()

      for (const [name, model] of Object.entries(extractions.models || {})) {
        const matches = []
        if (model.associations) {
          for (const assoc of model.associations) {
            const assocType = assoc.type?.replace(':', '') || ''
            if (
              assocType.includes(lowerPattern) ||
              `${assocType}_${assoc.through || ''}`.includes(lowerPattern)
            ) {
              matches.push({ type: 'association', detail: assoc })
            }
            if (
              lowerPattern === 'has_many_through' &&
              assocType === 'has_many' &&
              assoc.through
            ) {
              matches.push({ type: 'has_many_through', detail: assoc })
            }
          }
        }
        if (model.callbacks) {
          for (const cb of model.callbacks) {
            if (
              cb.type?.toLowerCase().includes(lowerPattern) ||
              cb.name?.toLowerCase().includes(lowerPattern)
            ) {
              matches.push({ type: 'callback', detail: cb })
            }
          }
        }
        if (model.concerns) {
          for (const concern of model.concerns) {
            if (concern.toLowerCase().includes(lowerPattern))
              matches.push({ type: 'concern', detail: concern })
          }
        }
        if (lowerPattern.startsWith('devise') && model.devise_modules) {
          const moduleName = lowerPattern.replace('devise_', '')
          if (model.devise_modules.includes(moduleName))
            matches.push({ type: 'devise_module', detail: moduleName })
        }
        if (model.enums && lowerPattern.includes('enum')) {
          for (const [enumName, enumData] of Object.entries(model.enums)) {
            matches.push({
              type: 'enum',
              detail: { name: enumName, ...enumData },
            })
          }
        }
        if (lowerPattern.includes('broadcast') && model.broadcasts) {
          matches.push({ type: 'broadcast', detail: model.broadcasts })
        }
        if (matches.length > 0)
          results.push({ entity: name, entity_type: 'model', matches })
      }

      for (const [name, ctrl] of Object.entries(
        extractions.controllers || {},
      )) {
        const matches = []
        const filters = ctrl.before_actions || ctrl.filters || []
        for (const f of filters) {
          const filterStr = typeof f === 'string' ? f : f.name || f.method || ''
          if (filterStr.toLowerCase().includes(lowerPattern))
            matches.push({ type: 'filter', detail: f })
        }
        if (matches.length > 0)
          results.push({ entity: name, entity_type: 'controller', matches })
      }

      return respond({
        pattern,
        results,
        total_matches: results.reduce((sum, r) => sum + r.matches.length, 0),
      })
    },
  )

  // 10. get_deep_analysis — single dispatcher replacing 19 individual tools
  server.tool(
    'get_deep_analysis',
    'Get deep analysis for a specific category. Categories: authentication, authorization, jobs, email, storage, caching, realtime, api_patterns, dependencies, components, stimulus, views, convention_drift, manifest, detected_stack, related, model_list, controller_list, component_list',
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
      token_budget: z
        .number()
        .optional()
        .describe('Token budget for full_index'),
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

        case 'storage':
          return respond(extractions.storage || {})

        case 'caching':
          return respond(extractions.caching || {})

        case 'realtime':
          return respond(extractions.realtime || {})

        case 'api_patterns':
          return respond(extractions.api || {})

        case 'dependencies': {
          // Slimmed view of dependencies: only architecturally significant gems
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
          // Trim testing to top 3
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
            Object.entries(models).map(([n, m]) => ({
              name: n,
              superclass: m.superclass || 'ApplicationRecord',
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
            ],
          })
      }
    },
  )
}
