/**
 * Token estimation utilities.
 * Uses the approximation: 4 characters ≈ 1 token.
 */

/**
 * Estimate tokens for a text string.
 * @param {string} text
 * @returns {number}
 */
export function estimateTokens(text) {
  if (!text) return 0
  return Math.ceil(text.length / 4)
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
