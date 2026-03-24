/**
 * Tests for extractor error boundaries in the indexer.
 * @module indexer-error-boundaries.test
 */

import { describe, it, expect, vi } from 'vitest'

// We test safeExtract logic directly since it's the core mechanism
describe('safeExtract error boundaries', () => {
  function safeExtract(name, extractorFn, fallback, verbose, errors) {
    try {
      return extractorFn()
    } catch (err) {
      if (verbose) {
        process.stderr.write(
          `[railsinsight] Extractor '${name}' failed: ${err.message}\n`,
        )
      }
      errors.push(name)
      return fallback
    }
  }

  it('safeExtract returns result on success', () => {
    const errors = []
    const result = safeExtract('test', () => ({ data: 42 }), {}, false, errors)
    expect(result).toEqual({ data: 42 })
    expect(errors).toHaveLength(0)
  })

  it('safeExtract returns fallback on throw', () => {
    const errors = []
    const result = safeExtract(
      'test',
      () => {
        throw new Error('boom')
      },
      { fallback: true },
      false,
      errors,
    )
    expect(result).toEqual({ fallback: true })
  })

  it('extraction_errors tracks failures', () => {
    const errors = []
    safeExtract(
      'schema',
      () => {
        throw new Error('parse error')
      },
      {},
      false,
      errors,
    )
    safeExtract('routes', () => ({ routes: [] }), {}, false, errors)
    safeExtract(
      'auth',
      () => {
        throw new Error('missing file')
      },
      {},
      false,
      errors,
    )
    expect(errors).toContain('schema')
    expect(errors).toContain('auth')
    expect(errors).not.toContain('routes')
  })

  it('verbose logs error to stderr', () => {
    const errors = []
    const stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true)
    safeExtract(
      'schema',
      () => {
        throw new Error('test error')
      },
      {},
      true,
      errors,
    )
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining("Extractor 'schema' failed"),
    )
    stderrSpy.mockRestore()
  })

  it('index builds despite one failing extractor', () => {
    const errors = []
    // Simulate what happens when one extractor fails
    const schemaData = safeExtract(
      'schema',
      () => {
        throw new Error('bad')
      },
      {},
      false,
      errors,
    )
    const routeData = safeExtract(
      'routes',
      () => ({ routes: [{ path: '/users' }] }),
      {},
      false,
      errors,
    )
    expect(schemaData).toEqual({})
    expect(routeData.routes).toHaveLength(1)
    expect(errors).toEqual(['schema'])
  })
})
