import { describe, it, expect, beforeAll } from 'vitest'
import { extractComponent } from '../../src/extractors/component.js'

function mockProvider(files) {
  return {
    readFile(path) {
      return files[path] || null
    },
  }
}

describe('Component Extractor', () => {
  describe('complex component with all patterns', () => {
    const rbFixture = `
class Ui::ButtonComponent < ApplicationComponent
  renders_one :icon
  renders_one :badge, BadgeComponent
  renders_many :items

  def initialize(label:, variant: :primary, size: :md, disabled: false)
    @label = label
    @variant = variant
    @size = size
    @disabled = disabled
  end
end`

    const templateFixture = `
<button data-controller="tooltip dropdown" data-action="click->tooltip#show">
  <turbo-frame id="button_content">
    <%= render Ui::IconComponent.new(name: @icon) if icon? %>
    <%= render Ui::BadgeComponent.new(count: 5) %>
    <%= render partial: "shared/loading" %>
    <span><%= @label %></span>
  </turbo-frame>
</button>`

    let result

    beforeAll(() => {
      const provider = mockProvider({
        'app/components/ui/button_component.rb': rbFixture,
        'app/components/ui/button_component.html.erb': templateFixture,
      })
      result = extractComponent(
        provider,
        'app/components/ui/button_component.rb',
      )
    })

    // === CLASS ===
    it('extracts class name', () => {
      expect(result.class).toBe('Ui::ButtonComponent')
    })

    it('extracts superclass', () => {
      expect(result.superclass).toBe('ApplicationComponent')
    })

    it('detects ui tier', () => {
      expect(result.tier).toBe('ui')
    })

    // === INITIALIZE PARAMS ===
    it('extracts required keyword param', () => {
      const label = result.initialize_params.find((p) => p.name === 'label')
      expect(label).toBeDefined()
      expect(label.type).toBe('keyword')
      expect(label.required).toBe(true)
      expect(label.default).toBeNull()
    })

    it('extracts keyword param with default', () => {
      const variant = result.initialize_params.find((p) => p.name === 'variant')
      expect(variant.default).toBe(':primary')
      expect(variant.required).toBe(false)
    })

    it('extracts boolean default param', () => {
      const disabled = result.initialize_params.find(
        (p) => p.name === 'disabled',
      )
      expect(disabled.default).toBe('false')
      expect(disabled.required).toBe(false)
    })

    it('extracts all params', () => {
      expect(result.initialize_params).toHaveLength(4)
    })

    // === SLOTS ===
    it('extracts renders_one slots', () => {
      expect(result.slots.renders_one).toContain('icon')
      expect(result.slots.renders_one).toContain('badge')
    })

    it('extracts renders_many slots', () => {
      expect(result.slots.renders_many).toContain('items')
    })

    // === SIDECAR TEMPLATE ===
    it('finds sidecar template', () => {
      expect(result.sidecar_template).toBe(
        'app/components/ui/button_component.html.erb',
      )
    })

    // === STIMULUS ===
    it('extracts stimulus controllers from template', () => {
      expect(result.stimulus_controllers).toContain('tooltip')
      expect(result.stimulus_controllers).toContain('dropdown')
    })

    // === TURBO ===
    it('extracts turbo frames from template', () => {
      expect(result.turbo_frames).toContain('button_content')
    })

    // === CHILD COMPONENTS ===
    it('extracts child component renders', () => {
      expect(result.child_components).toContain('Ui::IconComponent')
      expect(result.child_components).toContain('Ui::BadgeComponent')
    })

    // === PARTIALS ===
    it('detects partial usage', () => {
      expect(result.uses_partials).toBe(true)
    })
  })

  describe('component with collection parameter', () => {
    it('extracts collection parameter', () => {
      const provider = mockProvider({
        'app/components/card_component.rb': `
class CardComponent < ViewComponent::Base
  with_collection_parameter :item

  def initialize(item:)
    @item = item
  end
end`,
      })
      const result = extractComponent(
        provider,
        'app/components/card_component.rb',
      )
      expect(result.collection_parameter).toBe('item')
    })
  })

  describe('minimal component no template', () => {
    it('works without sidecar template', () => {
      const provider = mockProvider({
        'app/components/simple_component.rb': `
class SimpleComponent < ViewComponent::Base
  def initialize(text:)
    @text = text
  end
end`,
      })
      const result = extractComponent(
        provider,
        'app/components/simple_component.rb',
      )
      expect(result.class).toBe('SimpleComponent')
      expect(result.sidecar_template).toBeNull()
      expect(result.stimulus_controllers).toEqual([])
      expect(result.slots.renders_one).toEqual([])
    })
  })

  describe('component without initialize', () => {
    it('returns empty params', () => {
      const provider = mockProvider({
        'app/components/empty_component.rb': `
class EmptyComponent < ApplicationComponent
end`,
      })
      const result = extractComponent(
        provider,
        'app/components/empty_component.rb',
      )
      expect(result.initialize_params).toEqual([])
    })
  })

  describe('non-component file', () => {
    it('returns null for non-component class', () => {
      const provider = mockProvider({
        'app/components/not_a_component.rb': `class NotAComponent\nend`,
      })
      const result = extractComponent(
        provider,
        'app/components/not_a_component.rb',
      )
      expect(result).toBeNull()
    })
  })

  describe('missing file', () => {
    it('returns null for missing file', () => {
      const provider = mockProvider({})
      const result = extractComponent(
        provider,
        'app/components/missing_component.rb',
      )
      expect(result).toBeNull()
    })
  })

  describe('page tier detection', () => {
    it('detects page tier', () => {
      const provider = mockProvider({
        'app/components/page_component.rb': `
class PageComponent < ApplicationComponent
end`,
      })
      const result = extractComponent(
        provider,
        'app/components/page_component.rb',
      )
      expect(result.tier).toBe('page')
    })
  })

  describe('layout tier detection', () => {
    it('detects layout tier', () => {
      const provider = mockProvider({
        'app/components/layout_component.rb': `
class LayoutComponent < ApplicationComponent
end`,
      })
      const result = extractComponent(
        provider,
        'app/components/layout_component.rb',
      )
      expect(result.tier).toBe('layout')
    })
  })

  describe('ISSUE-A/D: component.rb naming convention with module wrapping', () => {
    it('extracts FQN from module-wrapped component.rb file', () => {
      const content = `module Search\n  class Component < ViewComponent::Base\n    def initialize(query:)\n      @query = query\n    end\n  end\nend`
      const provider = mockProvider({
        'app/components/search/component.rb': content,
      })
      const result = extractComponent(
        provider,
        'app/components/search/component.rb',
      )
      expect(result).not.toBeNull()
      expect(result.class).toBe('Search::Component')
      expect(result.namespace).toBe('Search')
    })

    it('extracts FQN from deeply namespaced component.rb', () => {
      const content = `module CounterWidget\n  class Component < ViewComponent::Base\n  end\nend`
      const provider = mockProvider({
        'app/components/counter_widget/component.rb': content,
      })
      const result = extractComponent(
        provider,
        'app/components/counter_widget/component.rb',
      )
      expect(result).not.toBeNull()
      expect(result.class).toBe('CounterWidget::Component')
    })

    it('still extracts classic *_component.rb files correctly', () => {
      const content = `class OfferComponent < ViewComponent::Base\n  def initialize(offer:)\n    @offer = offer\n  end\nend`
      const provider = mockProvider({
        'app/components/offer_component.rb': content,
      })
      const result = extractComponent(
        provider,
        'app/components/offer_component.rb',
      )
      expect(result).not.toBeNull()
      expect(result.class).toBe('OfferComponent')
      expect(result.namespace).toBeNull()
    })
  })
})
