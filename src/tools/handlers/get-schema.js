import { noIndex, respond, toTableName } from './helpers.js'

/**
 * Register the get_schema tool.
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 * @param {Object} state - Mutable state with { index, provider, verbose }
 */
export function register(server, state) {
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
}
