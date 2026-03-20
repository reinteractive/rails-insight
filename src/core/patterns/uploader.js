/**
 * Regex patterns for CarrierWave / Shrine uploader extraction.
 */
export const UPLOADER_PATTERNS = {
  // CarrierWave
  carrierWaveClass: /class\s+(\w+(?:::\w+)*)\s*<\s*CarrierWave::Uploader::Base/,
  storageType: /^\s*storage\s+:(\w+)/m,
  extensionAllowlist: /def\s+extension_allowlist\s*\n\s*%w\[([^\]]+)\]/m,
  contentTypeAllowlist: /def\s+content_type_allowlist\s*\n\s*%w\[([^\]]+)\]/m,
  versionBlock: /version\s+:(\w+)/g,
  storeDir: /def\s+store_dir\s*\n\s*['"]([^'"]+)['"]/m,
  mountUploader: /mount_uploader\s+:(\w+),\s*(\w+(?:::\w+)*)/g,
  // Shrine
  shrineClass: /class\s+(\w+(?:::\w+)*)\s*<\s*Shrine/,
  shrinePlugin: /plugin\s+:(\w+)/g,
}
