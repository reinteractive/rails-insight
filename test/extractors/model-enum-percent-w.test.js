import { describe, it, expect } from 'vitest'
import { extractModel } from '../../src/extractors/model.js'

function makeProvider(content) {
  return { readFile: () => content }
}

describe('model enum %w[] and constant syntax', () => {
  it('detects legacy enum with %w[] syntax', () => {
    const content = `
class EnergyCoachDay < ApplicationRecord
  enum status: %w[am_done completed].freeze
end`
    const result = extractModel(
      makeProvider(content),
      'app/models/energy_coach_day.rb',
      'EnergyCoachDay',
    )
    expect(result.enums.status).toBeDefined()
    expect(result.enums.status.values).toEqual(['am_done', 'completed'])
    expect(result.enums.status.syntax).toBe('legacy_percent_w')
  })

  it('detects legacy enum with %w[] without freeze', () => {
    const content = `
class Post < ApplicationRecord
  enum status: %w[draft published archived]
end`
    const result = extractModel(
      makeProvider(content),
      'app/models/post.rb',
      'Post',
    )
    expect(result.enums.status).toBeDefined()
    expect(result.enums.status.values).toEqual(['draft', 'published', 'archived'])
  })

  it('detects legacy enum with %i[] syntax', () => {
    const content = `
class Order < ApplicationRecord
  enum state: %i[pending processing shipped delivered]
end`
    const result = extractModel(
      makeProvider(content),
      'app/models/order.rb',
      'Order',
    )
    expect(result.enums.state).toBeDefined()
    expect(result.enums.state.values).toEqual(['pending', 'processing', 'shipped', 'delivered'])
    expect(result.enums.state.syntax).toBe('legacy_percent_w')
  })

  it('detects legacy enum with constant reference', () => {
    const content = `
class MyCaw < ApplicationRecord
  STATUSES = { in_progress: 0, completed: 1 }.freeze
  enum status: STATUSES
end`
    const result = extractModel(
      makeProvider(content),
      'app/models/my_caw.rb',
      'MyCaw',
    )
    expect(result.enums.status).toBeDefined()
    expect(result.enums.status.syntax).toBe('legacy_constant')
  })

  it('detects modern enum with %w[] syntax', () => {
    const content = `
class Post < ApplicationRecord
  enum :visibility, %w[public private unlisted]
end`
    const result = extractModel(
      makeProvider(content),
      'app/models/post.rb',
      'Post',
    )
    expect(result.enums.visibility).toBeDefined()
    expect(result.enums.visibility.values).toEqual(['public', 'private', 'unlisted'])
  })

  it('detects modern enum with constant reference', () => {
    const content = `
class Notification < ApplicationRecord
  TYPES = { email: 0, sms: 1, push: 2 }.freeze
  enum :type, TYPES
end`
    const result = extractModel(
      makeProvider(content),
      'app/models/notification.rb',
      'Notification',
    )
    expect(result.enums.type).toBeDefined()
    expect(result.enums.type.syntax).toBe('positional_constant')
  })

  it('does not duplicate enum already captured by hash syntax', () => {
    const content = `
class Post < ApplicationRecord
  enum :status, { draft: 0, published: 1 }
end`
    const result = extractModel(
      makeProvider(content),
      'app/models/post.rb',
      'Post',
    )
    expect(result.enums.status).toBeDefined()
    expect(result.enums.status.syntax).toBe('hash')
    expect(result.enums.status.values).toEqual(['draft', 'published'])
  })

  it('detects enum with %w[] and validate: true', () => {
    const content = `
class Post < ApplicationRecord
  enum status: %w[draft published].freeze, validate: true
end`
    const result = extractModel(
      makeProvider(content),
      'app/models/post.rb',
      'Post',
    )
    expect(result.enums.status).toBeDefined()
    expect(result.enums.status.values).toEqual(['draft', 'published'])
  })
})
