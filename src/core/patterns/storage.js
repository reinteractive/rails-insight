/**
 * Regex patterns for Active Storage extraction.
 */
export const STORAGE_PATTERNS = {
  storageService: /(\w+):\s*\n\s*service:\s*(\w+)/g,
  variant: /variant\s*\(([^)]+)\)/g,
  namedVariant: /variant\s+:(\w+),\s*(.+)/g,
  directUpload: /direct_upload:\s*true/,
  contentTypeValidation: /content_type:\s*\[([^\]]+)\]/,
  fileSizeValidation: /byte_size:\s*\{[^}]*less_than:\s*(\d+)/,
  variantProcessor: /config\.active_storage\.variant_processor\s*=\s*:(\w+)/,
  mirrorService: /service:\s*Mirror/,
  hasOneAttached: /^\s*has_one_attached\s+:(\w+)/m,
  hasManyAttached: /^\s*has_many_attached\s+:(\w+)/m,
  purge: /\.purge(?:_later)?/g,
}
