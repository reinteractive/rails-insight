import { describe, it, expect } from 'vitest'
import { resolveFullyQualifiedName } from '../../src/utils/ruby-class-resolver.js'

describe('resolveFullyQualifiedName', () => {
  it('detects single module wrapping', () => {
    const content = `module Backend\n  class AiTrainingController < ApplicationController\n  end\nend`
    const classIndex = content.indexOf('class AiTrainingController')
    const result = resolveFullyQualifiedName(
      content,
      'AiTrainingController',
      classIndex,
    )
    expect(result.fqn).toBe('Backend::AiTrainingController')
    expect(result.namespace).toBe('Backend')
  })

  it('detects deeply nested module wrapping', () => {
    const content = `module Dashboard\n  module Settings\n    class SetupsController < ApplicationController\n    end\n  end\nend`
    const classIndex = content.indexOf('class SetupsController')
    const result = resolveFullyQualifiedName(
      content,
      'SetupsController',
      classIndex,
    )
    expect(result.fqn).toBe('Dashboard::Settings::SetupsController')
    expect(result.namespace).toBe('Dashboard::Settings')
  })

  it('detects compact module::module wrapping', () => {
    const content = `module Api::V1\n  class ProductsController < ApplicationController\n  end\nend`
    const classIndex = content.indexOf('class ProductsController')
    const result = resolveFullyQualifiedName(
      content,
      'ProductsController',
      classIndex,
    )
    expect(result.fqn).toBe('Api::V1::ProductsController')
    expect(result.namespace).toBe('Api::V1')
  })

  it('returns null namespace for unwrapped class', () => {
    const content = `class ApplicationController < ActionController::Base\nend`
    const classIndex = content.indexOf('class ApplicationController')
    const result = resolveFullyQualifiedName(
      content,
      'ApplicationController',
      classIndex,
    )
    expect(result.fqn).toBe('ApplicationController')
    expect(result.namespace).toBeNull()
  })

  it('handles inline :: namespace in class name', () => {
    const content = `class Api::V1::WidgetsController < ApplicationController\nend`
    const classIndex = content.indexOf('class Api::V1::WidgetsController')
    const result = resolveFullyQualifiedName(
      content,
      'Api::V1::WidgetsController',
      classIndex,
    )
    expect(result.fqn).toBe('Api::V1::WidgetsController')
    expect(result.namespace).toBe('Api::V1')
  })

  it('detects module wrapping for models', () => {
    const content = `module Setups\n  class Contact < Setup\n    # no associations\n  end\nend`
    const classIndex = content.indexOf('class Contact')
    const result = resolveFullyQualifiedName(content, 'Contact', classIndex)
    expect(result.fqn).toBe('Setups::Contact')
    expect(result.namespace).toBe('Setups')
  })

  it('handles closed modules before class correctly', () => {
    const content = `module Unrelated
  CONSTANT = 1
end

module Backend
  class AiController < ApplicationController
  end
end`
    const classIndex = content.indexOf('class AiController')
    const result = resolveFullyQualifiedName(content, 'AiController', classIndex)
    expect(result.fqn).toBe('Backend::AiController')
    expect(result.namespace).toBe('Backend')
  })

  it('handles component.rb naming convention', () => {
    const content = `module Search\n  class Component < ViewComponent::Base\n  end\nend`
    const classIndex = content.indexOf('class Component')
    const result = resolveFullyQualifiedName(content, 'Component', classIndex)
    expect(result.fqn).toBe('Search::Component')
    expect(result.namespace).toBe('Search')
  })
})
