/**
 * Regex patterns for Rails model extraction.
 */
export const MODEL_PATTERNS = {
  // Class declaration + inheritance
  classDeclaration: /class\s+(\w+(?:::\w+)*)\s*<\s*(\w+(?:::\w+)*)/,

  // Concern inclusions
  include: /^\s*include\s+(\w+(?:::\w+)*)/m,
  extend: /^\s*extend\s+(\w+(?:::\w+)*)/m,

  // === ASSOCIATIONS ===
  belongsTo: /^\s*belongs_to\s+:(\w+)(?:,\s*(.+))?$/m,
  hasMany: /^\s*has_many\s+:(\w+)(?:,\s*(.+))?$/m,
  hasOne: /^\s*has_one\s+:(\w+)(?:,\s*(.+))?$/m,
  habtm: /^\s*has_and_belongs_to_many\s+:(\w+)(?:,\s*(.+))?$/m,
  through: /through:\s*:(\w+)/,
  polymorphic: /polymorphic:\s*true/,
  asPolymorphic: /as:\s*:(\w+)/,

  // === VALIDATIONS ===
  validates: /^\s*validates?\s+:?(\w+(?:,\s*:\w+)*)(?:,\s*(.+))?$/m,
  validate: /^\s*validate\s+:(\w+)/m,
  validatesWithValidator: /^\s*validates_with\s+(\S+)(?:,\s*(.+))?$/m,
  validatesOldStyle: /^\s*validates_(\w+?)(?:_of)?\s+:(\w+)(?:,\s*(.+))?$/m,

  // === SCOPES ===
  scope: /^\s*scope\s+:(\w+),\s*(?:->|lambda|proc)/m,

  // === ENUMS ===
  enumPositional: /^\s*enum\s+:(\w+),\s*\{([^}]+)\}/m,
  enumPositionalArray: /^\s*enum\s+:(\w+),\s*\[([^\]]+)\]/m,
  enumLegacy: /^\s*enum\s+(\w+):\s*\{([^}]+)\}/m,
  enumLegacyArray: /^\s*enum\s+(\w+):\s*\[([^\]]+)\]/m,

  // === CALLBACKS ===
  callback:
    /^\s*(?:before|after|around)_(?:save|create|update|destroy|validation|commit|rollback|initialize|find|touch)\s+:?(\w+)(?:,\s*(.+))?$/m,
  callbackType:
    /^\s*((?:before|after|around)_(?:save|create|update|destroy|validation|commit|rollback|initialize|find|touch))\s+:?(\w+)(?:,\s*(.+))?$/m,

  // === DELEGATIONS ===
  delegate: /^\s*delegate\s+(.+),\s*to:\s*:(\w+)/m,

  // === ENCRYPTION (Rails 7+) ===
  encrypts: /^\s*encrypts\s+(.+)/m,

  // === NORMALIZES (Rails 7.1+) ===
  normalizes: /^\s*normalizes\s+(.+)/m,

  // === TOKEN GENERATION (Rails 7.2+) ===
  generatesTokenFor: /^\s*generates_token_for\s+:(\w+)/m,

  // === SECURE PASSWORD ===
  hasSecurePassword: /^\s*has_secure_password/m,

  // === SECURE TOKEN ===
  hasSecureToken: /^\s*has_secure_token\s*(?::(\w+))?/m,

  // === ACTIVE STORAGE ===
  hasOneAttached: /^\s*has_one_attached\s+:(\w+)(?:,\s*(.+))?/m,
  hasManyAttached: /^\s*has_many_attached\s+:(\w+)(?:,\s*(.+))?/m,

  // === ACTION TEXT ===
  hasRichText: /^\s*has_rich_text\s+:(\w+)/m,

  // === STORE ===
  store: /^\s*store\s+:(\w+),\s*accessors:\s*\[([^\]]+)\]/m,
  storeAccessor: /^\s*store_accessor\s+:(\w+),\s*(.+)/m,

  // === TABLE/KEY OVERRIDES ===
  tableName: /self\.table_name\s*=\s*['"](\w+)['"]/,
  primaryKey: /self\.primary_key\s*=\s*(.+)/,

  // === DEFAULT SCOPE ===
  defaultScope: /^\s*default_scope\s/m,

  // === COUNTER CACHE ===
  counterCache: /counter_cache:\s*(?:true|['"](\w+)['"])/,

  // === STI ===
  inheritanceColumn: /self\.inheritance_column\s*=\s*['"](\w+)['"]/,

  // === ABSTRACT CLASS ===
  abstractClass: /self\.abstract_class\s*=\s*true/,

  // === ACTS AS / PLUGIN PATTERNS ===
  actsAs: /^\s*acts_as_(\w+)/m,

  // === BROADCASTS (Turbo Streams) ===
  broadcastsTo: /^\s*broadcasts_to\s+(.+)/m,
  broadcasts: /^\s*broadcasts\b/m,

  // === STRICT LOADING ===
  strictLoading: /^\s*self\.strict_loading_by_default\s*=\s*true/m,
  strictLoadingAssoc: /strict_loading:\s*true/,

  // === TURBO 8 MORPHING ===
  turboRefreshes: /^\s*turbo_refreshes_with\s+:(\w+)/m,

  // === SOFT DELETE ===
  discardModel: /include\s+Discard::Model/,
  paranoid: /acts_as_paranoid/,

  // === STATE MACHINE ===
  includeAASM: /include\s+AASM/,
  aasm: /^\s*aasm\s/m,
  stateMachine: /^\s*state_machine\s/m,

  // === FRIENDLY ID ===
  extendFriendlyId: /extend\s+FriendlyId/,
  friendlyId: /^\s*friendly_id\s+:(\w+)/m,

  // === PAPER TRAIL / AUDITING ===
  hasPaperTrail: /^\s*has_paper_trail/m,
  audited: /^\s*audited/m,

  // === DEVISE MODULES ===
  devise: /^\s*devise\s+(.+)/m,

  // === SEARCHABLE ===
  searchkick: /^\s*searchkick/m,
  pgSearchModel: /include\s+PgSearch::Model/,
  pgSearchScope: /^\s*pg_search_scope\s+:(\w+)/m,
}
