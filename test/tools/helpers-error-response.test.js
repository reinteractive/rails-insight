/**
 * Tests for MCP error response helpers.
 * @module helpers-error-response.test
 */

import { describe, it, expect } from 'vitest'
import {
  respond,
  respondError,
  noIndex,
} from '../../src/tools/handlers/helpers.js'

describe('respondError', () => {
  it('respondError includes isError flag', () => {
    const response = respondError('not found')
    expect(response.isError).toBe(true)
  })

  it('respondError includes message in content', () => {
    const response = respondError('not found')
    const parsed = JSON.parse(response.content[0].text)
    expect(parsed.error).toBe('not found')
  })

  it('respondError includes details', () => {
    const response = respondError('fail', { available: ['a'] })
    const parsed = JSON.parse(response.content[0].text)
    expect(parsed.available).toEqual(['a'])
  })

  it('respond does not include isError', () => {
    const response = respond({ data: 42 })
    expect(response).not.toHaveProperty('isError')
  })

  it('noIndex returns isError', () => {
    const response = noIndex()
    expect(response.isError).toBe(true)
  })
})
