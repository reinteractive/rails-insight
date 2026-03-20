/**
 * Uploader Extractor (#12 — Storage sub-type)
 * Extracts CarrierWave / Shrine uploader metadata: class name, storage type,
 * allowed extensions/content types, versions, and size constraints.
 */

import { UPLOADER_PATTERNS } from '../core/patterns.js'

/**
 * Extract uploader information from a single uploader file.
 * @param {import('../providers/interface.js').FileProvider} provider
 * @param {string} filePath
 * @returns {object|null}
 */
export function extractUploader(provider, filePath) {
  const content = provider.readFile(filePath)
  if (!content) return null

  // Try CarrierWave first
  const cwMatch = content.match(UPLOADER_PATTERNS.carrierWaveClass)
  if (cwMatch) {
    return extractCarrierWaveUploader(content, filePath, cwMatch[1])
  }

  // Try Shrine
  const shrineMatch = content.match(UPLOADER_PATTERNS.shrineClass)
  if (shrineMatch) {
    return extractShrineUploader(content, filePath, shrineMatch[1])
  }

  return null
}

/**
 * Extract CarrierWave uploader metadata.
 * @param {string} content
 * @param {string} filePath
 * @param {string} className
 * @returns {object}
 */
function extractCarrierWaveUploader(content, filePath, className) {
  const result = {
    class: className,
    file: filePath,
    type: 'carrierwave',
    storage: 'file',
    extensions: [],
    content_types: [],
    versions: [],
    store_dir: null,
  }

  // Storage type
  const storageMatch = content.match(UPLOADER_PATTERNS.storageType)
  if (storageMatch) {
    result.storage = storageMatch[1]
  }

  // Extension allowlist
  const extMatch = content.match(UPLOADER_PATTERNS.extensionAllowlist)
  if (extMatch) {
    result.extensions = extMatch[1].trim().split(/\s+/)
  }

  // Content type allowlist
  const ctMatch = content.match(UPLOADER_PATTERNS.contentTypeAllowlist)
  if (ctMatch) {
    result.content_types = ctMatch[1].trim().split(/\s+/)
  }

  // Versions
  const versionRe = new RegExp(UPLOADER_PATTERNS.versionBlock.source, 'g')
  let m
  while ((m = versionRe.exec(content))) {
    result.versions.push(m[1])
  }

  // Store dir
  const dirMatch = content.match(UPLOADER_PATTERNS.storeDir)
  if (dirMatch) {
    result.store_dir = dirMatch[1]
  }

  return result
}

/**
 * Extract Shrine uploader metadata.
 * @param {string} content
 * @param {string} filePath
 * @param {string} className
 * @returns {object}
 */
function extractShrineUploader(content, filePath, className) {
  const result = {
    class: className,
    file: filePath,
    type: 'shrine',
    plugins: [],
  }

  const pluginRe = new RegExp(UPLOADER_PATTERNS.shrinePlugin.source, 'g')
  let m
  while ((m = pluginRe.exec(content))) {
    result.plugins.push(m[1])
  }

  return result
}

/**
 * Scan models for CarrierWave mount_uploader declarations.
 * @param {import('../providers/interface.js').FileProvider} provider
 * @param {Object<string, {file?: string}>} modelExtractions
 * @returns {Array<{model: string, attribute: string, uploader: string}>}
 */
export function detectMountedUploaders(provider, modelExtractions) {
  const mounted = []
  if (!modelExtractions) return mounted

  for (const [modelName, model] of Object.entries(modelExtractions)) {
    if (!model.file) continue
    const content = provider.readFile(model.file)
    if (!content) continue

    const mountRe = new RegExp(UPLOADER_PATTERNS.mountUploader.source, 'g')
    let m
    while ((m = mountRe.exec(content))) {
      mounted.push({
        model: modelName,
        attribute: m[1],
        uploader: m[2],
      })
    }
  }

  return mounted
}
