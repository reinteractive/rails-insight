/**
 * Safe file reading utility.
 * Wraps FileProvider readFile with encoding handling.
 */

/**
 * Safely read file content, stripping BOM if present.
 * @param {import('../providers/interface.js').FileProvider} provider
 * @param {string} relativePath
 * @returns {string|null}
 */
export function safeReadFile(provider, relativePath) {
  const content = provider.readFile(relativePath)
  if (content === null) return null
  // Strip UTF-8 BOM
  if (content.charCodeAt(0) === 0xfeff) {
    return content.slice(1)
  }
  return content
}
