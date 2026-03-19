import { describe, expect, it } from 'vitest'
import fileProviderInterface from '../../src/providers/interface.js'

describe('FileProvider interface module', () => {
  it('exports the placeholder default object', () => {
    expect(fileProviderInterface).toEqual({})
  })
})
