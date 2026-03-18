/**
 * Coverage Snapshot Extractor
 * Parses SimpleCov JSON output and cross-references with structural
 * data to produce per-file, per-method coverage analysis.
 *
 * @module coverage-snapshot
 */

/**
 * Extract coverage snapshot from SimpleCov output.
 * @param {import('../providers/interface.js').FileProvider} provider
 * @param {object} [modelExtractions] - Pre-extracted model data (for method line mapping)
 * @param {object} [controllerExtractions] - Pre-extracted controller data
 * @returns {object}
 */
export function extractCoverageSnapshot(
  provider,
  modelExtractions = {},
  controllerExtractions = {},
) {
  const result = {
    available: false,
    tool: null,
    overall: {
      line_coverage: null,
      branch_coverage: null,
      files_tracked: 0,
    },
    per_file: {},
    uncovered_methods: [],
    timestamp: null,
  }

  // Try to read SimpleCov JSON output
  const coverageRaw = provider.readFile('coverage/coverage.json')
  if (!coverageRaw) {
    // Also try .resultset.json (older SimpleCov format)
    const resultsetRaw = provider.readFile('coverage/.resultset.json')
    if (!resultsetRaw) return result
    return parseResultSet(
      resultsetRaw,
      result,
      modelExtractions,
      controllerExtractions,
    )
  }

  let coverageData
  try {
    coverageData = JSON.parse(coverageRaw)
  } catch {
    return result
  }

  result.available = true
  result.tool = 'simplecov'
  result.timestamp = coverageData.timestamp || null

  // SimpleCov coverage.json structure varies by version
  // Modern: { "coverage": { "file_path": { "lines": [...], "branches": {...} } } }
  // Legacy: { "RSpec": { "coverage": { "file_path": { "lines": [...] } } } }
  let fileCoverage = {}

  if (coverageData.coverage) {
    fileCoverage = coverageData.coverage
  } else {
    // Legacy format: find first test suite key
    for (const key of Object.keys(coverageData)) {
      if (coverageData[key] && coverageData[key].coverage) {
        fileCoverage = coverageData[key].coverage
        break
      }
    }
  }

  let totalLines = 0
  let coveredLines = 0
  let totalBranches = 0
  let coveredBranches = 0

  for (const [filePath, fileData] of Object.entries(fileCoverage)) {
    const relativePath = normaliseToRelative(filePath)
    if (!relativePath) continue

    // Extract line coverage data
    const lineData = Array.isArray(fileData) ? fileData : fileData.lines || []

    let fileTotal = 0
    let fileCovered = 0
    const uncoveredLineNumbers = []

    for (let i = 0; i < lineData.length; i++) {
      const val = lineData[i]
      if (val === null) continue // Non-relevant line (comments, blanks)
      fileTotal++
      totalLines++
      if (val > 0) {
        fileCovered++
        coveredLines++
      } else {
        uncoveredLineNumbers.push(i + 1) // 1-indexed
      }
    }

    const fileCoveragePercent =
      fileTotal > 0 ? Math.round((fileCovered / fileTotal) * 1000) / 10 : null

    result.per_file[relativePath] = {
      line_coverage: fileCoveragePercent,
      lines_total: fileTotal,
      lines_covered: fileCovered,
      uncovered_lines: uncoveredLineNumbers,
    }

    // Branch coverage if available
    if (fileData.branches && typeof fileData.branches === 'object') {
      for (const [, branchData] of Object.entries(fileData.branches)) {
        if (typeof branchData === 'object') {
          for (const count of Object.values(branchData)) {
            totalBranches++
            if (count > 0) coveredBranches++
          }
        }
      }

      const fileBranchTotal = Object.values(fileData.branches).reduce(
        (sum, bd) => {
          return sum + (typeof bd === 'object' ? Object.keys(bd).length : 0)
        },
        0,
      )
      const fileBranchCovered = Object.values(fileData.branches).reduce(
        (sum, bd) => {
          if (typeof bd !== 'object') return sum
          return sum + Object.values(bd).filter((c) => c > 0).length
        },
        0,
      )

      if (fileBranchTotal > 0) {
        result.per_file[relativePath].branch_coverage =
          Math.round((fileBranchCovered / fileBranchTotal) * 1000) / 10
      }
    }

    // Cross-reference uncovered lines with method line ranges
    mapUncoveredMethods(
      relativePath,
      uncoveredLineNumbers,
      modelExtractions,
      controllerExtractions,
      result.uncovered_methods,
    )
  }

  result.overall.line_coverage =
    totalLines > 0 ? Math.round((coveredLines / totalLines) * 1000) / 10 : null
  result.overall.branch_coverage =
    totalBranches > 0
      ? Math.round((coveredBranches / totalBranches) * 1000) / 10
      : null
  result.overall.files_tracked = Object.keys(result.per_file).length

  return result
}

/**
 * Map uncovered line numbers to specific methods using extractor data.
 * @param {string} filePath
 * @param {number[]} uncoveredLines
 * @param {object} modelExtractions
 * @param {object} controllerExtractions
 * @param {Array} outputArray - mutated, results pushed here
 */
function mapUncoveredMethods(
  filePath,
  uncoveredLines,
  modelExtractions,
  controllerExtractions,
  outputArray,
) {
  if (uncoveredLines.length === 0) return

  // Find the extraction for this file
  let methodRanges = null
  let entityName = null
  let entityType = null

  // Check models
  for (const [name, model] of Object.entries(modelExtractions)) {
    if (model.file === filePath && model.method_line_ranges) {
      methodRanges = model.method_line_ranges
      entityName = name
      entityType = 'model'
      break
    }
  }

  // Check controllers
  if (!methodRanges) {
    for (const [name, ctrl] of Object.entries(controllerExtractions)) {
      if (ctrl.file === filePath && ctrl.action_line_ranges) {
        methodRanges = ctrl.action_line_ranges
        entityName = name
        entityType = 'controller'
        break
      }
    }
  }

  if (!methodRanges) return

  for (const [methodName, range] of Object.entries(methodRanges)) {
    const uncoveredInMethod = uncoveredLines.filter(
      (line) => line >= range.start && line <= range.end,
    )
    const totalMethodLines = range.end - range.start + 1

    if (uncoveredInMethod.length > 0) {
      outputArray.push({
        file: filePath,
        entity: entityName,
        entity_type: entityType,
        method: methodName,
        uncovered_lines: uncoveredInMethod.length,
        total_lines: totalMethodLines,
        coverage:
          Math.round(
            ((totalMethodLines - uncoveredInMethod.length) / totalMethodLines) *
              1000,
          ) / 10,
      })
    }
  }
}

/**
 * Normalise an absolute file path to a project-relative path.
 * @param {string} filePath
 * @returns {string|null}
 */
function normaliseToRelative(filePath) {
  // Already relative?
  if (filePath.startsWith('app/') || filePath.startsWith('lib/')) {
    return filePath
  }

  // SimpleCov uses absolute paths. Find the app/ or lib/ prefix.
  // Prefer app/ match first since it's unambiguous
  const appIdx = filePath.indexOf('/app/')
  if (appIdx !== -1) return filePath.slice(appIdx + 1)

  // For lib/, only match if it appears to be a project lib/ (not inside a gem path)
  // Gem paths typically contain /gems/ before /lib/
  const libIdx = filePath.indexOf('/lib/')
  if (libIdx !== -1 && !filePath.includes('/gems/')) {
    return filePath.slice(libIdx + 1)
  }

  return null
}

/**
 * Parse legacy .resultset.json format.
 * @param {string} raw
 * @param {object} result
 * @param {object} modelExtractions
 * @param {object} controllerExtractions
 * @returns {object}
 */
function parseResultSet(raw, result, modelExtractions, controllerExtractions) {
  try {
    const data = JSON.parse(raw)
    // .resultset.json: { "SuiteName": { "coverage": { ... }, "timestamp": ... } }
    for (const key of Object.keys(data)) {
      if (data[key] && data[key].coverage) {
        // Re-use the main parser by constructing a coverage.json-like structure
        const syntheticRaw = JSON.stringify({
          coverage: data[key].coverage,
          timestamp: data[key].timestamp || null,
        })
        const provider = {
          readFile(path) {
            if (path === 'coverage/coverage.json') return syntheticRaw
            return null
          },
        }
        return extractCoverageSnapshot(
          provider,
          modelExtractions,
          controllerExtractions,
        )
      }
    }
  } catch {
    // Fall through
  }
  return result
}
