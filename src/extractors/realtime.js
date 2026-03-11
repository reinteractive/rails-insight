/**
 * Realtime Extractor (#14)
 * Extracts Action Cable channels, Turbo Streams, and WebSocket config.
 */

import { REALTIME_PATTERNS } from '../core/patterns.js'

/**
 * Extract realtime information.
 * @param {import('../providers/interface.js').FileProvider} provider
 * @param {Array<{path: string, category: string}>} entries
 * @param {{gems?: object}} gemInfo
 * @returns {object}
 */
export function extractRealtime(provider, entries, gemInfo = {}) {
  const gems = gemInfo.gems || {}
  const result = {
    adapter: {},
    channels: [],
    turbo_stream_from_usage: 0,
    connection_auth: null,
    anycable: !!gems.anycable || !!gems['anycable-rails'],
  }

  // Cable config
  const cableYml = provider.readFile('config/cable.yml')
  if (cableYml) {
    const sections = cableYml.split(/\n(?=\w)/)
    for (const section of sections) {
      const envMatch = section.match(/^(\w+):/)
      if (envMatch) {
        const adapterMatch = section.match(REALTIME_PATTERNS.cableAdapter)
        if (adapterMatch) {
          result.adapter[envMatch[1]] = adapterMatch[1]
        }
      }
    }
  }

  // Connection auth
  const connContent = provider.readFile(
    'app/channels/application_cable/connection.rb',
  )
  if (connContent) {
    if (REALTIME_PATTERNS.findVerifiedUser.test(connContent)) {
      result.connection_auth = 'find_verified_user'
    } else if (REALTIME_PATTERNS.rejectUnauthorized.test(connContent)) {
      result.connection_auth = 'reject_unauthorized_connection'
    }
  }

  // Channels
  const channelEntries = entries.filter(
    (e) => e.path.startsWith('app/channels/') && e.path.endsWith('_channel.rb'),
  )
  for (const entry of channelEntries) {
    const content = provider.readFile(entry.path)
    if (!content) continue

    const classMatch = content.match(REALTIME_PATTERNS.channelClass)
    if (!classMatch || classMatch[1] === 'ApplicationCable') continue

    const channel = {
      class: classMatch[1],
      streams_from: [],
      streams_for: [],
      authenticated: false,
    }

    const fromRe = new RegExp(REALTIME_PATTERNS.streamFrom.source, 'g')
    let m
    while ((m = fromRe.exec(content))) {
      channel.streams_from.push(m[1])
    }

    const forRe = new RegExp(REALTIME_PATTERNS.streamFor.source, 'g')
    while ((m = forRe.exec(content))) {
      channel.streams_for.push(m[1].trim())
    }

    // Simple auth detection
    if (content.includes('current_user') || content.includes('find_verified')) {
      channel.authenticated = true
    }

    result.channels.push(channel)
  }

  // Turbo stream from usage in views
  const viewEntries = entries.filter((e) => e.path.startsWith('app/views/'))
  for (const entry of viewEntries) {
    const content = provider.readFile(entry.path)
    if (!content) continue
    const tsRe = new RegExp(REALTIME_PATTERNS.turboStreamFrom.source, 'g')
    while (tsRe.exec(content)) {
      result.turbo_stream_from_usage++
    }
  }

  return result
}
