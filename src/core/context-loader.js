/**
 * Layer 1: Project Context Loader
 *
 * Parses the project's claude.md (or similar instruction file) to extract
 * declared conventions, stack, and project context. This information is
 * compared against actual codebase scan results by the drift detector.
 *
 * @module context-loader
 */

/**
 * @typedef {Object} ProjectContext
 * @property {boolean} found - Whether a claude.md file was found
 * @property {string|null} raw - Raw file contents
 * @property {Object} declared - Extracted declarations
 * @property {string[]} declared.stack - Declared technology stack items
 * @property {string[]} declared.conventions - Declared coding conventions
 * @property {string[]} declared.patterns - Declared design patterns
 * @property {string[]} declared.gems - Explicitly mentioned gems
 * @property {string[]} declared.testing - Declared testing approach
 * @property {string[]} declared.deployment - Declared deployment approach
 * @property {string|null} declared.rubyVersion - Declared Ruby version
 * @property {string|null} declared.railsVersion - Declared Rails version
 * @property {string[]} warnings - Any parsing warnings
 */

const SECTION_HEADINGS = /^#{1,3}\s+(.+)/
const BULLET_ITEM = /^\s*[-*]\s+(.+)/
const NUMBERED_ITEM = /^\s*\d+[.)]\s+(.+)/

const STACK_KEYWORDS =
  /\b(rails|ruby|postgres|postgresql|mysql|sqlite|redis|sidekiq|puma|nginx|docker|kamal|heroku|aws|gcp|elasticsearch|memcached|mongodb|solid.?queue|solid.?cache|solid.?cable|turbo|stimulus|hotwire|webpacker|propshaft|sprockets|import.?maps|tailwind|bootstrap|esbuild|rollup|vite)\b/i

const GEM_PATTERN =
  /\b(devise|pundit|cancancan|paper_trail|friendly_id|acts_as_tenant|activeadmin|administrate|avo|ransack|pagy|kaminari|searchkick|pg_search|pay|stripe|rspec|minitest|factory_bot|faker|capybara|rubocop|brakeman|bullet|rack-mini-profiler|faraday|httparty|aasm|statesman|noticed|flipper|discard|paranoia|wicked_pdf|prawn|grover|whenever|sidekiq-cron|action_text|noticed|good_job)\b/i

const VERSION_PATTERN = /\bruby\s+(\d+\.\d+(?:\.\d+)?)\b/i
const RAILS_VERSION_PATTERN = /\brails\s+(\d+\.\d+(?:\.\d+)?)\b/i

const CONVENTION_KEYWORDS =
  /\b(convention|pattern|approach|practice|standard|guideline|rule|must|should|always|never|prefer|avoid|use|don't use)\b/i

const TESTING_KEYWORDS =
  /\b(rspec|minitest|test|testing|spec|factory|fixture|capybara|system test|integration test|unit test|coverage)\b/i

const DEPLOY_KEYWORDS =
  /\b(deploy|kamal|capistrano|heroku|docker|kubernetes|ci|cd|pipeline|staging|production|github actions?)\b/i

const PATTERN_KEYWORDS =
  /\b(service object|form object|query object|decorator|presenter|interactor|concern|module|mixin|observer|callback|middleware|serializer|policy|ability)\b/i

/**
 * Load and parse project context from a claude.md file.
 *
 * @param {import('../providers/interface.js').FileProvider} provider - File access provider
 * @param {string} [claudeMdPath='claude.md'] - Relative path to the context file
 * @returns {ProjectContext} Parsed project context
 */
export function loadProjectContext(provider, claudeMdPath = 'claude.md') {
  const raw = provider.readFile(claudeMdPath)

  if (raw === null) {
    return {
      found: false,
      raw: null,
      declared: emptyDeclared(),
      warnings: [`No context file found at ${claudeMdPath}`],
    }
  }

  const warnings = []
  const declared = emptyDeclared()
  const lines = raw.split('\n')

  let currentSection = ''

  for (const line of lines) {
    const headingMatch = line.match(SECTION_HEADINGS)
    if (headingMatch) {
      currentSection = headingMatch[1].toLowerCase().trim()
      continue
    }

    const content = extractLineContent(line)
    if (!content) continue

    // Extract stack items
    const stackMatches = content.match(new RegExp(STACK_KEYWORDS.source, 'gi'))
    if (stackMatches) {
      for (const m of stackMatches) {
        const normalized = m.toLowerCase()
        if (!declared.stack.includes(normalized)) {
          declared.stack.push(normalized)
        }
      }
    }

    // Extract gem mentions
    const gemMatches = content.match(new RegExp(GEM_PATTERN.source, 'gi'))
    if (gemMatches) {
      for (const m of gemMatches) {
        const normalized = m.toLowerCase()
        if (!declared.gems.includes(normalized)) {
          declared.gems.push(normalized)
        }
      }
    }

    // Extract versions
    const rubyVer = content.match(VERSION_PATTERN)
    if (rubyVer && !declared.rubyVersion) {
      declared.rubyVersion = rubyVer[1]
    }

    const railsVer = content.match(RAILS_VERSION_PATTERN)
    if (railsVer && !declared.railsVersion) {
      declared.railsVersion = railsVer[1]
    }

    // Classify lines by section context and keywords
    if (isTestingContext(currentSection, content)) {
      addUnique(declared.testing, content)
    }

    if (isDeployContext(currentSection, content)) {
      addUnique(declared.deployment, content)
    }

    if (isConventionContext(currentSection, content)) {
      addUnique(declared.conventions, content)
    }

    if (PATTERN_KEYWORDS.test(content)) {
      addUnique(declared.patterns, content)
    }
  }

  return { found: true, raw, declared, warnings }
}

/**
 * @returns {Object} Empty declared structure
 */
function emptyDeclared() {
  return {
    stack: [],
    conventions: [],
    patterns: [],
    gems: [],
    testing: [],
    deployment: [],
    rubyVersion: null,
    railsVersion: null,
  }
}

/**
 * Extract meaningful content from a line (bullet, numbered, or plain text).
 * @param {string} line
 * @returns {string|null}
 */
function extractLineContent(line) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) return null

  const bullet = trimmed.match(BULLET_ITEM)
  if (bullet) return bullet[1].trim()

  const numbered = trimmed.match(NUMBERED_ITEM)
  if (numbered) return numbered[1].trim()

  return trimmed
}

/**
 * @param {string} section
 * @param {string} content
 * @returns {boolean}
 */
function isTestingContext(section, content) {
  return (
    section.includes('test') ||
    section.includes('spec') ||
    section.includes('quality') ||
    TESTING_KEYWORDS.test(content)
  )
}

/**
 * @param {string} section
 * @param {string} content
 * @returns {boolean}
 */
function isDeployContext(section, content) {
  return (
    section.includes('deploy') ||
    section.includes('infrastructure') ||
    section.includes('hosting') ||
    DEPLOY_KEYWORDS.test(content)
  )
}

/**
 * @param {string} section
 * @param {string} content
 * @returns {boolean}
 */
function isConventionContext(section, content) {
  return (
    section.includes('convention') ||
    section.includes('standard') ||
    section.includes('guideline') ||
    section.includes('rule') ||
    section.includes('style') ||
    CONVENTION_KEYWORDS.test(content)
  )
}

/**
 * @param {string[]} arr
 * @param {string} item
 */
function addUnique(arr, item) {
  if (!arr.includes(item)) {
    arr.push(item)
  }
}
