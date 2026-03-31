import { describe, it, expect } from 'vitest'
import { extractViews } from '../../src/extractors/views.js'

function mockProvider(files) {
  return {
    readFile(path) {
      return files[path] || null
    },
  }
}

describe('Views Extractor', () => {
  describe('full view layer', () => {
    const files = {
      'app/views/layouts/application.html.erb':
        '<turbo-frame id="main"><%= yield %><%= content_for(:sidebar) %></turbo-frame>',
      'app/views/layouts/admin.html.erb':
        '<%= yield %><%= content_for(:title) %>',
      'app/views/layouts/mailer.html.erb': '<%= yield %>',
      'app/views/users/index.html.erb':
        '<%= render UserCardComponent.new(user: @user) %>\n<%= render partial: "shared/header" %>\n<%= form_with model: @user do |f| %>\n<% end %>',
      'app/views/users/show.html.erb':
        '<turbo-frame id="user_detail"><%= render Ui::AvatarComponent.new %></turbo-frame>\n<%= content_for(:meta) { "user meta" } %>',
      'app/views/users/_form.html.erb':
        '<%= form_with model: @user do |f| %><% end %>',
      'app/views/posts/index.html.erb':
        '<%= render PostComponent.new %>\n<%= render partial: "posts/item" %>\n<%= form_for @post do |f| %>\n<% end %>',
      'app/views/posts/create.turbo_stream.erb':
        '<%= turbo_stream.prepend "posts" %>',
      'app/views/posts/update.turbo_stream.erb':
        '<%= turbo_stream.replace "post" %>',
      'app/views/api/v1/users/index.json.jbuilder':
        'json.array! @users do |user|\n  json.id user.id\nend',
    }

    const entries = Object.keys(files).map((path) => ({
      path,
      category: path.includes('layouts')
        ? 'layout'
        : path.includes('jbuilder')
          ? 'jbuilder'
          : path.includes('_') && !path.includes('turbo')
            ? 'partial'
            : 'view',
    }))

    const provider = mockProvider(files)
    const result = extractViews(provider, entries)

    it('detects layouts', () => {
      expect(result.layouts).toContain('application')
      expect(result.layouts).toContain('admin')
      expect(result.layouts).toContain('mailer')
      expect(result.layouts).toHaveLength(3)
    })

    it('detects template engine', () => {
      expect(result.template_engine).toBe('erb')
    })

    it('counts turbo frames', () => {
      expect(result.turbo_frames_count).toBe(2)
    })

    it('counts turbo stream templates', () => {
      expect(result.turbo_stream_templates).toBe(2)
    })

    it('counts component renders', () => {
      expect(result.component_renders).toBeGreaterThanOrEqual(3)
    })

    it('counts partial renders', () => {
      expect(result.partial_renders).toBeGreaterThanOrEqual(2)
    })

    it('counts form_with usage', () => {
      expect(result.form_with_usage).toBeGreaterThanOrEqual(2)
    })

    it('counts form_for usage', () => {
      expect(result.form_for_usage).toBeGreaterThanOrEqual(1)
    })

    it('counts jbuilder views', () => {
      expect(result.jbuilder_views).toBe(1)
    })

    it('extracts content_for keys', () => {
      expect(result.content_for_keys).toContain('sidebar')
      expect(result.content_for_keys).toContain('title')
      expect(result.content_for_keys).toContain('meta')
    })
  })

  describe('empty views', () => {
    it('returns defaults with no entries', () => {
      const provider = mockProvider({})
      const result = extractViews(provider, [])
      expect(result.layouts).toEqual([])
      expect(result.turbo_frames_count).toBe(0)
      expect(result.component_renders).toBe(0)
      expect(result.template_engine).toBe('erb')
    })
  })

  describe('haml template engine detection', () => {
    it('detects haml as primary engine', () => {
      const entries = [
        { path: 'app/views/users/index.html.haml', category: 'view' },
        { path: 'app/views/users/show.html.haml', category: 'view' },
        { path: 'app/views/layouts/application.html.haml', category: 'layout' },
      ]
      const provider = mockProvider({
        'app/views/users/index.html.haml': '= render UserComponent.new',
        'app/views/users/show.html.haml': '',
        'app/views/layouts/application.html.haml': '= yield',
      })
      const result = extractViews(provider, entries)
      expect(result.template_engine).toBe('haml')
    })
  })

  describe('no views directory', () => {
    it('returns defaults when no view entries', () => {
      const entries = [{ path: 'app/models/user.rb', category: 'model' }]
      const provider = mockProvider({ 'app/models/user.rb': 'class User\nend' })
      const result = extractViews(provider, entries)
      expect(result.layouts).toEqual([])
      expect(result.turbo_frames_count).toBe(0)
    })
  })

  describe('non-standard view directories', () => {
    it('scans app/views_mobile and app/views_shared directories', () => {
      const entries = [
        {
          path: 'app/views/articles/index.html.erb',
          category: 'view',
          categoryName: 'views',
          type: 'erb',
        },
      ]
      const provider = {
        readFile(path) {
          if (path.endsWith('.erb')) return '<h1>Content</h1>'
          if (path.endsWith('.haml')) return '%h1 Content'
          return null
        },
        listDir(path) {
          if (path === 'app')
            return [
              'views',
              'views_mobile',
              'views_shared',
              'models',
              'controllers',
            ]
          return []
        },
        glob(pattern) {
          if (pattern.includes('views_mobile') && pattern.endsWith('.erb'))
            return ['app/views_mobile/articles/index.html.erb']
          if (pattern.includes('views_shared') && pattern.endsWith('.haml'))
            return ['app/views_shared/footer.html.haml']
          return []
        },
      }
      const result = extractViews(provider, entries)
      expect(result.additional_view_directories).toContain('app/views_mobile')
      expect(result.additional_view_directories).toContain('app/views_shared')
    })

    it('does not set additional_view_directories when only standard views exist', () => {
      const entries = [
        {
          path: 'app/views/articles/index.html.erb',
          category: 'view',
          categoryName: 'views',
          type: 'erb',
        },
      ]
      const provider = {
        readFile(path) {
          return path.endsWith('.erb') ? '<h1>Content</h1>' : null
        },
        listDir(path) {
          if (path === 'app') return ['views', 'models', 'controllers']
          return []
        },
        glob() {
          return []
        },
      }
      const result = extractViews(provider, entries)
      expect(result.additional_view_directories).toBeUndefined()
    })
  })

  describe('ISSUE-H: namespaced ViewComponent renders are counted', () => {
    it('counts Search::Component.new(...) style renders', () => {
      const files = {
        'app/views/dashboard/index.html.erb': `
<%= render Search::Component.new(query: @query) %>
<%= render ModalForm::Component.new(offer: @offer) %>
<%= render OfferComponent.new(offer: @offer) %>
<%= render CounterWidget::Component.new(count: 5) %>
<%= render partial: "shared/header" %>
`,
      }
      const entries = [
        { path: 'app/views/dashboard/index.html.erb', category: 'view' },
      ]
      const provider = {
        readFile: (path) => files[path] || null,
      }
      const result = extractViews(provider, entries)
      // Should count 4 component renders (not the partial)
      expect(result.component_renders).toBe(4)
    })

    it('counts with_collection renders', () => {
      const files = {
        'app/views/users/index.html.erb': `
<%= render OfferComponent.with_collection(@offers) %>
<%= render Search::Component.with_collection(@results) %>
`,
      }
      const entries = [
        { path: 'app/views/users/index.html.erb', category: 'view' },
      ]
      const provider = { readFile: (path) => files[path] || null }
      const result = extractViews(provider, entries)
      expect(result.component_renders).toBe(2)
    })
  })

  describe('ISSUE-E: turbo stream template counting', () => {
    it('correctly counts .turbo_stream.erb files', () => {
      const files = {
        'app/views/offers/update.turbo_stream.erb':
          '<%= turbo_stream.replace "offer" %>',
        'app/views/targets/update_statuses.turbo_stream.erb':
          '<%= turbo_stream.replace "targets" %>',
        'app/views/contacts/show.turbo_stream.erb':
          '<%= turbo_stream.prepend "contacts" %>',
        'app/views/contacts/index.html.erb': '<p>not a turbo stream</p>',
      }
      const entries = Object.keys(files).map((path) => ({
        path,
        category: 'view',
      }))
      const provider = { readFile: (path) => files[path] || null }
      const result = extractViews(provider, entries)
      expect(result.turbo_stream_templates).toBe(3)
    })
  })
})
