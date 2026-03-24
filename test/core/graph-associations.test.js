/**
 * Tests for association target resolution in graph building.
 * @module graph-associations.test
 */

import { describe, it, expect } from 'vitest'
import { buildGraph, classify } from '../../src/core/graph.js'

/**
 * Build a minimal extraction with models and associations.
 * @param {Object} models
 * @returns {Object}
 */
function buildExtractions(models) {
  return { models, controllers: {}, routes: {}, schema: {} }
}

describe('association target resolution', () => {
  it('class_name override used as edge target', () => {
    const extractions = buildExtractions({
      User: {
        associations: [
          {
            type: 'has_many',
            name: 'active_users',
            options: "class_name: 'User'",
          },
        ],
      },
    })
    const { graph } = buildGraph(extractions, { entries: [] })
    const edges = graph.edges.filter(
      (e) => e.from === 'User' && e.type === 'has_many',
    )
    expect(edges.some((e) => e.to === 'User')).toBe(true)
    expect(edges.some((e) => e.to === 'ActiveUser')).toBe(false)
  })

  it('class_name with namespace', () => {
    const extractions = buildExtractions({
      Order: {
        associations: [
          {
            type: 'belongs_to',
            name: 'owner',
            options: "class_name: 'Admin::User'",
          },
        ],
      },
    })
    const { graph } = buildGraph(extractions, { entries: [] })
    const edges = graph.edges.filter(
      (e) => e.from === 'Order' && e.type === 'belongs_to',
    )
    expect(edges.some((e) => e.to === 'Admin::User')).toBe(true)
  })

  it('through association creates join model edge', () => {
    const extractions = buildExtractions({
      User: {
        associations: [
          {
            type: 'has_many',
            name: 'roles',
            through: 'user_roles',
            options: null,
          },
        ],
      },
    })
    const { graph } = buildGraph(extractions, { entries: [] })
    const edges = graph.edges.filter((e) => e.from === 'User')
    expect(edges.some((e) => e.to === 'Role')).toBe(true)
    expect(edges.some((e) => e.to === 'UserRole')).toBe(true)
  })

  it('polymorphic belongs_to skipped', () => {
    const extractions = buildExtractions({
      Comment: {
        associations: [
          {
            type: 'belongs_to',
            name: 'commentable',
            polymorphic: true,
            options: 'polymorphic: true',
          },
        ],
      },
    })
    const { graph } = buildGraph(extractions, { entries: [] })
    const belongsToEdges = graph.edges.filter(
      (e) => e.from === 'Comment' && e.type === 'belongs_to',
    )
    expect(belongsToEdges).toHaveLength(0)
  })

  it('polymorphic has_many creates edge', () => {
    const extractions = buildExtractions({
      Post: {
        associations: [
          {
            type: 'has_many',
            name: 'comments',
            options: 'as: :commentable',
          },
        ],
      },
    })
    const { graph } = buildGraph(extractions, { entries: [] })
    const edges = graph.edges.filter(
      (e) => e.from === 'Post' && e.type === 'has_many',
    )
    expect(edges.some((e) => e.to === 'Comment')).toBe(true)
  })

  it('no class_name returns null from extractor', () => {
    const extractions = buildExtractions({
      Post: {
        associations: [
          {
            type: 'has_many',
            name: 'comments',
            options: 'dependent: :destroy',
          },
        ],
      },
    })
    const { graph } = buildGraph(extractions, { entries: [] })
    const edges = graph.edges.filter(
      (e) => e.from === 'Post' && e.type === 'has_many',
    )
    expect(edges.some((e) => e.to === 'Comment')).toBe(true)
  })

  it('regular association uses classify', () => {
    const extractions = buildExtractions({
      Post: {
        associations: [
          {
            type: 'has_many',
            name: 'comments',
            options: null,
          },
        ],
      },
    })
    const { graph } = buildGraph(extractions, { entries: [] })
    expect(classify('comments')).toBe('Comment')
    const edges = graph.edges.filter(
      (e) => e.from === 'Post' && e.type === 'has_many',
    )
    expect(edges.some((e) => e.to === 'Comment')).toBe(true)
  })
})
