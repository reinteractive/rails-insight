/**
 * Token-Budgeted Formatter
 * Uses binary search to find maximal content within a token budget.
 */

import { estimateTokens } from '../utils/token-counter.js'

/** Default token budget */
const DEFAULT_BUDGET = 12000

/**
 * Format index output to fit within a token budget.
 * @param {object} fullIndex - Complete index object
 * @param {number} [tokenBudget] - Target token budget
 * @returns {object} Trimmed index
 */
export function formatOutput(fullIndex, tokenBudget = DEFAULT_BUDGET) {
  if (!fullIndex || typeof fullIndex !== 'object') return {}

  const fullJson = JSON.stringify(fullIndex)
  const fullTokens = estimateTokens(fullJson)

  // If it fits, return as-is
  if (fullTokens <= tokenBudget) return fullIndex

  // Priority-ordered sections to include
  const sections = [
    'version',
    'generated_at',
    'versions',
    'statistics',
    'context',
    'manifest',
    'drift',
    'rankings',
    'relationships',
    'extractions',
  ]

  // Build output by adding sections in priority order
  const result = {}
  let currentTokens = 2 // for {}

  for (const section of sections) {
    if (!(section in fullIndex)) continue

    const value = fullIndex[section]
    const sectionJson = JSON.stringify({ [section]: value })
    const sectionTokens = estimateTokens(sectionJson)

    if (currentTokens + sectionTokens <= tokenBudget) {
      result[section] = value
      currentTokens += sectionTokens
    } else {
      // Try to fit a trimmed version of the section
      const trimmed = trimSection(section, value, tokenBudget - currentTokens)
      if (trimmed !== null) {
        result[section] = trimmed
        currentTokens += estimateTokens(JSON.stringify({ [section]: trimmed }))
      }
      // Continue to try remaining sections
    }
  }

  // Add any remaining top-level keys not in priority list
  for (const key of Object.keys(fullIndex)) {
    if (key in result) continue
    const val = fullIndex[key]
    const kJson = JSON.stringify({ [key]: val })
    const kTokens = estimateTokens(kJson)
    if (currentTokens + kTokens <= tokenBudget) {
      result[key] = val
      currentTokens += kTokens
    }
  }

  return result
}

/**
 * Trim a section to fit within available tokens.
 * @param {string} sectionName
 * @param {*} value
 * @param {number} availableTokens
 * @returns {*} Trimmed value or null
 */
function trimSection(sectionName, value, availableTokens) {
  if (availableTokens <= 10) return null

  if (sectionName === 'extractions' && typeof value === 'object') {
    return trimExtractions(value, availableTokens)
  }

  if (Array.isArray(value)) {
    const trimmed = trimArray(value, availableTokens)
    return trimmed.length > 0 ? trimmed : null
  }

  if (typeof value === 'object' && value !== null) {
    return trimObject(value, availableTokens)
  }

  return null
}

/**
 * Trim extractions to fit available tokens using binary search.
 * Higher priority sections are kept first.
 */
function trimExtractions(extractions, availableTokens) {
  const priorityOrder = [
    'gemfile',
    'schema',
    'models',
    'controllers',
    'routes',
    'auth',
    'config',
    'jobs',
    'email',
    'storage',
    'caching',
    'realtime',
    'api',
    'views',
    'components',
    'stimulus',
    'authorization',
    'tier2',
    'tier3',
  ]

  const keys = Object.keys(extractions)
  const ordered = [
    ...priorityOrder.filter((k) => keys.includes(k)),
    ...keys.filter((k) => !priorityOrder.includes(k)),
  ]

  const result = {}
  let usedTokens = 2

  for (const key of ordered) {
    const json = JSON.stringify({ [key]: extractions[key] })
    const tokens = estimateTokens(json)
    if (usedTokens + tokens <= availableTokens) {
      result[key] = extractions[key]
      usedTokens += tokens
    }
  }

  return Object.keys(result).length > 0 ? result : null
}

/**
 * Binary search to find maximal array slice within budget.
 */
function trimArray(arr, availableTokens) {
  if (!arr.length) return arr

  let lo = 0
  let hi = arr.length
  let best = 0

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2)
    const slice = arr.slice(0, mid)
    const tokens = estimateTokens(JSON.stringify(slice))
    if (tokens <= availableTokens) {
      best = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }

  return arr.slice(0, best)
}

/**
 * Trim an object to fit available tokens by including keys greedily.
 */
function trimObject(obj, availableTokens) {
  const keys = Object.keys(obj)
  const result = {}
  let used = 2 // {}

  for (const key of keys) {
    const entryJson = JSON.stringify({ [key]: obj[key] })
    const entryTokens = estimateTokens(entryJson)
    if (used + entryTokens <= availableTokens) {
      result[key] = obj[key]
      used += entryTokens
    }
  }

  return Object.keys(result).length > 0 ? result : null
}
