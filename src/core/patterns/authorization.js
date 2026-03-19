/**
 * Regex patterns for authorization extraction.
 */
export const AUTHORIZATION_PATTERNS = {
  // Pundit
  policyClass: /class\s+(\w+)Policy\s*<\s*(\w+)/,
  policyMethod: /def\s+(index|show|create|new|update|edit|destroy)\?/g,
  policyScopeClass: /class\s+Scope\s*<\s*(?:ApplicationPolicy::)?Scope/,
  policyScopeResolve: /def\s+resolve/,
  authorize: /authorize\s+(@?\w+)(?:,\s*:(\w+)\?)?/g,
  policyScope: /policy_scope\s*\((.+)\)/g,

  // CanCanCan
  abilityClass: /class\s+Ability/,
  includeCanCan: /include\s+CanCan::Ability/,
  canDef: /^\s*can\s+(.+)/gm,
  cannotDef: /^\s*cannot\s+(.+)/gm,
  loadAndAuthorize: /load_and_authorize_resource/g,
  authorizeAction: /authorize!\s+(.+)/g,

  // Roles
  enumRole: /enum\s+:?role/,
  hasRole: /has_role\s/g,
}
