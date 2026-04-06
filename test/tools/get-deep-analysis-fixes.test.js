import { describe, it, expect } from 'vitest'
import { buildIndex } from '../../src/core/indexer.js'
import { register } from '../../src/tools/handlers/get-deep-analysis.js'

function makeProvider(files) {
  return {
    readFile(path) { return files[path] ?? null },
    readLines(path) { return (files[path] ?? '').split('\n') },
    fileExists(path) { return Object.keys(files).some(k => k === path || k.startsWith(path + '/')) },
    glob(pattern) {
      // Simple glob: support ** by returning all files that match the extension
      const ext = pattern.split('.').pop()
      return Object.keys(files).filter(k => k.endsWith('.' + ext))
    },
    listDir(dir) {
      const prefix = dir.endsWith('/') ? dir : dir + '/'
      return [...new Set(Object.keys(files)
        .filter(k => k.startsWith(prefix))
        .map(k => k.slice(prefix.length).split('/')[0]))]
    },
    getProjectRoot() { return '/test' },
  }
}

async function callDeepAnalysis(state, category, name) {
  let handler
  const mockServer = {
    tool(_name, _desc, _schema, fn) {
      handler = fn
    },
  }
  register(mockServer, state)
  const resp = await handler({ category, name })
  return JSON.parse(resp.content[0].text)
}

describe('get_deep_analysis model_list', () => {
  it('excludes concern types from model_list', async () => {
    const provider = makeProvider({
      'app/models/user.rb': 'class User < ApplicationRecord\nend\n',
      'app/models/concerns/user_ransackable.rb':
        'module UserRansackable\n  extend ActiveSupport::Concern\nend\n',
    })
    const index = await buildIndex(provider, false)
    const state = { index, provider, verbose: false }
    const result = await callDeepAnalysis(state, 'model_list')
    const names = result.map((m) => m.name)
    expect(names).toContain('User')
    expect(names).not.toContain('UserRansackable')
  })

  it('excludes module types from model_list', async () => {
    const provider = makeProvider({
      'app/models/user.rb': 'class User < ApplicationRecord\nend\n',
      'app/models/orderable.rb':
        'module Orderable\n  extend ActiveSupport::Concern\nend\n',
    })
    const index = await buildIndex(provider, false)
    const state = { index, provider, verbose: false }
    const result = await callDeepAnalysis(state, 'model_list')
    const names = result.map((m) => m.name)
    expect(names).toContain('User')
    expect(names).not.toContain('Orderable')
  })

  it('excludes poro types from model_list', async () => {
    const provider = makeProvider({
      'app/models/user.rb': 'class User < ApplicationRecord\nend\n',
      'app/models/delivery_address.rb':
        'class DeliveryAddress\n  include ActiveModel::Model\nend\n',
    })
    const index = await buildIndex(provider, false)
    const state = { index, provider, verbose: false }
    const result = await callDeepAnalysis(state, 'model_list')
    const names = result.map((m) => m.name)
    expect(names).toContain('User')
    expect(names).not.toContain('DeliveryAddress')
  })
})

describe('get_deep_analysis jobs adapter — Gemfile.lock fallback', () => {
  it('detects sidekiq adapter from Gemfile.lock when not in Gemfile', async () => {
    const provider = makeProvider({
      Gemfile: "source 'https://rubygems.org'\ngem 'rails', '~> 7'\n",
      'Gemfile.lock':
        'GEM\n  remote: https://rubygems.org/\n  specs:\n    sidekiq (6.5.1)\n\nBUNDLED WITH\n   2.4.0\n',
      'app/jobs/my_job.rb':
        'class MyJob < ApplicationJob\n  def perform; end\nend\n',
    })
    const index = await buildIndex(provider, false)
    const state = { index, provider, verbose: false }
    const result = await callDeepAnalysis(state, 'jobs')
    expect(result.adapter).toBe('sidekiq')
  })

  it('detects delayed_job adapter from Gemfile.lock', async () => {
    const provider = makeProvider({
      Gemfile: "source 'https://rubygems.org'\ngem 'rails'\n",
      'Gemfile.lock':
        'GEM\n  remote: https://rubygems.org/\n  specs:\n    delayed_job (4.1.11)\n\nBUNDLED WITH\n   2.4.0\n',
    })
    const index = await buildIndex(provider, false)
    const state = { index, provider, verbose: false }
    const result = await callDeepAnalysis(state, 'jobs')
    expect(result.adapter).toBe('delayed_job')
  })
})

describe('get_deep_analysis authentication — devise module continuation', () => {
  it('does not include non-devise attr_accessor symbols as devise modules', async () => {
    const provider = makeProvider({
      Gemfile: "gem 'devise'\n",
      'app/models/patient.rb': `class Patient < ApplicationRecord
  devise :magic_link_authenticatable, :trackable, :timeoutable
  attr_accessor :skip_sync_with_salesforce
end
`,
    })
    const index = await buildIndex(provider, false)
    const state = { index, provider, verbose: false }
    const result = await callDeepAnalysis(state, 'authentication')
    const modules = result.devise?.models?.Patient?.modules || []
    expect(modules).toContain('magic_link_authenticatable')
    expect(modules).toContain('trackable')
    expect(modules).not.toContain('skip_sync_with_salesforce')
  })

  it('correctly handles comma-continuation multi-line devise :mod1, :mod2,\n  :mod3', async () => {
    const provider = makeProvider({
      Gemfile: "gem 'devise'\n",
      'app/models/user.rb': `class User < ApplicationRecord
  devise :database_authenticatable, :recoverable,
         :rememberable, :validatable
end
`,
    })
    const index = await buildIndex(provider, false)
    const state = { index, provider, verbose: false }
    const result = await callDeepAnalysis(state, 'authentication')
    const modules = result.devise?.models?.User?.modules || []
    expect(modules).toContain('database_authenticatable')
    expect(modules).toContain('recoverable')
    expect(modules).toContain('rememberable')
    expect(modules).toContain('validatable')
  })
})
