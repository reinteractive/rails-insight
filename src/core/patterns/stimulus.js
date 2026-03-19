/**
 * Regex patterns for Stimulus controller extraction.
 */
export const STIMULUS_PATTERNS = {
  classDeclaration:
    /export\s+default\s+class\s+(?:(\w+)\s+)?extends\s+Controller/,
  targets: /static\s+targets\s*=\s*\[([^\]]+)\]/,
  values: /static\s+values\s*=\s*\{([^}]+)\}/,
  classes: /static\s+classes\s*=\s*\[([^\]]+)\]/,
  outlets: /static\s+outlets\s*=\s*\[([^\]]+)\]/,
  actionMethod: /^\s+(\w+)\s*\(.*?\)\s*\{/gm,
  imports: /import\s+(?:\{([^}]+)\}|(\w+))\s+from\s+['"]([^'"]+)['"]/g,
}
