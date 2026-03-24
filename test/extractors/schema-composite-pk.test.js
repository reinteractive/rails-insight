import { describe, it, expect } from 'vitest'
import { extractSchema } from '../../src/extractors/schema.js'

function makeProvider(content) {
  return { readFile: (path) => (path === 'db/schema.rb' ? content : null) }
}

describe('schema composite primary keys', () => {
  it('composite primary key detected', () => {
    const content = `
ActiveRecord::Schema[7.1].define(version: 2024_01_01) do
  create_table "routes", primary_key: [:origin, :destination] do |t|
    t.string "origin"
    t.string "destination"
    t.integer "distance"
  end
end`
    const result = extractSchema(makeProvider(content))
    const table = result.tables.find((t) => t.name === 'routes')
    expect(table.primary_key.type).toBe('composite')
    expect(table.primary_key.columns).toEqual(['origin', 'destination'])
  })

  it('regular primary key unchanged', () => {
    const content = `
ActiveRecord::Schema[7.1].define(version: 2024_01_01) do
  create_table "users" do |t|
    t.string "name"
  end
end`
    const result = extractSchema(makeProvider(content))
    const table = result.tables.find((t) => t.name === 'users')
    expect(table.primary_key.type).toBe('bigint')
  })

  it('uuid primary key unchanged', () => {
    const content = `
ActiveRecord::Schema[7.1].define(version: 2024_01_01) do
  create_table "users", id: :uuid do |t|
    t.string "name"
  end
end`
    const result = extractSchema(makeProvider(content))
    const table = result.tables.find((t) => t.name === 'users')
    expect(table.primary_key.type).toBe('uuid')
  })
})
