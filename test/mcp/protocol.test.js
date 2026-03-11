import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const FIXTURE_DIR = resolve(import.meta.dirname, '../fixtures/rails-8.1-full')
const BIN_PATH = resolve(import.meta.dirname, '../../bin/railsinsight.js')

describe('MCP Protocol Integration', () => {
  let client
  let transport

  beforeAll(async () => {
    transport = new StdioClientTransport({
      command: 'node',
      args: [BIN_PATH, '--project-root', FIXTURE_DIR],
    })

    client = new Client({
      name: 'test-client',
      version: '1.0.0',
    })

    await client.connect(transport)
  }, 30000)

  afterAll(async () => {
    try {
      await client.close()
    } catch {
      // Ignore close errors
    }
  })

  it('connects and initializes successfully', () => {
    expect(client).toBeDefined()
  })

  it('lists all tools', async () => {
    const result = await client.listTools()
    expect(result.tools).toBeDefined()
    expect(result.tools.length).toBeGreaterThan(0)

    const toolNames = result.tools.map((t) => t.name)
    // Free tools
    expect(toolNames).toContain('index_project')
    expect(toolNames).toContain('get_overview')
    expect(toolNames).toContain('get_deep_analysis')
    // Detail tools
    expect(toolNames).toContain('get_model')
    expect(toolNames).toContain('get_full_index')
    expect(toolNames).toContain('get_subgraph')
  })

  it('calls get_overview and gets valid response', async () => {
    const result = await client.callTool({
      name: 'get_overview',
      arguments: {},
    })
    expect(result.content).toBeDefined()
    expect(result.content.length).toBeGreaterThan(0)
    expect(result.content[0].type).toBe('text')

    const data = JSON.parse(result.content[0].text)
    expect(data.rails_version).toBeTruthy()
    expect(data.file_counts).toBeDefined()
  })

  it('calls get_deep_analysis(model_list) and gets model list', async () => {
    const result = await client.callTool({
      name: 'get_deep_analysis',
      arguments: { category: 'model_list' },
    })
    const data = JSON.parse(result.content[0].text)
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThan(0)
    const user = data.find((m) => m.name === 'User')
    expect(user).toBeDefined()
  })

  it('calls get_model with User and gets deep extraction', async () => {
    const result = await client.callTool({
      name: 'get_model',
      arguments: { name: 'User' },
    })
    const data = JSON.parse(result.content[0].text)
    expect(data.associations).toBeDefined()
    expect(data.associations.length).toBeGreaterThan(0)
  })

  it('calls get_subgraph with database skill', async () => {
    const result = await client.callTool({
      name: 'get_subgraph',
      arguments: { skill: 'database' },
    })
    const data = JSON.parse(result.content[0].text)
    expect(data.skill).toBe('database')
    expect(data.entities).toBeDefined()
  })

  it('handles get_model for nonexistent model gracefully', async () => {
    const result = await client.callTool({
      name: 'get_model',
      arguments: { name: 'NonExistentModel' },
    })
    const data = JSON.parse(result.content[0].text)
    expect(data.error).toContain('not found')
    expect(data.available).toBeDefined()
  })
})
