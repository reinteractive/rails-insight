/**
 * Shared constants used across tools and core modules.
 * Avoids magic numbers scattered through the codebase.
 */

/** Default token budget for blast radius / review context responses. */
export const DEFAULT_TOKEN_BUDGET = 8000

/** Default token budget for full index output. */
export const DEFAULT_FULL_INDEX_BUDGET = 12000

/** Maximum key models/controllers shown in overview. */
export const MAX_KEY_ENTITIES = 8

/** Maximum character length for example spec content. */
export const MAX_EXAMPLE_CONTENT_LENGTH = 5000

/** Coverage percentage at or above which a file is considered well-covered. */
export const WELL_COVERED_THRESHOLD = 90

/** Maximum buffer size (bytes) for shell command execution. */
export const EXEC_MAX_BUFFER = 1024 * 1024

/** Timeout (ms) for shell command execution. */
export const EXEC_TIMEOUT_MS = 10000

/** Precision multiplier for PageRank score rounding. */
export const RANK_PRECISION = 10000

/** Timeout (ms) for Ruby introspection script execution. */
export const INTROSPECTION_TIMEOUT_MS = 30_000

/** Maximum associations per model to prevent runaway introspection output. */
export const INTROSPECTION_MAX_ASSOCIATIONS = 200

/** Maximum routes to include from runtime introspection. */
export const INTROSPECTION_MAX_ROUTES = 500

/**
 * Round to one decimal percentage: (numerator / denominator) as XX.X%.
 * @param {number} numerator
 * @param {number} denominator
 * @returns {number|null}
 */
export function toOneDecimalPercent(numerator, denominator) {
  if (denominator <= 0) return null
  return Math.round((numerator / denominator) * 1000) / 10
}
