/**
 * Factory Registry Extractor
 * Parses FactoryBot factory definitions from spec/factories/ or test/factories/.
 *
 * @module factory-registry
 */

import { FACTORY_PATTERNS } from '../core/patterns.js'
import { classify as inflectorClassify } from '../utils/inflector.js'

/**
 * Extract factory definitions from factory files.
 * @param {import('../providers/interface.js').FileProvider} provider
 * @param {Array<{path: string, specCategory?: string}>} entries
 * @returns {object}
 */
export function extractFactoryRegistry(provider, entries) {
  const result = {
    factories: {},
    total_factories: 0,
    total_traits: 0,
    factory_files: [],
    missing_factories: [],
  }

  // Find factory files
  const factoryEntries = entries.filter(
    (e) =>
      e.specCategory === 'factories' ||
      (e.path.includes('factories/') && e.path.endsWith('.rb')),
  )

  for (const entry of factoryEntries) {
    const content = provider.readFile(entry.path)
    if (!content) continue

    result.factory_files.push(entry.path)
    const factories = parseFactoryFile(content, entry.path)

    for (const factory of factories) {
      result.factories[factory.name] = factory
      result.total_factories++
      result.total_traits += factory.traits.length
    }
  }

  return result
}

/**
 * Parse a single factory file for factory definitions.
 * Handles nested factories and multiple factories per file.
 * @param {string} content
 * @param {string} filePath
 * @returns {Array<object>}
 */
function parseFactoryFile(content, filePath) {
  const factories = []
  const lines = content.split('\n')

  let currentFactory = null
  let inTransient = false
  let inTrait = false
  let depth = 0
  let factoryDepth = 0
  let traitDepth = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    // Skip comments and blanks
    if (!trimmed || trimmed.startsWith('#')) continue

    // Skip FactoryBot.define wrapper — don't track its depth
    if (/FactoryBot\.define\s+do/.test(trimmed)) continue

    // Factory definition
    const factoryMatch = trimmed.match(FACTORY_PATTERNS.factoryDef)
    if (factoryMatch) {
      // If we're already in a factory, save it first (nested factory)
      if (currentFactory) {
        // Deduplicate attributes
        currentFactory.attributes = [...new Set(currentFactory.attributes)]
        factories.push(currentFactory)
      }

      const name = factoryMatch[1]
      const explicitClass = factoryMatch[2] || null

      currentFactory = {
        name,
        class_name: explicitClass || classify(name),
        file: filePath,
        traits: [],
        sequences: [],
        associations: [],
        attributes: [],
        has_transient: false,
        has_after_create: false,
        has_after_build: false,
      }
      factoryDepth = depth
      depth++
      inTransient = false
      continue
    }

    if (!currentFactory) {
      if (/\bdo\b/.test(trimmed) && !/\bend\b/.test(trimmed)) depth++
      if (/\bend\b/.test(trimmed)) depth--
      continue
    }

    // Trait definition
    const traitMatch = trimmed.match(FACTORY_PATTERNS.trait)
    if (traitMatch) {
      currentFactory.traits.push(traitMatch[1])
      inTrait = true
      traitDepth = depth
      depth++
      continue
    }

    // Transient block
    if (FACTORY_PATTERNS.transient.test(trimmed)) {
      inTransient = true
      currentFactory.has_transient = true
      depth++
      continue
    }

    // After create callback
    if (FACTORY_PATTERNS.afterCreate.test(trimmed)) {
      currentFactory.has_after_create = true
      if (/\bdo\b/.test(trimmed) && !/\bend\b/.test(trimmed)) depth++
      continue
    }

    // After build callback
    if (FACTORY_PATTERNS.afterBuild.test(trimmed)) {
      currentFactory.has_after_build = true
      if (/\bdo\b/.test(trimmed) && !/\bend\b/.test(trimmed)) depth++
      continue
    }

    // Association
    const assocMatch = trimmed.match(FACTORY_PATTERNS.association)
    if (assocMatch) {
      currentFactory.associations.push({
        name: assocMatch[1],
        options: assocMatch[2] || null,
      })
      continue
    }

    // Sequence
    const seqMatch =
      trimmed.match(FACTORY_PATTERNS.sequence) ||
      trimmed.match(FACTORY_PATTERNS.sequenceBlock)
    if (seqMatch) {
      currentFactory.sequences.push(seqMatch[1])
      if (/\bdo\b/.test(trimmed) && !/\bend\b/.test(trimmed)) depth++
      continue
    }

    // Track do...end nesting
    if (/\bdo\b/.test(trimmed) && !/\bend\b/.test(trimmed)) {
      depth++
    }

    if (/\bend\b/.test(trimmed)) {
      depth--
      if (inTrait && depth <= traitDepth) {
        inTrait = false
      } else if (inTransient && depth <= factoryDepth) {
        inTransient = false
      } else if (depth <= factoryDepth) {
        // Factory closed
        // Deduplicate attributes
        currentFactory.attributes = [...new Set(currentFactory.attributes)]
        factories.push(currentFactory)
        currentFactory = null
        inTrait = false
        inTransient = false
      }
    }

    // Attribute with block (single-line or multi-line)
    if (!inTransient && !inTrait) {
      const attrBlockMatch = trimmed.match(FACTORY_PATTERNS.attributeBlock) ||
        trimmed.match(/^\s*(\w+)\s*\{/)
      if (
        attrBlockMatch &&
        !FACTORY_PATTERNS.trait.test(trimmed) &&
        !FACTORY_PATTERNS.transient.test(trimmed) &&
        !FACTORY_PATTERNS.afterCreate.test(trimmed) &&
        !FACTORY_PATTERNS.afterBuild.test(trimmed)
      ) {
        const attrName = attrBlockMatch[1]
        // Filter out ruby keywords and control structures
        if (
          ![
            'if',
            'unless',
            'do',
            'end',
            'def',
            'class',
            'module',
            'factory',
            'trait',
          ].includes(attrName)
        ) {
          currentFactory.attributes.push(attrName)
        }
      }
    }
  }

  // Handle unclosed factory
  if (currentFactory) {
    // Deduplicate attributes
    currentFactory.attributes = [...new Set(currentFactory.attributes)]
    factories.push(currentFactory)
  }

  return factories
}

/**
 * Convert a snake_case factory name to a PascalCase class name.
 * @param {string} str
 * @returns {string}
 */
function classify(str) {
  return inflectorClassify(str)
}
