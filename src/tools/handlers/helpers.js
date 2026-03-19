/**
 * Shared helpers and constants for tool handlers.
 */

/**
 * Convert a PascalCase model name to a snake_case plural table name.
 * @param {string} name e.g. "UserProfile"
 * @returns {string} e.g. "user_profiles"
 */
export function toTableName(name) {
  const snake = name
    .replace(/([A-Z])/g, (m, l, i) => (i === 0 ? l : `_${l}`))
    .toLowerCase()
  return snake.endsWith('s') ? snake : `${snake}s`
}

/**
 * Convert a file path to a Ruby-style class name.
 * @param {string} path
 * @returns {string}
 */
export function pathToClassName(path) {
  const basename = path.split('/').pop().replace('.rb', '')
  return basename
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('')
}

/** MCP response when no index has been built yet. */
export function noIndex() {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          error: 'Index not built. Call index_project first.',
        }),
      },
    ],
  }
}

/** Wrap data as an MCP text response. */
export function respond(data) {
  return {
    content: [{ type: 'text', text: JSON.stringify(data) }],
  }
}

/** Architecturally significant gem categories (for slimmed dependencies output). */
export const SIGNIFICANT_CATEGORIES = new Set([
  'core',
  'frontend',
  'auth',
  'authorization',
  'background',
  'caching',
  'realtime',
  'testing',
  'deployment',
  'search',
  'admin',
  'payments',
  'monitoring',
  'api',
  'data',
])

/** Gems to always drop even if in significant categories. */
export const DROP_GEMS = new Set([
  'railties',
  'activesupport',
  'activerecord',
  'actionpack',
  'actionview',
  'actionmailer',
  'activejob',
  'actioncable',
  'activestorage',
  'actiontext',
  'actionmailbox',
  'tzinfo-data',
  'sprockets',
  'sprockets-rails',
])

/** Well-known absent gems worth noting. */
export const NOTABLE_ABSENT_CANDIDATES = [
  'devise',
  'pundit',
  'cancancan',
  'sidekiq',
  'redis',
  'activeadmin',
  'administrate',
  'jbuilder',
  'grape',
  'graphql',
  'elasticsearch-rails',
  'searchkick',
  'meilisearch-rails',
  'stripe',
  'pay',
  'sentry-rails',
  'newrelic_rpm',
  'rack-attack',
  'paper_trail',
  'audited',
]
