import { describe, it, expect } from 'vitest'
import { detectDrift } from '../../src/core/drift-detector.js'

describe('Drift Detector', () => {
  it('detects legacy enum syntax in Rails 7+ apps', () => {
    const versions = { rails: '7.1' }
    const extractions = {
      models: {
        Order: {
          enums: {
            status: { values: ['pending', 'active'], syntax: 'legacy' },
            priority: { values: ['low', 'high'], syntax: 'legacy' },
          },
        },
      },
    }
    const drift = detectDrift({}, versions, extractions)
    const enumDrift = drift.find((d) => d.category === 'enum_syntax')
    expect(enumDrift).toBeTruthy()
    expect(enumDrift.actual).toContain('2')
    expect(enumDrift.severity).toBe('low')
  })

  it('does not flag enum drift for Rails 6', () => {
    const versions = { rails: '6.1' }
    const extractions = {
      models: {
        Order: {
          enums: {
            status: { values: ['pending', 'active'], syntax: 'legacy' },
          },
        },
      },
    }
    const drift = detectDrift({}, versions, extractions)
    expect(drift.find((d) => d.category === 'enum_syntax')).toBeUndefined()
  })

  it('detects testing framework mismatch', () => {
    const declared = { conventions: ['Use rspec for all tests'] }
    const extractions = {
      tier2: { testing: { framework: 'minitest' } },
    }
    const drift = detectDrift(declared, {}, extractions)
    const testDrift = drift.find((d) => d.category === 'testing')
    expect(testDrift).toBeTruthy()
    expect(testDrift.severity).toBe('medium')
  })

  it('detects views partial drift', () => {
    const declared = { conventions: ['no ERB partials'] }
    const extractions = { views: { partial_renders: 5 } }
    const drift = detectDrift(declared, {}, extractions)
    const viewDrift = drift.find((d) => d.category === 'views')
    expect(viewDrift).toBeTruthy()
    expect(viewDrift.actual).toContain('5')
  })

  it('detects nested stimulus when flat declared', () => {
    const declared = { conventions: ['flat stimulus controllers'] }
    const extractions = {
      stimulus_controllers: [{ identifier: 'admin--dashboard' }],
    }
    const drift = detectDrift(declared, {}, extractions)
    const stimDrift = drift.find((d) => d.category === 'stimulus')
    expect(stimDrift).toBeTruthy()
  })

  it('detects auth strategy mismatch', () => {
    const declared = { stack: ['Rails 8', 'Devise'] }
    const extractions = { auth: { primary_strategy: 'native' } }
    const drift = detectDrift(declared, {}, extractions)
    const authDrift = drift.find((d) => d.category === 'auth')
    expect(authDrift).toBeTruthy()
    expect(authDrift.severity).toBe('medium')
  })

  it('returns empty array when no drift', () => {
    const drift = detectDrift({}, {}, {})
    expect(drift).toEqual([])
  })

  it('returns empty array when no conventions declared', () => {
    const extractions = { views: { partial_renders: 10 } }
    const drift = detectDrift({}, {}, extractions)
    expect(drift).toEqual([])
  })
})
