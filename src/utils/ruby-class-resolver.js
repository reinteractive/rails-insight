/**
 * Shared utility to resolve the fully-qualified class name (FQN) from a Ruby
 * file by detecting wrapping module declarations around the class definition.
 */

/**
 * Resolve the fully-qualified class name from a Ruby file by detecting
 * wrapping module declarations around the class definition.
 *
 * @param {string} content — full file content
 * @param {string} shortClassName — the class name extracted by classDeclaration regex
 * @param {number} classMatchIndex — the character index where the class declaration was found
 * @returns {{ fqn: string, namespace: string|null }}
 */
export function resolveFullyQualifiedName(
  content,
  shortClassName,
  classMatchIndex,
) {
  // If class name already contains ::, it's inline-namespaced — use as-is
  if (shortClassName.includes('::')) {
    const parts = shortClassName.split('::')
    const namespace = parts.slice(0, -1).join('::')
    return { fqn: shortClassName, namespace: namespace || null }
  }

  // Scan content BEFORE the class declaration for wrapping module blocks
  const preClassContent = content.slice(0, classMatchIndex)
  const lines = preClassContent.split('\n')

  // Track module nesting with a stack: each entry is { name, depth }
  const moduleStack = []
  let depth = 0

  for (const line of lines) {
    const trimmed = line.trim()

    if (!trimmed || trimmed.startsWith('#')) continue

    // Match module declarations (including compact like `module Api::V1`)
    const moduleMatch = trimmed.match(/^module\s+(\w+(?:::\w+)*)/)
    if (moduleMatch) {
      moduleStack.push({ name: moduleMatch[1], depth })
      depth++
      continue
    }

    // A bare `end` closes the most recently opened block
    if (/^end\b/.test(trimmed)) {
      if (depth > 0) {
        depth--
        // Remove any modules registered at this depth or deeper
        while (
          moduleStack.length > 0 &&
          moduleStack[moduleStack.length - 1].depth >= depth
        ) {
          moduleStack.pop()
        }
      }
    }
  }

  // Modules still on the stack are wrapping the class declaration
  if (moduleStack.length === 0) {
    return { fqn: shortClassName, namespace: null }
  }

  // Build namespace from the remaining module stack
  // Each module name may itself be nested (e.g. `module Api::V1`)
  const namespaceParts = moduleStack.flatMap((m) => m.name.split('::'))
  const namespace = namespaceParts.join('::')
  const fqn = `${namespace}::${shortClassName}`

  return { fqn, namespace }
}
