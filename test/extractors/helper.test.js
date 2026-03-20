import { describe, it, expect } from 'vitest'
import { extractHelper } from '../../src/extractors/helper.js'

function mockProvider(files) {
  return {
    readFile(path) {
      return files[path] || null
    },
  }
}

describe('Helper Extractor', () => {
  describe('extracts module name and methods', () => {
    const fixture = `
module PostsHelper
  def format_date(date)
    date.strftime('%B %d, %Y')
  end

  def truncate_body(post)
    truncate(post.body, length: 200)
  end
end`

    const provider = mockProvider({
      'app/helpers/posts_helper.rb': fixture,
    })
    const result = extractHelper(provider, 'app/helpers/posts_helper.rb')

    it('extracts module name', () => {
      expect(result.module).toBe('PostsHelper')
    })

    it('extracts file path', () => {
      expect(result.file).toBe('app/helpers/posts_helper.rb')
    })

    it('extracts methods', () => {
      expect(result.methods).toContain('format_date')
      expect(result.methods).toContain('truncate_body')
    })
  })

  describe('derives controller association', () => {
    it('PostsHelper → PostsController', () => {
      const provider = mockProvider({
        'app/helpers/posts_helper.rb': 'module PostsHelper\nend',
      })
      const result = extractHelper(provider, 'app/helpers/posts_helper.rb')
      expect(result.controller).toBe('PostsController')
    })
  })

  describe('handles ApplicationHelper', () => {
    it('returns ApplicationController as convention', () => {
      const provider = mockProvider({
        'app/helpers/application_helper.rb':
          'module ApplicationHelper\n  def foo\n  end\nend',
      })
      const result = extractHelper(
        provider,
        'app/helpers/application_helper.rb',
      )
      expect(result.module).toBe('ApplicationHelper')
      expect(result.controller).toBe('ApplicationController')
    })
  })

  describe('handles namespaced helper', () => {
    it('Admin::DashboardHelper → Admin::DashboardController', () => {
      const provider = mockProvider({
        'app/helpers/admin/dashboard_helper.rb':
          'module Admin::DashboardHelper\n  def stats\n  end\nend',
      })
      const result = extractHelper(
        provider,
        'app/helpers/admin/dashboard_helper.rb',
      )
      expect(result.module).toBe('Admin::DashboardHelper')
      expect(result.controller).toBe('Admin::DashboardController')
    })
  })

  describe('returns null for empty file', () => {
    it('returns null', () => {
      const provider = mockProvider({
        'app/helpers/empty_helper.rb': '',
      })
      const result = extractHelper(provider, 'app/helpers/empty_helper.rb')
      expect(result).toBeNull()
    })
  })

  describe('excludes private methods', () => {
    it('methods after private keyword not included', () => {
      const fixture = `
module PostsHelper
  def public_method
  end

  private

  def secret_method
  end
end`

      const provider = mockProvider({
        'app/helpers/posts_helper.rb': fixture,
      })
      const result = extractHelper(provider, 'app/helpers/posts_helper.rb')
      expect(result.methods).toContain('public_method')
      expect(result.methods).not.toContain('secret_method')
    })
  })

  describe('extracts includes', () => {
    it('detects included helpers', () => {
      const fixture = `
module PostsHelper
  include ApplicationHelper
  include FormattingHelper

  def foo
  end
end`

      const provider = mockProvider({
        'app/helpers/posts_helper.rb': fixture,
      })
      const result = extractHelper(provider, 'app/helpers/posts_helper.rb')
      expect(result.includes).toContain('ApplicationHelper')
      expect(result.includes).toContain('FormattingHelper')
    })
  })
})
