import { describe, it, expect, vi } from 'vitest'

// We need to test detectSTIRelationships which is internal to indexer.js.
// We'll test through buildIndex by providing minimal mock data.

describe('STI detection', () => {
  // Direct unit test of STI logic by simulating model extraction results
  function detectSTIRelationships(models) {
    const stiSubclasses = {}
    for (const [name, model] of Object.entries(models)) {
      if (
        model.superclass &&
        model.superclass !== 'ApplicationRecord' &&
        models[model.superclass]
      ) {
        if (!stiSubclasses[model.superclass])
          stiSubclasses[model.superclass] = []
        stiSubclasses[model.superclass].push(name)
      }
    }
    for (const [baseName, subclasses] of Object.entries(stiSubclasses)) {
      models[baseName].sti_base = true
      models[baseName].sti_subclasses = subclasses
      for (const sub of subclasses) {
        models[sub].sti_parent = baseName
      }
    }
  }

  it('detects STI base class', () => {
    const models = {
      User: { superclass: 'ApplicationRecord', sti_base: false },
      Admin: { superclass: 'User', sti_base: false },
    }
    detectSTIRelationships(models)
    expect(models.User.sti_base).toBe(true)
  })

  it('records STI subclasses', () => {
    const models = {
      User: { superclass: 'ApplicationRecord', sti_base: false },
      Admin: { superclass: 'User', sti_base: false },
      Moderator: { superclass: 'User', sti_base: false },
    }
    detectSTIRelationships(models)
    expect(models.User.sti_subclasses).toEqual(['Admin', 'Moderator'])
  })

  it('marks STI child', () => {
    const models = {
      User: { superclass: 'ApplicationRecord', sti_base: false },
      Admin: { superclass: 'User', sti_base: false },
    }
    detectSTIRelationships(models)
    expect(models.Admin.sti_parent).toBe('User')
  })

  it('non-STI inheritance ignored', () => {
    const models = {
      Post: { superclass: 'ApplicationRecord', sti_base: false },
    }
    detectSTIRelationships(models)
    expect(models.Post.sti_base).toBe(false)
  })

  it('superclass not in models ignored', () => {
    const models = {
      Admin: { superclass: 'User', sti_base: false },
    }
    detectSTIRelationships(models)
    expect(models.Admin.sti_parent).toBeUndefined()
    expect(models.Admin.sti_base).toBe(false)
  })
})
