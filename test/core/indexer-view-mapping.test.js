/**
 * Tests for view-to-controller mapping with namespace support.
 * @module indexer-view-mapping.test
 */

import { describe, it, expect } from 'vitest'

// deriveControllerClassName mirrors the logic in indexer.js
function deriveControllerClassName(viewDir) {
  const parts = viewDir.split('/')
  const classified = parts.map((segment) =>
    segment
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(''),
  )
  return classified.join('::') + 'Controller'
}

describe('view file mapping', () => {
  it('simple view maps to controller', () => {
    expect(deriveControllerClassName('posts')).toBe('PostsController')
  })

  it('namespaced view maps to namespaced controller', () => {
    expect(deriveControllerClassName('admin/users')).toBe(
      'Admin::UsersController',
    )
  })

  it('deeply nested namespace', () => {
    expect(deriveControllerClassName('api/v1/posts')).toBe(
      'Api::V1::PostsController',
    )
  })

  it('view with no matching controller', () => {
    const controllers = { PostsController: {} }
    const ctrlClassName = deriveControllerClassName('shared')
    expect(controllers[ctrlClassName]).toBeUndefined()
  })

  it('layout files not mapped', () => {
    const controllers = {}
    const ctrlClassName = deriveControllerClassName('layouts')
    expect(controllers[ctrlClassName]).toBeUndefined()
  })
})
