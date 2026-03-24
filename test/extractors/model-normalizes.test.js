import { describe, it, expect } from 'vitest'
import { extractModel } from '../../src/extractors/model.js'

function makeProvider(content) {
  return { readFile: () => content }
}

describe('model normalizes extraction', () => {
  it('captures normalization expression', () => {
    const content = `
class User < ApplicationRecord
  normalizes :email, with: -> { _1.strip.downcase }
end`
    const result = extractModel(
      makeProvider(content),
      'app/models/user.rb',
      'User',
    )
    expect(result.normalizes).toEqual([
      { attribute: 'email', expression: '_1.strip.downcase' },
    ])
  })

  it('multiple attributes', () => {
    const content = `
class User < ApplicationRecord
  normalizes :email, :name, with: -> { _1.strip }
end`
    const result = extractModel(
      makeProvider(content),
      'app/models/user.rb',
      'User',
    )
    expect(result.normalizes).toHaveLength(2)
    expect(result.normalizes[0].attribute).toBe('email')
    expect(result.normalizes[1].attribute).toBe('name')
    expect(result.normalizes[0].expression).toBe('_1.strip')
  })

  it('no with clause', () => {
    const content = `
class User < ApplicationRecord
  normalizes :email
end`
    const result = extractModel(
      makeProvider(content),
      'app/models/user.rb',
      'User',
    )
    expect(result.normalizes).toEqual([
      { attribute: 'email', expression: null },
    ])
  })
})
