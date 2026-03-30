/**
 * Regex patterns for Rails route extraction.
 */
export const ROUTE_PATTERNS = {
  resources: /^\s*resources?\s+:(\w+)(?:,\s*(.+))?\s*(?:do)?\s*$/m,
  resource: /^\s*resource\s+:(\w+)(?:,\s*(.+))?\s*(?:do)?\s*$/m,
  namespace: /^\s*namespace\s+:(\w+)(?:,\s*(.+))?\s*do/m,
  scope: /^\s*scope\s+(?:['"]([^'"]+)['"]|:(\w+))(?:,\s*(.+))?\s*do/m,
  scopeModule: /^\s*scope\s+module:\s*['"]?:?(\w+)['"]?/m,
  constraints: /^\s*constraints\s*(?:\((.+)\))?\s*do/m,
  httpVerb:
    /^\s*(?:get|post|put|patch|delete)\s+['"]([^'"]+)['"](?:.*?(?:to:|=>)\s*['"]([^'"#]+)#?([^'"]*)['"'])?/m,
  root: /^\s*root\s+(?:(?::to\s*=>|to:)\s*)?['"]([^'"#]+)#?([^'"]*)['"']/m,
  mount:
    /^\s*mount\s+(\w+(?:(?:::|\.)\w+)*)\s*(?:=>|,\s*at:)\s*['"]([^'"]+)['"]/m,
  concern: /^\s*concern\s+:(\w+)\s+do/m,
  concerns: /^\s*concerns\s+:(\w+)/m,
  member: /^\s*member\s+do/m,
  collection: /^\s*collection\s+do/m,
  draw: /^\s*draw\s*\(?:?(\w+)\)?/m,
  only: /only:\s*(?:\[([^\]]+)\]|:([\w]+))/,
  except: /except:\s*(?:\[([^\]]+)\]|:([\w]+))/,
  httpVerbSymbol: /^\s*(?:get|post|put|patch|delete)\s+:(\w+)/m,
  defaults: /defaults:\s*\{([^}]+)\}/,
  healthCheck: /^\s*get\s+['"]up['"]/m,
  direct: /^\s*direct\s*\(:(\w+)\)/m,
  resolve: /^\s*resolve\s*\((.+)\)/m,
}
