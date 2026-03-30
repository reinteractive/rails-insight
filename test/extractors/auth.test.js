import { describe, it, expect } from 'vitest'
import { extractAuth } from '../../src/extractors/auth.js'

function mockProvider(files) {
  return {
    readFile(path) {
      return files[path] || null
    },
  }
}

describe('Auth Extractor', () => {
  describe('Devise authentication', () => {
    const files = {
      'app/models/user.rb': `
class User < ApplicationRecord
  devise :database_authenticatable, :registerable, :recoverable,
         :rememberable, :validatable, :confirmable, :lockable,
         :omniauthable, omniauth_providers: [:google_oauth2, :github]
end`,
      'config/initializers/devise.rb': `
Devise.setup do |config|
  config.mailer_sender = "noreply@example.com"
  config.authentication_keys = [:email]
  config.timeout_in = 30.minutes
  config.maximum_attempts = 5
end`,
      'app/controllers/users/sessions_controller.rb': `
class Users::SessionsController < Devise::SessionsController
  def create
    super
  end
end`,
    }

    const entries = [
      { path: 'app/models/user.rb', category: 'model' },
      {
        path: 'app/controllers/users/sessions_controller.rb',
        category: 'controller',
      },
    ]

    const gemInfo = { gems: { devise: { version: '4.9' } } }
    const provider = mockProvider(files)
    const result = extractAuth(provider, entries, gemInfo)

    it('detects devise as primary strategy', () => {
      expect(result.primary_strategy).toBe('devise')
    })

    it('extracts devise modules', () => {
      expect(result.devise.models.User.modules).toContain(
        'database_authenticatable',
      )
      expect(result.devise.models.User.modules).toContain('confirmable')
      expect(result.devise.models.User.modules).toContain('lockable')
    })

    it('extracts omniauth providers', () => {
      expect(result.devise.models.User.omniauth_providers).toContain(
        'google_oauth2',
      )
      expect(result.devise.models.User.omniauth_providers).toContain('github')
    })

    it('extracts devise config', () => {
      expect(result.devise.config.mailer_sender).toContain(
        'noreply@example.com',
      )
      expect(result.devise.config.maximum_attempts).toBe('5')
    })

    it('detects custom devise controllers', () => {
      expect(result.devise.custom_controllers).toContain(
        'Users::SessionsController',
      )
    })
  })

  describe('Native Rails 8 auth — minimal', () => {
    const files = {
      'app/models/current.rb': `
class Current < ActiveSupport::CurrentAttributes
  attribute :user
  attribute :session
end`,
      'app/controllers/sessions_controller.rb': `
class SessionsController < ApplicationController
  def create
  end
end`,
    }

    const entries = [
      {
        path: 'app/controllers/sessions_controller.rb',
        category: 'controller',
      },
    ]

    const provider = mockProvider(files)
    const result = extractAuth(provider, entries, {})

    it('detects native as primary strategy', () => {
      expect(result.primary_strategy).toBe('native')
    })

    it('extracts current attributes', () => {
      expect(result.native_auth.attributes).toContain('user')
      expect(result.native_auth.attributes).toContain('session')
    })

    it('detects sessions controller', () => {
      expect(result.native_auth.has_sessions_controller).toBe(true)
    })
  })

  describe('Native Rails 8 auth — full deep extraction', () => {
    const files = {
      'app/models/current.rb': `
class Current < ActiveSupport::CurrentAttributes
  attribute :session
  delegate :user, to: :session, allow_nil: true
end`,
      'app/models/session.rb': `
class Session < ApplicationRecord
  belongs_to :user
end`,
      'app/models/user.rb': `
class User < ApplicationRecord
  has_secure_password
  has_many :sessions, dependent: :destroy
  validates :email_address, presence: true, uniqueness: true
  normalizes :email_address, with: ->(e) { e.strip.downcase }
  enum :role, { member: 0, admin: 1.superadmin: 2 }
end`,
      'app/controllers/concerns/authentication.rb': `
module Authentication
  extend ActiveSupport::Concern

  included do
    before_action :require_authentication
    helper_method :authenticated?
  end

  class_methods do
    def allow_unauthenticated_access(**options)
      skip_before_action :require_authentication, **options
    end
  end

  def require_authentication
    resume_session || redirect_to new_session_path
  end

  def resume_session
    Current.session = find_session_by_cookie
  end

  def find_session_by_cookie
    Session.find_by(id: cookies.signed[:session_id])
  end

  def start_new_session_for(user)
    session = user.sessions.create!
    cookies.signed.permanent[:session_id] = {
      value: session.id,
      httponly: true,
      same_site: :lax,
      secure: Rails.env.production?
    }
  end

  def terminate_session
    Current.session.destroy
    cookies.delete(:session_id)
  end
end`,
      'app/controllers/sessions_controller.rb': `
class SessionsController < ApplicationController
  allow_unauthenticated_access only: %i[new create]
  rate_limit to: 10, within: 3.minutes, only: :create

  def new
  end

  def create
    user = User.authenticate_by(email_address: params[:email_address], password: params[:password])
    if user
      start_new_session_for(user)
      redirect_to after_authentication_url
    else
      redirect_to new_session_path, alert: "Invalid credentials"
    end
  end

  def destroy
    terminate_session
    redirect_to new_session_path
  end
end`,
      'app/controllers/registrations_controller.rb': `
class RegistrationsController < ApplicationController
  allow_unauthenticated_access

  def new
  end

  def create
    user = User.new(user_params)
    if user.save
      start_new_session_for(user)
      redirect_to root_path
    else
      render :new, status: :unprocessable_entity
    end
  end
end`,
      'app/controllers/passwords_controller.rb': `
class PasswordsController < ApplicationController
  allow_unauthenticated_access

  def new
  end

  def create
    if user = User.find_by(email_address: params[:email_address])
      PasswordsMailer.reset(user).deliver_later
    end
    redirect_to new_session_path
  end

  def edit
    @user = User.find_by_password_reset_token!(params[:token])
  end

  def update
    @user = User.find_by_password_reset_token!(params[:token])
    if @user.update(password_params)
      redirect_to new_session_path
    else
      render :edit
    end
  end
end`,
      'app/controllers/application_controller.rb': `
class ApplicationController < ActionController::Base
  include Authentication
end`,
      Gemfile: `
source 'https://rubygems.org'
gem 'rails', '~> 8.0'
gem 'pg'
gem 'puma'
`,
    }

    const schemaData = {
      tables: [
        {
          name: 'sessions',
          columns: [
            { name: 'id', type: 'integer' },
            { name: 'user_id', type: 'integer' },
            { name: 'ip_address', type: 'string' },
            { name: 'user_agent', type: 'string' },
            { name: 'created_at', type: 'datetime' },
            { name: 'updated_at', type: 'datetime' },
          ],
        },
        {
          name: 'users',
          columns: [
            { name: 'id', type: 'integer' },
            { name: 'email_address', type: 'string', constraints: 'NOT NULL' },
            {
              name: 'password_digest',
              type: 'string',
              constraints: 'NOT NULL',
            },
            { name: 'created_at', type: 'datetime' },
          ],
        },
      ],
    }

    const entries = [
      {
        path: 'app/controllers/sessions_controller.rb',
        category: 'controller',
      },
      {
        path: 'app/controllers/registrations_controller.rb',
        category: 'controller',
      },
      {
        path: 'app/controllers/passwords_controller.rb',
        category: 'controller',
      },
      {
        path: 'app/controllers/application_controller.rb',
        category: 'controller',
      },
      { path: 'app/models/user.rb', category: 'model' },
    ]

    const provider = mockProvider(files)
    const result = extractAuth(provider, entries, {}, schemaData)

    it('detects native primary strategy', () => {
      expect(result.primary_strategy).toBe('native')
    })

    it('extracts current_attributes dedicated section', () => {
      const ca = result.native_auth.current_attributes
      expect(ca).toBeDefined()
      expect(ca.class).toBe('Current')
      expect(ca.superclass).toBe('ActiveSupport::CurrentAttributes')
      expect(ca.attributes).toContain('session')
      expect(ca.delegates).toHaveLength(1)
      expect(ca.delegates[0].method).toBe('user')
      expect(ca.delegates[0].to).toBe('session')
      expect(ca.usage).toContain('Current.session')
      expect(ca.usage).toContain('Current.user')
    })

    it('populates Current in models map with delegates', () => {
      const currentModel = result.native_auth.models['Current']
      expect(currentModel).toBeDefined()
      expect(currentModel.delegates).toHaveLength(1)
      expect(currentModel.usage).toContain('Current.session')
    })

    it('extracts Session model with schema columns', () => {
      const session = result.native_auth.models['Session']
      expect(session).toBeDefined()
      expect(session.belongs_to).toBe('user')
      expect(session.columns).toContain('user_id')
      expect(session.columns).toContain('ip_address')
    })

    it('extracts User model auth features', () => {
      const user = result.native_auth.models['User']
      expect(user).toBeDefined()
      expect(user.auth_features.has_secure_password).toBe(true)
      expect(user.auth_features.email_normalization).toBeDefined()
      expect(user.columns).toBeDefined()
    })

    it('has_secure_password true globally', () => {
      expect(result.has_secure_password).toBe(true)
    })

    it('extracts authentication concern with enriched methods', () => {
      const concern = result.native_auth.controllers['authentication_concern']
      expect(concern).toBeDefined()
      expect(concern.file).toBe('app/controllers/concerns/authentication.rb')
      expect(concern.included_in).toBe('ApplicationController')

      // Rich method details
      expect(concern.methods).toBeDefined()
      expect(concern.methods.require_authentication).toBeDefined()
      expect(concern.methods.require_authentication.type).toBe('before_action')
      expect(concern.methods.require_authentication.redirect_target).toBe(
        'new_session_path',
      )

      expect(concern.methods.find_session_by_cookie).toBeDefined()
      expect(concern.methods.find_session_by_cookie.cookie_name).toBe(
        'session_id',
      )

      expect(concern.methods.start_new_session_for).toBeDefined()
      expect(concern.methods.start_new_session_for.purpose).toContain(
        'Creates new',
      )
      expect(concern.methods.start_new_session_for.cookie_config).toBeDefined()
      expect(concern.methods.start_new_session_for.cookie_config.httponly).toBe(
        true,
      )

      expect(concern.methods.terminate_session).toBeDefined()
      expect(concern.methods.terminate_session.destroys).toBe('Current.session')
      expect(concern.methods.terminate_session.deletes_cookie).toBe(true)

      // Backward-compat key_methods
      expect(concern.key_methods).toBeDefined()

      // Cookie config at concern level
      expect(concern.cookie_config).toBeDefined()
      expect(concern.opt_out_method).toBe('allow_unauthenticated_access')
    })

    it('extracts SessionsController details', () => {
      const sc = result.native_auth.controllers['SessionsController']
      expect(sc).toBeDefined()
      expect(sc.actions).toContain('new')
      expect(sc.actions).toContain('create')
      expect(sc.actions).toContain('destroy')
      expect(sc.rate_limiting).toHaveLength(1)
      expect(sc.rate_limiting[0].to).toBe(10)
      expect(sc.allow_unauthenticated_access).toBeDefined()
      expect(sc.login_flow).toContain('authenticate_by')
      expect(sc.login_flow).toContain('start_new_session_for')
    })

    it('extracts RegistrationsController', () => {
      const rc = result.native_auth.controllers['RegistrationsController']
      expect(rc).toBeDefined()
      expect(rc.actions).toContain('new')
      expect(rc.actions).toContain('create')
    })

    it('extracts PasswordsController with reset flow', () => {
      const pc = result.native_auth.controllers['PasswordsController']
      expect(pc).toBeDefined()
      expect(pc.actions).toContain('create')
      expect(pc.actions).toContain('edit')
      expect(pc.actions).toContain('update')
      expect(pc.mailer).toBe('PasswordsMailer')
      expect(pc.token_method).toBeDefined()
    })

    it('populates security features', () => {
      const sf = result.native_auth.security_features
      expect(sf).toBeDefined()
      expect(sf.csrf).toBeDefined()
      expect(sf.cookie_security).toBeDefined()
      expect(sf.rate_limiting).toBeDefined()
      expect(sf.session_tracking).toBeDefined()
    })

    it('collects related files without duplicates', () => {
      const files = result.native_auth.related_files
      expect(files).toContain('app/models/current.rb')
      expect(files).toContain('app/controllers/sessions_controller.rb')
      expect(new Set(files).size).toBe(files.length)
    })

    it('provides api_authentication with negative confirmation', () => {
      const apiAuth = result.native_auth.api_authentication
      expect(apiAuth).toBeDefined()
      expect(apiAuth.present).toBe(false)
      expect(apiAuth.searched_patterns).toBeDefined()
      expect(apiAuth.searched_patterns.length).toBeGreaterThan(0)
      for (const p of apiAuth.searched_patterns) {
        expect(p.found).toBe(false)
        expect(p.searched).toBeDefined()
      }
      expect(apiAuth.summary).toContain('No API authentication')
    })
  })

  describe('Native auth with auth concern found via entries search', () => {
    const files = {
      'app/models/current.rb': `
class Current < ActiveSupport::CurrentAttributes
  attribute :session
end`,
      'app/controllers/concerns/authenticatable.rb': `
module Authenticatable
  extend ActiveSupport::Concern

  def require_authentication
    redirect_to login_path
  end
end`,
    }

    const entries = [
      {
        path: 'app/controllers/concerns/authenticatable.rb',
        categoryName: 'controllers',
      },
    ]

    const result = extractAuth(mockProvider(files), entries, {})

    it('finds concern via entries with auth in path', () => {
      const concern = result.native_auth.controllers['authentication_concern']
      expect(concern).toBeDefined()
      expect(concern.file).toBe('app/controllers/concerns/authenticatable.rb')
    })
  })

  describe('Native auth with JWT api_authentication positive detection', () => {
    const files = {
      'app/models/current.rb': `
class Current < ActiveSupport::CurrentAttributes
  attribute :session
end`,
      'app/controllers/api/base_controller.rb': `
class Api::BaseController < ApplicationController
  before_action :authenticate_with_http_token
  
  private
  def authenticate_with_http_token
    authenticate_or_request_with_http_token do |token|
      @current_user = User.find_by(auth_token: token)
    end
  end
end`,
      Gemfile: `
source 'https://rubygems.org'
gem 'rails'
gem 'jwt'
`,
    }

    const entries = [
      {
        path: 'app/controllers/api/base_controller.rb',
        category: 'controller',
      },
    ]

    const result = extractAuth(mockProvider(files), entries, {})

    it('detects API auth patterns as present', () => {
      const apiAuth = result.native_auth.api_authentication
      expect(apiAuth.present).toBe(true)
      const jwt = apiAuth.searched_patterns.find((p) => p.pattern === 'jwt')
      expect(jwt.found).toBe(true)
      const bearer = apiAuth.searched_patterns.find(
        (p) => p.pattern === 'bearer_token',
      )
      expect(bearer.found).toBe(true)
    })
  })

  describe('JWT authentication', () => {
    it('detects JWT from gems', () => {
      const provider = mockProvider({})
      const result = extractAuth(provider, [], {
        gems: { 'devise-jwt': { version: '0.10' } },
      })
      expect(result.jwt).toBeDefined()
      expect(result.jwt.gem).toBe('devise-jwt')
    })
  })

  describe('Two-factor auth', () => {
    it('detects two-factor gem', () => {
      const provider = mockProvider({})
      const result = extractAuth(provider, [], {
        gems: { devise: {}, 'devise-two-factor': { version: '5.0' } },
      })
      expect(result.two_factor).toBeDefined()
      expect(result.two_factor.gem).toBe('devise-two-factor')
    })

    it('detects rotp gem', () => {
      const provider = mockProvider({})
      const result = extractAuth(provider, [], {
        gems: { rotp: { version: '6.0' } },
      })
      expect(result.two_factor).toBeDefined()
      expect(result.two_factor.gem).toBe('rotp')
    })

    it('detects webauthn gem', () => {
      const provider = mockProvider({})
      const result = extractAuth(provider, [], {
        gems: { webauthn: { version: '3.0' } },
      })
      expect(result.two_factor).toBeDefined()
      expect(result.two_factor.gem).toBe('webauthn')
    })
  })

  describe('has_secure_password', () => {
    it('detects has_secure_password on model', () => {
      const files = {
        'app/models/user.rb': `
class User < ApplicationRecord
  has_secure_password
end`,
      }
      const entries = [{ path: 'app/models/user.rb', category: 'model' }]
      const provider = mockProvider(files)
      const result = extractAuth(provider, entries, {})
      expect(result.has_secure_password).toBe(true)
      expect(result.primary_strategy).toBe('has_secure_password')
    })

    it('detects has_secure_password in standalone model scan', () => {
      const files = {
        'app/models/account.rb': `
class Account < ApplicationRecord
  has_secure_password
end`,
      }
      const entries = [{ path: 'app/models/account.rb', category: 'model' }]
      const provider = mockProvider(files)
      const result = extractAuth(provider, entries, {})
      expect(result.has_secure_password).toBe(true)
    })
  })

  describe('no auth', () => {
    it('returns null strategy when no auth detected', () => {
      const provider = mockProvider({})
      const result = extractAuth(provider, [], {})
      expect(result.primary_strategy).toBeNull()
      expect(result.devise).toBeNull()
      expect(result.native_auth).toBeNull()
      expect(result.jwt).toBeNull()
      expect(result.has_secure_password).toBe(false)
    })
  })

  describe('OmniAuth standalone', () => {
    it('detects omniauth without devise', () => {
      const files = {
        'config/initializers/omniauth.rb': `
Rails.application.config.middleware.use OmniAuth::Builder do
  provider :google_oauth2, ENV["GOOGLE_ID"], ENV["GOOGLE_SECRET"]
  provider :facebook, ENV["FB_ID"], ENV["FB_SECRET"]
end`,
      }
      const provider = mockProvider(files)
      const result = extractAuth(provider, [], {
        gems: { omniauth: { version: '2.0' } },
      })
      expect(result.primary_strategy).toBe('omniauth')
      expect(result.omniauth.providers).toContain('google_oauth2')
      expect(result.omniauth.providers).toContain('facebook')
    })
  })

  describe('ISSUE-04: Devise secret redaction', () => {
    it('redacts secret_key and pepper from Devise config output', () => {
      const provider = mockProvider({
        'config/initializers/devise.rb': `
Devise.setup do |config|
  config.secret_key = '0d9ad821776c991b1c5468abcdef1234567890'
  config.pepper = 'super_secret_pepper_value'
  config.mailer_sender = 'noreply@example.com'
  config.timeout_in = 30.minutes
end`,
      })
      const result = extractAuth(provider, [], { gems: { devise: {} } })
      expect(result.devise.config.secret_key).toBe('[REDACTED]')
      expect(result.devise.config.pepper).toBe('[REDACTED]')
      expect(result.devise.config.mailer_sender).toBeDefined()
      expect(result.devise.config.mailer_sender).not.toBe('[REDACTED]')
      expect(result.devise.config.timeout_in).toBeDefined()
    })

    it('ignores commented-out Devise config lines', () => {
      const provider = mockProvider({
        'config/initializers/devise.rb': `
Devise.setup do |config|
  # config.secret_key = 'should_not_be_captured'
  config.mailer_sender = 'noreply@example.com'
end`,
      })
      const result = extractAuth(provider, [], { gems: { devise: {} } })
      expect(result.devise.config.secret_key).toBeUndefined()
      expect(result.devise.config.mailer_sender).toBeDefined()
    })
  })

  describe('ISSUE-C: Devise sub-controllers in scope directories', () => {
    it('detects Devise sub-controllers in scope directories', () => {
      const entries = [
        {
          path: 'app/controllers/admin_users/sessions_controller.rb',
          category: 'controller',
          categoryName: 'controllers',
          type: 'ruby',
        },
        {
          path: 'app/controllers/admin_users/passwords_controller.rb',
          category: 'controller',
          categoryName: 'controllers',
          type: 'ruby',
        },
        {
          path: 'app/controllers/members/registrations_controller.rb',
          category: 'controller',
          categoryName: 'controllers',
          type: 'ruby',
        },
        {
          path: 'app/models/admin_user.rb',
          category: 'model',
          categoryName: 'models',
          type: 'ruby',
        },
        {
          path: 'app/models/member.rb',
          category: 'model',
          categoryName: 'models',
          type: 'ruby',
        },
      ]
      const provider = {
        readFile(path) {
          if (path === 'app/controllers/admin_users/sessions_controller.rb')
            return 'class AdminUsers::SessionsController < Devise::SessionsController\nend'
          if (path === 'app/controllers/admin_users/passwords_controller.rb')
            return 'class AdminUsers::PasswordsController < Devise::PasswordsController\nend'
          if (path === 'app/controllers/members/registrations_controller.rb')
            return 'class Members::RegistrationsController < Devise::RegistrationsController\nend'
          if (path === 'Gemfile') return "gem 'devise'"
          if (path === 'app/models/admin_user.rb')
            return 'class AdminUser < ApplicationRecord\n  devise :database_authenticatable\nend'
          if (path === 'app/models/member.rb')
            return 'class Member < ApplicationRecord\n  devise :database_authenticatable, :registerable\nend'
          return null
        },
        fileExists() {
          return false
        },
        glob() {
          return []
        },
      }
      const result = extractAuth(provider, entries, { gems: { devise: {} } })
      expect(result.devise.custom_controllers.length).toBeGreaterThanOrEqual(3)
    })
  })
})
