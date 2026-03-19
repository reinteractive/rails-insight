import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const connectMock = vi.fn()
  const registerToolsMock = vi.fn()
  const buildIndexMock = vi.fn()
  const providerCtorMock = vi.fn()
  const stderrWriteMock = vi.fn(() => true)
  const consoleErrorMock = vi.fn()
  const processExitMock = vi.fn()
  const McpServerMock = vi.fn().mockImplementation(() => ({
    connect: connectMock,
  }))
  const StdioServerTransportMock = vi.fn().mockImplementation(() => ({
    kind: 'stdio',
  }))

  return {
    connectMock,
    registerToolsMock,
    buildIndexMock,
    providerCtorMock,
    stderrWriteMock,
    consoleErrorMock,
    processExitMock,
    McpServerMock,
    StdioServerTransportMock,
  }
})

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: mocks.McpServerMock,
}))

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: mocks.StdioServerTransportMock,
}))

vi.mock('../src/providers/local-fs.js', () => ({
  LocalFSProvider: vi.fn().mockImplementation((projectRoot) => {
    mocks.providerCtorMock(projectRoot)
    return { projectRoot, type: 'provider' }
  }),
}))

vi.mock('../src/core/indexer.js', () => ({
  buildIndex: mocks.buildIndexMock,
}))

vi.mock('../src/tools/index.js', () => ({
  registerTools: mocks.registerToolsMock,
}))

import { createServer, startLocal, startRemote } from '../src/server.js'

describe('server bootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.buildIndexMock.mockResolvedValue({ statistics: { total_files: 12 } })
    mocks.connectMock.mockResolvedValue(undefined)
    vi.spyOn(process.stderr, 'write').mockImplementation(mocks.stderrWriteMock)
    vi.spyOn(console, 'error').mockImplementation(mocks.consoleErrorMock)
    vi.spyOn(process, 'exit').mockImplementation(mocks.processExitMock)
  })

  it('creates an MCP server and registers tools', () => {
    const options = { index: { ok: true }, tier: 'team', verbose: true }

    const server = createServer(options)

    expect(server).toBeDefined()
    expect(mocks.McpServerMock).toHaveBeenCalledWith({
      name: 'railsinsight',
      version: '0.1.0',
      capabilities: { tools: {} },
    })
    expect(mocks.registerToolsMock).toHaveBeenCalledWith(server, options)
  })

  it('starts local mode, builds the index, and connects stdio transport', async () => {
    await startLocal('/tmp/rails-app', {
      claudeMdPath: 'CLAUDE.md',
      verbose: true,
      tier: 'team',
    })

    expect(mocks.providerCtorMock).toHaveBeenCalledWith('/tmp/rails-app')
    expect(mocks.buildIndexMock).toHaveBeenCalledWith(
      { projectRoot: '/tmp/rails-app', type: 'provider' },
      {
        claudeMdPath: 'CLAUDE.md',
        verbose: true,
      },
    )
    expect(mocks.registerToolsMock).toHaveBeenCalledWith(
      expect.objectContaining({ connect: mocks.connectMock }),
      {
        index: { statistics: { total_files: 12 } },
        provider: { projectRoot: '/tmp/rails-app', type: 'provider' },
        tier: 'team',
        verbose: true,
      },
    )
    expect(mocks.StdioServerTransportMock).toHaveBeenCalledTimes(1)
    expect(mocks.connectMock).toHaveBeenCalledWith({ kind: 'stdio' })
    expect(mocks.stderrWriteMock).toHaveBeenCalledWith(
      '[railsinsight] Indexing /tmp/rails-app...\n',
    )
    expect(mocks.stderrWriteMock).toHaveBeenCalledWith(
      '[railsinsight] Index built. Starting MCP server...\n',
    )
  })

  it('defaults local mode tier to pro when omitted', async () => {
    await startLocal('/tmp/default-tier')

    expect(mocks.registerToolsMock).toHaveBeenCalledWith(
      expect.objectContaining({ connect: mocks.connectMock }),
      expect.objectContaining({ tier: 'pro', verbose: false }),
    )
  })

  it('exits for unimplemented remote mode', async () => {
    await startRemote({ port: 3000 })

    expect(mocks.consoleErrorMock).toHaveBeenCalledWith(
      'Remote mode is not yet implemented. Use local mode.',
    )
    expect(mocks.processExitMock).toHaveBeenCalledWith(1)
  })
})
