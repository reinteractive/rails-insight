import { describe, it, expect } from 'vitest'
import { UPLOADER_PATTERNS } from '../../src/core/patterns.js'

describe('UPLOADER_PATTERNS', () => {
  describe('carrierWaveClass', () => {
    it('detects CarrierWave class', () => {
      const m = 'class AvatarUploader < CarrierWave::Uploader::Base'.match(
        UPLOADER_PATTERNS.carrierWaveClass,
      )
      expect(m[1]).toBe('AvatarUploader')
    })
  })

  describe('storageType', () => {
    it('detects storage type', () => {
      const m = '  storage :fog'.match(UPLOADER_PATTERNS.storageType)
      expect(m[1]).toBe('fog')
    })
  })

  describe('versionBlock', () => {
    it('detects version block', () => {
      const re = new RegExp(UPLOADER_PATTERNS.versionBlock.source, 'g')
      const m = re.exec('  version :thumb do')
      expect(m[1]).toBe('thumb')
    })
  })

  describe('mountUploader', () => {
    it('detects mount_uploader', () => {
      const re = new RegExp(UPLOADER_PATTERNS.mountUploader.source, 'g')
      const m = re.exec('  mount_uploader :avatar, AvatarUploader')
      expect(m[1]).toBe('avatar')
      expect(m[2]).toBe('AvatarUploader')
    })
  })

  describe('shrineClass', () => {
    it('detects Shrine class', () => {
      const m = 'class ImageUploader < Shrine'.match(
        UPLOADER_PATTERNS.shrineClass,
      )
      expect(m[1]).toBe('ImageUploader')
    })
  })

  describe('extensionAllowlist', () => {
    it('extracts extension allowlist', () => {
      const m = '  def extension_allowlist\n    %w[jpg jpeg png]'.match(
        UPLOADER_PATTERNS.extensionAllowlist,
      )
      expect(m[1]).toContain('jpg')
      expect(m[1]).toContain('jpeg')
      expect(m[1]).toContain('png')
    })
  })
})
