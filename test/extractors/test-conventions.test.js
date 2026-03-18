import { describe, it, expect } from 'vitest'
import { extractTestConventions } from '../../src/extractors/test-conventions.js'
import { createMemoryProvider } from '../helpers/mock-provider.js'

describe('Test Conventions Extractor', () => {
  describe('let style detection', () => {
    it('detects lazy let style', () => {
      const provider = createMemoryProvider({
        'spec/models/user_spec.rb': `
RSpec.describe User do
  let(:user) { create(:user) }
  let(:other) { create(:user) }
  let(:third) { create(:user) }

  it 'works' do
    expect(user).to be_valid
  end
end`,
      })
      const entries = [
        {
          path: 'spec/models/user_spec.rb',
          category: 19,
          categoryName: 'testing',
          specCategory: 'model_specs',
        },
      ]
      const result = extractTestConventions(provider, entries)
      expect(result.let_style).toBe('lazy')
      expect(result.let_count).toBe(3)
      expect(result.let_bang_count).toBe(0)
    })

    it('detects eager let style', () => {
      const provider = createMemoryProvider({
        'spec/models/user_spec.rb': `
RSpec.describe User do
  let!(:user) { create(:user) }
  let!(:other) { create(:user) }
  let!(:third) { create(:user) }
  let!(:fourth) { create(:user) }

  it 'works' do
    expect(user).to be_valid
  end
end`,
      })
      const entries = [
        {
          path: 'spec/models/user_spec.rb',
          category: 19,
          categoryName: 'testing',
          specCategory: 'model_specs',
        },
      ]
      const result = extractTestConventions(provider, entries)
      expect(result.let_style).toBe('eager')
      expect(result.let_bang_count).toBe(4)
    })

    it('detects mixed let style', () => {
      const provider = createMemoryProvider({
        'spec/models/user_spec.rb': `
RSpec.describe User do
  let(:user) { create(:user) }
  let!(:other) { create(:user) }

  it 'works' do
    expect(user).to be_valid
  end
end`,
      })
      const entries = [
        {
          path: 'spec/models/user_spec.rb',
          category: 19,
          categoryName: 'testing',
          specCategory: 'model_specs',
        },
      ]
      const result = extractTestConventions(provider, entries)
      expect(result.let_style).toBe('mixed')
    })
  })

  describe('shared examples', () => {
    it('discovers shared examples in spec/support/', () => {
      const provider = createMemoryProvider({
        'spec/support/shared_examples.rb': `
shared_examples "a valid model" do
  it { is_expected.to be_valid }
end

shared_examples_for "an auditable model" do
  it 'tracks changes' do
    expect(subject).to respond_to(:versions)
  end
end`,
      })
      const entries = [
        {
          path: 'spec/support/shared_examples.rb',
          category: 19,
          categoryName: 'testing',
          specCategory: 'support',
        },
      ]
      const result = extractTestConventions(provider, entries)
      expect(result.shared_examples).toContain('a valid model')
      expect(result.shared_examples).toContain('an auditable model')
      expect(result.shared_examples_count).toBe(2)
    })
  })

  describe('shared contexts', () => {
    it('discovers shared contexts in spec/support/', () => {
      const provider = createMemoryProvider({
        'spec/support/contexts.rb': `
shared_context "authenticated user" do
  let(:user) { create(:user) }
  before { sign_in user }
end`,
      })
      const entries = [
        {
          path: 'spec/support/contexts.rb',
          category: 19,
          categoryName: 'testing',
          specCategory: 'support',
        },
      ]
      const result = extractTestConventions(provider, entries)
      expect(result.shared_contexts).toContain('authenticated user')
      expect(result.shared_contexts_count).toBe(1)
    })
  })

  describe('custom matchers', () => {
    it('finds custom matchers with RSpec::Matchers.define', () => {
      const provider = createMemoryProvider({
        'spec/support/matchers.rb': `
RSpec::Matchers.define :be_published do
  match { |actual| actual.published? }
end

define_negated_matcher :not_include, :include`,
      })
      const entries = [
        {
          path: 'spec/support/matchers.rb',
          category: 19,
          categoryName: 'testing',
          specCategory: 'support',
        },
      ]
      const result = extractTestConventions(provider, entries)
      expect(result.custom_matchers).toContain('be_published')
      expect(result.custom_matchers).toContain('not_include')
    })
  })

  describe('auth helper detection', () => {
    it('detects Devise auth helper from rails_helper.rb', () => {
      const provider = createMemoryProvider({
        'spec/rails_helper.rb': `
RSpec.configure do |config|
  config.include Devise::Test::IntegrationHelpers, type: :request
end`,
      })
      const entries = []
      const result = extractTestConventions(provider, entries)
      expect(result.auth_helper.strategy).toBe('devise')
      expect(result.auth_helper.helper_method).toBe('sign_in')
    })

    it('detects custom auth helper from spec/support/', () => {
      const provider = createMemoryProvider({
        'spec/support/authentication.rb': `
module AuthenticationHelpers
  def sign_in(user)
    post login_path, params: { email: user.email, password: 'password' }
  end
end`,
      })
      const entries = [
        {
          path: 'spec/support/authentication.rb',
          category: 19,
          categoryName: 'testing',
          specCategory: 'support',
        },
      ]
      const result = extractTestConventions(provider, entries)
      expect(result.auth_helper.strategy).toBe('custom')
      expect(result.auth_helper.helper_method).toBe('sign_in')
      expect(result.auth_helper.helper_file).toBe(
        'spec/support/authentication.rb',
      )
    })
  })

  describe('database strategy detection', () => {
    it('detects transactional_fixtures', () => {
      const provider = createMemoryProvider({
        'spec/rails_helper.rb': `
RSpec.configure do |config|
  config.use_transactional_fixtures = true
end`,
      })
      const result = extractTestConventions(provider, [])
      expect(result.database_strategy.strategy).toBe('transactional_fixtures')
      expect(result.database_strategy.config_file).toBe('spec/rails_helper.rb')
    })
  })

  describe('spec counts', () => {
    it('correctly counts specs per category', () => {
      const provider = createMemoryProvider({
        'spec/models/user_spec.rb': 'RSpec.describe User',
        'spec/models/post_spec.rb': 'RSpec.describe Post',
        'spec/requests/users_spec.rb': 'RSpec.describe "Users"',
      })
      const entries = [
        {
          path: 'spec/models/user_spec.rb',
          category: 19,
          categoryName: 'testing',
          specCategory: 'model_specs',
        },
        {
          path: 'spec/models/post_spec.rb',
          category: 19,
          categoryName: 'testing',
          specCategory: 'model_specs',
        },
        {
          path: 'spec/requests/users_spec.rb',
          category: 19,
          categoryName: 'testing',
          specCategory: 'request_specs',
        },
      ]
      const result = extractTestConventions(provider, entries)
      expect(result.spec_counts.model_specs).toBe(2)
      expect(result.spec_counts.request_specs).toBe(1)
    })
  })

  describe('pattern reference files', () => {
    it('selects largest spec per category', () => {
      const provider = createMemoryProvider({
        'spec/models/user_spec.rb': `
RSpec.describe User do
  describe 'validations' do
    it 'validates email' do end
    it 'validates name' do end
    it 'validates role' do end
  end

  describe 'associations' do
    it 'has many posts' do end
    it 'has many comments' do end
  end
end`,
        'spec/models/post_spec.rb': `
RSpec.describe Post do
  it 'is valid' do end
  it 'has title' do end
  it 'has body' do end
end`,
      })
      const entries = [
        {
          path: 'spec/models/user_spec.rb',
          category: 19,
          categoryName: 'testing',
          specCategory: 'model_specs',
        },
        {
          path: 'spec/models/post_spec.rb',
          category: 19,
          categoryName: 'testing',
          specCategory: 'model_specs',
        },
      ]
      const result = extractTestConventions(provider, entries)
      expect(result.pattern_reference_files.length).toBe(1)
      expect(result.pattern_reference_files[0].path).toBe(
        'spec/models/user_spec.rb',
      )
    })
  })

  describe('empty project', () => {
    it('returns sensible defaults with no spec files', () => {
      const provider = createMemoryProvider({})
      const result = extractTestConventions(provider, [])
      expect(result.let_style).toBeNull()
      expect(result.let_count).toBe(0)
      expect(result.subject_usage).toBe(false)
      expect(result.shared_examples).toEqual([])
      expect(result.shared_contexts).toEqual([])
      expect(result.custom_matchers).toEqual([])
      expect(result.factory_tool).toBeNull()
      expect(result.spec_counts).toEqual({})
      expect(result.pattern_reference_files).toEqual([])
    })
  })

  describe('subject and described_class detection', () => {
    it('detects subject usage', () => {
      const provider = createMemoryProvider({
        'spec/models/user_spec.rb': `
RSpec.describe User do
  subject { described_class.new(name: 'Test') }

  it 'is valid' do
    expect(subject).to be_valid
  end

  it 'has name' do end
  it 'has email' do end
end`,
      })
      const entries = [
        {
          path: 'spec/models/user_spec.rb',
          category: 19,
          categoryName: 'testing',
          specCategory: 'model_specs',
        },
      ]
      const result = extractTestConventions(provider, entries)
      expect(result.subject_usage).toBe(true)
      expect(result.described_class_usage).toBe(true)
    })
  })
})
