import { describe, it, expect } from 'vitest'
import { buildIndex } from '../../src/core/indexer.js'
import { createMemoryProvider } from '../helpers/mock-provider.js'

describe('STI namespace resolution', () => {
  it('keeps declared class name for STI subclass in subdirectory', async () => {
    const provider = createMemoryProvider({
      'Gemfile': 'gem "rails"',
      'config/application.rb': 'module TestApp\n  class Application < Rails::Application\n  end\nend',
      'config/routes.rb': 'Rails.application.routes.draw do\nend',
      'app/models/application_record.rb': 'class ApplicationRecord < ActiveRecord::Base\n  self.abstract_class = true\nend',
      'app/models/user.rb': 'class User < ApplicationRecord\nend',
      'app/models/users/admin.rb': 'class Admin < User\n  def admin?\n    true\n  end\nend',
      'app/models/users/instructor.rb': 'class Instructor < User\nend',
    })
    const index = await buildIndex(provider, { verbose: false, noIntrospection: true })
    const models = index.extractions.models

    // Admin should be indexed as 'Admin', not 'Users::Admin'
    expect(models['Admin']).toBeDefined()
    expect(models['Admin'].class).toBe('Admin')
    expect(models['Admin'].superclass).toBe('User')

    // Instructor same
    expect(models['Instructor']).toBeDefined()
    expect(models['Instructor'].class).toBe('Instructor')
  })

  it('applies path-based namespace for non-STI models in subdirectory', async () => {
    const provider = createMemoryProvider({
      'Gemfile': 'gem "rails"',
      'config/application.rb': 'module TestApp\n  class Application < Rails::Application\n  end\nend',
      'config/routes.rb': 'Rails.application.routes.draw do\nend',
      'app/models/application_record.rb': 'class ApplicationRecord < ActiveRecord::Base\n  self.abstract_class = true\nend',
      'app/models/admin/setting.rb': 'class Setting < ApplicationRecord\nend',
    })
    const index = await buildIndex(provider, { verbose: false, noIntrospection: true })
    const models = index.extractions.models

    // Setting inherits from ApplicationRecord, should get path namespace
    expect(models['Admin::Setting']).toBeDefined()
    expect(models['Admin::Setting'].class).toBe('Admin::Setting')
  })
})
