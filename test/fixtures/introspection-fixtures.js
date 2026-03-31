/**
 * Introspection Fixtures
 * Realistic JSON representations of Ruby runtime introspection output
 * used in bridge and merger tests.
 *
 * RUNTIME_* constants reflect what the Ruby introspect.rb script returns.
 * REGEX_* constants reflect what RailsInsight's regex extractors produce
 * for the same files — intentionally missing data only discoverable at runtime.
 */

// ---------------------------------------------------------------------------
// RUNTIME_MODELS
// Keyed by model class name. Represents reflect_on_all_associations, validators,
// columns, defined_enums, and _callbacks output from a live Rails process.
// ---------------------------------------------------------------------------

export const RUNTIME_MODELS = {
  User: {
    class_name: 'User',
    table_name: 'users',
    superclass: 'ApplicationRecord',
    abstract: false,
    associations: [
      {
        macro: 'belongs_to',
        name: 'organization',
        class_name: 'Organization',
        foreign_key: 'organization_id',
        options: {},
        through: null,
        polymorphic: false,
      },
      {
        macro: 'has_many',
        name: 'posts',
        class_name: 'Post',
        foreign_key: 'user_id',
        options: {},
        through: null,
        polymorphic: false,
      },
      {
        macro: 'has_one',
        name: 'profile',
        class_name: 'Profile',
        foreign_key: 'user_id',
        options: {},
        through: null,
        polymorphic: false,
      },
      {
        // has_many :tags, through: :taggings — resolved via runtime reflection
        macro: 'has_many',
        name: 'tags',
        class_name: 'Tag',
        foreign_key: null,
        options: { through: 'taggings' },
        through: 'taggings',
        polymorphic: false,
      },
      {
        // Metaprogrammed: defined via define_method or dynamic association —
        // regex cannot detect this; only runtime reflection finds it
        macro: 'has_many',
        name: 'authored_comments',
        class_name: 'Comment',
        foreign_key: 'author_id',
        options: { class_name: 'Comment', foreign_key: 'author_id' },
        through: null,
        polymorphic: false,
      },
    ],
    columns: [
      {
        name: 'id',
        sql_type: 'bigint',
        type: 'integer',
        null: false,
        default: null,
      },
      {
        name: 'email',
        sql_type: 'character varying',
        type: 'string',
        null: false,
        default: null,
      },
      {
        name: 'encrypted_password',
        sql_type: 'character varying',
        type: 'string',
        null: false,
        default: '',
      },
      {
        name: 'name',
        sql_type: 'character varying',
        type: 'string',
        null: true,
        default: null,
      },
      {
        name: 'role',
        sql_type: 'integer',
        type: 'integer',
        null: false,
        default: '0',
      },
      {
        name: 'organization_id',
        sql_type: 'bigint',
        type: 'integer',
        null: true,
        default: null,
      },
      {
        name: 'confirmed_at',
        sql_type: 'timestamp without time zone',
        type: 'datetime',
        null: true,
        default: null,
      },
      {
        name: 'reset_password_token',
        sql_type: 'character varying',
        type: 'string',
        null: true,
        default: null,
      },
      {
        name: 'reset_password_sent_at',
        sql_type: 'timestamp without time zone',
        type: 'datetime',
        null: true,
        default: null,
      },
      {
        name: 'created_at',
        sql_type: 'timestamp(6) without time zone',
        type: 'datetime',
        null: false,
        default: null,
      },
      {
        name: 'updated_at',
        sql_type: 'timestamp(6) without time zone',
        type: 'datetime',
        null: false,
        default: null,
      },
    ],
    validators: [
      { kind: 'presence', attributes: ['email'] },
      { kind: 'uniqueness', attributes: ['email'] },
      { kind: 'length', attributes: ['name'], options: { maximum: 255 } },
    ],
    enums: {
      role: {
        values: ['member', 'moderator', 'admin'],
        value_map: { member: 0, moderator: 1, admin: 2 },
      },
    },
    callbacks: [
      {
        kind: 'before_create',
        filter: 'assign_default_organization',
        options: {},
      },
      { kind: 'after_commit', filter: 'sync_to_search_index', options: {} },
    ],
    devise_modules: [
      'database_authenticatable',
      'registerable',
      'recoverable',
      'rememberable',
      'validatable',
      'confirmable',
    ],
  },

  Post: {
    class_name: 'Post',
    table_name: 'posts',
    superclass: 'ApplicationRecord',
    abstract: false,
    associations: [
      {
        macro: 'belongs_to',
        name: 'user',
        class_name: 'User',
        foreign_key: 'user_id',
        options: {},
        through: null,
        polymorphic: false,
      },
      {
        macro: 'has_many',
        name: 'comments',
        class_name: 'Comment',
        foreign_key: 'post_id',
        options: { dependent: 'destroy' },
        through: null,
        polymorphic: false,
      },
      {
        macro: 'has_many',
        name: 'taggings',
        class_name: 'Tagging',
        foreign_key: 'post_id',
        options: { as: 'taggable' },
        through: null,
        polymorphic: false,
      },
      {
        macro: 'has_many',
        name: 'tags',
        class_name: 'Tag',
        foreign_key: null,
        options: { through: 'taggings' },
        through: 'taggings',
        polymorphic: false,
      },
    ],
    columns: [
      {
        name: 'id',
        sql_type: 'bigint',
        type: 'integer',
        null: false,
        default: null,
      },
      {
        name: 'title',
        sql_type: 'character varying',
        type: 'string',
        null: false,
        default: null,
      },
      {
        name: 'body',
        sql_type: 'text',
        type: 'text',
        null: true,
        default: null,
      },
      {
        name: 'published',
        sql_type: 'boolean',
        type: 'boolean',
        null: false,
        default: 'false',
      },
      {
        name: 'user_id',
        sql_type: 'bigint',
        type: 'integer',
        null: false,
        default: null,
      },
      {
        name: 'created_at',
        sql_type: 'timestamp(6) without time zone',
        type: 'datetime',
        null: false,
        default: null,
      },
      {
        name: 'updated_at',
        sql_type: 'timestamp(6) without time zone',
        type: 'datetime',
        null: false,
        default: null,
      },
    ],
    validators: [
      { kind: 'presence', attributes: ['title', 'user'] },
      { kind: 'length', attributes: ['title'], options: { maximum: 500 } },
    ],
    enums: {},
    callbacks: [{ kind: 'before_save', filter: 'sanitize_body', options: {} }],
    devise_modules: null,
  },

  Comment: {
    class_name: 'Comment',
    table_name: 'comments',
    superclass: 'ApplicationRecord',
    abstract: false,
    associations: [
      {
        macro: 'belongs_to',
        name: 'post',
        class_name: 'Post',
        foreign_key: 'post_id',
        options: {},
        through: null,
        polymorphic: false,
      },
      {
        macro: 'belongs_to',
        name: 'user',
        class_name: 'User',
        foreign_key: 'author_id',
        options: { class_name: 'User', foreign_key: 'author_id' },
        through: null,
        polymorphic: false,
      },
    ],
    columns: [
      {
        name: 'id',
        sql_type: 'bigint',
        type: 'integer',
        null: false,
        default: null,
      },
      {
        name: 'body',
        sql_type: 'text',
        type: 'text',
        null: false,
        default: null,
      },
      {
        name: 'post_id',
        sql_type: 'bigint',
        type: 'integer',
        null: false,
        default: null,
      },
      {
        name: 'author_id',
        sql_type: 'bigint',
        type: 'integer',
        null: false,
        default: null,
      },
      {
        name: 'created_at',
        sql_type: 'timestamp(6) without time zone',
        type: 'datetime',
        null: false,
        default: null,
      },
      {
        name: 'updated_at',
        sql_type: 'timestamp(6) without time zone',
        type: 'datetime',
        null: false,
        default: null,
      },
    ],
    validators: [{ kind: 'presence', attributes: ['body', 'post', 'user'] }],
    enums: {},
    callbacks: [],
    devise_modules: null,
  },
}

// ---------------------------------------------------------------------------
// RUNTIME_CONTROLLERS
// Keyed by controller class name. Represents ActionController::Base.descendants
// introspection — includes inherited callbacks not visible in the file itself.
// ---------------------------------------------------------------------------

export const RUNTIME_CONTROLLERS = {
  UsersController: {
    class_name: 'UsersController',
    superclass: 'ApplicationController',
    actions: ['index', 'show', 'create', 'update', 'destroy'],
    callbacks: [
      {
        // Inherited from ApplicationController — regex cannot detect this
        kind: 'before',
        filter: 'authenticate_user!',
        options: {},
        inherited: true,
      },
      {
        kind: 'before',
        filter: 'set_user',
        options: { only: ['show', 'update', 'destroy'] },
        inherited: false,
      },
    ],
  },

  PostsController: {
    class_name: 'PostsController',
    superclass: 'ApplicationController',
    actions: ['index', 'show', 'create'],
    callbacks: [
      {
        kind: 'before',
        filter: 'authenticate_user!',
        options: {},
        inherited: true,
      },
      {
        kind: 'before',
        filter: 'set_post',
        options: { only: ['show'] },
        inherited: false,
      },
    ],
  },
}

// ---------------------------------------------------------------------------
// RUNTIME_ROUTES
// Array of 8 route objects from Rails.application.routes.routes.
// ---------------------------------------------------------------------------

export const RUNTIME_ROUTES = [
  {
    verb: 'GET',
    path: '/users(.:format)',
    controller: 'users',
    action: 'index',
    name: 'users',
    constraints: {},
    engine: null,
  },
  {
    verb: 'POST',
    path: '/users(.:format)',
    controller: 'users',
    action: 'create',
    name: 'users',
    constraints: {},
    engine: null,
  },
  {
    verb: 'GET',
    path: '/users/:id(.:format)',
    controller: 'users',
    action: 'show',
    name: 'user',
    constraints: {},
    engine: null,
  },
  {
    verb: 'PATCH',
    path: '/users/:id(.:format)',
    controller: 'users',
    action: 'update',
    name: 'user',
    constraints: {},
    engine: null,
  },
  {
    verb: 'DELETE',
    path: '/users/:id(.:format)',
    controller: 'users',
    action: 'destroy',
    name: 'user',
    constraints: {},
    engine: null,
  },
  {
    verb: 'GET',
    path: '/posts(.:format)',
    controller: 'posts',
    action: 'index',
    name: 'posts',
    constraints: {},
    engine: null,
  },
  {
    verb: 'GET',
    path: '/posts/:id(.:format)',
    controller: 'posts',
    action: 'show',
    name: 'post',
    constraints: {},
    engine: null,
  },
  {
    verb: 'POST',
    path: '/posts(.:format)',
    controller: 'posts',
    action: 'create',
    name: 'posts',
    constraints: {},
    engine: null,
  },
]

// ---------------------------------------------------------------------------
// RUNTIME_DATABASE
// Database metadata from ActiveRecord::Base.connection.
// ---------------------------------------------------------------------------

export const RUNTIME_DATABASE = {
  adapter: 'postgresql',
  database_version: '16.2',
  tables: [
    'users',
    'posts',
    'comments',
    'taggings',
    'tags',
    'organizations',
    'profiles',
  ],
  foreign_keys: [
    {
      from_table: 'posts',
      to_table: 'users',
      column: 'user_id',
      primary_key: 'id',
    },
    {
      from_table: 'comments',
      to_table: 'posts',
      column: 'post_id',
      primary_key: 'id',
    },
    {
      from_table: 'comments',
      to_table: 'users',
      column: 'author_id',
      primary_key: 'id',
    },
  ],
}

// ---------------------------------------------------------------------------
// REGEX_MODELS
// What RailsInsight's regex extractors produce for the same source files.
// Intentionally MISSING:
//   - authored_comments association on User (defined via metaprogramming)
//   - class_name on the tags through-association (regex couldn't resolve it)
// ---------------------------------------------------------------------------

export const REGEX_MODELS = {
  User: {
    class: 'User',
    file: 'app/models/user.rb',
    type: 'model',
    superclass: 'ApplicationRecord',
    namespace: null,
    abstract: false,
    sti_base: false,
    concerns: [],
    extends: [],
    // Only 4 associations — missing authored_comments (metaprogrammed)
    associations: [
      {
        type: 'belongs_to',
        name: 'organization',
        class_name: 'Organization',
        foreign_key: 'organization_id',
        polymorphic: false,
        optional: false,
        through: null,
        source: null,
      },
      {
        type: 'has_many',
        name: 'posts',
        class_name: 'Post',
        foreign_key: 'user_id',
        polymorphic: false,
        optional: false,
        through: null,
        source: null,
      },
      {
        type: 'has_one',
        name: 'profile',
        class_name: 'Profile',
        foreign_key: 'user_id',
        polymorphic: false,
        optional: false,
        through: null,
        source: null,
      },
      {
        type: 'has_many',
        name: 'tags',
        // Regex couldn't resolve class_name for the through-association
        class_name: null,
        foreign_key: null,
        polymorphic: false,
        optional: false,
        through: 'taggings',
        source: null,
      },
    ],
    validations: [
      { attributes: ['email'], rules: 'presence: true' },
      { attributes: ['email'], rules: 'uniqueness: true' },
      { attributes: ['name'], rules: 'length: true, maximum: 255' },
    ],
    custom_validators: [],
    scopes: ['active', 'admins'],
    scope_queries: {
      active: 'where(confirmed_at: ..Time.current)',
      admins: 'where(role: :admin)',
    },
    enums: {
      role: {
        values: ['member', 'moderator', 'admin'],
        value_map: { member: 0, moderator: 1, admin: 2 },
        syntax: 'legacy',
      },
    },
    callbacks: [
      {
        type: 'before_create',
        method: 'assign_default_organization',
        options: null,
      },
      { type: 'after_commit', method: 'sync_to_search_index', options: null },
    ],
    delegations: [],
    encrypts: [],
    normalizes: [],
    token_generators: [],
    has_secure_password: false,
    attachments: [],
    rich_text: [],
    store_accessors: {},
    table_name: null,
    default_scope: false,
    broadcasts: false,
    strict_loading: false,
    turbo_refreshes_with: null,
    devise_modules: [
      'database_authenticatable',
      'registerable',
      'recoverable',
      'rememberable',
      'validatable',
      'confirmable',
    ],
    searchable: null,
    friendly_id: null,
    soft_delete: null,
    state_machine: null,
    paper_trail: false,
    audited: false,
    has_associated_audits: false,
    nested_attributes: [],
    public_methods: ['full_name', 'display_role'],
    method_line_ranges: {
      full_name: { start: 22, end: 24 },
      display_role: { start: 26, end: 28 },
    },
  },
}

// ---------------------------------------------------------------------------
// REGEX_CONTROLLERS
// What RailsInsight's regex extractors produce from controller source files.
// Intentionally MISSING:
//   - authenticate_user! callback on UsersController (inherited from
//     ApplicationController, not declared in users_controller.rb)
// ---------------------------------------------------------------------------

export const REGEX_CONTROLLERS = {
  UsersController: {
    class: 'UsersController',
    file: 'app/controllers/users_controller.rb',
    superclass: 'ApplicationController',
    namespace: null,
    concerns: [],
    // Only 1 filter — missing authenticate_user! which is inherited
    filters: [
      {
        type: 'before_action',
        method: 'set_user',
        options: 'only: [:show, :update, :destroy]',
      },
    ],
    actions: ['index', 'show', 'create', 'update', 'destroy'],
    action_line_ranges: {
      index: { start: 8, end: 12 },
      show: { start: 14, end: 16 },
      create: { start: 18, end: 26 },
      update: { start: 28, end: 36 },
      destroy: { start: 38, end: 42 },
    },
    action_summaries: null,
    strong_params: {
      method: 'user_params',
      model: 'user',
      permitted: [':name', ':email', ':role'],
    },
    rescue_handlers: [],
    layout: null,
    api_controller: false,
    streaming: false,
    rate_limits: null,
    allow_unauthenticated_access: null,
  },
}
