/**
 * Shared spec style detection utility.
 * Detects whether a project uses request specs or controller specs.
 *
 * @module spec-style-detector
 */

/**
 * Detect spec style (request vs controller specs), with Minitest fallback.
 * @param {Array<{path: string}>} entries
 * @returns {{primary: string, request_count: number, controller_count: number, has_mixed: boolean}}
 */
export function detectSpecStyle(entries) {
  const requestCount = entries.filter((e) =>
    e.path.startsWith('spec/requests/'),
  ).length
  const controllerCount = entries.filter((e) =>
    e.path.startsWith('spec/controllers/'),
  ).length
  const hasAnySpec = entries.some((e) => e.path.startsWith('spec/'))
  const hasMinitestDir = entries.some((e) => e.path.startsWith('test/'))

  // Minitest fallback: test/ dir present but no spec/ dir
  if (!hasAnySpec && hasMinitestDir) {
    return {
      primary: 'minitest',
      request_count: 0,
      controller_count: 0,
      has_mixed: false,
    }
  }

  return {
    primary: requestCount >= controllerCount ? 'request' : 'controller',
    request_count: requestCount,
    controller_count: controllerCount,
    has_mixed: requestCount > 0 && controllerCount > 0,
  }
}
