import { describe, it, expect } from 'vitest'
import { ROUTE_PATTERNS } from '../../src/core/patterns.js'

describe('ROUTE_PATTERNS', () => {
  describe('resources', () => {
    it('matches resources :users', () => {
      const m = '  resources :users'.match(ROUTE_PATTERNS.resources)
      expect(m[1]).toBe('users')
    })
    it('matches resources with options', () => {
      const m = '  resources :users, only: [:index, :show]'.match(
        ROUTE_PATTERNS.resources,
      )
      expect(m[1]).toBe('users')
    })
    it('matches resources with do block', () => {
      const m = '  resources :users do'.match(ROUTE_PATTERNS.resources)
      expect(m[1]).toBe('users')
    })
    it('does not match namespace', () => {
      expect('  namespace :api do').not.toMatch(ROUTE_PATTERNS.resources)
    })
  })

  describe('namespace', () => {
    it('matches namespace', () => {
      const m = '  namespace :api do'.match(ROUTE_PATTERNS.namespace)
      expect(m[1]).toBe('api')
    })
    it('does not match scope', () => {
      expect('  scope "/admin" do').not.toMatch(ROUTE_PATTERNS.namespace)
    })
  })

  describe('root', () => {
    it('matches root route', () => {
      const m = '  root "pages#home"'.match(ROUTE_PATTERNS.root)
      expect(m[1]).toBe('pages')
      expect(m[2]).toBe('home')
    })
    it('matches root with to:', () => {
      const m = '  root to: "dashboard#index"'.match(ROUTE_PATTERNS.root)
      expect(m[1]).toBe('dashboard')
    })
  })

  describe('mount', () => {
    it('matches engine mount with =>', () => {
      const m = '  mount Sidekiq::Web => "/sidekiq"'.match(ROUTE_PATTERNS.mount)
      expect(m[1]).toBe('Sidekiq::Web')
      expect(m[2]).toBe('/sidekiq')
    })
    it('matches engine mount with at:', () => {
      const m = '  mount ActionCable.server, at: "/cable"'.match(
        ROUTE_PATTERNS.mount,
      )
      expect(m[2]).toBe('/cable')
    })
  })

  describe('httpVerb', () => {
    it('matches get route', () => {
      expect('  get "/health"').toMatch(ROUTE_PATTERNS.httpVerb)
    })
    it('matches post with to:', () => {
      const m = '  post "/webhooks", to: "webhooks#create"'.match(
        ROUTE_PATTERNS.httpVerb,
      )
      expect(m[1]).toBe('/webhooks')
    })
  })

  describe('concern', () => {
    it('matches concern definition', () => {
      const m = '  concern :commentable do'.match(ROUTE_PATTERNS.concern)
      expect(m[1]).toBe('commentable')
    })
  })

  describe('draw', () => {
    it('matches draw', () => {
      expect('  draw :api').toMatch(ROUTE_PATTERNS.draw)
    })
  })

  describe('only', () => {
    it('extracts only actions', () => {
      const m = 'only: [:index, :show]'.match(ROUTE_PATTERNS.only)
      expect(m[1]).toContain('index')
    })
  })

  describe('healthCheck', () => {
    it('matches health check route', () => {
      expect('  get "up"').toMatch(ROUTE_PATTERNS.healthCheck)
    })
  })
})
