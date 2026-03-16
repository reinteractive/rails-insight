/**
 * Shared regex patterns for all extractors.
 * Organized by category matching research report Section 6-7.
 */

// ============================================================
// MODEL PATTERNS (Section 6.1)
// ============================================================
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

// ============================================================
// CONTROLLER PATTERNS (Section 6.2)
// ============================================================
export const CONTROLLER_PATTERNS = {
  classDeclaration: /class\s+(\w+(?:::\w+)*Controller)\s*<\s*(\w+(?:::\w+)*)/,
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

// ============================================================
// ROUTE PATTERNS (Section 6.3)
// ============================================================
export const ROUTE_PATTERNS = {
  resources: /^\s*resources?\s+:(\w+)(?:,\s*(.+))?\s*(?:do)?\s*$/m,
  resource: /^\s*resource\s+:(\w+)(?:,\s*(.+))?\s*(?:do)?\s*$/m,
  namespace: /^\s*namespace\s+:(\w+)(?:,\s*(.+))?\s*do/m,
  scope: /^\s*scope\s+(?:['"]([^'"]+)['"]|:(\w+))(?:,\s*(.+))?\s*do/m,
  scopeModule: /^\s*scope\s+module:\s*['"]?:?(\w+)['"]?/m,
  constraints: /^\s*constraints\s*(?:\((.+)\))?\s*do/m,
  httpVerb:
    /^\s*(?:get|post|put|patch|delete)\s+['"]([^'"]+)['"](?:.*?(?:to:|=>)\s*['"]([^'"#]+)#?([^'"]*)['"'])?/m,
  root: /^\s*root\s+(?:to:\s*)?['"]([^'"#]+)#?([^'"]*)['"']/m,
  mount:
    /^\s*mount\s+(\w+(?:(?:::|\.)\w+)*)\s*(?:=>|,\s*at:)\s*['"]([^'"]+)['"]/m,
  concern: /^\s*concern\s+:(\w+)\s+do/m,
  concerns: /^\s*concerns\s+:(\w+)/m,
  member: /^\s*member\s+do/m,
  collection: /^\s*collection\s+do/m,
  draw: /^\s*draw\s*\(?:?(\w+)\)?/m,
  only: /only:\s*\[([^\]]+)\]/,
  except: /except:\s*\[([^\]]+)\]/,
  defaults: /defaults:\s*\{([^}]+)\}/,
  healthCheck: /^\s*get\s+['"]up['"]/m,
  direct: /^\s*direct\s*\(:(\w+)\)/m,
  resolve: /^\s*resolve\s*\((.+)\)/m,
}

// ============================================================
// SCHEMA PATTERNS (Section 6.4)
// ============================================================
export const SCHEMA_PATTERNS = {
  schemaVersion: /ActiveRecord::Schema\[[\d.]+\]\.define\(version:\s*([\d_]+)/,
  schemaVersionAlt: /ActiveRecord::Schema\.define\(version:\s*([\d_]+)/,
  createTable: /^\s*create_table\s+['"](\w+)['"](?:,\s*(.+))?\s*do/m,
  column: /^\s*t\.(\w+)\s+['":]+(\w+)['"]?(?:,\s*(.+))?/m,
  references:
    /^\s*t\.(?:references|belongs_to)\s+['"]?:?(\w+)['"]?(?:,\s*(.+))?/m,
  timestamps: /^\s*t\.timestamps/m,
  index:
    /^\s*(?:t\.index|add_index)\s+(?:\[([^\]]+)\]|['"](\w+)['"]),?\s*(.+)?/m,
  foreignKey:
    /^\s*add_foreign_key\s+['"](\w+)['"],\s*['"](\w+)['"](?:,\s*(.+))?/m,
  checkConstraint:
    /^\s*add_check_constraint\s+['"](\w+)['"],\s*['"](.+)['"](?:,\s*(.+))?/m,
  createEnum: /^\s*create_enum\s+['"](\w+)['"],\s*\[([^\]]+)\]/m,
  enableExtension: /^\s*enable_extension\s+['"](\w+)['"]/m,
  idType: /id:\s*:(\w+)/,
  idUuid: /id:\s*:uuid/,
  idFalse: /id:\s*false/,
  comment: /comment:\s*['"]([^'"]+)['"]/,
}

// ============================================================
// COMPONENT PATTERNS (Section 6.5)
// ============================================================
export const COMPONENT_PATTERNS = {
  classDeclaration: /class\s+(\w+(?:::\w+)*Component)\s*<\s*(\w+(?:::\w+)*)/,
  initialize: /def\s+initialize\(([^)]+)\)/,
  rendersOne: /^\s*renders_one\s+:(\w+)(?:,\s*(.+))?/m,
  rendersMany: /^\s*renders_many\s+:(\w+)(?:,\s*(.+))?/m,
  collectionParam: /^\s*with_collection_parameter\s+:(\w+)/m,
  contentAreas: /^\s*with_content_areas?\s+(.+)/m,
  // Template patterns
  stimulusController: /data-controller=['"]([^'"]+)['"]/g,
  stimulusAction: /data-action=['"]([^'"]+)['"]/g,
  turboFrame: /<turbo-frame\s+id=['"]([^'"]+)['"]/g,
  turboStream: /<turbo-stream\s/g,
  componentRender: /render\s+(\w+(?:::\w+)*Component)/g,
  partialRender: /render\s+partial:/g,
}

// ============================================================
// STIMULUS PATTERNS (Section 6.6)
// ============================================================
export const STIMULUS_PATTERNS = {
  classDeclaration:
    /export\s+default\s+class\s+(?:(\w+)\s+)?extends\s+Controller/,
  targets: /static\s+targets\s*=\s*\[([^\]]+)\]/,
  values: /static\s+values\s*=\s*\{([^}]+)\}/,
  classes: /static\s+classes\s*=\s*\[([^\]]+)\]/,
  outlets: /static\s+outlets\s*=\s*\[([^\]]+)\]/,
  actionMethod: /^\s+(\w+)\s*\(.*?\)\s*\{/gm,
  imports: /import\s+(?:\{([^}]+)\}|(\w+))\s+from\s+['"]([^'"]+)['"]/g,
}

// ============================================================
// AUTH PATTERNS (Section 6.8)
// ============================================================
export const AUTH_PATTERNS = {
  // Devise
  deviseConfig: /config\.(\w+)\s*=\s*(.+)/g,
  deviseModules: /^\s*devise\s+(.+)/m,
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

// ============================================================
// AUTHORIZATION PATTERNS (Section 6.9)
// ============================================================
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

// ============================================================
// JOB PATTERNS (Section 6.10)
// ============================================================
export const JOB_PATTERNS = {
  classDeclaration: /class\s+(\w+(?:::\w+)*)\s*<\s*(\w+)/,
  queueAs: /^\s*queue_as\s+:?['"]?(\w+)['"]?/m,
  retryOn: /^\s*retry_on\s+(\w+(?:::\w+)*)(?:,\s*(.+))?/m,
  discardOn: /^\s*discard_on\s+(\w+(?:::\w+)*)(?:,\s*(.+))?/m,
  queueAdapter: /self\.queue_adapter\s*=\s*:(\w+)/,
  sidekiqOptions: /^\s*sidekiq_options\s+(.+)/m,
  performLater: /(\w+)\.perform_later/g,
}

// ============================================================
// EMAIL PATTERNS (Section 6.11)
// ============================================================
export const EMAIL_PATTERNS = {
  mailerClass: /class\s+(\w+Mailer)\s*<\s*(\w+)/,
  mailerMethod: /^\s*def\s+(\w+)/m,
  defaultFrom: /default\s+from:\s*['"]([^'"]+)['"]/,
  mailerLayout: /^\s*layout\s+['"](\w+)['"]/m,
  deliveryMethod: /config\.action_mailer\.delivery_method\s*=\s*:(\w+)/,
  smtpSettings: /config\.action_mailer\.smtp_settings/,
  mailerConfig: /config\.action_mailer\.(\w+)\s*=\s*(.+)/g,
  interceptor: /ActionMailer::Base\.register_interceptor\s*\((\w+)\)/,
  observer: /ActionMailer::Base\.register_observer\s*\((\w+)\)/,
  mailboxClass: /class\s+(\w+Mailbox)\s*<\s*(\w+)/,
  mailboxRouting: /routing\s+(.+)/g,
  mailCall: /mail\s*\(/g,
  deliverNow: /\.deliver_now/g,
  deliverLater: /\.deliver_later/g,
  attachments: /attachments\[/g,
}

// ============================================================
// STORAGE PATTERNS (Section 6.12)
// ============================================================
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

// ============================================================
// CACHING PATTERNS (Section 6.13)
// ============================================================
export const CACHING_PATTERNS = {
  cacheStore: /config\.cache_store\s*=\s*:(\w+)(?:,\s*(.+))?/,
  fragmentCache: /<%\s*cache\s+(.+?)\s*do\s*%>/g,
  fragmentCacheRuby: /cache\s+(.+?)\s+do/g,
  railsCacheFetch: /Rails\.cache\.fetch\s*\((.+?)\)/g,
  railsCacheOps: /Rails\.cache\.(?:read|write|delete|exist\?)\s*\((.+?)\)/g,
  touch: /touch:\s*true/,
  stale: /stale\?\s*\((.+?)\)/g,
  freshWhen: /fresh_when\s*\((.+?)\)/g,
  expiresIn: /expires_in\s+(.+)/g,
  httpCacheForever: /http_cache_forever/,
  railsCache: /Rails\.cache\./g,
  russianDoll: /<%\s*cache\s+\[(.+?)\]\s*do\s*%>/g,
  cacheKey: /cache_key/g,
  cachesAction: /caches_action\s+:(\w+)/g,
}

// ============================================================
// REALTIME PATTERNS (Section 6.14)
// ============================================================
export const REALTIME_PATTERNS = {
  channelClass: /class\s+(\w+Channel)\s*<\s*(\w+)/,
  subscribed: /def\s+subscribed/,
  streamFrom: /stream_from\s+['"]?([^'"]+)['"]?/g,
  streamFor: /stream_for\s+(.+)/g,
  turboStreamFrom: /turbo_stream_from\s+(.+)/g,
  connectionConnect: /def\s+connect/,
  findVerifiedUser: /find_verified_user/,
  rejectUnauthorized: /reject_unauthorized_connection/,
  cableAdapter: /adapter:\s*(\w+)/,
  broadcast: /\.broadcast\s*\(/g,
  turboStream: /Turbo::StreamsChannel\.broadcast/g,
  broadcastsTo: /broadcasts_to\s+:(\w+)/g,
}

// ============================================================
// API PATTERNS (Section 6.15)
// ============================================================
export const API_PATTERNS = {
  apiOnly: /config\.api_only\s*=\s*true/,
  serializerClass: /class\s+(\w+Serializer)\s*<\s*(\w+)/,
  blueprintClass: /class\s+(\w+Blueprint)\s*<\s*(\w+)/,
  serializerAttributes: /^\s*attributes?\s+(.+)/m,
  pagyUsage: /pagy\s*\((.+)\)/g,
  kaminariUsage: /\.page\s*\((.+)\)\.per\s*\((.+)\)/g,
  rackAttackThrottle: /Rack::Attack\.throttle\s*\((.+)\)/g,
  rackAttackBlocklist: /Rack::Attack\.blocklist\s*\((.+)\)/g,
  corsConfig:
    /Rails\.application\.config\.middleware\.insert_before.*Rack::Cors/,
  corsOrigins: /allow\s+do\s*\n\s*origins\s+(.+)/g,
  graphqlSchema: /class\s+(\w+Schema)\s*<\s*GraphQL::Schema/,
  graphqlType: /class\s+Types::(\w+)\s*<\s*Types::BaseObject/g,
  graphqlMutation: /class\s+Mutations::(\w+)\s*<\s*Mutations::BaseMutation/g,
  renderJson: /render\s+json:/g,
  respondTo: /respond_to\s+do/g,
  jbuilder: /json\.extract!|json\.\w+/g,
  apiNamespace: /namespace\s+:api/g,
  apiVersion: /namespace\s+:v\d+/g,
  skipCsrf: /skip_before_action\s+:verify_authenticity_token/g,
  grapeApi: /Grape::API/,
  graphqlField: /field\s+:\w+/g,
}

// ============================================================
// VIEW PATTERNS (Section 6.7)
// ============================================================
export const VIEW_PATTERNS = {
  turboFrame:
    /(?:<turbo-frame\s+id=['"]([^'"]+)['"]|turbo_frame_tag\s+['"]([^'"]+)['"])/g,
  componentRender: /render\s+(\w+(?:::\w+)*Component)/g,
  partialRender: /render\s+(?:partial:\s*)?['"]([^'"]+)['"]/g,
  contentFor: /content_for\s*[:(]\s*:?(\w+)/g,
  formWith: /form_with\s/g,
  formFor: /form_for\s/g,
  formTag: /form_tag\s/g,
  stimulusController: /data-controller=['"]([^'"]+)['"]/g,
  stimulusAction: /data-action=['"]([^'"]+)['"]/g,
  jbuilderField: /json\.(\w+)/g,
  jbuilderArray: /json\.array!/g,
  yieldContent: /yield\s*[:(]?\s*:?(\w+)/g,
  helperMethod: /helper_method\s+:(\w+)/g,
  turboStreamTag: /turbo_stream\.\w+/g,
}

// ============================================================
// GEMFILE PATTERNS
// ============================================================
export const GEMFILE_PATTERNS = {
  gem: /^\s*gem\s+['"]([^'"]+)['"](?:,\s*['"]([^'"]+)['"])?(?:,\s*(.+))?$/m,
  group: /^\s*group\s+(.+)\s+do/m,
  source: /^\s*source\s+['"]([^'"]+)['"]/m,
  ruby: /^\s*ruby\s+['"]([^'"]+)['"]/m,
}

// ============================================================
// CONFIG PATTERNS (Section 7.2)
// ============================================================
export const CONFIG_PATTERNS = {
  loadDefaults: /config\.load_defaults\s+(\d+\.\d+)/,
  apiOnly: /config\.api_only\s*=\s*true/,
  timeZone: /config\.time_zone\s*=\s*['"]([^'"]+)['"]/,
  queueAdapter: /config\.active_job\.queue_adapter\s*=\s*:(\w+)/,
  cacheStore: /config\.cache_store\s*=\s*:(\w+)/,
  forceSSL: /config\.force_ssl\s*=\s*true/,
  filterParameters: /config\.filter_parameters\s*\+=\s*\[([^\]]+)\]/,
  railsConfigure: /Rails\.application\.configure\s+do/,
  configSetting: /config\.\w+(?:\.\w+)*\s*=/g,
  initializer: /initializer\s+['"]([^'"]+)['"]/g,
}

// ============================================================
// FACTORY PATTERNS (FactoryBot)
// ============================================================
export const FACTORY_PATTERNS = {
  // Factory definition: factory :name or factory :name, class: "ClassName"
  factoryDef: /^\s*factory\s+:(\w+)(?:,\s*class:\s*['"]?:?(\w+(?:::\w+)*)['"]?)?\s*do/m,

  // Trait definition
  trait: /^\s*trait\s+:(\w+)\s*do/m,

  // Sequence definition
  sequence: /^\s*sequence\s*\(:(\w+)\)/m,
  sequenceBlock: /^\s*sequence\s+:(\w+)\s/m,

  // Association reference inside factory
  association: /^\s*association\s+:(\w+)(?:,\s*(.+))?/m,

  // Transient block
  transient: /^\s*transient\s+do/m,

  // After callbacks
  afterCreate: /^\s*after\s*\(:create\)/m,
  afterBuild: /^\s*after\s*\(:build\)/m,

  // Attribute with block: name { value }
  attributeBlock: /^\s*(\w+)\s*\{([^}]*)\}/m,

  // Attribute with static value (less common)
  attributeStatic: /^\s*(\w+)\s+['"]([^'"]+)['"]/m,
}
