import { describe, it, expect } from 'vitest'
import {
  mergeModels,
  mergeControllers,
  mergeSchema,
  mergeRoutes,
  mergeExtractions,
} from '../../src/introspection/merger.js'
import {
  RUNTIME_MODELS,
  REGEX_MODELS,
  RUNTIME_CONTROLLERS,
  REGEX_CONTROLLERS,
  RUNTIME_ROUTES,
  RUNTIME_DATABASE,
} from '../fixtures/introspection-fixtures.js'

describe('mergeModels', () => {
  it('replaces regex associations with runtime associations', () => {
    const merged = mergeModels(REGEX_MODELS, RUNTIME_MODELS)
    expect(merged.User.associations.length).toBe(
      RUNTIME_MODELS.User.associations.length,
    )
  })

  it('uses runtime class_name instead of regex-guessed names', () => {
    const merged = mergeModels(REGEX_MODELS, RUNTIME_MODELS)
    const tagsAssoc = merged.User.associations.find((a) => a.name === 'tags')
    expect(tagsAssoc).toBeDefined()
    expect(tagsAssoc.class_name).toBe('Tag')
  })

  it('preserves regex-only fields not available from runtime', () => {
    const merged = mergeModels(REGEX_MODELS, RUNTIME_MODELS)
    expect(merged.User.scope_queries).toBeDefined()
    expect(merged.User.method_line_ranges).toBeDefined()
    expect(merged.User.public_methods).toBeDefined()
  })

  it('adds runtime-only models not found in regex', () => {
    const runtimeWithExtra = {
      ...RUNTIME_MODELS,
      Auditable: {
        class_name: 'Auditable',
        table_name: 'auditables',
        superclass: 'ApplicationRecord',
        abstract: false,
        associations: [],
        columns: [],
        validators: [],
        enums: {},
        callbacks: [],
        devise_modules: null,
      },
    }
    const merged = mergeModels(REGEX_MODELS, runtimeWithExtra)
    expect(merged.Auditable).toBeDefined()
    expect(merged.Auditable.source).toBe('runtime_only')
  })

  it('preserves regex-only models not in runtime', () => {
    const regexWithConcern = {
      ...REGEX_MODELS,
      Searchable: {
        class: 'Searchable',
        file: 'app/models/concerns/searchable.rb',
        type: 'concern',
        associations: [],
        callbacks: [],
        enums: {},
      },
    }
    const merged = mergeModels(regexWithConcern, RUNTIME_MODELS)
    expect(merged.Searchable).toBeDefined()
    expect(merged.Searchable.type).toBe('concern')
  })

  it('replaces regex enums with runtime defined_enums', () => {
    const merged = mergeModels(REGEX_MODELS, RUNTIME_MODELS)
    // Runtime enums have a clean values array; regex enums have a 'syntax' field
    expect(merged.User.enums).toEqual(RUNTIME_MODELS.User.enums)
    expect(merged.User.enums.role.values).toEqual([
      'member',
      'moderator',
      'admin',
    ])
  })

  it('supplements regex callbacks with runtime-only callbacks', () => {
    const merged = mergeModels(REGEX_MODELS, RUNTIME_MODELS)
    const callbacks = merged.User.callbacks
    expect(Array.isArray(callbacks)).toBe(true)
    expect(callbacks.length).toBeGreaterThan(0)
    callbacks.forEach((cb) => {
      expect(cb.source).toBeDefined()
      expect(['regex', 'runtime', 'both']).toContain(cb.source)
    })
  })

  it('replaces regex columns with runtime columns when available', () => {
    const merged = mergeModels(REGEX_MODELS, RUNTIME_MODELS)
    const emailCol = merged.User.columns.find((c) => c.name === 'email')
    expect(emailCol).toBeDefined()
    // Runtime columns have sql_type, null, default fields
    expect(emailCol.sql_type).toBeDefined()
    expect(emailCol).toHaveProperty('null')
    expect(emailCol).toHaveProperty('default')
  })
})

describe('mergeControllers', () => {
  it('replaces regex filters with runtime callbacks', () => {
    const merged = mergeControllers(REGEX_CONTROLLERS, RUNTIME_CONTROLLERS)
    expect(merged.UsersController.callbacks).toBeDefined()
    expect(merged.UsersController.callbacks.length).toBe(
      RUNTIME_CONTROLLERS.UsersController.callbacks.length,
    )
  })

  it('preserves regex structural fields not available from runtime', () => {
    const merged = mergeControllers(REGEX_CONTROLLERS, RUNTIME_CONTROLLERS)
    expect(merged.UsersController.action_line_ranges).toBeDefined()
    expect(merged.UsersController.strong_params).toBeDefined()
    expect(merged.UsersController).toHaveProperty('namespace')
  })

  it('tags inherited callbacks correctly', () => {
    const merged = mergeControllers(REGEX_CONTROLLERS, RUNTIME_CONTROLLERS)
    const callbacks = merged.UsersController.callbacks
    const inheritedCallback = callbacks.find((cb) => cb.inherited === true)
    expect(inheritedCallback).toBeDefined()
    expect(inheritedCallback.filter).toBe('authenticate_user!')
  })

  it('preserves regex-only controllers not in runtime', () => {
    const regexWithAdmin = {
      ...REGEX_CONTROLLERS,
      AdminController: {
        class: 'AdminController',
        file: 'app/controllers/admin_controller.rb',
        superclass: 'ApplicationController',
        namespace: null,
        concerns: [],
        filters: [],
        actions: ['dashboard'],
        action_line_ranges: { dashboard: { start: 5, end: 8 } },
        action_summaries: null,
        strong_params: null,
        rescue_handlers: [],
        layout: 'admin',
        api_controller: false,
        streaming: false,
        rate_limits: null,
        allow_unauthenticated_access: null,
      },
    }
    const merged = mergeControllers(regexWithAdmin, RUNTIME_CONTROLLERS)
    expect(merged.AdminController).toBeDefined()
    expect(merged.AdminController.layout).toBe('admin')
  })

  it('handles controllers in runtime but not in regex', () => {
    const runtimeWithExtra = {
      ...RUNTIME_CONTROLLERS,
      SettingsController: {
        class_name: 'SettingsController',
        superclass: 'ApplicationController',
        actions: ['show', 'update'],
        callbacks: [
          {
            kind: 'before',
            filter: 'authenticate_user!',
            options: {},
            inherited: true,
          },
        ],
      },
    }
    const merged = mergeControllers(REGEX_CONTROLLERS, runtimeWithExtra)
    expect(merged.SettingsController).toBeDefined()
    expect(merged.SettingsController.source).toBe('runtime_only')
  })
})

describe('mergeSchema', () => {
  const regexSchema = {
    version: '20240101000000',
    extensions: ['plpgsql', 'pgcrypto'],
    enums: { role: ['member', 'moderator', 'admin'] },
    tables: [
      {
        name: 'users',
        primary_key: { type: 'bigint', auto: true },
        columns: [
          { name: 'id', type: 'integer', constraints: null },
          { name: 'email', type: 'string', constraints: 'null: false' },
          { name: 'name', type: 'string', constraints: null },
        ],
        indexes: [
          { columns: ['email'], unique: true, name: 'index_users_on_email' },
        ],
        comment: null,
      },
      {
        name: 'posts',
        primary_key: { type: 'bigint', auto: true },
        columns: [
          { name: 'id', type: 'integer', constraints: null },
          { name: 'title', type: 'string', constraints: 'null: false' },
          { name: 'user_id', type: 'integer', constraints: null },
        ],
        indexes: [],
        comment: null,
      },
    ],
    foreign_keys: [{ from_table: 'posts', to_table: 'users', options: null }],
  }

  it('enriches schema tables with runtime column data', () => {
    const runtimeDatabase = {
      adapter: 'postgresql',
      database_version: '16.2',
      tables: ['users', 'posts'],
      foreign_keys: [],
      model_columns: {
        users: [
          { name: 'id', sql_type: 'bigint', null: false, default: null },
          {
            name: 'email',
            sql_type: 'character varying',
            null: false,
            default: null,
          },
          {
            name: 'name',
            sql_type: 'character varying',
            null: true,
            default: null,
          },
        ],
      },
    }
    const merged = mergeSchema(regexSchema, runtimeDatabase)
    const usersTable = merged.tables.find((t) => t.name === 'users')
    expect(usersTable).toBeDefined()
    expect(usersTable.runtime_columns).toBeDefined()
    expect(usersTable.runtime_columns.length).toBeGreaterThan(0)
    const emailCol = usersTable.runtime_columns.find((c) => c.name === 'email')
    expect(emailCol).toBeDefined()
    expect(emailCol.sql_type).toBeDefined()
    expect(emailCol).toHaveProperty('null')
    expect(emailCol).toHaveProperty('default')
  })

  it('adds runtime foreign keys not in regex schema', () => {
    const runtimeDatabase = {
      adapter: 'postgresql',
      database_version: '16.2',
      tables: ['users', 'posts', 'comments'],
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
      ],
      model_columns: {},
    }
    const merged = mergeSchema(regexSchema, runtimeDatabase)
    // The regex schema has posts->users FK; runtime adds comments->posts FK
    const commentsToPostsFk = merged.foreign_keys.find(
      (fk) => fk.from_table === 'comments' && fk.to_table === 'posts',
    )
    expect(commentsToPostsFk).toBeDefined()
    expect(commentsToPostsFk.source).toBe('runtime')
  })

  it('preserves regex schema structure', () => {
    const merged = mergeSchema(regexSchema, RUNTIME_DATABASE)
    expect(merged.version).toBe('20240101000000')
    expect(merged.extensions).toEqual(['plpgsql', 'pgcrypto'])
    expect(merged.enums).toEqual({ role: ['member', 'moderator', 'admin'] })
    const usersTable = merged.tables.find((t) => t.name === 'users')
    expect(usersTable.indexes).toBeDefined()
    expect(usersTable.indexes.length).toBe(1)
  })

  it('handles missing runtime database gracefully', () => {
    const merged = mergeSchema(regexSchema, null)
    expect(merged).toEqual(regexSchema)
  })
})

describe('mergeRoutes', () => {
  const baseRegexRoutes = {
    root: { controller: 'home', action: 'index' },
    resources: [
      {
        name: 'users',
        controller: 'users',
        actions: ['index', 'show', 'create', 'update', 'destroy'],
        namespace: null,
        shallow: false,
        concerns: [],
      },
      {
        name: 'posts',
        controller: 'posts',
        actions: ['index', 'show', 'create'],
        namespace: null,
        shallow: false,
        concerns: [],
      },
    ],
    standalone_routes: [
      {
        verb: 'GET',
        path: '/health',
        controller: 'health',
        action: 'show',
        name: 'health',
      },
    ],
    mounted_engines: [{ engine: 'Sidekiq::Web', path: '/sidekiq' }],
    concerns: ['paginatable'],
    drawn_files: [],
    nested_relationships: [{ parent: 'users', child: 'posts' }],
    devise_routes: [],
  }

  it('adds engine routes from runtime', () => {
    const runtimeWithEngineRoutes = [
      {
        verb: 'GET',
        path: '/users/sign_in(.:format)',
        controller: 'devise/sessions',
        action: 'new',
        name: 'new_user_session',
        constraints: {},
        engine: 'Devise::Engine',
      },
      {
        verb: 'POST',
        path: '/users/sign_in(.:format)',
        controller: 'devise/sessions',
        action: 'create',
        name: 'user_session',
        constraints: {},
        engine: 'Devise::Engine',
      },
      {
        verb: 'GET',
        path: '/users(.:format)',
        controller: 'users',
        action: 'index',
        name: 'users',
        constraints: {},
        engine: null,
      },
    ]
    const regexWithNoDevise = { ...baseRegexRoutes, devise_routes: [] }
    const merged = mergeRoutes(regexWithNoDevise, runtimeWithEngineRoutes)
    expect(merged.engine_routes).toBeDefined()
    expect(Array.isArray(merged.engine_routes)).toBe(true)
    const deviseEngineRoutes = merged.engine_routes.filter(
      (r) => r.engine === 'Devise::Engine',
    )
    expect(deviseEngineRoutes.length).toBe(2)
    expect(deviseEngineRoutes[0].path).toContain('/users/sign_in')
  })

  it('preserves regex route structure (nested resources, member routes)', () => {
    const merged = mergeRoutes(baseRegexRoutes, [])
    expect(merged.resources).toEqual(baseRegexRoutes.resources)
    expect(merged.nested_relationships).toEqual(
      baseRegexRoutes.nested_relationships,
    )
    expect(merged.standalone_routes).toEqual(baseRegexRoutes.standalone_routes)
    expect(merged.mounted_engines).toEqual(baseRegexRoutes.mounted_engines)
    expect(merged.concerns).toEqual(baseRegexRoutes.concerns)
  })

  it('flags regex resources not found in runtime routes', () => {
    const regexWithWidgets = {
      ...baseRegexRoutes,
      resources: [
        ...baseRegexRoutes.resources,
        {
          name: 'widgets',
          controller: 'widgets',
          actions: ['index', 'show', 'create'],
          namespace: null,
          shallow: false,
          concerns: [],
        },
      ],
    }
    const runtimeRoutes = [
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
        verb: 'GET',
        path: '/posts(.:format)',
        controller: 'posts',
        action: 'index',
        name: 'posts',
        constraints: {},
        engine: null,
      },
      // No widget routes in runtime
    ]
    const merged = mergeRoutes(regexWithWidgets, runtimeRoutes)
    const widgetsResource = merged.resources.find((r) => r.name === 'widgets')
    expect(widgetsResource).toBeDefined()
    expect(widgetsResource.unresolved).toBe(true)
  })

  it('handles null runtime routes gracefully', () => {
    const merged = mergeRoutes(baseRegexRoutes, null)
    expect(merged).toEqual(baseRegexRoutes)
  })
})

describe('mergeExtractions', () => {
  const regexExtractions = {
    models: REGEX_MODELS,
    controllers: REGEX_CONTROLLERS,
    routes: {
      root: { controller: 'home', action: 'index' },
      resources: [
        {
          name: 'users',
          controller: 'users',
          actions: ['index', 'show', 'create', 'update', 'destroy'],
          namespace: null,
          shallow: false,
          concerns: [],
        },
      ],
      standalone_routes: [],
      mounted_engines: [],
      concerns: [],
      drawn_files: [],
      nested_relationships: [],
      devise_routes: [],
    },
    schema: {
      version: '20240101000000',
      extensions: [],
      enums: {},
      tables: [
        {
          name: 'users',
          primary_key: { type: 'bigint', auto: true },
          columns: [{ name: 'id', type: 'integer', constraints: null }],
          indexes: [],
          comment: null,
        },
      ],
      foreign_keys: [],
    },
  }

  const fullIntrospection = {
    available: true,
    models: RUNTIME_MODELS,
    controllers: RUNTIME_CONTROLLERS,
    routes: RUNTIME_ROUTES,
    database: RUNTIME_DATABASE,
    error: null,
    duration_ms: 250,
  }

  it('returns regex extractions unchanged when introspection unavailable', () => {
    const unavailable = {
      available: false,
      models: null,
      controllers: null,
      routes: null,
      database: null,
      error: 'execCommand not available',
      duration_ms: 0,
    }
    const merged = mergeExtractions(regexExtractions, unavailable)
    expect(merged.models).toEqual(REGEX_MODELS)
    expect(merged.controllers).toEqual(REGEX_CONTROLLERS)
    expect(merged._introspection).toBeUndefined()
  })

  it('merges models when introspection models are present', () => {
    const merged = mergeExtractions(regexExtractions, fullIntrospection)
    // Runtime User has 5 associations (including authored_comments)
    expect(merged.models.User.associations.length).toBe(
      RUNTIME_MODELS.User.associations.length,
    )
  })

  it('merges controllers when introspection controllers are present', () => {
    const merged = mergeExtractions(regexExtractions, fullIntrospection)
    // Runtime includes the inherited authenticate_user! callback
    const callbacks = merged.controllers.UsersController.callbacks
    const inheritedCb = callbacks.find(
      (cb) => cb.filter === 'authenticate_user!',
    )
    expect(inheritedCb).toBeDefined()
    expect(inheritedCb.inherited).toBe(true)
  })

  it('adds _introspection metadata with correct counts', () => {
    const merged = mergeExtractions(regexExtractions, fullIntrospection)
    expect(merged._introspection).toBeDefined()
    expect(merged._introspection.available).toBe(true)
    expect(typeof merged._introspection.models_merged).toBe('number')
    expect(merged._introspection.models_merged).toBeGreaterThan(0)
    expect(typeof merged._introspection.routes_introspected).toBe('number')
    expect(merged._introspection.routes_introspected).toBe(
      RUNTIME_ROUTES.length,
    )
  })

  it('handles partial introspection (some domains null)', () => {
    const partialIntrospection = {
      available: true,
      models: RUNTIME_MODELS,
      controllers: null,
      routes: null,
      database: null,
      error: null,
      duration_ms: 120,
    }
    const merged = mergeExtractions(regexExtractions, partialIntrospection)
    // Models should be merged
    expect(merged.models.User.associations.length).toBe(
      RUNTIME_MODELS.User.associations.length,
    )
    // Controllers should remain regex-only (not merged)
    expect(merged.controllers).toEqual(REGEX_CONTROLLERS)
    // Schema should remain regex-only
    expect(merged.schema).toEqual(regexExtractions.schema)
  })
})
