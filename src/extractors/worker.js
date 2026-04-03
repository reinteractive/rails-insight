/**
 * Worker Extractor (#10 — Jobs sub-type)
 * Extracts Sidekiq native worker metadata: class name, queue, retry config,
 * sidekiq_options, and perform method signature.
 */

import { WORKER_PATTERNS } from '../core/patterns.js'

/**
 * Extract a single Sidekiq native worker's metadata.
 * @param {import('../providers/interface.js').FileProvider} provider
 * @param {string} filePath
 * @returns {object|null}
 */
export function extractWorker(provider, filePath) {
  const content = provider.readFile(filePath)
  if (!content) return null

  // Accept workers that include Sidekiq::Job/Worker directly,
  // OR inherit from another class (e.g., SidekiqWorker base class)
  // when they're already in app/workers/ (pre-classified by scanner)
  const includeMatch = content.match(WORKER_PATTERNS.includeSidekiq)
  const classMatch = content.match(WORKER_PATTERNS.classDeclaration)
  if (!classMatch) return null

  // If no direct include, require inheritance (< BaseWorker pattern)
  if (!includeMatch && !classMatch[2]) return null

  const result = {
    class: classMatch[1],
    file: filePath,
    type: 'sidekiq_native',
    queue: 'default',
    retry: true,
    sidekiq_options: null,
    perform_args: [],
  }

  // Sidekiq options
  const optionsMatch = content.match(WORKER_PATTERNS.sidekiqOptions)
  if (optionsMatch) {
    result.sidekiq_options = optionsMatch[1].trim()

    // Extract queue
    const queueMatch = optionsMatch[1].match(WORKER_PATTERNS.queueOption)
    if (queueMatch) {
      result.queue = queueMatch[1]
    }

    // Extract retry
    const retryMatch = optionsMatch[1].match(WORKER_PATTERNS.retryOption)
    if (retryMatch) {
      result.retry =
        retryMatch[1] === 'false' ? false : parseInt(retryMatch[1], 10)
    }
  }

  // Perform arguments
  const performMatch = content.match(WORKER_PATTERNS.performSignature)
  if (performMatch && performMatch[1].trim()) {
    result.perform_args = performMatch[1].split(',').map((a) => a.trim())
  }

  return result
}
