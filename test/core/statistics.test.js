import { describe, it, expect } from 'vitest'
import { computeStatistics } from '../../src/core/indexer.js'

describe('computeStatistics', () => {
  describe('relationships', () => {
    it('counts only model association types, not all graph relationships', () => {
      const manifest = { entries: [], stats: {} }
      const extractions = {
        models: {
          User: {
            type: 'model',
            associations: [
              { type: 'has_many', name: 'posts' },
              { type: 'belongs_to', name: 'company' },
            ],
          },
          Post: {
            type: 'model',
            associations: [{ type: 'belongs_to', name: 'user' }],
          },
        },
        controllers: {},
        helpers: {},
        workers: {},
        uploaders: { uploaders: {}, mounted: [] },
        jobs: { jobs: [] },
        email: { mailers: [] },
        realtime: { channels: [] },
        routes: { resources: [] },
        gemfile: { gems: [] },
      }
      // relationships array from buildGraph includes many edge types
      const relationships = [
        { from: 'User', to: 'Post', type: 'has_many' },
        { from: 'User', to: 'Company', type: 'belongs_to' },
        { from: 'Post', to: 'User', type: 'belongs_to' },
        { from: 'User', to: 'Searchable', type: 'includes_concern' },
        { from: 'PostsController', to: 'Post', type: 'convention_pair' },
        { from: 'routes', to: 'PostsController', type: 'routes_to' },
        { from: 'posts', to: 'users', type: 'schema_fk' },
        { from: 'spec:User', to: 'User', type: 'tests' },
        { from: 'PostsHelper', to: 'PostsController', type: 'helps_view' },
        { from: 'User', to: 'Base', type: 'inherits' },
        { from: 'User', to: 'Company', type: 'delegates_to' },
        { from: 'PostsController', to: 'User', type: 'inherited_dependency' },
        { from: 'Post', to: 'ImageUploader', type: 'manages_upload' },
      ]

      const stats = computeStatistics(manifest, extractions, relationships)
      // Should only count the 3 association relationships (has_many, belongs_to × 2)
      expect(stats.relationships).toBe(3)
    })

    it('counts has_one and has_and_belongs_to_many as associations', () => {
      const manifest = { entries: [], stats: {} }
      const extractions = {
        models: {},
        controllers: {},
        helpers: {},
        workers: {},
        uploaders: { uploaders: {}, mounted: [] },
        jobs: { jobs: [] },
        email: { mailers: [] },
        realtime: { channels: [] },
        routes: { resources: [] },
        gemfile: { gems: [] },
      }
      const relationships = [
        { from: 'User', to: 'Profile', type: 'has_one' },
        { from: 'User', to: 'Role', type: 'has_and_belongs_to_many' },
        { from: 'User', to: 'Post', type: 'has_many' },
        { from: 'Post', to: 'User', type: 'belongs_to' },
        { from: 'routes', to: 'UsersController', type: 'routes_to' },
      ]

      const stats = computeStatistics(manifest, extractions, relationships)
      expect(stats.relationships).toBe(4)
    })

    it('returns 0 relationships when none are associations', () => {
      const manifest = { entries: [], stats: {} }
      const extractions = {
        models: {},
        controllers: {},
        helpers: {},
        workers: {},
        uploaders: { uploaders: {}, mounted: [] },
        jobs: { jobs: [] },
        email: { mailers: [] },
        realtime: { channels: [] },
        routes: { resources: [] },
        gemfile: { gems: [] },
      }
      const relationships = [
        { from: 'User', to: 'Base', type: 'inherits' },
        { from: 'routes', to: 'UsersController', type: 'routes_to' },
        { from: 'posts', to: 'users', type: 'schema_fk' },
      ]

      const stats = computeStatistics(manifest, extractions, relationships)
      expect(stats.relationships).toBe(0)
    })

    it('returns 0 relationships for empty array', () => {
      const manifest = { entries: [], stats: {} }
      const extractions = {
        models: {},
        controllers: {},
        helpers: {},
        workers: {},
        uploaders: { uploaders: {}, mounted: [] },
        jobs: { jobs: [] },
        email: { mailers: [] },
        realtime: { channels: [] },
        routes: { resources: [] },
        gemfile: { gems: [] },
      }

      const stats = computeStatistics(manifest, extractions, [])
      expect(stats.relationships).toBe(0)
    })
  })

  describe('jobs', () => {
    it('excludes ApplicationJob from job count', () => {
      const manifest = { entries: [], stats: {} }
      const extractions = {
        models: {},
        controllers: {},
        helpers: {},
        workers: {},
        uploaders: { uploaders: {}, mounted: [] },
        jobs: {
          jobs: [
            {
              class: 'ApplicationJob',
              file: 'app/jobs/application_job.rb',
              superclass: 'ActiveJob::Base',
            },
            {
              class: 'DataCleanupJob',
              file: 'app/jobs/data_cleanup_job.rb',
              superclass: 'ApplicationJob',
            },
            {
              class: 'NotifyJob',
              file: 'app/jobs/notify_job.rb',
              superclass: 'ApplicationJob',
            },
          ],
        },
        email: { mailers: [] },
        realtime: { channels: [] },
        routes: { resources: [] },
        gemfile: { gems: [] },
      }

      const stats = computeStatistics(manifest, extractions, [])
      expect(stats.jobs).toBe(2)
    })

    it('excludes sidekiq_worker type from job count', () => {
      const manifest = { entries: [], stats: {} }
      const extractions = {
        models: {},
        controllers: {},
        helpers: {},
        workers: { HardWorker: { class: 'HardWorker' } },
        uploaders: { uploaders: {}, mounted: [] },
        jobs: {
          jobs: [
            {
              class: 'DataCleanupJob',
              file: 'app/jobs/data_cleanup_job.rb',
              superclass: 'ApplicationJob',
            },
            {
              class: 'HardWorker',
              file: 'app/workers/hard_worker.rb',
              type: 'sidekiq_worker',
            },
          ],
        },
        email: { mailers: [] },
        realtime: { channels: [] },
        routes: { resources: [] },
        gemfile: { gems: [] },
      }

      const stats = computeStatistics(manifest, extractions, [])
      expect(stats.jobs).toBe(1)
    })

    it('returns 0 jobs when only ApplicationJob exists', () => {
      const manifest = { entries: [], stats: {} }
      const extractions = {
        models: {},
        controllers: {},
        helpers: {},
        workers: {},
        uploaders: { uploaders: {}, mounted: [] },
        jobs: {
          jobs: [
            {
              class: 'ApplicationJob',
              file: 'app/jobs/application_job.rb',
              superclass: 'ActiveJob::Base',
            },
          ],
        },
        email: { mailers: [] },
        realtime: { channels: [] },
        routes: { resources: [] },
        gemfile: { gems: [] },
      }

      const stats = computeStatistics(manifest, extractions, [])
      expect(stats.jobs).toBe(0)
    })
  })

  describe('mailers', () => {
    it('excludes ApplicationMailer from mailer count', () => {
      const manifest = { entries: [], stats: {} }
      const extractions = {
        models: {},
        controllers: {},
        helpers: {},
        workers: {},
        uploaders: { uploaders: {}, mounted: [] },
        jobs: { jobs: [] },
        email: {
          mailers: [
            {
              class: 'ApplicationMailer',
              file: 'app/mailers/application_mailer.rb',
              superclass: 'ActionMailer::Base',
            },
            {
              class: 'MemberMailer',
              file: 'app/mailers/member_mailer.rb',
              superclass: 'ApplicationMailer',
            },
          ],
        },
        realtime: { channels: [] },
        routes: { resources: [] },
        gemfile: { gems: [] },
      }

      const stats = computeStatistics(manifest, extractions, [])
      expect(stats.mailers).toBe(1)
    })

    it('returns 0 mailers when only ApplicationMailer exists', () => {
      const manifest = { entries: [], stats: {} }
      const extractions = {
        models: {},
        controllers: {},
        helpers: {},
        workers: {},
        uploaders: { uploaders: {}, mounted: [] },
        jobs: { jobs: [] },
        email: {
          mailers: [
            {
              class: 'ApplicationMailer',
              file: 'app/mailers/application_mailer.rb',
              superclass: 'ActionMailer::Base',
            },
          ],
        },
        realtime: { channels: [] },
        routes: { resources: [] },
        gemfile: { gems: [] },
      }

      const stats = computeStatistics(manifest, extractions, [])
      expect(stats.mailers).toBe(0)
    })
  })

  describe('controllers', () => {
    it('excludes controller concerns from controller count', () => {
      const manifest = { entries: [], stats: {} }
      const extractions = {
        models: {},
        controllers: {
          PostsController: {
            class: 'PostsController',
            file: 'app/controllers/posts_controller.rb',
          },
          UsersController: {
            class: 'UsersController',
            file: 'app/controllers/users_controller.rb',
          },
          Searchable: {
            class: 'Searchable',
            file: 'app/controllers/concerns/searchable.rb',
          },
        },
        helpers: {},
        workers: {},
        uploaders: { uploaders: {}, mounted: [] },
        jobs: { jobs: [] },
        email: { mailers: [] },
        realtime: { channels: [] },
        routes: { resources: [] },
        gemfile: { gems: [] },
      }

      const stats = computeStatistics(manifest, extractions, [])
      expect(stats.controllers).toBe(2)
    })

    it('counts all controllers when no concerns present', () => {
      const manifest = { entries: [], stats: {} }
      const extractions = {
        models: {},
        controllers: {
          PostsController: {
            class: 'PostsController',
            file: 'app/controllers/posts_controller.rb',
          },
          UsersController: {
            class: 'UsersController',
            file: 'app/controllers/users_controller.rb',
          },
        },
        helpers: {},
        workers: {},
        uploaders: { uploaders: {}, mounted: [] },
        jobs: { jobs: [] },
        email: { mailers: [] },
        realtime: { channels: [] },
        routes: { resources: [] },
        gemfile: { gems: [] },
      }

      const stats = computeStatistics(manifest, extractions, [])
      expect(stats.controllers).toBe(2)
    })
  })

  describe('route_resources', () => {
    it('excludes namespace entries from count', () => {
      const manifest = { entries: [], stats: {} }
      const extractions = {
        models: {},
        controllers: {},
        helpers: {},
        workers: {},
        uploaders: { uploaders: {}, mounted: [] },
        jobs: { jobs: [] },
        email: { mailers: [] },
        realtime: { channels: [] },
        routes: {
          resources: [
            { name: 'projects', type: 'resources', namespace: null, actions: [], member_routes: [], collection_routes: [], nested: [] },
            { name: 'users', type: 'resources', namespace: null, actions: [], member_routes: [], collection_routes: [], nested: [] },
            { name: 'admin', type: 'namespace', namespace: null, actions: [], member_routes: [], collection_routes: [], nested: [] },
            { name: 'api', type: 'namespace', namespace: null, actions: [], member_routes: [], collection_routes: [], nested: [] },
            { name: 'profile', type: 'resource', namespace: null, actions: [], member_routes: [], collection_routes: [], nested: [] },
          ],
        },
        gemfile: { gems: [] },
      }

      const stats = computeStatistics(manifest, extractions, [])
      expect(stats.route_resources).toBe(3) // only resources + resource, not namespaces
    })
  })

  describe('models', () => {
    it('excludes module-only files from model count', () => {
      const manifest = { entries: [], stats: {} }
      const extractions = {
        models: {
          User: { type: 'model', class: 'User' },
          Post: { type: 'model', class: 'Post' },
          Talend: { type: 'module', class: 'Talend' },
          Sluggable: { type: 'concern', class: 'Sluggable' },
        },
        controllers: {},
        helpers: {},
        workers: {},
        uploaders: { uploaders: {}, mounted: [] },
        jobs: { jobs: [] },
        email: { mailers: [] },
        realtime: { channels: [] },
        routes: { resources: [] },
        gemfile: { gems: [] },
      }

      const stats = computeStatistics(manifest, extractions, [])
      expect(stats.models).toBe(2)
    })
  })
})
