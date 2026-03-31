import { describe, it, expect } from 'vitest'
import { buildGraph } from '../../src/core/graph.js'

describe('buildGraph with runtime data', () => {
  it('uses runtime class_name for association edges', () => {
    // authored_comments has class_name 'Comment' resolved at runtime.
    // options is null so extractClassName cannot find it.
    // Without the runtime class_name fix, classify('authored_comments')
    // returns 'AuthoredComment' and the edge never targets 'Comment'.
    const extractions = {
      models: {
        User: {
          superclass: 'ApplicationRecord',
          associations: [
            {
              type: 'has_many',
              name: 'authored_comments',
              class_name: 'Comment',
              options: null,
              through: null,
              polymorphic: false,
            },
          ],
          concerns: [],
        },
        Comment: {
          associations: [],
          concerns: [],
        },
      },
    }
    const { graph } = buildGraph(extractions, { entries: [] })
    // Should create an edge User → Comment (via runtime class_name)
    const edgeToComment = graph.edges.find(
      (e) => e.from === 'User' && e.to === 'Comment',
    )
    expect(edgeToComment).toBeDefined()
    // Should NOT create a phantom AuthoredComment node from classify()
    expect(graph.nodes.has('AuthoredComment')).toBe(false)
  })

  it('creates edges for runtime-only models', () => {
    // Runtime-only models use the runtime association format (macro field)
    // rather than the regex format (type field). buildGraph must handle both.
    const extractions = {
      models: {
        ArchivedPost: {
          source: 'runtime_only',
          superclass: 'ApplicationRecord',
          associations: [
            {
              macro: 'belongs_to',
              name: 'user',
              class_name: 'User',
              options: {},
              through: null,
              polymorphic: false,
            },
          ],
          concerns: [],
        },
        User: {
          associations: [],
          concerns: [],
        },
      },
    }
    const { graph } = buildGraph(extractions, { entries: [] })
    // Runtime-only model must appear as a node
    expect(graph.nodes.has('ArchivedPost')).toBe(true)
    // Its association edge must be built using the runtime class_name
    const edge = graph.edges.find(
      (e) => e.from === 'ArchivedPost' && e.to === 'User',
    )
    expect(edge).toBeDefined()
  })

  it('creates inherited_dependency edges from runtime callbacks', () => {
    // UsersController has authenticate_user! tagged inherited: true.
    // Convention: authenticate_user! → dependency on the User model.
    // buildGraph must emit an inherited_dependency edge for this.
    const extractions = {
      models: {
        User: {
          associations: [],
          concerns: [],
        },
      },
      controllers: {
        UsersController: {
          callbacks: [
            {
              kind: 'before',
              filter: 'authenticate_user!',
              options: {},
              inherited: true,
            },
          ],
        },
      },
    }
    const { graph } = buildGraph(extractions, { entries: [] })
    const edge = graph.edges.find(
      (e) =>
        e.from === 'UsersController' &&
        e.to === 'User' &&
        e.type === 'inherited_dependency',
    )
    expect(edge).toBeDefined()
  })

  it('handles merged extractions identically to regex-only', () => {
    // Regex-only extractions use the type field, 4 User associations.
    const regexExtractions = {
      models: {
        User: {
          superclass: 'ApplicationRecord',
          associations: [
            {
              type: 'belongs_to',
              name: 'organization',
              class_name: 'Organization',
              options: null,
              through: null,
              polymorphic: false,
            },
            {
              type: 'has_many',
              name: 'posts',
              class_name: 'Post',
              options: null,
              through: null,
              polymorphic: false,
            },
            {
              type: 'has_one',
              name: 'profile',
              class_name: 'Profile',
              options: null,
              through: null,
              polymorphic: false,
            },
            {
              type: 'has_many',
              name: 'tags',
              class_name: null,
              options: null,
              through: 'taggings',
              polymorphic: false,
            },
          ],
          concerns: [],
        },
        Organization: { associations: [], concerns: [] },
        Post: { associations: [], concerns: [] },
        Profile: { associations: [], concerns: [] },
      },
    }
    // Merged extractions use the runtime macro field and include authored_comments.
    const mergedExtractions = {
      models: {
        User: {
          superclass: 'ApplicationRecord',
          associations: [
            {
              macro: 'belongs_to',
              name: 'organization',
              class_name: 'Organization',
              options: {},
              through: null,
              polymorphic: false,
            },
            {
              macro: 'has_many',
              name: 'posts',
              class_name: 'Post',
              options: {},
              through: null,
              polymorphic: false,
            },
            {
              macro: 'has_one',
              name: 'profile',
              class_name: 'Profile',
              options: {},
              through: null,
              polymorphic: false,
            },
            {
              macro: 'has_many',
              name: 'tags',
              class_name: 'Tag',
              options: { through: 'taggings' },
              through: 'taggings',
              polymorphic: false,
            },
            {
              macro: 'has_many',
              name: 'authored_comments',
              class_name: 'Comment',
              options: {},
              through: null,
              polymorphic: false,
            },
          ],
          concerns: [],
        },
        Organization: { associations: [], concerns: [] },
        Post: { associations: [], concerns: [] },
        Profile: { associations: [], concerns: [] },
        Comment: { associations: [], concerns: [] },
        Tag: { associations: [], concerns: [] },
      },
    }
    const manifest = { entries: [] }
    const { graph: regexGraph } = buildGraph(regexExtractions, manifest)
    // buildGraph currently crashes on macro-format associations:
    const { graph: mergedGraph } = buildGraph(mergedExtractions, manifest)
    // Every node from the regex graph must appear in the merged graph
    for (const [id] of regexGraph.nodes) {
      expect(mergedGraph.nodes.has(id)).toBe(true)
    }
    // Merged graph has at least as many edges (gained the authored_comments edge)
    expect(mergedGraph.edges.length).toBeGreaterThanOrEqual(
      regexGraph.edges.length,
    )
  })
})
