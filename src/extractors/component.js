/**
 * Component Extractor (#5)
 * Extracts ViewComponent metadata from Ruby class files and sidecar templates.
 */

import { COMPONENT_PATTERNS } from '../core/patterns.js'
import { resolveFullyQualifiedName } from '../utils/ruby-class-resolver.js'

/**
 * Determine component tier from class name / path.
 * @param {string} className
 * @returns {string}
 */
function detectTier(className) {
  const lower = className.toLowerCase()
  if (/^ui::/.test(lower) || /ui_component/.test(lower)) return 'ui'
  if (/^layout/.test(lower) || /layout_component/.test(lower)) return 'layout'
  if (/^page/.test(lower) || /page_component/.test(lower)) return 'page'
  return 'feature'
}

/**
 * Parse initialize params from the param string.
 * @param {string} paramStr
 * @returns {Array<{name: string, type: string, default: string|null, required: boolean}>}
 */
function parseInitializeParams(paramStr) {
  const params = []
  // Split by comma, handling nested defaults like [] and {}
  const parts = paramStr.split(/,(?![^{[]*[}\]])/)
  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed) continue

    // Keyword arg: name: default or name:
    const kwMatch = trimmed.match(/^(\w+):\s*(.+)?$/)
    if (kwMatch) {
      const name = kwMatch[1]
      const defaultVal = kwMatch[2]?.trim() || null
      params.push({
        name,
        type: 'keyword',
        default: defaultVal,
        required: defaultVal === null,
      })
      continue
    }

    // Positional arg
    const posMatch = trimmed.match(/^(\w+)$/)
    if (posMatch) {
      params.push({
        name: posMatch[1],
        type: 'positional',
        default: null,
        required: true,
      })
      continue
    }

    // Positional with default: name = value
    const posDefMatch = trimmed.match(/^(\w+)\s*=\s*(.+)$/)
    if (posDefMatch) {
      params.push({
        name: posDefMatch[1],
        type: 'positional',
        default: posDefMatch[2].trim(),
        required: false,
      })
    }
  }
  return params
}

/**
 * Extract component information from a single file.
 * @param {import('../providers/interface.js').FileProvider} provider
 * @param {string} filePath
 * @returns {object|null}
 */
export function extractComponent(provider, filePath) {
  const content = provider.readFile(filePath)
  if (!content) return null

  const classMatch = content.match(COMPONENT_PATTERNS.classDeclaration)
  if (!classMatch) return null

  const { fqn: className, namespace } = resolveFullyQualifiedName(
    content,
    classMatch[1],
    classMatch.index,
  )
  const superclass = classMatch[2]

  const result = {
    class: className,
    namespace,
    file: filePath,
    superclass,
    tier: detectTier(className),
    initialize_params: [],
    slots: { renders_one: [], renders_many: [] },
    collection_parameter: null,
    stimulus_controllers: [],
    turbo_frames: [],
    child_components: [],
    uses_partials: false,
    sidecar_template: null,
    preview: null,
  }

  // Initialize params
  const initMatch = content.match(COMPONENT_PATTERNS.initialize)
  if (initMatch) {
    result.initialize_params = parseInitializeParams(initMatch[1])
  }

  // Slots - renders_one
  const rendersOneRe = new RegExp(COMPONENT_PATTERNS.rendersOne.source, 'gm')
  let m
  while ((m = rendersOneRe.exec(content))) {
    result.slots.renders_one.push(m[1])
  }

  // Slots - renders_many
  const rendersManyRe = new RegExp(COMPONENT_PATTERNS.rendersMany.source, 'gm')
  while ((m = rendersManyRe.exec(content))) {
    result.slots.renders_many.push(m[1])
  }

  // Collection parameter
  const collMatch = content.match(COMPONENT_PATTERNS.collectionParam)
  if (collMatch) {
    result.collection_parameter = collMatch[1]
  }

  // Sidecar template detection
  const baseName = filePath.replace(/\.rb$/, '')
  const templateCandidates = [
    baseName + '.html.erb',
    baseName + '.html.haml',
    baseName + '.html.slim',
  ]
  for (const candidate of templateCandidates) {
    const templateContent = provider.readFile(candidate)
    if (templateContent) {
      result.sidecar_template = candidate
      analyzeTemplate(templateContent, result)
      break
    }
  }

  // Also check sidecar directory style: component_name/component_name.html.erb
  if (!result.sidecar_template) {
    const parts = filePath.split('/')
    const fileName = parts[parts.length - 1].replace(/\.rb$/, '')
    const dirPath = filePath.replace(/\.rb$/, '')
    const sidecarCandidates = [
      dirPath + '/' + fileName + '.html.erb',
      dirPath + '/' + fileName + '.html.haml',
    ]
    for (const candidate of sidecarCandidates) {
      const templateContent = provider.readFile(candidate)
      if (templateContent) {
        result.sidecar_template = candidate
        analyzeTemplate(templateContent, result)
        break
      }
    }
  }

  return result
}

/**
 * Analyze a sidecar template for Stimulus, Turbo, child components.
 * @param {string} content
 * @param {object} result
 */
function analyzeTemplate(content, result) {
  // Stimulus controllers
  const ctrlRe = new RegExp(COMPONENT_PATTERNS.stimulusController.source, 'g')
  let m
  while ((m = ctrlRe.exec(content))) {
    const controllers = m[1].split(/\s+/)
    for (const c of controllers) {
      if (!result.stimulus_controllers.includes(c)) {
        result.stimulus_controllers.push(c)
      }
    }
  }

  // Turbo frames
  const frameRe = new RegExp(COMPONENT_PATTERNS.turboFrame.source, 'g')
  while ((m = frameRe.exec(content))) {
    result.turbo_frames.push(m[1])
  }

  // Child components
  const compRe = new RegExp(COMPONENT_PATTERNS.componentRender.source, 'g')
  while ((m = compRe.exec(content))) {
    if (!result.child_components.includes(m[1])) {
      result.child_components.push(m[1])
    }
  }

  // Partial usage
  const partialRe = new RegExp(COMPONENT_PATTERNS.partialRender.source, 'g')
  if (partialRe.test(content)) {
    result.uses_partials = true
  }
}

/**
 * Extract all components from scanned entries.
 * @param {import('../providers/interface.js').FileProvider} provider
 * @param {Array<{path: string}>} entries - entries with category 'component'
 * @returns {Array<object>}
 */
export function extractComponents(provider, entries) {
  const components = []
  for (const entry of entries) {
    const comp = extractComponent(provider, entry.path)
    if (comp) components.push(comp)
  }
  return components
}
