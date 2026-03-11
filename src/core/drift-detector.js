/**
 * Convention Drift Detector
 * Compares declared conventions (from claude.md / context) against
 * detected patterns from extractions to flag mismatches.
 */

/**
 * Detect convention drift between declared and actual state.
 * @param {object} declared - From context loader (claude.md parsed data)
 * @param {object} versions - From version detector
 * @param {object} extractions - All extraction results
 * @returns {Array<{category: string, declared: string, actual: string, severity: string}>}
 */
export function detectDrift(declared = {}, versions = {}, extractions = {}) {
  const drift = []

  detectEnumSyntaxDrift(drift, versions, extractions)
  detectTestingDrift(drift, declared, extractions)
  detectViewsDrift(drift, declared, extractions)
  detectStimulusDrift(drift, declared, extractions)
  detectAuthDrift(drift, declared, extractions)

  return drift
}

/**
 * Check for legacy enum syntax in Rails 7+ apps.
 */
function detectEnumSyntaxDrift(drift, versions, extractions) {
  const railsVersion = versions.rails ? parseFloat(versions.rails) : 0
  if (railsVersion < 7.0) return

  if (extractions.models) {
    let legacyCount = 0
    for (const model of Object.values(extractions.models)) {
      if (model.enums) {
        for (const e of Object.values(model.enums)) {
          // Legacy hash syntax: enum status: { ... }
          if (e.syntax === 'legacy') legacyCount++
        }
      }
    }
    if (legacyCount > 0) {
      drift.push({
        category: 'enum_syntax',
        declared: `Rails ${versions.rails} (modern enum syntax expected)`,
        actual: `${legacyCount} model(s) use legacy hash syntax`,
        severity: 'low',
      })
    }
  }
}

/**
 * Check for testing convention drift.
 */
function detectTestingDrift(drift, declared, extractions) {
  if (!declared.conventions) return

  const testConventions = declared.conventions.filter((c) =>
    /test|spec|rspec/i.test(c),
  )

  if (
    testConventions.length > 0 &&
    extractions.tier2 &&
    extractions.tier2.testing
  ) {
    const framework = extractions.tier2.testing.framework
    for (const conv of testConventions) {
      if (/rspec/i.test(conv) && framework === 'minitest') {
        drift.push({
          category: 'testing',
          declared: conv,
          actual: 'Project uses minitest, not rspec',
          severity: 'medium',
        })
      }
      if (/minitest/i.test(conv) && framework === 'rspec') {
        drift.push({
          category: 'testing',
          declared: conv,
          actual: 'Project uses rspec, not minitest',
          severity: 'medium',
        })
      }
    }
  }
}

/**
 * Check for views convention drift.
 */
function detectViewsDrift(drift, declared, extractions) {
  if (!declared.conventions) return

  const viewConventions = declared.conventions.filter((c) =>
    /partial|erb|haml|slim/i.test(c),
  )

  for (const conv of viewConventions) {
    if (/no.*partial/i.test(conv) && extractions.views) {
      const partialCount = extractions.views.partial_renders || 0
      if (partialCount > 0) {
        drift.push({
          category: 'views',
          declared: conv,
          actual: `${partialCount} partials found`,
          severity: 'low',
        })
      }
    }
  }
}

/**
 * Check for Stimulus convention drift.
 */
function detectStimulusDrift(drift, declared, extractions) {
  if (!declared.conventions) return

  const stimConventions = declared.conventions.filter((c) =>
    /stimulus|controller/i.test(c),
  )

  if (stimConventions.length === 0) return

  for (const conv of stimConventions) {
    if (/flat/i.test(conv) && extractions.stimulus_controllers) {
      const nested = extractions.stimulus_controllers.some(
        (sc) => sc.identifier && sc.identifier.includes('--'),
      )
      if (nested) {
        drift.push({
          category: 'stimulus',
          declared: conv,
          actual: 'Nested Stimulus controller directories detected',
          severity: 'low',
        })
      }
    }
  }
}

/**
 * Check for auth convention drift.
 */
function detectAuthDrift(drift, declared, extractions) {
  if (!declared.stack) return

  const stackAuth = Array.isArray(declared.stack)
    ? declared.stack.filter((s) => /devise|auth/i.test(s))
    : []

  if (stackAuth.length > 0 && extractions.auth) {
    if (
      stackAuth.some((s) => /devise/i.test(s)) &&
      extractions.auth.primary_strategy !== 'devise'
    ) {
      drift.push({
        category: 'auth',
        declared: 'Devise in stack',
        actual: `Primary auth strategy: ${extractions.auth.primary_strategy || 'none'}`,
        severity: 'medium',
      })
    }
  }
}
