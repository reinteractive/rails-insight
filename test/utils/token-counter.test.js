import { describe, it, expect } from 'vitest'
import { estimateTokens } from '../../src/utils/token-counter.js'

describe('token estimation', () => {
  it('prose uses 4.0 ratio', () => {
    const text = 'hello world this is some regular prose text content'
    const tokens = estimateTokens(text)
    // ~4 chars per token
    expect(tokens).toBe(Math.ceil(text.length / 4.0))
  })

  it('JSON uses 3.0 ratio', () => {
    const text = '{"key":"value","arr":[1,2,3],"nested":{"a":"b"}}'
    const tokens = estimateTokens(text)
    // ~3 chars per token
    expect(tokens).toBe(Math.ceil(text.length / 3.0))
  })

  it('empty string returns 0', () => {
    expect(estimateTokens('')).toBe(0)
  })

  it('null returns 0', () => {
    expect(estimateTokens(null)).toBe(0)
  })

  it('short text uses prose ratio', () => {
    const text = 'hi'
    const tokens = estimateTokens(text)
    expect(tokens).toBe(Math.ceil(text.length / 4.0))
  })
})
