/**
 * Email Extractor (#11)
 * Extracts mailer metadata and Action Mailbox configuration.
 */

import { EMAIL_PATTERNS } from '../core/patterns.js'

/**
 * Extract email/mailer information.
 * @param {import('../providers/interface.js').FileProvider} provider
 * @param {Array<{path: string, category: string}>} entries
 * @returns {object}
 */
export function extractEmail(provider, entries) {
  const result = {
    mailers: [],
    delivery: {},
    interceptors: [],
    observers: [],
    mailbox: null,
  }

  // Extract mailers
  const mailerEntries = entries.filter(
    (e) => e.path.startsWith('app/mailers/') && e.path.endsWith('.rb'),
  )

  for (const entry of mailerEntries) {
    const content = provider.readFile(entry.path)
    if (!content) continue

    const classMatch = content.match(EMAIL_PATTERNS.mailerClass)
    if (!classMatch) continue

    const mailer = {
      class: classMatch[1],
      superclass: classMatch[2],
      methods: [],
      default_from: null,
      layout: null,
    }

    // Default from
    const fromMatch = content.match(EMAIL_PATTERNS.defaultFrom)
    if (fromMatch) mailer.default_from = fromMatch[1]

    // Layout
    const layoutMatch = content.match(EMAIL_PATTERNS.mailerLayout)
    if (layoutMatch) mailer.layout = layoutMatch[1]

    // Methods (actions) - extract all def methods, filter out private
    const lines = content.split('\n')
    let inPrivate = false
    for (const line of lines) {
      if (/^\s*private\b/.test(line) || /^\s*protected\b/.test(line)) {
        inPrivate = true
        continue
      }
      if (!inPrivate) {
        const methodMatch = line.match(/^\s*def\s+(\w+)/)
        if (methodMatch && methodMatch[1] !== 'initialize') {
          mailer.methods.push(methodMatch[1])
        }
      }
    }

    result.mailers.push(mailer)
  }

  // Delivery config from environment files
  for (const env of ['production', 'development', 'test']) {
    const config = provider.readFile(`config/environments/${env}.rb`)
    if (config) {
      const deliveryMatch = config.match(EMAIL_PATTERNS.deliveryMethod)
      if (deliveryMatch) {
        result.delivery[env] = deliveryMatch[1]
      }
    }
  }

  // Interceptors and observers from initializers
  const initContent =
    provider.readFile('config/initializers/email.rb') ||
    provider.readFile('config/initializers/mailer.rb') ||
    ''
  const appContent = provider.readFile('config/application.rb') || ''
  const combined = initContent + '\n' + appContent

  const intMatch = combined.match(EMAIL_PATTERNS.interceptor)
  if (intMatch) result.interceptors.push(intMatch[1])

  const obsMatch = combined.match(EMAIL_PATTERNS.observer)
  if (obsMatch) result.observers.push(obsMatch[1])

  // Action Mailbox
  const mailboxEntries = entries.filter(
    (e) => e.path.startsWith('app/mailboxes/') && e.path.endsWith('.rb'),
  )
  if (mailboxEntries.length > 0) {
    result.mailbox = { present: true, mailboxes: [], routing: {} }
    for (const entry of mailboxEntries) {
      const content = provider.readFile(entry.path)
      if (!content) continue
      const classMatch = content.match(EMAIL_PATTERNS.mailboxClass)
      if (classMatch && classMatch[1] !== 'ApplicationMailbox') {
        result.mailbox.mailboxes.push(classMatch[1])
      }
      // Routing
      const routingRe = new RegExp(EMAIL_PATTERNS.mailboxRouting.source, 'g')
      let m
      while ((m = routingRe.exec(content))) {
        const routeStr = m[1].trim()
        const routeMatch = routeStr.match(/(.+)\s*=>\s*:(\w+)/)
        if (routeMatch) {
          result.mailbox.routing[routeMatch[1].trim()] = routeMatch[2]
        }
      }
    }
  }

  return result
}
