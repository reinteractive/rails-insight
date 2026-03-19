/**
 * Git diff detection and file parsing.
 * Detects changed files via git commands or parses raw diff output.
 */

const STATUS_MAP = {
  M: 'modified',
  A: 'added',
  D: 'deleted',
  R: 'renamed',
  C: 'copied',
  T: 'type-changed',
}

/**
 * Parse a raw git diff --name-status output string into structured data.
 * @param {string} rawOutput
 * @returns {Array<{path: string, status: string}>}
 */
export function parseDiffOutput(rawOutput) {
  if (!rawOutput || !rawOutput.trim()) return []

  return rawOutput
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => parseDiffLine(line))
    .filter(Boolean)
}

/**
 * Parse a single diff line.
 * @param {string} line
 * @returns {{path: string, status: string, oldPath?: string}|null}
 */
function parseDiffLine(line) {
  const parts = line.split('\t')
  if (parts.length < 2) return null

  const statusCode = parts[0].charAt(0)
  const status = STATUS_MAP[statusCode] || 'unknown'

  if (statusCode === 'R' || statusCode === 'C') {
    return { path: parts[2] || parts[1], status, oldPath: parts[1] }
  }
  return { path: parts[1], status }
}

/**
 * Parse untracked file listing into structured data.
 * @param {string} rawOutput
 * @returns {Array<{path: string, status: string}>}
 */
function parseUntrackedOutput(rawOutput) {
  if (!rawOutput || !rawOutput.trim()) return []
  return rawOutput
    .split('\n')
    .filter((line) => line.trim())
    .map((path) => ({ path: path.trim(), status: 'added' }))
}

/**
 * Validate that a git ref is safe for shell interpolation.
 * Allows alphanumeric chars, dots, hyphens, slashes, tildes, carets, at-signs,
 * braces, and colons — all legal in git refs but no shell metacharacters.
 * @param {string} ref
 * @returns {boolean}
 */
function isValidGitRef(ref) {
  return /^[\w.\-/~^@{}:]+$/.test(ref)
}

/**
 * Detect changed files relative to a base ref.
 * @param {import('../providers/interface.js').FileProvider} provider
 * @param {string} [baseRef='HEAD'] - Git ref to diff against
 * @param {Object} [options]
 * @param {boolean} [options.staged] - Only staged changes (default: false)
 * @param {boolean} [options.includeUntracked] - Include untracked files (default: true)
 * @returns {Promise<{files: Array<{path: string, status: string}>, baseRef: string, error: string|null}>}
 */
export async function detectChangedFiles(
  provider,
  baseRef = 'HEAD',
  options = {},
) {
  const { staged = false, includeUntracked = true } = options

  if (typeof provider.execCommand !== 'function') {
    return {
      files: [],
      baseRef,
      error: 'Provider does not support execCommand',
    }
  }

  if (!staged && !isValidGitRef(baseRef)) {
    return {
      files: [],
      baseRef,
      error: 'Invalid git ref: contains unsafe characters',
    }
  }

  const diffCommand = staged
    ? 'git diff --name-status --cached'
    : `git diff --name-status ${baseRef}`

  const diffResult = await provider.execCommand(diffCommand)

  if (diffResult.exitCode !== 0 && diffResult.stderr) {
    const isNotGit =
      diffResult.stderr.includes('not a git repository') ||
      diffResult.stderr.includes('Not a git repository')
    if (isNotGit) {
      return { files: [], baseRef, error: 'Not a git repository' }
    }
    return { files: [], baseRef, error: diffResult.stderr.trim() }
  }

  const files = parseDiffOutput(diffResult.stdout)

  if (includeUntracked) {
    const untrackedResult = await provider.execCommand(
      'git ls-files --others --exclude-standard',
    )
    if (untrackedResult.exitCode === 0) {
      files.push(...parseUntrackedOutput(untrackedResult.stdout))
    }
  }

  return { files, baseRef, error: null }
}
