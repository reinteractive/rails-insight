import { describe, it, expect } from 'vitest'
import { buildReverseEntityFileMap } from '../../src/core/blast-radius.js'

describe('buildReverseEntityFileMap', () => {
  it('prefers controller file over view file for same entity', () => {
    const fileEntityMap = {
      'app/controllers/articles_controller.rb': { entity: 'ArticlesController', type: 'controller' },
      'app/views/articles/show.html.haml': { entity: 'ArticlesController', type: 'view' },
      'app/views/articles/index.html.erb': { entity: 'ArticlesController', type: 'view' },
    }
    const reverse = buildReverseEntityFileMap(fileEntityMap)
    expect(reverse['ArticlesController']).toBe('app/controllers/articles_controller.rb')
  })

  it('prefers model file over view file for same entity', () => {
    const fileEntityMap = {
      'app/views/users/show.html.erb': { entity: 'User', type: 'view' },
      'app/models/user.rb': { entity: 'User', type: 'model' },
    }
    const reverse = buildReverseEntityFileMap(fileEntityMap)
    expect(reverse['User']).toBe('app/models/user.rb')
  })

  it('keeps view file when no source file exists for entity', () => {
    const fileEntityMap = {
      'app/views/articles/show.html.haml': { entity: 'ArticlesController', type: 'view' },
      'app/views/articles/index.html.erb': { entity: 'ArticlesController', type: 'view' },
    }
    const reverse = buildReverseEntityFileMap(fileEntityMap)
    expect(reverse['ArticlesController']).toBeDefined()
  })

  it('maps unique entities to their single file', () => {
    const fileEntityMap = {
      'app/models/post.rb': { entity: 'Post', type: 'model' },
      'app/controllers/users_controller.rb': { entity: 'UsersController', type: 'controller' },
    }
    const reverse = buildReverseEntityFileMap(fileEntityMap)
    expect(reverse['Post']).toBe('app/models/post.rb')
    expect(reverse['UsersController']).toBe('app/controllers/users_controller.rb')
  })
})
