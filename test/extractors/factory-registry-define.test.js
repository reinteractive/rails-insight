import { describe, it, expect } from 'vitest'
import { extractFactoryRegistry } from '../../src/extractors/factory-registry.js'

function makeProvider(files) {
  return { readFile: (path) => files[path] || null }
}

describe('FactoryBot.define depth tracking', () => {
  it('single factory in FactoryBot.define', () => {
    const content = `
FactoryBot.define do
  factory :user do
    name { "John" }
    email { "john@example.com" }
  end
end`
    const entries = [
      { path: 'spec/factories/users.rb', specCategory: 'factories' },
    ]
    const result = extractFactoryRegistry(
      makeProvider({ 'spec/factories/users.rb': content }),
      entries,
    )
    expect(result.factories.user).toBeDefined()
    expect(result.factories.user.name).toBe('user')
  })

  it('multiple factories in FactoryBot.define', () => {
    const content = `
FactoryBot.define do
  factory :user do
    name { "John" }
  end

  factory :post do
    title { "Hello" }
  end
end`
    const entries = [
      { path: 'spec/factories/users.rb', specCategory: 'factories' },
    ]
    const result = extractFactoryRegistry(
      makeProvider({ 'spec/factories/users.rb': content }),
      entries,
    )
    expect(result.factories.user).toBeDefined()
    expect(result.factories.post).toBeDefined()
    expect(result.total_factories).toBe(2)
  })

  it('factory with traits', () => {
    const content = `
FactoryBot.define do
  factory :user do
    name { "John" }

    trait :admin do
      role { "admin" }
    end

    trait :inactive do
      active { false }
    end
  end
end`
    const entries = [
      { path: 'spec/factories/users.rb', specCategory: 'factories' },
    ]
    const result = extractFactoryRegistry(
      makeProvider({ 'spec/factories/users.rb': content }),
      entries,
    )
    expect(result.factories.user.traits).toContain('admin')
    expect(result.factories.user.traits).toContain('inactive')
  })

  it('nested factory', () => {
    const content = `
FactoryBot.define do
  factory :user do
    name { "John" }

    factory :admin do
      role { "admin" }
    end
  end
end`
    const entries = [
      { path: 'spec/factories/users.rb', specCategory: 'factories' },
    ]
    const result = extractFactoryRegistry(
      makeProvider({ 'spec/factories/users.rb': content }),
      entries,
    )
    expect(result.factories.user).toBeDefined()
    expect(result.factories.admin).toBeDefined()
  })
})
