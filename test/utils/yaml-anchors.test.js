import { describe, it, expect } from 'vitest'
import { parseYaml } from '../../src/utils/yaml-parser.js'

describe('YAML anchor/alias support', () => {
  it('resolves anchor and merge key', () => {
    const yaml = `
default: &default
  adapter: postgresql
  encoding: unicode
  pool: 5

development:
  <<: *default
  database: myapp_development

test:
  <<: *default
  database: myapp_test
`
    const result = parseYaml(yaml)
    expect(result.development.adapter).toBe('postgresql')
    expect(result.development.encoding).toBe('unicode')
    expect(result.development.pool).toBe(5)
    expect(result.development.database).toBe('myapp_development')
    expect(result.test.adapter).toBe('postgresql')
    expect(result.test.database).toBe('myapp_test')
  })

  it('resolves simple alias value', () => {
    const yaml = `
shared: &shared_value hello
other: *shared_value
`
    const result = parseYaml(yaml)
    expect(result.shared).toBe('hello')
    expect(result.other).toBe('hello')
  })

  it('anchor without alias is a normal value', () => {
    const yaml = `
default: &default
  host: localhost
  port: 5432
`
    const result = parseYaml(yaml)
    expect(result.default.host).toBe('localhost')
    expect(result.default.port).toBe(5432)
  })

  it('unknown alias resolves to null', () => {
    const yaml = `
other: *nonexistent
`
    const result = parseYaml(yaml)
    expect(result.other).toBeNull()
  })

  it('merge does not overwrite existing keys', () => {
    const yaml = `
default: &default
  adapter: postgresql
  pool: 5

production:
  <<: *default
  pool: 25
`
    const result = parseYaml(yaml)
    // pool: 25 is set after <<: *default merges pool: 5, so 25 should win
    // Actually in YAML, explicit keys override merged keys.
    // Since we process <<: first and pool: second, pool: 25 should win.
    expect(result.production.adapter).toBe('postgresql')
    expect(result.production.pool).toBe(25)
  })
})
