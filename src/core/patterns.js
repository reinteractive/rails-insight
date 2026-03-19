/**
 * Shared regex patterns for all extractors.
 * Organized by domain — each pattern set lives in its own file under ./patterns/.
 * This barrel re-exports every named constant so existing imports keep working.
 */

export { MODEL_PATTERNS } from './patterns/model.js'
export { CONTROLLER_PATTERNS } from './patterns/controller.js'
export { ROUTE_PATTERNS } from './patterns/route.js'
export { SCHEMA_PATTERNS } from './patterns/schema.js'
export { COMPONENT_PATTERNS } from './patterns/component.js'
export { STIMULUS_PATTERNS } from './patterns/stimulus.js'
export { AUTH_PATTERNS } from './patterns/auth.js'
export { AUTHORIZATION_PATTERNS } from './patterns/authorization.js'
export { JOB_PATTERNS } from './patterns/job.js'
export { EMAIL_PATTERNS } from './patterns/email.js'
export { STORAGE_PATTERNS } from './patterns/storage.js'
export { CACHING_PATTERNS } from './patterns/caching.js'
export { REALTIME_PATTERNS } from './patterns/realtime.js'
export { API_PATTERNS } from './patterns/api.js'
export { VIEW_PATTERNS } from './patterns/view.js'
export { GEMFILE_PATTERNS } from './patterns/gemfile.js'
export { CONFIG_PATTERNS } from './patterns/config.js'
export { FACTORY_PATTERNS } from './patterns/factory.js'
