import { noIndex, respond } from './helpers.js'
import { MAX_KEY_ENTITIES } from '../../core/constants.js'

/**
 * Register the get_overview tool.
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 * @param {Object} state - Mutable state with { index, provider, verbose }
 */
export function register(server, state) {
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
      if (authorization.concern?.guard_methods) {
        const guardCount = Object.keys(
          authorization.concern.guard_methods,
        ).length
        authzSummary.enforcement = `before_action guard methods in Authorization concern (${guardCount} guards)`
      }
      const adminNs = authorization.controller_enforcement_map?.admin_namespace
      if (adminNs?.base_guard) {
        authzSummary.admin_boundary = adminNs.base_guard
      }

      // Key models
      const keyModels = Object.entries(models)
        .filter(([n, m]) => m.type !== 'concern' && !m.abstract)
        .sort(
          (a, b) =>
            (b[1].associations?.length || 0) - (a[1].associations?.length || 0),
        )
        .slice(0, MAX_KEY_ENTITIES)
        .map(([n]) => n)

      // Key controllers
      const keyControllers = Object.entries(controllers)
        .sort(
          (a, b) => (b[1].actions?.length || 0) - (a[1].actions?.length || 0),
        )
        .slice(0, MAX_KEY_ENTITIES)
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
        workers: {
          sidekiq_native_count: Object.keys(index.extractions?.workers || {})
            .length,
          queues: [
            ...new Set(
              Object.values(index.extractions?.workers || {}).map(
                (w) => w.queue,
              ),
            ),
          ],
        },
        helpers: {
          count: Object.keys(index.extractions?.helpers || {}).length,
        },
        uploaders: {
          count: Object.keys(index.extractions?.uploaders?.uploaders || {})
            .length,
          mounted: (index.extractions?.uploaders?.mounted || []).length,
        },
        pwa: index.pwa || { detected: false },
        extraction_errors: (index.extraction_errors || []).length,
        ...(index.extraction_errors?.length > 0
          ? { extraction_error_details: index.extraction_errors }
          : {}),
      }

      return respond(overview)
    },
  )
}
