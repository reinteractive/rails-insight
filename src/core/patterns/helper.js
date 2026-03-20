/**
 * Regex patterns for Rails helper extraction.
 */
export const HELPER_PATTERNS = {
  moduleDeclaration: /module\s+(\w+(?:::\w+)*Helper)/,
  methodDefinition: /^\s*def\s+(\w+[?!]?)(?:\(([^)]*)\))?/gm,
  helperMethod: /helper_method\s+:(\w+)/g,
  includeHelper: /include\s+(\w+(?:::\w+)*Helper)/g,
  privateKeyword: /^\s*private\s*$/m,
}
