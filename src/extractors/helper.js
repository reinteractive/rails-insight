/**
 * Helper Extractor (#7 — Views sub-type)
 * Extracts helper module names, public methods, and controller associations.
 */

import { HELPER_PATTERNS } from '../core/patterns.js'

/**
 * Extract helper information from a single helper file.
 * @param {import('../providers/interface.js').FileProvider} provider
 * @param {string} filePath
 * @returns {object|null}
 */
export function extractHelper(provider, filePath) {
  const content = provider.readFile(filePath)
  if (!content) return null

  const moduleMatch = content.match(HELPER_PATTERNS.moduleDeclaration)
  if (!moduleMatch) return null

  const moduleName = moduleMatch[1]

  // Derive controller by convention: PostsHelper → PostsController
  const controller = moduleName.endsWith('Helper')
    ? moduleName.replace(/Helper$/, 'Controller')
    : null

  // Find where private section begins (if any)
  const privateMatch = content.match(HELPER_PATTERNS.privateKeyword)
  const privateIndex = privateMatch ? privateMatch.index : content.length

  // Extract public methods (before private keyword)
  const publicContent = content.slice(0, privateIndex)
  const methods = []
  const methodRe = new RegExp(HELPER_PATTERNS.methodDefinition.source, 'gm')
  let m
  while ((m = methodRe.exec(publicContent))) {
    methods.push(m[1])
  }

  // Extract included helpers
  const includes = []
  const includeRe = new RegExp(HELPER_PATTERNS.includeHelper.source, 'g')
  while ((m = includeRe.exec(content))) {
    includes.push(m[1])
  }

  return {
    module: moduleName,
    file: filePath,
    controller,
    methods,
    includes,
  }
}
