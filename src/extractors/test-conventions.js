/**
 * Test Conventions Extractor
 * Analyses existing spec files to detect testing patterns, styles,
 * and conventions used by the project.
 *
 * @module test-conventions
 */

import { detectSpecStyle } from '../utils/spec-style-detector.js'

/**
 * Extract test conventions from existing spec files.
 * @param {import('../providers/interface.js').FileProvider} provider
 * @param {Array<{path: string, category: number, categoryName: string, specCategory?: string}>} entries
 * @param {{gems?: object}} gemInfo
 * @returns {object}
 */
export function extractTestConventions(provider, entries, gemInfo = {}) {
  const gems = gemInfo.gems || {}

  const result = {
    // Spec file style
    spec_style: detectSpecStyle(entries),

    // Let style preference
    let_style: null,
    let_count: 0,
    let_bang_count: 0,

    // Subject usage
    subject_usage: false,
    subject_count: 0,

    // described_class usage
    described_class_usage: false,

    // Shared examples
    shared_examples: [],
    shared_examples_count: 0,

    // Shared contexts
    shared_contexts: [],
    shared_contexts_count: 0,

    // Custom matchers
    custom_matchers: [],

    // Authentication helper
    auth_helper: detectAuthHelper(provider, entries, gems),

    // Database strategy
    database_strategy: detectDatabaseStrategy(provider, gems),

    // Factory tool
    factory_tool:
      gems.factory_bot_rails || gems.factory_bot
        ? 'factory_bot'
        : gems.fabrication
          ? 'fabrication'
          : null,

    // Spec file counts by category
    spec_counts: {},

    // Well-tested files (candidates for pattern reference)
    pattern_reference_files: [],
  }

  // Scan spec/test files for convention patterns
  const specEntries = entries.filter(
    (e) =>
      e.categoryName === 'testing' &&
      (e.path.endsWith('_spec.rb') || e.path.endsWith('_test.rb')),
  )

  // Count spec files by specCategory
  for (const entry of specEntries) {
    const cat = entry.specCategory || 'other'
    result.spec_counts[cat] = (result.spec_counts[cat] || 0) + 1
  }

  // Sample up to 20 spec files to detect conventions (avoid reading hundreds)
  const sampleSize = Math.min(specEntries.length, 20)
  const sampledEntries = specEntries.slice(0, sampleSize)

  for (const entry of sampledEntries) {
    const content = provider.readFile(entry.path)
    if (!content) continue

    // Let style detection
    const letMatches = (content.match(/^\s*let\s*\(/gm) || []).length
    const letBangMatches = (content.match(/^\s*let!\s*\(/gm) || []).length
    result.let_count += letMatches
    result.let_bang_count += letBangMatches

    // Subject usage
    if (/^\s*subject\s*[\s{(]/m.test(content)) {
      result.subject_usage = true
      result.subject_count++
    }

    // described_class usage
    if (/described_class/.test(content)) {
      result.described_class_usage = true
    }
  }

  // Determine let style
  if (result.let_count > 0 || result.let_bang_count > 0) {
    const ratio =
      result.let_bang_count / (result.let_count + result.let_bang_count)
    if (ratio > 0.7) result.let_style = 'eager'
    else if (ratio < 0.3) result.let_style = 'lazy'
    else result.let_style = 'mixed'
  }

  // Scan spec/support/ for shared examples, shared contexts, and custom matchers
  const supportEntries = entries.filter(
    (e) => e.path.startsWith('spec/support/') && e.path.endsWith('.rb'),
  )

  for (const entry of supportEntries) {
    const content = provider.readFile(entry.path)
    if (!content) continue

    // Shared examples
    const sharedExRe =
      /(?:shared_examples_for|shared_examples|RSpec\.shared_examples)\s+['"]([^'"]+)['"]/g
    let m
    while ((m = sharedExRe.exec(content))) {
      result.shared_examples.push(m[1])
    }

    // Shared contexts
    const sharedCtxRe =
      /(?:shared_context|RSpec\.shared_context)\s+['"]([^'"]+)['"]/g
    while ((m = sharedCtxRe.exec(content))) {
      result.shared_contexts.push(m[1])
    }

    // Custom matchers
    const matcherRe = /RSpec::Matchers\.define\s+:(\w+)/g
    while ((m = matcherRe.exec(content))) {
      result.custom_matchers.push(m[1])
    }

    // Also check for define_negated_matcher
    const negatedRe = /define_negated_matcher\s+:(\w+)/g
    while ((m = negatedRe.exec(content))) {
      result.custom_matchers.push(m[1])
    }
  }

  // Also check spec/shared_examples/ and spec/shared_contexts/ directories
  const sharedExampleEntries = entries.filter(
    (e) => e.path.startsWith('spec/shared_examples/') && e.path.endsWith('.rb'),
  )
  for (const entry of sharedExampleEntries) {
    const content = provider.readFile(entry.path)
    if (!content) continue
    const re = /(?:shared_examples_for|shared_examples)\s+['"]([^'"]+)['"]/g
    let m
    while ((m = re.exec(content))) {
      result.shared_examples.push(m[1])
    }
  }

  result.shared_examples_count = result.shared_examples.length
  result.shared_contexts_count = result.shared_contexts.length

  // Find well-tested files as pattern references
  result.pattern_reference_files = findPatternReferences(provider, specEntries)

  return result
}

/**
 * Detect authentication test helper.
 * @param {import('../providers/interface.js').FileProvider} provider
 * @param {Array<{path: string}>} entries
 * @param {object} gems
 * @returns {{strategy: string|null, helper_method: string|null, helper_file: string|null, setup_location: string|null}}
 */
function detectAuthHelper(provider, entries, gems) {
  const result = {
    strategy: null,
    helper_method: null,
    helper_file: null,
    setup_location: null,
  }

  // Check rails_helper.rb for Devise test helpers
  const railsHelper = provider.readFile('spec/rails_helper.rb')
  if (railsHelper) {
    if (/Devise::Test::IntegrationHelpers/.test(railsHelper)) {
      result.strategy = 'devise'
      result.helper_method = 'sign_in'
      result.helper_file = 'spec/rails_helper.rb'
      result.setup_location = 'spec/rails_helper.rb'
      return result
    }
    if (/Devise::Test::ControllerHelpers/.test(railsHelper)) {
      result.strategy = 'devise_controller'
      result.helper_method = 'sign_in'
      result.helper_file = 'spec/rails_helper.rb'
      result.setup_location = 'spec/rails_helper.rb'
      return result
    }
    if (/Warden::Test::Helpers/.test(railsHelper)) {
      result.strategy = 'warden'
      result.helper_method = 'login_as'
      result.helper_file = 'spec/rails_helper.rb'
      result.setup_location = 'spec/rails_helper.rb'
      return result
    }
  }

  // Check spec/support/ for custom auth helpers
  const supportEntries = entries.filter(
    (e) =>
      e.path.startsWith('spec/support/') &&
      e.path.endsWith('.rb') &&
      /auth/i.test(e.path),
  )

  for (const entry of supportEntries) {
    const content = provider.readFile(entry.path)
    if (!content) continue

    // Look for sign_in method definition
    const signInMatch = content.match(
      /def\s+(sign_in|log_in|login|authenticate)/,
    )
    if (signInMatch) {
      result.strategy = 'custom'
      result.helper_method = signInMatch[1]
      result.helper_file = entry.path
      result.setup_location = entry.path
      return result
    }
  }

  // Check for JWT/token auth patterns in support files
  for (const entry of supportEntries) {
    const content = provider.readFile(entry.path)
    if (!content) continue

    if (/auth.*header|bearer|jwt|token/i.test(content)) {
      result.strategy = 'token'
      result.helper_method = null
      result.helper_file = entry.path
      result.setup_location = entry.path
      return result
    }
  }

  return result
}

/**
 * Detect database cleaning/transaction strategy.
 * @param {import('../providers/interface.js').FileProvider} provider
 * @param {object} gems
 * @returns {{strategy: string|null, config_file: string|null}}
 */
function detectDatabaseStrategy(provider, gems) {
  const result = {
    strategy: null,
    config_file: null,
  }

  // Check rails_helper for use_transactional_fixtures
  const railsHelper = provider.readFile('spec/rails_helper.rb') || ''
  if (/use_transactional_fixtures\s*=\s*true/.test(railsHelper)) {
    result.strategy = 'transactional_fixtures'
    result.config_file = 'spec/rails_helper.rb'
    return result
  }

  // Check for database_cleaner
  if (gems.database_cleaner || gems['database_cleaner-active_record']) {
    result.strategy = 'database_cleaner'

    // Detect strategy type
    const supportFiles = [
      'spec/support/database_cleaner.rb',
      'spec/support/database_cleaner_config.rb',
    ]
    for (const path of supportFiles) {
      const content = provider.readFile(path)
      if (content) {
        result.config_file = path
        if (/strategy\s*=\s*:truncation/.test(content)) {
          result.strategy = 'database_cleaner:truncation'
        } else if (/strategy\s*=\s*:transaction/.test(content)) {
          result.strategy = 'database_cleaner:transaction'
        }
        break
      }
    }
    return result
  }

  return result
}

/**
 * Find well-structured spec files as pattern references for each category.
 * Selects the spec file with the most describe/context blocks per category.
 * @param {import('../providers/interface.js').FileProvider} provider
 * @param {Array<{path: string, specCategory?: string}>} specEntries
 * @returns {Array<{path: string, category: string, describe_count: number, example_count: number}>}
 */
function findPatternReferences(provider, specEntries) {
  const byCategory = {}

  for (const entry of specEntries) {
    const cat = entry.specCategory
    if (!cat || cat === 'factories' || cat === 'support') continue

    const content = provider.readFile(entry.path)
    if (!content) continue

    // Handle both RSpec and Minitest structural patterns
    const describeCount = (
      content.match(/^\s*(?:describe|context|class\s+\w+Test)\s/gm) || []
    ).length
    const exampleCount = (
      content.match(/^\s*(?:it\s|def\s+test_|test\s+['"])/gm) || []
    ).length

    // Skip trivially small files
    if (exampleCount < 3) continue

    if (!byCategory[cat] || describeCount > byCategory[cat].describe_count) {
      byCategory[cat] = {
        path: entry.path,
        category: cat,
        describe_count: describeCount,
        example_count: exampleCount,
      }
    }
  }

  return Object.values(byCategory)
}
