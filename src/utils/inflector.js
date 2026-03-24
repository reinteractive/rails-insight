/**
 * English Inflection Module
 * Provides pluralization, singularization, and case conversion
 * for Rails-style naming conventions.
 *
 * @module inflector
 */

/** @type {Array<[RegExp, string]>} Pluralization rules (applied last-to-first). */
const PLURAL_RULES = [
  [/quiz$/i, 'quizzes'],
  [/^(ox)$/i, '$1en'],
  [/(matr|vert|append)ix$/i, '$1ices'],
  [/(x|ch|ss|sh)$/i, '$1es'],
  [/([^aeiouy])y$/i, '$1ies'],
  [/(hive)$/i, '$1s'],
  [/([lr])f$/i, '$1ves'],
  [/(shea|lea|wol|cal)f$/i, '$1ves'],
  [/([^f])fe$/i, '$1ves'],
  [/sis$/i, 'ses'],
  [/([ti])um$/i, '$1a'],
  [/(buffal|tomat|volcan|potat|ech|her|vet)o$/i, '$1oes'],
  [/(bu|mis|gas)s$/i, '$1ses'],
  [/(alias|status)$/i, '$1es'],
  [/(octop|vir)us$/i, '$1i'],
  [/(ax|test)is$/i, '$1es'],
  [/s$/i, 's'],
  [/$/, 's'],
]

/** @type {Array<[RegExp, string]>} Singularization rules (applied last-to-first). */
const SINGULAR_RULES = [
  [/(database)s$/i, '$1'],
  [/(quiz)zes$/i, '$1'],
  [/(matr)ices$/i, '$1ix'],
  [/(vert|append)ices$/i, '$1ex'],
  [/^(ox)en/i, '$1'],
  [/(alias|status)es$/i, '$1'],
  [/(octop|vir)i$/i, '$1us'],
  [/(cris|ax|test)es$/i, '$1is'],
  [/(shoe)s$/i, '$1'],
  [/(o)es$/i, '$1'],
  [/(bus)es$/i, '$1'],
  [/([mlr])ives$/i, '$1ife'],
  [/(x|ch|ss|sh)es$/i, '$1'],
  [/(m)ovies$/i, '$1ovie'],
  [/(s)eries$/i, '$1eries'],
  [/([^aeiouy])ies$/i, '$1y'],
  [/([lr])ves$/i, '$1f'],
  [/(tive)s$/i, '$1'],
  [/(hive)s$/i, '$1'],
  [/([^f])ves$/i, '$1fe'],
  [/(^analy)ses$/i, '$1sis'],
  [/((a)naly|(b)a|(d)iagno|(p)arenthe|(p)rogno|(s)ynop|(t)he)ses$/i, '$1$2sis'],
  [/([ti])a$/i, '$1um'],
  [/(n)ews$/i, '$1ews'],
  [/s$/i, ''],
]

/** @type {Array<[string, string]>} Irregular singular/plural pairs. */
const IRREGULARS = [
  ['person', 'people'],
  ['man', 'men'],
  ['woman', 'women'],
  ['child', 'children'],
  ['sex', 'sexes'],
  ['move', 'moves'],
  ['zombie', 'zombies'],
  ['goose', 'geese'],
  ['mouse', 'mice'],
  ['tooth', 'teeth'],
  ['foot', 'feet'],
]

/** @type {Set<string>} Words that do not change between singular and plural. */
const UNCOUNTABLES = new Set([
  'equipment',
  'information',
  'rice',
  'money',
  'species',
  'series',
  'fish',
  'sheep',
  'jeans',
  'police',
  'news',
  'data',
  'feedback',
  'staff',
  'advice',
  'furniture',
  'homework',
  'knowledge',
  'luggage',
  'progress',
  'research',
  'software',
  'weather',
])

/**
 * Check if a word is uncountable (case-insensitive).
 * @param {string} word
 * @returns {boolean}
 */
function isUncountable(word) {
  return UNCOUNTABLES.has(word.toLowerCase())
}

/**
 * Check irregular words in the given direction.
 * @param {string} word
 * @param {'toPlural'|'toSingular'} direction
 * @returns {string|null} Replacement word or null
 */
function checkIrregular(word, direction) {
  const lower = word.toLowerCase()
  for (const [singular, plural] of IRREGULARS) {
    const from = direction === 'toPlural' ? singular : plural
    const to = direction === 'toPlural' ? plural : singular
    if (lower === from) {
      return preserveCase(word, to)
    }
  }
  return null
}

/**
 * Preserve the first-letter casing of the original word on the replacement.
 * @param {string} original
 * @param {string} replacement
 * @returns {string}
 */
function preserveCase(original, replacement) {
  if (!original || !replacement) return replacement
  if (original[0] === original[0].toUpperCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1)
  }
  return replacement
}

/**
 * Apply inflection rules to a word (first match wins, most specific first).
 * @param {string} word
 * @param {Array<[RegExp, string]>} rules
 * @returns {string}
 */
function applyRules(word, rules) {
  for (const [pattern, replacement] of rules) {
    if (pattern.test(word)) {
      return word.replace(pattern, replacement)
    }
  }
  return word
}

/**
 * Pluralize an English word.
 * @param {string} word - Singular English word
 * @returns {string} Plural form
 */
export function pluralize(word) {
  if (!word) return ''
  if (isUncountable(word)) return word
  const irregular = checkIrregular(word, 'toPlural')
  if (irregular) return irregular
  return applyRules(word, PLURAL_RULES)
}

/**
 * Singularize an English word.
 * @param {string} word - Plural English word
 * @returns {string} Singular form
 */
export function singularize(word) {
  if (!word) return ''
  if (isUncountable(word)) return word
  const irregular = checkIrregular(word, 'toSingular')
  if (irregular) return irregular
  return applyRules(word, SINGULAR_RULES)
}

/**
 * Convert a PascalCase string to snake_case.
 * @param {string} str
 * @returns {string}
 */
export function underscore(str) {
  if (!str) return ''
  return str
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z\d])([A-Z])/g, '$1_$2')
    .toLowerCase()
}

/**
 * Convert a snake_case or plural string to a PascalCase singular class name.
 * 'user_profiles' → 'UserProfile', 'comments' → 'Comment'
 * @param {string} str - snake_case or plural string
 * @returns {string} PascalCase singular class name
 */
export function classify(str) {
  if (!str) return ''
  return str
    .split(/[_\s]+/)
    .map((segment, idx, arr) => {
      const word = idx === arr.length - 1 ? singularize(segment) : segment
      return word.charAt(0).toUpperCase() + word.slice(1)
    })
    .join('')
}

/**
 * Convert a PascalCase class name to a snake_case plural table name.
 * 'UserProfile' → 'user_profiles', 'Person' → 'people'
 * @param {string} className - PascalCase class name
 * @returns {string} snake_case plural table name
 */
export function tableize(className) {
  if (!className) return ''
  return pluralize(underscore(className))
}
