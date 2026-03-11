/**
 * Jobs Extractor (#10)
 * Extracts background job metadata from app/jobs/*.rb.
 */

import { JOB_PATTERNS } from '../core/patterns.js'

/**
 * Extract a single job's metadata.
 * @param {import('../providers/interface.js').FileProvider} provider
 * @param {string} filePath
 * @returns {object|null}
 */
export function extractJob(provider, filePath) {
  const content = provider.readFile(filePath)
  if (!content) return null

  const classMatch = content.match(JOB_PATTERNS.classDeclaration)
  if (!classMatch) return null

  const superclass = classMatch[2]
  if (
    !superclass.includes('Job') &&
    !superclass.includes('ApplicationJob') &&
    superclass !== 'ActiveJob::Base'
  ) {
    return null
  }

  const result = {
    class: classMatch[1],
    file: filePath,
    superclass,
    queue: 'default',
    retry_on: [],
    discard_on: [],
    sidekiq_options: null,
  }

  // Queue
  const queueMatch = content.match(JOB_PATTERNS.queueAs)
  if (queueMatch) {
    result.queue = queueMatch[1]
  }

  // Retry on
  const retryRe = new RegExp(JOB_PATTERNS.retryOn.source, 'gm')
  let m
  while ((m = retryRe.exec(content))) {
    result.retry_on.push({
      exception: m[1],
      options: m[2]?.trim() || null,
    })
  }

  // Discard on
  const discardRe = new RegExp(JOB_PATTERNS.discardOn.source, 'gm')
  while ((m = discardRe.exec(content))) {
    result.discard_on.push(m[1])
  }

  // Sidekiq options
  const sidekiqMatch = content.match(JOB_PATTERNS.sidekiqOptions)
  if (sidekiqMatch) {
    result.sidekiq_options = sidekiqMatch[1].trim()
  }

  return result
}

/**
 * Extract all jobs and detect adapter/recurring config.
 * @param {import('../providers/interface.js').FileProvider} provider
 * @param {Array<{path: string}>} entries
 * @param {{gems?: object}} gemInfo
 * @returns {object}
 */
export function extractJobs(provider, entries, gemInfo = {}) {
  const gems = gemInfo.gems || {}
  const result = {
    adapter: null,
    jobs: [],
    queues_detected: new Set(),
    recurring_jobs: null,
  }

  // Detect adapter
  if (gems.solid_queue) result.adapter = 'solid_queue'
  else if (gems.sidekiq) result.adapter = 'sidekiq'
  else if (gems.delayed_job) result.adapter = 'delayed_job'
  else if (gems.resque) result.adapter = 'resque'
  else if (gems.good_job) result.adapter = 'good_job'

  for (const entry of entries) {
    const job = extractJob(provider, entry.path)
    if (job) {
      result.jobs.push(job)
      result.queues_detected.add(job.queue)
    }
  }

  // Recurring jobs from config/recurring.yml (Solid Queue)
  const recurringContent = provider.readFile('config/recurring.yml')
  if (recurringContent) {
    const jobNames = []
    const classRe = /class:\s*(\w+)/g
    let m
    while ((m = classRe.exec(recurringContent))) {
      jobNames.push(m[1])
    }
    if (jobNames.length > 0) {
      result.recurring_jobs = {
        source: 'config/recurring.yml',
        jobs: jobNames,
      }
    }
  }

  result.queues_detected = [...result.queues_detected]

  return result
}
