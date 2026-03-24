import { describe, it, expect, beforeAll } from 'vitest'
import { extractRoutes } from '../../src/extractors/routes.js'

function mockProvider(files) {
  return {
    readFile(path) {
      return files[path] || null
    },
  }
}

describe('Routes Extractor', () => {
  describe('complex routes file', () => {
    const fixture = `
Rails.application.routes.draw do
  root "pages#home"

  resources :projects do
    member do
      post "archive"
      post "duplicate"
    end
    collection do
      get "search"
      get "export"
    end
    resources :tasks, only: [:index, :show, :create]
  end

  resources :users, only: [:index, :show]

  namespace :api do
    namespace :v2 do
      resources :posts
    end
  end

  resource :profile

  mount Sidekiq::Web, at: "/sidekiq"
  mount ActionCable.server, at: "/cable"

  concern :commentable do
    resources :comments
  end

  get "up" => "rails/health#show"
  get "/about", to: "pages#about"

  draw :admin
end`

    const adminRoutes = `
resources :dashboard, only: [:index]
`

    const provider = mockProvider({
      'config/routes.rb': fixture,
      'config/routes/admin.rb': adminRoutes,
    })
    const result = extractRoutes(provider)

    it('extracts root route', () => {
      expect(result.root).toEqual({ controller: 'pages', action: 'home' })
    })

    it('extracts resources', () => {
      const projects = result.resources.find((r) => r.name === 'projects')
      expect(projects).toBeDefined()
      expect(projects.actions).toHaveLength(7)
    })

    it('extracts member routes', () => {
      const projects = result.resources.find((r) => r.name === 'projects')
      expect(projects.member_routes).toContain('archive')
      expect(projects.member_routes).toContain('duplicate')
    })

    it('extracts collection routes', () => {
      const projects = result.resources.find((r) => r.name === 'projects')
      expect(projects.collection_routes).toContain('search')
      expect(projects.collection_routes).toContain('export')
    })

    it('extracts nested resources', () => {
      const tasks = result.resources.find((r) => r.name === 'tasks')
      expect(tasks).toBeDefined()
      expect(tasks.actions).toEqual(['index', 'show', 'create'])
    })

    it('extracts only: option', () => {
      const users = result.resources.find((r) => r.name === 'users')
      expect(users.actions).toEqual(['index', 'show'])
    })

    it('extracts namespaced resources', () => {
      const posts = result.resources.find((r) => r.name === 'posts')
      expect(posts).toBeDefined()
      expect(posts.namespace).toBe('api/v2')
      expect(posts.controller).toBe('api/v2/posts')
    })

    it('extracts singular resource', () => {
      const profile = result.resources.find((r) => r.name === 'profile')
      expect(profile).toBeDefined()
      expect(profile.singular).toBe(true)
    })

    it('extracts mounted engines', () => {
      expect(result.mounted_engines).toHaveLength(2)
      const sidekiq = result.mounted_engines.find(
        (e) => e.engine === 'Sidekiq::Web',
      )
      expect(sidekiq.path).toBe('/sidekiq')
    })

    it('extracts concerns', () => {
      expect(result.concerns).toContain('commentable')
    })

    it('extracts standalone routes', () => {
      const health = result.standalone_routes.find((r) => r.path === 'up')
      expect(health).toBeDefined()

      const about = result.standalone_routes.find((r) => r.path === '/about')
      expect(about).toBeDefined()
      expect(about.controller).toBe('pages')
      expect(about.action).toBe('about')
    })

    it('handles draw for route splitting', () => {
      expect(result.drawn_files).toContain('admin')
      const dashboard = result.resources.find((r) => r.name === 'dashboard')
      expect(dashboard).toBeDefined()
    })
  })

  describe('root-only routes', () => {
    it('handles routes with only root', () => {
      const result = extractRoutes(
        mockProvider({
          'config/routes.rb':
            'Rails.application.routes.draw do\n  root "home#index"\nend\n',
        }),
      )
      expect(result.root).toEqual({ controller: 'home', action: 'index' })
      expect(result.resources).toEqual([])
    })
  })

  describe('empty routes', () => {
    it('handles empty routes file', () => {
      const result = extractRoutes(
        mockProvider({
          'config/routes.rb': 'Rails.application.routes.draw do\nend\n',
        }),
      )
      expect(result.root).toBeNull()
      expect(result.resources).toEqual([])
      expect(result.standalone_routes).toEqual([])
    })
  })

  describe('missing routes file', () => {
    it('returns empty structure', () => {
      const result = extractRoutes(mockProvider({}))
      expect(result.root).toBeNull()
      expect(result.resources).toEqual([])
    })
  })

  describe('except option', () => {
    it('handles except: constraint', () => {
      const result = extractRoutes(
        mockProvider({
          'config/routes.rb':
            '  resources :articles, except: [:destroy, :edit]\n',
        }),
      )
      const articles = result.resources.find((r) => r.name === 'articles')
      expect(articles.actions).not.toContain('destroy')
      expect(articles.actions).not.toContain('edit')
      expect(articles.actions).toContain('index')
    })
  })

  describe('deep nesting', () => {
    it('handles deeply nested namespaces', () => {
      const fixture = `
Rails.application.routes.draw do
  namespace :api do
    namespace :v1 do
      namespace :admin do
        resources :settings
      end
    end
  end
end`
      const result = extractRoutes(
        mockProvider({ 'config/routes.rb': fixture }),
      )
      const settings = result.resources.find((r) => r.name === 'settings')
      expect(settings.namespace).toBe('api/v1/admin')
    })
  })

  // === BUG REGRESSION TESTS ===

  describe('Bug 1 — member and collection blocks are parsed', () => {
    let result
    beforeAll(() => {
      const fixture = `
Rails.application.routes.draw do
  resources :asset_reviews do
    collection do
      get :add_row
      post :submit
    end
    member do
      get :edit_row
      put :approve
      put :reject
    end
  end
end`
      result = extractRoutes(mockProvider({ 'config/routes.rb': fixture }))
    })

    it('captures collection routes from collection do block', () => {
      const r = result.resources.find((r) => r.name === 'asset_reviews')
      expect(r.collection_routes).toContain('add_row')
      expect(r.collection_routes).toContain('submit')
    })

    it('captures member routes from member do block', () => {
      const r = result.resources.find((r) => r.name === 'asset_reviews')
      expect(r.member_routes).toContain('edit_row')
      expect(r.member_routes).toContain('approve')
      expect(r.member_routes).toContain('reject')
    })

    it('does not bleed member/collection routes into child resources', () => {
      const fixture = `
Rails.application.routes.draw do
  resources :orders do
    member do
      put :cancel
    end
    resources :line_items
  end
end`
      const r2 = extractRoutes(mockProvider({ 'config/routes.rb': fixture }))
      const orders = r2.resources.find((r) => r.name === 'orders')
      const lineItems = r2.resources.find((r) => r.name === 'line_items')
      expect(orders.member_routes).toContain('cancel')
      expect(lineItems.member_routes).toHaveLength(0)
    })
    it('does not crash when a singular resource has a member do block', () => {
      const fixture = `
Rails.application.routes.draw do
  resources :asset_reviews do
    resource :export, only: [:show] do
      member do
        put :ready
        get :download
      end
    end
  end
end`
      const result = extractRoutes(
        mockProvider({ 'config/routes.rb': fixture }),
      )
      const exportR = result.resources.find((r) => r.name === 'export')
      expect(exportR).toBeDefined()
      expect(exportR.member_routes).toContain('ready')
      expect(exportR.member_routes).toContain('download')
    })
  })

  describe('Bug 2 — only: with single symbol (non-array) form', () => {
    it('restricts actions when only: :symbol is used', () => {
      const fixture = `
Rails.application.routes.draw do
  resources :styleguides, only: :index
end`
      const result = extractRoutes(
        mockProvider({ 'config/routes.rb': fixture }),
      )
      const r = result.resources.find((r) => r.name === 'styleguides')
      expect(r.actions).toEqual(['index'])
    })

    it('still works with only: [:array] form', () => {
      const fixture = `
Rails.application.routes.draw do
  resources :approvals, only: [:index, :create]
end`
      const result = extractRoutes(
        mockProvider({ 'config/routes.rb': fixture }),
      )
      const r = result.resources.find((r) => r.name === 'approvals')
      expect(r.actions).toEqual(['index', 'create'])
    })

    it('handles singular resource with only: :symbol', () => {
      const fixture = `
Rails.application.routes.draw do
  resource :profile, only: :show
end`
      const result = extractRoutes(
        mockProvider({ 'config/routes.rb': fixture }),
      )
      const r = result.resources.find((r) => r.name === 'profile')
      expect(r.actions).toEqual(['show'])
    })
  })
})
