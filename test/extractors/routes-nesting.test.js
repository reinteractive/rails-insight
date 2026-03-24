import { describe, it, expect } from 'vitest'
import { extractRoutes } from '../../src/extractors/routes.js'

function makeProvider(content) {
  return { readFile: (path) => (path === 'config/routes.rb' ? content : null) }
}

describe('nested route relationships', () => {
  it('simple nesting detected', () => {
    const content = `
Rails.application.routes.draw do
  resources :posts do
    resources :comments
  end
end`
    const result = extractRoutes(makeProvider(content))
    expect(result.nested_relationships).toEqual([
      expect.objectContaining({ parent: 'posts', child: 'comments' }),
    ])
  })

  it('deep nesting', () => {
    const content = `
Rails.application.routes.draw do
  resources :posts do
    resources :comments do
      resources :replies
    end
  end
end`
    const result = extractRoutes(makeProvider(content))
    expect(result.nested_relationships).toHaveLength(2)
    expect(result.nested_relationships[0]).toEqual(
      expect.objectContaining({ parent: 'posts', child: 'comments' }),
    )
    expect(result.nested_relationships[1]).toEqual(
      expect.objectContaining({ parent: 'comments', child: 'replies' }),
    )
  })

  it('nested resource on parent', () => {
    const content = `
Rails.application.routes.draw do
  resources :posts do
    resources :comments
  end
end`
    const result = extractRoutes(makeProvider(content))
    const posts = result.resources.find((r) => r.name === 'posts')
    expect(posts.nested).toContain('comments')
  })

  it('non-nested resources', () => {
    const content = `
Rails.application.routes.draw do
  resources :posts
  resources :comments
end`
    const result = extractRoutes(makeProvider(content))
    expect(result.nested_relationships).toHaveLength(0)
  })
})
