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
      {
        path: 'spec/factories/users.rb',
        category: 19,
        specCategory: 'factories',
      },
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
      {
        path: 'spec/factories/admins.rb',
        category: 19,
        specCategory: 'factories',
      },
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
      {
        path: 'spec/factories/users.rb',
        category: 19,
        specCategory: 'factories',
      },
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
      {
        path: 'spec/factories/users.rb',
        category: 19,
        specCategory: 'factories',
      },
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
      {
        path: 'spec/factories/posts.rb',
        category: 19,
        specCategory: 'factories',
      },
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
      {
        path: 'spec/factories/models.rb',
        category: 19,
        specCategory: 'factories',
      },
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
      {
        path: 'spec/factories/users.rb',
        category: 19,
        specCategory: 'factories',
      },
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
      {
        path: 'spec/factories/users.rb',
        category: 19,
        specCategory: 'factories',
      },
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
      {
        path: 'spec/factories/empty.rb',
        category: 19,
        specCategory: 'factories',
      },
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
      {
        path: 'spec/factories/users.rb',
        category: 19,
        specCategory: 'factories',
      },
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

  it('excludes trait-level attributes from factory attributes', () => {
    const provider = createMemoryProvider({
      'spec/factories/stock_locations.rb': `
FactoryBot.define do
  factory :stock_location do
    name { "Warehouse" }
    active { true }

    trait :click_and_collect do
      click_and_collect_allowed { true }
      days_to_restock { 3 }
    end
  end
end`,
    })
    const entries = [
      {
        path: 'spec/factories/stock_locations.rb',
        category: 19,
        specCategory: 'factories',
      },
    ]
    const result = extractFactoryRegistry(provider, entries)
    expect(result.factories.stock_location.attributes).toContain('name')
    expect(result.factories.stock_location.attributes).toContain('active')
    expect(result.factories.stock_location.attributes).not.toContain('click_and_collect_allowed')
    expect(result.factories.stock_location.attributes).not.toContain('days_to_restock')
    expect(result.factories.stock_location.traits).toContain('click_and_collect')
  })

  it('excludes attributes from multiple traits', () => {
    const provider = createMemoryProvider({
      'spec/factories/advertisements.rb': `
FactoryBot.define do
  factory :advertisement do
    url { "https://example.com" }
    active { true }

    trait :inactive do
      active { false }
    end

    trait :home_page do
      display_on_home_page { true }
      home_page_position { "Top" }
    end
  end
end`,
    })
    const entries = [
      {
        path: 'spec/factories/advertisements.rb',
        category: 19,
        specCategory: 'factories',
      },
    ]
    const result = extractFactoryRegistry(provider, entries)
    expect(result.factories.advertisement.attributes).toContain('url')
    expect(result.factories.advertisement.attributes).toContain('active')
    expect(result.factories.advertisement.attributes).not.toContain('display_on_home_page')
    expect(result.factories.advertisement.attributes).not.toContain('home_page_position')
    expect(result.factories.advertisement.traits).toEqual(['inactive', 'home_page'])
  })

  it('handles trait with after(:create) callback inside', () => {
    const provider = createMemoryProvider({
      'spec/factories/asset_reviews.rb': `
FactoryBot.define do
  factory :asset_review do
    priority { :low }

    trait :approved do
      status { :approved }
      argos_synced_at { nil }
    end

    trait :with_metrics do
      after(:create) do |review|
        create(:metric, asset_review: review)
      end
    end
  end
end`,
    })
    const entries = [
      {
        path: 'spec/factories/asset_reviews.rb',
        category: 19,
        specCategory: 'factories',
      },
    ]
    const result = extractFactoryRegistry(provider, entries)
    expect(result.factories.asset_review.attributes).toContain('priority')
    expect(result.factories.asset_review.attributes).not.toContain('status')
    expect(result.factories.asset_review.attributes).not.toContain('argos_synced_at')
    expect(result.factories.asset_review.traits).toEqual(['approved', 'with_metrics'])
  })

  it('detects attributes with multi-line block values', () => {
    const provider = createMemoryProvider({
      'spec/factories/articles.rb': `
FactoryBot.define do
  factory :article do
    title { "My Article" }
    body_markdown { "This is a very long article body
that spans multiple lines with lots of content.
It keeps going and going." }
    published { true }
  end
end`,
    })
    const entries = [
      {
        path: 'spec/factories/articles.rb',
        category: 19,
        specCategory: 'factories',
      },
    ]
    const result = extractFactoryRegistry(provider, entries)
    expect(result.factories.article.attributes).toContain('title')
    expect(result.factories.article.attributes).toContain('body_markdown')
    expect(result.factories.article.attributes).toContain('published')
  })
})
