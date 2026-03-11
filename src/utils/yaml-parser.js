/**
 * Simple YAML parser for Rails config files.
 * Handles key-value pairs, arrays, and nested structures.
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

    // Array item
    const arrayMatch = cleanLine.match(/^(\s*)-\s*(.+)$/)
    if (arrayMatch) {
      // Find the parent
      while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
        stack.pop()
      }
      const parent = stack[stack.length - 1]
      if (parent.arrayKey) {
        if (!Array.isArray(parent.obj[parent.arrayKey])) {
          parent.obj[parent.arrayKey] = []
        }
        parent.obj[parent.arrayKey].push(parseYamlValue(arrayMatch[2].trim()))
      }
      continue
    }

    // Key-value pair
    const kvMatch = cleanLine.match(/^(\s*)(\w[\w\s-]*):\s*(.*)$/)
    if (kvMatch) {
      const key = kvMatch[2].trim()
      const value = kvMatch[3].trim()

      // Pop stack to find correct parent
      while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
        stack.pop()
      }
      const parent = stack[stack.length - 1].obj

      if (value === '' || value === '|' || value === '>') {
        // Nested object or block scalar
        parent[key] = {}
        stack.push({ obj: parent, indent, key, arrayKey: key })
        // Update the nested object to be a child in the stack
        stack[stack.length - 1] = {
          obj: parent,
          indent,
          key,
          arrayKey: key,
          nested: parent[key],
        }
        // Actually push the nested object
        stack.pop()
        stack.push({ obj: parent[key], indent, arrayKey: null })
      } else {
        parent[key] = parseYamlValue(value)
      }
    }
  }

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
