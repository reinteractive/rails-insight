/**
 * Regex patterns for Rails job extraction.
 */
export const JOB_PATTERNS = {
  classDeclaration: /class\s+(\w+(?:::\w+)*)\s*<\s*(\w+(?:::\w+)*)/,
  queueAs: /^\s*queue_as\s+:?['"]?(\w+)['"]?/m,
  retryOn: /^\s*retry_on\s+(\w+(?:::\w+)*)(?:,\s*(.+))?/m,
  discardOn: /^\s*discard_on\s+(\w+(?:::\w+)*)(?:,\s*(.+))?/m,
  queueAdapter: /self\.queue_adapter\s*=\s*:(\w+)/,
  sidekiqOptions: /^\s*sidekiq_options\s+(.+)/m,
  performLater: /(\w+)\.perform_later/g,
}
