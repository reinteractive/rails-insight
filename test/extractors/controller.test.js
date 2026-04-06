import { describe, it, expect, beforeAll } from 'vitest'
import { extractController } from '../../src/extractors/controller.js'

function mockProvider(files) {
  return {
    readFile(path) {
      return files[path] || null
    },
  }
}

describe('Controller Extractor', () => {
  describe('complex controller with all patterns', () => {
    const fixture = `
class Api::V2::ProjectsController < Api::V2::BaseController
  include Authenticatable
  include Paginatable

  before_action :authenticate_user!
  before_action :set_project, only: [:show, :update, :destroy]
  skip_before_action :verify_authenticity_token
  after_action :track_analytics

  rescue_from ActiveRecord::RecordNotFound, with: :not_found
  rescue_from Pundit::NotAuthorizedError, with: :forbidden

  skip_forgery_protection

  layout "admin"

  def index
    @projects = current_user.projects.page(params[:page])
  end

  def show
    respond_to do |format|
      format.html
      format.json
    end
  end

  def create
    @project = current_user.projects.create!(project_params)
    redirect_to @project
  end

  def update
    @project.update!(project_params)
  end

  def destroy
    @project.destroy
  end

  private

  def set_project
    @project = current_user.projects.find(params[:id])
  end

  def project_params
    params.require(:project).permit(:name, :description, :status)
  end

  def not_found
    render json: { error: 'Not found' }, status: :not_found
  end

  def forbidden
    render json: { error: 'Forbidden' }, status: :forbidden
  end
end`

    let result

    beforeAll(() => {
      result = extractController(
        mockProvider({
          'app/controllers/api/v2/projects_controller.rb': fixture,
        }),
        'app/controllers/api/v2/projects_controller.rb',
      )
    })

    it('extracts class name', () => {
      expect(result.class).toBe('Api::V2::ProjectsController')
    })

    it('extracts superclass', () => {
      expect(result.superclass).toBe('Api::V2::BaseController')
    })

    it('extracts namespace', () => {
      expect(result.namespace).toBe('api/v2')
    })

    it('extracts concerns', () => {
      expect(result.concerns).toContain('Authenticatable')
      expect(result.concerns).toContain('Paginatable')
      expect(result.concerns).toHaveLength(2)
    })

    it('extracts before_action filters', () => {
      const auth = result.filters.find((f) => f.method === 'authenticate_user!')
      expect(auth).toBeDefined()
      expect(auth.type).toBe('before_action')
    })

    it('extracts filters with options', () => {
      const setProject = result.filters.find((f) => f.method === 'set_project')
      expect(setProject).toBeDefined()
      expect(setProject.options).toContain('only')
    })

    it('extracts skip_before_action', () => {
      const skip = result.filters.find(
        (f) => f.method === 'verify_authenticity_token',
      )
      expect(skip).toBeDefined()
      expect(skip.type).toBe('skip_before_action')
    })

    it('extracts after_action', () => {
      const aa = result.filters.find((f) => f.method === 'track_analytics')
      expect(aa.type).toBe('after_action')
    })

    it('extracts correct total filter count', () => {
      expect(result.filters).toHaveLength(4)
    })

    it('extracts only public actions', () => {
      expect(result.actions).toContain('index')
      expect(result.actions).toContain('show')
      expect(result.actions).toContain('create')
      expect(result.actions).toContain('update')
      expect(result.actions).toContain('destroy')
      expect(result.actions).toHaveLength(5)
      expect(result.actions).not.toContain('set_project')
      expect(result.actions).not.toContain('project_params')
    })

    it('extracts strong params', () => {
      expect(result.strong_params).toBeDefined()
      expect(result.strong_params.model).toBe('project')
      expect(result.strong_params.permitted).toContain(':name')
    })

    it('extracts rescue handlers', () => {
      expect(result.rescue_handlers).toHaveLength(2)
      const rnf = result.rescue_handlers.find(
        (r) => r.exception === 'ActiveRecord::RecordNotFound',
      )
      expect(rnf.handler).toBe('not_found')
    })

    it('extracts layout', () => {
      expect(result.layout).toBe('admin')
    })

    it('detects API controller', () => {
      expect(result.api_controller).toBe(true)
    })

    it('stores file path', () => {
      expect(result.file).toBe('app/controllers/api/v2/projects_controller.rb')
    })
  })

  describe('simple non-API controller', () => {
    const fixture = `
class PagesController < ApplicationController
  def home
  end

  def about
  end
end`

    it('is not an API controller', () => {
      const result = extractController(
        mockProvider({ 'app/controllers/pages_controller.rb': fixture }),
        'app/controllers/pages_controller.rb',
      )
      expect(result.api_controller).toBe(false)
      expect(result.namespace).toBeNull()
      expect(result.actions).toEqual(['home', 'about'])
    })
  })

  describe('streaming controller', () => {
    const fixture = `
class StreamController < ApplicationController
  include ActionController::Live

  def events
    response.headers['Content-Type'] = 'text/event-stream'
  end
end`

    it('detects streaming', () => {
      const result = extractController(
        mockProvider({ 'app/controllers/stream_controller.rb': fixture }),
        'app/controllers/stream_controller.rb',
      )
      expect(result.streaming).toBe(true)
    })
  })

  describe('empty controller', () => {
    const fixture = `
class EmptyController < ApplicationController
end`

    it('produces valid output with empty arrays', () => {
      const result = extractController(
        mockProvider({ 'app/controllers/empty_controller.rb': fixture }),
        'app/controllers/empty_controller.rb',
      )
      expect(result.class).toBe('EmptyController')
      expect(result.actions).toEqual([])
      expect(result.filters).toEqual([])
      expect(result.concerns).toEqual([])
      expect(result.rescue_handlers).toEqual([])
    })
  })

  describe('missing file', () => {
    it('returns null', () => {
      const result = extractController(
        mockProvider({}),
        'app/controllers/missing_controller.rb',
      )
      expect(result).toBeNull()
    })
  })

  describe('null_session forgery protection', () => {
    const fixture = `
class Api::BaseController < ActionController::API
  protect_from_forgery with: :null_session

  def index
  end
end`

    it('detects API controller via null_session', () => {
      const result = extractController(
        mockProvider({ 'app/controllers/api/base_controller.rb': fixture }),
        'app/controllers/api/base_controller.rb',
      )
      expect(result.api_controller).toBe(true)
    })
  })

  describe('Rails 8 rate_limit declarations', () => {
    const fixture = `
class SessionsController < ApplicationController
  rate_limit to: 10, within: 3.minutes, only: :create

  def new
  end

  def create
    user = User.authenticate_by(email: params[:email], password: params[:password])
    if user
      start_new_session_for(user)
      redirect_to root_path
    end
  end

  def destroy
    terminate_session
    redirect_to new_session_path
  end
end`

    let result

    beforeAll(() => {
      result = extractController(
        mockProvider({ 'app/controllers/sessions_controller.rb': fixture }),
        'app/controllers/sessions_controller.rb',
      )
    })

    it('extracts rate_limit declarations', () => {
      expect(result.rate_limits).toHaveLength(1)
      expect(result.rate_limits[0].to).toBe(10)
      expect(result.rate_limits[0].within).toBe('3.minutes')
      expect(result.rate_limits[0].only).toBe('create')
    })

    it('builds action flow chains in action_summaries', () => {
      expect(result.action_summaries).toBeDefined()
      expect(result.action_summaries.create).toBeDefined()
      // Should capture authenticate_by call + redirect as chain
      expect(result.action_summaries.create).toContain('→')
    })

    it('captures terminate_session in destroy summary', () => {
      expect(result.action_summaries.destroy).toBeDefined()
    })
  })

  describe('allow_unauthenticated_access', () => {
    const fixture = `
class RegistrationsController < ApplicationController
  allow_unauthenticated_access only: %i[new create]

  def new
  end

  def create
  end
end`

    it('extracts allow_unauthenticated_access with only option', () => {
      const result = extractController(
        mockProvider({
          'app/controllers/registrations_controller.rb': fixture,
        }),
        'app/controllers/registrations_controller.rb',
      )
      expect(result.allow_unauthenticated_access).toBeDefined()
      expect(result.allow_unauthenticated_access.only).toContain('new')
      expect(result.allow_unauthenticated_access.only).toContain('create')
    })

    it('handles allow_unauthenticated_access without only option', () => {
      const fixture2 = `
class PublicController < ApplicationController
  allow_unauthenticated_access

  def index
  end
end`
      const result = extractController(
        mockProvider({ 'app/controllers/public_controller.rb': fixture2 }),
        'app/controllers/public_controller.rb',
      )
      expect(result.allow_unauthenticated_access).toBeDefined()
    })
  })

  describe('multiple rate_limits', () => {
    const fixture = `
class ApiController < ApplicationController
  rate_limit to: 100, within: 1.minute
  rate_limit to: 10, within: 1.minute, only: :create

  def index
  end

  def create
  end
end`

    it('extracts multiple rate_limit declarations', () => {
      const result = extractController(
        mockProvider({ 'app/controllers/api_controller.rb': fixture }),
        'app/controllers/api_controller.rb',
      )
      expect(result.rate_limits).toHaveLength(2)
      expect(result.rate_limits[0].to).toBe(100)
      expect(result.rate_limits[1].to).toBe(10)
    })
  })

  describe('action_line_ranges', () => {
    it('returns correct line ranges for actions', () => {
      const fixture = `
class PostsController < ApplicationController
  def index
    @posts = Post.all
  end

  def show
    @post = Post.find(params[:id])
  end

  def create
    @post = Post.create!(post_params)
  end

  private

  def post_params
    params.require(:post).permit(:title)
  end
end`
      const result = extractController(
        mockProvider({ 'app/controllers/posts_controller.rb': fixture }),
        'app/controllers/posts_controller.rb',
      )
      expect(result.action_line_ranges.index).toBeDefined()
      expect(result.action_line_ranges.show).toBeDefined()
      expect(result.action_line_ranges.create).toBeDefined()
      expect(result.action_line_ranges.index.start).toBeLessThan(
        result.action_line_ranges.show.start,
      )
    })

    it('excludes actions after private', () => {
      const fixture = `
class PostsController < ApplicationController
  def index
    @posts = Post.all
  end

  private

  def set_post
    @post = Post.find(params[:id])
  end
end`
      const result = extractController(
        mockProvider({ 'app/controllers/posts_controller.rb': fixture }),
        'app/controllers/posts_controller.rb',
      )
      expect(result.action_line_ranges.index).toBeDefined()
      expect(result.action_line_ranges.set_post).toBeUndefined()
    })

    it('preserves existing actions array', () => {
      const fixture = `
class PostsController < ApplicationController
  def index
  end

  def show
  end

  private

  def set_post
  end
end`
      const result = extractController(
        mockProvider({ 'app/controllers/posts_controller.rb': fixture }),
        'app/controllers/posts_controller.rb',
      )
      expect(result.actions).toEqual(['index', 'show'])
      expect(Object.keys(result.action_line_ranges)).toEqual(['index', 'show'])
    })
  })

  describe('ISSUE-I: multi-method before_action expansion', () => {
    it('expands before_action with multiple method symbols into separate filters', () => {
      const content = `class ApplicationController < ActionController::Base
  before_action :set_locale, :set_current_user, :track_visit
  before_action :authenticate!, only: [:create, :update]
end`
      const result = extractController(
        mockProvider({ 'app/controllers/application_controller.rb': content }),
        'app/controllers/application_controller.rb',
      )
      const baFilters = result.filters.filter((f) => f.type === 'before_action')
      expect(baFilters.length).toBe(4)
      expect(baFilters.map((f) => f.method)).toContain('set_locale')
      expect(baFilters.map((f) => f.method)).toContain('set_current_user')
      expect(baFilters.map((f) => f.method)).toContain('track_visit')
      expect(baFilters.map((f) => f.method)).toContain('authenticate!')
      const authFilter = baFilters.find((f) => f.method === 'authenticate!')
      expect(authFilter.options).toContain('only')
    })

    it('does not expand filters with keyword-only options', () => {
      const content = `class ApplicationController < ActionController::Base
  before_action :authenticate!, only: [:show, :edit]
end`
      const result = extractController(
        mockProvider({ 'app/controllers/application_controller.rb': content }),
        'app/controllers/application_controller.rb',
      )
      expect(result.filters).toHaveLength(1)
      expect(result.filters[0].method).toBe('authenticate!')
      expect(result.filters[0].options).toContain('only')
    })
  })

  describe('ISSUE-C: module-wrapped controller namespace extraction', () => {
    it('extracts fully qualified class name from module-wrapped controller', () => {
      const content = `module Backend
  class AiTrainingController < ApplicationController
    def index
    end
  end
end`
      const result = extractController(
        mockProvider({
          'app/controllers/backend/ai_training_controller.rb': content,
        }),
        'app/controllers/backend/ai_training_controller.rb',
      )
      expect(result.class).toBe('Backend::AiTrainingController')
      expect(result.namespace).toBe('backend')
    })

    it('handles deeply nested module wrapping', () => {
      const content = `module Api
  module V1
    class UsersController < ApplicationController
      def index; end
    end
  end
end`
      const result = extractController(
        mockProvider({
          'app/controllers/api/v1/users_controller.rb': content,
        }),
        'app/controllers/api/v1/users_controller.rb',
      )
      expect(result.class).toBe('Api::V1::UsersController')
      expect(result.namespace).toBe('api/v1')
    })

    it('does not double-namespace controllers already using :: in class name', () => {
      const content = `class Api::V1::ProductsController < ApplicationController
  def index; end
end`
      const result = extractController(
        mockProvider({
          'app/controllers/api/v1/products_controller.rb': content,
        }),
        'app/controllers/api/v1/products_controller.rb',
      )
      expect(result.class).toBe('Api::V1::ProductsController')
      expect(result.namespace).toBe('api/v1')
    })
  })

  describe('ISSUE-H: multi-line filter options with bracket continuation', () => {
    it('captures multi-line filter options with continuation', () => {
      const content = `class TargetsController < ApplicationController
  before_action :target_query_params, only: [
    :index, :show, :edit, :update
  ]
  before_action :authenticate!
end`
      const result = extractController(
        mockProvider({
          'app/controllers/targets_controller.rb': content,
        }),
        'app/controllers/targets_controller.rb',
      )
      const tqp = result.filters.find((f) => f.method === 'target_query_params')
      expect(tqp).toBeDefined()
      expect(tqp.options).toContain('index')
      expect(tqp.options).toContain('update')
      expect(tqp.options).toContain(']')
    })
  })

  describe('filters with inline comments', () => {
    it('extracts filter when inline Ruby comment follows on the same line', () => {
      const content = `module Webhook
  module V1
    class EmailsController < ApplicationController
      skip_before_action :verify_authenticity_token # Skip CSRF for webhooks
      before_action :authenticate! # must be authenticated

      def create
      end
    end
  end
end`
      const result = extractController(
        mockProvider({
          'app/controllers/webhook/v1/emails_controller.rb': content,
        }),
        'app/controllers/webhook/v1/emails_controller.rb',
      )
      expect(result.class).toBe('Webhook::V1::EmailsController')
      expect(result.filters).toHaveLength(2)
      const skip = result.filters.find(
        (f) => f.method === 'verify_authenticity_token',
      )
      expect(skip).toBeDefined()
      expect(skip.type).toBe('skip_before_action')
      const auth = result.filters.find((f) => f.method === 'authenticate!')
      expect(auth).toBeDefined()
      expect(auth.type).toBe('before_action')
    })
  })

  describe('superclass with :: prefix', () => {
    it('extracts superclass when prefixed with ::', () => {
      const content = `module Spree
  module Admin
    module Api
      module V1
        class UploaderController < ::Spree::Api::V2::BaseController
          def image
            blob = ActiveStorage::Blob.create_after_upload!(io: params[:file])
            render json: { url: blob.url }
          end
        end
      end
    end
  end
end`
      const result = extractController(
        mockProvider({
          'app/controllers/spree/admin/api/v1/uploader_controller.rb': content,
        }),
        'app/controllers/spree/admin/api/v1/uploader_controller.rb',
      )
      expect(result).not.toBeNull()
      expect(result.class).toBe('Spree::Admin::Api::V1::UploaderController')
      expect(result.superclass).toBe('Spree::Api::V2::BaseController')
      expect(result.api_controller).toBe(true)
      expect(result.actions).toContain('image')
    })
  })
})
