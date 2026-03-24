/**
 * Simple YAML parser for Rails config files.
 * Handles key-value pairs, arrays, nested structures, and anchors/aliases.
 * Not a full YAML parser — designed for Rails convention YAML files.
 */

/**
 * Parse a simple YAML string into a nested object.
 * @param {string} content - YAML content
 * @returns {Object}
 */
export function parseYaml(content) {
  if (!content || typeof content !== 'string') return {}

  const lines = content.split('\n')
  const result = {}
  const anchors = {}
  const stack = [{ obj: result, indent: -1 }]

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Skip empty lines and comments
    if (/^\s*$/.test(line) || /^\s*#/.test(line)) continue

    // Handle ERB tags by removing them
    const cleanLine = line.replace(/<%.*?%>/g, '')
    if (/^\s*$/.test(cleanLine)) continue

    const indentMatch = cleanLine.match(/^(\s*)/)
    const indent = indentMatch ? indentMatch[1].length : 0

    // Pop stack to correct parent
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop()
    }

    // Merge key: <<: *alias
    const mergeMatch = cleanLine.match(/^\s*<<:\s*\*(\w+)/)
    if (mergeMatch) {
      const aliasName = mergeMatch[1]
      const source = anchors[aliasName]
      if (source && typeof source === 'object') {
        const parent = stack[stack.length - 1].obj
        Object.assign(parent, structuredClone(source))
      }
      continue
    }

    // Array item
    const arrayMatch = cleanLine.match(/^(\s*)-\s*(.+)$/)
    if (arrayMatch) {
      const parent = stack[stack.length - 1]
      if (parent.arrayKey) {
        if (!Array.isArray(parent.obj[parent.arrayKey])) {
          parent.obj[parent.arrayKey] = []
        }
        parent.obj[parent.arrayKey].push(parseYamlValue(arrayMatch[2].trim()))
      }
      continue
    }

    // Key-value with anchor: key: &anchor value
    const kvAnchorMatch = cleanLine.match(
      /^(\s*)(\w[\w\s-]*):\s*&(\w+)\s*(.*)$/,
    )
    if (kvAnchorMatch) {
      const key = kvAnchorMatch[2].trim()
      const anchorName = kvAnchorMatch[3]
      const value = kvAnchorMatch[4].trim()
      const parent = stack[stack.length - 1].obj

      if (value === '' || value === '|' || value === '>') {
        parent[key] = {}
        anchors[anchorName] = parent[key]
        stack.push({ obj: parent[key], indent, arrayKey: null })
      } else {
        parent[key] = parseYamlValue(value)
        anchors[anchorName] = parent[key]
      }
      continue
    }

    // Key-value with alias: key: *alias
    const kvAliasMatch = cleanLine.match(/^(\s*)(\w[\w\s-]*):\s*\*(\w+)/)
    if (kvAliasMatch) {
      const key = kvAliasMatch[2].trim()
      const aliasName = kvAliasMatch[3]
      const parent = stack[stack.length - 1].obj
      const source = anchors[aliasName]
      parent[key] = source !== undefined ? structuredClone(source) : null
      continue
    }

    // Key-value pair
    const kvMatch = cleanLine.match(/^(\s*)(\w[\w\s-]*):\s*(.*)$/)
    if (kvMatch) {
      const key = kvMatch[2].trim()
      const value = kvMatch[3].trim()
      const parent = stack[stack.length - 1].obj

      if (value === '' || value === '|' || value === '>') {
        parent[key] = {}
        stack.push({ obj: parent[key], indent, arrayKey: null })
      } else {
        parent[key] = parseYamlValue(value)
      }
    }
  }

  // Resolve anchors: for any anchor that points to an object, update the reference
  // since nested keys were added after the anchor was stored
  return result
}

/**
 * Parse a YAML value string into appropriate JS type.
 * @param {string} value
 * @returns {string|number|boolean|null}
 */
function parseYamlValue(value) {
  if (value === 'true') return true
  if (value === 'false') return false
  if (value === 'null' || value === '~') return null
  if (/^\d+$/.test(value)) return parseInt(value, 10)
  if (/^\d+\.\d+$/.test(value)) return parseFloat(value)
  // Remove quotes
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }
  return value
}
