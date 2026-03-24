import { describe, it, expect } from 'vitest'
import { extractModel } from '../../src/extractors/model.js'

function makeProvider(content) {
  return { readFile: () => content }
}

describe('model enum validate option', () => {
  it('enum with validate true (modern syntax)', () => {
    const content = `
class Post < ApplicationRecord
  enum :status, { draft: 0, published: 1 }, validate: true
end`
    const result = extractModel(
      makeProvider(content),
      'app/models/post.rb',
      'Post',
    )
    expect(result.enums.status.validate).toBe(true)
  })

  it('enum without validate', () => {
    const content = `
class Post < ApplicationRecord
  enum :status, { draft: 0, published: 1 }
end`
    const result = extractModel(
      makeProvider(content),
      'app/models/post.rb',
      'Post',
    )
    expect(result.enums.status.validate).toBeUndefined()
  })

  it('modern syntax with validate', () => {
    const content = `
class User < ApplicationRecord
  enum :role, { admin: 0, editor: 1, viewer: 2 }, validate: true
end`
    const result = extractModel(
      makeProvider(content),
      'app/models/user.rb',
      'User',
    )
    expect(result.enums.role.validate).toBe(true)
    expect(result.enums.role.values).toEqual(['admin', 'editor', 'viewer'])
  })
})
