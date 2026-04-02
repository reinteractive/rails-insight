import { describe, it, expect } from 'vitest'
import { extractModel } from '../../src/extractors/model.js'

/**
 * Create a minimal mock provider that returns the given content
 * for any readFile call.
 */
function mockProvider(content) {
  return {
    readFile: () => content,
    fileExists: () => true,
    glob: () => [],
    listDir: () => [],
  }
}

describe('extractModel — enumerize detection', () => {
  it('detects enumerize with symbol array values', () => {
    const content = `
class Activity < ApplicationRecord
  enumerize :status, in: [:submitted, :draft, :pending, :publish]
end
`
    const result = extractModel(mockProvider(content), 'app/models/activity.rb')
    expect(result.enums).toBeDefined()
    expect(result.enums.status).toBeDefined()
    expect(result.enums.status.values).toEqual([
      'submitted',
      'draft',
      'pending',
      'publish',
    ])
    expect(result.enums.status.syntax).toBe('enumerize')
  })

  it('detects enumerize with string array values', () => {
    const content = `
class Activity < ApplicationRecord
  enumerize :state, in: ["NSW", "VIC", "QLD"]
end
`
    const result = extractModel(mockProvider(content), 'app/models/activity.rb')
    expect(result.enums.state).toBeDefined()
    expect(result.enums.state.values).toEqual(['NSW', 'VIC', 'QLD'])
    expect(result.enums.state.syntax).toBe('enumerize')
  })

  it('detects enumerize with %w[] syntax', () => {
    const content = `
class Article < ApplicationRecord
  enumerize :format, in: %w[news review guide video]
end
`
    const result = extractModel(mockProvider(content), 'app/models/article.rb')
    expect(result.enums.format).toBeDefined()
    expect(result.enums.format.values).toEqual([
      'news',
      'review',
      'guide',
      'video',
    ])
    expect(result.enums.format.syntax).toBe('enumerize')
  })

  it('detects multiple enumerize declarations in one model', () => {
    const content = `
class Activity < ApplicationRecord
  enumerize :status, in: [:draft, :published]
  enumerize :priority, in: [:low, :medium, :high]
  enumerize :season, in: [:spring, :summer, :autumn, :winter]
end
`
    const result = extractModel(mockProvider(content), 'app/models/activity.rb')
    expect(Object.keys(result.enums)).toHaveLength(3)
    expect(result.enums.status.values).toEqual(['draft', 'published'])
    expect(result.enums.priority.values).toEqual(['low', 'medium', 'high'])
    expect(result.enums.season.values).toEqual([
      'spring',
      'summer',
      'autumn',
      'winter',
    ])
  })

  it('detects enumerize with additional options (default, scope, predicates)', () => {
    const content = `
class Member < ApplicationRecord
  enumerize :city, in: [:sydney, :melbourne, :brisbane], default: :melbourne, scope: true
end
`
    const result = extractModel(mockProvider(content), 'app/models/member.rb')
    expect(result.enums.city).toBeDefined()
    expect(result.enums.city.values).toEqual([
      'sydney',
      'melbourne',
      'brisbane',
    ])
    expect(result.enums.city.syntax).toBe('enumerize')
  })

  it('does not overwrite native Rails enum with enumerize of same name', () => {
    const content = `
class Organiser < ApplicationRecord
  enum :priority, { low: 0, medium: 1, high: 2 }
  enumerize :priority, in: [:low, :medium, :high]
end
`
    const result = extractModel(
      mockProvider(content),
      'app/models/organiser.rb',
    )
    expect(result.enums.priority).toBeDefined()
    // Native enum should take priority — syntax should NOT be 'enumerize'
    expect(result.enums.priority.syntax).not.toBe('enumerize')
  })

  it('coexists with native Rails enum on different fields', () => {
    const content = `
class Product < ApplicationRecord
  enum :status, { active: 0, archived: 1 }
  enumerize :category, in: [:electronics, :clothing, :food]
end
`
    const result = extractModel(mockProvider(content), 'app/models/product.rb')
    expect(Object.keys(result.enums)).toHaveLength(2)
    expect(result.enums.status.syntax).not.toBe('enumerize')
    expect(result.enums.category.syntax).toBe('enumerize')
    expect(result.enums.category.values).toEqual([
      'electronics',
      'clothing',
      'food',
    ])
  })

  it('handles enumerize with single-quoted string values', () => {
    const content = `
class Activity < ApplicationRecord
  enumerize :offers_availability, in: ['InStock', 'SoldOut', 'PreOrder']
end
`
    const result = extractModel(mockProvider(content), 'app/models/activity.rb')
    expect(result.enums.offers_availability).toBeDefined()
    expect(result.enums.offers_availability.values).toEqual([
      'InStock',
      'SoldOut',
      'PreOrder',
    ])
  })

  it('returns empty enums when no enum or enumerize declarations exist', () => {
    const content = `
class Simple < ApplicationRecord
  validates :name, presence: true
end
`
    const result = extractModel(mockProvider(content), 'app/models/simple.rb')
    expect(result.enums).toEqual({})
  })

  it('does not detect enumerize outside of model context (e.g., in comments)', () => {
    const content = `
class Post < ApplicationRecord
  # enumerize :old_status, in: [:draft, :published]
  validates :title, presence: true
end
`
    const result = extractModel(mockProvider(content), 'app/models/post.rb')
    expect(result.enums.old_status).toBeUndefined()
  })
})
