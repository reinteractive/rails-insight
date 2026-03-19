#!/usr/bin/env node

import { parseArgs } from 'node:util'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const options = {
  'project-root': { type: 'string', short: 'p' },
  'claude-md': { type: 'string' },
  mode: { type: 'string', short: 'm', default: 'local' },
  port: { type: 'string', default: '3000' },
  verbose: { type: 'boolean', short: 'v', default: false },
  help: { type: 'boolean', short: 'h', default: false },
}

const HELP_TEXT = `
RailsInsight — Rails-Aware Codebase Indexer (MCP Server)

Usage:
  railsinsight --project-root <path> [options]

Options:
  -p, --project-root <path>   Path to Rails project root (required for local mode)
  --claude-md <path>          Path to claude.md file (defaults to {project-root}/claude.md)
  -m, --mode <mode>           Server mode: local or remote (default: local)
  --port <number>             Port for remote mode (default: 3000)
  -v, --verbose               Enable verbose logging to stderr
  -h, --help                  Show this help message

Examples:
  railsinsight --project-root /path/to/rails/app
  railsinsight -p . --verbose
`

/**
 * Run the CLI with injectable dependencies for testing.
 * @param {string[]} argv
 * @param {Object} deps
 * @returns {Promise<number>} Process exit code
 */
export async function main(argv = process.argv.slice(2), deps = {}) {
  const writeStdout = deps.writeStdout || ((text) => process.stdout.write(text))
  const writeStderr = deps.writeStderr || ((text) => process.stderr.write(text))
  const parseArgsFn = deps.parseArgsFn || parseArgs
  const existsSyncFn = deps.existsSyncFn || existsSync
  const resolvePath = deps.resolvePath || resolve
  const importServer = deps.importServer || (() => import('../src/server.js'))

  let parsed
  try {
    parsed = parseArgsFn({ args: argv, options, allowPositionals: false })
  } catch (err) {
    writeStderr(`Error: ${err.message}\n`)
    writeStderr('Run with --help for usage information.\n')
    return 1
  }

  const { values } = parsed

  if (values.help) {
    writeStdout(HELP_TEXT)
    return 0
  }

  const mode = values.mode || 'local'

  if (mode === 'local') {
    const projectRoot = resolvePath(values['project-root'] || '.')

    if (!existsSyncFn(projectRoot)) {
      writeStderr(`Error: Project root does not exist: ${projectRoot}\n`)
      return 1
    }

    const claudeMdPath = values['claude-md'] || null
    const verbose = values.verbose || false

    const { startLocal } = await importServer()
    await startLocal(projectRoot, { claudeMdPath, verbose, tier: 'pro' })
    return 0
  }

  if (mode === 'remote') {
    const port = parseInt(values.port || '3000', 10)
    const verbose = values.verbose || false

    const { startRemote } = await importServer()
    await startRemote({ port, verbose })
    return 0
  }

  writeStderr(`Error: Unknown mode "${mode}". Use "local" or "remote".\n`)
  return 1
}

export function shouldRunAsCli(
  argv1 = process.argv[1],
  metaUrl = import.meta.url,
) {
  return Boolean(argv1) && metaUrl === pathToFileURL(argv1).href
}

export async function runCliIfInvoked(deps = {}) {
  const argv1 = deps.argv1 ?? process.argv[1]
  const metaUrl = deps.metaUrl ?? import.meta.url
  const mainFn = deps.mainFn || main
  const exitFn = deps.exitFn || ((code) => process.exit(code))

  if (!shouldRunAsCli(argv1, metaUrl)) {
    return false
  }

  const exitCode = await mainFn()
  if (exitCode !== 0) {
    exitFn(exitCode)
  }

  return true
}

if (await runCliIfInvoked()) {
}
