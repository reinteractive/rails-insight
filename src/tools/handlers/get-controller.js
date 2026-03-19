import { z } from 'zod'
import { noIndex, respond } from './helpers.js'

/**
 * Register the get_controller tool.
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 * @param {Object} state - Mutable state with { index, provider, verbose }
 */
export function register(server, state) {
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
}
