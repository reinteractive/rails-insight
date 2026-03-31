import { describe, it, expect } from 'vitest'
import { runIntrospection } from '../../src/introspection/bridge.js'
import {
  RUNTIME_MODELS,
  RUNTIME_CONTROLLERS,
  RUNTIME_ROUTES,
  RUNTIME_DATABASE,
} from '../fixtures/introspection-fixtures.js'

const VALID_OUTPUT = JSON.stringify({
  models: RUNTIME_MODELS,
  controllers: RUNTIME_CONTROLLERS,
  routes: RUNTIME_ROUTES,
  database: RUNTIME_DATABASE,
})

describe('runIntrospection', () => {
  it('returns available: true with parsed data on success', async () => {
    const provider = {
      readFile: () => null,
      fileExists: (p) => p === 'Gemfile' || p === 'config/application.rb',
      glob: () => [],
      execCommand: async (_cmd) => ({
        exitCode: 0,
        stdout: VALID_OUTPUT,
        stderr: '',
      }),
    }

    const result = await runIntrospection(provider)

    expect(result.available).toBe(true)
    expect(result.error).toBeNull()
    expect(result.models).toEqual(RUNTIME_MODELS)
    expect(result.controllers).toEqual(RUNTIME_CONTROLLERS)
    expect(result.routes).toEqual(RUNTIME_ROUTES)
    expect(result.database).toEqual(RUNTIME_DATABASE)
  })

  it('returns available: false when provider has no execCommand', async () => {
    const provider = {
      readFile: () => null,
      fileExists: () => true,
      glob: () => [],
    }

    const result = await runIntrospection(provider)

    expect(result.available).toBe(false)
    expect(typeof result.error).toBe('string')
    expect(result.error.length).toBeGreaterThan(0)
  })

  it('returns available: false when Gemfile is missing', async () => {
    const provider = {
      readFile: () => null,
      fileExists: (p) => p === 'config/application.rb',
      glob: () => [],
      execCommand: async (_cmd) => ({
        exitCode: 0,
        stdout: VALID_OUTPUT,
        stderr: '',
      }),
    }

    const result = await runIntrospection(provider)

    expect(result.available).toBe(false)
    expect(typeof result.error).toBe('string')
    expect(result.error.length).toBeGreaterThan(0)
  })

  it('returns available: false when command exits with non-zero code', async () => {
    const provider = {
      readFile: () => null,
      fileExists: (p) => p === 'Gemfile' || p === 'config/application.rb',
      glob: () => [],
      execCommand: async (_cmd) => ({
        exitCode: 1,
        stdout: '',
        stderr: 'bundler: command not found: ruby',
      }),
    }

    const result = await runIntrospection(provider)

    expect(result.available).toBe(false)
    expect(typeof result.error).toBe('string')
    expect(result.error).toContain('bundler: command not found')
  })

  it('returns available: false when stdout is invalid JSON', async () => {
    const provider = {
      readFile: () => null,
      fileExists: (p) => p === 'Gemfile' || p === 'config/application.rb',
      glob: () => [],
      execCommand: async (_cmd) => ({
        exitCode: 0,
        stdout: 'not valid json at all',
        stderr: '',
      }),
    }

    const result = await runIntrospection(provider)

    expect(result.available).toBe(false)
    expect(typeof result.error).toBe('string')
    expect(result.error.length).toBeGreaterThan(0)
  })

  it('returns available: false when execCommand throws', async () => {
    const provider = {
      readFile: () => null,
      fileExists: (p) => p === 'Gemfile' || p === 'config/application.rb',
      glob: () => [],
      execCommand: async (_cmd) => {
        throw new Error('spawn ENOENT')
      },
    }

    const result = await runIntrospection(provider)

    expect(result.available).toBe(false)
    expect(result.error).toContain('spawn ENOENT')
  })

  it('includes duration_ms in all responses', async () => {
    const successProvider = {
      readFile: () => null,
      fileExists: (p) => p === 'Gemfile' || p === 'config/application.rb',
      glob: () => [],
      execCommand: async (_cmd) => ({
        exitCode: 0,
        stdout: VALID_OUTPUT,
        stderr: '',
      }),
    }
    const failureProvider = {
      readFile: () => null,
      fileExists: () => false,
      glob: () => [],
      execCommand: async (_cmd) => ({
        exitCode: 1,
        stdout: '',
        stderr: 'error',
      }),
    }

    const successResult = await runIntrospection(successProvider)
    const failureResult = await runIntrospection(failureProvider)

    expect(typeof successResult.duration_ms).toBe('number')
    expect(successResult.duration_ms).toBeGreaterThanOrEqual(0)
    expect(typeof failureResult.duration_ms).toBe('number')
    expect(failureResult.duration_ms).toBeGreaterThanOrEqual(0)
  })
})
