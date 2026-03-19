/**
 * Regex patterns for ActionCable and realtime extraction.
 */
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
