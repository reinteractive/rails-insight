/**
 * Auth Extractor (#8)
 * Detects authentication strategy (Devise, native Rails 8, JWT, etc.)
 * and extracts deep configuration details including actual implementation.
 */

import { AUTH_PATTERNS } from '../core/patterns.js'

// -------------------------------------------------------
// Helpers for reading native Rails 8 auth details
// -------------------------------------------------------

/** Extract method names (public) from Ruby source, grouped by purpose. */
function extractMethodNames(content) {
  const methods = []
  const lines = content.split('\n')
  let inPrivate = false
  for (const line of lines) {
    if (/^\s*(private|protected)\s*$/.test(line)) {
      inPrivate = true
      continue
    }
    if (!inPrivate) {
      const m = line.match(/^\s*def\s+(\w+)/)
      if (m) methods.push(m[1])
    }
  }
  return methods
}

/** Extract cookie configuration from auth concern content. */
function extractCookieConfig(content) {
  const config = {}
  const nameMatch = content.match(/cookies\.signed\[[:'""]?(\w+)['"":]?\]/)
  if (nameMatch) config.name = nameMatch[1]

  const httponlyMatch = content.match(/httponly:\s*(true|false)/)
  if (httponlyMatch) config.httponly = httponlyMatch[1] === 'true'

  const sameSiteMatch = content.match(/same_site:\s*:?(\w+)/)
  if (sameSiteMatch) config.same_site = sameSiteMatch[1]

  const secureMatch = content.match(/secure:\s*([^,\n]+)/)
  if (secureMatch) config.secure = secureMatch[1].trim()

  // Session duration: look for things like 30.days, 2.weeks, 1.year
  const durationMatch = content.match(/(\d+)\.(days?|weeks?|months?|years?)/)
  if (durationMatch) config.duration = `${durationMatch[1]} ${durationMatch[2]}`

  return Object.keys(config).length > 0 ? config : null
}

/** Extract rate limiting declarations from content (Rails 8 native rate_limit). */
function extractRateLimits(content) {
  const limits = []
  const re =
    /rate_limit\s+to:\s*(\d+),\s*within:\s*([^,\n]+?)(?:,\s*only:\s*(?:%i\[([^\]]+)\]|:(\w+)|\[([^\]]+)\]))?/g
  let m
  while ((m = re.exec(content))) {
    limits.push({
      to: parseInt(m[1], 10),
      within: m[2].trim(),
      only: m[3] || m[4] || m[5] || null,
    })
  }
  return limits
}

/** Extract allow_unauthenticated_access declaration. */
function extractAllowUnauthenticated(content) {
  const m = content.match(
    /allow_unauthenticated_access(?:\s+only:\s*(?:%i\[([^\]]+)\]|:(\w+)|\[([^\]]+)\]))?/,
  )
  if (!m) return null
  const only = (m[1] || m[2] || m[3] || '')
    .replace(/[:%]/g, '')
    .split(/\s+/)
    .filter(Boolean)
  return { only: only.length > 0 ? only : null }
}

/** Extract the key method calls inside each action method (first redirect_to / model call). */
function extractActionSummary(content, actionName) {
  const lines = content.split('\n')
  let inAction = false
  let depth = 0
  const keyCalls = []
  for (const line of lines) {
    if (new RegExp(`^\\s*def\\s+${actionName}\\b`).test(line)) {
      inAction = true
      depth = 0
      continue
    }
    if (!inAction) continue
    if (/^\s*def\s+\w+/.test(line) && depth === 0) break // next method
    if (/\bdo\b|\bif\b|\bcase\b|\bbegin\b/.test(line)) depth++
    if (/^\s*end\b/.test(line)) {
      if (depth === 0) break
      depth--
    }
    const trimmed = line.trim()
    // Capture first few key expressions
    if (
      /^(redirect_to|render|head|@\w+\s*=|User\.|start_new_session|terminate_session|authenticate)/.test(
        trimmed,
      )
    ) {
      keyCalls.push(trimmed.replace(/\s+/g, ' ').slice(0, 120))
      if (keyCalls.length >= 3) break
    }
  }
  return keyCalls.join('; ') || null
}

/** Extract all method bodies as a map of { name → body_text }. */
function extractMethodBodies(content) {
  const bodies = {}
  const lines = content.split('\n')
  let currentMethod = null
  let depth = 0
  const bodyLines = []

  for (const line of lines) {
    const defMatch = line.match(/^\s*def\s+(\w+)/)
    if (defMatch && depth === 0) {
      if (currentMethod) bodies[currentMethod] = bodyLines.join('\n').trim()
      currentMethod = defMatch[1]
      bodyLines.length = 0
      depth = 0
      continue
    }
    if (currentMethod) {
      if (/\bdo\b|\bif\b|\bcase\b|\bbegin\b|\bdef\b/.test(line)) depth++
      if (/^\s*end\b/.test(line)) {
        if (depth === 0) {
          bodies[currentMethod] = bodyLines.join('\n').trim()
          currentMethod = null
          bodyLines.length = 0
          continue
        }
        depth--
      }
      bodyLines.push(line)
    }
  }
  if (currentMethod) bodies[currentMethod] = bodyLines.join('\n').trim()
  return bodies
}

/** Build a rich per-method detail object from the auth concern. */
function extractConcernMethodDetails(content) {
  const bodies = extractMethodBodies(content)
  const details = {}

  for (const [name, body] of Object.entries(bodies)) {
    const info = {}

    // Detect purpose from method name
    if (name === 'require_authentication') {
      info.type = 'before_action'
      info.purpose = 'Redirects unauthenticated users to login'
      const redirectMatch = body.match(/redirect_to\s+([\w_]+(?:_path|_url)?)/)
      if (redirectMatch) info.redirect_target = redirectMatch[1]
      info.stores_url =
        /session\[.*requested_url|request_url|store.*url|forwarding_url/.test(
          body,
        )
    } else if (name === 'resume_session') {
      info.purpose = 'Restores session from signed cookie on each request'
      const callMatch = body.match(/(\w+)\(/)
      if (callMatch) info.calls = callMatch[1]
    } else if (name === 'find_session_by_cookie') {
      info.purpose = 'Finds non-expired session record using cookie value'
      // Cookie name
      const cookieNameMatch =
        body.match(/cookies\.signed(?:\.permanent)?\[[:'""]?(\w+)['"":]?\]/) ||
        content.match(/cookies\.signed(?:\.permanent)?\[[:'""]?(\w+)['"":]?\]/)
      if (cookieNameMatch) info.cookie_name = cookieNameMatch[1]
      // Session duration / max age
      const durMatch =
        body.match(/(\d+)\.(days?|weeks?|months?|years?|hours?)/) ||
        content.match(/(\d+)\.(days?|weeks?|months?|years?|hours?)/)
      if (durMatch) info.session_max_age = `${durMatch[1]}.${durMatch[2]}`
      // Cookie type
      if (
        /cookies\.signed\.permanent/.test(body) ||
        /cookies\.signed\.permanent/.test(content)
      ) {
        info.cookie_type = 'signed.permanent'
      } else if (
        /cookies\.signed/.test(body) ||
        /cookies\.signed/.test(content)
      ) {
        info.cookie_type = 'signed'
      }
    } else if (name === 'start_new_session_for') {
      info.purpose =
        'Creates new database session record and sets signed cookie'
      const sessCreateMatch = body.match(/Session\.create[!(]?\s*([^)]+)/)
      if (sessCreateMatch)
        info.creates = `Session.create(${sessCreateMatch[1].substring(0, 80).trim()})`
      // Cookie config from this method's body first, then full content
      const cfg = extractCookieConfig(body) || extractCookieConfig(content)
      if (cfg) info.cookie_config = cfg
    } else if (name === 'terminate_session') {
      info.purpose = 'Destroys session record and deletes cookie'
      if (/destroy/.test(body)) info.destroys = 'Current.session'
      if (/cookies\.delete/.test(body)) info.deletes_cookie = true
    } else if (/allow_unauthenticated_access/.test(name)) {
      info.type = 'class_method'
      info.purpose =
        'Controller macro to skip require_authentication for specified actions'
    } else {
      // Generic
      const firstLine = body.split('\n').find((l) => l.trim().length > 0)
      if (firstLine) info.body_start = firstLine.trim().substring(0, 100)
    }

    if (Object.keys(info).length > 0) details[name] = info
  }
  return details
}

/** Extract Current model detail from current.rb content. */
function extractCurrentModelDetail(content) {
  if (!content) return null
  const attrs = []
  const attrRe = /^\s*attribute\s+:(\w+)/gm
  let m
  while ((m = attrRe.exec(content))) attrs.push(m[1])

  const delegates = []
  const delRe =
    /^\s*delegate\s+:(\w+),\s*to:\s*:(\w+)(?:,\s*allow_nil:\s*(true|false))?/gm
  while ((m = delRe.exec(content))) {
    delegates.push({
      method: m[1],
      to: m[2],
      allow_nil: m[3] === 'true' || true,
    })
  }

  const usageParts = []
  if (attrs.length > 0) usageParts.push(`Current.${attrs[0]}`)
  if (delegates.length > 0) usageParts.push(`Current.${delegates[0].method}`)

  return {
    file: 'app/models/current.rb',
    class: 'Current',
    superclass: 'ActiveSupport::CurrentAttributes',
    attributes: attrs,
    delegates,
    usage: `Provides ${usageParts.join(' and ')} throughout the request lifecycle`,
  }
}

/** Scan all loaded content for common API auth patterns, return found/not_found map. */
function scanForApiAuthPatterns(provider, entries) {
  // Scan controller entries + Gemfile only (already small, fast)
  const controllerEntries = entries.filter(
    (e) =>
      e.category === 'controller' ||
      e.categoryName === 'controllers' ||
      e.category === 'config' ||
      e.categoryName === 'config',
  )
  const contents = []
  for (const entry of controllerEntries) {
    const c = provider.readFile(entry.path)
    if (c) contents.push(c)
  }
  const gemfileContent = provider.readFile('Gemfile') || ''
  const allContent = [...contents, gemfileContent].join('\n')

  const patterns = [
    {
      key: 'jwt',
      searched: ['jwt', 'JSON::JWT', 'jwt_token'],
      re: /\bjwt\b|json_web_token|JWT\./i,
    },
    {
      key: 'api_key',
      searched: ['api_key', 'X-Api-Key', 'x_api_key'],
      re: /api[_\-]key|x-api-key/i,
    },
    {
      key: 'bearer_token',
      searched: ['bearer', 'Authorization: Bearer'],
      re: /bearer|authenticate_with_http_token/i,
    },
    {
      key: 'token_authenticatable',
      searched: ['token_authenticatable', 'has_secure_token :auth'],
      re: /token_authenticatable|has_secure_token\s+:auth/i,
    },
    {
      key: 'doorkeeper_oauth',
      searched: ['doorkeeper', 'oauth'],
      re: /doorkeeper|oauth/i,
    },
    {
      key: 'devise_jwt',
      searched: ['devise-jwt'],
      re: /devise-jwt|devise\/jwt/i,
    },
  ]

  const results = {}
  for (const { key, searched, re } of patterns) {
    results[key] = { found: re.test(allContent), searched }
  }
  return results
}

/** Derive auth-related routes from the routes extraction. */
function extractAuthRoutes(routesData) {
  if (!routesData) return {}
  const authKeywords = [
    'session',
    'registration',
    'password',
    'login',
    'logout',
    'signup',
    'sign_in',
    'sign_out',
  ]
  const routes = routesData.routes || []
  const authRoutes = {}
  for (const r of routes) {
    const path = (r.path || r.pattern || '').toLowerCase()
    const ctrl = (r.controller || '').toLowerCase()
    if (authKeywords.some((k) => path.includes(k) || ctrl.includes(k))) {
      const key = `${r.verb || r.method || 'GET'} ${r.path || r.pattern}`
      authRoutes[key] = `${r.controller}#${r.action}`
    }
  }
  return authRoutes
}

/**
 * Extract authentication information.
 * @param {import('../providers/interface.js').FileProvider} provider
 * @param {Array<{path: string, category: string}>} entries - scanned entries
 * @param {{gems?: object}} gemInfo - extracted gem information
 * @param {object|null} schemaData - pre-extracted schema (optional)
 * @returns {object}
 */
export function extractAuth(
  provider,
  entries,
  gemInfo = {},
  schemaData = null,
) {
  const gems = gemInfo.gems || {}
  const result = {
    primary_strategy: null,
    devise: null,
    native_auth: null,
    jwt: null,
    two_factor: null,
    omniauth: null,
    has_secure_password: false,
  }

  const hasDevise = !!gems.devise
  const hasJwt = !!gems.jwt || !!gems['devise-jwt']
  const hasTwoFactor =
    !!gems['devise-two-factor'] || !!gems.rotp || !!gems.webauthn
  const hasOmniauth = !!gems.omniauth

  // Detect Devise
  if (hasDevise) {
    result.primary_strategy = 'devise'
    result.devise = {
      models: {},
      custom_controllers: [],
      config: {},
    }

    // Parse Devise initializer config
    const deviseConfig = provider.readFile('config/initializers/devise.rb')
    if (deviseConfig) {
      const configRe = new RegExp(AUTH_PATTERNS.deviseConfig.source, 'g')
      let m
      while ((m = configRe.exec(deviseConfig))) {
        const key = m[1]
        const val = m[2].trim()
        result.devise.config[key] = val
      }
    }

    // Parse models for devise declarations
    const modelEntries = entries.filter(
      (e) => e.category === 'model' || e.categoryName === 'models',
    )
    for (const entry of modelEntries) {
      const content = provider.readFile(entry.path)
      if (!content) continue

      const deviseMatch = content.match(AUTH_PATTERNS.deviseModules)
      if (deviseMatch) {
        const className = entry.path
          .split('/')
          .pop()
          .replace('.rb', '')
          .split('_')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join('')

        let fullDecl = deviseMatch[1]
        const lines = content.split('\n')
        const matchLine =
          content.slice(0, deviseMatch.index).split('\n').length - 1
        for (let li = matchLine + 1; li < lines.length; li++) {
          const ltrim = lines[li].trim()
          if (ltrim.startsWith(':') || /^\w+.*:/.test(ltrim)) {
            fullDecl += ' ' + ltrim
          } else {
            break
          }
        }

        const modulePart = fullDecl.split(/\w+:\s*\[/)[0]
        const modules =
          modulePart.match(/:(\w+)/g)?.map((m) => m.slice(1)) || []

        const model = { modules, omniauth_providers: [] }

        const oaMatch = content.match(AUTH_PATTERNS.omniauthProviders)
        if (oaMatch) {
          model.omniauth_providers =
            oaMatch[1].match(/:(\w+)/g)?.map((p) => p.slice(1)) || []
        }

        result.devise.models[className] = model
      }

      if (AUTH_PATTERNS.hasSecurePassword.test(content)) {
        result.has_secure_password = true
      }
    }

    const controllerEntries = entries.filter(
      (e) => e.category === 'controller' || e.categoryName === 'controllers',
    )
    for (const entry of controllerEntries) {
      const content = provider.readFile(entry.path)
      if (!content) continue
      const devCtrlMatch = content.match(AUTH_PATTERNS.deviseController)
      if (devCtrlMatch) {
        const namespace = content.match(/class\s+(\w+)::/)
        const name = namespace
          ? `${namespace[1]}::${devCtrlMatch[1]}`
          : devCtrlMatch[1]
        result.devise.custom_controllers.push(name)
      }
    }
  }

  // Detect native Rails 8 auth
  const currentContent = provider.readFile('app/models/current.rb')
  if (currentContent && AUTH_PATTERNS.currentAttributes.test(currentContent)) {
    if (!result.primary_strategy) result.primary_strategy = 'native'

    // --- Deep extraction for native Rails 8 auth ---
    const native = {
      strategy: 'native_rails8',
      description:
        'Rails 8 built-in authentication with database-backed sessions, signed permanent cookies, and CurrentAttributes pattern',
      models: {},
      controllers: {},
      routes: {},
      security_features: {},
      related_files: [],
    }

    // 1. Current model — extract full detail and expose as dedicated top-level section
    const currentDetail = extractCurrentModelDetail(currentContent)
    if (currentDetail) {
      // Backward-compat shortcut
      native.attributes = currentDetail.attributes
      // Dedicated section so LLM doesn't need to read the file
      native.current_attributes = currentDetail
      // Also available in models map
      native.models['Current'] = {
        file: 'app/models/current.rb',
        type: 'ActiveSupport::CurrentAttributes',
        attributes: currentDetail.attributes,
        delegates: currentDetail.delegates,
        usage: currentDetail.usage,
      }
    }
    native.related_files.push('app/models/current.rb')

    // 2. Session model
    const sessionContent = provider.readFile('app/models/session.rb')
    if (sessionContent) {
      const sessionInfo = { file: 'app/models/session.rb' }
      const belongsMatch = sessionContent.match(/belongs_to\s+:(\w+)/)
      if (belongsMatch) sessionInfo.belongs_to = belongsMatch[1]
      // Pull columns from schema if available
      if (schemaData) {
        const table = schemaData.tables?.find((t) => t.name === 'sessions')
        if (table) sessionInfo.columns = table.columns.map((c) => c.name)
      }
      native.models['Session'] = sessionInfo
      native.related_files.push('app/models/session.rb')
    }

    // 3. User model auth features
    const userContent = provider.readFile('app/models/user.rb')
    if (userContent) {
      const userInfo = { file: 'app/models/user.rb', auth_features: {} }
      if (AUTH_PATTERNS.hasSecurePassword.test(userContent)) {
        userInfo.auth_features.has_secure_password = true
        result.has_secure_password = true
      }
      if (/authenticate_by/.test(userContent)) {
        userInfo.auth_features.authenticate_by =
          'User.authenticate_by(email:, password:)'
      }
      // Email/password validations
      const emailValidation = userContent.match(
        /validates?\s+:email(?:_address)?,([^\n]+)/,
      )
      if (emailValidation)
        userInfo.auth_features.email_validation = emailValidation[1].trim()
      // Email normalization
      if (/normalize|strip|downcase/.test(userContent)) {
        userInfo.auth_features.email_normalization =
          'normalizes email (strips and downcases)'
      }
      // Roles
      const roleEnum = userContent.match(
        /enum\s+:?role[:\s,]+[\{|\[]([^\}\]]+)[\}|\]]/,
      )
      if (roleEnum) {
        const roles =
          roleEnum[1].match(/\w+/g)?.filter((v) => !/^\d+$/.test(v)) || []
        userInfo.auth_features.roles = roles
      }
      // Users table columns from schema
      if (schemaData) {
        const table = schemaData.tables?.find((t) => t.name === 'users')
        if (table)
          userInfo.columns = table.columns.map((c) => ({
            name: c.name,
            type: c.type,
            constraints: c.constraints,
          }))
      }
      native.models['User'] = userInfo
      native.related_files.push('app/models/user.rb')
    }

    // 4. Auth concern (ApplicationController includes Authentication)
    const authConcernPaths = [
      'app/controllers/concerns/authentication.rb',
      'app/controllers/concerns/authenticatable.rb',
    ]
    let authConcernContent = null
    let authConcernFile = null
    for (const p of authConcernPaths) {
      const c = provider.readFile(p)
      if (c) {
        authConcernContent = c
        authConcernFile = p
        break
      }
    }
    // Also search entries for a concern with "authentication" in path
    if (!authConcernContent) {
      const concernEntry = entries.find(
        (e) =>
          (e.categoryName === 'controllers' || e.category === 'controller') &&
          e.path.includes('concerns') &&
          e.path.toLowerCase().includes('auth'),
      )
      if (concernEntry) {
        authConcernContent = provider.readFile(concernEntry.path)
        authConcernFile = concernEntry.path
      }
    }

    if (authConcernContent) {
      const methods = extractMethodNames(authConcernContent)
      const cookieConfig = extractCookieConfig(authConcernContent)
      const optOut = extractAllowUnauthenticated(authConcernContent)
      const methodDetails = extractConcernMethodDetails(authConcernContent)

      native.controllers['authentication_concern'] = {
        file: authConcernFile,
        included_in: 'ApplicationController',
        methods: methodDetails,
        // Backward-compat: summary string per method (used by older callers)
        key_methods: methods.reduce((acc, method) => {
          const summary = extractActionSummary(authConcernContent, method)
          acc[method] = summary || 'defined'
          return acc
        }, {}),
        cookie_config: cookieConfig,
        opt_out_method: optOut ? 'allow_unauthenticated_access' : null,
      }
      native.related_files.push(authConcernFile)
    }

    // 5. SessionsController
    const sessionsCtrlPaths = ['app/controllers/sessions_controller.rb']
    let sessionsContent = null
    let sessionsFile = null
    for (const p of sessionsCtrlPaths) {
      const c = provider.readFile(p)
      if (c) {
        sessionsContent = c
        sessionsFile = p
        break
      }
    }
    if (!sessionsContent) {
      const entry = entries.find(
        (e) =>
          (e.categoryName === 'controllers' || e.category === 'controller') &&
          e.path.toLowerCase().includes('sessions_controller'),
      )
      if (entry) {
        sessionsContent = provider.readFile(entry.path)
        sessionsFile = entry.path
      }
    }
    if (sessionsContent) {
      const rateLimits = extractRateLimits(sessionsContent)
      const unauthAccess = extractAllowUnauthenticated(sessionsContent)
      const actions = extractMethodNames(sessionsContent).filter(
        (m) => !m.startsWith('_'),
      )
      const ctrlInfo = {
        file: sessionsFile,
        actions,
        rate_limiting: rateLimits.length > 0 ? rateLimits : null,
        allow_unauthenticated_access: unauthAccess,
        login_flow: null,
      }
      // Detect authenticate_by pattern
      if (/authenticate_by/.test(sessionsContent)) {
        const redirectMatch = sessionsContent.match(/redirect_to\s+([^\n,]+)/)
        ctrlInfo.login_flow = `User.authenticate_by(email:, password:) → start_new_session_for → ${redirectMatch ? redirectMatch[1].trim() : 'redirect'}`
      }
      native.controllers['SessionsController'] = ctrlInfo
      native.related_files.push(sessionsFile)
    }

    // 6. RegistrationsController
    const regPaths = ['app/controllers/registrations_controller.rb']
    let regContent = null
    let regFile = null
    for (const p of regPaths) {
      const c = provider.readFile(p)
      if (c) {
        regContent = c
        regFile = p
        break
      }
    }
    if (regContent) {
      native.controllers['RegistrationsController'] = {
        file: regFile,
        actions: extractMethodNames(regContent).filter(
          (m) => !m.startsWith('_'),
        ),
      }
      native.related_files.push(regFile)
    }

    // 7. PasswordsController
    const pwdPaths = ['app/controllers/passwords_controller.rb']
    let pwdContent = null
    let pwdFile = null
    for (const p of pwdPaths) {
      const c = provider.readFile(p)
      if (c) {
        pwdContent = c
        pwdFile = p
        break
      }
    }
    if (pwdContent) {
      const mailerMatch = pwdContent.match(/(\w+Mailer)/)
      const tokenMatch = pwdContent.match(
        /password_reset_token|with_reset_token/,
      )
      native.controllers['PasswordsController'] = {
        file: pwdFile,
        actions: extractMethodNames(pwdContent).filter(
          (m) => !m.startsWith('_'),
        ),
        reset_flow: tokenMatch
          ? 'email → token → reset form → update password'
          : null,
        token_method: tokenMatch
          ? tokenMatch[1] || 'password_reset_token'
          : null,
        mailer: mailerMatch ? mailerMatch[1] : null,
      }
      native.related_files.push(pwdFile)
    }

    // 8. ApplicationController — check what it includes
    const appCtrlContent = provider.readFile(
      'app/controllers/application_controller.rb',
    )
    if (appCtrlContent) {
      native.related_files.push('app/controllers/application_controller.rb')
      if (/include\s+Authentication/.test(appCtrlContent)) {
        if (native.controllers['authentication_concern']) {
          native.controllers['authentication_concern'].included_in =
            'ApplicationController'
        }
      }
    }

    // 9. Security features summary
    native.security_features = {
      csrf: 'Rails built-in authenticity tokens',
    }
    if (authConcernContent) {
      const cookieCfg = extractCookieConfig(authConcernContent)
      if (cookieCfg) {
        native.security_features.cookie_security =
          [
            cookieCfg.httponly ? 'httponly' : null,
            cookieCfg.same_site ? `same_site: ${cookieCfg.same_site}` : null,
            cookieCfg.secure ? `secure: ${cookieCfg.secure}` : null,
          ]
            .filter(Boolean)
            .join(', ') || null
        if (cookieCfg.duration)
          native.security_features.session_expiry = cookieCfg.duration
      }
    }
    if (sessionsContent) {
      const rl = extractRateLimits(sessionsContent)
      if (rl.length > 0) {
        native.security_features.rate_limiting = rl
          .map(
            (r) =>
              `${r.to} requests per ${r.within}${r.only ? ` (only: ${r.only})` : ''}`,
          )
          .join(', ')
      }
    }
    if (
      userContent &&
      /password.*minimum|minimum.*\d+|length.*minimum/.test(
        provider.readFile('app/models/user.rb') || '',
      )
    ) {
      native.security_features.password_requirements =
        'minimum length validation'
    }
    if (sessionContent) {
      native.security_features.session_tracking =
        'IP address and user agent stored per session'
    }

    // Remove duplicates from related_files
    native.related_files = [...new Set(native.related_files)]

    // 10. API authentication — explicit search for token/JWT/OAuth patterns
    const apiAuthPatterns = scanForApiAuthPatterns(provider, entries)
    const apiAuthPresent = Object.values(apiAuthPatterns).some((v) => v.found)
    native.api_authentication = {
      present: apiAuthPresent,
      searched_patterns: Object.entries(apiAuthPatterns).map(([key, v]) => ({
        pattern: key,
        searched: v.searched,
        found: v.found,
      })),
      summary: apiAuthPresent
        ? 'Detected API authentication patterns (see searched_patterns for details)'
        : 'No API authentication found. App uses native session-cookie auth only. All searches returned not-found.',
    }

    native.has_sessions_controller = !!sessionsContent
    result.native_auth = native
  }

  // JWT
  if (hasJwt) {
    result.jwt = { gem: gems['devise-jwt'] ? 'devise-jwt' : 'jwt' }
    if (!result.primary_strategy) result.primary_strategy = 'jwt'
  }

  // Two-factor
  if (hasTwoFactor) {
    const gem = gems['devise-two-factor']
      ? 'devise-two-factor'
      : gems.rotp
        ? 'rotp'
        : 'webauthn'
    result.two_factor = { gem }
  }

  // OmniAuth (standalone)
  if (hasOmniauth && !hasDevise) {
    result.omniauth = { providers: [] }
    if (!result.primary_strategy) result.primary_strategy = 'omniauth'
    const initContent = provider.readFile('config/initializers/omniauth.rb')
    if (initContent) {
      const provRe = new RegExp(AUTH_PATTERNS.omniauthProvider.source, 'g')
      let pm
      while ((pm = provRe.exec(initContent))) {
        result.omniauth.providers.push(pm[1])
      }
    }
  }

  // Check models for has_secure_password if not yet found
  if (!result.has_secure_password) {
    const modelEntries = entries.filter(
      (e) => e.category === 'model' || e.categoryName === 'models',
    )
    for (const entry of modelEntries) {
      const content = provider.readFile(entry.path)
      if (content && AUTH_PATTERNS.hasSecurePassword.test(content)) {
        result.has_secure_password = true
        if (!result.primary_strategy)
          result.primary_strategy = 'has_secure_password'
        break
      }
    }
  }

  return result
}
