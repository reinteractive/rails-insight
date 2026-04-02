/**
 * Shared helpers and constants for tool handlers.
 */

import { tableize } from '../../utils/inflector.js'

/**
 * Convert a PascalCase model name to a snake_case plural table name.
 * @param {string} name e.g. "UserProfile"
 * @returns {string} e.g. "user_profiles"
 */
export function toTableName(name) {
  return tableize(name)
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

/**
 * Convert a model file path to a fully-qualified Ruby class name,
 * including namespace derived from the directory structure.
 * app/models/wordpress/page.rb → Wordpress::Page
 * app/models/page.rb → Page
 * app/models/ckeditor/asset.rb → Ckeditor::Asset
 * app/models/concerns/sluggable.rb → Sluggable (concerns dir is stripped)
 * @param {string} path
 * @returns {string}
 */
export function pathToFullClassName(path) {
  // Strip the app/models/ or app/controllers/ prefix and .rb suffix
  let relative = path
    .replace(/^app\/models\//, '')
    .replace(/^app\/controllers\//, '')
    .replace(/\.rb$/, '')

  // Strip concerns/ prefix — concerns don't get a Concerns:: namespace
  relative = relative.replace(/^concerns\//, '')

  // Split into segments and PascalCase each
  const segments = relative.split('/')
  return segments
    .map((segment) =>
      segment
        .split('_')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(''),
    )
    .join('::')
}

/** MCP response when no index has been built yet. */
export function noIndex() {
  return respondError('Index not built. Call index_project first.')
}

/** Wrap data as an MCP text response. */
export function respond(data) {
  return {
    content: [{ type: 'text', text: JSON.stringify(data) }],
  }
}

/**
 * Wrap an error as an MCP error response.
 * @param {string} message - Error message
 * @param {Object} [details] - Additional details
 * @returns {Object} MCP response with isError flag
 */
export function respondError(message, details = {}) {
  return {
    content: [
      { type: 'text', text: JSON.stringify({ error: message, ...details }) },
    ],
    isError: true,
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
