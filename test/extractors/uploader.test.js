import { describe, it, expect } from 'vitest'
import {
  extractUploader,
  detectMountedUploaders,
} from '../../src/extractors/uploader.js'

function mockProvider(files) {
  return {
    readFile(path) {
      return files[path] || null
    },
  }
}

describe('Uploader Extractor', () => {
  describe('extracts CarrierWave uploader', () => {
    const fixture = `
class AvatarUploader < CarrierWave::Uploader::Base
  storage :fog

  def extension_allowlist
    %w[jpg jpeg png gif]
  end

  def content_type_allowlist
    %w[image/jpeg image/png image/gif]
  end

  version :thumb do
    process resize_to_fill: [100, 100]
  end

  version :medium do
    process resize_to_fill: [300, 300]
  end

  def store_dir
    "uploads/user/avatar"
  end
end`

    const provider = mockProvider({
      'app/uploaders/avatar_uploader.rb': fixture,
    })
    const result = extractUploader(provider, 'app/uploaders/avatar_uploader.rb')

    it('extracts class name', () => {
      expect(result.class).toBe('AvatarUploader')
    })

    it('extracts type', () => {
      expect(result.type).toBe('carrierwave')
    })

    it('extracts storage type', () => {
      expect(result.storage).toBe('fog')
    })

    it('extracts extension allowlist', () => {
      expect(result.extensions).toEqual(['jpg', 'jpeg', 'png', 'gif'])
    })

    it('extracts content type allowlist', () => {
      expect(result.content_types).toEqual([
        'image/jpeg',
        'image/png',
        'image/gif',
      ])
    })

    it('extracts versions', () => {
      expect(result.versions).toContain('thumb')
      expect(result.versions).toContain('medium')
    })

    it('extracts store_dir', () => {
      expect(result.store_dir).toBe('uploads/user/avatar')
    })
  })

  describe('returns null for non-uploader', () => {
    it('file without class declaration → null', () => {
      const provider = mockProvider({
        'app/uploaders/not_an_uploader.rb': 'module SomeModule\nend',
      })
      const result = extractUploader(
        provider,
        'app/uploaders/not_an_uploader.rb',
      )
      expect(result).toBeNull()
    })
  })

  describe('detects Shrine uploader', () => {
    it('Shrine class → type shrine, plugins extracted', () => {
      const fixture = `
class ImageUploader < Shrine
  plugin :validation_helpers
  plugin :determine_mime_type
  plugin :cached_attachment_data
end`

      const provider = mockProvider({
        'app/uploaders/image_uploader.rb': fixture,
      })
      const result = extractUploader(
        provider,
        'app/uploaders/image_uploader.rb',
      )
      expect(result.class).toBe('ImageUploader')
      expect(result.type).toBe('shrine')
      expect(result.plugins).toContain('validation_helpers')
      expect(result.plugins).toContain('determine_mime_type')
      expect(result.plugins).toContain('cached_attachment_data')
    })
  })

  describe('detectMountedUploaders', () => {
    it('finds mounts in models', () => {
      const modelExtractions = {
        User: {
          file: 'app/models/user.rb',
        },
        Post: {
          file: 'app/models/post.rb',
        },
      }

      const provider = mockProvider({
        'app/models/user.rb': `
class User < ApplicationRecord
  mount_uploader :avatar, AvatarUploader
end`,
        'app/models/post.rb': `
class Post < ApplicationRecord
  mount_uploader :cover_image, CoverImageUploader
end`,
      })

      const mounted = detectMountedUploaders(provider, modelExtractions)
      expect(mounted).toHaveLength(2)
      expect(mounted).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            model: 'User',
            attribute: 'avatar',
            uploader: 'AvatarUploader',
          }),
          expect.objectContaining({
            model: 'Post',
            attribute: 'cover_image',
            uploader: 'CoverImageUploader',
          }),
        ]),
      )
    })

    it('returns empty for no mounts', () => {
      const provider = mockProvider({
        'app/models/user.rb': 'class User < ApplicationRecord\nend',
      })
      const mounted = detectMountedUploaders(provider, {
        User: { file: 'app/models/user.rb' },
      })
      expect(mounted).toEqual([])
    })

    it('handles null model extractions', () => {
      const provider = mockProvider({})
      const mounted = detectMountedUploaders(provider, null)
      expect(mounted).toEqual([])
    })
  })

  describe('returns null for empty file', () => {
    it('returns null', () => {
      const provider = mockProvider({
        'app/uploaders/empty.rb': '',
      })
      const result = extractUploader(provider, 'app/uploaders/empty.rb')
      expect(result).toBeNull()
    })
  })

  describe('default storage is file', () => {
    it('no storage specified → file', () => {
      const provider = mockProvider({
        'app/uploaders/simple_uploader.rb': `
class SimpleUploader < CarrierWave::Uploader::Base
end`,
      })
      const result = extractUploader(
        provider,
        'app/uploaders/simple_uploader.rb',
      )
      expect(result.storage).toBe('file')
    })
  })
})
