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
  const simpleClassMatch = !classMatch
    ? content.match(JOB_PATTERNS.classDeclarationSimple)
    : null

  const className = classMatch?.[1] || simpleClassMatch?.[1]
  if (!className) return null

  const superclass = classMatch?.[2] || null

  // Detect job via inheritance (ApplicationJob, ActiveJob::Base, *Job)
  const isJobByInheritance = superclass && (
    superclass.includes('Job') ||
    superclass.includes('ApplicationJob') ||
    superclass === 'ActiveJob::Base'
  )

  // Detect job via mixin (Delayed::RecurringJob, Delayed::Job, Resque::Job, Sidekiq::Job)
  const isJobByMixin = /include\s+(?:Delayed::RecurringJob|Delayed::Job|Resque::Job|Sidekiq::Job)/.test(content)

  if (!isJobByInheritance && !isJobByMixin) {
    return null
  }

  const result = {
    class: className,
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
 * @param {Array<{path: string, workerType?: string}>} entries
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

  // Detect adapter — first check explicit gem list, then fall back to Gemfile.lock
  if (gems.solid_queue) result.adapter = 'solid_queue'
  else if (gems.sidekiq) result.adapter = 'sidekiq'
  else if (gems.delayed_job) result.adapter = 'delayed_job'
  else if (gems.resque) result.adapter = 'resque'
  else if (gems.good_job) result.adapter = 'good_job'

  // Gemfile.lock fallback: adapter gem may come from a sub-gem or path dependency
  if (!result.adapter) {
    const lockfile = provider.readFile('Gemfile.lock') || ''
    if (/^\s{4}sidekiq\s/m.test(lockfile)) result.adapter = 'sidekiq'
    else if (/^\s{4}solid.?queue\s/m.test(lockfile)) result.adapter = 'solid_queue'
    else if (/^\s{4}good.?job\s/m.test(lockfile)) result.adapter = 'good_job'
    else if (/^\s{4}delayed.?job\s/m.test(lockfile)) result.adapter = 'delayed_job'
    else if (/^\s{4}resque\s/m.test(lockfile)) result.adapter = 'resque'
  }

  for (const entry of entries) {
    if (entry.workerType === 'sidekiq_native') {
      // Sidekiq native workers (app/workers/, app/sidekiq/)
      const workerContent = provider.readFile(entry.path)
      if (workerContent) {
        const classMatch = workerContent.match(/class\s+(\w+)/)
        const optionsMatch = workerContent.match(/sidekiq_options\s+(.+)/)
        const queue = optionsMatch
          ? (optionsMatch[1].match(/queue:\s*[:'"](\w+)/) || [])[1] || 'default'
          : 'default'
        const retryMatch = optionsMatch
          ? optionsMatch[1].match(/retry:\s*(\w+)/)
          : null
        result.jobs.push({
          class: classMatch ? classMatch[1] : null,
          file: entry.path,
          type: 'sidekiq_worker',
          queue,
          retry: retryMatch ? retryMatch[1] : null,
        })
        result.queues_detected.add(queue)
      }
    } else {
      const job = extractJob(provider, entry.path)
      if (job) {
        result.jobs.push(job)
        result.queues_detected.add(job.queue)
      }
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

  // Recurring jobs from Sidekiq::Cron::Job.create in initializers
  const initializerFiles = provider.glob
    ? provider.glob('config/initializers/*.rb') || []
    : []
  for (const initFile of initializerFiles) {
    const initContent = provider.readFile(initFile)
    if (!initContent || !initContent.includes('Sidekiq::Cron::Job')) continue
    const cronRe =
      /Sidekiq::Cron::Job\.create\s*\(?\s*\n?\s*name:\s*['"]([^'"]+)['"]\s*,\s*\n?\s*cron:\s*['"]([^'"]+)['"]\s*,\s*\n?\s*class:\s*['"]([^'"]+)['"]/g
    let cronMatch
    const cronJobs = []
    while ((cronMatch = cronRe.exec(initContent))) {
      cronJobs.push({
        name: cronMatch[1],
        cron: cronMatch[2],
        class: cronMatch[3],
      })
    }
    if (cronJobs.length > 0) {
      const existing = result.recurring_jobs || { jobs: [] }
      result.recurring_jobs = {
        ...existing,
        source: result.recurring_jobs ? existing.source : initFile,
        sidekiq_cron: cronJobs,
      }
    }
  }

  result.queues_detected = [...result.queues_detected]

  return result
}
