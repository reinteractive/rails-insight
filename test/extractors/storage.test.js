import { describe, it, expect } from 'vitest'
import { extractStorage } from '../../src/extractors/storage.js'

function mockProvider(files) {
  return {
    readFile(path) {
      return files[path] || null
    },
  }
}

describe('Storage Extractor', () => {
  describe('full storage config', () => {
    const files = {
      'config/storage.yml': `
local:
  service: Disk
  root: storage

amazon:
  service: S3
  bucket: myapp-production

mirror:
  service: Mirror
  primary: amazon
  mirrors:
    - local`,
      'app/models/user.rb': `
class User < ApplicationRecord
  has_one_attached :avatar
  has_many_attached :documents

  def thumb
    avatar.variant(resize_to_fill: [100, 100])
  end
end`,
      'app/models/project.rb': `
class Project < ApplicationRecord
  has_many_attached :files
end`,
      'config/application.rb': `
module MyApp
  class Application < Rails::Application
    config.active_storage.variant_processor = :vips
  end
end`,
    }

    const entries = [
      { path: 'app/models/user.rb', category: 'model' },
      { path: 'app/models/project.rb', category: 'model' },
    ]

    const gemInfo = { gems: { image_processing: { version: '1.12' } } }
    const provider = mockProvider(files)
    const result = extractStorage(provider, entries, gemInfo)

    it('extracts storage services', () => {
      expect(result.services.local).toBeDefined()
      expect(result.services.local.service).toBe('Disk')
    })

    it('extracts S3 service', () => {
      expect(result.services.amazon.service).toBe('S3')
    })

    it('detects mirror service', () => {
      expect(result.services.mirror).toBeDefined()
      expect(result.services.mirror.service).toBe('Mirror')
    })

    it('extracts has_one_attached', () => {
      const avatar = result.attachments.find((a) => a.name === 'avatar')
      expect(avatar).toBeDefined()
      expect(avatar.model).toBe('User')
      expect(avatar.type).toBe('has_one_attached')
    })

    it('extracts has_many_attached', () => {
      const docs = result.attachments.find((a) => a.name === 'documents')
      expect(docs).toBeDefined()
      expect(docs.type).toBe('has_many_attached')
    })

    it('counts attachments across models', () => {
      expect(result.attachments).toHaveLength(3)
    })

    it('detects variants', () => {
      expect(result.variants_detected).toBeGreaterThanOrEqual(1)
    })

    it('detects image processing with vips backend', () => {
      expect(result.image_processing).toBeDefined()
      expect(result.image_processing.backend).toBe('vips')
    })
  })

  describe('no storage', () => {
    it('returns empty result', () => {
      const provider = mockProvider({})
      const result = extractStorage(provider, [], {})
      expect(result.services).toEqual({})
      expect(result.attachments).toEqual([])
      expect(result.image_processing).toBeNull()
    })
  })

  describe('ISSUE-08: commented-out storage configuration', () => {
    it('ignores commented-out services in storage.yml', () => {
      const provider = mockProvider({
        'config/storage.yml': `
# amazon:
#   service: S3
#   bucket: myapp-production
local:
  service: Disk
  root: storage`,
      })
      const result = extractStorage(provider, [], {})
      expect(result.services.amazon).toBeUndefined()
      expect(result.services.local).toBeDefined()
      expect(result.services.local.service).toBe('Disk')
    })
  })

  describe('ISSUE-15: numeric category for model entries', () => {
    it('detects has_one_attached in models with numeric category', () => {
      const provider = mockProvider({
        'app/models/user.rb': `
class User < ApplicationRecord
  has_one_attached :avatar
  has_many_attached :documents
end`,
      })
      const entries = [
        { path: 'app/models/user.rb', category: 1 },
      ]
      const result = extractStorage(provider, entries, {})
      expect(result.attachments.find((a) => a.name === 'avatar')).toBeDefined()
      expect(
        result.attachments.find((a) => a.name === 'documents'),
      ).toBeDefined()
    })
  })

  describe('ISSUE-F: Paperclip image processing', () => {
    it('detects Paperclip as image processing library', () => {
      const result = extractStorage(mockProvider({}), [], {
        gems: { paperclip: {} },
      })
      expect(result.image_processing).toBeDefined()
      expect(result.image_processing.gem).toBe('paperclip')
    })

    it('detects mini_magick backend when both paperclip and mini_magick gems present', () => {
      const result = extractStorage(mockProvider({}), [], {
        gems: { paperclip: {}, mini_magick: {} },
      })
      expect(result.image_processing.backend).toBe('mini_magick')
    })
  })
})
