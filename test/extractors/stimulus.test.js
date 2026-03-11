import { describe, it, expect, beforeAll } from 'vitest'
import { extractStimulusController } from '../../src/extractors/stimulus.js'

function mockProvider(files) {
  return {
    readFile(path) {
      return files[path] || null
    },
  }
}

describe('Stimulus Extractor', () => {
  describe('complex controller with all patterns', () => {
    const fixture = `
import { Controller } from "@hotwired/stimulus"
import { debounce } from "../utils/debounce"

export default class extends Controller {
  static targets = ["menu", "button", "item"]
  static values = {
    open: { type: Boolean, default: false },
    closeOnSelect: Boolean
  }
  static classes = ["active", "hidden"]
  static outlets = ["popover"]

  connect() {
    this.closeOnSelectValue = true
  }

  toggle() {
    this.openValue = !this.openValue
  }

  close() {
    this.openValue = false
  }

  select(event) {
    this.dispatch("selected", { detail: event.target })
  }

  keydown(event) {
    if (event.key === "Escape") this.close()
  }

  menuTargetConnected(element) {
    // lifecycle - should be excluded
  }

  openValueChanged() {
    // lifecycle - should be excluded
  }
}`

    let result

    beforeAll(() => {
      const provider = mockProvider({
        'app/javascript/controllers/dropdown_controller.js': fixture,
      })
      result = extractStimulusController(
        provider,
        'app/javascript/controllers/dropdown_controller.js',
      )
    })

    it('derives identifier from file path', () => {
      expect(result.identifier).toBe('dropdown')
    })

    it('extracts targets', () => {
      expect(result.targets).toEqual(['menu', 'button', 'item'])
    })

    it('extracts complex values with type and default', () => {
      expect(result.values.open).toEqual({ type: 'Boolean', default: 'false' })
    })

    it('extracts simple values', () => {
      expect(result.values.closeOnSelect).toEqual({
        type: 'Boolean',
        default: null,
      })
    })

    it('extracts classes', () => {
      expect(result.classes).toEqual(['active', 'hidden'])
    })

    it('extracts outlets', () => {
      expect(result.outlets).toEqual(['popover'])
    })

    it('extracts action methods excluding lifecycle', () => {
      expect(result.actions).toContain('toggle')
      expect(result.actions).toContain('close')
      expect(result.actions).toContain('select')
      expect(result.actions).toContain('keydown')
      expect(result.actions).not.toContain('connect')
      expect(result.actions).not.toContain('menuTargetConnected')
      expect(result.actions).not.toContain('openValueChanged')
    })

    it('extracts imports', () => {
      expect(result.imports).toContain('@hotwired/stimulus')
      expect(result.imports).toContain('../utils/debounce')
    })
  })

  describe('namespaced controller', () => {
    it('derives nested identifier with double dash', () => {
      const provider = mockProvider({
        'app/javascript/controllers/users/filter_controller.js': `
import { Controller } from "@hotwired/stimulus"
export default class extends Controller {
  static targets = ["input"]
  filter() {}
}`,
      })
      const result = extractStimulusController(
        provider,
        'app/javascript/controllers/users/filter_controller.js',
      )
      expect(result.identifier).toBe('users--filter')
    })
  })

  describe('minimal controller', () => {
    it('works with no targets, values, classes, outlets', () => {
      const provider = mockProvider({
        'app/javascript/controllers/hello_controller.js': `
import { Controller } from "@hotwired/stimulus"
export default class extends Controller {
  greet() { alert("hello") }
}`,
      })
      const result = extractStimulusController(
        provider,
        'app/javascript/controllers/hello_controller.js',
      )
      expect(result.identifier).toBe('hello')
      expect(result.targets).toEqual([])
      expect(result.values).toEqual({})
      expect(result.classes).toEqual([])
      expect(result.outlets).toEqual([])
      expect(result.actions).toContain('greet')
    })
  })

  describe('non-stimulus file', () => {
    it('returns null for file without Controller extend', () => {
      const provider = mockProvider({
        'app/javascript/controllers/plain.js': `export default class {}`,
      })
      const result = extractStimulusController(
        provider,
        'app/javascript/controllers/plain.js',
      )
      expect(result).toBeNull()
    })
  })

  describe('missing file', () => {
    it('returns null for missing file', () => {
      const provider = mockProvider({})
      const result = extractStimulusController(
        provider,
        'app/javascript/controllers/missing_controller.js',
      )
      expect(result).toBeNull()
    })
  })
})
