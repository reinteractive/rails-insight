/**
 * Stimulus Extractor (#6)
 * Extracts Stimulus controller metadata from JavaScript files.
 */

import { STIMULUS_PATTERNS } from '../core/patterns.js'

/**
 * Derive the Stimulus identifier from the file path.
 * app/javascript/controllers/dropdown_controller.js → "dropdown"
 * app/javascript/controllers/users/filter_controller.js → "users--filter"
 * @param {string} filePath
 * @returns {string}
 */
function deriveIdentifier(filePath) {
  const controllersIdx = filePath.indexOf('controllers/')
  if (controllersIdx === -1) return filePath
  const rest = filePath.slice(controllersIdx + 'controllers/'.length)
  return rest
    .replace(/_controller\.\w+$/, '')
    .replace(/\//g, '--')
    .replace(/_/g, '-')
}

const LIFECYCLE_METHODS = new Set(['connect', 'disconnect', 'initialize'])

/**
 * Extract Stimulus controller information from a single JS file.
 * @param {import('../providers/interface.js').FileProvider} provider
 * @param {string} filePath
 * @returns {object|null}
 */
export function extractStimulusController(provider, filePath) {
  const content = provider.readFile(filePath)
  if (!content) return null

  const classMatch = content.match(STIMULUS_PATTERNS.classDeclaration)
  if (!classMatch) return null

  const result = {
    identifier: deriveIdentifier(filePath),
    file: filePath,
    targets: [],
    values: {},
    classes: [],
    outlets: [],
    actions: [],
    imports: [],
  }

  // Targets
  const targetsMatch = content.match(STIMULUS_PATTERNS.targets)
  if (targetsMatch) {
    result.targets =
      targetsMatch[1]
        .match(/['"](\w+)['"]/g)
        ?.map((t) => t.replace(/['"]/g, '')) || []
  }

  // Values - extract the full block handling nested braces
  const valuesStart = content.match(/static\s+values\s*=\s*\{/)
  if (valuesStart) {
    const startIdx = valuesStart.index + valuesStart[0].length
    let depth = 1
    let endIdx = startIdx
    for (let ci = startIdx; ci < content.length && depth > 0; ci++) {
      if (content[ci] === '{') depth++
      else if (content[ci] === '}') depth--
      if (depth === 0) endIdx = ci
    }
    const valStr = content.slice(startIdx, endIdx)
    // Complex form: key: { type: Type, default: val }
    const complexRe =
      /(\w+):\s*\{\s*type:\s*(\w+)(?:,\s*default:\s*([^,}]+))?\s*\}/g
    let vm
    const processed = new Set()
    while ((vm = complexRe.exec(valStr))) {
      processed.add(vm[1])
      result.values[vm[1]] = {
        type: vm[2],
        default: vm[3]?.trim() || null,
      }
    }
    // Simple form: key: Type
    const simpleRe = /(\w+):\s*(\w+)/g
    while ((vm = simpleRe.exec(valStr))) {
      if (!processed.has(vm[1]) && vm[1] !== 'type' && vm[1] !== 'default') {
        result.values[vm[1]] = { type: vm[2], default: null }
      }
    }
  }

  // Classes
  const classesMatch = content.match(STIMULUS_PATTERNS.classes)
  if (classesMatch) {
    result.classes =
      classesMatch[1]
        .match(/['"](\w[\w-]*)['"]/g)
        ?.map((c) => c.replace(/['"]/g, '')) || []
  }

  // Outlets
  const outletsMatch = content.match(STIMULUS_PATTERNS.outlets)
  if (outletsMatch) {
    result.outlets =
      outletsMatch[1]
        .match(/['"](\w[\w-]*)['"]/g)
        ?.map((o) => o.replace(/['"]/g, '')) || []
  }

  // Actions (methods)
  const actionRe = new RegExp(STIMULUS_PATTERNS.actionMethod.source, 'gm')
  let am
  while ((am = actionRe.exec(content))) {
    const name = am[1]
    if (
      !LIFECYCLE_METHODS.has(name) &&
      !name.endsWith('TargetConnected') &&
      !name.endsWith('TargetDisconnected') &&
      !name.endsWith('ValueChanged')
    ) {
      result.actions.push(name)
    }
  }

  // Imports
  const importRe = new RegExp(STIMULUS_PATTERNS.imports.source, 'g')
  let im
  while ((im = importRe.exec(content))) {
    result.imports.push(im[3])
  }

  return result
}

/**
 * Extract all Stimulus controllers from scanned entries.
 * @param {import('../providers/interface.js').FileProvider} provider
 * @param {Array<{path: string}>} entries
 * @returns {Array<object>}
 */
export function extractStimulusControllers(provider, entries) {
  const controllers = []
  for (const entry of entries) {
    const ctrl = extractStimulusController(provider, entry.path)
    if (ctrl) controllers.push(ctrl)
  }
  return controllers
}
