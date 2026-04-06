/**
 * Regex patterns for authentication extraction.
 */
export const AUTH_PATTERNS = {
  // Devise
  deviseConfig: /config\.(\w+)\s*=\s*(.+)/g,
  // Matches both `devise :module, ...` (space) and `devise(...)` (parens)
  deviseModules: /^\s*devise[\s(](.*)/m,
  deviseController:
    /class\s+\w+::(\w+Controller)\s*<\s*Devise::(\w+Controller)/,
  omniauthProvider: /provider\s+:(\w+)/g,
  omniauthProviders: /omniauth_providers:\s*\[([^\]]+)\]/,

  // Native Rails 8
  currentAttributes: /class\s+Current\s*<\s*ActiveSupport::CurrentAttributes/,
  currentAttribute: /attribute\s+:(\w+)/g,
  requireAuth: /before_action\s+:require_authentication/,
  authenticatedMethod: /def\s+authenticated\?/,
  requireAuthMethod: /def\s+require_authentication/,
  sessionsController: /class\s+SessionsController/,

  // General
  hasSecurePassword: /^\s*has_secure_password/m,
  jwtDecode: /JWT\.decode/,
  jwtEncode: /JWT\.encode/,
}
