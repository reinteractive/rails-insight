/**
 * Regex patterns for Rails schema extraction.
 */
export const SCHEMA_PATTERNS = {
  schemaVersion: /ActiveRecord::Schema\[[\d.]+\]\.define\(version:\s*([\d_]+)/,
  schemaVersionAlt: /ActiveRecord::Schema\.define\(version:\s*([\d_]+)/,
  createTable: /^\s*create_table\s+['"]([\w.]+)['"](?:,\s*(.+))?\s*do/m,
  column: /^\s*t\.(\w+)\s+['":]+(\w+)['"]?(?:,\s*(.+))?/m,
  references:
    /^\s*t\.(?:references|belongs_to)\s+['"]?:?(\w+)['"]?(?:,\s*(.+))?/m,
  timestamps: /^\s*t\.timestamps/m,
  index:
    /^\s*(?:t\.index|add_index)\s+(?:\[([^\]]+)\]|['"]([^'"]+)['"]),?\s*(.+)?/m,
  foreignKey:
    /^\s*add_foreign_key\s+['"]([\w.]+)['"],\s*['"]([\w.]+)['"](?:,\s*(.+))?/m,
  checkConstraint:
    /^\s*add_check_constraint\s+['"]([\w.]+)['"],\s*['"](.+)['"](?:,\s*(.+))?/m,
  createEnum: /^\s*create_enum\s+['"](\w+)['"],\s*\[([^\]]+)\]/m,
  enableExtension: /^\s*enable_extension\s+['"](\w+)['"]/m,
  idType: /id:\s*:(\w+)/,
  idUuid: /id:\s*:uuid/,
  idFalse: /id:\s*false/,
  compositePrimaryKey: /primary_key:\s*\[([^\]]+)\]/,
  comment: /comment:\s*['"]([^'"]+)['"]/,
}
