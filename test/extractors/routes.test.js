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
      expect(projects.member_routes).toContainEqual(
        expect.objectContaining({ action: 'archive' }),
      )
      expect(projects.member_routes).toContainEqual(
        expect.objectContaining({ action: 'duplicate' }),
      )
    })

    it('extracts collection routes', () => {
      const projects = result.resources.find((r) => r.name === 'projects')
      expect(projects.collection_routes).toContainEqual(
        expect.objectContaining({ action: 'search' }),
      )
      expect(projects.collection_routes).toContainEqual(
        expect.objectContaining({ action: 'export' }),
      )
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
      expect(r.collection_routes).toContainEqual(
        expect.objectContaining({ action: 'add_row' }),
      )
      expect(r.collection_routes).toContainEqual(
        expect.objectContaining({ action: 'submit' }),
      )
    })

    it('captures member routes from member do block', () => {
      const r = result.resources.find((r) => r.name === 'asset_reviews')
      expect(r.member_routes).toContainEqual(
        expect.objectContaining({ action: 'edit_row' }),
      )
      expect(r.member_routes).toContainEqual(
        expect.objectContaining({ action: 'approve' }),
      )
      expect(r.member_routes).toContainEqual(
        expect.objectContaining({ action: 'reject' }),
      )
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
      expect(orders.member_routes).toContainEqual(
        expect.objectContaining({ action: 'cancel' }),
      )
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
      expect(exportR.member_routes).toContainEqual(
        expect.objectContaining({ action: 'ready' }),
      )
      expect(exportR.member_routes).toContainEqual(
        expect.objectContaining({ action: 'download' }),
      )
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

  describe('ISSUE-13: devise_for and draw_routes', () => {
    it('extracts devise_for declarations', () => {
      const fixture = `
Rails.application.routes.draw do
  devise_for :users
  devise_for :admins
  resources :posts
end`
      const result = extractRoutes(
        mockProvider({ 'config/routes.rb': fixture }),
      )
      expect(result.devise_routes).toBeDefined()
      expect(result.devise_routes.length).toBe(2)
      expect(result.devise_routes[0].model).toBe('users')
      expect(result.devise_routes[1].model).toBe('admins')
    })

    it('parses draw_routes helper files', () => {
      const files = {
        'config/routes.rb': `
Rails.application.routes.draw do
  draw_routes :admin
end`,
        'config/routes/admin_routes.rb': `resources :users`,
      }
      const result = extractRoutes(mockProvider(files))
      expect(result.resources.some((r) => r.name === 'users')).toBe(true)
    })

    it('parses draw helper files', () => {
      const files = {
        'config/routes.rb': `
Rails.application.routes.draw do
  draw :api
end`,
        'config/routes/api.rb': `resources :products`,
      }
      const result = extractRoutes(mockProvider(files))
      expect(result.resources.some((r) => r.name === 'products')).toBe(true)
    })
  })

  describe('ISSUE-G: root route hash rocket syntax', () => {
    it('extracts root route with hash rocket syntax', () => {
      const provider = mockProvider({
        'config/routes.rb': `Rails.application.routes.draw do\n  root :to => 'homepage#index'\nend`,
      })
      const result = extractRoutes(provider)
      expect(result.root).toBeDefined()
      expect(result.root.controller).toBe('homepage')
      expect(result.root.action).toBe('index')
    })

    it('still extracts root route with modern to: syntax', () => {
      const provider = mockProvider({
        'config/routes.rb': `Rails.application.routes.draw do\n  root to: 'pages#home'\nend`,
      })
      const result = extractRoutes(provider)
      expect(result.root).toBeDefined()
      expect(result.root.controller).toBe('pages')
    })

    it('still extracts root route with bare string syntax', () => {
      const provider = mockProvider({
        'config/routes.rb': `Rails.application.routes.draw do\n  root 'dashboard#show'\nend`,
      })
      const result = extractRoutes(provider)
      expect(result.root).toBeDefined()
      expect(result.root.controller).toBe('dashboard')
    })
  })

  describe('route only/except filtering', () => {
    it('respects :only with modern syntax', () => {
      const result = extractRoutes(
        mockProvider({
          'config/routes.rb': `Rails.application.routes.draw do\n  resources :articles, only: [:index, :show]\nend`,
        }),
      )
      const articles = result.resources.find((r) => r.name === 'articles')
      expect(articles.actions).toEqual(['index', 'show'])
      expect(articles.actions).not.toContain('create')
      expect(articles.actions).not.toContain('destroy')
    })

    it('respects :except with modern syntax', () => {
      const result = extractRoutes(
        mockProvider({
          'config/routes.rb': `Rails.application.routes.draw do\n  resources :events, except: [:show, :destroy]\nend`,
        }),
      )
      const events = result.resources.find((r) => r.name === 'events')
      expect(events.actions).toContain('index')
      expect(events.actions).toContain('create')
      expect(events.actions).not.toContain('show')
      expect(events.actions).not.toContain('destroy')
    })

    it('respects :only with hash rocket syntax', () => {
      const result = extractRoutes(
        mockProvider({
          'config/routes.rb': `Rails.application.routes.draw do\n  resources :articles, :only => [:index, :show]\nend`,
        }),
      )
      const articles = result.resources.find((r) => r.name === 'articles')
      expect(articles.actions).toEqual(['index', 'show'])
    })

    it('respects :except with hash rocket syntax', () => {
      const result = extractRoutes(
        mockProvider({
          'config/routes.rb': `Rails.application.routes.draw do\n  resources :events, :except => [:show]\nend`,
        }),
      )
      const events = result.resources.find((r) => r.name === 'events')
      expect(events.actions).not.toContain('show')
      expect(events.actions).toHaveLength(6)
    })

    it('respects :only with %i[] syntax', () => {
      const result = extractRoutes(
        mockProvider({
          'config/routes.rb': `Rails.application.routes.draw do\n  resources :posts, only: %i[index show]\nend`,
        }),
      )
      const posts = result.resources.find((r) => r.name === 'posts')
      expect(posts.actions).toEqual(['index', 'show'])
    })

    it('respects :only with single symbol', () => {
      const result = extractRoutes(
        mockProvider({
          'config/routes.rb': `Rails.application.routes.draw do\n  resources :sessions, only: :create\nend`,
        }),
      )
      const sessions = result.resources.find((r) => r.name === 'sessions')
      expect(sessions.actions).toEqual(['create'])
    })

    it('reports all 7 actions when no only/except given', () => {
      const result = extractRoutes(
        mockProvider({
          'config/routes.rb': `Rails.application.routes.draw do\n  resources :users\nend`,
        }),
      )
      const users = result.resources.find((r) => r.name === 'users')
      expect(users.actions).toHaveLength(7)
    })
  })

  describe('ISSUE-E: resources with only: [] produces zero actions', () => {
    it('resources with only: [] produces zero actions', () => {
      const result = extractRoutes(
        mockProvider({
          'config/routes.rb': `Rails.application.routes.draw do
  resources :emails, only: [] do
    member do
      post :deliver
    end
  end
end`,
        }),
      )
      const emails = result.resources.find((r) => r.name === 'emails')
      expect(emails).toBeDefined()
      expect(emails.actions).toEqual([])
      expect(emails.member_routes).toContainEqual(
        expect.objectContaining({ action: 'deliver' }),
      )
    })

    it('resources with only: [] and hash rocket produces zero actions', () => {
      const result = extractRoutes(
        mockProvider({
          'config/routes.rb': `Rails.application.routes.draw do
  resources :webhooks, :only => []
end`,
        }),
      )
      const webhooks = result.resources.find((r) => r.name === 'webhooks')
      expect(webhooks).toBeDefined()
      expect(webhooks.actions).toEqual([])
    })
  })

  describe('resource deduplication', () => {
    it('merges duplicate resources with same name and namespace into one entry with combined actions', () => {
      const result = extractRoutes(
        mockProvider({
          'config/routes.rb': `Rails.application.routes.draw do
  resources :businesses, only: [:show]
  resources :businesses, only: [:index]
end`,
        }),
      )
      const businesses = result.resources.filter((r) => r.name === 'businesses')
      expect(businesses).toHaveLength(1)
      expect(businesses[0].actions).toContain('show')
      expect(businesses[0].actions).toContain('index')
      expect(businesses[0].actions).toHaveLength(2)
    })

    it('does NOT merge resources with same name but different namespaces', () => {
      const result = extractRoutes(
        mockProvider({
          'config/routes.rb': `Rails.application.routes.draw do
  resources :users, only: [:index]
  namespace :admin do
    resources :users, only: [:show, :edit, :update]
  end
end`,
        }),
      )
      const rootUsers = result.resources.find(
        (r) => r.name === 'users' && !r.namespace,
      )
      const adminUsers = result.resources.find(
        (r) => r.name === 'users' && r.namespace === 'admin',
      )
      expect(rootUsers).toBeDefined()
      expect(adminUsers).toBeDefined()
      expect(rootUsers.actions).toEqual(['index'])
      expect(adminUsers.actions).toEqual(['show', 'edit', 'update'])
    })

    it('merges member_routes and collection_routes from duplicate resources', () => {
      const result = extractRoutes(
        mockProvider({
          'config/routes.rb': `Rails.application.routes.draw do
  resources :posts do
    member do
      get :preview
    end
  end
  resources :posts do
    collection do
      get :search
    end
  end
end`,
        }),
      )
      const posts = result.resources.filter((r) => r.name === 'posts')
      expect(posts).toHaveLength(1)
      expect(posts[0].member_routes).toContainEqual(
        expect.objectContaining({ action: 'preview' }),
      )
      expect(posts[0].collection_routes).toContainEqual(
        expect.objectContaining({ action: 'search' }),
      )
    })

    it('merges duplicate resources from drawn sub-route files within same scope', () => {
      const result = extractRoutes(
        mockProvider({
          'config/routes.rb': `Rails.application.routes.draw do
  draw :directory
end`,
          'config/routes/directory.rb': `
  scope "city" do
    resources :events, only: [:index, :show]
    resources :events, only: []
    resources :businesses, only: [:show]
    resources :businesses, only: [:index]
  end
`,
        }),
      )
      const events = result.resources.filter((r) => r.name === 'events')
      expect(events).toHaveLength(1)
      expect(events[0].actions).toContain('index')
      expect(events[0].actions).toContain('show')

      const businesses = result.resources.filter((r) => r.name === 'businesses')
      expect(businesses).toHaveLength(1)
      expect(businesses[0].actions).toContain('show')
      expect(businesses[0].actions).toContain('index')
    })

    it('deduplicates actions when same action appears in multiple declarations', () => {
      const result = extractRoutes(
        mockProvider({
          'config/routes.rb': `Rails.application.routes.draw do
  resources :articles, only: [:index, :show]
  resources :articles, only: [:show, :create]
end`,
        }),
      )
      const articles = result.resources.filter((r) => r.name === 'articles')
      expect(articles).toHaveLength(1)
      expect(articles[0].actions).toEqual(
        expect.arrayContaining(['index', 'show', 'create']),
      )
      expect(articles[0].actions).toHaveLength(3)
    })

    it('deduplicates nested_relationships for merged resources', () => {
      const result = extractRoutes(
        mockProvider({
          'config/routes.rb': `Rails.application.routes.draw do
  resources :projects do
    resources :tasks, only: [:index]
  end
  resources :projects do
    resources :tasks, only: [:show]
  end
end`,
        }),
      )
      const taskRelationships = result.nested_relationships.filter(
        (r) => r.parent === 'projects' && r.child === 'tasks',
      )
      expect(taskRelationships).toHaveLength(1)
    })

    it('does NOT merge namespace entry with same-named resource entry', () => {
      const result = extractRoutes(
        mockProvider({
          'config/routes.rb': `Rails.application.routes.draw do
  namespace :asset_reviews do
    resource :export, only: [:show]
  end
  resources :asset_reviews do
    collection do
      post :submit
    end
  end
end`,
        }),
      )
      // Both should exist separately
      const nsEntry = result.resources.find(
        (r) => r.name === 'asset_reviews' && r.type === 'namespace',
      )
      const resEntry = result.resources.find(
        (r) => r.name === 'asset_reviews' && r.type !== 'namespace',
      )
      expect(nsEntry).toBeDefined()
      expect(resEntry).toBeDefined()
      expect(resEntry.collection_routes).toContainEqual(
        expect.objectContaining({ action: 'submit' }),
      )
    })

    it('does NOT merge nested namespace with same-named resource in parent namespace', () => {
      const result = extractRoutes(
        mockProvider({
          'config/routes.rb': `Rails.application.routes.draw do
  namespace :admin do
    namespace :metrics do
      resources :history_logs, only: [:index]
    end
    resources :metrics do
      collection do
        get :edit
      end
    end
  end
end`,
        }),
      )
      const nsEntry = result.resources.find(
        (r) => r.name === 'metrics' && r.type === 'namespace',
      )
      const resEntry = result.resources.find(
        (r) => r.name === 'metrics' && r.type !== 'namespace',
      )
      expect(nsEntry).toBeDefined()
      expect(resEntry).toBeDefined()
      expect(resEntry.namespace).toBe('admin')
      expect(resEntry.collection_routes).toContainEqual(
        expect.objectContaining({ action: 'edit' }),
      )
    })
  })

  describe('do-substring in resource names', () => {
    it('does not treat "do" inside resource names as a do-block', () => {
      const result = extractRoutes(
        mockProvider({
          'config/routes.rb': `
Rails.application.routes.draw do
  namespace :admin do
    resources :vendor_products, only: :index
    resources :documents
  end
  resources :orders
end`,
        }),
      )
      const vendorProducts = result.resources.find(
        (r) => r.name === 'vendor_products',
      )
      expect(vendorProducts).toBeDefined()
      expect(vendorProducts.namespace).toBe('admin')

      const documents = result.resources.find((r) => r.name === 'documents')
      expect(documents).toBeDefined()
      expect(documents.namespace).toBe('admin')

      const orders = result.resources.find((r) => r.name === 'orders')
      expect(orders).toBeDefined()
      expect(orders.namespace).toBeNull()
    })

    it('does not misalign block stack when "do" appears in options', () => {
      const result = extractRoutes(
        mockProvider({
          'config/routes.rb': `
Rails.application.routes.draw do
  namespace :api do
    namespace :v1 do
      resources :vendor_products, only: :index
    end
  end
  resources :categories
end`,
        }),
      )
      const vendorProducts = result.resources.find(
        (r) => r.name === 'vendor_products',
      )
      expect(vendorProducts).toBeDefined()
      expect(vendorProducts.namespace).toBe('api/v1')

      const categories = result.resources.find((r) => r.name === 'categories')
      expect(categories).toBeDefined()
      expect(categories.namespace).toBeNull()
    })

    it('handles singular resource with "do" in name without block', () => {
      const result = extractRoutes(
        mockProvider({
          'config/routes.rb': `
Rails.application.routes.draw do
  namespace :admin do
    resource :vendor_profile, only: [:edit, :update]
  end
  resources :users
end`,
        }),
      )
      const vendorProfile = result.resources.find(
        (r) => r.name === 'vendor_profile',
      )
      expect(vendorProfile).toBeDefined()
      expect(vendorProfile.namespace).toBe('admin')
      expect(vendorProfile.singular).toBe(true)

      const users = result.resources.find((r) => r.name === 'users')
      expect(users).toBeDefined()
      expect(users.namespace).toBeNull()
    })

    it('still detects actual do-blocks on resources with "do" in name', () => {
      const result = extractRoutes(
        mockProvider({
          'config/routes.rb': `
Rails.application.routes.draw do
  resources :vendor_products do
    member do
      post :approve
    end
  end
end`,
        }),
      )
      const vendorProducts = result.resources.find(
        (r) => r.name === 'vendor_products',
      )
      expect(vendorProducts).toBeDefined()
      expect(vendorProducts.member_routes).toContainEqual(
        expect.objectContaining({ action: 'approve' }),
      )
    })
  })
})
