import { describe, it, expect } from 'vitest'
import { extractTier3 } from '../../src/extractors/tier3.js'

function mockProvider(files) {
  return {
    readFile(path) {
      return files[path] || null
    },
  }
}

const emptyProvider = mockProvider({})

describe('Tier 3 Extractor', () => {
  describe('feature flags (#41)', () => {
    it('detects flipper', () => {
      const r = extractTier3(emptyProvider, [], { gems: { flipper: {} } })
      expect(r.feature_flags.gem).toBe('flipper')
    })

    it('detects unleash', () => {
      const r = extractTier3(emptyProvider, [], { gems: { unleash: {} } })
      expect(r.feature_flags.gem).toBe('unleash')
    })

    it('returns null when absent', () => {
      const r = extractTier3(emptyProvider, [], { gems: {} })
      expect(r.feature_flags).toBeNull()
    })
  })

  describe('audit (#42)', () => {
    it('detects paper_trail', () => {
      const r = extractTier3(emptyProvider, [], { gems: { paper_trail: {} } })
      expect(r.audit.gem).toBe('paper_trail')
    })

    it('detects audited', () => {
      const r = extractTier3(emptyProvider, [], { gems: { audited: {} } })
      expect(r.audit.gem).toBe('audited')
    })

    it('detects logidze', () => {
      const r = extractTier3(emptyProvider, [], { gems: { logidze: {} } })
      expect(r.audit.gem).toBe('logidze')
    })
  })

  describe('soft delete (#43)', () => {
    it('detects discard', () => {
      const r = extractTier3(emptyProvider, [], { gems: { discard: {} } })
      expect(r.soft_delete.gem).toBe('discard')
    })

    it('detects paranoia', () => {
      const r = extractTier3(emptyProvider, [], { gems: { paranoia: {} } })
      expect(r.soft_delete.gem).toBe('paranoia')
    })
  })

  describe('pagination (#44)', () => {
    it('detects pagy', () => {
      const r = extractTier3(emptyProvider, [], { gems: { pagy: {} } })
      expect(r.pagination.gem).toBe('pagy')
    })

    it('detects kaminari', () => {
      const r = extractTier3(emptyProvider, [], { gems: { kaminari: {} } })
      expect(r.pagination.gem).toBe('kaminari')
    })

    it('detects will_paginate', () => {
      const r = extractTier3(emptyProvider, [], { gems: { will_paginate: {} } })
      expect(r.pagination.gem).toBe('will_paginate')
    })
  })

  describe('friendly urls (#45)', () => {
    it('detects friendly_id', () => {
      const r = extractTier3(emptyProvider, [], { gems: { friendly_id: {} } })
      expect(r.friendly_urls.gem).toBe('friendly_id')
    })
  })

  describe('tagging (#46)', () => {
    it('detects acts-as-taggable-on', () => {
      const r = extractTier3(emptyProvider, [], {
        gems: { 'acts-as-taggable-on': {} },
      })
      expect(r.tagging.gem).toBe('acts-as-taggable-on')
    })
  })

  describe('seo (#47)', () => {
    it('detects meta-tags and sitemap_generator', () => {
      const r = extractTier3(emptyProvider, [], {
        gems: { 'meta-tags': {}, sitemap_generator: {} },
      })
      expect(r.seo.gems).toContain('meta-tags')
      expect(r.seo.gems).toContain('sitemap_generator')
    })
  })

  describe('geolocation (#48)', () => {
    it('detects geocoder', () => {
      const r = extractTier3(emptyProvider, [], { gems: { geocoder: {} } })
      expect(r.geolocation.gem).toBe('geocoder')
    })

    it('detects rgeo', () => {
      const r = extractTier3(emptyProvider, [], { gems: { rgeo: {} } })
      expect(r.geolocation.gem).toBe('rgeo')
    })
  })

  describe('sms/push (#49)', () => {
    it('detects twilio-ruby and web-push', () => {
      const r = extractTier3(emptyProvider, [], {
        gems: { 'twilio-ruby': {}, 'web-push': {} },
      })
      expect(r.sms_push.gems).toContain('twilio-ruby')
      expect(r.sms_push.gems).toContain('web-push')
    })
  })

  describe('activity tracking (#50)', () => {
    it('detects public_activity', () => {
      const r = extractTier3(emptyProvider, [], {
        gems: { public_activity: {} },
      })
      expect(r.activity_tracking.gem).toBe('public_activity')
    })
  })

  describe('data import/export (#51)', () => {
    it('detects import service', () => {
      const entries = [
        { path: 'app/services/csv_import_service.rb', category: 'service' },
      ]
      const r = extractTier3(emptyProvider, entries, { gems: {} })
      expect(r.data_import_export.detected).toBe(true)
    })

    it('detects export job', () => {
      const entries = [{ path: 'app/jobs/data_export_job.rb', category: 'job' }]
      const r = extractTier3(emptyProvider, entries, { gems: {} })
      expect(r.data_import_export.detected).toBe(true)
    })

    it('returns false when absent', () => {
      const r = extractTier3(emptyProvider, [], { gems: {} })
      expect(r.data_import_export.detected).toBe(false)
    })
  })

  describe('event sourcing (#52)', () => {
    it('detects rails_event_store', () => {
      const r = extractTier3(emptyProvider, [], {
        gems: { rails_event_store: {} },
      })
      expect(r.event_sourcing.gem).toBe('rails_event_store')
    })

    it('detects sequent', () => {
      const r = extractTier3(emptyProvider, [], { gems: { sequent: {} } })
      expect(r.event_sourcing.gem).toBe('sequent')
    })
  })

  describe('dry-rb (#53)', () => {
    it('detects multiple dry gems', () => {
      const r = extractTier3(emptyProvider, [], {
        gems: { 'dry-monads': {}, 'dry-validation': {}, 'dry-types': {} },
      })
      expect(r.dry_rb.gems).toContain('dry-monads')
      expect(r.dry_rb.gems).toContain('dry-validation')
      expect(r.dry_rb.gems).toContain('dry-types')
    })
  })

  describe('markdown (#54)', () => {
    it('detects redcarpet', () => {
      const r = extractTier3(emptyProvider, [], { gems: { redcarpet: {} } })
      expect(r.markdown.gem).toBe('redcarpet')
    })

    it('detects kramdown', () => {
      const r = extractTier3(emptyProvider, [], { gems: { kramdown: {} } })
      expect(r.markdown.gem).toBe('kramdown')
    })
  })

  describe('rate limiting (#55)', () => {
    it('detects rack-attack', () => {
      const r = extractTier3(emptyProvider, [], { gems: { 'rack-attack': {} } })
      expect(r.rate_limiting.gem).toBe('rack-attack')
    })
  })

  describe('graphql (#56)', () => {
    it('detects graphql with schema', () => {
      const entries = [
        { path: 'app/graphql/my_schema.rb', category: 'graphql' },
      ]
      const r = extractTier3(emptyProvider, entries, { gems: { graphql: {} } })
      expect(r.graphql.gem).toBe('graphql')
      expect(r.graphql.schema).toBe(true)
    })

    it('returns null without gem', () => {
      const r = extractTier3(emptyProvider, [], { gems: {} })
      expect(r.graphql).toBeNull()
    })
  })

  describe('empty project', () => {
    it('returns null for all gem-based categories', () => {
      const r = extractTier3(emptyProvider, [], { gems: {} })
      expect(r.feature_flags).toBeNull()
      expect(r.audit).toBeNull()
      expect(r.soft_delete).toBeNull()
      expect(r.pagination).toBeNull()
      expect(r.friendly_urls).toBeNull()
      expect(r.tagging).toBeNull()
      expect(r.seo).toBeNull()
      expect(r.geolocation).toBeNull()
      expect(r.sms_push).toBeNull()
      expect(r.activity_tracking).toBeNull()
      expect(r.event_sourcing).toBeNull()
      expect(r.dry_rb).toBeNull()
      expect(r.markdown).toBeNull()
      expect(r.rate_limiting).toBeNull()
      expect(r.graphql).toBeNull()
    })
  })
})
