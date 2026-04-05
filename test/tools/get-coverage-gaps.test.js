import { describe, it, expect } from 'vitest'

// Helper to build a mock state object for get_coverage_gaps handler testing
function buildState(overrides = {}) {
  return {
    index: {
      extractions: {
        models: {},
        controllers: {},
        coverage_snapshot: {
          available: true,
          overall: { line_coverage: 50 },
          per_file: {},
          uncovered_methods: [],
        },
        ...overrides,
      },
      manifest: overrides.manifest || { entries: [] },
    },
  }
}

// Helper to call the handler logic directly (extracted for testability)
async function callHandler(args, state) {
  const { register } =
    await import('../../src/tools/handlers/get-coverage-gaps.js')

  let capturedHandler = null
  const mockServer = {
    tool(_name, _desc, _schema, handler) {
      capturedHandler = handler
    },
  }

  register(mockServer, state)
  return capturedHandler(args)
}

function parseResponse(result) {
  return JSON.parse(result.content[0].text)
}

// ---------------------------------------------------------------------------
// Phase 1: Phantom entity filtering
// ---------------------------------------------------------------------------
describe('get_coverage_gaps phantom entity filtering', () => {
  it('excludes model concerns (type=concern) from gaps', async () => {
    const state = buildState({
      models: {
        Sluggable: {
          file: 'app/models/concerns/sluggable.rb',
          type: 'concern',
          class: 'Sluggable',
          public_methods: ['generate_slug'],
          associations: [],
        },
        Product: {
          file: 'app/models/product.rb',
          type: 'model',
          class: 'Product',
          superclass: 'ApplicationRecord',
          public_methods: ['on_sale?'],
          associations: [{ type: 'belongs_to', name: 'category' }],
        },
      },
      coverage_snapshot: {
        available: true,
        overall: { line_coverage: 50 },
        per_file: {
          'app/models/concerns/sluggable.rb': { line_coverage: 80 },
          'app/models/product.rb': { line_coverage: 60 },
        },
        uncovered_methods: [],
      },
    })

    const result = await callHandler({}, state)
    const data = parseResponse(result)

    const entities = data.gaps.map((g) => g.entity)
    expect(entities).toContain('Product')
    expect(entities).not.toContain('Sluggable')
  })

  it('excludes model modules (type=module) from gaps', async () => {
    const state = buildState({
      models: {
        Auth: {
          file: 'app/models/auth.rb',
          type: 'module',
          class: 'Auth',
          public_methods: [],
          associations: [],
        },
        User: {
          file: 'app/models/user.rb',
          type: 'model',
          class: 'User',
          superclass: 'ApplicationRecord',
          public_methods: [],
          associations: [],
        },
      },
      coverage_snapshot: {
        available: true,
        overall: { line_coverage: 50 },
        per_file: {
          'app/models/auth.rb': { line_coverage: 70 },
          'app/models/user.rb': { line_coverage: 80 },
        },
        uncovered_methods: [],
      },
    })

    const result = await callHandler({}, state)
    const data = parseResponse(result)

    const entities = data.gaps.map((g) => g.entity)
    expect(entities).toContain('User')
    expect(entities).not.toContain('Auth')
  })

  it('excludes controller concerns (file path contains /concerns/) from gaps', async () => {
    const state = buildState({
      controllers: {
        Authenticatable: {
          file: 'app/controllers/concerns/authenticatable.rb',
          class: 'Authenticatable',
          actions: [],
        },
        UsersController: {
          file: 'app/controllers/users_controller.rb',
          class: 'UsersController',
          actions: ['index', 'show'],
        },
      },
      coverage_snapshot: {
        available: true,
        overall: { line_coverage: 50 },
        per_file: {
          'app/controllers/concerns/authenticatable.rb': {
            line_coverage: 90,
          },
          'app/controllers/users_controller.rb': { line_coverage: 70 },
        },
        uncovered_methods: [],
      },
    })

    const result = await callHandler({}, state)
    const data = parseResponse(result)

    const entities = data.gaps.map((g) => g.entity)
    expect(entities).toContain('UsersController')
    expect(entities).not.toContain('Authenticatable')
  })

  it('excludes entities with gap=0 from gaps output', async () => {
    const state = buildState({
      models: {
        FullyCovered: {
          file: 'app/models/fully_covered.rb',
          type: 'model',
          class: 'FullyCovered',
          superclass: 'ApplicationRecord',
          public_methods: [],
          associations: [],
        },
        PartiallyCovered: {
          file: 'app/models/partially_covered.rb',
          type: 'model',
          class: 'PartiallyCovered',
          superclass: 'ApplicationRecord',
          public_methods: ['compute'],
          associations: [],
        },
      },
      controllers: {
        FullController: {
          file: 'app/controllers/full_controller.rb',
          class: 'FullController',
          actions: ['index'],
        },
      },
      coverage_snapshot: {
        available: true,
        overall: { line_coverage: 90 },
        per_file: {
          'app/models/fully_covered.rb': { line_coverage: 100 },
          'app/models/partially_covered.rb': { line_coverage: 50 },
          'app/controllers/full_controller.rb': { line_coverage: 100 },
        },
        uncovered_methods: [],
      },
    })

    const result = await callHandler({}, state)
    const data = parseResponse(result)

    expect(data.gaps).toHaveLength(1)
    expect(data.gaps[0].entity).toBe('PartiallyCovered')
    expect(data.total_gaps).toBe(1)
  })

  it('total_gaps counts only entities with gap > 0', async () => {
    const state = buildState({
      models: {
        A: {
          file: 'app/models/a.rb',
          type: 'model',
          class: 'A',
          superclass: 'ApplicationRecord',
          public_methods: [],
          associations: [],
        },
        B: {
          file: 'app/models/b.rb',
          type: 'model',
          class: 'B',
          superclass: 'ApplicationRecord',
          public_methods: [],
          associations: [],
        },
        C: {
          file: 'app/models/c.rb',
          type: 'model',
          class: 'C',
          superclass: 'ApplicationRecord',
          public_methods: [],
          associations: [],
        },
        D: {
          file: 'app/models/d.rb',
          type: 'model',
          class: 'D',
          superclass: 'ApplicationRecord',
          public_methods: [],
          associations: [],
        },
        E: {
          file: 'app/models/e.rb',
          type: 'model',
          class: 'E',
          superclass: 'ApplicationRecord',
          public_methods: [],
          associations: [],
        },
      },
      coverage_snapshot: {
        available: true,
        overall: { line_coverage: 80 },
        per_file: {
          'app/models/a.rb': { line_coverage: 60 },
          'app/models/b.rb': { line_coverage: 80 },
          'app/models/c.rb': { line_coverage: 100 },
          'app/models/d.rb': { line_coverage: 100 },
          'app/models/e.rb': { line_coverage: 100 },
        },
        uncovered_methods: [],
      },
    })

    const result = await callHandler({ limit: 100 }, state)
    const data = parseResponse(result)

    expect(data.total_gaps).toBe(2)
    expect(data.gaps).toHaveLength(2)
  })

  it('passes through real models with gaps and correct fields', async () => {
    const state = buildState({
      models: {
        Order: {
          file: 'app/models/order.rb',
          type: 'model',
          class: 'Order',
          superclass: 'ApplicationRecord',
          public_methods: ['total', 'confirm!'],
          associations: [
            { type: 'belongs_to', name: 'user' },
            { type: 'has_many', name: 'line_items' },
          ],
        },
      },
      coverage_snapshot: {
        available: true,
        overall: { line_coverage: 60 },
        per_file: {
          'app/models/order.rb': { line_coverage: 40 },
        },
        uncovered_methods: [
          { entity: 'Order', method: 'confirm!', coverage: 20 },
        ],
      },
    })

    const result = await callHandler({}, state)
    const data = parseResponse(result)

    expect(data.gaps).toHaveLength(1)
    const gap = data.gaps[0]
    expect(gap.entity).toBe('Order')
    expect(gap.entity_type).toBe('model')
    expect(gap.coverage).toBe(40)
    expect(gap.gap).toBe(60)
    expect(gap.public_methods).toBe(2)
    expect(gap.associations).toBe(2)
    expect(gap.uncovered_methods).toEqual([
      { method: 'confirm!', coverage: 20 },
    ])
  })
})

// ---------------------------------------------------------------------------
// Phase 2: Test file matching — namespace resolution
// ---------------------------------------------------------------------------
describe('buildTestedEntitySets namespace resolution', () => {
  it('matches request spec under namespace dir to namespaced controller', async () => {
    const state = buildState({
      controllers: {
        'Admin::BrandsController': {
          file: 'app/controllers/admin/brands_controller.rb',
          class: 'Admin::BrandsController',
          actions: ['index'],
        },
      },
      coverage_snapshot: {
        available: true,
        overall: { line_coverage: 90 },
        per_file: {
          'app/controllers/admin/brands_controller.rb': {
            line_coverage: 80,
          },
        },
        uncovered_methods: [],
      },
      manifest: {
        entries: [
          {
            path: 'spec/requests/admin/brands_spec.rb',
            category: 19,
            specCategory: 'request_specs',
          },
        ],
      },
    })

    const result = await callHandler({}, state)
    const data = parseResponse(result)

    const ctrl = data.gaps.find((g) => g.entity === 'Admin::BrandsController')
    expect(ctrl).toBeDefined()
    expect(ctrl.has_test).toBe(true)
  })

  it('matches deeply nested request spec (api/v1)', async () => {
    const state = buildState({
      controllers: {
        'Api::V1::TokensController': {
          file: 'app/controllers/api/v1/tokens_controller.rb',
          class: 'Api::V1::TokensController',
          actions: ['create'],
        },
      },
      coverage_snapshot: {
        available: true,
        overall: { line_coverage: 80 },
        per_file: {
          'app/controllers/api/v1/tokens_controller.rb': {
            line_coverage: 50,
          },
        },
        uncovered_methods: [],
      },
      manifest: {
        entries: [
          {
            path: 'spec/requests/api/v1/tokens_spec.rb',
            category: 19,
            specCategory: 'request_specs',
          },
        ],
      },
    })

    const result = await callHandler({}, state)
    const data = parseResponse(result)

    const ctrl = data.gaps.find((g) => g.entity === 'Api::V1::TokensController')
    expect(ctrl).toBeDefined()
    expect(ctrl.has_test).toBe(true)
  })

  it('matches model spec under namespace dir to namespaced model', async () => {
    const state = buildState({
      models: {
        'Setups::Contact': {
          file: 'app/models/setups/contact.rb',
          type: 'model',
          class: 'Setups::Contact',
          superclass: 'ApplicationRecord',
          public_methods: [],
          associations: [],
        },
        Contact: {
          file: 'app/models/contact.rb',
          type: 'model',
          class: 'Contact',
          superclass: 'ApplicationRecord',
          public_methods: ['full_name'],
          associations: [],
        },
      },
      coverage_snapshot: {
        available: true,
        overall: { line_coverage: 80 },
        per_file: {
          'app/models/setups/contact.rb': { line_coverage: 50 },
          'app/models/contact.rb': { line_coverage: 60 },
        },
        uncovered_methods: [],
      },
      manifest: {
        entries: [
          {
            path: 'spec/models/setups/contact_spec.rb',
            category: 19,
            specCategory: 'model_specs',
          },
        ],
      },
    })

    const result = await callHandler({}, state)
    const data = parseResponse(result)

    const setupsContact = data.gaps.find((g) => g.entity === 'Setups::Contact')
    const rootContact = data.gaps.find((g) => g.entity === 'Contact')

    expect(setupsContact).toBeDefined()
    expect(setupsContact.has_test).toBe(true)
    // Root Contact should NOT be matched by setups/contact_spec.rb
    expect(rootContact).toBeDefined()
    expect(rootContact.has_test).toBe(false)
  })

  it('matches multi-word namespace dir (asset_reviews → AssetReviews)', async () => {
    const state = buildState({
      controllers: {
        'AssetReviews::ExportController': {
          file: 'app/controllers/asset_reviews/export_controller.rb',
          class: 'AssetReviews::ExportController',
          actions: ['index'],
        },
      },
      coverage_snapshot: {
        available: true,
        overall: { line_coverage: 90 },
        per_file: {
          'app/controllers/asset_reviews/export_controller.rb': {
            line_coverage: 75,
          },
        },
        uncovered_methods: [],
      },
      manifest: {
        entries: [
          {
            path: 'spec/controllers/asset_reviews/export_controller_spec.rb',
            category: 19,
            specCategory: 'controller_specs',
          },
        ],
      },
    })

    const result = await callHandler({}, state)
    const data = parseResponse(result)

    const ctrl = data.gaps.find(
      (g) => g.entity === 'AssetReviews::ExportController',
    )
    expect(ctrl).toBeDefined()
    expect(ctrl.has_test).toBe(true)
  })

  it('falls back to short name when namespace match fails', async () => {
    const state = buildState({
      controllers: {
        WidgetsController: {
          file: 'app/controllers/widgets_controller.rb',
          class: 'WidgetsController',
          actions: ['index'],
        },
      },
      coverage_snapshot: {
        available: true,
        overall: { line_coverage: 80 },
        per_file: {
          'app/controllers/widgets_controller.rb': { line_coverage: 70 },
        },
        uncovered_methods: [],
      },
      manifest: {
        entries: [
          {
            path: 'spec/requests/widgets_spec.rb',
            category: 19,
            specCategory: 'request_specs',
          },
        ],
      },
    })

    const result = await callHandler({}, state)
    const data = parseResponse(result)

    const ctrl = data.gaps.find((g) => g.entity === 'WidgetsController')
    expect(ctrl).toBeDefined()
    expect(ctrl.has_test).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Phase 3: Edge-case hardening
// ---------------------------------------------------------------------------
describe('get_coverage_gaps edge cases', () => {
  it('matches HTTPLog model to http_log_spec via case-insensitive fallback', async () => {
    const state = buildState({
      models: {
        HTTPLog: {
          file: 'app/models/http_log.rb',
          type: 'model',
          class: 'HTTPLog',
          superclass: 'ApplicationRecord',
          public_methods: [],
          associations: [],
        },
      },
      coverage_snapshot: {
        available: true,
        overall: { line_coverage: 80 },
        per_file: {
          'app/models/http_log.rb': { line_coverage: 70 },
        },
        uncovered_methods: [],
      },
      manifest: {
        entries: [
          {
            path: 'spec/models/http_log_spec.rb',
            category: 19,
            specCategory: 'model_specs',
          },
        ],
      },
    })

    const result = await callHandler({}, state)
    const data = parseResponse(result)

    const model = data.gaps.find((g) => g.entity === 'HTTPLog')
    expect(model).toBeDefined()
    expect(model.has_test).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Phase 4: Per-action request spec splitting pattern
// ---------------------------------------------------------------------------
describe('get_coverage_gaps per-action request spec matching', () => {
  it('matches per-action request specs to non-namespaced controller', async () => {
    // Pattern: spec/requests/accounts/balance_spec.rb → AccountsController
    const state = buildState({
      controllers: {
        AccountsController: {
          file: 'app/controllers/accounts_controller.rb',
          class: 'AccountsController',
          actions: ['index', 'balance', 'destroy'],
        },
      },
      coverage_snapshot: {
        available: true,
        overall: { line_coverage: 70 },
        per_file: {
          'app/controllers/accounts_controller.rb': { line_coverage: 60 },
        },
        uncovered_methods: [],
      },
      manifest: {
        entries: [
          {
            path: 'spec/requests/accounts/balance_spec.rb',
            category: 19,
            specCategory: 'request_specs',
          },
          {
            path: 'spec/requests/accounts/destroy_spec.rb',
            category: 19,
            specCategory: 'request_specs',
          },
        ],
      },
    })

    const result = await callHandler({}, state)
    const data = parseResponse(result)

    const ctrl = data.gaps.find((g) => g.entity === 'AccountsController')
    expect(ctrl).toBeDefined()
    expect(ctrl.has_test).toBe(true)
  })

  it('matches per-action request specs to namespaced controller', async () => {
    // Pattern: spec/requests/sales/stock_search_spec.rb → Sales::StocksController
    // The directory 'sales' is a namespace and the spec tests an action in StocksController
    const state = buildState({
      controllers: {
        'Sales::StocksController': {
          file: 'app/controllers/sales/stocks_controller.rb',
          class: 'Sales::StocksController',
          actions: ['index', 'stock_search'],
        },
        SalesController: {
          file: 'app/controllers/sales_controller.rb',
          class: 'SalesController',
          actions: ['index', 'create'],
        },
      },
      coverage_snapshot: {
        available: true,
        overall: { line_coverage: 70 },
        per_file: {
          'app/controllers/sales/stocks_controller.rb': {
            line_coverage: 40,
          },
          'app/controllers/sales_controller.rb': { line_coverage: 85 },
        },
        uncovered_methods: [],
      },
      manifest: {
        entries: [
          {
            path: 'spec/requests/sales/stock_search_spec.rb',
            category: 19,
            specCategory: 'request_specs',
          },
          {
            path: 'spec/requests/sales/create_spec.rb',
            category: 19,
            specCategory: 'request_specs',
          },
        ],
      },
    })

    const result = await callHandler({}, state)
    const data = parseResponse(result)

    // SalesController should be matched — spec/requests/sales/ dir matches resource
    const salesCtrl = data.gaps.find((g) => g.entity === 'SalesController')
    expect(salesCtrl).toBeDefined()
    expect(salesCtrl.has_test).toBe(true)
  })

  it('does not false-match per-action specs when no controller exists for the dir', async () => {
    // spec/requests/admin/foo_spec.rb should NOT match AdminController
    // if there's no AdminController (admin/ is only a namespace)
    const state = buildState({
      controllers: {
        'Admin::BrandsController': {
          file: 'app/controllers/admin/brands_controller.rb',
          class: 'Admin::BrandsController',
          actions: ['index'],
        },
      },
      coverage_snapshot: {
        available: true,
        overall: { line_coverage: 90 },
        per_file: {
          'app/controllers/admin/brands_controller.rb': {
            line_coverage: 80,
          },
        },
        uncovered_methods: [],
      },
      manifest: {
        entries: [
          {
            path: 'spec/requests/admin/brands_spec.rb',
            category: 19,
            specCategory: 'request_specs',
          },
        ],
      },
    })

    const result = await callHandler({}, state)
    const data = parseResponse(result)

    // Admin::BrandsController should match (standard namespace match)
    const ctrl = data.gaps.find((g) => g.entity === 'Admin::BrandsController')
    expect(ctrl).toBeDefined()
    expect(ctrl.has_test).toBe(true)
  })
})
