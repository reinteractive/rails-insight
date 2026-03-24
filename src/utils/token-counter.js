/**
 * Token estimation utilities.
 * Uses content-aware character-per-token ratios for more accurate estimation.
 */

/** Characters-per-token ratio for different content types. */
const CHARS_PER_TOKEN_PROSE = 4.0
const CHARS_PER_TOKEN_JSON = 3.0
const CHARS_PER_TOKEN_CODE = 3.5

/**
 * Detect content type and return appropriate chars-per-token ratio.
 * @param {string} text
 * @returns {number}
 */
function detectContentRatio(text) {
  if (text.length < 10) return CHARS_PER_TOKEN_PROSE
  const sample = text.slice(0, 200)
  const jsonIndicators = (sample.match(/[{}\[\]:,"]/g) || []).length
  const ratio = jsonIndicators / sample.length
  if (ratio > 0.15) return CHARS_PER_TOKEN_JSON
  if (ratio > 0.05) return CHARS_PER_TOKEN_CODE
  return CHARS_PER_TOKEN_PROSE
}

/**
 * Estimate tokens for a text string.
 * @param {string} text
 * @returns {number}
 */
export function estimateTokens(text) {
  if (!text) return 0
  const ratio = detectContentRatio(text)
  return Math.ceil(text.length / ratio)
}

/**
 * Estimate tokens for a JSON-serializable object.
 * @param {Object} obj
 * @returns {number}
 */
export function estimateTokensForObject(obj) {
  if (obj === null || obj === undefined) return 0
  const json = JSON.stringify(obj)
  return estimateTokens(json)
}
