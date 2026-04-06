import { describe, it, expect } from 'vitest'
import { extractRoutes } from '../../src/extractors/routes.js'

function makeProvider(content) {
  return { readFile: (path) => (path === 'config/routes.rb' ? content : null) }
}

describe('routes extractor regression fixes', () => {
  describe('scope module: namespace tracking', () => {
    it('resources inside scope module: use the module as controller namespace', () => {
      const content = `
Rails.application.routes.draw do
  scope module: :accounts, path: :account, as: :account do
    resource :profile, only: [:show, :update]
  end
end`
      const result = extractRoutes(makeProvider(content))
      const profile = result.resources.find((r) => r.name === 'profile')
      expect(profile).toBeDefined()
      expect(profile.namespace).toBe('accounts')
      expect(profile.controller).toBe('accounts/profile')
    })

    it('scope module: with string value works', () => {
      const content = `
Rails.application.routes.draw do
  scope module: "admin" do
    resources :reports
  end
end`
      const result = extractRoutes(makeProvider(content))
      const reports = result.resources.find((r) => r.name === 'reports')
      expect(reports).toBeDefined()
      expect(reports.namespace).toBe('admin')
    })

    it('resources outside scope module: are not affected', () => {
      const content = `
Rails.application.routes.draw do
  scope module: :accounts, path: :account do
    resource :profile
  end
  resources :users
end`
      const result = extractRoutes(makeProvider(content))
      const users = result.resources.find((r) => r.name === 'users')
      expect(users).toBeDefined()
      expect(users.namespace).toBeNull()
    })
  })

  describe('singular resource nesting tracking', () => {
    it('singular resource inside plural resources is tracked as nested', () => {
      const content = `
Rails.application.routes.draw do
  resources :products do
    resource :activate
  end
end`
      const result = extractRoutes(makeProvider(content))
      expect(result.nested_relationships).toContainEqual(
        expect.objectContaining({ parent: 'products', child: 'activate' }),
      )
    })

    it('multiple singular resources inside plural resources are all tracked', () => {
      const content = `
Rails.application.routes.draw do
  resources :products do
    resource :activate
    resource :deactivate
    resource :variations
  end
end`
      const result = extractRoutes(makeProvider(content))
      const pairs = result.nested_relationships.map((r) => `${r.parent}/${r.child}`)
      expect(pairs).toContain('products/activate')
      expect(pairs).toContain('products/deactivate')
      expect(pairs).toContain('products/variations')
    })

    it('singular resource nesting sets parent_resource on the child', () => {
      const content = `
Rails.application.routes.draw do
  resources :offers do
    resource :activate
  end
end`
      const result = extractRoutes(makeProvider(content))
      const activate = result.resources.find((r) => r.name === 'activate')
      expect(activate).toBeDefined()
      expect(activate.parent_resource).toBe('offers')
    })

    it('standalone singular resource is not flagged as nested', () => {
      const content = `
Rails.application.routes.draw do
  resource :profile
end`
      const result = extractRoutes(makeProvider(content))
      expect(result.nested_relationships).toHaveLength(0)
      const profile = result.resources.find((r) => r.name === 'profile')
      expect(profile).toBeDefined()
      expect(profile.parent_resource).toBeUndefined()
    })
  })

  describe('orphaned member/collection routes not added to standalone_routes', () => {
    it('member routes inside dynamically-named resources do not leak to standalone_routes', () => {
      const content = `
Rails.application.routes.draw do
  %i[sales parts].each do |name|
    resources name do
      member do
        post :close
        get  :status
      end
      collection do
        get :summary
      end
    end
  end
end`
      const result = extractRoutes(makeProvider(content))
      // The dynamic resource name is not captured by the regex, so member/collection routes
      // must be silently dropped rather than pushed to standalone_routes.
      const memberLeaks = result.standalone_routes.filter(
        (r) => r.action === 'close' || r.action === 'status' || r.action === 'summary',
      )
      expect(memberLeaks).toHaveLength(0)
    })

    it('genuine standalone routes are still captured', () => {
      const content = `
Rails.application.routes.draw do
  get "up" => "rails/health#show"
  post "/webhooks", to: "webhooks#receive"
end`
      const result = extractRoutes(makeProvider(content))
      expect(result.standalone_routes).toHaveLength(2)
      expect(result.standalone_routes).toContainEqual(
        expect.objectContaining({ method: 'GET', action: 'show' }),
      )
    })
  })
})
