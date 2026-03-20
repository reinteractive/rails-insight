/**
 * Regex patterns for Sidekiq native worker extraction.
 */
export const WORKER_PATTERNS = {
  classDeclaration: /class\s+(\w+(?:::\w+)*)\s*(?:<\s*(\w+(?:::\w+)*))?/,
  includeSidekiq: /include\s+Sidekiq::(Job|Worker)/,
  sidekiqOptions: /^\s*sidekiq_options\s+(.+)/m,
  queueOption: /queue:\s*[:'"]*(\w+)['"']*/,
  retryOption: /retry:\s*(false|\d+)/,
  performSignature: /^\s*def\s+perform\(([^)]*)\)/m,
  uniqueOption: /unique:\s*:(\w+)/,
}
