import { describe, it, expect } from 'vitest'
import { extractModel } from '../../src/extractors/model.js'

function makeProvider(content) {
  return { readFile: () => content }
}

describe('model turbo morphing detection', () => {
  it('detects turbo_refreshes_with morph', () => {
    const content = `
class Post < ApplicationRecord
  turbo_refreshes_with :morph
  has_many :comments
end`
    const result = extractModel(
      makeProvider(content),
      'app/models/post.rb',
      'Post',
    )
    expect(result.turbo_refreshes_with).toBe('morph')
  })

  it('detects turbo_refreshes_with replace', () => {
    const content = `
class Post < ApplicationRecord
  turbo_refreshes_with :replace
end`
    const result = extractModel(
      makeProvider(content),
      'app/models/post.rb',
      'Post',
    )
    expect(result.turbo_refreshes_with).toBe('replace')
  })

  it('no turbo_refreshes', () => {
    const content = `
class Post < ApplicationRecord
  has_many :comments
end`
    const result = extractModel(
      makeProvider(content),
      'app/models/post.rb',
      'Post',
    )
    expect(result.turbo_refreshes_with).toBeNull()
  })
})
