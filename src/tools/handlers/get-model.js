import { z } from 'zod'
import { noIndex, respond, toTableName, pathToClassName } from './helpers.js'

/**
 * Register the get_model tool.
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 * @param {Object} state - Mutable state with { index, provider, verbose }
 */
export function register(server, state) {
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

      // Inverse associations
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

      // Auth relevance disambiguation
      let auth_relevance = undefined
      const authzData = state.index.extractions?.authorization || {}
      if (/^role$/i.test(name)) {
        // Check if this is a Rolify RBAC model (has polymorphic resource_type/resource_id columns)
        const isRolifyRole =
          columns &&
          columns.some(
            (c) => c.name === 'resource_type' || c.name === 'resource_id',
          )

        if (isRolifyRole) {
          auth_relevance =
            'Rolify RBAC model — this IS the authorization role model'
        } else if (authzData.roles?.model && authzData.roles.model !== name) {
          // Only claim it's a domain model if we're confident it's not auth-related
          auth_relevance = `Potentially a domain model — authorization roles are defined on ${authzData.roles.model}`
        }
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
}
