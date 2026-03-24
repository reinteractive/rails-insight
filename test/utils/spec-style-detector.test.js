/**
 * Tests for shared spec style detector.
 * @module spec-style-detector.test
 */

import { describe, it, expect } from 'vitest'
import { detectSpecStyle } from '../../src/utils/spec-style-detector.js'

describe('detectSpecStyle', () => {
  it('request-only project', () => {
    const entries = [
      { path: 'spec/requests/users_spec.rb' },
      { path: 'spec/requests/posts_spec.rb' },
    ]
    const result = detectSpecStyle(entries)
    expect(result.primary).toBe('request')
    expect(result.has_mixed).toBe(false)
    expect(result.request_count).toBe(2)
  })

  it('controller-only project', () => {
    const entries = [
      { path: 'spec/controllers/users_controller_spec.rb' },
      { path: 'spec/controllers/posts_controller_spec.rb' },
    ]
    const result = detectSpecStyle(entries)
    expect(result.primary).toBe('controller')
    expect(result.controller_count).toBe(2)
  })

  it('mixed project', () => {
    const entries = [
      { path: 'spec/requests/users_spec.rb' },
      { path: 'spec/controllers/posts_controller_spec.rb' },
    ]
    const result = detectSpecStyle(entries)
    expect(result.has_mixed).toBe(true)
  })

  it('no specs', () => {
    const result = detectSpecStyle([])
    expect(result.request_count).toBe(0)
    expect(result.controller_count).toBe(0)
  })
})
