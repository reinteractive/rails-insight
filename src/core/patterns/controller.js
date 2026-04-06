/**
 * Regex patterns for Rails controller extraction.
 */
export const CONTROLLER_PATTERNS = {
  classDeclaration: /class\s+(\w+(?:::\w+)*Controller)\s*<\s*(?:::)?(\w+(?:::\w+)*)/,
  include: /^\s*include\s+(\w+(?:::\w+)*)/m,

  // Filters
  filter:
    /^\s*(?:before|after|around|skip_before|skip_after|skip_around)_action\s+:?(\w+)(?:,\s*(.+))?$/m,
  filterType:
    /^\s*((?:before|after|around|skip_before|skip_after|skip_around)_action)\s+:?(\w+!?)(?:,\s*(.+))?$/m,

  // Visibility boundaries
  visibility: /^\s*(private|protected)\s*$/m,

  // Method/action
  method: /^\s*def\s+(\w+)/m,

  // Strong params
  strongParamsMethod: /^\s*def\s+(\w+_params)/m,
  paramsRequire: /params\.require\(:(\w+)\)\.permit\(([^)]+)\)/,

  // Respond to
  respondTo: /respond_to\s+(?:do\s*\|(\w+)\||:(\w+))/,

  // Rescue from
  rescueFrom: /^\s*rescue_from\s+(\w+(?:::\w+)*)(?:,\s*with:\s*:(\w+))?/m,

  // Layout
  layout: /^\s*layout\s+['"](\w+)['"]/m,

  // Forgery protection
  protectFromForgery: /protect_from_forgery\s*(.*)/,
  skipForgeryProtection: /skip_forgery_protection/,

  // HTTP auth
  httpBasicAuth: /http_basic_authenticate_with/,

  // Streaming
  actionControllerLive: /include\s+ActionController::Live/,
}
