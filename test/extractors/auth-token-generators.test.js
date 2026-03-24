import { describe, it, expect } from 'vitest'
import { extractAuth } from '../../src/extractors/auth.js'

function makeProvider(files) {
  return { readFile: (path) => files[path] || null }
}

describe('auth token generators cross-reference', () => {
  const baseFiles = {
    'app/models/current.rb': `
class Current < ActiveSupport::CurrentAttributes
  attribute :session
  attribute :user
end`,
    'app/models/session.rb': `
class Session < ApplicationRecord
  belongs_to :user
end`,
  }

  it('detects password_reset token', () => {
    const files = {
      ...baseFiles,
      'app/models/user.rb': `
class User < ApplicationRecord
  has_secure_password
  generates_token_for :password_reset
end`,
    }
    const result = extractAuth(makeProvider(files), [], {}, null)
    const userInfo = result.native_auth.models['User']
    expect(userInfo.auth_features.token_generators).toContain('password_reset')
  })

  it('detects email_verification token', () => {
    const files = {
      ...baseFiles,
      'app/models/user.rb': `
class User < ApplicationRecord
  has_secure_password
  generates_token_for :email_verification
end`,
    }
    const result = extractAuth(makeProvider(files), [], {}, null)
    const userInfo = result.native_auth.models['User']
    expect(userInfo.auth_features.token_generators).toContain(
      'email_verification',
    )
  })

  it('no token generators', () => {
    const files = {
      ...baseFiles,
      'app/models/user.rb': `
class User < ApplicationRecord
  has_secure_password
end`,
    }
    const result = extractAuth(makeProvider(files), [], {}, null)
    const userInfo = result.native_auth.models['User']
    expect(userInfo.auth_features.token_generators).toBeUndefined()
  })

  it('password_reset noted in security_features', () => {
    const files = {
      ...baseFiles,
      'app/models/user.rb': `
class User < ApplicationRecord
  has_secure_password
  generates_token_for :password_reset
end`,
    }
    const result = extractAuth(makeProvider(files), [], {}, null)
    expect(result.native_auth.security_features.password_reset_tokens).toBe(
      'generates_token_for :password_reset',
    )
  })
})
