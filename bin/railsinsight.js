#!/usr/bin/env node

import { parseArgs } from 'node:util'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const options = {
  'project-root': { type: 'string', short: 'p' },
  'claude-md': { type: 'string' },
  mode: { type: 'string', short: 'm', default: 'local' },
  port: { type: 'string', default: '3000' },
  verbose: { type: 'boolean', short: 'v', default: false },
  help: { type: 'boolean', short: 'h', default: false },
}

let parsed
try {
  parsed = parseArgs({ options, allowPositionals: false })
} catch (err) {
  console.error(`Error: ${err.message}`)
  console.error('Run with --help for usage information.')
  process.exit(1)
}

const { values } = parsed

if (values.help) {
  console.log(`
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
`)
  process.exit(0)
}

const mode = values.mode || 'local'

if (mode === 'local') {
  const projectRoot = resolve(values['project-root'] || '.')

  if (!existsSync(projectRoot)) {
    console.error(`Error: Project root does not exist: ${projectRoot}`)
    process.exit(1)
  }

  const claudeMdPath = values['claude-md'] || null
  const verbose = values.verbose || false

  const { startLocal } = await import('../src/server.js')
  await startLocal(projectRoot, { claudeMdPath, verbose, tier: 'pro' })
} else if (mode === 'remote') {
  const port = parseInt(values.port || '3000', 10)
  const verbose = values.verbose || false

  const { startRemote } = await import('../src/server.js')
  await startRemote({ port, verbose })
} else {
  console.error(`Error: Unknown mode "${mode}". Use "local" or "remote".`)
  process.exit(1)
}
