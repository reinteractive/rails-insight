/**
 * Storage Extractor (#12)
 * Extracts Active Storage configuration, attachments, and variants.
 */

import { STORAGE_PATTERNS } from '../core/patterns.js'

/**
 * Extract storage information.
 * @param {import('../providers/interface.js').FileProvider} provider
 * @param {Array<{path: string, category: string}>} entries
 * @param {{gems?: object}} gemInfo
 * @returns {object}
 */
export function extractStorage(provider, entries, gemInfo = {}) {
  const gems = gemInfo.gems || {}
  const result = {
    services: {},
    attachments: [],
    direct_uploads: false,
    image_processing: null,
    variants_detected: 0,
  }

  // Storage services from config/storage.yml
  const storageYml = provider.readFile('config/storage.yml')
  if (storageYml) {
    const serviceRe = new RegExp(STORAGE_PATTERNS.storageService.source, 'g')
    let m
    while ((m = serviceRe.exec(storageYml))) {
      result.services[m[1]] = { service: m[2] }
    }

    // Mirror service
    if (STORAGE_PATTERNS.mirrorService.test(storageYml)) {
      result.services.mirror = { service: 'Mirror' }
    }

    // Direct uploads
    if (STORAGE_PATTERNS.directUpload.test(storageYml)) {
      result.direct_uploads = true
    }
  }

  // Attachments from model files
  const modelEntries = entries.filter((e) => e.category === 'model')
  for (const entry of modelEntries) {
    const content = provider.readFile(entry.path)
    if (!content) continue

    const className = entry.path
      .split('/')
      .pop()
      .replace('.rb', '')
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join('')

    const oneRe = new RegExp(STORAGE_PATTERNS.hasOneAttached.source, 'gm')
    let m
    while ((m = oneRe.exec(content))) {
      result.attachments.push({
        model: className,
        name: m[1],
        type: 'has_one_attached',
      })
    }

    const manyRe = new RegExp(STORAGE_PATTERNS.hasManyAttached.source, 'gm')
    while ((m = manyRe.exec(content))) {
      result.attachments.push({
        model: className,
        name: m[1],
        type: 'has_many_attached',
      })
    }

    // Variants
    const varRe = new RegExp(STORAGE_PATTERNS.variant.source, 'g')
    while (varRe.exec(content)) {
      result.variants_detected++
    }
  }

  // Image processing
  if (gems.image_processing) {
    result.image_processing = {
      gem: 'image_processing',
      backend: 'mini_magick',
    }
    // Check for vips backend
    const envContent = provider.readFile('config/application.rb') || ''
    const vipsMatch = envContent.match(STORAGE_PATTERNS.variantProcessor)
    if (vipsMatch) {
      result.image_processing.backend = vipsMatch[1]
    }
  }

  return result
}
