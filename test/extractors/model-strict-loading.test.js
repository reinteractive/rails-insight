import { describe, it, expect } from 'vitest'
import { extractModel } from '../../src/extractors/model.js'

function makeProvider(content) {
  return { readFile: () => content }
}

describe('model strict_loading detection', () => {
  it('detects model-level strict_loading', () => {
    const content = `
class Post < ApplicationRecord
  self.strict_loading_by_default = true
  has_many :comments
end`
    const result = extractModel(
      makeProvider(content),
      'app/models/post.rb',
      'Post',
    )
    expect(result.strict_loading).toBe(true)
  })

  it('detects association-level strict_loading', () => {
    const content = `
class Post < ApplicationRecord
  has_many :comments, strict_loading: true
end`
    const result = extractModel(
      makeProvider(content),
      'app/models/post.rb',
      'Post',
    )
    expect(result.strict_loading).toBe(false)
    const assoc = result.associations.find((a) => a.name === 'comments')
    expect(assoc.strict_loading).toBe(true)
  })

  it('absent strict_loading defaults to false', () => {
    const content = `
class Post < ApplicationRecord
  has_many :comments
end`
    const result = extractModel(
      makeProvider(content),
      'app/models/post.rb',
      'Post',
    )
    expect(result.strict_loading).toBe(false)
    expect(result.associations[0].strict_loading).toBeUndefined()
  })
})
