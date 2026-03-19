import { describe, it, expect, vi } from 'vitest'
import {
  main,
  runCliIfInvoked,
  shouldRunAsCli,
} from '../../bin/railsinsight.js'

function createWriters() {
  const stdout = []
  const stderr = []

  return {
    stdout,
    stderr,
    writeStdout(text) {
      stdout.push(text)
    },
    writeStderr(text) {
      stderr.push(text)
    },
  }
}

describe('railsinsight CLI', () => {
  it('prints help text and exits successfully', async () => {
    const writers = createWriters()

    const exitCode = await main(['--help'], writers)

    expect(exitCode).toBe(0)
    expect(writers.stdout.join('')).toContain('RailsInsight')
    expect(writers.stdout.join('')).toContain('--project-root')
    expect(writers.stderr).toEqual([])
  })

  it('reports argument parsing errors', async () => {
    const writers = createWriters()

    const exitCode = await main([], {
      ...writers,
      parseArgsFn() {
        throw new Error('Unknown option')
      },
    })

    expect(exitCode).toBe(1)
    expect(writers.stderr.join('')).toContain('Error: Unknown option')
    expect(writers.stderr.join('')).toContain('--help')
  })

  it('rejects a missing local project root', async () => {
    const writers = createWriters()

    const exitCode = await main(['--project-root', './missing'], {
      ...writers,
      resolvePath: (value) => `/resolved/${value}`,
      existsSyncFn: () => false,
    })

    expect(exitCode).toBe(1)
    expect(writers.stderr.join('')).toContain(
      'Project root does not exist: /resolved/./missing',
    )
  })

  it('starts local mode with resolved options', async () => {
    const writers = createWriters()
    const startLocal = vi.fn().mockResolvedValue(undefined)

    const exitCode = await main(
      ['--project-root', '.', '--claude-md', 'CLAUDE.md', '--verbose'],
      {
        ...writers,
        resolvePath: () => '/tmp/app',
        existsSyncFn: () => true,
        importServer: async () => ({ startLocal }),
      },
    )

    expect(exitCode).toBe(0)
    expect(startLocal).toHaveBeenCalledWith('/tmp/app', {
      claudeMdPath: 'CLAUDE.md',
      verbose: true,
      tier: 'pro',
    })
  })

  it('starts remote mode with parsed port', async () => {
    const writers = createWriters()
    const startRemote = vi.fn().mockResolvedValue(undefined)

    const exitCode = await main(['--mode', 'remote', '--port', '4010'], {
      ...writers,
      importServer: async () => ({ startRemote }),
    })

    expect(exitCode).toBe(0)
    expect(startRemote).toHaveBeenCalledWith({ port: 4010, verbose: false })
  })

  it('rejects unknown modes', async () => {
    const writers = createWriters()

    const exitCode = await main(['--mode', 'mystery'], writers)

    expect(exitCode).toBe(1)
    expect(writers.stderr.join('')).toContain('Unknown mode "mystery"')
  })

  it('defaults remote port and verbose flag when omitted', async () => {
    const startRemote = vi.fn().mockResolvedValue(undefined)

    const exitCode = await main(['--mode', 'remote'], {
      importServer: async () => ({ startRemote }),
    })

    expect(exitCode).toBe(0)
    expect(startRemote).toHaveBeenCalledWith({ port: 3000, verbose: false })
  })

  it('detects when the module should run as the CLI entrypoint', () => {
    expect(
      shouldRunAsCli('/tmp/railsinsight.js', 'file:///tmp/railsinsight.js'),
    ).toBe(true)
    expect(shouldRunAsCli('/tmp/railsinsight.js', 'file:///tmp/other.js')).toBe(
      false,
    )
    expect(shouldRunAsCli(undefined, 'file:///tmp/railsinsight.js')).toBe(false)
  })

  it('runs the CLI wrapper without exiting on success', async () => {
    const mainFn = vi.fn().mockResolvedValue(0)
    const exitFn = vi.fn()

    const invoked = await runCliIfInvoked({
      argv1: '/tmp/railsinsight.js',
      metaUrl: 'file:///tmp/railsinsight.js',
      mainFn,
      exitFn,
    })

    expect(invoked).toBe(true)
    expect(mainFn).toHaveBeenCalledTimes(1)
    expect(exitFn).not.toHaveBeenCalled()
  })

  it('runs the CLI wrapper and exits on failure', async () => {
    const mainFn = vi.fn().mockResolvedValue(1)
    const exitFn = vi.fn()

    const invoked = await runCliIfInvoked({
      argv1: '/tmp/railsinsight.js',
      metaUrl: 'file:///tmp/railsinsight.js',
      mainFn,
      exitFn,
    })

    expect(invoked).toBe(true)
    expect(exitFn).toHaveBeenCalledWith(1)
  })

  it('does not run the CLI wrapper when imported as a module', async () => {
    const mainFn = vi.fn()

    const invoked = await runCliIfInvoked({
      argv1: '/tmp/railsinsight.js',
      metaUrl: 'file:///tmp/not-invoked.js',
      mainFn,
    })

    expect(invoked).toBe(false)
    expect(mainFn).not.toHaveBeenCalled()
  })
})
