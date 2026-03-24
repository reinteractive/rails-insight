/**
 * Schema Extractor (#4)
 * Parses db/schema.rb for table definitions, columns, indexes, foreign keys.
 */

import { SCHEMA_PATTERNS } from '../core/patterns.js'

/**
 * Extract schema information from db/schema.rb.
 * @param {import('../providers/interface.js').FileProvider} provider
 * @returns {object}
 */
export function extractSchema(provider) {
  const result = {
    version: null,
    extensions: [],
    enums: {},
    tables: [],
    foreign_keys: [],
  }

  const content = provider.readFile('db/schema.rb')
  if (!content) return result

  // Schema version
  const versionMatch =
    content.match(SCHEMA_PATTERNS.schemaVersion) ||
    content.match(SCHEMA_PATTERNS.schemaVersionAlt)
  if (versionMatch) {
    result.version = versionMatch[1]
  }

  // Extensions
  const extRe = new RegExp(SCHEMA_PATTERNS.enableExtension.source, 'gm')
  let m
  while ((m = extRe.exec(content))) {
    result.extensions.push(m[1])
  }

  // Enums (PostgreSQL)
  const enumRe = new RegExp(SCHEMA_PATTERNS.createEnum.source, 'gm')
  while ((m = enumRe.exec(content))) {
    const values =
      m[2].match(/['"](\w+)['"]/g)?.map((v) => v.replace(/['"]/g, '')) || []
    result.enums[m[1]] = values
  }

  // Foreign keys (outside table blocks)
  const fkRe = new RegExp(SCHEMA_PATTERNS.foreignKey.source, 'gm')
  while ((m = fkRe.exec(content))) {
    result.foreign_keys.push({
      from_table: m[1],
      to_table: m[2],
      options: m[3] || null,
    })
  }

  // Parse tables
  const lines = content.split('\n')
  let currentTable = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    // Create table
    const tableMatch = trimmed.match(SCHEMA_PATTERNS.createTable)
    if (tableMatch) {
      const options = tableMatch[2] || ''
      let pkType = 'bigint'
      let pkAuto = true

      if (SCHEMA_PATTERNS.idFalse.test(options)) {
        pkType = null
        pkAuto = false
      } else if (SCHEMA_PATTERNS.idUuid.test(options)) {
        pkType = 'uuid'
      } else {
        const idTypeMatch = options.match(SCHEMA_PATTERNS.idType)
        if (idTypeMatch) pkType = idTypeMatch[1]
      }

      const commentMatch = options.match(SCHEMA_PATTERNS.comment)

      // Composite primary key detection
      const compositePkMatch = options.match(
        SCHEMA_PATTERNS.compositePrimaryKey,
      )
      if (compositePkMatch) {
        const columns =
          compositePkMatch[1]
            .match(/['":]\w+/g)
            ?.map((c) => c.replace(/['":]/, '')) || []
        currentTable = {
          name: tableMatch[1],
          primary_key: { type: 'composite', columns },
          columns: [],
          indexes: [],
          comment: commentMatch ? commentMatch[1] : null,
        }
      } else {
        currentTable = {
          name: tableMatch[1],
          primary_key: pkType ? { type: pkType, auto: pkAuto } : null,
          columns: [],
          indexes: [],
          comment: commentMatch ? commentMatch[1] : null,
        }
      }
      result.tables.push(currentTable)
      continue
    }

    if (!currentTable) continue

    // End of table block
    if (/^\s*end\b/.test(trimmed) && currentTable) {
      currentTable = null
      continue
    }

    // References/belongs_to
    const refMatch = trimmed.match(SCHEMA_PATTERNS.references)
    if (refMatch) {
      currentTable.columns.push({
        name: refMatch[1] + '_id',
        type: 'references',
        ref_name: refMatch[1],
        constraints: refMatch[2] || null,
      })
      continue
    }

    // Timestamps
    if (SCHEMA_PATTERNS.timestamps.test(trimmed)) {
      currentTable.columns.push({
        name: 'created_at',
        type: 'datetime',
        constraints: 'null: false',
      })
      currentTable.columns.push({
        name: 'updated_at',
        type: 'datetime',
        constraints: 'null: false',
      })
      continue
    }

    // Index
    const indexMatch = trimmed.match(SCHEMA_PATTERNS.index)
    if (indexMatch) {
      const columns = indexMatch[1]
        ? indexMatch[1]
            .match(/['"](\w+)['"]/g)
            ?.map((c) => c.replace(/['"]/g, '')) || []
        : [indexMatch[2]]
      const opts = indexMatch[3] || ''
      currentTable.indexes.push({
        columns,
        unique: /unique:\s*true/.test(opts),
        name: opts.match(/name:\s*['"]([^'"]+)['"]/)?.[1] || null,
      })
      continue
    }

    // Regular column
    const colMatch = trimmed.match(SCHEMA_PATTERNS.column)
    if (colMatch) {
      currentTable.columns.push({
        name: colMatch[2],
        type: colMatch[1],
        constraints: colMatch[3] || null,
      })
    }
  }

  return result
}
