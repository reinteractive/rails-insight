import { describe, it, expect } from 'vitest'
import { extractFactoryRegistry } from '../../src/extractors/factory-registry.js'
import { createMemoryProvider } from '../helpers/mock-provider.js'

describe('Factory Registry Extractor', () => {
  it('parses a simple factory with attributes', () => {
    const provider = createMemoryProvider({
      'spec/factories/users.rb': `
FactoryBot.define do
  factory :user do
    name { "John" }
    email { "john@example.com" }
    password { "password123" }
  end
end`,
    })
    const entries = [
      { path: 'spec/factories/users.rb', category: 19, specCategory: 'factories' },
    ]
    const result = extractFactoryRegistry(provider, entries)
    expect(result.total_factories).toBe(1)
    expect(result.factories.user).toBeDefined()
    expect(result.factories.user.name).toBe('user')
    expect(result.factories.user.class_name).toBe('User')
    expect(result.factories.user.attributes).toContain('name')
    expect(result.factories.user.attributes).toContain('email')
    expect(result.factories.user.attributes).toContain('password')
  })

  it('maps factory with class: option to correct model', () => {
    const provider = createMemoryProvider({
      'spec/factories/admins.rb': `
FactoryBot.define do
  factory :admin, class: "User" do
    name { "Admin" }
  end
end`,
    })
    const entries = [
      { path: 'spec/factories/admins.rb', category: 19, specCategory: 'factories' },
    ]
    const result = extractFactoryRegistry(provider, entries)
    expect(result.factories.admin.class_name).toBe('User')
  })

  it('discovers traits', () => {
    const provider = createMemoryProvider({
      'spec/factories/users.rb': `
FactoryBot.define do
  factory :user do
    name { "John" }

    trait :admin do
      role { :admin }
    end

    trait :confirmed do
      confirmed_at { Time.current }
    end
  end
end`,
    })
    const entries = [
      { path: 'spec/factories/users.rb', category: 19, specCategory: 'factories' },
    ]
    const result = extractFactoryRegistry(provider, entries)
    expect(result.factories.user.traits).toContain('admin')
    expect(result.factories.user.traits).toContain('confirmed')
    expect(result.total_traits).toBe(2)
  })

  it('discovers sequences', () => {
    const provider = createMemoryProvider({
      'spec/factories/users.rb': `
FactoryBot.define do
  factory :user do
    sequence(:email) { |n| "user\#{n}@example.com" }
    sequence :name do |n|
      "User \#{n}"
    end
  end
end`,
    })
    const entries = [
      { path: 'spec/factories/users.rb', category: 19, specCategory: 'factories' },
    ]
    const result = extractFactoryRegistry(provider, entries)
    expect(result.factories.user.sequences).toContain('email')
    expect(result.factories.user.sequences).toContain('name')
  })

  it('discovers associations', () => {
    const provider = createMemoryProvider({
      'spec/factories/posts.rb': `
FactoryBot.define do
  factory :post do
    title { "My Post" }
    association :user
    association :category, factory: :content_category
  end
end`,
    })
    const entries = [
      { path: 'spec/factories/posts.rb', category: 19, specCategory: 'factories' },
    ]
    const result = extractFactoryRegistry(provider, entries)
    expect(result.factories.post.associations.length).toBe(2)
    expect(result.factories.post.associations[0].name).toBe('user')
    expect(result.factories.post.associations[1].name).toBe('category')
  })

  it('parses multiple factories in one file', () => {
    const provider = createMemoryProvider({
      'spec/factories/models.rb': `
FactoryBot.define do
  factory :user do
    name { "John" }
  end

  factory :post do
    title { "My Post" }
  end

  factory :comment do
    body { "Great post!" }
  end
end`,
    })
    const entries = [
      { path: 'spec/factories/models.rb', category: 19, specCategory: 'factories' },
    ]
    const result = extractFactoryRegistry(provider, entries)
    expect(result.total_factories).toBe(3)
    expect(result.factories.user).toBeDefined()
    expect(result.factories.post).toBeDefined()
    expect(result.factories.comment).toBeDefined()
  })

  it('detects transient block', () => {
    const provider = createMemoryProvider({
      'spec/factories/users.rb': `
FactoryBot.define do
  factory :user do
    name { "John" }

    transient do
      posts_count { 3 }
    end
  end
end`,
    })
    const entries = [
      { path: 'spec/factories/users.rb', category: 19, specCategory: 'factories' },
    ]
    const result = extractFactoryRegistry(provider, entries)
    expect(result.factories.user.has_transient).toBe(true)
  })

  it('detects after(:create) callback', () => {
    const provider = createMemoryProvider({
      'spec/factories/users.rb': `
FactoryBot.define do
  factory :user do
    name { "John" }

    after(:create) do |user, evaluator|
      create_list(:post, 3, user: user)
    end
  end
end`,
    })
    const entries = [
      { path: 'spec/factories/users.rb', category: 19, specCategory: 'factories' },
    ]
    const result = extractFactoryRegistry(provider, entries)
    expect(result.factories.user.has_after_create).toBe(true)
  })

  it('returns empty results for empty factory file', () => {
    const provider = createMemoryProvider({
      'spec/factories/empty.rb': `
FactoryBot.define do
end`,
    })
    const entries = [
      { path: 'spec/factories/empty.rb', category: 19, specCategory: 'factories' },
    ]
    const result = extractFactoryRegistry(provider, entries)
    expect(result.total_factories).toBe(0)
    expect(Object.keys(result.factories)).toHaveLength(0)
  })

  it('stores file path on each factory', () => {
    const provider = createMemoryProvider({
      'spec/factories/users.rb': `
FactoryBot.define do
  factory :user do
    name { "John" }
  end
end`,
    })
    const entries = [
      { path: 'spec/factories/users.rb', category: 19, specCategory: 'factories' },
    ]
    const result = extractFactoryRegistry(provider, entries)
    expect(result.factories.user.file).toBe('spec/factories/users.rb')
    expect(result.factory_files).toContain('spec/factories/users.rb')
  })

  it('returns empty results when no factory files exist', () => {
    const provider = createMemoryProvider({})
    const entries = []
    const result = extractFactoryRegistry(provider, entries)
    expect(result.total_factories).toBe(0)
    expect(result.factory_files).toEqual([])
  })
})
