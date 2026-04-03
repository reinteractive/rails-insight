import { describe, it, expect } from 'vitest'
import { extractAuthorization } from '../../src/extractors/authorization.js'

function mockProvider(files) {
  return {
    readFile(path) {
      return files[path] || null
    },
  }
}

describe('Authorization Extractor', () => {
  describe('Pundit authorization', () => {
    const files = {
      'app/policies/project_policy.rb': `
class ProjectPolicy < ApplicationPolicy
  def index?
    true
  end

  def show?
    true
  end

  def create?
    user.admin?
  end

  def update?
    record.user == user
  end

  def destroy?
    user.admin?
  end

  class Scope < ApplicationPolicy::Scope
    def resolve
      scope.all
    end
  end
end`,
      'app/policies/user_policy.rb': `
class UserPolicy < ApplicationPolicy
  def index?
    true
  end

  def show?
    true
  end

  def update?
    record == user || user.admin?
  end

  class Scope < ApplicationPolicy::Scope
    def resolve
      scope.all
    end
  end
end`,
    }

    const entries = [
      { path: 'app/policies/project_policy.rb', category: 'policy' },
      { path: 'app/policies/user_policy.rb', category: 'policy' },
    ]

    const gemInfo = { gems: { pundit: { version: '2.3' } } }
    const provider = mockProvider(files)
    const result = extractAuthorization(provider, entries, gemInfo)

    it('detects pundit strategy', () => {
      expect(result.strategy).toBe('pundit')
    })

    it('extracts policies', () => {
      expect(result.policies).toHaveLength(2)
    })

    it('extracts policy class and resource', () => {
      const projectPolicy = result.policies.find(
        (p) => p.resource === 'Project',
      )
      expect(projectPolicy.class).toBe('ProjectPolicy')
    })

    it('extracts permitted actions', () => {
      const projectPolicy = result.policies.find(
        (p) => p.resource === 'Project',
      )
      expect(projectPolicy.permitted_actions).toContain('index')
      expect(projectPolicy.permitted_actions).toContain('show')
      expect(projectPolicy.permitted_actions).toContain('create')
      expect(projectPolicy.permitted_actions).toContain('update')
      expect(projectPolicy.permitted_actions).toContain('destroy')
    })

    it('detects policy scope', () => {
      const projectPolicy = result.policies.find(
        (p) => p.resource === 'Project',
      )
      expect(projectPolicy.has_scope).toBe(true)
    })
  })

  describe('CanCanCan authorization', () => {
    const files = {
      'app/models/ability.rb': `
class Ability
  include CanCan::Ability

  def initialize(user)
    can :read, Post
    can :manage, Post, user_id: user.id
    cannot :destroy, Post
  end
end`,
    }

    const entries = []
    const gemInfo = { gems: { cancancan: { version: '3.5' } } }
    const provider = mockProvider(files)
    const result = extractAuthorization(provider, entries, gemInfo)

    it('detects cancancan strategy', () => {
      expect(result.strategy).toBe('cancancan')
    })

    it('extracts can definitions', () => {
      const canAbilities = result.abilities.filter((a) => a.type === 'can')
      expect(canAbilities.length).toBeGreaterThanOrEqual(2)
    })

    it('extracts cannot definitions', () => {
      const cannotAbilities = result.abilities.filter(
        (a) => a.type === 'cannot',
      )
      expect(cannotAbilities.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('role detection', () => {
    it('detects enum role', () => {
      const files = {
        'app/models/user.rb': `
class User < ApplicationRecord
  enum :role, { member: 0, admin: 1, owner: 2 }
end`,
      }
      const entries = [{ path: 'app/models/user.rb', category: 'model' }]
      const provider = mockProvider(files)
      const result = extractAuthorization(provider, entries, {})
      expect(result.roles).toBeDefined()
      expect(result.roles.source).toBe('enum')
      expect(result.roles.model).toBe('User')
    })
  })

  describe('no authorization', () => {
    it('returns null strategy', () => {
      const provider = mockProvider({})
      const result = extractAuthorization(provider, [], {})
      expect(result.strategy).toBeNull()
      expect(result.policies).toEqual([])
      expect(result.abilities).toBeNull()
    })
  })

  describe('custom policies without gem', () => {
    it('detects custom strategy', () => {
      const files = {
        'app/policies/post_policy.rb': `
class PostPolicy < BasePolicy
  def show?
    true
  end
end`,
      }
      const entries = [
        { path: 'app/policies/post_policy.rb', category: 'policy' },
      ]
      const provider = mockProvider(files)
      const result = extractAuthorization(provider, entries, {})
      expect(result.strategy).toBe('custom')
      expect(result.policies).toHaveLength(1)
    })
  })

  describe('searched_libraries_not_found', () => {
    it('reports searched libraries when none are present', () => {
      const provider = mockProvider({})
      const result = extractAuthorization(provider, [], {})
      expect(result.searched_libraries_not_found).toContain('pundit')
      expect(result.searched_libraries_not_found).toContain('cancancan')
      expect(result.searched_libraries_not_found).toContain('rolify')
      expect(result.searched_libraries_not_found).toContain('action_policy')
    })

    it('excludes found libraries from not_found list', () => {
      const provider = mockProvider({})
      const result = extractAuthorization(provider, [], {
        gems: { pundit: { version: '2.3' } },
      })
      expect(result.searched_libraries_not_found).not.toContain('pundit')
      expect(result.searched_libraries_not_found).toContain('cancancan')
    })
  })

  describe('deep custom RBAC extraction', () => {
    const files = {
      'app/controllers/concerns/authorization.rb': `
module Authorization
  extend ActiveSupport::Concern

  class NotAuthorizedError < StandardError; end

  included do
    helper_method :current_user_role, :tx_pro_admin?, :tx_pro_user?, :customer_admin?, :customer_user?, :tx_pro_staff?, :customer_staff?, :can_manage_admin_resources?
    rescue_from Authorization::NotAuthorizedError, with: :user_not_authorized
  end

  def require_tx_pro_role!
    raise NotAuthorizedError unless Current.user.tx_pro_staff?
  end

  def require_tx_pro_admin!
    raise NotAuthorizedError unless Current.user.tx_pro_admin?
  end

  def require_customer_role!
    raise NotAuthorizedError unless Current.user.customer_staff?
  end

  def require_customer_admin_or_higher!
    raise NotAuthorizedError unless Current.user.customer_admin? || Current.user.tx_pro_staff?
  end

  private

  def user_not_authorized
    respond_to do |format|
      format.html do
        if Current.user.tx_pro_staff?
          redirect_to admin_root_path, alert: "Not authorized"
        else
          redirect_to root_path, alert: "Not authorized"
        end
      end
      format.json { head :forbidden }
    end
  end
end`,
      'app/controllers/application_controller.rb': `
class ApplicationController < ActionController::Base
  include Authentication
  include Authorization
end`,
      'app/models/user.rb': `
class User < ApplicationRecord
  has_secure_password
  enum :role, { customer_user: 0, customer_admin: 1, tx_pro_user: 2, tx_pro_admin: 3 }

  def tx_pro_admin?
    role == 'tx_pro_admin'
  end

  def tx_pro_user?
    role == 'tx_pro_user'
  end

  def customer_admin?
    role == 'customer_admin'
  end

  def customer_user?
    role == 'customer_user'
  end

  def tx_pro_staff?
    tx_pro_admin? || tx_pro_user?
  end

  def customer_staff?
    customer_admin? || customer_user?
  end

  def can_manage_admin_resources?
    tx_pro_admin?
  end
end`,
      'app/controllers/admin/base_controller.rb': `
class Admin::BaseController < ApplicationController
  before_action :require_tx_pro_role!
  layout 'admin'
end`,
      'app/controllers/admin/dashboard_controller.rb': `
class Admin::DashboardController < Admin::BaseController
end`,
      'app/controllers/admin/companies_controller.rb': `
class Admin::CompaniesController < Admin::BaseController
  before_action :require_tx_pro_admin!, only: [:create, :update, :destroy]
end`,
      'app/controllers/roles_controller.rb': `
class RolesController < ApplicationController
  before_action :require_customer_role!
end`,
      'app/controllers/sessions_controller.rb': `
class SessionsController < ApplicationController
  allow_unauthenticated_access only: %i[new create]
end`,
      'app/models/concerns/job_roles.rb': `
module JobRoles
  extend ActiveSupport::Concern

  JOB_TITLES = %w[
    sales_executive
    senior_developer
    project_manager
    designer
  ].freeze
end`,
      'app/controllers/concerns/authentication.rb': `
module Authentication
  extend ActiveSupport::Concern
end`,
    }

    const entries = [
      {
        path: 'app/controllers/concerns/authorization.rb',
        category: 'controller',
        categoryName: 'controllers',
      },
      {
        path: 'app/controllers/application_controller.rb',
        category: 'controller',
        categoryName: 'controllers',
      },
      {
        path: 'app/controllers/admin/base_controller.rb',
        category: 'controller',
        categoryName: 'controllers',
      },
      {
        path: 'app/controllers/admin/dashboard_controller.rb',
        category: 'controller',
        categoryName: 'controllers',
      },
      {
        path: 'app/controllers/admin/companies_controller.rb',
        category: 'controller',
        categoryName: 'controllers',
      },
      {
        path: 'app/controllers/roles_controller.rb',
        category: 'controller',
        categoryName: 'controllers',
      },
      {
        path: 'app/controllers/sessions_controller.rb',
        category: 'controller',
        categoryName: 'controllers',
      },
      {
        path: 'app/models/user.rb',
        category: 'model',
        categoryName: 'models',
      },
      {
        path: 'app/models/concerns/job_roles.rb',
        category: 'model',
        categoryName: 'models',
      },
    ]

    const provider = mockProvider(files)
    const result = extractAuthorization(provider, entries, {})

    it('detects custom_rbac strategy', () => {
      expect(result.strategy).toBe('custom_rbac')
    })

    it('includes description and library null', () => {
      expect(result.description).toContain('custom role-based access control')
      expect(result.library).toBeNull()
    })

    it('extracts concern file path and inclusion', () => {
      expect(result.concern).toBeDefined()
      expect(result.concern.file).toBe(
        'app/controllers/concerns/authorization.rb',
      )
      expect(result.concern.included_in).toContain('ApplicationController')
    })

    it('extracts error class', () => {
      expect(result.concern.error_class).toBe('NotAuthorizedError')
    })

    it('extracts helper methods exposed to views', () => {
      const helpers = result.concern.helper_methods_exposed_to_views
      expect(helpers).toContain('tx_pro_admin?')
      expect(helpers).toContain('tx_pro_staff?')
      expect(helpers).toContain('can_manage_admin_resources?')
    })

    it('extracts guard methods with requirements', () => {
      const guards = result.concern.guard_methods
      expect(guards).toBeDefined()
      expect(guards['require_tx_pro_role!']).toBeDefined()
      expect(guards['require_tx_pro_role!'].requirement).toBe('tx_pro_staff?')
      expect(guards['require_tx_pro_admin!']).toBeDefined()
      expect(guards['require_tx_pro_admin!'].requirement).toBe('tx_pro_admin?')
      expect(guards['require_customer_role!']).toBeDefined()
      expect(guards['require_customer_role!'].requirement).toBe(
        'customer_staff?',
      )
    })

    it('extracts error handling', () => {
      const handling = result.concern.error_handling
      expect(handling).toBeDefined()
      expect(handling.rescue_from).toContain('NotAuthorizedError')
      expect(handling.handler).toBe('user_not_authorized')
      expect(handling.non_html_response).toContain('403')
    })

    it('extracts role predicates from User model', () => {
      expect(result.predicates).toBeDefined()
      expect(result.predicates.source_file).toBe('app/models/user.rb')
      // Atomic predicates
      expect(result.predicates.atomic).toBeDefined()
      expect(result.predicates.atomic['tx_pro_admin?']).toContain(
        'tx_pro_admin',
      )
      expect(result.predicates.atomic['customer_user?']).toContain(
        'customer_user',
      )
      // Composite predicates
      expect(result.predicates.composite).toBeDefined()
      expect(result.predicates.composite['tx_pro_staff?']).toContain('||')
    })

    it('extracts role definition from enum', () => {
      expect(result.role_definition).toBeDefined()
      expect(result.role_definition.roles).toBeDefined()
      const roleNames = Object.keys(result.role_definition.roles)
      expect(roleNames).toContain('customer_user')
      expect(roleNames).toContain('tx_pro_admin')
    })

    it('builds controller enforcement map', () => {
      const map = result.controller_enforcement_map
      expect(map).toBeDefined()
      // Admin namespace
      expect(map.admin_namespace).toBeDefined()
      expect(
        map.admin_namespace.controllers['Admin::BaseController'],
      ).toBeDefined()
      expect(
        map.admin_namespace.controllers['Admin::BaseController'].guard,
      ).toBe('require_tx_pro_role!')
    })

    it('includes admin inherited guards', () => {
      const map = result.controller_enforcement_map
      const dashboard =
        map.admin_namespace.controllers['Admin::DashboardController']
      expect(dashboard).toBeDefined()
      expect(dashboard.guard).toContain('inherited')
    })

    it('includes customer area guards', () => {
      const map = result.controller_enforcement_map
      // RolesController should be in customer_area or other
      const allControllers = Object.values(map)
        .filter((v) => v && typeof v === 'object' && v.controllers)
        .flatMap((v) => Object.keys(v.controllers))
      expect(allControllers).toContain('RolesController')
    })

    it('includes unguarded controllers', () => {
      const map = result.controller_enforcement_map
      expect(map.unguarded_controllers).toBeDefined()
      expect(map.unguarded_controllers.length).toBeGreaterThan(0)
      expect(
        map.unguarded_controllers.some((c) => c.includes('SessionsController')),
      ).toBe(true)
    })

    it('disambiguates domain roles (JobRoles)', () => {
      expect(result.domain_roles_not_auth).toBeDefined()
      expect(result.domain_roles_not_auth.concern).toContain('JobRoles')
      expect(result.domain_roles_not_auth.auth_relevance).toContain('none')
    })

    it('includes related files', () => {
      expect(result.related_files).toBeDefined()
      expect(result.related_files).toContain(
        'app/controllers/concerns/authorization.rb',
      )
      expect(result.related_files).toContain('app/models/user.rb')
    })

    it('reports searched libraries not found', () => {
      expect(result.searched_libraries_not_found).toContain('pundit')
      expect(result.searched_libraries_not_found).toContain('cancancan')
    })

    it('produces output >= 3000 chars (much more than original 61)', () => {
      const output = JSON.stringify(result)
      expect(output.length).toBeGreaterThanOrEqual(3000)
    })
  })

  describe('ISSUE-12: custom policy action methods beyond CRUD', () => {
    it('extracts non-CRUD policy predicate methods', () => {
      const files = {
        'app/policies/asset_review_policy.rb': `
class AssetReviewPolicy < ApplicationPolicy
  def index?
    user.admin?
  end

  def approve?
    user.reviewer?
  end

  def reject?
    user.reviewer?
  end

  def publish?
    user.admin?
  end
end`,
      }
      const entries = [
        { path: 'app/policies/asset_review_policy.rb', category: 'policy' },
      ]
      const provider = mockProvider(files)
      const result = extractAuthorization(provider, entries, {
        gems: { pundit: { version: '2.3' } },
      })
      const policy = result.policies?.find(
        (p) => p.resource === 'AssetReview' || p.class === 'AssetReviewPolicy',
      )
      expect(policy).toBeDefined()
      expect(policy.permitted_actions).toContain('approve')
      expect(policy.permitted_actions).toContain('reject')
      expect(policy.permitted_actions).toContain('publish')
      expect(policy.permitted_actions).toContain('index')
    })
  })

  describe('ISSUE-F: CanCan Ability in non-standard filename', () => {
    it('finds CanCan Ability class in admin_ability.rb', () => {
      const entries = [
        {
          path: 'app/models/admin_ability.rb',
          category: 1,
          categoryName: 'models',
          type: 'ruby',
        },
      ]
      const provider = mockProvider({
        'app/models/ability.rb': null,
        'app/models/admin_ability.rb': `class AdminAbility
  include CanCan::Ability
  def initialize(user)
    if user.has_role?(:admin)
      can :manage, :all
    elsif user.has_role?(:editor)
      can :read, Article
    end
  end
end`,
      })
      const result = extractAuthorization(provider, entries, {
        gems: { cancancan: {} },
      })
      expect(result.strategy).toBe('cancancan')
      expect(result.abilities).not.toBeNull()
      expect(result.abilities.length).toBeGreaterThan(0)
    })

    it('extracts roles from has_role? calls in ability class', () => {
      const entries = [
        {
          path: 'app/models/admin_ability.rb',
          category: 1,
          categoryName: 'models',
          type: 'ruby',
        },
      ]
      const provider = mockProvider({
        'app/models/ability.rb': null,
        'app/models/admin_ability.rb': `class AdminAbility
  include CanCan::Ability
  def initialize(user)
    if user.has_role?(:admin)
      can :manage, :all
    elsif user.has_role?(:editor)
      can :read, Article
    end
  end
end`,
      })
      const result = extractAuthorization(provider, entries, {
        gems: { cancancan: {} },
      })
      expect(result.roles).toBeDefined()
      expect(result.roles.roles).toContain('admin')
      expect(result.roles.roles).toContain('editor')
    })
  })

  describe('rolify model detection', () => {
    it('reports rolify model as AdminUser, not User', () => {
      const entries = [
        {
          path: 'app/models/user.rb',
          category: 1,
          categoryName: 'models',
          type: 'ruby',
        },
        {
          path: 'app/models/admin_user.rb',
          category: 1,
          categoryName: 'models',
          type: 'ruby',
        },
      ]
      const provider = mockProvider({
        'app/models/user.rb':
          'class User < ApplicationRecord\n  has_many :posts\nend',
        'app/models/admin_user.rb':
          "class AdminUser < ApplicationRecord\n  rolify :role_cname => 'AdminRole'\n  devise :database_authenticatable\nend",
      })
      const result = extractAuthorization(provider, entries, {
        gems: { rolify: {} },
      })
      expect(result.roles).toBeDefined()
      expect(result.roles.model).toBe('AdminUser')
      expect(result.roles.source).toBe('rolify')
    })

    it('falls back to enum role when no rolify declaration found', () => {
      const entries = [
        {
          path: 'app/models/user.rb',
          category: 1,
          categoryName: 'models',
          type: 'ruby',
        },
      ]
      const provider = mockProvider({
        'app/models/user.rb':
          'class User < ApplicationRecord\n  enum role: { admin: 0, editor: 1 }\nend',
      })
      const result = extractAuthorization(provider, entries, {})
      expect(result.roles).toBeDefined()
      expect(result.roles.model).toBe('User')
      expect(result.roles.source).toBe('enum')
    })
  })

  describe('rolify + cancancan coexistence', () => {
    it('preserves cancancan roles when rolify overwrites source', () => {
      const entries = [
        {
          path: 'app/models/admin_user.rb',
          category: 1,
          categoryName: 'models',
          type: 'ruby',
        },
        {
          path: 'app/models/admin_ability.rb',
          category: 1,
          categoryName: 'models',
          type: 'ruby',
        },
      ]
      const provider = mockProvider({
        'app/models/ability.rb': null,
        'app/models/admin_user.rb':
          "class AdminUser < ApplicationRecord\n  rolify :role_cname => 'AdminRole'\n  devise :database_authenticatable\nend",
        'app/models/admin_ability.rb': `class AdminAbility
  include CanCan::Ability
  def initialize(admin_user)
    if admin_user.has_role?(:admin)
      can :manage, :all
    elsif admin_user.has_role?(:editor)
      can :read, Article
    elsif admin_user.has_role?(:sales)
      can :read, Business
    elsif admin_user.has_role?(:producer)
      can :manage, Article
    elsif admin_user.has_role?(:contributer)
      can :read, Article
    elsif admin_user.has_role?(:explorer)
      # explorer stuff
    end
  end
end`,
      })
      const result = extractAuthorization(provider, entries, {
        gems: { cancancan: {}, rolify: {} },
      })
      expect(result.roles).toBeDefined()
      expect(result.roles.model).toBe('AdminUser')
      expect(result.roles.source).toBe('rolify')
      expect(result.roles.roles).toBeDefined()
      expect(result.roles.roles).toContain('admin')
      expect(result.roles.roles).toContain('editor')
      expect(result.roles.roles).toContain('sales')
      expect(result.roles.roles).toContain('producer')
      expect(result.roles.roles).toContain('contributer')
      expect(result.roles.roles).toContain('explorer')
      expect(result.roles.roles).toHaveLength(6)
    })

    it('extracts cancancan roles even when many model entries exist', () => {
      const entries = [
        {
          path: 'app/models/user.rb',
          category: 1,
          categoryName: 'models',
          type: 'ruby',
        },
        {
          path: 'app/models/admin_user.rb',
          category: 1,
          categoryName: 'models',
          type: 'ruby',
        },
        {
          path: 'app/models/article.rb',
          category: 1,
          categoryName: 'models',
          type: 'ruby',
        },
        {
          path: 'app/models/event.rb',
          category: 1,
          categoryName: 'models',
          type: 'ruby',
        },
        {
          path: 'app/models/business.rb',
          category: 1,
          categoryName: 'models',
          type: 'ruby',
        },
        {
          path: 'app/models/venue.rb',
          category: 1,
          categoryName: 'models',
          type: 'ruby',
        },
        {
          path: 'app/models/review.rb',
          category: 1,
          categoryName: 'models',
          type: 'ruby',
        },
        {
          path: 'app/models/organiser.rb',
          category: 1,
          categoryName: 'models',
          type: 'ruby',
        },
        {
          path: 'app/models/admin_ability.rb',
          category: 1,
          categoryName: 'models',
          type: 'ruby',
        },
        {
          path: 'app/models/admin_role.rb',
          category: 1,
          categoryName: 'models',
          type: 'ruby',
        },
      ]
      const provider = mockProvider({
        'app/models/ability.rb': null,
        'app/models/user.rb': 'class User < ApplicationRecord\nend',
        'app/models/admin_user.rb':
          "class AdminUser < ApplicationRecord\n  rolify :role_cname => 'AdminRole'\nend",
        'app/models/article.rb': 'class Article < ApplicationRecord\nend',
        'app/models/event.rb': 'class Event < ApplicationRecord\nend',
        'app/models/business.rb': 'class Business < ApplicationRecord\nend',
        'app/models/venue.rb': 'class Venue < ApplicationRecord\nend',
        'app/models/review.rb': 'class Review < ApplicationRecord\nend',
        'app/models/organiser.rb': 'class Organiser < ApplicationRecord\nend',
        'app/models/admin_ability.rb': `class AdminAbility
  include CanCan::Ability
  def initialize(user)
    if user.has_role?(:admin)
      can :manage, :all
    elsif user.has_role?(:editor)
      can :read, Article
    end
  end
end`,
        'app/models/admin_role.rb': 'class AdminRole < ApplicationRecord\nend',
      })
      const result = extractAuthorization(provider, entries, {
        gems: { cancancan: {}, rolify: {} },
      })
      expect(result.roles).toBeDefined()
      expect(result.roles.roles).toContain('admin')
      expect(result.roles.roles).toContain('editor')
    })
  })
})
