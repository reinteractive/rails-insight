/**
 * Ruby Introspection Bridge
 * Executes the bundled introspect.rb script via the provider's execCommand
 * and returns structured runtime data.
 */

import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const INTROSPECT_SCRIPT = resolve(__dirname, 'introspect.rb')

/**
 * @param {import('../providers/interface.js').FileProvider} provider
 * @param {object} [options]
 * @returns {Promise<{available: boolean, models: object|null, controllers: object|null, routes: object|null, database: object|null, error: string|null, duration_ms: number}>}
 */
export async function runIntrospection(provider, options = {}) {
  const start = Date.now()

  try {
    if (typeof provider.execCommand !== 'function') {
      return {
        available: false,
        models: null,
        controllers: null,
        routes: null,
        database: null,
        error: 'Provider does not support execCommand',
        duration_ms: Date.now() - start,
      }
    }

    if (
      !provider.fileExists('Gemfile') ||
      !provider.fileExists('config/application.rb')
    ) {
      return {
        available: false,
        models: null,
        controllers: null,
        routes: null,
        database: null,
        error:
          'Not a Rails application: Gemfile or config/application.rb not found',
        duration_ms: Date.now() - start,
      }
    }

    const result = await provider.execCommand(
      `bundle exec ruby "${INTROSPECT_SCRIPT}"`,
    )

    if (result.exitCode !== 0) {
      return {
        available: false,
        models: null,
        controllers: null,
        routes: null,
        database: null,
        error: (result.stderr || '').slice(0, 200),
        duration_ms: Date.now() - start,
      }
    }

    let data
    try {
      data = JSON.parse(result.stdout)
    } catch (e) {
      return {
        available: false,
        models: null,
        controllers: null,
        routes: null,
        database: null,
        error: `Failed to parse introspection output: ${e.message}`,
        duration_ms: Date.now() - start,
      }
    }

    return {
      available: true,
      models: data.models || null,
      controllers: data.controllers || null,
      routes: data.routes || null,
      database: data.database || null,
      error: null,
      duration_ms: Date.now() - start,
    }
  } catch (err) {
    return {
      available: false,
      models: null,
      controllers: null,
      routes: null,
      database: null,
      error: err.message,
      duration_ms: Date.now() - start,
    }
  }
}
