/**
 * Regex patterns for Rails mailer extraction.
 */
export const EMAIL_PATTERNS = {
  mailerClass: /class\s+(\w+(?:::\w+)*Mailer)\s*<\s*(\w+(?:::\w+)*)/,
  mailerMethod: /^\s*def\s+(\w+)/m,
  defaultFrom: /default\s+from:\s*['"]([^'"]+)['"]/,
  mailerLayout: /^\s*layout\s+['"](\w+)['"]/m,
  deliveryMethod: /config\.action_mailer\.delivery_method\s*=\s*:(\w+)/,
  smtpSettings: /config\.action_mailer\.smtp_settings/,
  mailerConfig: /config\.action_mailer\.(\w+)\s*=\s*(.+)/g,
  interceptor: /ActionMailer::Base\.register_interceptor\s*\((\w+)\)/,
  observer: /ActionMailer::Base\.register_observer\s*\((\w+)\)/,
  mailboxClass: /class\s+(\w+Mailbox)\s*<\s*(\w+)/,
  mailboxRouting: /routing\s+(.+)/g,
  mailCall: /mail\s*\(/g,
  deliverNow: /\.deliver_now/g,
  deliverLater: /\.deliver_later/g,
  attachments: /attachments\[/g,
}
