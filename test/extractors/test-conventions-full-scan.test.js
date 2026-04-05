import { describe, it, expect } from 'vitest'
import { extractTestConventions } from '../../src/extractors/test-conventions.js'
import { createMemoryProvider } from '../helpers/mock-provider.js'

describe('Test Conventions — full scan (not limited to 20 files)', () => {
  it('detects subject_usage in files beyond the 20th', () => {
    // Create 25 spec files — subject only appears in file #25
    const files = {}
    const entries = []

    for (let i = 1; i <= 24; i++) {
      const path = `spec/models/model${i}_spec.rb`
      files[path] = `
RSpec.describe Model${i} do
  let(:record) { create(:model${i}) }

  it 'works' do
    expect(record).to be_valid
  end
end`
      entries.push({
        path,
        category: 19,
        categoryName: 'testing',
        specCategory: 'model_specs',
      })
    }

    // File #25 has subject usage
    const subjectPath = 'spec/models/model25_spec.rb'
    files[subjectPath] = `
RSpec.describe Model25 do
  subject { described_class.new(name: 'test') }

  it 'is valid' do
    is_expected.to be_valid
  end
end`
    entries.push({
      path: subjectPath,
      category: 19,
      categoryName: 'testing',
      specCategory: 'model_specs',
    })

    const provider = createMemoryProvider(files)
    const result = extractTestConventions(provider, entries)

    expect(result.subject_usage).toBe(true)
  })

  it('detects described_class usage in files beyond the 20th', () => {
    const files = {}
    const entries = []

    for (let i = 1; i <= 24; i++) {
      const path = `spec/models/model${i}_spec.rb`
      files[path] = `
RSpec.describe Model${i} do
  let(:record) { create(:model${i}) }

  it 'works' do
    expect(record).to be_valid
  end
end`
      entries.push({
        path,
        category: 19,
        categoryName: 'testing',
        specCategory: 'model_specs',
      })
    }

    // File #25 has described_class
    const path25 = 'spec/models/model25_spec.rb'
    files[path25] = `
RSpec.describe Model25 do
  it 'creates instance' do
    expect(described_class.new).to be_a(Model25)
  end
end`
    entries.push({
      path: path25,
      category: 19,
      categoryName: 'testing',
      specCategory: 'model_specs',
    })

    const provider = createMemoryProvider(files)
    const result = extractTestConventions(provider, entries)

    expect(result.described_class_usage).toBe(true)
  })

  it('counts let/let! across all files for accurate style classification', () => {
    const files = {}
    const entries = []

    // Create 25 files with mostly lazy let — total should be lazy
    for (let i = 1; i <= 25; i++) {
      const path = `spec/models/model${i}_spec.rb`
      // Files 1-5 use let! (eager), files 6-25 use let (lazy)
      if (i <= 5) {
        files[path] = `
RSpec.describe Model${i} do
  let!(:record) { create(:model${i}) }
  let!(:other) { create(:model${i}) }

  it 'works' do
    expect(record).to be_valid
  end
end`
      } else {
        files[path] = `
RSpec.describe Model${i} do
  let(:record) { create(:model${i}) }
  let(:other) { create(:model${i}) }
  let(:third) { create(:model${i}) }

  it 'works' do
    expect(record).to be_valid
  end
end`
      }
      entries.push({
        path,
        category: 19,
        categoryName: 'testing',
        specCategory: 'model_specs',
      })
    }

    const provider = createMemoryProvider(files)
    const result = extractTestConventions(provider, entries)

    // Total: 10 let! (5 files × 2) + 60 let (20 files × 3) = 70 total
    // ratio = 10/70 = 0.143 → lazy
    expect(result.let_style).toBe('lazy')
    expect(result.let_count).toBe(60)
    expect(result.let_bang_count).toBe(10)
  })
})
