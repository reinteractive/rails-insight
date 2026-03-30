import { describe, it, expect } from 'vitest'
import { extractEmail } from '../../src/extractors/email.js'

function mockProvider(files) {
  return {
    readFile(path) {
      return files[path] || null
    },
  }
}

describe('Email Extractor', () => {
  describe('full email configuration', () => {
    const files = {
      'app/mailers/application_mailer.rb': `
class ApplicationMailer < ActionMailer::Base
  default from: "noreply@example.com"
  layout "mailer"
end`,
      'app/mailers/user_mailer.rb': `
class UserMailer < ApplicationMailer
  default from: "users@example.com"

  def welcome(user)
    @user = user
    mail(to: user.email, subject: "Welcome!")
  end

  def password_reset(user)
    @user = user
    mail(to: user.email)
  end

  def confirmation(user)
    @user = user
    mail(to: user.email)
  end

  private

  def set_defaults
    @company = "Example"
  end
end`,
      'config/environments/production.rb': `
Rails.application.configure do
  config.action_mailer.delivery_method = :smtp
end`,
      'config/environments/development.rb': `
Rails.application.configure do
  config.action_mailer.delivery_method = :letter_opener
end`,
      'config/initializers/email.rb': `
ActionMailer::Base.register_interceptor(SandboxEmailInterceptor)
ActionMailer::Base.register_observer(EmailObserver)
`,
      'app/mailboxes/application_mailbox.rb': `
class ApplicationMailbox < ActionMailbox::Base
  routing /support/i => :support
  routing /forward/i => :forward
end`,
      'app/mailboxes/support_mailbox.rb': `
class SupportMailbox < ApplicationMailbox
  def process
  end
end`,
    }

    const entries = [
      { path: 'app/mailers/application_mailer.rb', category: 'mailer' },
      { path: 'app/mailers/user_mailer.rb', category: 'mailer' },
      { path: 'app/mailboxes/application_mailbox.rb', category: 'mailbox' },
      { path: 'app/mailboxes/support_mailbox.rb', category: 'mailbox' },
    ]

    const provider = mockProvider(files)
    const result = extractEmail(provider, entries)

    it('extracts mailers', () => {
      expect(result.mailers).toHaveLength(2)
    })

    it('extracts mailer class and superclass', () => {
      const userMailer = result.mailers.find((m) => m.class === 'UserMailer')
      expect(userMailer.superclass).toBe('ApplicationMailer')
    })

    it('extracts mailer methods (excluding private)', () => {
      const userMailer = result.mailers.find((m) => m.class === 'UserMailer')
      expect(userMailer.methods).toContain('welcome')
      expect(userMailer.methods).toContain('password_reset')
      expect(userMailer.methods).toContain('confirmation')
      expect(userMailer.methods).not.toContain('set_defaults')
    })

    it('extracts default from', () => {
      const userMailer = result.mailers.find((m) => m.class === 'UserMailer')
      expect(userMailer.default_from).toBe('users@example.com')
    })

    it('extracts layout', () => {
      const appMailer = result.mailers.find(
        (m) => m.class === 'ApplicationMailer',
      )
      expect(appMailer.layout).toBe('mailer')
    })

    it('extracts delivery methods per environment', () => {
      expect(result.delivery.production).toBe('smtp')
      expect(result.delivery.development).toBe('letter_opener')
    })

    it('extracts interceptors', () => {
      expect(result.interceptors).toContain('SandboxEmailInterceptor')
    })

    it('extracts observers', () => {
      expect(result.observers).toContain('EmailObserver')
    })

    it('detects mailbox', () => {
      expect(result.mailbox).toBeDefined()
      expect(result.mailbox.present).toBe(true)
    })

    it('extracts mailbox classes', () => {
      expect(result.mailbox.mailboxes).toContain('SupportMailbox')
      expect(result.mailbox.mailboxes).not.toContain('ApplicationMailbox')
    })

    it('extracts mailbox routing', () => {
      expect(result.mailbox.routing['/support/i']).toBe('support')
      expect(result.mailbox.routing['/forward/i']).toBe('forward')
    })
  })

  describe('no mailers', () => {
    it('returns empty result', () => {
      const provider = mockProvider({})
      const result = extractEmail(provider, [])
      expect(result.mailers).toEqual([])
      expect(result.delivery).toEqual({})
      expect(result.mailbox).toBeNull()
    })
  })

  describe('mailers without mailbox', () => {
    it('has null mailbox', () => {
      const files = {
        'app/mailers/notification_mailer.rb': `
class NotificationMailer < ApplicationMailer
  def alert(user)
    mail(to: user.email)
  end
end`,
      }
      const entries = [
        { path: 'app/mailers/notification_mailer.rb', category: 'mailer' },
      ]
      const provider = mockProvider(files)
      const result = extractEmail(provider, entries)
      expect(result.mailers).toHaveLength(1)
      expect(result.mailbox).toBeNull()
    })
  })

  describe('ISSUE-J: Mailer superclass full namespace capture', () => {
    it('captures full superclass name including namespace', () => {
      const entries = [
        {
          path: 'app/mailers/notification_mailer.rb',
          category: 11,
          categoryName: 'email',
          type: 'ruby',
        },
      ]
      const provider = {
        readFile(path) {
          if (path === 'app/mailers/notification_mailer.rb')
            return 'class NotificationMailer < ActionMailer::Base\n  def welcome\n    mail(to: @user.email)\n  end\nend'
          return null
        },
      }
      const result = extractEmail(provider, entries)
      expect(result.mailers[0].superclass).toBe('ActionMailer::Base')
    })
  })
})
