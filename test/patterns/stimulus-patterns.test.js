import { describe, it, expect } from 'vitest'
import { STIMULUS_PATTERNS } from '../../src/core/patterns.js'

describe('STIMULUS_PATTERNS', () => {
  describe('classDeclaration', () => {
    it('matches default export extending Controller', () => {
      expect('export default class extends Controller').toMatch(
        STIMULUS_PATTERNS.classDeclaration,
      )
    })
    it('matches named class', () => {
      const m =
        'export default class DropdownController extends Controller'.match(
          STIMULUS_PATTERNS.classDeclaration,
        )
      expect(m[1]).toBe('DropdownController')
    })
  })

  describe('targets', () => {
    it('matches static targets', () => {
      const m = '  static targets = ["menu", "button"]'.match(
        STIMULUS_PATTERNS.targets,
      )
      expect(m[1]).toContain('menu')
    })
  })

  describe('values', () => {
    it('matches static values', () => {
      const m = '  static values = { open: Boolean, count: Number }'.match(
        STIMULUS_PATTERNS.values,
      )
      expect(m[1]).toContain('open')
    })
  })

  describe('classes', () => {
    it('matches static classes', () => {
      const m = '  static classes = ["active", "hidden"]'.match(
        STIMULUS_PATTERNS.classes,
      )
      expect(m[1]).toContain('active')
    })
  })

  describe('outlets', () => {
    it('matches static outlets', () => {
      const m = '  static outlets = ["popover"]'.match(
        STIMULUS_PATTERNS.outlets,
      )
      expect(m[1]).toContain('popover')
    })
  })
})
